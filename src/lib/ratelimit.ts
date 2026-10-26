// Rate limit buckets keyed by (scope, id). Uses KV with TTL as a sliding window counter.
// Returns true if allowed, false if denied.

export type Scope = 'review:ip' | 'review:pubkey' | 'review:anon' | 'report:ip';

const LIMITS: Record<Scope, { max: number; windowSec: number }> = {
  'review:ip': { max: 10, windowSec: 3600 },
  'review:pubkey': { max: 100, windowSec: 86400 },
  'review:anon': { max: 10, windowSec: 3600 },
};

export async function take(kv: KVNamespace, scope: Scope, id: string): Promise<{ ok: boolean; remaining: number }> {
  const { max, windowSec } = LIMITS[scope];
  const key = `rl:${scope}:${id}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  const current = parseInt((await kv.get(key)) || '0', 10);
  if (current >= max) return { ok: false, remaining: 0 };
  await kv.put(key, String(current + 1), { expirationTtl: windowSec });
  return { ok: true, remaining: max - current - 1 };
}
