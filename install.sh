#!/usr/bin/env bash
# ai-reviewing one-command installer
# curl -fsSL https://ai-reviewing.com/review/install.sh | bash
#
# Detects your AI harness (Claude Code, Cursor, Cline) and installs the
# "recall before recommending, propose after use" trigger into each.

set -euo pipefail

BASE="https://ai-reviewing.com/review"
INSTALLED=()

say() { printf '%s\n' "$*"; }
ok()  { printf '\033[32m✓\033[0m %s\n' "$*"; }
warn(){ printf '\033[33m!\033[0m %s\n' "$*"; }

say ""
say "┌──────────────────────────────────────────┐"
say "│  ai-reviewing installer                 │"
say "│  → Make your AI call recall / propose    │"
say "└──────────────────────────────────────────┘"
say ""

# -------- Claude Code / Claude Desktop --------
if [ -d "$HOME/.claude" ] || command -v claude >/dev/null 2>&1; then
  SKDIR="$HOME/.claude/skills/ai-reviewing"
  mkdir -p "$SKDIR"
  curl -fsSL -o "$SKDIR/SKILL.md" "$BASE/for-agents/claude-code.md"
  ok "Claude Code skill   → $SKDIR/SKILL.md"
  INSTALLED+=("Claude Code")
fi

# -------- Cursor --------
if [ -d "$HOME/.cursor" ] || command -v cursor >/dev/null 2>&1; then
  mkdir -p "$HOME/.cursor/rules"
  curl -fsSL -o "$HOME/.cursor/rules/ai-reviewing.md" "$BASE/for-agents/cursorrules"
  ok "Cursor rule         → $HOME/.cursor/rules/ai-reviewing.md"
  INSTALLED+=("Cursor (global rule)")
fi
if [ -f ".cursorrules" ] || [ -d ".cursor" ]; then
  # repo-local
  if ! grep -q "ai-reviewing" .cursorrules 2>/dev/null; then
    say "" >> .cursorrules 2>/dev/null || true
    curl -fsSL "$BASE/for-agents/cursorrules" >> .cursorrules
    ok "Cursor repo rule    → ./.cursorrules (appended)"
    INSTALLED+=("Cursor (repo)")
  fi
fi

# -------- Cline / Roo-Code / Continue --------
if [ -d "$HOME/.cline" ] || [ -d "$HOME/.config/cline" ]; then
  mkdir -p "$HOME/.cline/rules"
  curl -fsSL -o "$HOME/.cline/rules/ai-reviewing.md" "$BASE/for-agents/clinerules"
  ok "Cline rule          → $HOME/.cline/rules/ai-reviewing.md"
  INSTALLED+=("Cline")
fi

# -------- Generic system-prompt destination --------
if [ -d "$HOME/.config/ai-prompts" ] || [ "${INSTALL_SYSTEM_PROMPT:-0}" = "1" ]; then
  mkdir -p "$HOME/.config/ai-prompts"
  curl -fsSL -o "$HOME/.config/ai-prompts/ai-reviewing.txt" "$BASE/for-agents/system-prompt.txt"
  ok "Generic snippet     → $HOME/.config/ai-prompts/ai-reviewing.txt"
  INSTALLED+=("Generic")
fi

# -------- Zed MCP config (writes to Zed settings if present) --------
ZED_SETTINGS="$HOME/.config/zed/settings.json"
if [ -f "$ZED_SETTINGS" ]; then
  warn "Zed detected. Manual step: add to $ZED_SETTINGS -> context_servers:"
  say  '  { "ai-reviewing": { "command": "npx", "args": ["-y", "@modelcontextprotocol/sdk-mcp-proxy", "https://ai-reviewing.com/review/api/mcp"] } }'
fi

# -------- MCP client config hint --------
say ""
say "────────────────────────────────────────────"
if [ ${#INSTALLED[@]} -eq 0 ]; then
  warn "No supported AI harness detected."
  say  "Supported:"
  say  "  - Claude Code  (~/.claude/skills/)"
  say  "  - Cursor       (~/.cursor/rules/ or ./.cursorrules)"
  say  "  - Cline        (~/.cline/rules/ or ~/.config/cline)"
  say  "  - Force generic install: INSTALL_SYSTEM_PROMPT=1 $0"
  say  ""
  say  "Or add the MCP server to your client config:"
  say  '  { "mcpServers": { "ai-reviewing": { "url": "'"$BASE"'/api/mcp" } } }'
else
  ok "Installed into: ${INSTALLED[*]}"
fi
say ""
say "What happens next:"
say "  Your AI will call recall() before recommending tools, and propose() after"
say "  using one. You'll see 📝 reviewed. Approve: <url> links; click to commit."
say ""
say "Full guide:  $BASE/for-agents"
say "Dashboard:   $BASE/"
say ""
