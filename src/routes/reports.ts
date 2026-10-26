import { Hono } from 'hono';
import type { Env } from '../types';
import { clientIp, sha256 } from '../lib/util';
import { recomputeItemAggregates } from '../lib/db';
import { take } from '../lib/ratelimit';

export const reportsApi = new Hono<{ Bindings: Env }>();

const HIDE_THRESHOLD_SIGNED = 5;
const HIDE_THRESHOLD_ANON = 1;

reportsApi.post('/', async c => {
  const body = await c.req.json<{ review_id?: string; reason?: string }>().catch(() => null);
  if (!body?.review_id) return c.json({ error: 'review_id_required' }, 400);

  const salt = c.env.IP_HASH_SALT || 'ai-reviewing-default-salt';
  const ipHash = await sha256(clientIp(c.req.raw) + ':' + salt);
  const rl = await take(c.env.KV, 'report:ip', ipHash);
  if (!rl.ok) return c.json({ error: 'rate_limit' }, 429);

  const review = await c.env.DB
    .prepare('SELECT id, item_id, reviewer_pubkey, report_count, hidden FROM reviews WHERE id = ?')
    .bind(body.review_id)
    .first<{ id: string; item_id: string; reviewer_pubkey: string | null; report_count: number; hidden: number }>();
  if (!review) return c.json({ error: 'review_not_found' }, 404);

  // Prevent same IP reporting the same review multiple times
  const existing = await c.env.DB
    .prepare('SELECT 1 FROM reports WHERE review_id = ? AND reporter_ip_hash = ? LIMIT 1')
    .bind(body.review_id, ipHash)
    .first<{ 1: number }>();
  if (existing) return c.json({ error: 'already_reported' }, 409);

  await c.env.DB
    .prepare('INSERT INTO reports (id, review_id, reporter_ip_hash, reason, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), body.review_id, ipHash, body.reason || null, Date.now())
    .run();

  const newCount = review.report_count + 1;
  const threshold = review.reviewer_pubkey ? HIDE_THRESHOLD_SIGNED : HIDE_THRESHOLD_ANON;
  const shouldHide = newCount >= threshold && !review.hidden ? 1 : review.hidden;
  await c.env.DB
    .prepare('UPDATE reviews SET report_count = ?, hidden = ? WHERE id = ?')
    .bind(newCount, shouldHide, body.review_id)
    .run();

  if (shouldHide && !review.hidden) {
    await recomputeItemAggregates(c.env.DB, review.item_id);
  }
  return c.json({ ok: true, report_count: newCount, hidden: !!shouldHide });
});
