'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const launcher = require('../tools/start-learning.cjs');
const runtime = require('../server/runtime-version.cjs');

function temp(t, base = os.tmpdir()) {
  fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, 'ielts-launcher 模拟-'));
  t.after(() => { const resolved = path.resolve(dir); assert.ok(resolved.startsWith(path.resolve(base) + path.sep)); fs.rmSync(resolved, { recursive: true, force: true }); });
  return dir;
}
function fixtureProject(root) {
  for (const name of ['server', 'assets', 'tools', 'calibration', '用户数据']) fs.mkdirSync(path.join(root, name), { recursive: true });
  for (const [name, bytes] of Object.entries({ VERSION: '0.0.61\n', 'server/example.cjs': 'module.exports = 1;', 'assets/backup-core.js': 'module.exports = {};', 'tools/start-learning.cjs': '// simulated launcher', 'tools/restart-learning-service.ps1': '# simulated helper', 'calibration/official-sample-index.json': '{}' })) fs.writeFileSync(path.join(root, name), bytes);
}
async function unusedPort() { const server = net.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening'); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; }
function childProcess(t, script, args, env = {}) {
  const child = spawn(process.execPath, [script, ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  let failure = ''; child.stderr.on('data', bytes => { failure += bytes; });
  child.failure = () => failure;
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; } });
  return child;
}
async function waitReady(child) {
  if (child.exitCode !== null) throw new Error(child.failure());
  await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => { cleanup(); reject(new Error('Simulated child readiness timeout: ' + child.failure())); }, 10000);
    const cleanup = () => { clearTimeout(timer); child.stdout.off('data', data); child.off('exit', exit); };
    const data = bytes => { output += bytes; if (output.includes('SIMULATED_READY')) { cleanup(); resolve(); } };
    const exit = () => { cleanup(); reject(new Error('Simulated child exited: ' + child.failure())); };
    child.stdout.on('data', data); child.once('exit', exit);
  });
}

test('build identity covers loaded shared code, keeps root private and excludes user files', t => {
  const root = temp(t); fixtureProject(root);
  const before = runtime.readProjectRuntime(root);
  assert.match(before.buildSignature, /^sha256:[a-f0-9]{64}$/); assert.match(before.projectId, /^sha256:[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(before).includes(root));
  fs.writeFileSync(path.join(root, '用户数据', 'private.json'), 'SIMULATED PRIVATE CONTENT');
  assert.deepEqual(runtime.readProjectRuntime(root), before);
  fs.appendFileSync(path.join(root, 'assets', 'backup-core.js'), '\n// changed supported storage keys');
  const changed = runtime.readProjectRuntime(root); assert.notEqual(changed.buildSignature, before.buildSignature); assert.equal(changed.projectId, before.projectId);
  const other = temp(t); fixtureProject(other); assert.notEqual(runtime.readProjectRuntime(other).projectId, before.projectId);
});

test('running process health retains its loaded version and only matching local restart closes it', async t => {
  const root = temp(t); fixtureProject(root);
  const dataDir = path.join(root, '用户数据'), script = path.join(root, 'simulated-server.cjs'), port = await unusedPort();
  fs.writeFileSync(script, `'use strict';const {createServer}=require(${JSON.stringify(path.resolve(__dirname, '../server/server.cjs'))});const server=createServer({rootDir:__dirname,dataDir:${JSON.stringify(dataDir)},migrateLegacy:false,defaultCredentialPersistence:false,materialMigration:false});server.listen(${port},'127.0.0.1',()=>console.log('SIMULATED_READY'));`);
  const child = childProcess(t, script, []); await waitReady(child);
  const base = 'http://127.0.0.1:' + port;
  let before;
  for (let i=0;i<100;i++){before=await (await fetch(base + '/api/health')).json();if(before.ready!==false)break;await new Promise(resolve=>setTimeout(resolve,20));}
  assert.notEqual(before.ready,false,'the synthetic service must complete its startup before business requests');
  fs.writeFileSync(path.join(root, 'VERSION'), '0.0.62\n'); fs.appendFileSync(path.join(root, 'server/example.cjs'), '\n// simulated NAS update');
  const fixed=value=>Object.fromEntries(['runtimeSchema','version','buildSignature','projectId','instanceId','startedAt','pid','serviceInstanceId'].map(key=>[key,value[key]]));
  assert.deepEqual(fixed(await (await fetch(base + '/api/health')).json()), fixed(before), 'health must not reread the upgraded VERSION or source');
  assert.equal((await launcher.probeService(port, { expectedRuntime: runtime.readProjectRuntime(root) })).state, 'stale');
  const headers = { 'Content-Type': 'application/json', 'X-IELTS-Project-Id': before.projectId, 'X-IELTS-Launcher': 'restart-v1' };
  assert.equal((await fetch(base + '/api/runtime/restart', { method: 'POST', headers: { ...headers, Origin: 'https://foreign.example' }, body: JSON.stringify({ instanceId: before.instanceId }) })).status, 403);
  assert.equal((await fetch(base + '/api/runtime/restart', { method: 'POST', headers, body: JSON.stringify({ instanceId: 'wrong-instance' }) })).status, 409);
  assert.equal((await fetch(base + '/api/runtime/restart', { method: 'POST', headers: { ...headers, 'X-IELTS-Project-Id': 'wrong-project' }, body: JSON.stringify({ instanceId: before.instanceId }) })).status, 409);
  const exited = once(child, 'exit');
  assert.equal((await fetch(base + '/api/runtime/restart', { method: 'POST', headers, body: JSON.stringify({ instanceId: before.instanceId }) })).status, 202);
  await exited;
});

function simulatedService(script) {
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.writeFileSync(script, `'use strict';const http=require('node:http');const expected=JSON.parse(process.env.IELTS_SIMULATED_RUNTIME||'{}');const port=Number(process.argv[process.argv.indexOf('--port')+1]);const health={ok:true,service:'ielts-learning-local',version:expected.version,home:'/',...(process.env.IELTS_SIMULATED_CURRENT==='1'?{...expected,instanceId:'11111111-1111-4111-a111-111111111111',startedAt:new Date().toISOString(),pid:process.pid}:{})};const server=http.createServer((req,res)=>{if(req.url==='/api/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(health));}else{res.writeHead(404);res.end('{}');}});server.listen(port,'127.0.0.1',()=>console.log('SIMULATED_READY'));`);
}

test('Windows restart verifies the exact UNC-compatible launcher command before stopping a legacy process', { skip: process.platform !== 'win32', timeout: 60000 }, async t => {
  const root = temp(t, path.resolve(__dirname, '../work')), script = path.join(root, 'tools', 'start-learning.cjs'), port = await unusedPort(), expectedRuntime = runtime.readProjectRuntime();
  simulatedService(script);
  const child = childProcess(t, script, ['--serve', '--port', String(port)], { IELTS_SIMULATED_RUNTIME: JSON.stringify(expectedRuntime) });
  await waitReady(child);
  assert.equal((await launcher.probeService(port, { expectedRuntime })).state, 'stale', 'same VERSION without signature remains stale');
  const exited = once(child, 'exit');
  const result = await launcher.restartService(port, { expectedRuntime, launcherPath: script });
  assert.equal(result.state, 'stopped'); await exited;
});

test('Windows restart refuses another script and leaves its process running', { skip: process.platform !== 'win32', timeout: 60000 }, async t => {
  const root = temp(t), script = path.join(root, 'tools', 'start-learning.cjs'), other = path.join(root, 'other project', 'tools', 'start-learning.cjs'), port = await unusedPort(), expectedRuntime = runtime.readProjectRuntime();
  simulatedService(script); simulatedService(other);
  const child = childProcess(t, other, ['--serve', '--port', String(port)], { IELTS_SIMULATED_RUNTIME: JSON.stringify(expectedRuntime) }); await waitReady(child);
  await assert.rejects(launcher.restartService(port, { expectedRuntime, launcherPath: script }), error => error.code === 'RESTART_UNVERIFIED' && /COMMAND_UNVERIFIED/.test(error.message));
  assert.equal(child.exitCode, null); assert.equal((await launcher.probeService(port, { expectedRuntime })).state, 'stale');
});

test('Windows upgrade uses graceful close and cleanup before a force fallback', { skip: process.platform !== 'win32', timeout: 60000 }, async t => {
  const root = temp(t); fixtureProject(root);
  const script = path.join(root, 'tools', 'start-learning.cjs'), dataDir = path.join(root, '用户数据'), marker = path.join(root, 'SIMULATED_CLEAN_CLOSE'), port = await unusedPort();
  fs.writeFileSync(script, `'use strict';const fs=require('node:fs');const {createServer}=require(${JSON.stringify(path.resolve(__dirname, '../server/server.cjs'))});const server=createServer({rootDir:${JSON.stringify(root)},dataDir:${JSON.stringify(dataDir)},migrateLegacy:false,defaultCredentialPersistence:false,materialMigration:false});server.once('close',()=>fs.writeFileSync(${JSON.stringify(marker)},'SIMULATED CLEANUP'));server.listen(${port},'127.0.0.1',()=>console.log('SIMULATED_READY'));`);
  const child = childProcess(t, script, ['--serve', '--port', String(port)]); await waitReady(child);
  fs.writeFileSync(path.join(root, 'VERSION'), '0.0.62\n');
  const expectedRuntime = runtime.readProjectRuntime(root), exited = once(child, 'exit');
  assert.equal((await launcher.restartService(port, { expectedRuntime, launcherPath: script })).state, 'stopped');
  await exited; assert.equal(fs.readFileSync(marker, 'utf8'), 'SIMULATED CLEANUP');
});

test('concurrent Windows double clicks replace legacy service once and keep the winning new process', { skip: process.platform !== 'win32', timeout: 90000 }, async t => {
  const root = temp(t), script = path.join(root, 'tools', 'start-learning.cjs'), port = await unusedPort(), expectedRuntime = runtime.readProjectRuntime();
  simulatedService(script);
  const legacy = childProcess(t, script, ['--serve', '--port', String(port)], { IELTS_SIMULATED_RUNTIME: JSON.stringify(expectedRuntime) }); await waitReady(legacy);
  const replacements = []; let opened = 0;
  const options = { port, expectedRuntime, restart: (value, details) => launcher.restartService(value, { ...details, launcherPath: script }), start: value => {
    const child = childProcess(t, script, ['--serve', '--port', String(value)], { IELTS_SIMULATED_RUNTIME: JSON.stringify(expectedRuntime), IELTS_SIMULATED_CURRENT: '1' }); replacements.push(child);
    const status = { exited: false }; child.once('exit', () => { status.exited = true; }); return status;
  }, open: async () => { opened++; } };
  const results = await Promise.all([launcher.launch(options), launcher.launch(options)]);
  assert.equal(opened, 2); assert.ok(results.some(result => result.upgraded)); assert.notEqual(legacy.exitCode, null);
  const winner = await launcher.probeService(port, { expectedRuntime }); assert.equal(winner.state, 'ready');
  assert.ok(replacements.some(child => child.pid === winner.pid && child.exitCode === null));
  assert.ok(replacements.length <= 2, 'each concurrent click starts at most once');
});
