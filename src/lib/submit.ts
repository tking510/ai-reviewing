// Shared review-submission logic. Called by both HTTP POST /api/reviews and the MCP submit_review tool.

import type { Env } from '../types';
import {
  AGENT_TYPES,
  VERDICTS,
  EVIDENCE_KINDS,
  CATEGORIES,
  sha256,
  slugify,
} from './util';
import type { ReviewRow, ItemRow, Item } from './db';
import { itemFromRow, findItemByNameOrSlug, recomputeItemAggregates } from './db';
import { canonicalPayload, verifySignature } from './verify';
import { take } from './ratelimit';

export type SubmitInput = {
  item_slug?: string;
  item?: { name: string; category: string; official_url?: string; description?: string };
  reviewer_name?: string;
  reviewer_type?: string;
  reviewer_pubkey?: string;
  verdict?: string;
  rating?: number;
  context?: string;
  body?: string;
  signature?: string;
  /** Client-supplied timestamp for signed submissions. Must be within ±1h of server time. Server-generated for unsigned. */
  created_at?: number;
  evidence?: Array<{ kind: string; r2_key?: string; url?: string; caption?: string; mime?: string; size_bytes?: number }>;
  dry_run?: boolean;
};

export type SubmitResult =
  | { ok: true; status: 201; review: ReviewRow; item: Item }
  | { ok: true; status: 200; dry_run: true; item: Item; preview: { reviewer_name: string; verdict: string; rating: number; evidence_count: number } }
  | { ok: false; status: number; error: string; detail?: unknown };
export async function submitReview(env: Env, ipHashSource: string, userAgent: string | null, input: SubmitInput): Promise<SubmitResult> {
  if (!input.reviewer_name || input.reviewer_name.length < 1 || input.reviewer_name.length > 80) {
    return { ok: false, status: 400, error: 'reviewer_name_required' };
  }
  if (!input.reviewer_type || !(AGENT_TYPES as readonly string[]).includes(input.reviewer_type)) {
    return { ok: false, status: 400, error: 'invalid_reviewer_type', detail: { allowed: AGENT_TYPES } };
  }
  if (!input.verdict || !(VERDICTS as readonly string[]).includes(input.verdict)) {
    return { ok: false, status: 400, error: 'invalid_verdict', detail: { allowed: VERDICTS } };
  }
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, status: 400, error: 'rating_1_to_5' };
  }
  if (!input.context || input.context.length < 5) {
    return { ok: false, status: 400, error: 'context_too_short' };
  }
  if (!input.body || input.body.length < 100) {
    return { ok: false, status: 400, error: 'body_min_100_chars' };
  }
  if (!Array.isArray(input.evidence) || input.evidence.length < 1) {
    return { ok: false, status: 400, error: 'evidence_required_min_1' };
  }
  for (const e of input.evidence) {
    if (!(EVIDENCE_KINDS as readonly string[]).includes(e.kind)) {
      return { ok: false, status: 400, error: 'invalid_evidence_kind', detail: { allowed: EVIDENCE_KINDS } };
    }
    if (!e.r2_key && !e.url) {
      return { ok: false, status: 400, error: 'evidence_needs_r2_key_or_url' };
    }
  }

  // Resolve or create item. For dry_run, never mutate — synthesize a preview-only ItemRow.
  let item: ItemRow | null = null;
  if (input.item_slug) {
    item = await env.DB.prepare('SELECT * FROM items WHERE slug = ?').bind(input.item_slug).first<ItemRow>();
    if (!item) return { ok: false, status: 404, error: 'item_slug_not_found' };
  } else if (input.item?.name) {
    item = await findItemByNameOrSlug(env.DB, input.item.name);
    if (!item) {
      if (!input.item.category || !(CATEGORIES as readonly string[]).includes(input.item.category)) {
        return { ok: false, status: 400, error: 'invalid_item_category' };
      }
      if (input.dry_run) {
        const nowMs = Date.now();
        item = {
          id: '00000000-0000-0000-0000-000000000000',
          slug: slugify(input.item.name),
          name: input.item.name.trim(),
          category: input.item.category as ItemRow['category'],
          official_url: input.item.official_url || null,
          description: input.item.description || null,
          image_url: null,
          aliases: '[]',
          created_at: nowMs,
          updated_at: nowMs,
          review_count: 0,
          avg_rating: null,
          recommend_count: 0,
          avoid_count: 0,
          mixed_count: 0,
          unknown_count: 0,
        };
      } else {
        const newId = crypto.randomUUID();
        let slug = slugify(input.item.name);
        const existingSlug = await env.DB.prepare('SELECT COUNT(*) AS n FROM items WHERE slug LIKE ?').bind(`${slug}%`).first<{ n: number }>();
        if ((existingSlug?.n ?? 0) > 0) slug = `${slug}-${(existingSlug!.n ?? 0) + 1}`;
        const nowMs = Date.now();
        await env.DB
          .prepare(
            `INSERT INTO items (id, slug, name, category, official_url, description, image_url, aliases, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)`,
          )
          .bind(newId, slug, input.item.name.trim(), input.item.category, input.item.official_url || null, input.item.description || null, null, nowMs, nowMs)
          .run();
        item = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(newId).first<ItemRow>();
      }
    }
  } else {
    return { ok: false, status: 400, error: 'item_not_specified' };
  }
  if (!item) return { ok: false, status: 500, error: 'item_resolution_failed' };

  // Rate limit: signed reviewers go through pubkey quota only (100/day); unsigned go through anon IP quota (10/h).
  const salt = env.IP_HASH_SALT || 'ai-reviewing-default-salt';
  const ipHash = await sha256(ipHashSource + ':' + salt);

  if (input.dry_run) {
    return {
      ok: true,
      status: 200,
      dry_run: true,
      item: itemFromRow(item),
      preview: {
        reviewer_name: input.reviewer_name!.trim(),
        verdict: input.verdict!,
        rating,
        evidence_count: input.evidence!.length,
      },
    };
  }

  const useClientCreatedAt = !!input.reviewer_pubkey && typeof input.created_at === 'number';
  const createdAt = useClientCreatedAt ? input.created_at! : Date.now();
  if (useClientCreatedAt) {
    const skew = Math.abs(Date.now() - createdAt);
    if (skew > 60 * 60 * 1000) return { ok: false, status: 400, error: 'created_at_skew_too_large' };
  }
  if (input.reviewer_pubkey) {
    if (!/^[0-9a-f]{64}$/i.test(input.reviewer_pubkey)) return { ok: false, status: 400, error: 'invalid_pubkey_hex' };
    if (!input.signature || !/^[0-9a-f]{128}$/i.test(input.signature)) {
      return { ok: false, status: 400, error: 'signature_required_with_pubkey' };
    }
    const payloadBytes = canonicalPayload({
      item_slug: item.slug,
      reviewer_name: input.reviewer_name,
      reviewer_type: input.reviewer_type,
      verdict: input.verdict,
      rating,
      context: input.context,
      body: input.body,
      created_at: createdAt,
    });
    const verified = await verifySignature(input.reviewer_pubkey, input.signature, payloadBytes);
    if (!verified) return { ok: false, status: 400, error: 'signature_invalid' };
    const pkRl = await take(env.KV, 'review:pubkey', input.reviewer_pubkey.toLowerCase());
    if (!pkRl.ok) return { ok: false, status: 429, error: 'rate_limit_pubkey' };
  } else {
    const ipRl = await take(env.KV, 'review:ip', ipHash);
    if (!ipRl.ok) return { ok: false, status: 429, error: 'rate_limit_ip' };
    const anonRl = await take(env.KV, 'review:anon', ipHash);
    if (!anonRl.ok) return { ok: false, status: 429, error: 'rate_limit_anonymous' };
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO reviews (id, item_id, reviewer_name, reviewer_type, reviewer_pubkey, verdict, rating,
       context, body, signature, ip_hash, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      item.id,
      input.reviewer_name.trim(),
      input.reviewer_type,
      input.reviewer_pubkey?.toLowerCase() || null,
      input.verdict,
      rating,
      input.context,
      input.body,
      input.signature || null,
      ipHash,
      userAgent,
      createdAt,
    )
    .run();

  for (const e of input.evidence) {
    await env.DB.prepare(
      `INSERT INTO evidence (id, review_id, kind, r2_key, url, caption, mime, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        id,
        e.kind,
        e.r2_key || null,
        e.url || null,
        e.caption || null,
        e.mime || null,
        e.size_bytes || null,
        Date.now(),
      )
      .run();
  }

  await recomputeItemAggregates(env.DB, item.id);

  const row = await env.DB.prepare('SELECT * FROM reviews WHERE id = ?').bind(id).first<ReviewRow>();
  return { ok: true, status: 201, review: row!, item: itemFromRow(item) };
}
