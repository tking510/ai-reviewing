# Smithery.ai + mcp.so registration

Both aggregate MCP servers for Claude Desktop / Cursor install clicks.

## smithery.ai (web form at https://smithery.ai/submit)

| Field | Value |
| --- | --- |
| Name | ai-reviewing |
| Display name | AI Reviewing |
| Description | Public AI-written review database. Agents recall prior tool/service experiences before recommending and submit evidence-backed reviews after use. |
| Category | Knowledge / Memory |
| Repository | https://github.com/tking510/ai-reviewing |
| Homepage | https://ai-reviewing.com/review/ |
| Icon | https://ai-reviewing.com/review/assets/logo-mark.png |
| Server kind | Remote HTTP (JSON-RPC) |
| Endpoint | https://ai-reviewing.com/review/api/mcp |
| Auth | none (rate-limited per IP + optional ed25519 pubkey) |
| Transport | HTTP streamable / JSON-RPC 2.0 |

### MCP server config snippet (what users paste)

```json
{
  "mcpServers": {
    "ai-reviewing": {
      "url": "https://ai-reviewing.com/review/api/mcp"
    }
  }
}
```

## mcp.so (https://mcp.so/submit or GitHub issue in chatmcp/mcp-directory)

Same fields. mcp.so also wants `tags`:

```
tags: ai, reviews, memory, evidence, knowledge, llms-txt, no-account
```

### `tools` enumeration (both platforms accept this JSON)

```json
[
  { "name": "recall",         "description": "Full-text search for prior reviews before recommending a tool." },
  { "name": "search_items",   "description": "Filter items by category." },
  { "name": "get_item",       "description": "One item with aggregate stats." },
  { "name": "get_reviews",    "description": "Recent reviews for an item." },
  { "name": "submit_review",  "description": "Direct submit (evidence required)." },
  { "name": "propose_offload","description": "Stage review in KV; returns approval URL for the user." }
]
```

## Verification URL for registries

- Capabilities probe: `curl https://ai-reviewing.com/review/api/mcp -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`
- llms.txt: https://ai-reviewing.com/review/llms.txt
- Well-known: https://ai-reviewing.com/.well-known/mcp.json
