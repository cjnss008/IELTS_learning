'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBudget } = require('../server/budget.cjs');
const { spawnSync } = require('node:child_process');
const config = { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' };
const unknown = { baseUrl: 'https://example.test/v1', model: 'unquoted-model' };
const messages = [{ role: 'user', content: 'Mock learning text.' }];

test('an already loaded budget cannot rewrite its ledger while a full restore marker is present', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ielts-budget-restore-')), filePath = path.join(dir, 'config', 'budget-ledger.json'), marker = path.join(dir, 'backups', 'daily', 'restore-in-progress.json');
  const budget = createBudget({ filePath });
  t.after(() => { budget.close(); const target=path.resolve(dir); assert.equal(path.dirname(target),path.resolve(os.tmpdir())); assert.ok(path.basename(target).startsWith('ielts-budget-restore-')); fs.rmSync(target,{recursive:true,force:true}); });
  assert.equal(budget.status(config).state, 'ok'); const before=fs.readFileSync(filePath); fs.mkdirSync(path.dirname(marker),{recursive:true}); fs.writeFileSync(marker,'{"schemaVersion":1,"id":"fixture"}');
  assert.throws(()=>budget.configure({enabled:true,monthlyLimitCny:25}),error=>error.code==='BUDGET_BLOCKED'); budget.reserveText(config,messages,20); assert.deepEqual(fs.readFileSync(filePath),before); assert.equal(budget.status(config).state,'blocked');
});
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ielts-budget-test-'));
  const filePath = path.join(dir, 'ledger.json');
  const opened = [];
  t.after(() => { for (const b of opened) b.close(); if (path.dirname(dir) === os.tmpdir() && path.basename(dir).startsWith('ielts-budget-test-')) fs.rmSync(dir, { recursive: true, force: true }); });
  return { dir, filePath, open(options = {}) { const b = createBudget({ filePath, ...options }); opened.push(b); return b; } };
}
test('budget is disabled by default and unknown providers never block learning', t => {
  const f = fixture(t), b = f.open();
  assert.equal(b.status(unknown).enabled, false);
  const ticket = b.reserveText(unknown, messages, 6000);
  b.settle(ticket);
  const speech = b.reserveSpeech({ endpoint: 'https://demo.cognitiveservices.azure.com' }, 12);
  b.settle(speech);
  assert.equal(b.status().unpricedRequests, 2);
  assert.equal(b.status().reservedCny, 0);
  assert.equal(b.status(config).textPrice.inputPerMillionCny, 2);
  assert.equal(b.status(config).textPrice.outputPerMillionCny, 8);
  b.configure({ enabled: true });
  assert.throws(() => b.reserveText(unknown, messages, 10), { code: 'PRICE_UNKNOWN' });
  b.configure({ enabled: false, monthlyLimitCny: 250 });
  assert.ok(b.reserveText(unknown, messages, 10));
  const stored = fs.readFileSync(f.filePath, 'utf8');
  assert.ok(!stored.includes('Mock learning text'));
});
test('opt-in budget reserves synchronously across text and speech and settles known usage', t => {
  const f = fixture(t), b = f.open();
  b.configure({ enabled: true, monthlyLimitCny: 0.1, speechPrice: { endpoint: 'https://demo.cognitiveservices.azure.com', perMinuteCny: 0.6, billingIncrementSeconds: 1, source: 'Mock documented rate', confirmed: true } });
  const a = b.reserveText(config, messages, 6000);
  const status = b.status();
  assert.ok(status.reservedCny > .048 && status.reservedCny < .06);
  assert.throws(() => b.reserveText(config, messages, 6000), { code: 'BUDGET_EXHAUSTED' });
  assert.throws(() => b.reserveSpeech({ endpoint: 'https://demo.cognitiveservices.azure.com' }, 5), { code: 'BUDGET_EXHAUSTED' });
  b.settle(a, { prompt_tokens: 100, completion_tokens: 10 });
  assert.equal(b.status().spentCny, .00028);
  assert.equal(b.status().reservedCny, 0);
  const voice = b.reserveSpeech({ endpoint: 'https://demo.cognitiveservices.azure.com' }, 1.1);
  assert.equal(b.status().reservedCny, .02);
  b.settle(voice);
  assert.equal(b.status().uncertainCharges, 1);
  assert.equal(b.status().categories.speech.spentCny, .02);
});
test('persistent reservations recover conservatively and use Hong Kong month boundary', t => {
  const f = fixture(t); let date = new Date('2026-10-31T15:59:59Z');
  let b = f.open({ now: () => date });
  const ticket = b.reserveText(config, messages, 6000), reserved = b.status().reservedCny;
  assert.equal(b.status().month, '2026-10');
  b.close();
  b = f.open({ now: () => date });
  assert.equal(b.status().spentCny, reserved);
  assert.equal(b.status().reservedCny, 0);
  assert.equal(b.status().uncertainCharges, 1);
  b.settle(ticket, { prompt_tokens: 1, completion_tokens: 1 });
  assert.equal(b.status().spentCny, reserved);
  date = new Date('2026-10-31T16:00:00Z');
  assert.equal(b.status().month, '2026-11');
  assert.equal(b.status().spentCny, 0);
});
test('corrupt and locked ledgers stay intact and cannot block a disabled budget', t => {
  const f = fixture(t); fs.writeFileSync(f.filePath, '{damaged ledger');
  const b = f.open();
  assert.equal(b.status().enabled, false);
  assert.equal(b.status().state, 'blocked');
  assert.equal(b.reserveText(unknown, messages, 6000), null);
  assert.equal(fs.readFileSync(f.filePath, 'utf8'), '{damaged ledger');
  assert.throws(() => b.configure({ enabled: true }), { code: 'BUDGET_BLOCKED' });
  b.configure({ enabled: false });
  const other = f.open();
  assert.equal(other.reserveText(config, messages, 1), null);
  assert.equal(fs.readFileSync(f.filePath, 'utf8'), '{damaged ledger');
});
test('price changes are versioned and existing reservations retain their rate', t => {
  const f = fixture(t), b = f.open(), ticket = b.reserveText(config, messages, 100);
  const original = b.status(config).textPrice.version;
  b.configure({ textPrice: { ...config, inputPerMillionCny: 4, outputPerMillionCny: 16, source: 'Mock manual quote', confirmed: true } });
  assert.notEqual(b.status(config).textPrice.version, original);
  b.settle(ticket, { prompt_tokens: 100, completion_tokens: 100 });
  assert.equal(b.status().spentCny, .001);
  for (const body of [{ enabled: 'true' }, { monthlyLimitCny: -1 }, { monthlyLimitCny: Infinity }, { textPrice: { ...config, inputPerMillionCny: 2, outputPerMillionCny: 8, confirmed: false } }]) assert.throws(() => b.configure(body));
  b.configure({ enabled: true });
  assert.throws(() => b.configure({ enabled: false, monthlyLimitCny: -1 }));
  assert.equal(b.status().enabled, true);
});

test('a second writer respects an enabled ledger without overwriting its reservation', t => {
  const f = fixture(t), first = f.open();
  first.configure({ enabled: true });
  first.reserveText(config, messages, 100);
  const before = fs.readFileSync(f.filePath, 'utf8'), second = f.open();
  assert.equal(second.status().enabled, true);
  assert.throws(() => second.reserveText(config, messages, 1), { code: 'BUDGET_BLOCKED' });
  assert.equal(fs.readFileSync(f.filePath, 'utf8'), before);
  second.configure({ enabled: false });
  assert.equal(second.reserveText(config, messages, 1), null);
  assert.equal(fs.readFileSync(f.filePath, 'utf8'), before);
});

test('new locks record their host and clean shutdown releases only the owned lock', t => {
  const f=fixture(t),b=f.open();b.status();const lockPath=path.join(f.dir,'budget.lock'),lock=JSON.parse(fs.readFileSync(lockPath,'utf8'));
  assert.equal(lock.hostname,os.hostname());assert.equal(lock.pid,process.pid);assert.ok(Number.isFinite(Date.parse(lock.createdAt)));b.close();assert.equal(fs.existsSync(lockPath),false);
});

test('legacy, remote, live and dead-process locks remain intact with specific safe guidance', t => {
  const child=spawnSync(process.execPath,['-e','process.stdout.write(String(process.pid))'],{encoding:'utf8'});assert.equal(child.status,0);const deadPid=Number(child.stdout);
  const cases=[
    [{owner:'legacy-owner',pid:deadPid},/旧格式/],
    [{owner:'remote-owner',pid:process.pid,hostname:'different-host-'+os.hostname()},/另一台主机/],
    [{owner:'live-owner',pid:process.pid,hostname:os.hostname()},/仍持有/],
    [{owner:'dead-owner',pid:deadPid,hostname:os.hostname()},/进程已退出/]
  ];
  for(const [holder,expected]of cases){
    const f=fixture(t),initial=f.open();initial.status();initial.close();const before=fs.readFileSync(f.filePath,'utf8'),lockPath=path.join(f.dir,'budget.lock'),serialized=JSON.stringify(holder);fs.writeFileSync(lockPath,serialized);
    const blocked=f.open(),status=blocked.status();assert.equal(status.state,'blocked');assert.match(status.blockedReason,expected);assert.equal(blocked.reserveText(unknown,messages,100),null);blocked.close();assert.equal(fs.readFileSync(lockPath,'utf8'),serialized);assert.equal(fs.readFileSync(f.filePath,'utf8'),before);
  }
});
