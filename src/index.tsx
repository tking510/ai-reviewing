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
import { previewApi } from './routes/preview';
import { dumpApi } from './routes/dump';
import { wellKnownApi } from './routes/wellknown';
import type { ItemRow, ReviewRow, EvidenceRow } from './lib/db';
import { itemFromRow } from './lib/db';
import { CATEGORIES } from './lib/util';
import { HomePage, ItemsPage, ItemDetailPage, SubmitPage, SearchPage, AboutPage, DocsPage } from './views/pages';

// Root-level app so we can serve /.well-known/* AND /review/* from one worker.
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

// Root serves well-known manifests
root.route('/.well-known', wellKnownApi);

const app = new Hono<{ Bindings: Env }>({ strict: false }).basePath('/review');

// ----- Discovery (served at /review/*) -----
app.route('/', discoveryApi);

// ----- API -----
app.route('/api/items', itemsApi);
app.route('/api/reviews', reviewsApi);
app.route('/api/evidence', evidenceApi);
app.route('/api/search', searchApi);
app.route('/api/reports', reportsApi);
app.route('/api/retract', retractApi);
app.route('/api/preview', previewApi);
app.route('/api/mcp', mcpApi);
app.route('/dump', dumpApi);

// ----- HTML pages -----
app.get('/', async c => {
  const rows = await c.env.DB.prepare('SELECT * FROM items ORDER BY updated_at DESC LIMIT 12').all<ItemRow>();
  return c.html(<HomePage items={(rows.results || []).map(itemFromRow)} />);
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
  const rows = await c.env.DB.prepare(sql).bind(...binds).all<ItemRow>();
  return c.html(<ItemsPage items={(rows.results || []).map(itemFromRow)} category={category} sort={sort} />);
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
  return c.html(<ItemDetailPage item={itemFromRow(item)} reviews={combined} />);
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

app.get('/about', c => c.html(<AboutPage />));
app.get('/docs', c => c.html(<DocsPage />));

app.notFound(c => c.text('not found: /review/...', 404));

root.route('/', app);

export default root;
