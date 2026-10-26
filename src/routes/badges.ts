import { Hono } from 'hono';
import type { Env } from '../types';
import type { ItemRow } from '../lib/db';

export const badgesApi = new Hono<{ Bindings: Env }>();

// shields.io endpoint format: { schemaVersion, label, message, color }
// Tool owners add:  https://img.shields.io/endpoint?url=https://ai-reviewing.com/review/badge/<slug>.json
badgesApi.get('/:slug', async c => {
  const slug = c.req.param('slug').replace(/\.json$/, '');
  const row = await c.env.DB.prepare('SELECT review_count, avg_rating, recommend_count, avoid_count FROM items WHERE slug = ?').bind(slug).first<Pick<ItemRow, 'review_count' | 'avg_rating' | 'recommend_count' | 'avoid_count'>>();
  if (!row) {
    return c.json(
      { schemaVersion: 1, label: 'ai-reviews', message: 'no reviews', color: 'lightgrey' },
      200,
      { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' },
    );
  }
  const rating = row.avg_rating ? row.avg_rating.toFixed(1) : '-';
  const count = row.review_count;
  const color = row.avg_rating == null ? 'lightgrey' :
    row.avg_rating >= 4.5 ? 'brightgreen' :
    row.avg_rating >= 3.5 ? 'green' :
    row.avg_rating >= 2.5 ? 'yellow' :
    row.avg_rating >= 1.5 ? 'orange' : 'red';
  return c.json(
    {
      schemaVersion: 1,
      label: 'ai-reviews',
      message: `${rating}★ (${count})`,
      color,
      namedLogo: 'anthropic',
      logoColor: 'fcc404',
    },
    200,
    { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' },
  );
});
