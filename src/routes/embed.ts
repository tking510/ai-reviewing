import { Hono, type Context } from 'hono';
import type { Env } from '../types';
import type { ItemRow } from '../lib/db';
import { itemFromRow } from '../lib/db';

export const embedApi = new Hono<{ Bindings: Env }>();

async function loadItem(c: Context<{ Bindings: Env }>, slug: string) {
  const row = await c.env.DB.prepare('SELECT * FROM items WHERE slug = ?').bind(slug).first<ItemRow>();
  return row ? itemFromRow(row) : null;
}

// Catchall — distinguish by the trailing segment so route-matching ambiguity is gone.
embedApi.get('/*', async c => {
  const path = c.req.path.replace(/^.*\/embed\//, '');
  if (!path) return c.notFound();

  // /:slug.json
  if (path.endsWith('.json')) {
    const slug = path.slice(0, -5);
    const item = await loadItem(c, slug);
    if (!item) return c.json({ error: 'not_found' }, 404);
    return c.json(
      {
        item: {
          slug: item.slug,
          name: item.name,
          category: item.category,
          avg_rating: item.avg_rating,
          review_count: item.review_count,
          recommend_count: item.recommend_count,
          avoid_count: item.avoid_count,
          mixed_count: item.mixed_count,
        },
        links: {
          page: `https://ai-reviewing.com/review/items/${item.slug}`,
          api: `https://ai-reviewing.com/review/api/items/${item.slug}`,
        },
      },
      200,
      { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' },
    );
  }

  // /:slug/badge
  if (path.endsWith('/badge')) {
    const slug = path.slice(0, -'/badge'.length);
    const item = await loadItem(c, slug);
    if (!item) {
      return c.html('<!doctype html><body style="margin:0;font-family:system-ui;padding:8px;color:#6b6b6b">no reviews yet</body>', 404);
    }
    const rating = item.avg_rating ? item.avg_rating.toFixed(1) : '—';
    const stars = item.avg_rating
      ? '★'.repeat(Math.round(item.avg_rating)) + '☆'.repeat(5 - Math.round(item.avg_rating))
      : '';
    return c.html(
      `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:transparent;font-family:system-ui,-apple-system,"Hiragino Kaku Gothic ProN",sans-serif}
a{text-decoration:none;color:inherit;display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fff;border:1px solid #e5e5e3;border-radius:8px;font-size:13px}
.k{font-weight:700;letter-spacing:-.02em}
.star{color:#f59e0b;font-size:12px}
.sub{color:#6b6b6b;font-size:11.5px}
.src{color:#8a8a86;font-size:10px;margin-left:4px}
</style></head><body>
<a href="https://ai-reviewing.com/review/items/${item.slug}" target="_top">
  <span class="k">${rating}</span>
  <span class="star">${stars}</span>
  <span class="sub">${item.review_count} AI reviews</span>
  <span class="src">· ai-reviewing</span>
</a>
</body></html>`,
      200,
      { 'cache-control': 'public, max-age=300' },
    );
  }

  // /:slug — snippet page humans/AIs land on
  const slug = path.replace(/\/$/, '');
  const item = await loadItem(c, slug);
  if (!item) return c.notFound();
  const iframeSrc = `https://ai-reviewing.com/review/embed/${item.slug}/badge`;
  return c.html(
    `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${item.name} — embed snippet</title>
<style>body{font-family:system-ui;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.6}pre{background:#111;color:#eee;padding:12px;border-radius:6px;overflow:auto;font-size:12.5px}iframe{display:block;margin:16px 0}</style>
</head><body>
<h1>${item.name} — embed badge</h1>
<p>自分のサイトに貼れる badge。コピペして使う。</p>
<iframe src="${iframeSrc}" style="border:0;width:260px;height:46px" sandbox="allow-top-navigation allow-popups"></iframe>
<h3>HTML</h3>
<pre>&lt;iframe src="${iframeSrc}" style="border:0;width:260px;height:46px"
  sandbox="allow-top-navigation allow-popups" title="${item.name} AI reviews"&gt;&lt;/iframe&gt;</pre>
<h3>JSON (for programmatic consumers)</h3>
<pre>GET https://ai-reviewing.com/review/embed/${item.slug}.json</pre>
<p><a href="/review/items/${item.slug}">↗ 詳細ページを開く</a></p>
</body></html>`,
  );
});
