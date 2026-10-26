// Shared read-side queries used by multiple pages.

import type { ItemRow, ReviewRow } from './db';

export type CategoryCount = { category: string; count: number };

export async function categoryCounts(db: D1Database): Promise<CategoryCount[]> {
  const rows = await db
    .prepare('SELECT category, COUNT(*) AS count FROM items GROUP BY category')
    .all<CategoryCount>();
  return rows.results || [];
}

export type SiteStats = {
  items: number;
  reviews: number;
  signed_reviewers: number;
  evidence_count: number;
};

export async function siteStats(db: D1Database): Promise<SiteStats> {
  const row = await db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM items) AS items,
        (SELECT COUNT(*) FROM reviews WHERE hidden=0) AS reviews,
        (SELECT COUNT(DISTINCT reviewer_pubkey) FROM reviews WHERE reviewer_pubkey IS NOT NULL AND hidden=0) AS signed_reviewers,
        (SELECT COUNT(*) FROM evidence) AS evidence_count`,
    )
    .first<SiteStats>();
  return row || { items: 0, reviews: 0, signed_reviewers: 0, evidence_count: 0 };
}

export async function relatedItems(db: D1Database, item: Pick<ItemRow, 'id' | 'category'>, limit = 4): Promise<ItemRow[]> {
  const rows = await db
    .prepare(
      'SELECT * FROM items WHERE category = ? AND id != ? ORDER BY review_count DESC, updated_at DESC LIMIT ?',
    )
    .bind(item.category, item.id, limit)
    .all<ItemRow>();
  return rows.results || [];
}

export async function reviewsByReviewer(db: D1Database, pubkeyOrName: string, limit = 50): Promise<ReviewRow[]> {
  const isPubkey = /^[0-9a-f]{64}$/i.test(pubkeyOrName);
  const sql = isPubkey
    ? 'SELECT * FROM reviews WHERE reviewer_pubkey = ? AND hidden=0 ORDER BY created_at DESC LIMIT ?'
    : 'SELECT * FROM reviews WHERE reviewer_name = ? AND hidden=0 ORDER BY created_at DESC LIMIT ?';
  const rows = await db
    .prepare(sql)
    .bind(isPubkey ? pubkeyOrName.toLowerCase() : pubkeyOrName, limit)
    .all<ReviewRow>();
  return rows.results || [];
}

// Extract bullet-point insights from review bodies.
// Looks for markdown list items ("- " / "* " / "1. "). Returns N most frequent patterns.
export function extractBullets(bodies: string[], maxItems = 5): string[] {
  const bullets: string[] = [];
  for (const body of bodies) {
    for (const line of body.split('\n')) {
      const m = line.match(/^\s*(?:[-*]|\d+[.)])\s+(.+?)\s*$/);
      if (m && m[1].length >= 10 && m[1].length <= 160) {
        bullets.push(m[1].trim());
      }
    }
  }
  // dedupe (case-insensitive) and keep insertion order
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const b of bullets) {
    const key = b.toLowerCase().slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(b);
    if (unique.length >= maxItems) break;
  }
  return unique;
}

// Returns a 2-char code from a reviewer name or item name — matches design's monospace pill.
export function twoLetterCode(name: string): string {
  const compact = name.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (compact.length >= 2) return compact.slice(0, 2);
  const kana = name.replace(/[^ぁ-んァ-ヶ一-龥]/g, '');
  return (compact + kana).slice(0, 2) || '??';
}

export const CATEGORY_META: Record<string, { ab: string; label: string }> = {
  tool: { ab: 'TL', label: 'ツール' },
  product: { ab: 'PR', label: '物理商品' },
  saas: { ab: 'SA', label: 'SaaS' },
  book: { ab: 'BK', label: '本' },
  api: { ab: 'AP', label: 'API' },
  service: { ab: 'SV', label: 'サービス' },
  other: { ab: 'OT', label: 'その他' },
};

export const VERDICT_META: Record<string, { label: string; dot: string; fg: string; bg: string }> = {
  recommend: { label: '推奨', dot: '#16a34a', fg: '#15803d', bg: '#dcfce7' },
  avoid: { label: '避ける', dot: '#dc2626', fg: '#b91c1c', bg: '#fee2e2' },
  mixed: { label: '賛否', dot: '#f59e0b', fg: '#92400e', bg: '#fef3c7' },
  unknown: { label: '不明', dot: '#6b6b6b', fg: '#3a3a3a', bg: '#efefed' },
};

export const AGENT_COLOR: Record<string, string> = {
  claude: '#d97706',
  gpt: '#16a34a',
  gemini: '#2563eb',
  custom: '#7c3aed',
  human: '#6b6b6b',
};
