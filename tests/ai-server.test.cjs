'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createServer, normalizeBaseUrl } = require('../server/server.cjs');

const FAKE_KEY = 'test-only-not-a-real-credential';

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return 'http://127.0.0.1:' + server.address().port;
}

async function close(server) {
  if (!server?.listening) return;
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
}

function rawRequest(base, requestPath, headers = {}) {
  const url = new URL(base);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: url.hostname, port: url.port, path: requestPath, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('API base URL only accepts explicit HTTPS or loopback HTTP endpoints', () => {
  assert.equal(normalizeBaseUrl('https://api.example.com/v1/'), 'https://api.example.com/v1');
  assert.equal(normalizeBaseUrl('http://127.0.0.1:9000/'), 'http://127.0.0.1:9000');
  for (const value of ['http://example.com', 'file:///tmp/x', 'https://user:password@example.com',
    'https://example.com/?api_key=private', 'https://example.com/#secret', 'javascript:alert(1)', '']) {
    assert.throws(() => normalizeBaseUrl(value));
  }
});

test('local AI service integration and credential boundaries', async t => {
  const cacheRoot = path.resolve(__dirname, '..', '.cache');
  fs.mkdirSync(cacheRoot, { recursive: true });
  const fixtureRoot = fs.mkdtempSync(path.join(cacheRoot, 'ai-server-test-'));
  fs.mkdirSync(path.join(fixtureRoot, 'assets'));
  fs.mkdirSync(path.join(fixtureRoot, '.git'));
  fs.mkdirSync(path.join(fixtureRoot, 'server'));
  fs.mkdirSync(path.join(fixtureRoot, 'tests'));
  fs.writeFileSync(path.join(fixtureRoot, '开始学习.html'), '<!doctype html><title>学习页面</title>');
  fs.writeFileSync(path.join(fixtureRoot, 'assets', 'app.js'), 'window.demo = true;');
  fs.writeFileSync(path.join(fixtureRoot, 'audio.mp3'), '0123456789');
  fs.writeFileSync(path.join(fixtureRoot, '.git', 'config'), 'private-git-data');
  fs.writeFileSync(path.join(fixtureRoot, '.env'), 'not-a-real-secret');
  fs.writeFileSync(path.join(fixtureRoot, 'server', 'server.cjs'), 'private-server-data');
  fs.writeFileSync(path.join(fixtureRoot, 'tests', 'private.json'), '{"test":true}');
  let mode = 'normal';
  let redirectedRequests = 0;
  let lastChatBody;
  let receivedAuthorization;
  let mockBase;
  const upstream = http.createServer(async (req, res) => {
    receivedAuthorization = req.headers.authorization;
    if (req.url === '/leak-target') {
      redirectedRequests++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: 'unexpected' }] }));
    }
    if (req.url === '/models' || req.url === '/v1/models') {
      if (mode === 'unauthorized') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'private upstream diagnostic: ' + FAKE_KEY }));
      }
      if (mode === 'redirect') {
        res.writeHead(302, { Location: mockBase + '/leak-target' });
        return res.end();
      }
      if (mode === 'slow') {
        return setTimeout(() => { if (!res.destroyed) { res.writeHead(200); res.end('{}'); } }, 250);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: 'deepseek-flash' }, { id: 'test-model' }, { id: FAKE_KEY }] }));
    }
    if (req.url === '/chat/completions') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      lastChatBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ choices: [{ message: { content: mode === 'echo-secret' ? 'OK ' + FAKE_KEY : 'OK' } }] }));
    }
    res.writeHead(404);
    res.end();
  });
  mockBase = await listen(upstream);
  const app = createServer({ rootDir: fixtureRoot, modelsTimeoutMs: 100, testTimeoutMs: 1000 });
  const base = await listen(app);
  t.after(async () => {
    await close(app);
    await close(upstream);
    const resolvedTarget = path.resolve(fixtureRoot);
    assert.ok(resolvedTarget.startsWith(cacheRoot + path.sep));
    fs.rmSync(resolvedTarget, { recursive: true, force: true });
  });

  async function api(endpoint, body, options = {}) {
    const response = await fetch(base + endpoint, {
      method: options.method || (body === undefined ? 'GET' : 'POST'),
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...options.headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
  }
  const connectBody = { baseUrl: mockBase, apiKey: FAKE_KEY, preferredModel: 'deepseek-flash' };

  await t.test('starts disconnected and serves project files with UTF-8 and byte ranges', async () => {
    const status = await api('/api/ai/status');
    assert.equal(status.data.connected, false);
    assert.equal(status.data.credentialStorage, 'memory');
    const page = await fetch(base + '/');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /utf-8/);
    assert.match(await page.text(), /学习页面/);
    const range = await fetch(base + '/audio.mp3', { headers: { Range: 'bytes=2-5' } });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get('content-range'), 'bytes 2-5/10');
    assert.equal(await range.text(), '2345');
    const badRange = await fetch(base + '/audio.mp3', { headers: { Range: 'bytes=999-' } });
    assert.equal(badRange.status, 416);
  });

  await t.test('connects, returns model IDs, selects requested model, and never returns key', async () => {
    const connected = await api('/api/ai/connect', connectBody, { headers: { Origin: base } });
    assert.equal(connected.status, 200);
    assert.equal(connected.data.model, 'deepseek-flash');
    assert.deepEqual(connected.data.models, [{ id: 'deepseek-flash' }, { id: 'test-model' }]);
    assert.equal(receivedAuthorization, 'Bearer ' + FAKE_KEY);
    assert.ok(!JSON.stringify(connected).includes(FAKE_KEY));
    assert.ok(!JSON.stringify(await api('/api/ai/status')).includes(FAKE_KEY));
    assert.equal(Object.hasOwn(connected.data, 'apiKey'), false);
  });

  await t.test('only listed models can be selected and verified', async () => {
    assert.equal((await api('/api/ai/model', { model: 'not-listed' })).status, 400);
    assert.equal((await api('/api/ai/model', { model: 'test-model' })).data.model, 'test-model');
    const verified = await api('/api/ai/test', {});
    assert.equal(verified.status, 200);
    assert.deepEqual(verified.data, { ok: true, model: 'test-model', reply: 'OK' });
    assert.equal(lastChatBody.model, 'test-model');
    assert.equal(lastChatBody.max_tokens, 64);
    assert.equal(lastChatBody.stream, false);
    assert.equal(Object.hasOwn(lastChatBody, 'thinking'), false);
    mode = 'echo-secret';
    const redacted = await api('/api/ai/test', {});
    assert.ok(!JSON.stringify(redacted).includes(FAKE_KEY));
    assert.match(redacted.data.reply, /已隐藏/);
    mode = 'normal';
  });

  await t.test('failed replacement preserves old connection and sanitizes diagnostics', async () => {
    mode = 'unauthorized';
    const failed = await api('/api/ai/connect', connectBody);
    assert.equal(failed.status, 401);
    assert.equal(failed.data.error.code, 'AUTH_FAILED');
    assert.ok(!JSON.stringify(failed).includes(FAKE_KEY));
    const previous = await api('/api/ai/status');
    assert.equal(previous.data.connected, true);
    assert.equal(previous.data.model, 'test-model');
    mode = 'normal';
  });

  await t.test('does not follow redirects carrying an Authorization header', async () => {
    mode = 'redirect';
    const result = await api('/api/ai/connect', connectBody);
    assert.equal(result.status, 502);
    assert.equal(redirectedRequests, 0);
    assert.ok(!JSON.stringify(result).includes(FAKE_KEY));
    mode = 'normal';
  });

  await t.test('times out and provides a safe actionable error', async () => {
    mode = 'slow';
    const result = await api('/api/ai/connect', connectBody);
    assert.equal(result.status, 504);
    assert.equal(result.data.error.code, 'UPSTREAM_TIMEOUT');
    mode = 'normal';
  });

  await t.test('missing preferred model requires an explicit selection', async () => {
    const result = await api('/api/ai/connect', { ...connectBody, preferredModel: 'missing-model' });
    assert.equal(result.status, 200);
    assert.equal(result.data.model, null);
    assert.equal(result.data.preferredModelAvailable, false);
    assert.equal((await api('/api/ai/test', {})).status, 409);
    assert.equal((await api('/api/ai/model', { model: 'deepseek-flash' })).status, 200);
  });

  await t.test('rejects cross-origin requests, unknown Host, forms and invalid JSON', async () => {
    const blocked = await api('/api/ai/connect', connectBody, { headers: { Origin: 'https://unrelated.example' } });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.data.error.code, 'ORIGIN_DENIED');
    assert.equal((await rawRequest(base, '/api/ai/status', { Host: 'unrelated.example' })).status, 403);
    assert.equal((await fetch(base + '/api/ai/connect', { method: 'POST', body: 'baseUrl=x' })).status, 415);
    assert.equal((await fetch(base + '/api/ai/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' })).status, 400);
    assert.equal((await fetch(base + '/api/ai/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ junk: 'x'.repeat(70_000) }) })).status, 413);
  });

  await t.test('blocks secrets, server code, tests, traversal, and directory listings', async () => {
    for (const resource of ['/.git/config', '/.env', '/server/server.cjs', '/tests/private.json',
      '/%2e%2e/README.md', '/assets/%2e%2e/.env', '/assets%5c..%5c.env', '/assets/']) {
      const response = await rawRequest(base, resource);
      assert.equal(response.status, 403, resource);
      assert.ok(!response.body.includes('private-git-data'));
      assert.ok(!response.body.includes('private-server-data'));
    }
    assert.equal((await fetch(base + '/assets/app.js')).status, 200);
  });

  await t.test('disconnect wipes in-memory configuration', async () => {
    const result = await api('/api/ai/connection', undefined, { method: 'DELETE', headers: { Origin: base } });
    assert.equal(result.status, 200);
    assert.equal(result.data.connected, false);
    assert.deepEqual(result.data.models, []);
    assert.equal((await api('/api/ai/test', {})).status, 409);
  });
});

test('DeepSeek verification disables thinking without exposing the credential', async t => {
  let verificationBody;
  const mockFetch = async (url, options) => {
    if (url.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'deepseek-flash' }] }), { status: 200 });
    verificationBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 });
  };
  const app = createServer({ fetchImpl: mockFetch });
  const base = await listen(app);
  t.after(() => close(app));
  const jsonHeaders = { 'Content-Type': 'application/json' };
  await fetch(base + '/api/ai/connect', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({
    baseUrl: 'https://api.deepseek.com', apiKey: FAKE_KEY, preferredModel: 'deepseek-flash',
  }) });
  const response = await fetch(base + '/api/ai/test', { method: 'POST', headers: jsonHeaders, body: '{}' });
  assert.equal(response.status, 200);
  assert.deepEqual(verificationBody.thinking, { type: 'disabled' });
  assert.equal(verificationBody.max_tokens, 64);
});

test('coach validates input, preserves privacy, and returns non-executable text', async t => {
  let chatBody;
  let responseMode = 'normal';
  let releasePending;
  let pendingEntered;
  let upstreamAborted = () => {};
  const mockFetch = async (url, options) => {
    if (url.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'deepseek-flash' }] }));
    chatBody = JSON.parse(options.body);
    if (responseMode === 'unauthorized') return new Response(FAKE_KEY + ' diagnostic', { status: 401 });
    if (responseMode === 'empty') return new Response(JSON.stringify({ choices: [] }));
    if (responseMode === 'pending') {
      pendingEntered();
      await new Promise((resolve, reject) => {
        releasePending = resolve;
        options.signal.addEventListener('abort', () => { upstreamAborted(); reject(options.signal.reason); }, { once: true });
      });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: '<img src=x onerror=alert(1)>改进建议 ' + FAKE_KEY } }] }));
  };
  const app = createServer({ fetchImpl: mockFetch, coachTimeoutMs: 100 });
  const base = await listen(app);
  t.after(() => close(app));
  const headers = { 'Content-Type': 'application/json' };
  async function post(endpoint, body, signal) {
    const response = await fetch(base + endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal });
    return { status: response.status, data: await response.json() };
  }
  const input = { mode: 'writing', text: 'My practice answer.', task: 'academic_task1', prompt: 'Compare A: 10, B: 20.', level: 'A1' };
  assert.equal((await post('/api/ai/coach', input)).status, 409);
  await post('/api/ai/connect', { baseUrl: 'https://api.deepseek.com', apiKey: FAKE_KEY, preferredModel: 'deepseek-flash' });
  for (const invalid of [{ ...input, mode: 'other' }, { ...input, text: '' }, { ...input, text: 'a'.repeat(10001) },
    { ...input, level: 'invented' }, { ...input, task: 'general_training' }, { ...input, prompt: '' }, { ...input, prompt: 'a'.repeat(3001) }]) {
    assert.equal((await post('/api/ai/coach', invalid)).status, 400);
  }
  const writing = await post('/api/ai/coach', input);
  assert.equal(writing.status, 200);
  assert.equal(writing.data.feedbackFormat, 'text');
  assert.ok(!JSON.stringify(writing).includes(FAKE_KEY));
  assert.ok(!writing.data.feedback.includes('<'));
  assert.deepEqual(chatBody.thinking, { type: 'disabled' });
  assert.equal(chatBody.max_tokens, 2500);
  assert.match(chatBody.messages[0].content, /Task Achievement/);
  assert.deepEqual(JSON.parse(chatBody.messages[1].content), { task: input.task, question: input.prompt, learnerText: input.text });
  await post('/api/ai/coach', { ...input, mode: 'grammar', task: '' });
  assert.match(chatBody.messages[0].content, /中文理由/);
  const speaking = await post('/api/ai/coach', { ...input, mode: 'speaking_text', task: '' });
  assert.match(speaking.data.disclaimer, /不评价发音/);
  assert.match(chatBody.messages[0].content, /没有音频/);
  responseMode = 'unauthorized';
  const denied = await post('/api/ai/coach', input);
  assert.equal(denied.status, 401);
  assert.ok(!JSON.stringify(denied).includes(FAKE_KEY));
  responseMode = 'empty';
  assert.equal((await post('/api/ai/coach', input)).data.error.code, 'EMPTY_MODEL_REPLY');
  responseMode = 'pending';
  let entered = new Promise(resolve => { pendingEntered = resolve; });
  const pending = post('/api/ai/coach', input);
  await entered;
  assert.equal((await post('/api/ai/coach', input)).data.error.code, 'COACH_BUSY');
  releasePending();
  assert.equal((await pending).status, 200);
  entered = new Promise(resolve => { pendingEntered = resolve; });
  const timedOut = post('/api/ai/coach', input);
  await entered;
  assert.equal((await timedOut).data.error.code, 'UPSTREAM_TIMEOUT');
  entered = new Promise(resolve => { pendingEntered = resolve; });
  const aborted = new Promise(resolve => { upstreamAborted = resolve; });
  const cancel = new AbortController();
  const cancelled = post('/api/ai/coach', input, cancel.signal);
  await entered;
  cancel.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
  await aborted;
  responseMode = 'normal';
  assert.equal((await post('/api/ai/coach', input)).status, 200);
});
