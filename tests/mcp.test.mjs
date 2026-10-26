import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundled = await build({
  entryPoints: [new URL('../src/routes/mcp.ts', import.meta.url).pathname],
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { mcpApi } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const rpc = body => mcpApi.request('https://test.invalid/', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}, {});

test('initialization negotiates supported versions and preserves request id', async () => {
  for (const protocolVersion of ['2025-03-26', '2025-06-18', '2099-01-01']) {
    const response = await rpc({ jsonrpc: '2.0', id: 'init-1', method: 'initialize', params: { protocolVersion } });
    const body = await response.json();
    assert.equal(body.id, 'init-1');
    assert.equal(body.result.protocolVersion, protocolVersion === '2099-01-01' ? '2025-06-18' : protocolVersion);
    assert.deepEqual(body.result.capabilities, { tools: {} });
  }
});

test('initialized notifications receive an empty 202 response', async () => {
  const response = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal(response.status, 202);
  assert.equal(await response.text(), '');
});

test('a notification cannot execute a write tool', async () => {
  // No DB or KV is provided: executing the tool would fail this assertion.
  const response = await rpc({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'submit_review', arguments: {} } });
  assert.equal(response.status, 202);
  assert.equal(await response.text(), '');
});

test('tools retain their names and accurately distinguish writes', async () => {
  const body = await (await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).json();
  assert.deepEqual(body.result.tools.map(t => t.name), ['recall', 'get_item', 'get_reviews', 'propose_offload', 'submit_review']);
  for (const tool of body.result.tools) {
    assert.equal(tool.annotations.readOnlyHint, ['recall', 'get_item', 'get_reviews'].includes(tool.name));
  }
});

test('ping succeeds without database access', async () => {
  const body = await (await rpc({ jsonrpc: '2.0', id: 0, method: 'ping' })).json();
  assert.deepEqual(body, { jsonrpc: '2.0', id: 0, result: {} });
});

test('SSE requests receive 405 while ordinary GET retains discovery', async () => {
  const sse = await mcpApi.request('https://test.invalid/', { headers: { accept: 'text/event-stream' } });
  assert.equal(sse.status, 405);
  const discovery = await mcpApi.request('https://test.invalid/');
  assert.equal(discovery.status, 200);
  assert.equal((await discovery.json()).protocol, 'mcp');
});

test('invalid requests and unsupported methods receive protocol errors', async () => {
  for (const invalid of [null, [], { jsonrpc: '2.0', method: 42 }]) {
    assert.equal((await (await rpc(invalid)).json()).error.code, -32600);
  }
  assert.equal((await (await rpc({ jsonrpc: '2.0', id: 1, method: 'unknown' })).json()).error.code, -32601);
});
