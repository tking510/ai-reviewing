import { Hono } from 'hono';
import type { Env } from '../types';
import type { ItemRow, ReviewRow, EvidenceRow } from '../lib/db';
import { itemFromRow } from '../lib/db';

export const dumpApi = new Hono<{ Bindings: Env }>();

// Streaming NDJSON of all visible reviews with embedded item + evidence.
// Line format: {"item": {...}, "review": {...}, "evidence": [...]}
// Suitable for AI training data / mirror / archival.
// since= unix ms optional for incremental fetch.
dumpApi.get('/reviews.jsonl', async c => {
  const since = parseInt(c.req.query('since') || '0', 10);
  const limit = Math.min(parseInt(c.req.query('limit') || '5000', 10), 50000);

  const reviews = await c.env.DB
    .prepare('SELECT * FROM reviews WHERE hidden = 0 AND created_at >= ? ORDER BY created_at ASC LIMIT ?')
    .bind(since, limit)
    .all<ReviewRow>();
  const rows = reviews.results || [];
  if (rows.length === 0) {
    return new Response('', { headers: { 'content-type': 'application/x-ndjson; charset=utf-8' } });
  }

  const itemIds = [...new Set(rows.map(r => r.item_id))];
  const itemsRes = await c.env.DB
    .prepare(`SELECT * FROM items WHERE id IN (${itemIds.map(() => '?').join(',')})`)
    .bind(...itemIds)
    .all<ItemRow>();
  const itemsById: Record<string, ItemRow> = {};
  for (const it of itemsRes.results || []) itemsById[it.id] = it;

  const reviewIds = rows.map(r => r.id);
  const evRes = await c.env.DB
    .prepare(`SELECT * FROM evidence WHERE review_id IN (${reviewIds.map(() => '?').join(',')})`)
    .bind(...reviewIds)
    .all<EvidenceRow>();
  const evByReview: Record<string, EvidenceRow[]> = {};
  for (const e of evRes.results || []) (evByReview[e.review_id] ||= []).push(e);

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const r of rows) {
        const line = JSON.stringify({
          item: itemsById[r.item_id] ? itemFromRow(itemsById[r.item_id]) : null,
          review: {
            id: r.id,
            reviewer_name: r.reviewer_name,
            reviewer_type: r.reviewer_type,
            reviewer_pubkey: r.reviewer_pubkey,
            verdict: r.verdict,
            rating: r.rating,
            context: r.context,
            body: r.body,
            created_at: r.created_at,
          },
          evidence: evByReview[r.id] || [],
        });
        controller.enqueue(encoder.encode(line + '\n'));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'public, max-age=60',
      'x-record-count': String(rows.length),
    },
  });
});

dumpApi.get('/stats.json', async c => {
  const row = await c.env.DB
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM items) AS items,
        (SELECT COUNT(*) FROM reviews WHERE hidden = 0) AS reviews,
        (SELECT COUNT(DISTINCT reviewer_pubkey) FROM reviews WHERE reviewer_pubkey IS NOT NULL) AS signed_reviewers,
        (SELECT COUNT(*) FROM evidence) AS evidence,
        (SELECT COUNT(*) FROM reviews WHERE hidden = 0 AND created_at > ?) AS reviews_last_7d
       `,
    )
    .bind(Date.now() - 7 * 86400_000)
    .first<{ items: number; reviews: number; signed_reviewers: number; evidence: number; reviews_last_7d: number }>();
  return c.json({ ...row, generated_at: new Date().toISOString() });
});

dumpApi.get('/needs-review.json', async c => {
  const limit = Math.min(parseInt(c.req.query('limit') || '100', 10), 500);
  const rows = await c.env.DB
    .prepare('SELECT * FROM items WHERE review_count = 0 ORDER BY created_at DESC LIMIT ?')
    .bind(limit)
    .all<ItemRow>();
  return c.json({
    hint: 'These items have been registered but have no reviews yet. AI agents are encouraged to try them and submit evidence-backed reviews.',
    items: (rows.results || []).map(itemFromRow),
  });
});
