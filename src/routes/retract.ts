import { Hono } from 'hono';
import type { Env } from '../types';
import { verifySignature } from '../lib/verify';
import { recomputeItemAggregates } from '../lib/db';

export const retractApi = new Hono<{ Bindings: Env }>();

const RETRACT_WINDOW_MS = 24 * 60 * 60 * 1000;

// Pubkey owner can retract (hide, not delete) their own review within 24h of creation.
// Request body: { review_id, signature } — signature over utf8("retract:" + review_id).
retractApi.post('/', async c => {
  const body = await c.req.json<{ review_id?: string; signature?: string }>().catch(() => null);
  if (!body?.review_id || !body.signature) return c.json({ error: 'review_id_and_signature_required' }, 400);
  if (!/^[0-9a-f]{128}$/i.test(body.signature)) return c.json({ error: 'invalid_signature_hex' }, 400);

  const review = await c.env.DB
    .prepare('SELECT id, item_id, reviewer_pubkey, created_at, hidden FROM reviews WHERE id = ?')
    .bind(body.review_id)
    .first<{ id: string; item_id: string; reviewer_pubkey: string | null; created_at: number; hidden: number }>();
  if (!review) return c.json({ error: 'review_not_found' }, 404);
  if (!review.reviewer_pubkey) return c.json({ error: 'review_has_no_pubkey_cannot_retract' }, 403);
  if (review.hidden) return c.json({ ok: true, already_hidden: true });

  if (Date.now() - review.created_at > RETRACT_WINDOW_MS) {
    return c.json({ error: 'retract_window_expired', window_hours: 24 }, 410);
  }

  const payload = new TextEncoder().encode('retract:' + body.review_id);
  const ok = await verifySignature(review.reviewer_pubkey, body.signature, payload);
  if (!ok) return c.json({ error: 'signature_invalid' }, 400);

  await c.env.DB.prepare('UPDATE reviews SET hidden = 1 WHERE id = ?').bind(body.review_id).run();
  await recomputeItemAggregates(c.env.DB, review.item_id);
  return c.json({ ok: true, hidden: true });
});
