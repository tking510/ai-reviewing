import { Hono } from 'hono';
import type { Env } from '../types';

export const explorerApi = new Hono<{ Bindings: Env }>();

explorerApi.get('/', c => {
  return c.html(
    `<!doctype html><html lang="en">
<head>
<meta charset="utf-8">
<title>API Explorer | AI Reviewing</title>
<meta name="description" content="Interactive API documentation for ai-reviewing.com — try endpoints live without writing code.">
<meta property="og:title" content="API Explorer — ai-reviewing">
<meta property="og:image" content="https://ai-reviewing.com/review/og.svg">
<link rel="canonical" href="https://ai-reviewing.com/review/explorer">
</head>
<body style="margin:0">
<redoc spec-url="/review/openapi.json" theme='{"colors":{"primary":{"main":"#fcc404"}},"typography":{"fontFamily":"system-ui, sans-serif"}}'></redoc>
<script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
</body></html>`,
  );
});
