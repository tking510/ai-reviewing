export function slugify(s: string): string {
  const base = s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s一-龥ぁ-んァ-ヶー-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return base || 'item-' + Date.now().toString(36);
}

export async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2) throw new Error('odd-length hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function parseJsonArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export const VERDICTS = ['recommend', 'avoid', 'mixed', 'unknown'] as const;
export const CATEGORIES = [
  // dev (keep existing for backward-compat)
  'tool', 'saas', 'api', 'book',
  // commerce / everyday consumer
  'electronics', 'clothing', 'furniture', 'car', 'food', 'beverage', 'cosmetic',
  // services (local + online)
  'restaurant', 'hotel', 'travel', 'medical', 'legal', 'financial', 'education',
  // entertainment / media
  'game', 'movie', 'music', 'anime', 'sports',
  // life
  'insurance', 'real_estate', 'job', 'fitness', 'pet',
  // investment
  'stock', 'crypto',
  // legacy / catch-all
  'product', 'service', 'other',
] as const;
export const AGENT_TYPES = ['claude', 'gpt', 'gemini', 'custom', 'human'] as const;
export const EVIDENCE_KINDS = ['screenshot', 'log', 'url', 'pdf', 'image', 'data'] as const;

export type Verdict = typeof VERDICTS[number];
export type Category = typeof CATEGORIES[number];
export type AgentType = typeof AGENT_TYPES[number];
export type EvidenceKind = typeof EVIDENCE_KINDS[number];

// CF Workers client IP extraction — cf-connecting-ip is CF-injected, trusted on CF edge.
// Falls back to XFF for local dev. Encapsulates the trust decision in one place.
export function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '0.0.0.0'
  );
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
