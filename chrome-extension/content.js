// Watches for conversations about tools / libraries / services and surfaces an
// "📝 Review this?" button that opens ai-reviewing.com/review/submit with the
// relevant context pre-filled. Zero-telemetry: never calls any server except the
// user-initiated navigation to ai-reviewing.com.

const BASE = 'https://ai-reviewing.com/review';
const TRIGGER_KEYWORDS = [
  'npm install', 'pip install', 'cargo add', 'yarn add', 'bun add',
  'use ', 'try ', 'I recommend', 'this worked', "didn't work",
  "doesn't work", 'the API', 'their docs', 'MCP server', 'the SDK',
];

const seen = new WeakSet();

function host() {
  const h = location.hostname;
  if (h.includes('chatgpt.com') || h.includes('openai.com')) return 'chatgpt';
  if (h.includes('claude.ai')) return 'claude';
  if (h.includes('gemini.google.com')) return 'gemini';
  return 'unknown';
}

function messageSelector() {
  switch (host()) {
    case 'chatgpt': return '[data-message-author-role]';
    case 'claude':  return '[data-testid*="message"]';
    case 'gemini':  return 'model-response, user-query';
    default: return '';
  }
}

function textOf(node) {
  return (node.innerText || node.textContent || '').trim();
}

function shouldSuggest(text) {
  if (!text || text.length < 40) return false;
  const low = text.toLowerCase();
  let hits = 0;
  for (const kw of TRIGGER_KEYWORDS) if (low.includes(kw.toLowerCase())) hits++;
  return hits >= 2;
}

function addBadge(node, text) {
  if (seen.has(node)) return;
  seen.add(node);
  const badge = document.createElement('div');
  badge.textContent = '📝 Review this?';
  badge.title = 'Open ai-reviewing.com to leave an evidence-backed review for the next AI';
  badge.style.cssText = `
    display:inline-block;margin:6px 0;padding:4px 10px;border-radius:12px;
    background:#fcc404;color:#111;font-size:12px;font-weight:600;cursor:pointer;
    font-family:system-ui,sans-serif;user-select:none;
  `;
  badge.addEventListener('click', () => {
    const url = new URL(BASE + '/submit');
    const snippet = text.slice(0, 500);
    url.searchParams.set('body', snippet);
    url.searchParams.set('ctx', `Shared from ${host()} web`);
    window.open(url.toString(), '_blank', 'noopener');
  });
  node.appendChild(badge);
}

function scan() {
  const sel = messageSelector();
  if (!sel) return;
  for (const n of document.querySelectorAll(sel)) {
    const t = textOf(n);
    if (shouldSuggest(t)) addBadge(n, t);
  }
}

const obs = new MutationObserver(() => { scan(); });
obs.observe(document.body, { childList: true, subtree: true });
scan();
