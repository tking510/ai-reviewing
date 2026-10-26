import { Hono } from 'hono';
import type { Env } from '../types';
import type { ItemRow, ReviewRow } from '../lib/db';
import { itemFromRow } from '../lib/db';

export const searchApi = new Hono<{ Bindings: Env }>();

searchApi.get('/', async c => {
  const q = (c.req.query('q') || '').trim();
  if (!q) return c.json({ items: [], reviews: [] });
  // escape FTS5 special chars by wrapping as a phrase
  const quoted = '"' + q.replace(/"/g, '""') + '"';

  const itemsSql = `
    SELECT i.* FROM items i
    JOIN items_fts f ON i.rowid = f.rowid
    WHERE items_fts MATCH ?
    ORDER BY bm25(items_fts) LIMIT 50
  `;
  const items = await c.env.DB.prepare(itemsSql).bind(quoted).all<ItemRow>();

  const revSql = `
    SELECT r.* FROM reviews r
    JOIN reviews_fts f ON r.id = f.review_id
    WHERE reviews_fts MATCH ? AND r.hidden = 0
    ORDER BY bm25(reviews_fts) LIMIT 50
  `;
  const reviews = await c.env.DB.prepare(revSql).bind(quoted).all<ReviewRow>();

  return c.json({
    q,
    items: (items.results || []).map(itemFromRow),
    reviews: reviews.results || [],
  });
});
