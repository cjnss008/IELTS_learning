'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createServer } = require('../server/server.cjs');
const curriculum = require('../assets/curriculum-data.js');
const { fixture, sha, hash } = require('./year-material-fixture.cjs');
// Native Windows directory-link tests need a local filesystem; the app itself
// remains free to run from NAS. All fixtures and synthetic user data stay here.
const cacheRoot = path.join(os.tmpdir(), 'ielts-year-material-http-fixtures');
const response = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

function diskFixture(options = {}) { fs.mkdirSync(cacheRoot, { recursive: true }); const rootDir = fs.mkdtempSync(path.join(cacheRoot, 'isolated-')); const f = fixture({ ...options, rootDir }); f.writeFiles(); return f; }
async function host(t, f, options = {}) {
  const catalog = { rootDir: f.root, data: f.data, getContextCatalog: () => f.contextCatalog, readFile: file => { f.reads.push(file); return fs.readFileSync(file); } };
  if (options.nativeReader) delete catalog.readFile;
  if (options.injectManifest) catalog.manifest = f.manifest;
  let calls = 0;
  const server = createServer({ rootDir: f.root, dataDir: path.join(f.root, 'synthetic-user-data'), migrateLegacy: false, materialMigration: false, yearFirstUseCatalog: catalog, fetchImpl: async (url, request) => {
    if (url.endsWith('/models')) return response({ data: [{ id: 'synthetic-model' }] });
    calls++; const input = JSON.parse(request.body);
    if (input.messages[0].content.includes('当前指定义项')) return response({ choices: [{ message: { content: JSON.stringify({ correct: true, usedForm: 'learn', evidenceQuote: 'learn English', feedback: 'learn English 在新情境中的词义与搭配正确。' }) } }] });
    assert.match(input.messages[0].content, /当前只收到教材原文，没有收到声音/);
    return response({ choices: [{ message: { content: '自然中文意思与一般听辨练法。请回到原音核对。' } }] });
  } });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = 'http://127.0.0.1:' + server.address().port;
  let closed = false;
  async function close() { if (closed) return; closed = true; await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); }
  t.after(async () => { await close(); assert(f.root.startsWith(cacheRoot + path.sep)); fs.rmSync(f.root, { recursive: true, force: true }); });
  async function api(route, body) { const result = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); const bytes = Buffer.from(await result.arrayBuffer()); return { status: result.status, headers: result.headers, bytes, data: JSON.parse(bytes) }; }
  return { api, base, close, calls: () => calls, connect: () => api('/api/ai/connect', { baseUrl: 'https://synthetic.example/v1', apiKey: 'synthetic-test-key-never-real', preferredModel: 'synthetic-model' }) };
}
const materialURL = job => '/api/year-first-use/material?id=' + encodeURIComponent(job.materialId) + '&hash=' + job.materialHash;

test('actual inactive HTTP service reads no year bootstrap, index or material and preserves old course behavior', async t => {
  const f = diskFixture(); f.data.yearFirstUse.active = false; const { api } = await host(t, f);
  let result = await api('/api/year-first-use/status'); assert.equal(result.status, 200); assert.equal(result.data.protocol, 1); assert.equal(result.data.active, false); assert.equal(result.data.manifest, null); assert.equal(result.data.indexRef, null);
  result = await api(materialURL(f.jobs[0])); assert.equal(result.status, 409); assert.equal(result.data.error.code, 'YEAR_FIRST_USE_INACTIVE'); assert.equal(f.reads.length, 0);
  result = await api('/api/health'); assert.equal(result.status, 200);
});
test('actual active HTTP status binds all public metadata and raw material bytes exactly, loading one of 688', async t => {
  const f = diskFixture({ count: 688 }), before = JSON.stringify(f.data), { api } = await host(t, f);
  const result = await api('/api/year-first-use/status'); assert.equal(result.status, 200); assert.equal(result.data.protocol, 1); assert.equal(result.data.active, true); assert.equal(result.data.total, 688); assert.equal(result.data.materialReadProtocol, 1);
  assert.deepEqual(result.data.indexRef, f.indexRef); assert.deepEqual(result.data.manifest.index, f.indexRef); assert.deepEqual(result.data.contracts, Object.fromEntries(['inputHash', 'coreHash', 'publicPlanHash', 'contextCatalogHash'].map(key => [key, f.manifest[key]])));
  assert.equal(result.data.independentAssessmentEligible, false); assert.equal(result.data.independentTransferEligible, false); assert.equal(f.materialReads().length, 0);
  const material = await api(materialURL(f.jobs[0])); assert.equal(material.status, 200); assert.equal(material.headers.get('x-ielts-year-protocol'), '1'); assert.equal(sha(material.bytes), f.jobs[0].materialHash); assert.deepEqual(material.bytes, f.files.get(path.resolve(f.root, f.jobs[0].ref.path))); assert.equal(f.materialReads().length, 1);
  assert.equal(JSON.stringify(f.data), before); assert(!JSON.stringify(result.data).includes(f.root)); assert(!JSON.stringify(result.data).includes('synthetic-test-key-never-real'));
});
test('HTTP queue capability reflects loaded Backup, browser UserData and actual server entry-key support', async t => {
  const f = diskFixture(), { api } = await host(t, f), key = 'ielts52-year-first-use-v1';
  const backup = require('../assets/backup-core.js'), browser = require('../assets/user-data-store.js'), serverKeys = require('../server/user-data.cjs').ENTRY_KEYS;
  const expected = Object.hasOwn(backup.KEYS, key) && browser.KEYS.includes(key) && serverKeys.has(key) ? 1 : 0;
  assert.equal((await api('/api/year-first-use/status')).data.queueStorageProtocol, expected);
  // Even a current browser cannot turn a process with an old snapshot whitelist
  // into a queue-capable service. No user snapshot is read or changed here.
  if (serverKeys.has(key)) { serverKeys.delete(key); try { assert.equal((await api('/api/year-first-use/status')).data.queueStorageProtocol, 0); } finally { serverKeys.add(key); } }
});
test('actual HTTP request validation rejects duplicate parameters, unsafe paths, unknown ids and wrong hashes', async t => {
  const f = diskFixture(), { api } = await host(t, f);
  for (const route of ['/api/year-first-use/material?id=../private&hash=' + hash('a'), materialURL(f.jobs[0]) + '&id=' + f.reading.id, materialURL(f.jobs[0]) + '&path=private/config.json', '/api/year-first-use/material?id=' + f.reading.id + '&hash=bad']) assert.equal((await api(route)).status, 400);
  assert.equal(f.reads.length, 0);
  let result = await api('/api/year-first-use/material?id=' + f.reading.id + '&hash=' + hash('wrong')); assert.equal(result.status, 409); assert.equal(result.data.error.code, 'YEAR_MATERIAL_HASH'); assert.equal(f.materialReads().length, 0);
  result = await api('/api/year-first-use/material?id=expand-no-such-material&hash=' + hash('unknown')); assert.equal(result.status, 404);
});
test('actual HTTP refuses a corrupt index path, oversized material metadata and runtime source hash mismatch', async t => {
  for (const options of [{ editIndex: index => { index.jobs[0].ref.path = '../private/config.json'; } }, { editIndex: index => { index.jobs[0].ref.bytes = 131073; } }]) {
    const f = diskFixture(options), { api } = await host(t, f), result = await api('/api/year-first-use/status'); assert.equal(result.status, 503); assert.equal(f.materialReads().length, 0); assert(!JSON.stringify(result.data).includes(f.root));
  }
  const f = diskFixture(), component = f.runtimeContract.components[0]; fs.writeFileSync(path.resolve(f.root, component.path), 'different source'); const { api } = await host(t, f); const result = await api('/api/year-first-use/status'); assert.equal(result.status, 503); assert.equal(f.materialReads().length, 0);
});
test('actual HTTP refuses changed material bytes, stale teaching hashes and oversized actual content', async t => {
  for (const mutate of [file => { const bytes = fs.readFileSync(file); bytes[10] ^= 1; fs.writeFileSync(file, bytes); }, file => fs.writeFileSync(file, Buffer.alloc(131073, 32))]) {
    const f = diskFixture(), file = path.resolve(f.root, f.jobs[0].ref.path); mutate(file); const { api } = await host(t, f), result = await api(materialURL(f.jobs[0])); assert.equal(result.status, 503); assert.equal(result.data.material, undefined);
  }
  const f = diskFixture({ editMaterial: material => { material.passage += ' New text never reviewed.'; } }), { api } = await host(t, f); const result = await api(materialURL(f.jobs[0])); assert.equal(result.status, 503); assert.equal(result.data.error.code, 'YEAR_SOURCE_CONTENT_HASH');
});
test('native filesystem reader rejects oversize before hydration and directory links escaping the course root', async t => {
  const large = diskFixture(); fs.writeFileSync(path.resolve(large.root, large.jobs[0].ref.path), Buffer.alloc(131073, 32));
  const largeService = await host(t, large, { nativeReader: true });
  const rejected = await largeService.api(materialURL(large.jobs[0])); assert.equal(rejected.status, 503); assert.equal(rejected.data.error.code, 'YEAR_CONTENT_SIZE');
  const linked = diskFixture(), directory = path.join(linked.root, 'curriculum', 'year-first-use', 'materials'), outside = path.join(cacheRoot, 'outside-' + path.basename(linked.root));
  assert(directory.startsWith(linked.root + path.sep)); assert(outside.startsWith(cacheRoot + path.sep));
  fs.renameSync(directory, outside); fs.symlinkSync(outside, directory, process.platform === 'win32' ? 'junction' : 'dir');
  const linkedService = await host(t, linked, { nativeReader: true });
  t.after(() => { assert(outside.startsWith(cacheRoot + path.sep)); fs.rmSync(outside, { recursive: true, force: true }); });
  const result = await linkedService.api(materialURL(linked.jobs[0])); assert.equal(result.status, 503); assert.equal(result.data.error.code, 'YEAR_CONTENT_PATH');
});
test('ordinary year sources and derivatives reach both existing AI endpoints over HTTP, while exams get no help', async t => {
  const f = diskFixture(), service = await host(t, f); await service.connect();
  const input = { word: 'learn', meaning: '学习', context: 'A new evening class.', sentence: 'I learn English at a new evening class.' };
  for (const materialId of [f.reading.id, f.derived.id]) { const result = await service.api('/api/memory/evaluate', { ...input, materialId }); assert.equal(result.status, 200); assert.equal(result.data.correct, true); }
  let result = await service.api('/api/listening/explain', { materialId: f.listening.id, segment: 'I learn English' }); assert.equal(result.status, 200); assert.match(result.data.explanation, /回到原音/);
  result = await service.api('/api/listening/explain', { materialId: f.listening.id, segment: 'invented segment' }); assert.equal(result.status, 400);
  const calls = service.calls();
  for (const mode of ['assessment', 'gate', 'final', 'holdout', 'independent']) {
    assert.equal((await service.api('/api/memory/evaluate', { ...input, materialId: f.reading.id, mode })).status, 403);
    assert.equal((await service.api('/api/listening/explain', { materialId: f.listening.id, segment: 'I learn English', mode })).status, 403);
  }
  const exams = curriculum.materials.filter(material => material.skill === 'listening' && ['gate', 'final', 'holdout'].includes(material.pool)); assert(exams.length > 0);
  for (const material of exams.slice(0, 5)) {
    assert.equal((await service.api('/api/memory/evaluate', { ...input, materialId: material.id })).status, 403);
    assert.equal((await service.api('/api/listening/explain', { materialId: material.id, segment: material.transcript?.slice(0, 20) || 'test' })).status, 403);
  }
  assert.equal(service.calls(), calls); assert(!JSON.stringify(result.data).includes('synthetic-test-key-never-real'));
});
test('HTTP status and failures cannot expose injected configuration or private exception diagnostics', async t => {
  const f = diskFixture(); f.manifest.privateConfiguration = { apiKey: 'secret-never-public', privatePath: f.root }; const { api } = await host(t, f, { injectManifest: true });
  const status = await api('/api/year-first-use/status'); assert.equal(status.status, 200); assert(!JSON.stringify(status.data).includes('secret-never-public')); assert(!JSON.stringify(status.data).includes(f.root));
  fs.unlinkSync(path.resolve(f.root, f.jobs[0].ref.path)); const result = await api(materialURL(f.jobs[0])); assert.equal(result.status, 503); assert(!JSON.stringify(result.data).includes(f.root)); assert(!JSON.stringify(result.data).includes('ENOENT')); assert(!JSON.stringify(result.data).includes('secret-never-public'));
});
