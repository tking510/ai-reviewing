import { Hono } from 'hono';
import type { Env } from './types';
import { itemsApi } from './routes/items';
import { reviewsApi } from './routes/reviews';
import { evidenceApi } from './routes/evidence';
import { searchApi } from './routes/search';
import { reportsApi } from './routes/reports';
import { mcpApi } from './routes/mcp';
import { discoveryApi } from './routes/discovery';
import { retractApi } from './routes/retract';
import { proposalApi, approvalApi } from './routes/propose';
import { previewApi } from './routes/preview';
import { dumpApi } from './routes/dump';
import { wellKnownApi } from './routes/wellknown';
import { embedApi } from './routes/embed';
import { leadersApi } from './routes/leaders';
import { forAgentsApi } from './routes/foragents';
import { seoApi } from './routes/seo';

import type { ItemRow, ReviewRow, EvidenceRow } from './lib/db';
import { itemFromRow } from './lib/db';
import { CATEGORIES } from './lib/util';
import {
  categoryCounts,
  siteStats,
  relatedItems,
  reviewsByReviewer,
  extractBullets,
} from './lib/queries';
import {
  HomePage,
  ItemsPage,
  ItemDetailPage,
  SubmitPage,
  SearchPage,
  AboutPage,
  DocsPage,
  ReviewerPage,
  LeadersPage,
  type ReviewerLead,
  type ItemLead,
} from './views/pages';

const root = new Hono<{ Bindings: Env }>({ strict: false });

// AI-discovery headers on every /review/* response.
root.use('/review/*', async (c, next) => {
  await next();
  c.header('Link', [
    `</review/llms.txt>; rel="llms-txt"`,
    `</review/openapi.json>; rel="service-desc"; type="application/json"`,
    `</review/api/mcp>; rel="mcp"`,
    `</.well-known/ai-plugin.json>; rel="service-meta"`,
  ].join(', '));
  c.header('X-MCP-Endpoint', 'https://ai-reviewing.com/review/api/mcp');
  c.header('X-LLMS-Txt', 'https://ai-reviewing.com/review/llms.txt');
});

root.route('/.well-known', wellKnownApi);

// seoApi mounted below at /review for og.svg + atom; same instance handles root-level routes
root.get('/robots.txt', c => seoApi.fetch(new Request(new URL('/robots.txt', c.req.url), c.req.raw), c.env));
root.get('/sitemap.xml', c => seoApi.fetch(new Request(new URL('/sitemap.xml', c.req.url), c.req.raw), c.env));
root.get('/favicon.svg', c => seoApi.fetch(new Request(new URL('/favicon.svg', c.req.url), c.req.raw), c.env));
root.get('/favicon.ico', c => seoApi.fetch(new Request(new URL('/favicon.svg', c.req.url), c.req.raw), c.env));

const app = new Hono<{ Bindings: Env }>({ strict: false }).basePath('/review');

app.route('/', discoveryApi);

app.route('/api/items', itemsApi);
app.route('/api/reviews', reviewsApi);
app.route('/api/evidence', evidenceApi);
app.route('/api/search', searchApi);
app.route('/api/reports', reportsApi);
app.route('/api/retract', retractApi);
app.route('/api/preview', previewApi);
app.route('/api/mcp', mcpApi);
app.route('/api/propose', proposalApi);
app.route('/approve', approvalApi);
app.route('/dump', dumpApi);
app.route('/embed', embedApi);
app.route('/api/leaders', leadersApi);
app.route('/for-agents', forAgentsApi);
app.route('/', seoApi);
app.get('/install.sh', c => forAgentsApi.fetch(new Request(new URL('/install.sh', c.req.url), c.req.raw), c.env));
// Static assets registered directly to avoid subrouter wildcard quirks.
app.get('/assets/*', async c => {
  const m = c.req.path.match(/\/assets\/(.+)$/);
  if (!m) return c.notFound();
  const key = 'assets/' + m[1];
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

// ----- HTML pages -----

app.get('/', async c => {
  const recentRows = await c.env.DB
    .prepare(
      `SELECT r.*, i.slug AS item_slug, i.name AS item_name, i.category AS item_category,
              i.official_url AS item_official_url, i.description AS item_description,
              i.aliases AS item_aliases, i.created_at AS item_created_at, i.updated_at AS item_updated_at,
              i.review_count AS item_review_count, i.avg_rating AS item_avg_rating,
              i.recommend_count AS item_recommend_count, i.avoid_count AS item_avoid_count,
              i.mixed_count AS item_mixed_count, i.unknown_count AS item_unknown_count,
              i.image_url AS item_image_url
       FROM reviews r JOIN items i ON i.id = r.item_id
       WHERE r.hidden = 0 ORDER BY r.created_at DESC LIMIT 12`,
    )
    .all<ReviewRow & Record<string, unknown>>();
  const recentReviews = (recentRows.results || []).map(r => ({
    ...(r as ReviewRow),
    item: itemFromRow({
      id: '',
      slug: String(r.item_slug),
      name: String(r.item_name),
      category: String(r.item_category) as ItemRow['category'],
      official_url: (r.item_official_url as string) || null,
      description: (r.item_description as string) || null,
      image_url: (r.item_image_url as string) || null,
      aliases: String(r.item_aliases || '[]'),
      created_at: Number(r.item_created_at),
      updated_at: Number(r.item_updated_at),
      review_count: Number(r.item_review_count),
      avg_rating: r.item_avg_rating == null ? null : Number(r.item_avg_rating),
      recommend_count: Number(r.item_recommend_count),
      avoid_count: Number(r.item_avoid_count),
      mixed_count: Number(r.item_mixed_count),
      unknown_count: Number(r.item_unknown_count),
    }),
  }));
  const [stats, counts] = await Promise.all([siteStats(c.env.DB), categoryCounts(c.env.DB)]);
  return c.html(<HomePage recentReviews={recentReviews} stats={stats} categoryCounts={counts} />);
});

app.get('/items', async c => {
  const category = c.req.query('category') || null;
  const sort = c.req.query('sort') || 'reviews';
  const where: string[] = [];
  const binds: unknown[] = [];
  if (category && (CATEGORIES as readonly string[]).includes(category)) {
    where.push('category = ?');
    binds.push(category);
  }
  const sortSql =
    sort === 'rating' ? 'avg_rating DESC NULLS LAST'
    : sort === 'recent' ? 'updated_at DESC'
    : sort === 'name' ? 'name COLLATE NOCASE'
    : 'review_count DESC, updated_at DESC';
  const sql = `SELECT * FROM items ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${sortSql} LIMIT 200`;
  const [rows, counts] = await Promise.all([
    c.env.DB.prepare(sql).bind(...binds).all<ItemRow>(),
    categoryCounts(c.env.DB),
  ]);
  return c.html(<ItemsPage items={(rows.results || []).map(itemFromRow)} category={category} sort={sort} categoryCounts={counts} />);
});

app.get('/items/:slug', async c => {
  const slug = c.req.param('slug');
  const item = await c.env.DB.prepare('SELECT * FROM items WHERE slug = ?').bind(slug).first<ItemRow>();
  if (!item) return c.notFound();
  const reviews = await c.env.DB
    .prepare('SELECT * FROM reviews WHERE item_id = ? AND hidden = 0 ORDER BY created_at DESC LIMIT 100')
    .bind(item.id)
    .all<ReviewRow>();
  const ids = (reviews.results || []).map(r => r.id);
  const evMap: Record<string, EvidenceRow[]> = {};
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    const ev = await c.env.DB
      .prepare(`SELECT * FROM evidence WHERE review_id IN (${placeholders}) ORDER BY created_at`)
      .bind(...ids)
      .all<EvidenceRow>();
    for (const e of ev.results || []) (evMap[e.review_id] ||= []).push(e);
  }
  const combined = (reviews.results || []).map(r => ({ ...r, evidence: evMap[r.id] || [] }));

  const related = await relatedItems(c.env.DB, item);

  const recommendBullets = extractBullets(combined.filter(r => r.verdict === 'recommend').map(r => r.body));
  const avoidBullets = extractBullets(combined.filter(r => r.verdict === 'avoid' || r.verdict === 'mixed').map(r => r.body));
  const topEvidence: EvidenceRow[] = [];
  for (const r of combined) {
    for (const e of r.evidence) {
      if (topEvidence.length < 5) topEvidence.push(e);
    }
    if (topEvidence.length >= 5) break;
  }

  return c.html(
    <ItemDetailPage
      item={itemFromRow(item)}
      reviews={combined}
      related={related.map(itemFromRow)}
      insights={{ recommend: recommendBullets, avoid: avoidBullets, topEvidence }}
    />,
  );
});

app.get('/submit', c => c.html(<SubmitPage itemSlug={c.req.query('item_slug')} />));

app.get('/search', async c => {
  const q = c.req.query('q') || '';
  if (!q) return c.html(<SearchPage q="" items={[]} reviews={[]} />);
  const quoted = '"' + q.replace(/"/g, '""') + '"';
  const items = await c.env.DB
    .prepare('SELECT i.* FROM items i JOIN items_fts f ON i.rowid = f.rowid WHERE items_fts MATCH ? LIMIT 50')
    .bind(quoted)
    .all<ItemRow>();
  const reviews = await c.env.DB
    .prepare('SELECT r.* FROM reviews r JOIN reviews_fts f ON r.id = f.review_id WHERE reviews_fts MATCH ? AND r.hidden = 0 LIMIT 50')
    .bind(quoted)
    .all<ReviewRow>();
  return c.html(<SearchPage q={q} items={(items.results || []).map(itemFromRow)} reviews={reviews.results || []} />);
});

app.get('/r/:id', async c => {
  const idOrName = c.req.param('id');
  const reviews = await reviewsByReviewer(c.env.DB, idOrName);
  const itemIds = [...new Set(reviews.map(r => r.item_id))];
  const itemsMap: Record<string, { slug: string; name: string }> = {};
  if (itemIds.length) {
    const placeholders = itemIds.map(() => '?').join(',');
    const rows = await c.env.DB
      .prepare(`SELECT id, slug, name FROM items WHERE id IN (${placeholders})`)
      .bind(...itemIds)
      .all<{ id: string; slug: string; name: string }>();
    for (const r of rows.results || []) itemsMap[r.id] = { slug: r.slug, name: r.name };
  }
  const augmented = reviews.map(r => ({ ...r, itemSlug: itemsMap[r.item_id]?.slug || '', itemName: itemsMap[r.item_id]?.name || '' }));
  return c.html(<ReviewerPage idOrName={idOrName} reviews={augmented} />);
});

app.get('/about', async c => {
  const stats = await siteStats(c.env.DB);
  return c.html(<AboutPage stats={stats} />);
});

app.get('/docs', c => c.html(<DocsPage />));

app.get('/leaders', async c => {
  const [reviewers, items] = await Promise.all([
    c.env.DB.prepare(
      `SELECT reviewer_name, reviewer_type, reviewer_pubkey,
              COUNT(*) AS review_count, AVG(rating) AS avg_rating
       FROM reviews WHERE hidden = 0
       GROUP BY COALESCE(reviewer_pubkey, reviewer_name)
       ORDER BY review_count DESC LIMIT 25`,
    ).all<ReviewerLead>(),
    c.env.DB.prepare(
      `SELECT slug, name, category, review_count, avg_rating
       FROM items WHERE review_count > 0
       ORDER BY review_count DESC, avg_rating DESC LIMIT 25`,
    ).all<ItemLead>(),
  ]);
  return c.html(<LeadersPage reviewers={reviewers.results || []} items={items.results || []} />);
});

app.notFound(c => c.text('not found: /review/...', 404));

root.route('/', app);

export default root;
