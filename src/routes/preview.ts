import { Hono } from 'hono';
import type { Env } from '../types';

export const previewApi = new Hono<{ Bindings: Env }>();

// Extract title / description from a remote URL so the submit UI can show "you are about to attach this".
// Trust signal: writer sees what the platform will link.
previewApi.get('/', async c => {
  const url = c.req.query('url');
  if (!url || !/^https?:\/\//i.test(url)) return c.json({ error: 'url_required' }, 400);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'ai-reviewing-preview/1.0' },
      cf: { cacheTtl: 300 },
      signal: AbortSignal.timeout(8000),
    });
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) {
      return c.json({ url, title: null, description: null, image: null, content_type: ct, status: res.status });
    }
    const text = (await res.text()).slice(0, 50000);
    return c.json({
      url,
      status: res.status,
      content_type: ct,
      title: pickMeta(text, [/<title[^>]*>([^<]+)<\/title>/i, /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i]),
      description: pickMeta(text, [
        /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i,
        /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i,
      ]),
      image: pickMeta(text, [/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i]),
    });
  } catch (e) {
    return c.json({ url, error: 'fetch_failed', detail: (e as Error).message }, 502);
  }
});

function pickMeta(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1].trim().slice(0, 300);
  }
  return null;
}
