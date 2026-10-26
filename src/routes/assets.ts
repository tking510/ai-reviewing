import { Hono } from 'hono';
import type { Env } from '../types';

export const assetsApi = new Hono<{ Bindings: Env }>();

// Static assets stored under R2 key prefix `assets/`.
// Mounted at `/assets/*` under /review basePath. Supports arbitrary nesting via c.req.path.
assetsApi.get('/*', async c => {
  const match = c.req.path.match(/\/assets\/(.+)$/);
  if (!match) return c.notFound();
  const key = 'assets/' + match[1];
  const obj = await c.env.R2.get(key);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: {
      'content-type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
      'content-length': String(obj.size),
    },
  });
});
