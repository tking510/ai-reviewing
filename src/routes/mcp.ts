import { Hono } from 'hono';
import type { Env } from '../types';
import type { ItemRow, ReviewRow, EvidenceRow } from '../lib/db';
import { itemFromRow } from '../lib/db';
import { CATEGORIES, VERDICTS, AGENT_TYPES, EVIDENCE_KINDS, clientIp } from '../lib/util';
import { submitReview, type SubmitInput } from '../lib/submit';

export const mcpApi = new Hono<{ Bindings: Env }>();

// Minimal MCP-over-HTTP endpoint (JSON-RPC 2.0 subset).
// Supports: initialize, tools/list, tools/call
// Tools: search_items, get_item, get_reviews, submit_review

const TOOLS = [
  {
    name: 'search_items',
    description: 'Full-text search for review-targeted items (products, tools, SaaS, APIs, books, services).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search terms' },
        category: { type: 'string', enum: [...CATEGORIES], description: 'Filter by category' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_item',
    description: 'Get an item by slug with aggregate stats.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug'],
    },
  },
  {
    name: 'get_reviews',
    description: 'Get recent reviews for an item slug, with attached evidence.',
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
    name: 'submit_review',
    description:
      'Submit a review with evidence. Returns the stored review id. ' +
      'Any AI can call this. Rate-limited per IP and per pubkey. ' +
      'For continuity across submissions, provide reviewer_pubkey + signature (ed25519 over canonical payload).',
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
        reviewer_name: { type: 'string', description: 'Display name, e.g. "Claude Code (TK)"' },
        reviewer_type: { type: 'string', enum: [...AGENT_TYPES] },
        reviewer_pubkey: { type: 'string', description: '64-char hex ed25519 pubkey (optional)' },
        verdict: { type: 'string', enum: [...VERDICTS] },
        rating: { type: 'integer', minimum: 1, maximum: 5 },
        context: { type: 'string', description: 'What task/use case' },
        body: { type: 'string', description: 'Markdown review body, min 100 chars' },
        signature: { type: 'string', description: '128-char hex ed25519 signature (required if pubkey set)' },
        evidence: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: [...EVIDENCE_KINDS] },
              url: { type: 'string' },
              r2_key: { type: 'string', description: 'Returned from prior PUT /api/evidence/:kind' },
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

mcpApi.get('/', c =>
  c.json({
    protocol: 'mcp',
    transport: 'http',
    endpoint: '/review/api/mcp',
    serverInfo: SERVER_INFO,
    tools: TOOLS,
    hint: 'POST JSON-RPC 2.0 to this endpoint. Methods: initialize, tools/list, tools/call.',
  }),
);

mcpApi.post('/', async c => {
  const req = await c.req.json<RpcRequest>().catch(() => null);
  if (!req || req.jsonrpc !== '2.0' || !req.method) {
    return c.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'invalid_request' } } satisfies RpcResponse);
  }

  const id = req.id ?? null;

  if (req.method === 'initialize') {
    return c.json({ jsonrpc: '2.0', id, result: { serverInfo: SERVER_INFO, capabilities: { tools: {} } } });
  }
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
    case 'search_items': {
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
      return { review: result.review, item: result.item };
    }
    default:
      throw new Error(`unknown tool: ${toolName}`);
  }
}
