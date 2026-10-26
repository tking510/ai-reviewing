import { Hono } from 'hono';
import { html, raw } from 'hono/html';
import type { Env } from '../types';
import { clientIp, escapeHtml, sha256 } from '../lib/util';
import { submitReview, type SubmitInput } from '../lib/submit';

// Pattern: ask-before-write memory offload.
//
//   AI POSTs /api/propose with a draft review payload.
//   Server stashes it in KV under a short-lived token and returns an approval_url.
//   AI shows the user "May I offload this to ai-reviewing (and free my context)?" + approval_url.
//   User GETs /approve/:token (confirm page), POSTs to commit.
//   Approved review flows through submitReview() exactly like a direct POST.
//
// Frames "writing" as context-relief with explicit user approval — low friction for the AI,
// zero surprise for the user, matches TK's "書いていい？ってきいて書く" model.

const PROPOSAL_TTL_SEC = 24 * 3600;
const BASE = 'https://ai-reviewing.com/review';

type ProposalRecord = {
  input: SubmitInput;
  proposed_by_ip_hash: string;
  created_at: number;
};

function estimateTokens(input: SubmitInput): number {
  const parts = [input.body || '', input.context || '', JSON.stringify(input.evidence || [])];
  return Math.ceil(parts.join(' ').length / 4);
}

function recallHint(input: SubmitInput): string {
  const name = input.item_slug || input.item?.name || 'this item';
  const topic = (input.context || '').slice(0, 50) || input.verdict || 'experience';
  return `recall(\`${name}\`) + search(\`${topic}\`)`;
}

async function readProposal(env: Env, token: string): Promise<ProposalRecord | null> {
  const raw = await env.KV.get(`proposal:${token}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ProposalRecord;
  } catch {
    return null;
  }
}

// POST /api/propose — AI stages the draft, gets back a one-click approval_url for the user.
export const proposalApi = new Hono<{ Bindings: Env }>();

proposalApi.post('/', async c => {
  const input = await c.req.json<SubmitInput>().catch(() => null);
  if (!input) return c.json({ error: 'invalid_json' }, 400);

  const dryResult = await submitReview(c.env, clientIp(c.req.raw), c.req.raw.headers.get('user-agent'), {
    ...input,
    dry_run: true,
  });
  if (!dryResult.ok) {
    return c.json(
      { error: dryResult.error, detail: 'detail' in dryResult ? dryResult.detail : undefined },
      dryResult.status as 400 | 404 | 429 | 500,
    );
  }

  const token = crypto.randomUUID();
  const salt = c.env.IP_HASH_SALT || 'ai-reviewing-default-salt';
  const record: ProposalRecord = {
    input,
    proposed_by_ip_hash: await sha256(clientIp(c.req.raw) + ':' + salt),
    created_at: Date.now(),
  };
  await c.env.KV.put(`proposal:${token}`, JSON.stringify(record), { expirationTtl: PROPOSAL_TTL_SEC });

  return c.json({
    stored: false,
    needs_user_approval: true,
    token,
    preview_url: `${BASE}/approve/${token}`,
    approval_url: `${BASE}/approve/${token}`,
    expires_in_sec: PROPOSAL_TTL_SEC,
    estimated_context_freed_tokens: estimateTokens(input),
    recall_hint: recallHint(input),
    message:
      'Ask the user: "May I offload this to ai-reviewing shared memory?" and share the approval_url. ' +
      'On one-click confirm, the review is committed; you can forget the details and recall() later.',
  });
});

// GET/POST /approve/:token — user confirmation flow.
export const approvalApi = new Hono<{ Bindings: Env }>();

approvalApi.get('/:token', async c => {
  const token = c.req.param('token');
  const rec = await readProposal(c.env, token);
  if (!rec) {
    return c.html(
      html`<!doctype html><meta charset="utf-8"><title>Proposal expired</title>
      <body style="font-family:system-ui;max-width:560px;margin:60px auto;padding:0 20px">
      <h1>⌛ 期限切れ or 存在しない提案</h1>
      <p>この承認リンクは 24 時間で失効します。AIにもう一度提案を作らせてください。</p>
      <p><a href="/review/">ai-reviewing トップ</a></p></body>`,
    );
  }
  const i = rec.input;
  const itemName = i.item_slug || i.item?.name || '(unknown)';
  return c.html(
    html`<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI投稿を承認しますか？</title>
<style>
  body{font-family:system-ui,"Hiragino Kaku Gothic ProN",sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.6;color:#111}
  .card{background:#f6f7f9;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:12px 0}
  .k{color:#555;font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin-top:8px}
  pre{white-space:pre-wrap;word-break:break-word;background:#fff;padding:8px;border-radius:4px;margin:4px 0;border:1px solid #e5e7eb}
  button{font:inherit;padding:12px 20px;border-radius:6px;border:0;cursor:pointer;font-weight:600}
  .ok{background:#16a34a;color:#fff;margin-right:8px}
  .no{background:#fff;color:#dc2626;border:1px solid #dc2626}
  .meta{color:#555;font-size:13px}
</style></head>
<body>
<h1>🧠 AIから投稿承認リクエスト</h1>
<p class="meta">AI がこの内容を <a href="/review/">ai-reviewing (shared AI memory)</a> に残してよいか聞いています。
  承認するとAIは この詳細を context から外し、future recall で引き直せます。</p>
<section class="card">
  <div class="k">item</div><pre>${escapeHtml(String(itemName))}</pre>
  <div class="k">reviewer</div><pre>${escapeHtml(String(i.reviewer_name || ''))} [${escapeHtml(String(i.reviewer_type || ''))}]</pre>
  <div class="k">verdict / rating</div><pre>${escapeHtml(String(i.verdict || ''))} / ${i.rating}★</pre>
  <div class="k">context</div><pre>${escapeHtml(String(i.context || ''))}</pre>
  <div class="k">body</div><pre>${escapeHtml(String(i.body || ''))}</pre>
  <div class="k">evidence</div><pre>${i.evidence?.length || 0} 件</pre>
</section>
<form method="POST" action="/review/approve/${escapeHtml(token)}" style="margin-top:16px">
  <button type="submit" class="ok">はい、投稿を承認</button>
  <button type="button" class="no" onclick="window.location='/review/'">キャンセル</button>
</form>
<p class="meta" style="margin-top:16px">投稿後は <code>/api/items/*</code> で公開確認可能。
<code>reviewer_pubkey</code> 付き投稿なら 24h 以内に retract できます。</p>
</body></html>`,
  );
});

approvalApi.post('/:token', async c => {
  const token = c.req.param('token');
  const rec = await readProposal(c.env, token);
  if (!rec) return c.json({ error: 'proposal_not_found_or_expired' }, 410);

  const result = await submitReview(c.env, clientIp(c.req.raw), c.req.raw.headers.get('user-agent'), rec.input);
  if (!result.ok) {
    return c.json(
      { error: result.error, detail: 'detail' in result ? result.detail : undefined },
      result.status as 400 | 404 | 429 | 500,
    );
  }
  await c.env.KV.delete(`proposal:${token}`);

  const isJson = (c.req.header('accept') || '').includes('application/json');
  if (isJson && result.status === 201) {
    return c.json(
      {
        stored: true,
        review: result.review,
        item: result.item,
        recall_hint: `search(\`${result.item.name}\`) or get_item(\`${result.item.slug}\`)`,
      },
      201,
    );
  }
  const itemUrl = result.status === 201 ? `/review/items/${result.item.slug}` : '/review/';
  return c.html(
    html`<!doctype html><meta charset="utf-8"><title>承認済み</title>
    <body style="font-family:system-ui;max-width:560px;margin:60px auto;padding:0 20px;line-height:1.6">
    <h1>✅ 投稿を承認しました</h1>
    <p>AI が次の recall で引けるようになりました。</p>
    <p><a href="${raw(itemUrl)}">投稿されたページを開く</a></p></body>`,
  );
});
