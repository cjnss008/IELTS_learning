'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto').webcrypto;
const U = require('../assets/user-data-store.js');
const copy = structuredClone;
function snapshot(text) { return { schemaVersion: 1, profile: { id: 'legacy', name: 'Synthetic family learner', createdAt: '2026-10-01T00:00:00.000Z' }, entries: { 'ielts52-course-player-v1': text }, session: {}, databases: U.DATABASES.map(db => ({ name: db.name, stores: [{ name: db.store, rows: [] }] })) }; }
function fixture() {
  let localValue = snapshot('original'), metadataValue = null, diskValue = null, revision = 0, loseResponse = false, diskPath = 'Z:/synthetic family data';
  const candidates = [], commits = [];
  const response = () => ({ ok: true, revision, snapshot: copy(diskValue), resetEpoch: null, updatedAt: '2026-10-26T09:00:00.000Z' });
  const remote = {
    status: async () => ({ ok: true, path: diskPath, activeProfileId: 'legacy', profiles: diskValue ? [{ profile: copy(diskValue.profile), revision, resetEpoch: null }] : [] }),
    getSnapshot: async () => response(),
    putSnapshot: async (id, body) => {
      commits.push(copy(body));
      if (body.expectedRevision !== revision) throw Object.assign(Error('stale revision'), { code: 'USER_DATA_CONFLICT', status: 409, currentRevision: revision });
      diskValue = copy(body.snapshot); revision++;
      if (loseResponse) { loseResponse = false; throw Object.assign(Error('saved but response disconnected'), { code: 'USER_DATA_TIMEOUT' }); }
      return response();
    },
    saveConflict: async (id, body) => { candidates.push(copy(body)); return { conflictId: 'conflict-' + candidates.length }; },
    putBlob: async () => assert.fail('no blob expected'), getBlob: async () => assert.fail('no blob expected')
  };
  const local = { listProfiles: async () => [copy(localValue.profile)], readProfile: async () => copy(localValue), writeProfile: async value => { localValue = copy(value); }, activeProfileId: async () => 'legacy', restoreRegistry: async () => {} };
  const metadata = { read: () => copy(metadataValue), write: value => { metadataValue = copy(value); } };
  const bridge = U.createBridge({ local, remote, metadata, crypto });
  return { bridge, remote, candidates, commits, edit(text) { localValue.entries['ielts52-course-player-v1'] = text; bridge.markDirty('legacy'); }, editDisk(run) { run(diskValue); }, setPath(value) { diskPath = value; }, loseNextResponse() { loseResponse = true; }, disk() { return copy(diskValue); }, local() { return copy(localValue); }, revision: () => revision };
}
test('a save committed before its response was lost is acknowledged on retry without a false conflict', async t => {
  const f = fixture(); t.after(() => f.bridge.stop()); await f.bridge.initialise();
  f.edit('finished family draft'); f.loseNextResponse();
  await assert.rejects(f.bridge.syncNow(), { code: 'USER_DATA_TIMEOUT' });
  assert.equal(f.revision(), 2); assert.equal(f.disk().entries['ielts52-course-player-v1'], 'finished family draft');
  await f.bridge.syncNow();
  assert.equal(f.bridge.status().state, 'ready'); assert.deepEqual(f.bridge.status().pendingProfiles, []);
  assert.equal(f.revision(), 2); assert.equal(f.candidates.length, 0); f.bridge.assertWritable('legacy');
});
test('a genuinely different newer local draft after a lost response stays separate and cannot overwrite disk', async t => {
  const f = fixture(); t.after(() => f.bridge.stop()); await f.bridge.initialise(); f.edit('accepted draft'); f.loseNextResponse();
  await assert.rejects(f.bridge.syncNow(), { code: 'USER_DATA_TIMEOUT' }); f.edit('newer unsaved draft');
  await assert.rejects(f.bridge.syncNow(), { code: 'USER_DATA_CONFLICT' });
  assert.equal(f.disk().entries['ielts52-course-player-v1'], 'accepted draft'); assert.equal(f.local().entries['ielts52-course-player-v1'], 'newer unsaved draft');
  assert.equal(f.candidates[0].snapshot.entries['ielts52-course-player-v1'], 'newer unsaved draft'); assert.equal(f.revision(), 2);
});
test('the first upload can recover its lost response only in the same observed data directory', async t => {
  for (const changePath of [false, true]) await t.test(changePath ? 'changed directory stays fenced' : 'same directory confirms initial upload', async t => {
    const f = fixture(); t.after(() => f.bridge.stop()); f.loseNextResponse(); assert.equal((await f.bridge.initialise()).state, 'offline');
    if (changePath) f.setPath('Y:/different synthetic family');
    if (changePath) { await assert.rejects(f.bridge.syncNow(), { code: 'USER_DATA_CONFLICT' }); assert.equal(f.candidates.length, 1); }
    else { await f.bridge.syncNow(); assert.equal(f.bridge.status().state, 'ready'); assert.equal(f.candidates.length, 0); }
    assert.equal(f.revision(), 1); assert.equal(f.disk().entries['ielts52-course-player-v1'], 'original');
  });
});
test('matching text cannot hide a different generation or session value during acknowledgement', async t => {
  for (const field of ['generation', 'session']) await t.test(field, async t => {
    const f = fixture(); t.after(() => f.bridge.stop()); await f.bridge.initialise(); f.edit('same text'); f.loseNextResponse();
    await assert.rejects(f.bridge.syncNow(), { code: 'USER_DATA_TIMEOUT' });
    f.editDisk(value => { if (field === 'generation') value.entries[U.GENERATION] = 'different-generation'; else value.session['ielts52-selection-ai-cache-v1'] = 'different-session'; });
    const before = f.disk(); await assert.rejects(f.bridge.syncNow(), { code: 'USER_DATA_CONFLICT' }); assert.deepEqual(f.disk(), before); assert.equal(f.candidates.length, 1);
  });
});
test('a changed data directory is never accepted merely because its complete snapshot is identical', async t => {
  const f = fixture(); t.after(() => f.bridge.stop()); await f.bridge.initialise(); f.edit('same text'); f.loseNextResponse();
  await assert.rejects(f.bridge.syncNow(), { code: 'USER_DATA_TIMEOUT' }); f.setPath('Y:/another synthetic family');
  await assert.rejects(f.bridge.syncNow(), { code: 'USER_DATA_CONFLICT' }); assert.equal(f.revision(), 2); assert.equal(f.candidates.length, 1);
});
test('a new edit during acknowledgement remains pending and is subsequently committed with CAS', async t => {
  const f = fixture(); t.after(() => f.bridge.stop()); await f.bridge.initialise(); f.edit('accepted text'); f.loseNextResponse();
  await assert.rejects(f.bridge.syncNow(), { code: 'USER_DATA_TIMEOUT' });
  const get = f.remote.getSnapshot; f.remote.getSnapshot = async (...args) => { const result = await get(...args); f.edit('edited while acknowledgement was read'); return result; };
  await f.bridge.syncNow(); assert.deepEqual(f.bridge.status().pendingProfiles, ['legacy']); assert.equal(f.revision(), 2);
  f.remote.getSnapshot = get; await f.bridge.syncNow(); assert.equal(f.revision(), 3); assert.equal(f.disk().entries['ielts52-course-player-v1'], 'edited while acknowledgement was read'); assert.equal(f.candidates.length, 0);
});
test('actual isolated REST commit with a discarded response recovers without an overriding write', async t => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { createServer } = require('../server/server.cjs'), { fakeBrowser } = require('./user-data-cache-fixture.cjs');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ielts-p0-ack-')), rootDir = path.join(temp, 'app'); fs.mkdirSync(rootDir); fs.writeFileSync(path.join(rootDir, 'VERSION'), '0.0.0');
  const server = createServer({ rootDir, dataDir: path.join(temp, 'synthetic-data'), migrateLegacy: false, materialMigration: false, defaultCredentialPersistence: false, fetchImpl: async () => { throw Error('no real provider allowed'); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir())); fs.rmSync(temp, { recursive: true, force: true }); });
  const base = 'http://127.0.0.1:' + server.address().port; let discard = false, writes = 0;
  const remote = U.createRemote({ fetch: async (url, init) => { const result = await fetch(base + url, init); if (init.method === 'PUT' && url.endsWith('/snapshot')) { writes++; if (discard && result.ok) { discard = false; await result.json(); throw Object.assign(Error('discarded successful response'), { code: 'USER_DATA_TIMEOUT' }); } } return result; } });
  const cache = fakeBrowser(), local = U.createBrowserAdapter(cache); await local.writeProfile(snapshot('initial REST draft')); await local.restoreRegistry([snapshot('').profile], 'legacy');
  const bridge = U.createBridge({ local, remote, metadata: local.metadata, crypto }); t.after(() => bridge.stop()); await bridge.initialise();
  cache.storage.setItem('ielts52-course-player-v1', 'final REST draft'); bridge.markDirty('legacy'); discard = true;
  await assert.rejects(bridge.syncNow(), { code: 'USER_DATA_TIMEOUT' }); await bridge.syncNow();
  const saved = await remote.getSnapshot('legacy'); assert.equal(saved.revision, 2); assert.equal(saved.snapshot.entries['ielts52-course-player-v1'], 'final REST draft');
  assert.equal(writes, 3, 'initial write, accepted write, and rejected CAS retry; no force overwrite'); assert.equal(bridge.status().state, 'ready');
  const conflicts = await fetch(base + '/api/user-data/profiles/legacy/conflicts').then(response => response.json()); assert.deepEqual(conflicts.conflicts, []);
});
