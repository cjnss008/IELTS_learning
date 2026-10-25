'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { createCredentialVault } = require('../server/credential-vault.cjs');
const { credentialPaths } = require('../server/credential-owner.cjs');
const { createUserData, DATABASES } = require('../server/user-data.cjs');
const { createDailyBackups } = require('../server/daily-backups.cjs');
const { createServer } = require('../server/server.cjs');
const AT = '2026-10-25T00:00:00.000Z', A = { deviceId: 'fixture-computer-a', userId: 'S-1-5-21-fixture-a' }, B = { deviceId: 'fixture-computer-b', userId: 'S-1-5-21-fixture-b' };
const clone = value => structuredClone(value), identity = owner => JSON.stringify(owner);
function cipher(owner, data) { return Buffer.from(JSON.stringify({ owner: identity(owner), data })).toString('base64'); }
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ielts-credential-owner-')), rootDir = path.join(dir, 'app'), dataDir = path.join(dir, 'isolated-data'), config = path.join(dataDir, 'config'); fs.mkdirSync(rootDir); fs.mkdirSync(config, { recursive: true });
  t.after(() => { assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('ielts-credential-owner-')); fs.rmSync(dir, { recursive: true, force: true }); });
  const filePath = path.join(config, 'credentials.dpapi'), preferenceFilePath = path.join(config, 'credential-policy.json');
  function vault(owner, initial = {}, extra = {}) {
    const values = clone(initial), unprotected = [], providers = Object.fromEntries(['ai', 'oral'].map(name => [name, { get: () => values[name] || null, restore: value => { values[name] = clone(value); } }]));
    const instance = createCredentialVault({ filePath, preferenceFilePath, ownerIdentity: owner, defaultEnabled: true, supported: true, providers,
      protect: async raw => cipher(owner, raw), unprotect: async raw => { unprotected.push(raw); const value = JSON.parse(Buffer.from(raw, 'base64').toString()); if (value.owner !== identity(owner)) throw Error('fake-private-provider-diagnostic'); return value.data; }, ...extra });
    return { instance, values, unprotected, get paths() { return instance.paths; } };
  }
  return { dir, rootDir, dataDir, config, filePath, preferenceFilePath, vault };
}
const providers = suffix => ({ ai: { baseUrl: 'https://fixture.invalid/v1', model: 'fixture-model', apiKey: 'fake-ai-' + suffix }, oral: { appid: 'fixture-app', appSecret: 'fake-oral-' + suffix, userId: 'fixture-user', clientIp: '203.0.113.8' } });
const legacy = (owner, values) => cipher(owner, JSON.stringify({ schemaVersion: 1, savedAt: AT, providers: values }));

test('owner filenames independently bind both device and account without exposing either identity in paths', () => {
  const filePath = path.join(os.tmpdir(), 'isolated-owner-path', 'credentials.dpapi'), first = credentialPaths({ filePath, ownerIdentity: A });
  const paths = [A, B, { ...A, userId: B.userId }, { ...A, deviceId: B.deviceId }].map(ownerIdentity => credentialPaths({ filePath, ownerIdentity }).filePath);
  assert.equal(new Set(paths).size, 4); assert.equal(credentialPaths({ filePath, ownerIdentity: { deviceId: A.deviceId.toUpperCase(), userId: A.userId.toUpperCase() } }).filePath, first.filePath);
  for (const current of paths) { assert.ok(current.startsWith(path.join(path.dirname(filePath), 'credential-owners') + path.sep)); assert.match(path.basename(path.dirname(current)), /^[a-f0-9]{64}$/); assert.ok(!current.includes(A.deviceId)); assert.ok(!current.includes(A.userId)); }
  assert.throws(() => credentialPaths({ filePath, ownerIdentity: { deviceId: '', userId: 'unknown' } }));
});

test('two concurrent device owners save and restart independently; disabling B changes neither A nor shared files', async t => {
  const f = fixture(t), a = f.vault(A, providers('a')), b = f.vault(B, providers('b'));
  await Promise.all([a.instance.restore(), b.instance.restore()]); await Promise.all([a.instance.saveIfEnabled(), b.instance.saveIfEnabled()]); const aBytes = fs.readFileSync(a.paths.filePath), aPreference = fs.readFileSync(a.paths.preferenceFilePath), bBytes = fs.readFileSync(b.paths.filePath);
  assert.notEqual(a.paths.filePath, b.paths.filePath); assert.equal(fs.existsSync(f.filePath), false); assert.equal(fs.existsSync(f.preferenceFilePath), false);
  const nextA = f.vault(A), nextB = f.vault(B); await Promise.all([nextA.instance.restore(), nextB.instance.restore()]); assert.deepEqual(nextA.values, providers('a')); assert.deepEqual(nextB.values, providers('b'));
  await nextB.instance.setEnabled(false); assert.deepEqual(fs.readFileSync(a.paths.filePath), aBytes); assert.deepEqual(fs.readFileSync(a.paths.preferenceFilePath), aPreference); assert.equal(fs.existsSync(b.paths.filePath), false); assert.ok(bBytes.length);
  const disabledB = f.vault(B); assert.equal((await disabledB.instance.restore()).enabled, false); assert.deepEqual(disabledB.values, {}); assert.equal(disabledB.unprotected.length, 0);
});

test('legacy credentials migrate only after this owner decrypts them and remain untouched when another computer first configures', async t => {
  const f = fixture(t), shared = legacy(A, providers('legacy-a')); fs.writeFileSync(f.filePath, shared); fs.writeFileSync(f.preferenceFilePath, JSON.stringify({ schemaVersion: 1, enabled: true, updatedAt: AT })); const policy = fs.readFileSync(f.preferenceFilePath);
  const a = f.vault(A); assert.equal((await a.instance.restore()).error, null); assert.deepEqual(a.values, providers('legacy-a')); assert.equal(fs.readFileSync(a.paths.filePath, 'utf8'), shared);
  const aBytes = fs.readFileSync(a.paths.filePath), b = f.vault(B), state = await b.instance.restore(); assert.equal(state.errorCode, 'LOCAL_CONFIGURATION_REQUIRED'); assert.equal(state.enabled, true); assert.match(state.error, /首次配置/); assert.deepEqual(b.values, {}); assert.equal(fs.existsSync(b.paths.filePath), false);
  const publicState = JSON.stringify(state); for (const sensitive of ['fake-private-provider-diagnostic', 'fake-ai-', 'fake-oral-', A.deviceId, A.userId, f.dir]) assert.ok(!publicState.includes(sensitive));
  Object.assign(b.values, providers('new-b')); await b.instance.saveIfEnabled(); const restartB = f.vault(B); await restartB.instance.restore(); assert.deepEqual(restartB.values, providers('new-b')); assert.equal(restartB.unprotected.length, 1); assert.deepEqual(fs.readFileSync(a.paths.filePath), aBytes); assert.equal(fs.readFileSync(f.filePath, 'utf8'), shared); assert.deepEqual(fs.readFileSync(f.preferenceFilePath), policy);
  await a.instance.setEnabled(false); assert.equal(fs.readFileSync(f.filePath, 'utf8'), shared); assert.deepEqual(fs.readFileSync(f.preferenceFilePath), policy); assert.equal(fs.existsSync(b.paths.filePath), true);
});

test('another Windows user on the same computer cannot read or overwrite the first user configuration', async t => {
  const f = fixture(t), secondUser = { ...A, userId: B.userId }, a = f.vault(A, providers('same-device-a')); await a.instance.restore(); await a.instance.saveIfEnabled(); const before = fs.readFileSync(a.paths.filePath), b = f.vault(secondUser, providers('same-device-b')); await b.instance.restore(); assert.equal(b.unprotected.length, 0); await b.instance.saveIfEnabled(); assert.deepEqual(fs.readFileSync(a.paths.filePath), before); const again = f.vault(A); await again.instance.restore(); assert.deepEqual(again.values, providers('same-device-a'));
});

test('an explicitly supplied old local file migrates after decryption without replacing a foreign shared file', async t => {
  const f = fixture(t), shared = legacy(A, providers('shared-a')), oldLocal = path.join(f.dir, 'old-local.dpapi'), local = legacy(B, providers('local-b')); fs.writeFileSync(f.filePath, shared); fs.writeFileSync(oldLocal, local); fs.writeFileSync(f.preferenceFilePath, JSON.stringify({ schemaVersion: 1, enabled: false, updatedAt: AT }));
  const b = f.vault(B, {}, { legacyFilePaths: [oldLocal] }); assert.equal((await b.instance.restore()).error, null); assert.deepEqual(b.values, providers('local-b')); assert.deepEqual(b.unprotected, [shared, local]); assert.equal(fs.readFileSync(b.paths.filePath, 'utf8'), local); assert.equal(fs.readFileSync(f.filePath, 'utf8'), shared); assert.equal(fs.readFileSync(oldLocal, 'utf8'), local);
});

test('an explicit file override has no implicit extra legacy source, and declared invalid old sources never migrate', async t => {
  const f = fixture(t), oldLocal = path.join(f.dir, 'unrelated-local.dpapi'); fs.writeFileSync(oldLocal, legacy(A, providers('unrelated'))); const none = f.vault(A, {}, { legacyFilePaths: null }); await none.instance.restore(); assert.deepEqual(none.values, {}); assert.equal(none.unprotected.length, 0); assert.equal(fs.existsSync(none.paths.filePath), false);
  fs.writeFileSync(oldLocal, cipher(A, JSON.stringify({ schemaVersion: 1, savedAt: AT, providers: { unknown: { apiKey: 'fake-unknown' } } }))); const invalid = f.vault(A, {}, { legacyFilePaths: [oldLocal] }); assert.equal((await invalid.instance.restore()).errorCode, 'LOCAL_CONFIGURATION_REQUIRED'); assert.equal(fs.existsSync(invalid.paths.filePath), false); assert.deepEqual(invalid.values, {}); assert.throws(() => f.vault(A, {}, { legacyFilePaths: ['relative.dpapi'] }));
});

test('server startup delegates local credential migration without refreshing a different owner shared ciphertext', async t => {
  const f = fixture(t), shared = legacy(A, providers('factory-shared-a')), oldLocal = path.join(f.dir, 'old-local.dpapi'), local = legacy(B, providers('factory-local-b')), digest = crypto.createHash('sha256').update(shared).digest('hex'); fs.writeFileSync(f.filePath, shared); fs.writeFileSync(oldLocal, local); fs.writeFileSync(path.join(f.config, 'migration.json'), JSON.stringify({ schemaVersion: 1, items: [{ kind: 'credentials', sourceHash: digest, copiedHash: digest }] }));
  const b = f.vault(B, {}, { legacyFilePaths: [oldLocal] }), server = createServer({ rootDir: f.rootDir, dataDir: f.dataDir, materialMigration: false, migrateLegacy: true, credentialVault: b.instance, legacyDataPaths: { credentials: oldLocal, budget: null, 'writing-signing': null }, fetchImpl: async () => { throw Error('No real upstream is used by owner migration tests.'); } }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/user-data/status'); assert.equal(response.status, 200); assert.deepEqual(b.values, providers('factory-local-b')); assert.equal(fs.readFileSync(f.filePath, 'utf8'), shared); assert.equal(fs.readFileSync(oldLocal, 'utf8'), local); assert.equal(fs.readFileSync(b.paths.filePath, 'utf8'), local); } finally { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); }
});

test('a server with an explicit credential file never falls back to unrelated LOCALAPPDATA credentials', async t => {
  const f = fixture(t), appdata = path.join(f.dir, 'unrelated-appdata'), oldFile = path.join(appdata, 'IELTS Learning', 'credentials.dpapi'), saved = process.env.LOCALAPPDATA; fs.mkdirSync(path.dirname(oldFile), { recursive: true }); fs.writeFileSync(oldFile, legacy(A, providers('unrelated-appdata'))); process.env.LOCALAPPDATA = appdata; let server;
  try { server = createServer({ rootDir: f.rootDir, dataDir: f.dataDir, materialMigration: false, migrateLegacy: false, credentialFilePath: f.filePath, legacyCredentialFilePaths: [], fetchImpl: async () => { throw Error('No real upstream is used by owner isolation tests.'); } }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/settings/persistence'), state = await response.json(); assert.equal(response.status, 200); assert.equal(state.error, null); assert.equal(state.errorCode, null); assert.deepEqual(state.restoredProviders, []); assert.equal(fs.readFileSync(oldFile, 'utf8'), legacy(A, providers('unrelated-appdata'))); } finally { if(saved===undefined)delete process.env.LOCALAPPDATA;else process.env.LOCALAPPDATA=saved;if(server?.listening)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}); }
});

test('legacy opt-out applies only after successful owner decryption, and local opt-out prevents legacy resurrection', async t => {
  const f = fixture(t), shared = legacy(A, providers('disabled-a')); fs.writeFileSync(f.filePath, shared); fs.writeFileSync(f.preferenceFilePath, JSON.stringify({ schemaVersion: 1, enabled: false, updatedAt: AT }));
  const a = f.vault(A), b = f.vault(B); assert.equal((await a.instance.restore()).enabled, false); assert.deepEqual(a.values, {}); assert.equal(fs.existsSync(a.paths.filePath), false); assert.equal((await b.instance.restore()).enabled, true); assert.equal(b.instance.status().errorCode, 'LOCAL_CONFIGURATION_REQUIRED');
  const again = f.vault(A); await again.instance.restore(); assert.equal(again.unprotected.length, 0); assert.equal(again.instance.status().enabled, false); assert.equal(fs.readFileSync(f.filePath, 'utf8'), shared);
});

test('an unreadable owner file never falls back to an older shared connection or overwrites either ciphertext', async t => {
  const f = fixture(t), a = f.vault(A, providers('current-a')); await a.instance.restore(); await a.instance.saveIfEnabled(); const shared = legacy(A, providers('outdated-a')); fs.writeFileSync(f.filePath, shared); fs.writeFileSync(a.paths.filePath, 'damaged-owned-cipher'); const next = f.vault(A), state = await next.instance.restore();
  assert.equal(state.errorCode, 'LOCAL_CONFIGURATION_UNREADABLE'); assert.deepEqual(next.values, {}); assert.deepEqual(next.unprotected, ['damaged-owned-cipher']); assert.equal(fs.readFileSync(a.paths.filePath, 'utf8'), 'damaged-owned-cipher'); assert.equal(fs.readFileSync(f.filePath, 'utf8'), shared);
});

test('a damaged owner file keeps an explicit remember preference so reconnecting saves and survives restart', async t => {
  const f = fixture(t), initial = f.vault(A, providers('before-damage'), { defaultEnabled: false }); await initial.instance.restore(); await initial.instance.setEnabled(true); fs.writeFileSync(initial.paths.filePath, 'damaged-owner-ciphertext');
  const reconnect = f.vault(A, {}, { defaultEnabled: false }), state = await reconnect.instance.restore(); assert.equal(state.errorCode, 'LOCAL_CONFIGURATION_UNREADABLE'); assert.equal(state.enabled, true); assert.deepEqual(reconnect.values, {}); assert.equal(fs.readFileSync(initial.paths.filePath, 'utf8'), 'damaged-owner-ciphertext');
  Object.assign(reconnect.values, providers('after-reconnect')); const saved = await reconnect.instance.saveIfEnabled(); assert.equal(saved.enabled, true); assert.equal(saved.error, null); assert.notEqual(fs.readFileSync(initial.paths.filePath, 'utf8'), 'damaged-owner-ciphertext');
  const restarted = f.vault(A, {}, { defaultEnabled: false }); assert.equal((await restarted.instance.restore()).enabled, true); assert.deepEqual(restarted.values, providers('after-reconnect')); assert.equal(restarted.instance.status().error, null);
});

test('an unknown owner identity cannot write the shared legacy path', async t => {
  const f = fixture(t), shared = legacy(A, providers('keep')); fs.writeFileSync(f.filePath, shared); const a = f.vault(A, providers('new'), { ownerIdentity: () => { throw Error('isolated-owner-resolution-failure'); } });
  assert.equal((await a.instance.restore()).errorCode, 'CREDENTIAL_OWNER_UNAVAILABLE'); await assert.rejects(a.instance.setEnabled(true)); assert.equal(fs.readFileSync(f.filePath, 'utf8'), shared); assert.equal(fs.existsSync(path.join(f.config, 'credential-owners')), false);
});

test('owner directories cannot redirect vault reads or writes through a directory junction', async t => {
  const f = fixture(t), a = f.vault(A, providers('blocked')), outside = path.join(f.dir, 'outside'), ownedDirectory = path.dirname(a.paths.filePath); fs.mkdirSync(outside); fs.mkdirSync(path.dirname(ownedDirectory), { recursive: true }); fs.symlinkSync(outside, ownedDirectory, 'junction'); await assert.rejects(a.instance.setEnabled(true)); assert.deepEqual(fs.readdirSync(outside), []);
});

test('a complete config backup restores every owner ciphertext and policy, while clearing progress preserves them', async t => {
  const f = fixture(t), options = { rootDir: f.rootDir, dataDir: f.dataDir, migrateLegacy: false, now: () => new Date(AT) }; let userData = createUserData(options), backups = createDailyBackups({ userData, now: options.now });
  const snapshot = { schemaVersion: 1, profile: { id: 'legacy', name: 'Isolated owner backup', createdAt: AT }, entries: {}, session: {}, databases: Object.entries(DATABASES).map(([name, store]) => ({ name, stores: [{ name: store, rows: [] }] })) }; await userData.putSnapshot('legacy', { expectedRevision: 0, snapshot, activate: true });
  const a = f.vault(A, providers('backup-a'), { exclusive: userData.withLock }), b = f.vault(B, providers('backup-b'), { exclusive: userData.withLock }); await Promise.all([a.instance.restore(), b.instance.restore()]); await Promise.all([a.instance.saveIfEnabled(), b.instance.saveIfEnabled()]); const oldA = fs.readFileSync(a.paths.filePath), oldB = fs.readFileSync(b.paths.filePath);
  const created = await backups.create({ dayKey: '2026-10-25' }), index = JSON.parse(fs.readFileSync(backups.paths.index)), manifest = JSON.parse(fs.readFileSync(path.join(backups.paths.manifests, index.backups[0].manifestFile))); assert.equal(manifest.entries.filter(entry => entry.path.startsWith('config/credential-owners/') && /(?:\.dpapi|credential-policy\.json)$/.test(entry.path)).length, 4);
  Object.assign(a.values, providers('later-a')); Object.assign(b.values, providers('later-b')); await Promise.all([a.instance.saveIfEnabled(), b.instance.saveIfEnabled()]); await Promise.all([a.instance.freeze(), b.instance.freeze()]); const restored = await backups.restore('2026-10-25', { expectedManifestSha256: created.backup.sha256 }); assert.equal(restored.ok, true); userData = createUserData(options);
  const againA = f.vault(A, {}, { exclusive: userData.withLock }), againB = f.vault(B, {}, { exclusive: userData.withLock }); await Promise.all([againA.instance.restore(), againB.instance.restore()]); assert.deepEqual(againA.values, providers('backup-a')); assert.deepEqual(againB.values, providers('backup-b')); assert.deepEqual(fs.readFileSync(a.paths.filePath), oldA); assert.deepEqual(fs.readFileSync(b.paths.filePath), oldB);
  const previous = await userData.getSnapshot('legacy'); await userData.resetProfile('legacy', previous.revision); assert.deepEqual(fs.readFileSync(a.paths.filePath), oldA); assert.deepEqual(fs.readFileSync(b.paths.filePath), oldB); assert.ok(!JSON.stringify([created, restored]).includes('fake-ai-'));
});
