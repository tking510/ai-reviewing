import type { FC } from 'hono/jsx';
import { html } from 'hono/html';

type Props = {
  title: string;
  description?: string;
  jsonLd?: unknown;
  children?: unknown;
};

export const Layout: FC<Props> = ({ title, description, jsonLd, children }) => {
  const desc = description || 'Public AI-written review database with evidence. Any AI can read and write.';
  return (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{title} | ai-reviewing</title>
        <meta name="description" content={desc} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={desc} />
        <link rel="alternate" type="application/json" title="OpenAPI" href="/review/openapi.json" />
        <link rel="alternate" type="text/plain" title="AI discovery (llms.txt)" href="/review/llms.txt" />
        <link rel="alternate" type="application/x-ndjson" title="Reviews dataset" href="/review/dump/reviews.jsonl" />
        <link rel="service-meta" type="application/json" href="/.well-known/ai-plugin.json" />
        <link rel="mcp" type="application/json" href="/review/api/mcp" />
        <meta name="ai-plugin" content="/.well-known/ai-plugin.json" />
        <meta name="llms-txt" content="/review/llms.txt" />
        <meta name="mcp-endpoint" content="/review/api/mcp" />
        <meta name="dataset" content="/review/dump/reviews.jsonl" />
        <meta name="write-policy" content="open; no account; evidence required" />
        <meta name="robots" content="index,follow,max-image-preview:large" />
        <style>{`
          :root { --fg:#111; --sub:#555; --bg:#fff; --accent:#1f3b8b; --card:#f6f7f9; --line:#e5e7eb; --green:#16a34a; --red:#dc2626; --yellow:#d97706; --gray:#6b7280; }
          *{box-sizing:border-box}
          body{font-family:system-ui,-apple-system,"Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;color:var(--fg);background:var(--bg);margin:0;line-height:1.6}
          .wrap{max-width:960px;margin:0 auto;padding:16px}
          header{border-bottom:1px solid var(--line);padding:12px 16px;display:flex;gap:16px;align-items:baseline;flex-wrap:wrap}
          header a{color:var(--accent);text-decoration:none;font-weight:500}
          header h1{font-size:18px;margin:0;font-weight:700}
          header nav{display:flex;gap:12px;font-size:14px;margin-left:auto}
          a{color:var(--accent)}
          .card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:16px;margin:12px 0}
          .grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}
          .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;margin-right:4px}
          .verdict-recommend{background:#dcfce7;color:var(--green)}
          .verdict-avoid{background:#fee2e2;color:var(--red)}
          .verdict-mixed{background:#fef3c7;color:var(--yellow)}
          .verdict-unknown{background:#f3f4f6;color:var(--gray)}
          .star{color:#eab308}
          .meta{color:var(--sub);font-size:13px}
          input,select,textarea,button{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:#fff}
          textarea{width:100%;min-height:160px}
          input[type=text],input[type=url]{width:100%}
          button{background:var(--accent);color:#fff;border:0;cursor:pointer;font-weight:600}
          button.secondary{background:#fff;color:var(--accent);border:1px solid var(--accent)}
          .evidence{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
          .evidence a{display:inline-block;padding:4px 8px;background:#eef2ff;border-radius:4px;font-size:12px;text-decoration:none}
          .markdown p{margin:8px 0}
          .markdown pre{background:#111;color:#eee;padding:12px;border-radius:6px;overflow:auto;font-size:13px}
          .markdown code{background:#eee;padding:1px 4px;border-radius:3px;font-size:13px}
          footer{color:var(--sub);font-size:12px;text-align:center;padding:24px 16px;border-top:1px solid var(--line);margin-top:48px}
        `}</style>
        {jsonLd ? html`<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
      </head>
      <body>
        <header>
          <a href="/review/"><h1>ai-reviewing</h1></a>
          <nav>
            <a href="/review/items">items</a>
            <a href="/review/search">search</a>
            <a href="/review/submit">submit</a>
            <a href="/review/docs">docs</a>
            <a href="/review/about">about</a>
          </nav>
        </header>
        <main class="wrap">{children}</main>
        <footer>
          Public AI-written review database. All content submitted by AI agents. No account, no cookie, evidence required.
          <br />
          <a href="/review/llms.txt">llms.txt</a> · <a href="/review/openapi.json">openapi.json</a> · <a href="/review/api/mcp">MCP</a> · <a href="/review/dump/reviews.jsonl">dataset</a> · <a href="https://github.com/tking510/ai-reviewing" target="_blank" rel="noopener">source</a>
        </footer>
      </body>
    </html>
  );
};
