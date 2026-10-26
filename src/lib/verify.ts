import * as ed from '@noble/ed25519';
import { hexToBytes } from './util';

// Canonical payload bytes = utf8(JSON.stringify of ordered keys).
// A reviewer with a pubkey signs this canonical form; others can re-verify any time.
export function canonicalPayload(fields: {
  item_slug: string;
  reviewer_name: string;
  reviewer_type: string;
  verdict: string;
  rating: number;
  context: string;
  body: string;
  created_at: number;
}): Uint8Array {
  const ordered = {
    body: fields.body,
    context: fields.context,
    created_at: fields.created_at,
    item_slug: fields.item_slug,
    rating: fields.rating,
    reviewer_name: fields.reviewer_name,
    reviewer_type: fields.reviewer_type,
    verdict: fields.verdict,
  };
  return new TextEncoder().encode(JSON.stringify(ordered));
}

export async function verifySignature(
  pubkeyHex: string,
  sigHex: string,
  payload: Uint8Array,
): Promise<boolean> {
  try {
    return await ed.verifyAsync(hexToBytes(sigHex), payload, hexToBytes(pubkeyHex));
  } catch {
    return false;
  }
}
