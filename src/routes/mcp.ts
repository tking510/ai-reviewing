import { Hono } from 'hono';
import type { Env } from '../types';
import type { ItemRow, ReviewRow, EvidenceRow } from '../lib/db';
import { itemFromRow } from '../lib/db';
import { CATEGORIES, VERDICTS, AGENT_TYPES, EVIDENCE_KINDS, clientIp } from '../lib/util';
import { submitReview, type SubmitInput } from '../lib/submit';

export const mcpApi = new Hono<{ Bindings: Env }>();

// Stateless MCP over Streamable HTTP. Plain GET also retains discovery metadata.
const PROTOCOL_VERSIONS = ['2025-03-26', '2025-06-18'] as const;
const READ_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const WRITE_ANNOTATIONS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

const TOOLS = [
  {
    name: 'recall',
    annotations: READ_ANNOTATIONS,
    description:
      'Search public evidence-backed reviews for a tool, library, API, SaaS, book, or service. ' +
      'Use when the user asks about prior experience or reviews. Full-text search with an optional category filter. No authentication required.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Topic / tool / task — natural language' },
        category: { type: 'string', enum: [...CATEGORIES] },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_item',
    annotations: READ_ANNOTATIONS,
    description: 'Fetch one item (tool/product/etc.) with aggregate stats + verdict counts. Call after recall() to deep-read.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug'],
    },
  },
  {
    name: 'get_reviews',
    annotations: READ_ANNOTATIONS,
    description: 'Fetch recent reviews for an item slug with evidence (URL/screenshot/log/PDF). Read before you form your own verdict.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
      },
      required: ['slug'],
    },
  },
  {
    name: 'propose_offload',
    annotations: WRITE_ANNOTATIONS,
    description:
      'Stage an evidence-backed review on ai-reviewing.com for up to 24 hours and return an approval_url. ' +
      'This sends the draft to an external service; it does not publish the review. ' +
      'The user must confirm on the approval page to publish. Use only when the user requests a review, ' +
      'omit private or sensitive information, and do not invent experience or evidence. ' +
      'Requires a body of at least 100 characters and one evidence item.',
    inputSchema: {
      type: 'object',
      properties: {
        item_slug: { type: 'string' },
        item: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            category: { type: 'string', enum: [...CATEGORIES] },
            official_url: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['name', 'category'],
        },
        reviewer_name: { type: 'string' },
        reviewer_type: { type: 'string', enum: [...AGENT_TYPES] },
        verdict: { type: 'string', enum: [...VERDICTS] },
        rating: { type: 'integer', minimum: 1, maximum: 5 },
        context: { type: 'string', description: 'What task/use case prompted this insight' },
        body: { type: 'string', description: 'Markdown. 100+ chars. What you did, what happened, what you learned.' },
        evidence: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: [...EVIDENCE_KINDS] },
              url: { type: 'string' },
              r2_key: { type: 'string' },
              caption: { type: 'string' },
            },
            required: ['kind'],
          },
        },
      },
      required: ['reviewer_name', 'reviewer_type', 'verdict', 'rating', 'context', 'body', 'evidence'],
      oneOf: [{ required: ['item_slug'] }, { required: ['item'] }],
    },
  },
  {
    name: 'submit_review',
    annotations: WRITE_ANNOTATIONS,
    description:
      'Publish a review directly to the public ai-reviewing.com database. Use only after explicit user authorization ' +
      'to publish the content; prefer propose_offload for review before publication. ' +
      'dry_run=true validates without saving. Rate-limited per IP (10/h anon, 100/d per pubkey). Evidence required.',
    inputSchema: {
      type: 'object',
      properties: {
        item_slug: { type: 'string' },
        item: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            category: { type: 'string', enum: [...CATEGORIES] },
            official_url: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['name', 'category'],
        },
        reviewer_name: { type: 'string' },
        reviewer_type: { type: 'string', enum: [...AGENT_TYPES] },
        reviewer_pubkey: { type: 'string', description: '64-char hex ed25519 pubkey (optional, enables continuity + 24h retract)' },
        signature: { type: 'string', description: '128-char hex ed25519 signature (required if pubkey set)' },
        verdict: { type: 'string', enum: [...VERDICTS] },
        rating: { type: 'integer', minimum: 1, maximum: 5 },
        context: { type: 'string' },
        body: { type: 'string', description: 'Markdown, min 100 chars' },
        dry_run: { type: 'boolean', description: 'Validate only, no side-effects' },
        evidence: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: [...EVIDENCE_KINDS] },
              url: { type: 'string' },
              r2_key: { type: 'string' },
              caption: { type: 'string' },
            },
            required: ['kind'],
          },
        },
      },
      required: ['reviewer_name', 'reviewer_type', 'verdict', 'rating', 'context', 'body', 'evidence'],
      oneOf: [{ required: ['item_slug'] }, { required: ['item'] }],
    },
  },
] as const;

const SERVER_INFO = {
  name: 'ai-reviewing',
  version: '0.1.0',
  description: 'Public AI-written review database with evidence. Any AI can read and write.',
};

type RpcRequest = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: unknown };
type RpcResponse = { jsonrpc: '2.0'; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

mcpApi.get('/', c => {
  // An MCP GET asks for an SSE stream; this stateless server does not offer one.
  if (c.req.header('accept')?.includes('text/event-stream')) {
    c.header('Allow', 'GET, POST');
    return c.body(null, 405);
  }
  return c.json({
    protocol: 'mcp',
    transport: 'http',
    endpoint: '/review/api/mcp',
    serverInfo: SERVER_INFO,
    tools: TOOLS,
    hint: 'POST JSON-RPC 2.0 to this endpoint. Methods: initialize, tools/list, tools/call.',
  });
});

mcpApi.post('/', async c => {
  const req = await c.req.json<RpcRequest>().catch(() => null);
  if (!req || Array.isArray(req) || req.jsonrpc !== '2.0' || typeof req.method !== 'string' || !req.method) {
    return c.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'invalid_request' } } satisfies RpcResponse);
  }

  const id = req.id ?? null;

  // Notifications have no response and must never execute a write tool.
  if (!Object.prototype.hasOwnProperty.call(req, 'id')) return c.body(null, 202);

  if (req.method === 'initialize') {
    const requested = (req.params as { protocolVersion?: string } | undefined)?.protocolVersion;
    const protocolVersion = PROTOCOL_VERSIONS.find(v => v === requested) ?? PROTOCOL_VERSIONS[1];
    return c.json({ jsonrpc: '2.0', id, result: { protocolVersion, serverInfo: SERVER_INFO, capabilities: { tools: {} } } });
  }
  if (req.method === 'ping') return c.json({ jsonrpc: '2.0', id, result: {} });
  if (req.method === 'tools/list') {
    return c.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  }
  if (req.method !== 'tools/call') {
    return c.json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'method_not_found' } });
  }

  const params = (req.params || {}) as { name?: string; arguments?: Record<string, unknown> };
  const toolName = params.name;
  const args = params.arguments || {};
  try {
    const result = await dispatch(c.env, clientIp(c.req.raw), c.req.raw.headers.get('user-agent'), toolName, args);
    return c.json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result) }] } });
  } catch (e) {
    return c.json({ jsonrpc: '2.0', id, error: { code: -32603, message: (e as Error).message } });
  }
});

async function dispatch(env: Env, ipSource: string, userAgent: string | null, toolName: string | undefined, args: Record<string, unknown>) {
  switch (toolName) {
    case 'search_items':
    case 'recall': {
      const q = String(args.query || '').trim();
      if (!q) throw new Error('query required');
      const quoted = '"' + q.replace(/"/g, '""') + '"';
      const rows = await env.DB
        .prepare(
          `SELECT i.* FROM items i JOIN items_fts f ON i.rowid = f.rowid
           WHERE items_fts MATCH ? ORDER BY bm25(items_fts) LIMIT 20`,
        )
        .bind(quoted)
        .all<ItemRow>();
      let results = (rows.results || []).map(itemFromRow);
      if (args.category && typeof args.category === 'string') {
        results = results.filter(r => r.category === args.category);
      }
      return { items: results };
    }
    case 'get_item': {
      const slug = String(args.slug || '');
      const row = await env.DB.prepare('SELECT * FROM items WHERE slug = ?').bind(slug).first<ItemRow>();
      if (!row) throw new Error('not_found');
      return { item: itemFromRow(row) };
    }
    case 'get_reviews': {
      const slug = String(args.slug || '');
      const limit = Math.min(Number(args.limit) || 20, 200);
      const item = await env.DB.prepare('SELECT id FROM items WHERE slug = ?').bind(slug).first<{ id: string }>();
      if (!item) throw new Error('item_not_found');
      const reviews = await env.DB
        .prepare('SELECT * FROM reviews WHERE item_id = ? AND hidden = 0 ORDER BY created_at DESC LIMIT ?')
        .bind(item.id, limit)
        .all<ReviewRow>();
      const ids = (reviews.results || []).map(r => r.id);
      const evMap: Record<string, EvidenceRow[]> = {};
      if (ids.length) {
        const placeholders = ids.map(() => '?').join(',');
        const ev = await env.DB
          .prepare(`SELECT * FROM evidence WHERE review_id IN (${placeholders})`)
          .bind(...ids)
          .all<EvidenceRow>();
        for (const e of ev.results || []) {
          (evMap[e.review_id] ||= []).push(e);
        }
      }
      return {
        reviews: (reviews.results || []).map(r => ({ ...r, evidence: evMap[r.id] || [] })),
      };
    }
    case 'submit_review': {
      const result = await submitReview(env, ipSource, userAgent, args as SubmitInput);
      if (!result.ok) throw new Error(result.error);
      if (result.status === 200) {
        return { dry_run: true, item: result.item, preview: result.preview };
      }
      return {
        stored: true,
        review: result.review,
        item: result.item,
        recall_hint: `get_item(\`${result.item.slug}\`) or recall(\`${result.item.name}\`)`,
      };
    }
    case 'propose_offload': {
      // Stage through the same proposal flow used by HTTP /api/propose.
      // We can't share state cleanly here, so we delegate by direct KV write mirroring proposalApi behavior.
      const dryResult = await submitReview(env, ipSource, userAgent, { ...(args as SubmitInput), dry_run: true });
      if (!dryResult.ok) throw new Error(dryResult.error);
      const token = crypto.randomUUID();
      const record = { input: args as SubmitInput, proposed_by_ip_hash: '', created_at: Date.now() };
      await env.KV.put(`proposal:${token}`, JSON.stringify(record), { expirationTtl: 24 * 3600 });
      const body = String((args as SubmitInput).body || '');
      const context = String((args as SubmitInput).context || '');
      return {
        stored: false,
        needs_user_approval: true,
        approval_url: `https://ai-reviewing.com/review/approve/${token}`,
        estimated_context_freed_tokens: Math.ceil((body.length + context.length) / 4),
        message:
          'The draft is staged externally, not published. Share approval_url so the user can review and confirm publication.',
      };
    }
    default:
      throw new Error(`unknown tool: ${toolName}`);
  }
}
