import type { Category, Verdict, AgentType, EvidenceKind } from './util';
import { parseJsonArray, slugify } from './util';

export type ItemRow = {
  id: string;
  slug: string;
  name: string;
  category: Category;
  official_url: string | null;
  description: string | null;
  image_url: string | null;
  aliases: string;
  created_at: number;
  updated_at: number;
  review_count: number;
  avg_rating: number | null;
  recommend_count: number;
  avoid_count: number;
  mixed_count: number;
  unknown_count: number;
  location: string | null;
  lat: number | null;
  lng: number | null;
  price_tier: string | null;
  use_case_tags: string;
  subcategory: string | null;
};

export type Item = Omit<ItemRow, 'aliases' | 'use_case_tags'> & { aliases: string[]; use_case_tags: string[] };

export function itemFromRow(r: ItemRow): Item {
  return { ...r, aliases: parseJsonArray(r.aliases), use_case_tags: parseJsonArray(r.use_case_tags) };
}

export type ReviewRow = {
  id: string;
  item_id: string;
  reviewer_name: string;
  reviewer_type: AgentType;
  reviewer_pubkey: string | null;
  verdict: Verdict;
  rating: number;
  context: string;
  body: string;
  signature: string | null;
  ip_hash: string;
  user_agent: string | null;
  created_at: number;
  report_count: number;
  hidden: number;
};

export type EvidenceRow = {
  id: string;
  review_id: string;
  kind: EvidenceKind;
  r2_key: string | null;
  url: string | null;
  caption: string | null;
  mime: string | null;
  size_bytes: number | null;
  created_at: number;
};

// Resolve an input name+category to an existing item (prefer exact slug/name/alias match) or null.
export async function findItemByNameOrSlug(
  db: D1Database,
  nameOrSlug: string,
): Promise<ItemRow | null> {
  const slug = slugify(nameOrSlug);
  const bySlug = await db
    .prepare('SELECT * FROM items WHERE slug = ?')
    .bind(slug)
    .first<ItemRow>();
  if (bySlug) return bySlug;
  const byName = await db
    .prepare('SELECT * FROM items WHERE lower(name) = lower(?)')
    .bind(nameOrSlug)
    .first<ItemRow>();
  if (byName) return byName;
  // alias match: scan recent items (bounded cost)
  const rows = await db
    .prepare('SELECT * FROM items WHERE aliases LIKE ? LIMIT 50')
    .bind(`%${nameOrSlug.toLowerCase()}%`)
    .all<ItemRow>();
  const needle = nameOrSlug.toLowerCase();
  for (const r of rows.results || []) {
    const aliases = parseJsonArray(r.aliases).map(a => a.toLowerCase());
    if (aliases.includes(needle)) return r;
  }
  return null;
}

// Recompute aggregate counters for an item after a review insert/hide/unhide.
export async function recomputeItemAggregates(db: D1Database, itemId: string): Promise<void> {
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) AS c,
         AVG(rating) AS avg,
         SUM(CASE WHEN verdict='recommend' THEN 1 ELSE 0 END) AS rc,
         SUM(CASE WHEN verdict='avoid'     THEN 1 ELSE 0 END) AS ac,
         SUM(CASE WHEN verdict='mixed'     THEN 1 ELSE 0 END) AS mc,
         SUM(CASE WHEN verdict='unknown'   THEN 1 ELSE 0 END) AS uc
       FROM reviews WHERE item_id = ? AND hidden = 0`,
    )
    .bind(itemId)
    .first<{ c: number; avg: number | null; rc: number; ac: number; mc: number; uc: number }>();
  const now = Date.now();
  await db
    .prepare(
      `UPDATE items SET
        review_count = ?,
        avg_rating = ?,
        recommend_count = ?,
        avoid_count = ?,
        mixed_count = ?,
        unknown_count = ?,
        updated_at = ?
      WHERE id = ?`,
    )
    .bind(row?.c ?? 0, row?.avg ?? null, row?.rc ?? 0, row?.ac ?? 0, row?.mc ?? 0, row?.uc ?? 0, now, itemId)
    .run();
}
