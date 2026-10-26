'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), http = require('node:http'), net = require('node:net'), fs = require('node:fs'), path = require('node:path'), { EventEmitter, once } = require('node:events');
const launcher = require('../tools/start-learning.cjs');
const { readProjectRuntime } = require('../server/runtime-version.cjs');
const expectedRuntime = readProjectRuntime();
const ready = { state: 'ready', version: '0.0.21' };
// Exercise the ordinary launcher policy independently of this checkout's name.
// The actual development-name rejection is covered by development-worktree tests.
function ordinaryLauncher() {
  const filename=path.join(__dirname,'../tools/start-learning.cjs'),load=require('node:module').createRequire(filename),output={exports:{}};
  const unitRequire=name=>name==='../server/runtime-version.cjs'?{...load(name),PROJECT_ROOT:path.join(require('node:os').tmpdir(),'ielts-launcher-unit')}:load(name);
  new Function('require','module','__filename','__dirname',fs.readFileSync(filename,'utf8'))(unitRequire,output,filename,path.dirname(filename));
  return output.exports;
}

test('Windows double-click launcher uses ASCII commands with CRLF on every line', () => {
  const bytes = fs.readFileSync(path.join(__dirname, '../启动学习.cmd'));
  assert.ok(bytes.every(value => value < 128), 'batch commands must remain ASCII');
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 10) assert.equal(bytes[i - 1], 13, 'LF needs a preceding CR for CMD');
    if (bytes[i] === 13) assert.equal(bytes[i + 1], 10, 'CR needs a following LF');
  }
  assert.match(bytes.toString('ascii'), /-File "%~dp0tools\\bootstrap-runtime\.ps1" -ProjectRoot "%~dp0\."\r\n/);
  assert.match(bytes.toString('ascii'), /if errorlevel 1 goto failed\r\nexit \/b 0\r\n:failed/);
  assert.match(bytes.toString('ascii'), /:failed[\s\S]+pause\r\nexit \/b 1/);
  assert.equal(bytes.at(-1), 10);
});

test('existing project service is health checked and opened without spawning another process', async () => {
  const calls = [];
  const result = await launcher.launch({ port: 8765, probe: async port => { calls.push(['health', port]); return ready; }, start: () => assert.fail('must reuse the healthy existing service'), open: async url => calls.push(['open', url]) });
  assert.deepEqual(calls, [['health', 8765], ['open', 'http://127.0.0.1:8765/']]); assert.equal(result.reused, true);
});

test('absent service starts once and browser opens only after a successful project health response', async () => {
  const responses = [{ state: 'absent' }, { state: 'absent' }, ready], calls = [];
  const result = await launcher.launch({ port: 9876, probe: async () => { const r = responses.shift(); calls.push(r.state); return r; }, start: port => { calls.push('start:' + port); return { exited: false }; }, sleep: async () => calls.push('wait'), open: async url => calls.push('open:' + url) });
  assert.deepEqual(calls, ['absent', 'start:9876', 'wait', 'absent', 'wait', 'ready', 'open:http://127.0.0.1:9876/']); assert.equal(result.reused, false);
});

test('foreign or stalled port produces a clear conflict and never spawns or opens a browser', async () => {
  for (const [responses, expectedStarts] of [[[{ state: 'occupied' }], 0], [[{ state: 'absent' }, { state: 'occupied' }], 1]]) {
    let starts = 0;
    await assert.rejects(launcher.launch({ port: 8765, probe: async () => responses.shift(), start: () => { starts++; return {}; }, sleep: async () => {}, open: () => assert.fail('cannot open a foreign server') }), error => error.code === 'PORT_IN_USE' && /8765/.test(error.message) && /其他服务/.test(error.message));
    assert.equal(starts, expectedStarts);
  }
});

test('a simultaneous successful launcher can win the port without causing a second service retry', async () => {
  const responses = [{ state: 'absent' }, ready]; let starts = 0, opened = 0;
  await launcher.launch({ port: 8765, probe: async () => responses.shift(), start: () => { starts++; return { exited: true, exitCode: 1 }; }, sleep: async () => {}, open: async () => opened++ });
  assert.equal(starts, 1); assert.equal(opened, 1);
});

test('legacy or stale service is restarted once before opening the current build', async () => {
  const responses = [{ state: 'stale', version: expectedRuntime.version }, { state: 'absent' }, ready], calls = [];
  const result = await launcher.launch({ port: 8765, expectedRuntime, probe: async () => responses.shift(), restart: async (port, options) => { assert.equal(port, 8765); assert.equal(options.expectedRuntime, expectedRuntime); calls.push('restart'); return { state: 'stopped' }; }, start: () => { calls.push('start'); return {}; }, sleep: async () => {}, open: async () => calls.push('open') });
  assert.deepEqual(calls, ['restart', 'start', 'open']); assert.equal(result.upgraded, true);
});

test('concurrent stale launch reuses replacement and never starts or stops it again', async () => {
  let restarts = 0;
  const responses = [{ state: 'stale' }, ready];
  const result = await launcher.launch({ port: 8765, expectedRuntime, probe: async () => responses.shift(), restart: async () => { restarts++; return { state: 'current' }; }, start: () => assert.fail('replacement already ready'), open: async () => {} });
  assert.equal(restarts, 1); assert.equal(result.reused, true); assert.equal(result.upgraded, false);
});

test('uncertain ownership and files changing during restart fail without opening or repeat killing', async () => {
  let restarts = 0;
  await assert.rejects(launcher.launch({ port: 8765, expectedRuntime, probe: async () => ({ state: 'stale' }), restart: async () => { restarts++; return { state: 'stopped' }; }, start: () => assert.fail('still stale'), open: () => assert.fail('still stale') }), { code: 'RUNTIME_STALE' });
  assert.equal(restarts, 1);
  await assert.rejects(launcher.restartService(8765, { platform: 'linux', expectedRuntime }), error => error.code === 'RESTART_UNVERIFIED' && /重新启动这台电脑/.test(error.message));
});

test('Windows restart helper stays hidden and reads its complete result after stdout closes', async () => {
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => assert.fail('completed helper must not be killed');
  let captured;
  const restarting = launcher.restartService(8765, { platform: 'win32', expectedRuntime, spawn: (...args) => { captured = args; return child; } });
  assert.match(captured[0], /WindowsPowerShell[\\/]v1\.0[\\/]powershell\.exe$/); assert.equal(captured[2].windowsHide, true);
  assert.ok(captured[1].includes('-LauncherPath')); assert.ok(captured[1].includes('-BuildSignature'));
  child.emit('exit', 0); child.stdout.emit('data', Buffer.from('{"state":"current"}')); child.emit('close', 0);
  assert.deepEqual(await restarting, { state: 'current' });
});

test('startup exit and readiness timeout are reported without opening an unready page', async () => {
  for (const earlyExit of [false, true]) {
    let starts = 0, probes = 0;
    await assert.rejects(launcher.launch({ port: 8765, maxPolls: 3, probe: async () => { probes++; return { state: 'absent' }; }, start: () => { starts++; return { exited: earlyExit, exitCode: 1 }; }, sleep: async () => {}, open: () => assert.fail('not ready') }), { code: earlyExit ? 'START_FAILED' : 'START_TIMEOUT' });
    assert.equal(starts, 1); assert.equal(probes, earlyExit ? 2 : 4);
  }
});

test('health verification requires the current loaded build and project identity', async t => {
  const identity = { ...expectedRuntime, instanceId: '11111111-1111-4111-a111-111111111111', startedAt: '2026-10-25T00:00:00.000Z', pid: 123 };
  let response = { ok: true, service: launcher.SERVICE, home: '/', ...identity }, status = 200;
  const server = http.createServer((req, res) => { assert.equal(req.url, '/api/health'); res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(typeof response === 'string' ? response : JSON.stringify(response)); });
  server.listen(0, launcher.HOST); await once(server, 'listening'); t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const port = server.address().port;
  assert.deepEqual(await launcher.probeService(port, { expectedRuntime }), { state: 'ready', ...identity });
  response = { ok: true, service: launcher.SERVICE, version: expectedRuntime.version, home: '/' };
  assert.equal((await launcher.probeService(port, { expectedRuntime })).state, 'stale', 'legacy services cannot claim readiness by rereading VERSION');
  response = { ok: true, service: launcher.SERVICE, home: '/', ...identity, buildSignature: 'sha256:' + '0'.repeat(64) };
  assert.equal((await launcher.probeService(port, { expectedRuntime })).state, 'stale');
  response = { ok: true, service: launcher.SERVICE, home: '/', ...identity, projectId: 'sha256:' + '0'.repeat(64) };
  assert.equal((await launcher.probeService(port, { expectedRuntime })).state, 'occupied');
  for (const bad of [{ ok: true, service: 'different-server', version: '1', home: '/' }, { ok: true, service: launcher.SERVICE, version: '1', home: 'https://foreign.example/' }, { ok: false, service: launcher.SERVICE, version: '1', home: '/' }, '<html>some other app</html>']) { response = bad; assert.equal((await launcher.probeService(port)).state, 'occupied'); }
  response = { ok: true, service: launcher.SERVICE, version: '1', home: '/' }; status = 302; assert.equal((await launcher.probeService(port)).state, 'occupied');
});

test('non-HTTP process occupying the port times out as occupied, while refused connections are absent', async t => {
  const sockets = new Set(), server = net.createServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.listen(0, launcher.HOST); await once(server, 'listening'); const port = server.address().port;
  t.after(() => { for (const socket of sockets) socket.destroy(); if (server.listening) server.close(); });
  assert.deepEqual(await launcher.probeService(port, { timeoutMs: 50 }), { state: 'occupied', reason: 'HEALTH_TIMEOUT' });
  const closed = once(server, 'close'); for (const socket of sockets) socket.destroy(); server.close(); await closed;
  assert.equal((await launcher.probeService(port)).state, 'absent');
});

test('background service helper is detached and hidden with no inherited terminal', () => {
  const child = new EventEmitter(); let unref = false, captured;
  child.unref = () => { unref = true; };
  const state = launcher.startDetached(8765, { execPath: 'C:\\node\\node.exe', spawn: (...args) => { captured = args; return child; }, env: { ONLY_TEST: 'yes' } });
  assert.equal(captured[0], 'C:\\node\\node.exe'); assert.match(captured[1][0], /start-learning\.cjs$/); assert.deepEqual(captured[1].slice(1), ['--serve', '--port', '8765']);
  assert.equal(captured[2].windowsHide, true); assert.equal(captured[2].detached, true); assert.equal(captured[2].stdio, 'ignore'); assert.equal(unref, true);
  child.emit('exit', 1); assert.equal(state.exited, true); assert.equal(state.exitCode, 1);
});

test('Windows browser launch hides its shell helper while invoking the normal default browser', async () => {
  let captured; const child = new EventEmitter();
  const opening = launcher.openBrowser('http://127.0.0.1:8765/', { platform: 'win32', spawn: (...args) => { captured = args; return child; } });
  assert.equal(captured[0], 'cmd.exe'); assert.deepEqual(captured[1], ['/d', '/c', 'start', 'http://127.0.0.1:8765/']); assert.equal(captured[2].windowsHide, true);
  child.emit('exit', 0); await opening;
  await assert.rejects(launcher.openBrowser('https://untrusted.example/'), { code: 'INVALID_HOME' });
});

test('invalid ports and unsupported Node are rejected before any service or browser side effects', async () => {
  const launcher=ordinaryLauncher();
  for (const port of ['abc', '-1', '0', '65536', '8765 & echo bad', 1.5]) assert.throws(() => launcher.parsePort(port), { code: 'INVALID_PORT' });
  assert.equal(launcher.parsePort(undefined), 8765); assert.equal(launcher.parsePort('9876'), 9876);
  await assert.rejects(launcher.main([], { nodeVersion: '20.19.0', start: () => assert.fail('old Node') }), { code: 'NODE_VERSION' });
  await assert.rejects(launcher.main(['--unexpected'], { nodeVersion: '22.0.0' }), { code: 'INVALID_ARGUMENT' });
});

test('serve mode uses existing server creation and signal cleanup without launching a browser', async () => {
  const launcher=ordinaryLauncher();
  const runtime = new EventEmitter(), server = new EventEmitter(); let created = 0, signalHooks = 0, listened;
  server.listen = (port, host, callback) => { listened = { port, host }; queueMicrotask(callback); };
  server.close = () => server.emit('close');
  const result = await launcher.main(['--serve', '--port', '9876'], { nodeVersion: '22.0.0', runtime, createServer: () => { created++; return server; }, closeOnSignals: (owner, rt) => { assert.equal(owner, server); assert.equal(rt, runtime); signalHooks++; }, open: () => assert.fail('daemon cannot open browsers') });
  assert.equal(result, server); assert.equal(created, 1); assert.equal(signalHooks, 1); assert.deepEqual(listened, { port: 9876, host: '127.0.0.1' });
});
