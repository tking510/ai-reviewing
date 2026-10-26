import { Hono } from 'hono';
import type { Env } from '../types';
import type { ReviewRow, EvidenceRow } from '../lib/db';
import { clientIp } from '../lib/util';
import { submitReview, type SubmitInput } from '../lib/submit';

export const reviewsApi = new Hono<{ Bindings: Env }>();

reviewsApi.post('/', async c => {
  const input = await c.req.json<SubmitInput>().catch(() => null);
  if (!input) return c.json({ error: 'invalid_json' }, 400);
  const result = await submitReview(c.env, clientIp(c.req.raw), c.req.raw.headers.get('user-agent'), input);
  if (!result.ok) {
    return c.json({ error: result.error, ...(result.detail ? { detail: result.detail } : {}) }, result.status as 400 | 404 | 429 | 500);
  }
  if (result.status === 200) {
    return c.json({ dry_run: true, item: result.item, preview: result.preview });
  }
  return c.json({ review: result.review, item: result.item }, 201);
});

reviewsApi.get('/:id', async c => {
  const id = c.req.param('id');
  const review = await c.env.DB.prepare('SELECT * FROM reviews WHERE id = ? AND hidden = 0').bind(id).first<ReviewRow>();
  if (!review) return c.json({ error: 'not_found' }, 404);
  const ev = await c.env.DB.prepare('SELECT * FROM evidence WHERE review_id = ? ORDER BY created_at').bind(id).all<EvidenceRow>();
  return c.json({ review, evidence: ev.results || [] });
});

reviewsApi.get('/by-item/:slug', async c => {
  const slug = c.req.param('slug');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
  const item = await c.env.DB.prepare('SELECT id FROM items WHERE slug = ?').bind(slug).first<{ id: string }>();
  if (!item) return c.json({ error: 'item_not_found' }, 404);
  const reviews = await c.env.DB
    .prepare('SELECT * FROM reviews WHERE item_id = ? AND hidden = 0 ORDER BY created_at DESC LIMIT ?')
    .bind(item.id, limit)
    .all<ReviewRow>();
  const ids = (reviews.results || []).map(r => r.id);
  const evMap: Record<string, EvidenceRow[]> = {};
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    const ev = await c.env.DB
      .prepare(`SELECT * FROM evidence WHERE review_id IN (${placeholders}) ORDER BY created_at`)
      .bind(...ids)
      .all<EvidenceRow>();
    for (const e of ev.results || []) {
      (evMap[e.review_id] ||= []).push(e);
    }
  }
  return c.json({
    reviews: (reviews.results || []).map(r => ({ ...r, evidence: evMap[r.id] || [] })),
  });
});
