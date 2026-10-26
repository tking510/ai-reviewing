import { Hono } from 'hono';
import type { Env } from '../types';

export const evidenceApi = new Hono<{ Bindings: Env }>();

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'application/json': 'json',
};

evidenceApi.put('/:kind', async c => {
  const kind = c.req.param('kind');
  const mime = c.req.header('content-type') || 'application/octet-stream';
  const ext = MIME_TO_EXT[mime];
  if (!ext) {
    return c.json({ error: 'mime_not_allowed', allowed: Object.keys(MIME_TO_EXT) }, 415);
  }
  const length = Number(c.req.header('content-length') || 0);
  if (!length || length > MAX_BYTES) {
    return c.json({ error: 'size_out_of_range', max_bytes: MAX_BYTES }, 413);
  }

  const body = await c.req.raw.arrayBuffer();
  if (body.byteLength > MAX_BYTES) {
    return c.json({ error: 'size_exceeded', max_bytes: MAX_BYTES }, 413);
  }
  const key = `${kind}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  await c.env.R2.put(key, body, {
    httpMetadata: { contentType: mime },
  });
  return c.json({ r2_key: key, mime, size_bytes: body.byteLength });
});

evidenceApi.get('/file/*', async c => {
  const path = c.req.param('*') || '';
  if (!path) return c.notFound();
  const obj = await c.env.R2.get(path);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: {
      'content-type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
      'content-length': String(obj.size),
    },
  });
});
