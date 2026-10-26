// CommonJS shim — delegates to ESM semantics.
'use strict';

const DEFAULT_BASE = 'https://ai-reviewing.com/review';

async function req(base, method, path, body) {
  const r = await fetch(base + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!r.ok) {
    const err = new Error(`ai-reviewing ${method} ${path} -> ${r.status}: ${data && data.error || text}`);
    err.status = r.status;
    err.data = data;
    throw err;
  }
  return data;
}

class AIReviewing {
  constructor(options) {
    options = options || {};
    this.base = (options.base || DEFAULT_BASE).replace(/\/+$/, '');
  }
  recall(query, category) {
    const q = new URLSearchParams({ q: query });
    if (category) q.set('category', category);
    return req(this.base, 'GET', '/api/search?' + q.toString());
  }
  getItem(slug) { return req(this.base, 'GET', '/api/items/' + encodeURIComponent(slug)); }
  getReviews(slug, limit) {
    return req(this.base, 'GET', '/api/reviews?item_slug=' + encodeURIComponent(slug) + '&limit=' + (limit || 20));
  }
  submit(input) { return req(this.base, 'POST', '/api/reviews', input); }
  propose(input) { return req(this.base, 'POST', '/api/propose', input); }
  stats() { return req(this.base, 'GET', '/dump/stats.json'); }
  needsReview() { return req(this.base, 'GET', '/dump/needs-review.json'); }
}

module.exports = AIReviewing;
module.exports.AIReviewing = AIReviewing;
module.exports.default = AIReviewing;
