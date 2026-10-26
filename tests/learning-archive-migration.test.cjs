'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const R = require('../assets/learning-records.js');
const { createLearningArchive, LIMITS } = require('../server/learning-archive.cjs');
const M = require('../server/learning-archive-migration.cjs');
const NOW = '2026-10-26T12:00:00.000Z';
const PROFILE_CREATED = '2026-10-01T00:00:00.000Z';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
const identity = (extra = {}) => ({ profileId: 'legacy', profileCreatedAt: PROFILE_CREATED, generation: 'generation-a', resetEpoch: null, ...extra });
function record(id = 'original-a', extra = {}) {
  return R.put(R.newState(), { id, materialId: 'material-a', materialVersion: 'v1', title: '原始作品', skill: 'writing', source: 'course-player', answer: '  I write my own answer.\r\n中文 e\u0301 🐈 \\"quoted\\"\t  ', minutes: 0, quantity: 1, unit: '份', createdAt: '2026-10-24T18:00:00.000Z', startedAt: '2026-10-24T18:00:00.000Z', submittedAt: '2026-10-24T18:00:00.000Z', ...extra }, NOW).record;
}
function revised(value, notes = 'second saved evaluation') {
  const current = copy(value), version = current.version + 1;
  const evaluation = { method: 'ai', result: 'revise', feedback: '精确反馈\r\nwith spaces  ' };
  current.version = version; current.notes = notes; current.evaluation = evaluation;
  current.assistance = { hint: false, answer: false, ai: true };
  current.history.push({ version, at: NOW, changeId: 'change-' + version, evaluation: copy(evaluation), assistance: copy(current.assistance), notes });
  return current;
}
function snapshot(records, { works = [], legacyEntry = false, generation = 'generation-a' } = {}) {
  const entries = generation === null ? {} : { [M.GENERATION_KEY]: generation };
  if (legacyEntry) entries[M.RECORDS_KEY] = JSON.stringify({ schemaVersion: 1, futureEnvelope: { preserved: true }, records }, null, 2);
  return { schemaVersion: 1, profile: { id: 'legacy', name: 'Synthetic test only', createdAt: PROFILE_CREATED }, entries, session: {}, databases: [
    { name: M.RECORDS_KEY, stores: [{ name: 'records', rows: records.map(value => ({ key: value.id, value })) }] },
    { name: 'ielts-media-v1', stores: [{ name: 'works', rows: works.map(value => ({ key: value.id, value })) }] },
    { name: 'ielts-diagnostic-audio-v1', stores: [{ name: 'clips', rows: [] }] },
    { name: 'ielts52-recovery-points-v1', stores: [{ name: 'points', rows: [] }] }
  ] };
}
function source(snapshotValue, extra = {}) {
  return { snapshot: snapshotValue, revision: 7, snapshotSha256: sha(Buffer.from(JSON.stringify(snapshotValue))), resetEpoch: null, generation: snapshotValue.entries[M.GENERATION_KEY] ?? null, timeZone: 'Asia/Hong_Kong', ...extra };
}
function fixture(t, { archiveOptions = {}, migrationOptions = {} } = {}) {
  // The explicit override also runs these same cases on a NAS scratch folder.
  // Routine regressions use local temporary storage, not the shared code root.
  const temporaryRoot = path.resolve(process.env.IELTS_ARCHIVE_TEST_ROOT || path.join(os.tmpdir(), 'ielts-archive-migration-tests'));
  fs.mkdirSync(temporaryRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'ielts-archive-migration-test-'));
  t.after(() => { assert.equal(path.dirname(directory), temporaryRoot); assert.match(path.basename(directory), /^ielts-archive-migration-test-/); fs.rmSync(directory, { recursive: true, force: true }); });
  const archive = createLearningArchive({ dataDir: directory, now: () => new Date(NOW), ...archiveOptions });
  return { directory, archive, migration: M.createLearningArchiveMigration({ archive, ...migrationOptions }) };
}
async function finish(migration, plan) {
  let cursor = 0;
  do { const result = await migration.copy(plan, { cursor, maxBatches: 1 }); cursor = result.cursor; if (result.done) break; } while (true);
  return migration.verify(plan);
}

test('full raw answers, every evaluation revision, compatible unknown fields, original row/entry order and parent IDs round-trip without regrading', async t => {
  const a = revised(record('z-original'));
  a.futureCompatibility = JSON.parse('{"__proto__":{"opaque":"kept"},"nested":["literal\\n",{"key":"value"}]}');
  a.history[0].futureReview = { reviewer: 'legacy extension', untouched: true };
  // Updating a later history must retain the exact prior extension.
  const b = record('a-correction'); Object.assign(b, { kind: 'correction', parentId: a.id });
  const raw = snapshot([a, b], { legacyEntry: true }), before = JSON.stringify(raw);
  const { migration } = fixture(t), plan = await migration.prepare(source(raw));
  assert.equal(plan.ready, true); assert.equal(plan.records[0].dayKey, '2026-10-25');
  const result = await finish(migration, plan);
  assert.equal(result.verified, true); assert.equal(result.casPerformed, false);
  assert.deepEqual(result.stats, { originals: 2, evaluationRevisions: 3, answerBytes: Buffer.byteLength(a.answer) + Buffer.byteLength(b.answer), recordBytes: Buffer.byteLength(M.stableJSON(a)) + Buffer.byteLength(M.stableJSON(b)), sourceDocumentsVerified: 2, sourceDocuments: 2, mediaMetadataCount: 0, mediaBlobs: 0, mediaBlobsVerified: 0, mediaBytes: 0 });
  const restored = await migration.read('legacy', a.id, { identity: plan.identity });
  assert.deepEqual(restored.record, a); assert.equal(restored.record.answer, a.answer);
  assert.equal(result.versionMappings[0].historyVersions.length, 2);
  assert.equal(restored.record.futureCompatibility.__proto__.opaque, 'kept');
  assert.equal((await migration.read('legacy', b.id, { identity: plan.identity })).record.parentId, a.id);
  assert.equal(JSON.stringify(raw), before); assert.equal({}.opaque, undefined);
});

test('same logical ID later evaluations are immutable revisions; sequence reads preserve the prior complete version', async t => {
  const { migration, archive } = fixture(t), a = record(), b = revised(a), frozen = identity();
  const first = await migration.appendRecordVersion('legacy', a, { identity: frozen, dayKey: '2026-10-25', requestId: 'write-first' });
  const base = await migration.read('legacy', a.id, { identity: frozen });
  const second = await migration.appendRecordVersion('legacy', b, { identity: frozen, dayKey: '2026-10-25', previous: base, requestId: 'write-second' });
  assert.notEqual(first.storageId, second.storageId);
  assert.match(first.storageId, /^lr-base-/); assert.match(second.storageId, /^lr-revision-.*-2$/);
  assert.deepEqual((await migration.read('legacy', a.id, { identity: frozen, asOfSequence: base.sequence })).record, a);
  const latest = await migration.read('legacy', a.id, { identity: frozen });
  assert.deepEqual(latest.record, b); assert.equal(latest.versionMap.length, 2);
  assert.deepEqual((await M.decodeRecordVersion('legacy', await archive.get('legacy', first.storageId))).record, a);
  assert.equal((await migration.appendRecordVersion('legacy', b, { identity: frozen, dayKey: '2026-10-25', requestId: 'write-second' })).duplicate, true);
  const changed = copy(b); changed.answer += ' edited';
  await assert.rejects(migration.appendRecordVersion('legacy', changed, { identity: frozen, dayKey: '2026-10-25' }), error => error.code === 'MIGRATION_SAME_VERSION_CONFLICT');
  assert.deepEqual((await migration.read('legacy', a.id, { identity: frozen })).record, b);
  assert.equal((await archive.verify('legacy')).totalRecords, 2);
});

test('new revisions cannot omit a saved evaluation, change opaque answers, jump versions, or use a stale predecessor', async t => {
  const { migration } = fixture(t), a = record(), frozen = identity();
  await migration.appendRecordVersion('legacy', a, { identity: frozen, dayKey: '2026-10-25' });
  const current = await migration.read('legacy', a.id, { identity: frozen });
  for (const invalid of [(() => { const value = revised(a); value.answer += 'changed'; return value; })(), (() => { const value = revised(a); value.history[0].evaluation.feedback = 'rewritten'; return value; })(), revised(revised(a))]) {
    await assert.rejects(migration.appendRecordVersion('legacy', invalid, { identity: frozen, dayKey: '2026-10-25' }), error => error.code === 'MIGRATION_REVISION_CONFLICT');
  }
  const b = revised(a); await migration.appendRecordVersion('legacy', b, { identity: frozen, dayKey: '2026-10-25' });
  await assert.rejects(migration.appendRecordVersion('legacy', revised(b), { identity: frozen, dayKey: '2026-10-25', previous: current }), error => error.code === 'MIGRATION_REVISION_CONFLICT');
  assert.deepEqual((await migration.read('legacy', a.id, { identity: frozen })).record, b);
});

test('legal >1MiB history is reversibly chunked under the existing cap and cannot verify from a partially copied plan', async t => {
  const huge = record();
  huge.version = 40;
  huge.history = Array.from({ length: 40 }, (_, index) => ({ version: index + 1, at: huge.createdAt, changeId: 'large-review-' + (index + 1), evaluation: { method: 'ai', result: 'revise', feedback: String(index).padStart(2, '0') + '字'.repeat(23998), criteria: Array.from({ length: 16 }, (_, criterion) => String(criterion).padStart(2, '0') + 'x'.repeat(998)) }, assistance: { hint: false, answer: false, ai: true }, notes: 'unabridged' }));
  Object.assign(huge, { evaluation: copy(huge.history[39].evaluation), assistance: copy(huge.history[39].assistance), notes: huge.history[39].notes });
  assert.equal(R.parseState({ schemaVersion: 1, records: [huge] }, NOW).records[0].history.length, 40);
  assert.ok(Buffer.byteLength(M.stableJSON(huge)) > LIMITS.recordBytes);
  const { migration, archive } = fixture(t), plan = await migration.prepare(source(snapshot([huge])));
  assert.equal(plan.ready, true); assert.ok(plan.records[0].chunkCount > 1); assert.ok(plan.batches.length > 1);
  for (const batch of plan.batches) for (const item of batch.originals) assert.ok(Buffer.byteLength(M.stableJSON(item.record)) <= LIMITS.recordBytes);
  const partial = await migration.copy(plan, { maxBatches: 1 }); assert.equal(partial.done, false);
  assert.equal((await migration.verify(plan)).verified, false);
  let cursor = partial.cursor;
  while (cursor < plan.batches.length) cursor = (await migration.copy(plan, { cursor })).cursor;
  const verified = await migration.verify(plan);
  assert.equal(verified.verified, true); assert.equal(verified.stats.evaluationRevisions, 40);
  assert.deepEqual((await migration.read('legacy', huge.id, { identity: plan.identity })).record, huge);
  assert.equal((await archive.verify('legacy')).totalRecords, plan.records[0].chunkCount + 1);
});

test('unknown-commit recovery retries the identical planned request and never duplicates or truncates originals', async t => {
  let failOnce = true;
  const { directory, migration } = fixture(t, { archiveOptions: { fault(stage) { if (stage === 'afterFrameSync' && failOnce) { failOnce = false; throw Error('simulated lost response after durable frame'); } } } });
  const raw = snapshot([record()]), before = JSON.stringify(raw), plan = await migration.prepare(source(raw));
  await assert.rejects(migration.copy(plan), error => error.commitOutcome === 'unknown' && error.retryWithSameRequest === true && error.requestId === plan.batches[0].requestId);
  const reopened = createLearningArchive({ dataDir: directory, now: () => new Date(NOW) });
  const resumed = M.createLearningArchiveMigration({ archive: reopened });
  const retried = await resumed.copy(plan); assert.equal(retried.done, true); assert.equal(retried.receipts[0].replayed, true);
  assert.equal((await resumed.verify(plan)).verified, true); assert.equal((await reopened.verify('legacy')).totalRecords, 1);
  assert.equal(JSON.stringify(raw), before);
});

test('packed work metadata, parent work and nested artifact references close over original binary bytes', async t => {
  const audioA = Buffer.from('synthetic original audio A'), audioB = Buffer.from('synthetic original audio B');
  const blob = bytes => ({ __ieltsBlob: { sha256: sha(bytes), size: bytes.length, mime: 'audio/webm' } });
  const works = [
    { id: 'work-parent-12345678', parentId: '', kind: 'audio', blob: blob(audioA), version: 3, review: { full: ['earlier', 'later'] }, unknownCompatibleField: { intact: true } },
    { id: 'work-child-12345678', parentId: 'work-parent-12345678', kind: 'audio', blob: blob(audioB), version: 1, diagnosis: { score: 12 } }
  ];
  const a = record('audio-record', { answer: JSON.stringify({ activity: { answer: JSON.stringify({ workIds: [works[1].id] }) } }), media: [{ id: works[1].id, name: 'Own recording', mime: 'audio/webm', durationSeconds: 2 }] });
  const seen = [], originals = new Map(works.map(item => [item.id, item]));
  const { migration } = fixture(t, { migrationOptions: { readMediaMetadata: async (id, context) => { seen.push({ id, context }); return originals.get(id); }, readMediaBytes: async id => id === sha(audioA) ? audioA : audioB } });
  const plan = await migration.prepare(source(snapshot([a], { works })));
  assert.equal(plan.ready, true); assert.equal(plan.mediaDependencies.length, 2); assert.equal(seen.length, 2);
  assert.equal(seen[0].context.sourceRevision, 7);
  const result = await finish(migration, plan); assert.equal(result.verified, true); assert.equal(result.stats.mediaBlobsVerified, 2); assert.equal(result.stats.mediaBytes, audioA.length + audioB.length);
  const restored = await migration.read('legacy', a.id, { identity: plan.identity });
  assert.deepEqual(restored.mediaMetadata, works.sort((a, b) => a.id.localeCompare(b.id))); assert.equal(restored.record.answer, a.answer);
});

test('missing or changed metadata blocks prepare, and missing/wrong original binary bytes block final verification', async t => {
  const bytes = Buffer.from('synthetic recording bytes'), ref = { id: 'work-recording-12345678', sha256: sha(bytes), size: bytes.length, mime: 'audio/webm', retained: { queue: 'reviewed' } };
  const a = record('with-audio', { media: [{ id: ref.id, name: 'Voice', mime: ref.mime, durationSeconds: 1 }] });
  const { archive } = fixture(t);
  const missing = M.createLearningArchiveMigration({ archive, readMediaMetadata: async () => null });
  const missingPlan = await missing.prepare(source(snapshot([a]))); assert.equal(missingPlan.ready, false); assert.equal(missingPlan.batches.length, 0); assert.equal(missingPlan.issues[0].code, 'MIGRATION_MEDIA_MISSING');
  const changed = M.createLearningArchiveMigration({ archive, readMediaMetadata: async () => ({ ...ref, retained: { changed: true } }) });
  const changedPlan = await changed.prepare(source(snapshot([a], { works: [ref] }))); assert.equal(changedPlan.ready, false); assert.equal(changedPlan.issues[0].code, 'MIGRATION_MEDIA_CHANGED');
  const metadataOnly = M.createLearningArchiveMigration({ archive, readMediaMetadata: async () => ref });
  const plan = await metadataOnly.prepare(source(snapshot([a]))); await metadataOnly.copy(plan);
  const unchecked = await metadataOnly.verify(plan); assert.equal(unchecked.verified, false); assert.equal(unchecked.issues[0].code, 'MIGRATION_MEDIA_BYTES_NOT_CHECKED');
  const wrong = M.createLearningArchiveMigration({ archive, readMediaBytes: async () => Buffer.from('wrong') });
  assert.equal((await wrong.verify(plan)).issues[0].code, 'MIGRATION_MEDIA_BYTES_MISMATCH');
  const right = M.createLearningArchiveMigration({ archive, readMediaBytes: async () => bytes });
  assert.equal((await right.verify(plan)).verified, true);
  assert.throws(() => M.encodeRecordVersion('legacy', a, { identity: identity(), dayKey: '2026-10-25' }), error => error.code === 'MIGRATION_MEDIA_MISSING');
});

test('source hash/revision/fences are explicit and source conflicts or invalid JSON are never silently normalised', async t => {
  const { migration } = fixture(t), raw = snapshot([record()]);
  await assert.rejects(migration.prepare(source(raw, { snapshotSha256: 'f'.repeat(64) })), error => error.code === 'MIGRATION_SNAPSHOT_HASH');
  await assert.rejects(migration.prepare(source(raw, { revision: 0 })), error => error.code === 'MIGRATION_SNAPSHOT_HASH');
  await assert.rejects(migration.prepare(source(raw, { generation: 'different' })), error => error.code === 'MIGRATION_IDENTITY');
  await assert.rejects(migration.prepare(source(raw, { resetEpoch: undefined })), error => error.code === 'MIGRATION_IDENTITY');
  const conflict = copy(raw); conflict.entries[M.RECORDS_KEY] = JSON.stringify({ schemaVersion: 1, records: [revised(record())] });
  await assert.rejects(migration.prepare(source(conflict)), error => error.code === 'MIGRATION_SOURCE_CONFLICT' && error.versions.join(',') === '1,2');
  const invalid = copy(raw); invalid.databases[0].stores[0].rows[0].value.unknown = undefined;
  await assert.rejects(migration.prepare(source(invalid)), error => error.code === 'MIGRATION_JSON');
  assert.throws(() => M.stableJSON({ sparse: Array(2) }), error => error.code === 'MIGRATION_JSON');
  let executed = false; const accessor = {}; Object.defineProperty(accessor, 'x', { enumerable: true, get() { executed = true; return 1; } });
  assert.throws(() => M.stableJSON(accessor), error => error.code === 'MIGRATION_JSON'); assert.equal(executed, false);
  const empty = snapshot([]); await assert.rejects(migration.prepare(source(empty, { timeZone: 'Not/A-Timezone' })), error => error.code === 'MIGRATION_DAY');
});

test('frozen storage identity survives current-generation changes; new reset namespaces cannot read old records', async t => {
  const { migration } = fixture(t), oldIdentity = identity(), currentIdentity = identity({ generation: 'reset:new-generation', resetEpoch: 'new-epoch' }), a = record();
  await migration.appendRecordVersion('legacy', a, { identity: oldIdentity, dayKey: '2026-10-25' });
  assert.notEqual(M.identityScope(oldIdentity), M.identityScope(currentIdentity));
  assert.notEqual(M.storageIds(oldIdentity, a.id).baseId, M.storageIds(currentIdentity, a.id).baseId);
  assert.equal(await migration.read('legacy', a.id, { identity: currentIdentity }), null);
  // A restored marker deliberately keeps its original storage identity, while
  // the HTTP layer separately verifies its current browser/profile fence.
  const restoredMarker = { identity: copy(oldIdentity) };
  assert.deepEqual((await migration.read('legacy', a.id, { identity: restoredMarker.identity })).record, a);
  const newOriginal = record(a.id, { answer: 'A different original after reset.' });
  await migration.appendRecordVersion('legacy', newOriginal, { identity: currentIdentity, dayKey: '2026-10-25' });
  assert.deepEqual((await migration.read('legacy', a.id, { identity: oldIdentity })).record, a);
  assert.deepEqual((await migration.read('legacy', a.id, { identity: currentIdentity })).record, newOriginal);
});

test('bounded resumable batches retain complete source order, and tampered plans cannot copy or verify', async t => {
  const limits = { recordBytes: 8000, frameBytes: 25000, segmentBytes: 60000, batchRecords: 3, segmentRecords: 6 };
  const { migration, archive } = fixture(t, { archiveOptions: { limits } });
  const records = Array.from({ length: 13 }, (_, index) => record('bounded-' + String(13 - index).padStart(2, '0'))), plan = await migration.prepare(source(snapshot(records)));
  assert.equal(plan.ready, true); assert.ok(plan.batches.length >= 5);
  const first = await migration.copy(plan); assert.equal(first.cursor, 1); assert.equal(first.done, false);
  assert.ok(first.receipts[0].createdCount <= 3);
  const changed = copy(plan); changed.records.reverse();
  await assert.rejects(migration.copy(changed), error => error.code === 'MIGRATION_PLAN');
  await assert.rejects(migration.verify(changed), error => error.code === 'MIGRATION_PLAN');
  const verified = await finish(migration, plan); assert.equal(verified.verified, true); assert.equal(verified.stats.originals, 13);
  assert.equal((await archive.verify('legacy')).totalRecords, 13);
});

test('decoder rejects incomplete, corrupt, out-of-order or later-sequence chunks', async () => {
  const a = record('chunked-example', { answer: '語'.repeat(10000) });
  const encoded = M.encodeRecordVersion('legacy', a, { identity: identity(), dayKey: '2026-10-25', limits: { ...LIMITS, recordBytes: 6000 } });
  assert.ok(encoded.chunkCount > 1);
  const roots = encoded.originals, root = roots[roots.length - 1], chunks = new Map(roots.slice(0, -1).map(item => [item.record.id, { ...item, sequence: 1 }]));
  const row = { record: root.record, mediaRefs: [], sequence: 2, dayKey: root.dayKey };
  assert.deepEqual((await M.decodeRecordVersion('legacy', row, { readChunk: id => chunks.get(id) })).record, a);
  await assert.rejects(M.decodeRecordVersion('legacy', row, { readChunk: () => null }), error => error.code === 'MIGRATION_CHUNK');
  await assert.rejects(M.decodeRecordVersion('legacy', row, { readChunk: id => ({ ...chunks.get(id), sequence: 3 }) }), error => error.code === 'MIGRATION_CHUNK');
  await assert.rejects(M.decodeRecordVersion('legacy', row, { readChunk: id => ({ ...chunks.get(id), record: { ...chunks.get(id).record, data: 'AAAA' } }) }), error => error.code === 'MIGRATION_CHUNK');
  assert.equal(await M.decodeRecordVersion('legacy', row, { asOfSequence: 1, readChunk: id => chunks.get(id) }), null);
});

test('a higher record version in a later source snapshot is fully mapped; a stale snapshot cannot switch over it', async t => {
  const { migration } = fixture(t), a = record(), b = revised(a);
  const first = await migration.prepare(source(snapshot([a]))); assert.equal((await finish(migration, first)).verified, true);
  const second = await migration.prepare(source(snapshot([b]), { revision: 8 })); assert.equal(second.ready, true);
  assert.equal((await finish(migration, second)).verified, true);
  const stale = await migration.verify(first); assert.equal(stale.verified, false); assert.equal(stale.issues[0].code, 'MIGRATION_VERIFY_CONCURRENT');
  const older = await migration.prepare(source(snapshot([a]))); assert.equal(older.ready, false); assert.equal(older.issues[0].code, 'MIGRATION_OLDER_VERSION');
  const result = await migration.verify(second); assert.equal(result.versionMappings[0].archiveVersions.length, 2); assert.equal(result.versionMappings[0].historyVersions.length, 2);
});

test('vocabulary keyed workIds and nested packed binaries are located without interpreting arbitrary opaque prose JSON', async t => {
  const bytes = Buffer.from('nested packed recording'), ref = { sha256: sha(bytes), size: bytes.length, mime: 'audio/webm' };
  const ids = ['work-trial-one-12345678', 'work-trial-two-12345678'];
  const docs = ids.map(id => ({ id, kind: 'speaking_text', originalText: id, version: 1 }));
  const artifact = { schema: 1, trainingVersion: 2, study: { workIds: { 0: [ids[0]], 1: [ids[1]] } }, activity: { answer: JSON.stringify({ attached: { __ieltsBlob: ref } }) } };
  const a = record('vocabulary-with-map', { answer: JSON.stringify(artifact) });
  assert.deepEqual(M.referenceIds(a), ids);
  assert.equal(M.blobRefs(a)[0].sha256, ref.sha256);
  const { migration } = fixture(t, { migrationOptions: { readMediaMetadata: async id => docs.find(doc => doc.id === id), readMediaBytes: async () => bytes } });
  const plan = await migration.prepare(source(snapshot([a]))); assert.equal(plan.ready, true); assert.equal(plan.mediaDependencies.length, 1);
  assert.equal((await finish(migration, plan)).verified, true);
  const prose = record('opaque-json', { source: 'manual-writing', answer: JSON.stringify({ workId: 'a-fictional-name-in-my-writing' }) });
  assert.deepEqual(M.referenceIds(prose), []);
  const prosePlan = await migration.prepare(source(snapshot([prose]))); assert.equal(prosePlan.ready, true); assert.equal(prosePlan.mediaDependencies.length, 0);
  assert.equal((await finish(migration, prosePlan)).verified, true);
});

test('chunked unknown-commit retries retain the original request bodies; existing chunks can be reused across later submissions', async t => {
  let failOnce = true;
  const limits = { recordBytes: 6000, frameBytes: 18000, segmentBytes: 45000, batchRecords: 8, segmentRecords: 16 };
  const { directory, migration } = fixture(t, { archiveOptions: { limits, fault(stage) { if (stage === 'afterFrameSync' && failOnce) { failOnce = false; throw Error('lost chunk batch response'); } } } });
  const a = record('many-chunks', { answer: 'x'.repeat(40000) });
  const plan = await migration.prepare(source(snapshot([a]))); assert.equal(plan.ready, true); assert.ok(plan.batches.length > 1);
  const originalRequest = M.stableJSON(plan.batches[0]);
  await assert.rejects(migration.copy(plan), error => error.commitOutcome === 'unknown' && error.requestId === plan.batches[0].requestId);
  const reopened = createLearningArchive({ dataDir: directory, now: () => new Date(NOW), limits }), resumed = M.createLearningArchiveMigration({ archive: reopened });
  const retried = await resumed.copy(plan); assert.equal(retried.receipts[0].replayed, true); assert.equal(M.stableJSON(plan.batches[0]), originalRequest);
  assert.equal((await finish(resumed, plan)).verified, true);
  const b = record('later-many-chunks', { answer: a.answer, createdAt: '2026-10-25T18:00:00.000Z', startedAt: '2026-10-25T18:00:00.000Z', submittedAt: '2026-10-25T18:00:00.000Z' });
  const later = await resumed.prepare(source(snapshot([b]), { revision: 8 })); assert.equal(later.ready, true); assert.equal((await finish(resumed, later)).verified, true);
  assert.deepEqual((await resumed.read('legacy', a.id, { identity: plan.identity })).record, a);
  assert.deepEqual((await resumed.read('legacy', b.id, { identity: later.identity })).record, b);
});

test('a learning-record parent ID in the work namespace remains a record relationship, not an invented media dependency', async t => {
  const a = record('work-legacy-record-12345678'), b = record('child-record');
  Object.assign(b, { kind: 'correction', parentId: a.id });
  const { migration } = fixture(t), plan = await migration.prepare(source(snapshot([a, b])));
  assert.equal(plan.ready, true); assert.equal(plan.mediaDependencies.length, 0);
  assert.equal((await finish(migration, plan)).verified, true);
  assert.equal((await migration.read('legacy', b.id, { identity: plan.identity })).record.parentId, a.id);
});
