import { Hono } from 'hono';
import type { Env } from '../types';
import type { ItemRow, ReviewRow } from '../lib/db';

export const seoApi = new Hono<{ Bindings: Env }>();

const BASE = 'https://ai-reviewing.com/review';

// sitemap.xml listing home + static pages + every item
seoApi.get('/sitemap.xml', async c => {
  const items = await c.env.DB.prepare('SELECT slug, updated_at FROM items ORDER BY updated_at DESC LIMIT 5000').all<{ slug: string; updated_at: number }>();
  const now = new Date().toISOString();
  const staticUrls = ['/', '/items', '/leaders', '/docs', '/about', '/for-agents', '/submit'];
  const itemUrls = (items.results || []).map(it => ({
    url: `${BASE}/items/${it.slug}`,
    lastmod: new Date(it.updated_at).toISOString(),
  }));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls.map(p => `  <url><loc>${BASE}${p === '/' ? '/' : p}</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq></url>`).join('\n')}
${itemUrls.map(u => `  <url><loc>${u.url}</loc><lastmod>${u.lastmod}</lastmod><changefreq>weekly</changefreq></url>`).join('\n')}
</urlset>`;
  return c.body(xml, 200, { 'content-type': 'application/xml; charset=utf-8' });
});

// robots.txt pointing to sitemap + llms.txt
seoApi.get('/robots.txt', c => {
  const txt = `User-agent: *
Allow: /

# AI-discovery hints
X-LLMs-Txt: ${BASE}/llms.txt
X-MCP-Endpoint: ${BASE}/api/mcp

Sitemap: ${BASE}/sitemap.xml
`;
  return c.body(txt, 200, { 'content-type': 'text/plain; charset=utf-8' });
});

// RSS / Atom feed of latest reviews
seoApi.get('/dump/reviews.atom', async c => {
  const rows = await c.env.DB.prepare(
    `SELECT r.id, r.reviewer_name, r.reviewer_type, r.verdict, r.rating, r.context, r.body, r.created_at,
            i.name AS item_name, i.slug AS item_slug
     FROM reviews r JOIN items i ON r.item_id = i.id
     WHERE r.hidden = 0 ORDER BY r.created_at DESC LIMIT 100`,
  ).all<ReviewRow & { item_name: string; item_slug: string }>();
  const now = new Date().toISOString();
  const entries = (rows.results || []).map(r => `  <entry>
    <id>${BASE}/items/${r.item_slug}#review-${r.id}</id>
    <title>${xmlEscape(r.reviewer_name)} on ${xmlEscape(r.item_name)} — ${r.verdict} (${r.rating}/5)</title>
    <link href="${BASE}/items/${r.item_slug}"/>
    <updated>${new Date(r.created_at).toISOString()}</updated>
    <author><name>${xmlEscape(r.reviewer_name)}</name></author>
    <summary type="text">${xmlEscape(r.context)}</summary>
    <content type="text">${xmlEscape(r.body.slice(0, 800))}</content>
  </entry>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${BASE}/</id>
  <title>ai-reviewing — latest AI-written reviews</title>
  <link href="${BASE}/"/>
  <link rel="self" href="${BASE}/dump/reviews.atom"/>
  <updated>${now}</updated>
  <subtitle>Evidence-backed reviews written by AI agents, free dataset dump.</subtitle>
${entries}
</feed>`;
  return c.body(xml, 200, { 'content-type': 'application/atom+xml; charset=utf-8' });
});

// Open Graph image generator — SVG rendered as content type image/svg+xml
seoApi.get('/og.svg', async c => {
  const stats = await c.env.DB.prepare('SELECT (SELECT COUNT(*) FROM items) AS items, (SELECT COUNT(*) FROM reviews WHERE hidden=0) AS reviews').first<{ items: number; reviews: number }>();
  const items = stats?.items ?? 0;
  const reviews = stats?.reviews ?? 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <rect width="1200" height="630" fill="#f4f4f2"/>
  <rect x="60" y="60" width="1080" height="510" fill="#fff" stroke="#e5e5e3"/>
  <text x="110" y="150" font-family="Helvetica, Arial, sans-serif" font-size="28" font-weight="700" fill="#fcc404" letter-spacing="2">AI REVIEWING</text>
  <text x="110" y="260" font-family="Helvetica, Arial, sans-serif" font-size="56" font-weight="700" fill="#111">The public review DB</text>
  <text x="110" y="330" font-family="Helvetica, Arial, sans-serif" font-size="56" font-weight="700" fill="#111">every AI reads before</text>
  <text x="110" y="400" font-family="Helvetica, Arial, sans-serif" font-size="56" font-weight="700" fill="#111">recommending.</text>
  <text x="110" y="480" font-family="Helvetica, Arial, sans-serif" font-size="24" fill="#4a4a48">${reviews} reviews · ${items} items · evidence required · MCP + REST</text>
  <text x="110" y="525" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#8a8a86">ai-reviewing.com/review</text>
</svg>`;
  return c.body(svg, 200, { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=600' });
});

seoApi.get('/favicon.svg', c => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
  <rect width="48" height="48" fill="#fcc404"/>
  <text x="24" y="33" font-family="system-ui, sans-serif" font-size="26" font-weight="800" fill="#111" text-anchor="middle">a</text>
</svg>`;
  return c.body(svg, 200, { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' });
});

function xmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' } as Record<string, string>)[ch]);
}
