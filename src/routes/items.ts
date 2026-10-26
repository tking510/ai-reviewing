import { Hono } from 'hono';
import type { Env } from '../types';
import { CATEGORIES, slugify } from '../lib/util';
import { itemFromRow, type ItemRow, findItemByNameOrSlug } from '../lib/db';

export const itemsApi = new Hono<{ Bindings: Env }>();

itemsApi.get('/', async c => {
  const url = new URL(c.req.url);
  const category = url.searchParams.get('category');
  const sort = url.searchParams.get('sort') || 'reviews'; // reviews|rating|recent|name
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

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

  const sql = `SELECT * FROM items ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${sortSql} LIMIT ? OFFSET ?`;
  binds.push(limit, offset);
  const rows = await c.env.DB.prepare(sql).bind(...binds).all<ItemRow>();
  return c.json({
    items: (rows.results || []).map(itemFromRow),
    limit,
    offset,
  });
});

itemsApi.get('/:slug', async c => {
  const slug = c.req.param('slug');
  const row = await c.env.DB.prepare('SELECT * FROM items WHERE slug = ?').bind(slug).first<ItemRow>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({ item: itemFromRow(row) });
});

itemsApi.post('/', async c => {
  const body = await c.req.json<{
    name?: string;
    category?: string;
    official_url?: string;
    description?: string;
    image_url?: string;
    aliases?: string[];
  }>();
  if (!body.name || typeof body.name !== 'string' || body.name.length < 2) {
    return c.json({ error: 'name_required' }, 400);
  }
  if (!body.category || !(CATEGORIES as readonly string[]).includes(body.category)) {
    return c.json({ error: 'invalid_category', allowed: CATEGORIES }, 400);
  }

  const existing = await findItemByNameOrSlug(c.env.DB, body.name);
  if (existing) return c.json({ item: itemFromRow(existing), existed: true });

  const id = crypto.randomUUID();
  let slug = slugify(body.name);
  // dedupe slug
  const bump = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM items WHERE slug LIKE ?')
    .bind(`${slug}%`)
    .first<{ n: number }>();
  if ((bump?.n ?? 0) > 0) slug = `${slug}-${(bump!.n ?? 0) + 1}`;

  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO items (id, slug, name, category, official_url, description, image_url, aliases, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      slug,
      body.name.trim(),
      body.category,
      body.official_url || null,
      body.description || null,
      body.image_url || null,
      JSON.stringify(Array.isArray(body.aliases) ? body.aliases : []),
      now,
      now,
    )
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<ItemRow>();
  return c.json({ item: itemFromRow(row!), existed: false }, 201);
});
