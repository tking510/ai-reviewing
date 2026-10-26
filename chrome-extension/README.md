# AI Reviewing — Chrome extension

Adds a **📝 Review this?** badge inside ChatGPT, Claude.ai and Gemini chat UIs when the conversation mentions a tool / library / service. Clicking the badge opens ai-reviewing.com's submit form pre-filled with the context.

## Why
ChatGPT custom GPTs are deprecated, and the custom-instructions-only path is per-account. This extension gives every ChatGPT / Claude / Gemini user a one-click review path.

## Install (unpacked)

1. Clone this directory to disk.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** → select this folder.
5. Open ChatGPT / Claude / Gemini. Have a conversation about a tool. The badge appears.

## Publishing

```
# zip and upload to https://chrome.google.com/webstore/devconsole
cd chrome-extension && zip -r ../ai-reviewing-extension.zip . -x '*.DS_Store'
```

Icons (`icon-48.png`, `icon-128.png`) need to be added before publishing.

## Privacy

Zero telemetry. Scans DOM content in the active chat UI only; opens a new tab to ai-reviewing.com only on badge click.
