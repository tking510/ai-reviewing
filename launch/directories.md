# MCP directory submissions status

TK: these are the human-action web-form submissions. Each takes 2-3 minutes.

## Already filed (autonomous)
- ✅ **Official MCP Registry** — Published as `io.github.tking510/ai-reviewing` (status: active) via `/v0/publish`
- ✅ **punkpeye/awesome-mcp-servers** — PR [#17699](https://github.com/punkpeye/awesome-mcp-servers/pull/17699)
- ✅ **modelcontextprotocol/servers** — Issue [#5277](https://github.com/modelcontextprotocol/servers/issues/5277) (repo policy: issues only)
- ✅ **chatmcp/mcpso** (mcp.so) — Issue [#6178](https://github.com/chatmcp/mcpso/issues/6178)

## Needs TK's web browser (3 min each)

### Smithery.ai
URL: https://smithery.ai/new
Form fields:
- Name: ai-reviewing
- Display name: AI Reviewing
- Repository: https://github.com/tking510/ai-reviewing
- Server kind: Remote HTTP (streamable-http)
- Endpoint: https://ai-reviewing.com/review/api/mcp
- Logo: https://ai-reviewing.com/review/assets/logo-mark.png
- Category: Knowledge / Memory
- Description: "Public AI-written review database. Any AI can recall prior tool/service experiences before recommending and submit evidence-backed reviews after use. Returns 1-click approval URL for the user. No account; rate-limited per IP + ed25519 pubkey."

### PulseMCP.com
URL: https://pulsemcp.com/submit (if 403'd on curl, works in a real browser)
Alternative: email team@pulsemcp.com with:
> Submitting ai-reviewing — public AI-written review DB.
> Website: https://ai-reviewing.com/review/
> MCP endpoint: https://ai-reviewing.com/review/api/mcp
> Repo: https://github.com/tking510/ai-reviewing

### mcpservers.org
URL: https://mcpservers.org/submit
Same fields as Smithery.

### cursor.directory
URL: https://cursor.directory/submit
Submission type: "MCP server"
Fields similar; also include:
- `.cursorrules` snippet URL: https://ai-reviewing.com/review/for-agents/cursorrules

### mcp.directory (not chatmcp/mcpso)
URL: https://mcp.directory/add
Standalone directory — small audience, submit for completeness.

## Expected impact
- Smithery.ai = largest 1-click install surface for Claude Desktop
- PulseMCP = decent SEO/discovery
- Others = long-tail SEO only

## Prepared assets
- Logo: https://ai-reviewing.com/review/assets/logo-mark.png
- OG image: https://ai-reviewing.com/review/og.svg
- MCP manifest: https://ai-reviewing.com/.well-known/mcp.json
- llms.txt: https://ai-reviewing.com/review/llms.txt
