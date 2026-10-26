'use strict';

// Explicit, copy-only bridge from a coherent packed user-data snapshot to the
// append-only archive. This module never reads a configured user directory,
// grades an answer, updates a legacy snapshot, or performs the final CAS switch.
const crypto = require('node:crypto');
const { LIMITS, originalContentHash } = require('./learning-archive.cjs');
const RECORDS_KEY = 'ielts52-learning-records-v1';
const GENERATION_KEY = 'ielts52-data-generation-v1';
const CODEC = 'ielts-learning-record/1';
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/;
const PROFILE = /^(?:legacy|p-[a-zA-Z0-9-]{8,80})$/;
const SHA = /^[a-f0-9]{64}$/;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const plain = value => Boolean(value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

class LearningArchiveMigrationError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'LearningArchiveMigrationError';
    Object.assign(this, { code, status: 409, ...extra });
  }
}
const fail = (code, message, extra) => { throw new LearningArchiveMigrationError(code, message, extra); };

// Validate before serialising. JSON.stringify alone would silently discard
// undefined, accessors, sparse-array holes and unknown non-JSON values.
function stableJSON(value, depth = 0) {
  if (depth > LIMITS.jsonDepth) fail('MIGRATION_JSON', 'JSON nesting exceeds the archive limit.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('MIGRATION_JSON', 'Non-finite JSON number.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) fail('MIGRATION_JSON', 'Sparse or extended JSON array.');
    const values = [];
    for (let index = 0; index < value.length; index++) {
      const d = Object.getOwnPropertyDescriptor(value, String(index));
      if (!d || d.get || d.set) fail('MIGRATION_JSON', 'JSON accessors are not supported.');
      values.push(stableJSON(d.value, depth + 1));
    }
    return '[' + values.join(',') + ']';
  }
  if (!plain(value)) fail('MIGRATION_JSON', 'Only complete ordinary JSON is accepted.');
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== 'string')) fail('MIGRATION_JSON', 'Symbol fields are not JSON.');
  return '{' + keys.sort().map(key => {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d.enumerable || d.get || d.set) fail('MIGRATION_JSON', 'Hidden fields and accessors cannot be migrated.');
    return JSON.stringify(key) + ':' + stableJSON(d.value, depth + 1);
  }).join(',') + '}';
}
const clone = value => JSON.parse(stableJSON(value));
const recordHash = value => hash(stableJSON(value));
function validId(value, label = 'ID') {
  if (typeof value !== 'string' || !ID.test(value) || ['constructor', 'prototype', '__proto__'].includes(value)) fail('MIGRATION_ID', label + ' is invalid.');
  return value;
}
function timestamp(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail('MIGRATION_TIME', label + ' is invalid.');
  return value;
}
function validDay(value) {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value) && !value.startsWith('0000') && Number.isFinite(Date.parse(value + 'T00:00:00.000Z')) && new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) === value;
}
function normalizeIdentity(input) {
  if (!plain(input) || !PROFILE.test(input.profileId || '')) fail('MIGRATION_IDENTITY', 'Explicit storage profile identity is required.');
  timestamp(input.profileCreatedAt, 'Profile creation time');
  if (!own(input, 'generation') || !own(input, 'resetEpoch')) fail('MIGRATION_IDENTITY', 'Storage generation and resetEpoch must be explicit (null is allowed).');
  for (const field of ['generation', 'resetEpoch']) if (input[field] !== null && (typeof input[field] !== 'string' || input[field].length > 1000 || /[\x00-\x1f\x7f]/.test(input[field]))) fail('MIGRATION_IDENTITY', 'Invalid storage ' + field + '.');
  return { profileId: input.profileId, profileCreatedAt: input.profileCreatedAt, generation: input.generation, resetEpoch: input.resetEpoch };
}
const identityScope = identity => recordHash({ schemaVersion: 1, identity: normalizeIdentity(identity) });
function storageIds(identity, logicalId) {
  validId(logicalId, 'Logical record ID');
  const key = recordHash({ schemaVersion: 1, identity: normalizeIdentity(identity), logicalId });
  return { key, baseId: 'lr-base-' + key, revisionId(version) {
    if (!Number.isInteger(version) || version < 1 || version > 40) fail('MIGRATION_VERSION', 'Record version must be between 1 and 40.');
    return 'lr-revision-' + key + '-' + version;
  } };
}
function checkRecord(value) {
  if (!plain(value)) fail('MIGRATION_RECORD', 'The complete record must be an ordinary JSON object.');
  stableJSON(value);
  validId(value.id, 'Original record ID');
  if (typeof value.answer !== 'string') fail('MIGRATION_RECORD', 'The original answer must be retained as an opaque string.', { originalId: value.id });
  if (!Number.isInteger(value.version) || value.version < 1 || value.version > 40 || !Array.isArray(value.history) || value.history.length !== value.version) fail('MIGRATION_VERSION', 'A complete, supported evaluation revision history is required.', { originalId: value.id });
  const changes = new Set();
  for (let index = 0; index < value.history.length; index++) {
    const item = value.history[index];
    if (!plain(item) || item.version !== index + 1 || typeof item.changeId !== 'string' || changes.has(item.changeId) || !own(item, 'evaluation')) fail('MIGRATION_VERSION', 'The complete contiguous history cannot be established.', { originalId: value.id, historyIndex: index });
    changes.add(item.changeId);
  }
  const last = value.history[value.history.length - 1];
  for (const field of ['evaluation', 'assistance', 'notes']) {
    if (own(value, field) !== own(last, field) || own(value, field) && stableJSON(value[field]) !== stableJSON(last[field])) fail('MIGRATION_VERSION', 'Current ' + field + ' disagrees with the final saved revision.', { originalId: value.id });
  }
  timestamp(value.submittedAt || value.createdAt, 'Original submission time');
  return value;
}
function immutableRecord(value) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['version', 'history', 'evaluation', 'assistance', 'notes'].includes(key)));
}
function assertRevision(previous, record) {
  checkRecord(previous);
  if (record.id !== previous.id || record.version !== previous.version + 1 || stableJSON(immutableRecord(record)) !== stableJSON(immutableRecord(previous)) || stableJSON(record.history.slice(0, previous.version)) !== stableJSON(previous.history)) fail('MIGRATION_REVISION_CONFLICT', 'An update must extend the unchanged original and every prior evaluation revision.', { originalId: record.id, previousVersion: previous.version, version: record.version });
}
function normaliseRefs(values, limits = LIMITS) {
  if (!Array.isArray(values) || values.length > limits.mediaRefsPerOriginal) fail('MIGRATION_MEDIA', 'Media reference set is invalid.');
  const result = clone(values), seen = new Set();
  for (const ref of result) {
    if (!plain(ref)) fail('MIGRATION_MEDIA', 'Media reference must be complete JSON.');
    validId(ref.id, 'Media ID');
    if (seen.has(ref.id) || !SHA.test(ref.sha256 || '') || !Number.isSafeInteger(ref.size) || ref.size < 0 || ref.size > limits.mediaBytes || typeof ref.mime !== 'string' || !ref.mime || ref.mime.length > 160 || /[\x00-\x1f\x7f]/.test(ref.mime)) fail('MIGRATION_MEDIA', 'Media requires a unique ID, SHA-256, exact size and MIME.', { mediaId: ref.id });
    seen.add(ref.id);
  }
  return result;
}
function normaliseMetadata(values) {
  if (!Array.isArray(values)) fail('MIGRATION_MEDIA', 'Complete media metadata must be an array.');
  const result = clone(values), seen = new Set();
  for (const value of result) {
    if (!plain(value)) fail('MIGRATION_MEDIA', 'Media metadata must be complete ordinary JSON.');
    validId(value.id, 'Media metadata ID');
    if (seen.has(value.id)) fail('MIGRATION_MEDIA_CONFLICT', 'Duplicate complete media metadata ID.', { mediaId: value.id });
    seen.add(value.id);
  }
  return result;
}
function assertMediaClosure(record, metadata, refs) {
  const ids = new Set([...metadata.map(item => item?.id), ...refs.map(item => item.id)]);
  for (const id of referenceIds(record)) if (!ids.has(id)) fail('MIGRATION_MEDIA_MISSING', 'The complete record references media outside the supplied closure.', { originalId: record.id, mediaId: id });
  const binaries = new Map(refs.map(item => [item.sha256, item]));
  for (const value of [record, ...metadata]) {
    for (const id of referenceIds(value)) if (!ids.has(id)) fail('MIGRATION_MEDIA_MISSING', 'A media dependency is outside the supplied closure.', { originalId: record.id, mediaId: id });
    // Learning-record parentId is a different namespace, even if a legacy
    // record ID happens to begin with "work-". Only work metadata has media
    // parent dependencies.
    if (value !== record && typeof value?.parentId === 'string' && /^work-/.test(value.parentId) && !ids.has(value.parentId)) fail('MIGRATION_MEDIA_MISSING', 'A parent media item is outside the supplied closure.', { originalId: record.id, mediaId: value.parentId });
    for (const ref of blobRefs(value)) {
      const found = binaries.get(ref.sha256);
      if (!found || found.size !== ref.size || found.mime !== ref.mime) fail('MIGRATION_MEDIA_MISSING', 'A packed binary is outside the supplied closure.', { originalId: record.id, sha256: ref.sha256 });
    }
  }
}

// Public codec: encode complete versions, using bounded content-addressed
// payload chunks only when the ordinary archive record cap would be exceeded.
function encodeRecordVersion(profileId, rawRecord, options = {}) {
  const identity = normalizeIdentity(options.identity);
  if (identity.profileId !== profileId) fail('MIGRATION_IDENTITY', 'Storage identity belongs to a different profile.');
  const record = clone(checkRecord(rawRecord));
  const previous = options.previous || null;
  if (previous) {
    if (previous.identity && stableJSON(normalizeIdentity(previous.identity)) !== stableJSON(identity)) fail('MIGRATION_IDENTITY', 'Previous version belongs to another storage namespace.');
    assertRevision(previous.record || previous, record);
  }
  if (!validDay(options.dayKey)) fail('MIGRATION_DAY', 'An explicit, valid original submission day is required.');
  const limits = { ...LIMITS, ...(options.limits || {}) };
  const mediaRefs = normaliseRefs(options.mediaRefs || [], limits);
  const mediaMetadata = normaliseMetadata(options.mediaMetadata || []);
  assertMediaClosure(record, mediaMetadata, mediaRefs);
  const payload = { record, mediaMetadata, mediaRefs };
  const payloadBytes = Buffer.from(stableJSON(payload));
  const maxPayloadBytes = options.maxPayloadBytes ?? 128 * 1024 * 1024;
  if (!Number.isSafeInteger(maxPayloadBytes) || maxPayloadBytes < 1 || payloadBytes.length > maxPayloadBytes) fail('MIGRATION_PAYLOAD_TOO_LARGE', 'Complete payload exceeds the explicit migration bound; the source was not changed.', { originalId: record.id, bytes: payloadBytes.length, limit: maxPayloadBytes });
  const ids = storageIds(identity, record.id);
  const root = {
    id: previous ? ids.revisionId(record.version) : ids.baseId,
    schemaVersion: 1, codec: CODEC,
    kind: previous ? 'learning-record-revision' : 'learning-record-base',
    identity, logicalId: record.id, version: record.version,
    recordSha256: recordHash(record), payloadSha256: hash(payloadBytes),
    previousVersion: previous ? (previous.record || previous).version : null,
    previousRecordSha256: previous ? recordHash(previous.record || previous) : null,
    payload: { format: 'inline-json', value: payload }
  };
  if (options.origin !== undefined) root.origin = clone(options.origin);
  const originals = [];
  if (Buffer.byteLength(stableJSON(root)) > limits.recordBytes) {
    // Base64 overhead is included before choosing a chunk size. A low explicit
    // archive cap is supported for meaningful split/recovery tests.
    const chunkSize = Math.min(512 * 1024, Math.floor((limits.recordBytes - 1024) * 3 / 4));
    if (chunkSize < 128) fail('MIGRATION_PAYLOAD_TOO_LARGE', 'Archive record bound cannot hold a lossless chunk.', { originalId: record.id, limit: limits.recordBytes });
    const chunks = [];
    for (let offset = 0; offset < payloadBytes.length; offset += chunkSize) {
      const bytes = payloadBytes.subarray(offset, offset + chunkSize), sha256 = hash(bytes), id = 'lr-payload-' + sha256;
      const item = { id, schemaVersion: 1, codec: CODEC, kind: 'learning-record-payload-chunk', encoding: 'base64', sha256, size: bytes.length, data: bytes.toString('base64') };
      if (Buffer.byteLength(stableJSON(item)) > limits.recordBytes) fail('MIGRATION_PAYLOAD_TOO_LARGE', 'Chunk exceeds the archive record bound.', { originalId: record.id });
      chunks.push({ id, sha256, size: bytes.length });
      originals.push({ dayKey: options.dayKey, record: item, mediaRefs: [] });
    }
    root.payload = { format: 'utf8-json-chunks', sha256: hash(payloadBytes), size: payloadBytes.length, chunks };
  }
  if (Buffer.byteLength(stableJSON(root)) > limits.recordBytes) fail('MIGRATION_DESCRIPTOR_TOO_LARGE', 'The complete chunk descriptor exceeds the archive cap; migration is unavailable for this record.', { originalId: record.id, bytes: Buffer.byteLength(stableJSON(root)), limit: limits.recordBytes });
  originals.push({ dayKey: options.dayKey, record: root, mediaRefs });
  return { storageId: root.id, originalId: record.id, version: record.version, recordSha256: root.recordSha256, payloadSha256: root.payloadSha256, answerSha256: hash(Buffer.from(record.answer)), answerBytes: Buffer.byteLength(record.answer), historyCount: record.history.length, chunkCount: originals.length - 1, originals };
}

async function decodeRecordVersion(profileId, rowOrEnvelope, options = {}) {
  const row = own(rowOrEnvelope || {}, 'record') ? rowOrEnvelope : null;
  const envelope = row ? row.record : rowOrEnvelope;
  if (!plain(envelope) || envelope.schemaVersion !== 1 || envelope.codec !== CODEC || !['learning-record-base', 'learning-record-revision'].includes(envelope.kind)) fail('MIGRATION_CODEC', 'Unsupported or incomplete learning-record envelope.');
  stableJSON(envelope);
  const identity = normalizeIdentity(options.identity || envelope.identity);
  if (identity.profileId !== profileId || stableJSON(identity) !== stableJSON(normalizeIdentity(envelope.identity))) fail('MIGRATION_IDENTITY', 'Envelope storage identity does not match.');
  const ids = storageIds(identity, envelope.logicalId), base = envelope.kind === 'learning-record-base';
  if (envelope.id !== (base ? ids.baseId : ids.revisionId(envelope.version)) || !SHA.test(envelope.recordSha256 || '') || !SHA.test(envelope.payloadSha256 || '') || base && (envelope.previousVersion !== null || envelope.previousRecordSha256 !== null) || !base && (envelope.previousVersion !== envelope.version - 1 || !SHA.test(envelope.previousRecordSha256 || ''))) fail('MIGRATION_CODEC', 'Envelope ID or revision chain metadata is invalid.');
  if (row && options.asOfSequence !== undefined && row.sequence > options.asOfSequence) return null;
  let payload;
  if (envelope.payload?.format === 'inline-json') payload = clone(envelope.payload.value);
  else if (envelope.payload?.format === 'utf8-json-chunks') {
    const descriptor = envelope.payload;
    if (typeof options.readChunk !== 'function' || !Array.isArray(descriptor.chunks) || !descriptor.chunks.length || descriptor.chunks.length > 4096 || !SHA.test(descriptor.sha256 || '') || !Number.isSafeInteger(descriptor.size) || descriptor.size < 1 || descriptor.size > (options.maxPayloadBytes ?? 128 * 1024 * 1024)) fail('MIGRATION_CHUNK', 'Complete bounded chunk metadata and reader are required.');
    const buffers = [];
    for (const ref of descriptor.chunks) {
      if (!plain(ref) || ref.id !== 'lr-payload-' + ref.sha256 || !SHA.test(ref.sha256 || '') || !Number.isSafeInteger(ref.size) || ref.size < 1) fail('MIGRATION_CHUNK', 'Invalid payload chunk reference.');
      const found = await options.readChunk(ref.id), chunk = found?.record || found;
      if (!chunk || found?.sequence !== undefined && row?.sequence !== undefined && found.sequence > row.sequence || found?.sequence !== undefined && options.asOfSequence !== undefined && found.sequence > options.asOfSequence || chunk.id !== ref.id || chunk.schemaVersion !== 1 || chunk.codec !== CODEC || chunk.kind !== 'learning-record-payload-chunk' || chunk.encoding !== 'base64' || chunk.sha256 !== ref.sha256 || chunk.size !== ref.size || typeof chunk.data !== 'string') fail('MIGRATION_CHUNK', 'A required payload chunk is missing, too new, or invalid.', { chunkId: ref.id });
      const bytes = Buffer.from(chunk.data, 'base64');
      if (bytes.toString('base64') !== chunk.data || bytes.length !== ref.size || hash(bytes) !== ref.sha256) fail('MIGRATION_CHUNK', 'Payload chunk bytes do not match.', { chunkId: ref.id });
      buffers.push(bytes);
    }
    const bytes = Buffer.concat(buffers);
    if (bytes.length !== descriptor.size || hash(bytes) !== descriptor.sha256) fail('MIGRATION_CHUNK', 'Complete payload hash does not match.');
    try { payload = JSON.parse(bytes.toString('utf8')); } catch { fail('MIGRATION_CHUNK', 'Complete payload is not JSON.'); }
    if (!Buffer.from(stableJSON(payload)).equals(bytes)) fail('MIGRATION_CHUNK', 'Chunk payload is not lossless canonical UTF-8 JSON.');
  } else fail('MIGRATION_CODEC', 'Unsupported payload encoding.');
  if (!plain(payload) || !plain(payload.record) || !Array.isArray(payload.mediaMetadata) || !Array.isArray(payload.mediaRefs) || recordHash(payload) !== envelope.payloadSha256 || recordHash(payload.record) !== envelope.recordSha256 || payload.record.id !== envelope.logicalId || payload.record.version !== envelope.version) fail('MIGRATION_CODEC', 'Complete record/payload identity or hash does not match.');
  checkRecord(payload.record);
  const mediaRefs = normaliseRefs(payload.mediaRefs);
  normaliseMetadata(payload.mediaMetadata);
  assertMediaClosure(payload.record, payload.mediaMetadata, mediaRefs);
  if (row && stableJSON(row.mediaRefs) !== stableJSON(mediaRefs)) fail('MIGRATION_MEDIA', 'Archive frame media metadata disagrees with its payload.');
  return { record: clone(payload.record), mediaMetadata: clone(payload.mediaMetadata), mediaRefs, identity, storageId: envelope.id, version: envelope.version, recordSha256: envelope.recordSha256, payloadSha256: envelope.payloadSha256, previousVersion: envelope.previousVersion, previousRecordSha256: envelope.previousRecordSha256, origin: envelope.origin === undefined ? null : clone(envelope.origin), sequence: row?.sequence ?? null, dayKey: row?.dayKey ?? null };
}

const STRUCTURED_SOURCES = new Set(['course-player', 'vocabulary-practice', 'essential-vocabulary', 'mistake-review', 'year-review', 'vocabulary-speaking', 'speaking-workbench']);
function answerObject(current, key, child, structured) {
  if (key !== 'answer' || typeof child !== 'string') return null;
  let parsed;
  try { parsed = JSON.parse(child); } catch { return null; }
  return parsed && typeof parsed === 'object' && (structured || STRUCTURED_SOURCES.has(current.source) || parsed.schema === 1 || [1, 2].includes(parsed.trainingVersion)) ? parsed : null;
}
function collectReferenceList(value, found, depth = 0) {
  if (depth > LIMITS.jsonDepth) fail('MIGRATION_MEDIA', 'Media reference map exceeds the archive depth limit.');
  if (typeof value === 'string') { if (value) found.add(validId(value, 'Referenced media ID')); return; }
  if (!Array.isArray(value) && !plain(value)) fail('MIGRATION_MEDIA', 'Media ID collection is invalid.');
  // Vocabulary v2 uses both items[].workIds arrays and study.workIds keyed
  // maps. Their strings are references; unrelated strings are not scanned.
  for (const child of Object.values(value)) collectReferenceList(child, found, depth + 1);
}
function referenceIds(value) {
  const found = new Set(), pending = [{ value, depth: 0, structured: false }];
  let visited = 0;
  while (pending.length) {
    const { value: current, depth, structured } = pending.pop();
    if (++visited > 1000000 || depth > LIMITS.jsonDepth) fail('MIGRATION_MEDIA', 'Media reference structure exceeds the bounded traversal.');
    if (!current || typeof current !== 'object') continue;
    for (const [key, child] of Object.entries(current)) {
      if (['workId', 'mediaId', 'recordingId', 'audioWorkId', 'originalWorkId'].includes(key) && typeof child === 'string' && child) found.add(validId(child, 'Referenced media ID'));
      if (['workIds', 'mediaIds', 'recordingIds'].includes(key)) collectReferenceList(child, found);
      if (key === 'media' && Array.isArray(child)) for (const item of child) if (plain(item) && typeof item.id === 'string') found.add(validId(item.id, 'Referenced media ID'));
      // Only actual structured answer slots are parsed. Ordinary prose and the
      // opaque answer string itself are never rewritten or guessed by regex.
      const parsed = answerObject(current, key, child, structured);
      if (parsed) pending.push({ value: parsed, depth: depth + 1, structured: true });
      else if (child && typeof child === 'object') pending.push({ value: child, depth: depth + 1, structured: structured || current.schema === 1 || [1, 2].includes(current.trainingVersion) });
    }
  }
  return [...found].sort();
}
function blobRefs(value) {
  const found = new Map(), pending = [{ value, depth: 0, structured: false }];
  let visited = 0;
  while (pending.length) {
    const { value: current, depth, structured } = pending.pop();
    if (++visited > 1000000 || depth > LIMITS.jsonDepth) fail('MIGRATION_MEDIA', 'Packed binary structure exceeds bounded traversal.');
    if (!current || typeof current !== 'object') continue;
    if (own(current, '__ieltsBlob')) {
      if (!plain(current) || Object.keys(current).length !== 1 || !plain(current.__ieltsBlob)) fail('MIGRATION_MEDIA', 'Invalid packed binary reference.');
      const ref = current.__ieltsBlob;
      if (Object.keys(ref).some(key => !['sha256', 'mime', 'size'].includes(key))) fail('MIGRATION_MEDIA', 'Unknown packed binary reference fields.');
      const normalized = normaliseRefs([{ id: 'blob-' + ref.sha256, ...ref }])[0];
      const prior = found.get(normalized.id);
      if (prior && stableJSON(prior) !== stableJSON(normalized)) fail('MIGRATION_MEDIA_CONFLICT', 'The same binary hash has different metadata.');
      found.set(normalized.id, normalized);
    } else for (const [key, child] of Object.entries(current)) {
      const parsed = answerObject(current, key, child, structured);
      if (parsed) pending.push({ value: parsed, depth: depth + 1, structured: true });
      else if (child && typeof child === 'object') pending.push({ value: child, depth: depth + 1, structured: structured || current.schema === 1 || [1, 2].includes(current.trainingVersion) });
    }
  }
  return [...found.values()];
}
function extractSources(snapshot) {
  if (!plain(snapshot) || snapshot.schemaVersion !== 1 || !plain(snapshot.profile) || !plain(snapshot.entries) || !Array.isArray(snapshot.databases)) fail('MIGRATION_SOURCE', 'A complete packed user-data snapshot is required.');
  const documents = [], byId = new Map();
  const register = (record, location) => {
    checkRecord(record);
    const recordSha256 = recordHash(record), previous = byId.get(record.id);
    if (previous && previous.recordSha256 !== recordSha256) fail('MIGRATION_SOURCE_CONFLICT', 'Two snapshot locations contain different complete versions of the same logical ID; neither was replaced.', { originalId: record.id, candidates: [...previous.locations, location], recordHashes: [previous.recordSha256, recordSha256], versions: [previous.record.version, record.version] });
    if (previous) previous.locations.push(location);
    else byId.set(record.id, { record: clone(record), recordSha256, locations: [location] });
  };
  const dbs = snapshot.databases.filter(db => db?.name === RECORDS_KEY);
  if (dbs.length !== 1 || !Array.isArray(dbs[0].stores) || dbs[0].stores.length !== 1 || dbs[0].stores[0]?.name !== 'records' || !Array.isArray(dbs[0].stores[0].rows)) fail('MIGRATION_SOURCE', 'Exactly one complete records store is required.');
  const rows = dbs[0].stores[0].rows, seen = new Set();
  for (let ordinal = 0; ordinal < rows.length; ordinal++) {
    const row = rows[ordinal];
    if (!plain(row) || row.key !== row.value?.id || seen.has(row.key)) fail('MIGRATION_SOURCE', 'Record row key or uniqueness is invalid.', { ordinal });
    seen.add(row.key);
    register(row.value, { kind: 'database', database: RECORDS_KEY, store: 'records', ordinal, key: clone(row.key) });
  }
  documents.push({ kind: 'database', sha256: recordHash(rows), rows: rows.map(row => ({ key: clone(row.key), logicalId: row.value.id, extras: Object.fromEntries(Object.entries(row).filter(([key]) => !['key', 'value'].includes(key))) })) });
  if (own(snapshot.entries, RECORDS_KEY)) {
    const raw = snapshot.entries[RECORDS_KEY];
    let state;
    if (typeof raw !== 'string') fail('MIGRATION_SOURCE', 'Legacy records entry must remain a string.');
    try { state = JSON.parse(raw); } catch { fail('MIGRATION_SOURCE', 'Legacy records entry is not complete JSON.'); }
    if (!plain(state) || state.schemaVersion !== 1 || !Array.isArray(state.records)) fail('MIGRATION_SOURCE', 'Unsupported legacy records document.');
    const entrySeen = new Set();
    for (let ordinal = 0; ordinal < state.records.length; ordinal++) {
      if (entrySeen.has(state.records[ordinal]?.id)) fail('MIGRATION_SOURCE', 'Duplicate logical ID in legacy records entry.');
      entrySeen.add(state.records[ordinal]?.id);
      register(state.records[ordinal], { kind: 'entry', key: RECORDS_KEY, ordinal });
    }
    documents.push({ kind: 'entry', key: RECORDS_KEY, rawSha256: hash(Buffer.from(raw)), sha256: recordHash(state), extras: Object.fromEntries(Object.entries(state).filter(([key]) => key !== 'records')), order: state.records.map(record => record.id) });
  }
  return { records: [...byId.values()], documents };
}
function dayFor(record, timeZone) {
  let formatter;
  try { formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }); } catch { fail('MIGRATION_DAY', 'An explicit supported timeZone is required.'); }
  const parts = Object.fromEntries(formatter.formatToParts(new Date(record.submittedAt || record.createdAt)).map(item => [item.type, item.value]));
  const day = parts.year + '-' + parts.month + '-' + parts.day;
  if (!validDay(day)) fail('MIGRATION_DAY', 'Could not retain the original submission day.');
  return day;
}
function planHash(plan) {
  return recordHash(Object.fromEntries(Object.entries(plan).filter(([key]) => key !== 'planSha256')));
}
function frameSize(profileId, dayKey, originals) {
  const additions = originals.map(item => ({ record: item.record, mediaRefs: item.mediaRefs, sha256: originalContentHash(profileId, dayKey, item.record, item.mediaRefs) }));
  return Buffer.byteLength(stableJSON({ formatVersion: 1, profileId, sequence: Number.MAX_SAFE_INTEGER, previousHash: 'f'.repeat(64), dayKey, committedAt: '9999-12-31T23:59:59.999Z', requestId: 'lr-copy-' + 'f'.repeat(64), requestHash: 'f'.repeat(64), requested: additions.map(item => ({ id: item.record.id, sha256: item.sha256 })), existingCount: Number.MAX_SAFE_INTEGER, originals: additions }));
}
function makeBatches(identity, operations, limits, requestSeed) {
  const batches = [], seen = new Map();
  let current = [];
  const commit = () => {
    if (!current.length) return;
    const dayKey = current[0].dayKey, originals = current.map(({ record, mediaRefs }) => ({ record, mediaRefs }));
    const requestId = 'lr-copy-' + recordHash({ schemaVersion: 1, identity, requestSeed, dayKey, originals });
    batches.push({ dayKey, requestId, originals });
    current = [];
  };
  for (const item of operations) {
    const contentHash = originalContentHash(identity.profileId, item.dayKey, item.record, item.mediaRefs), previous = seen.get(item.record.id);
    if (previous) {
      // Identical chunks may occur repeatedly within a payload. Archive chunk
      // identity is content-addressed; retain its first immutable day/location.
      if (item.record.kind !== 'learning-record-payload-chunk' || previous.recordHash !== recordHash(item.record)) fail('MIGRATION_PLAN_CONFLICT', 'Conflicting deterministic storage IDs in migration plan.');
      continue;
    }
    seen.set(item.record.id, { contentHash, recordHash: recordHash(item.record) });
    if (current.length && (current[0].dayKey !== item.dayKey || current.length >= limits.batchRecords || frameSize(identity.profileId, item.dayKey, [...current, item]) > limits.frameBytes)) commit();
    if (frameSize(identity.profileId, item.dayKey, [item]) > limits.frameBytes) fail('MIGRATION_FRAME_TOO_LARGE', 'A complete archive operation cannot fit its bounded frame.', { storageId: item.record.id });
    current.push(item);
  }
  commit();
  return batches;
}

function createLearningArchiveMigration({ archive, readMediaMetadata, readMediaBytes, maxPayloadBytes = 128 * 1024 * 1024 } = {}) {
  if (!archive || ['append', 'get', 'verify'].some(key => typeof archive[key] !== 'function')) fail('MIGRATION_ARCHIVE', 'An explicit archive adapter is required.');
  if (readMediaMetadata !== undefined && typeof readMediaMetadata !== 'function' || readMediaBytes !== undefined && typeof readMediaBytes !== 'function') fail('MIGRATION_MEDIA', 'Media readers must be explicit callbacks.');
  const limits = { ...LIMITS, ...(archive.limits || {}) };

  async function reusableOperations(profileId, operations) {
    const result = [];
    for (const operation of operations) {
      if (operation.record.kind === 'learning-record-payload-chunk') {
        const existing = await archive.get(profileId, operation.record.id);
        if (existing) {
          if (recordHash(existing.record) !== recordHash(operation.record)) fail('MIGRATION_CHUNK', 'A content-addressed archived chunk differs.', { chunkId: operation.record.id });
          continue;
        }
      }
      result.push(operation);
    }
    return result;
  }

  async function read(profileId, logicalId, options = {}) {
    const identity = normalizeIdentity(options.identity);
    if (identity.profileId !== profileId) fail('MIGRATION_IDENTITY', 'Storage identity does not match requested profile.');
    if (options.asOfSequence !== undefined && (!Number.isSafeInteger(options.asOfSequence) || options.asOfSequence < 0)) fail('MIGRATION_SEQUENCE', 'Invalid archive snapshot sequence.');
    const ids = storageIds(identity, logicalId), base = await archive.get(profileId, ids.baseId);
    if (!base || options.asOfSequence !== undefined && base.sequence > options.asOfSequence) return null;
    let current = await decodeRecordVersion(profileId, base, { identity, asOfSequence: options.asOfSequence, maxPayloadBytes, readChunk: id => archive.get(profileId, id) });
    const versionMap = [{ version: current.version, storageId: current.storageId, recordSha256: current.recordSha256, sequence: current.sequence }];
    for (let version = current.version + 1; version <= 40; version++) {
      const row = await archive.get(profileId, ids.revisionId(version));
      if (!row || options.asOfSequence !== undefined && row.sequence > options.asOfSequence) break;
      const next = await decodeRecordVersion(profileId, row, { identity, asOfSequence: options.asOfSequence, maxPayloadBytes, readChunk: id => archive.get(profileId, id) });
      if (next.previousVersion !== current.version || next.previousRecordSha256 !== current.recordSha256) fail('MIGRATION_REVISION_CONFLICT', 'Saved revision chain does not match its complete predecessor.', { originalId: logicalId, version });
      assertRevision(current.record, next.record);
      current = next;
      versionMap.push({ version, storageId: current.storageId, recordSha256: current.recordSha256, sequence: current.sequence });
    }
    return { ...current, versionMap };
  }

  async function resolveMedia(record, context, snapshotRows) {
    const metadata = new Map(), refs = new Map(), queue = referenceIds(record), roots = queue.slice();
    for (const ref of blobRefs(record)) refs.set(ref.id, ref);
    while (queue.length) {
      const id = queue.shift();
      if (metadata.has(id)) continue;
      if (metadata.size >= limits.mediaRefsPerOriginal) fail('MIGRATION_MEDIA', 'Media dependency closure exceeds the archive bound.', { originalId: record.id });
      let returned = readMediaMetadata ? await readMediaMetadata(id, context) : snapshotRows.get(id);
      if (!returned) fail('MIGRATION_MEDIA_MISSING', 'A referenced original media item is missing; the source remains unchanged.', { originalId: record.id, mediaId: id });
      returned = clone(returned);
      const wrapped = plain(returned) && !own(returned, 'id') && own(returned, 'metadata'), doc = wrapped ? returned.metadata : returned;
      if (!plain(doc) || doc.id !== id) fail('MIGRATION_MEDIA', 'Media reader returned another item.', { mediaId: id });
      const source = snapshotRows.get(id);
      if (source && recordHash(source) !== recordHash(doc)) fail('MIGRATION_MEDIA_CHANGED', 'Media metadata no longer matches the coherent source snapshot.', { mediaId: id });
      metadata.set(id, doc);
      const dependencies = referenceIds(doc);
      if (typeof doc.parentId === 'string' && /^work-/.test(doc.parentId)) dependencies.push(doc.parentId);
      if (wrapped && returned.dependencies !== undefined) {
        if (!Array.isArray(returned.dependencies)) fail('MIGRATION_MEDIA', 'Explicit media dependencies must be an array.');
        dependencies.push(...returned.dependencies.map(value => validId(value, 'Media dependency ID')));
      }
      queue.push(...dependencies.filter(value => !metadata.has(value)));
      const docRefs = blobRefs(doc);
      if (SHA.test(doc.sha256 || '') && own(doc, 'size') && own(doc, 'mime')) docRefs.push(doc);
      if (wrapped && returned.blobs !== undefined) {
        if (!Array.isArray(returned.blobs)) fail('MIGRATION_MEDIA', 'Explicit media blobs must be an array.');
        docRefs.push(...returned.blobs.map(ref => ({ ...ref, id: ref.id || 'blob-' + ref.sha256 })));
      }
      for (const ref of normaliseRefs(docRefs, limits)) {
        const old = refs.get(ref.id);
        if (old && stableJSON(old) !== stableJSON(ref)) fail('MIGRATION_MEDIA_CONFLICT', 'A media ID maps to different complete metadata.', { mediaId: ref.id });
        refs.set(ref.id, ref);
      }
    }
    return { roots, mediaMetadata: [...metadata.values()].sort((a, b) => a.id.localeCompare(b.id)), mediaRefs: normaliseRefs([...refs.values()].sort((a, b) => a.id.localeCompare(b.id)), limits) };
  }

  async function prepare(input) {
    if (!plain(input) || !plain(input.snapshot)) fail('MIGRATION_SOURCE', 'A coherent packed source snapshot is required.');
    // Clone only after validating all values, and do not run R.parseState: its
    // defaults/sort/strict field filtering are not a lossless migration codec.
    const snapshot = clone(input.snapshot), rawSnapshotSha256 = hash(Buffer.from(JSON.stringify(input.snapshot)));
    if (!Number.isSafeInteger(input.revision) || input.revision < 1 || !SHA.test(input.snapshotSha256 || '') || input.snapshotSha256 !== rawSnapshotSha256) fail('MIGRATION_SNAPSHOT_HASH', 'Source revision and exact persisted snapshot SHA-256 are required.');
    if (typeof input.timeZone !== 'string' || !input.timeZone) fail('MIGRATION_DAY', 'Migration must explicitly name the original submission timeZone.');
    try { new Intl.DateTimeFormat('en-CA', { timeZone: input.timeZone }); } catch { fail('MIGRATION_DAY', 'Unsupported explicit source timeZone.'); }
    const identity = normalizeIdentity({ profileId: snapshot.profile.id, profileCreatedAt: snapshot.profile.createdAt, generation: own(snapshot.entries, GENERATION_KEY) ? snapshot.entries[GENERATION_KEY] : null, resetEpoch: input.resetEpoch });
    if (own(input, 'generation') && input.generation !== identity.generation) fail('MIGRATION_IDENTITY', 'Snapshot generation disagrees with the supplied fence.');
    const sources = extractSources(snapshot), mediaRows = new Map();
    for (const db of snapshot.databases) if (db?.name === 'ielts-media-v1') for (const store of db.stores || []) if (store?.name === 'works') for (const row of store.rows || []) {
      if (!plain(row) || row.key !== row.value?.id || mediaRows.has(row.key)) fail('MIGRATION_MEDIA', 'Invalid or duplicate coherent media row.');
      mediaRows.set(row.key, row.value);
    }
    const context = { identity: clone(identity), sourceRevision: input.revision, snapshotSha256: input.snapshotSha256 };
    const operations = [], records = [], dependencies = new Map(), issues = [];
    for (const source of sources.records) {
      try {
        const record = source.record, dayKey = dayFor(record, input.timeZone), media = await resolveMedia(record, context, mediaRows);
        const previous = await read(identity.profileId, record.id, { identity });
        const payloadSha256 = recordHash({ record, mediaMetadata: media.mediaMetadata, mediaRefs: media.mediaRefs });
        let encoded;
        if (previous && previous.version === record.version) {
          if (previous.recordSha256 !== source.recordSha256 || previous.payloadSha256 !== payloadSha256) fail('MIGRATION_SAME_VERSION_CONFLICT', 'The same logical ID/version already has different immutable content.', { originalId: record.id, version: record.version, existingHash: previous.recordSha256, sourceHash: source.recordSha256 });
          encoded = { storageId: previous.storageId, originalId: record.id, version: record.version, recordSha256: source.recordSha256, payloadSha256, answerSha256: hash(Buffer.from(record.answer)), answerBytes: Buffer.byteLength(record.answer), historyCount: record.history.length, chunkCount: 0, originals: [] };
        } else {
          if (previous && record.version <= previous.version) fail('MIGRATION_OLDER_VERSION', 'An older supplied version cannot replace a newer archived version.', { originalId: record.id, version: record.version, archivedVersion: previous.version });
          encoded = encodeRecordVersion(identity.profileId, record, { identity, previous, dayKey, mediaRefs: media.mediaRefs, mediaMetadata: media.mediaMetadata, limits, maxPayloadBytes, origin: { sourceRevision: input.revision, snapshotSha256: input.snapshotSha256, locations: source.locations } });
          operations.push(...encoded.originals);
        }
        for (const ref of media.mediaRefs) {
          const key = ref.sha256, prior = dependencies.get(key);
          if (prior && (prior.size !== ref.size || prior.mime !== ref.mime)) fail('MIGRATION_MEDIA_CONFLICT', 'The same binary hash has conflicting MIME/size.', { sha256: key });
          if (!prior) dependencies.set(key, { sha256: key, size: ref.size, mime: ref.mime, referencedBy: [] });
          dependencies.get(key).referencedBy.push(record.id);
        }
        records.push({ originalId: record.id, version: record.version, storageId: encoded.storageId, dayKey, recordSha256: encoded.recordSha256, payloadSha256: encoded.payloadSha256, answerSha256: encoded.answerSha256, answerBytes: encoded.answerBytes, historyCount: encoded.historyCount, recordBytes: Buffer.byteLength(stableJSON(record)), chunkCount: encoded.chunkCount, mediaRoots: media.roots, mediaMetadataSha256: recordHash(media.mediaMetadata), mediaRefsSha256: recordHash(media.mediaRefs), locations: clone(source.locations) });
      } catch (error) {
        if (!(error instanceof LearningArchiveMigrationError)) throw error;
        issues.push({ originalId: source.record.id, code: error.code, message: error.message, details: Object.fromEntries(Object.entries(error).filter(([key]) => !['name', 'code', 'status'].includes(key))) });
      }
    }
    const ready = issues.length === 0;
    const plan = { schemaVersion: 1, codec: CODEC, ready, identity, source: { revision: input.revision, snapshotSha256: input.snapshotSha256, canonicalSnapshotSha256: recordHash(snapshot), timeZone: input.timeZone, profile: clone(snapshot.profile) }, documents: sources.documents, records, mediaDependencies: [...dependencies.values()].sort((a, b) => a.sha256.localeCompare(b.sha256)), batches: ready ? makeBatches(identity, await reusableOperations(identity.profileId, operations), limits, input.snapshotSha256) : [], issues };
    plan.planSha256 = planHash(plan);
    return plan;
  }

  function checkedPlan(plan) {
    if (!plain(plan) || plan.schemaVersion !== 1 || plan.codec !== CODEC || !plan.ready || !Array.isArray(plan.records) || !Array.isArray(plan.batches) || !SHA.test(plan.planSha256 || '') || plan.planSha256 !== planHash(plan)) fail('MIGRATION_PLAN', 'An intact ready migration plan is required.');
    const identity = normalizeIdentity(plan.identity);
    if (plan.source.profile.id !== identity.profileId || plan.source.profile.createdAt !== identity.profileCreatedAt) fail('MIGRATION_IDENTITY', 'Migration plan storage identity disagrees with its source profile.');
    return identity;
  }
  async function copy(plan, { cursor = 0, maxBatches = 1 } = {}) {
    const identity = checkedPlan(plan);
    if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > plan.batches.length || !Number.isSafeInteger(maxBatches) || maxBatches < 1 || maxBatches > 256) fail('MIGRATION_CURSOR', 'Bounded copy cursor/batch count is invalid.');
    const receipts = [];
    let nextCursor = cursor;
    while (nextCursor < plan.batches.length && receipts.length < maxBatches) {
      const batch = plan.batches[nextCursor];
      // The plan has already resolved reusable content-addressed chunks. Never
      // change its body after an unknown commit: retry the identical request.
      const receipt = await archive.append(identity.profileId, batch);
      receipts.push(receipt);
      nextCursor++;
    }
    return { ok: true, planSha256: plan.planSha256, cursor: nextCursor, done: nextCursor === plan.batches.length, totalBatches: plan.batches.length, receipts, sourceUnchanged: true };
  }

  async function verify(plan) {
    const identity = checkedPlan(plan), restored = new Map(), issues = [], versions = [];
    let answerBytes = 0, recordBytes = 0, evaluationRevisions = 0, mediaMetadataCount = 0;
    for (const expected of plan.records) {
      try {
        const row = await archive.get(identity.profileId, expected.storageId);
        if (!row) fail('MIGRATION_VERIFY_MISSING', 'A mapped archive version is missing.', { originalId: expected.originalId });
        const decoded = await decodeRecordVersion(identity.profileId, row, { identity, maxPayloadBytes, readChunk: id => archive.get(identity.profileId, id) });
        const actual = decoded.record;
        if (actual.id !== expected.originalId || actual.version !== expected.version || decoded.recordSha256 !== expected.recordSha256 || decoded.payloadSha256 !== expected.payloadSha256 || hash(Buffer.from(actual.answer)) !== expected.answerSha256 || Buffer.byteLength(actual.answer) !== expected.answerBytes || actual.history.length !== expected.historyCount || recordHash(decoded.mediaMetadata) !== expected.mediaMetadataSha256 || recordHash(decoded.mediaRefs) !== expected.mediaRefsSha256) fail('MIGRATION_VERIFY_MISMATCH', 'A complete original, answer, history or media metadata does not round-trip.', { originalId: expected.originalId });
        const current = await read(identity.profileId, actual.id, { identity });
        if (!current || current.storageId !== expected.storageId) fail('MIGRATION_VERIFY_CONCURRENT', 'A logical record advanced after preparation; the source must not switch.', { originalId: expected.originalId });
        restored.set(actual.id, actual);
        versions.push({ originalId: actual.id, version: actual.version, storageId: decoded.storageId, recordSha256: decoded.recordSha256, historyVersions: actual.history.map(item => ({ version: item.version, changeId: item.changeId, sha256: recordHash(item) })), archiveVersions: current.versionMap });
        answerBytes += expected.answerBytes; recordBytes += expected.recordBytes; evaluationRevisions += actual.history.length; mediaMetadataCount += decoded.mediaMetadata.length;
      } catch (error) {
        if (!(error instanceof LearningArchiveMigrationError)) throw error;
        issues.push({ originalId: expected.originalId, code: error.code, message: error.message });
      }
    }
    let sourceDocumentsVerified = 0;
    if (!issues.length) for (const document of plan.documents) {
      const value = document.kind === 'database' ? document.rows.map(row => ({ ...row.extras, key: clone(row.key), value: restored.get(row.logicalId) })) : { ...document.extras, records: document.order.map(id => restored.get(id)) };
      if (recordHash(value) !== document.sha256) issues.push({ code: 'MIGRATION_VERIFY_SOURCE_ORDER', message: 'The original source envelope/order did not round-trip.', sourceKind: document.kind });
      else sourceDocumentsVerified++;
    }
    let mediaBytes = 0, mediaBlobsVerified = 0;
    for (const dependency of plan.mediaDependencies) {
      if (!readMediaBytes) { issues.push({ code: 'MIGRATION_MEDIA_BYTES_NOT_CHECKED', sha256: dependency.sha256, message: 'No original binary reader was supplied; final switch is blocked.' }); continue; }
      let supplied;
      try { supplied = await readMediaBytes(dependency.sha256, { identity: clone(identity), size: dependency.size, mime: dependency.mime, sourceRevision: plan.source.revision, snapshotSha256: plan.source.snapshotSha256 }); }
      catch (error) { issues.push({ code: 'MIGRATION_MEDIA_BYTES_MISSING', sha256: dependency.sha256, reason: typeof error?.code === 'string' ? error.code : 'MEDIA_READ_FAILED', message: 'Original binary bytes could not be read; final switch is blocked.' }); continue; }
      let bytes;
      if (Buffer.isBuffer(supplied)) bytes = supplied;
      else if (supplied instanceof ArrayBuffer) bytes = Buffer.from(supplied);
      else if (ArrayBuffer.isView(supplied)) bytes = Buffer.from(supplied.buffer, supplied.byteOffset, supplied.byteLength);
      else if (supplied && typeof supplied.arrayBuffer === 'function') bytes = Buffer.from(await supplied.arrayBuffer());
      if (!bytes || bytes.length !== dependency.size || hash(bytes) !== dependency.sha256) issues.push({ code: 'MIGRATION_MEDIA_BYTES_MISMATCH', sha256: dependency.sha256, message: 'Original binary bytes are missing or differ; final switch is blocked.' });
      else { mediaBlobsVerified++; mediaBytes += bytes.length; }
    }
    const archiveIntegrity = await archive.verify(identity.profileId);
    const verified = issues.length === 0;
    return { ok: verified, verified, schemaVersion: 1, codec: CODEC, planSha256: plan.planSha256, identity: clone(identity), source: clone(plan.source), sourceUnchanged: true, casPerformed: false, stats: { originals: restored.size, evaluationRevisions, answerBytes, recordBytes, sourceDocumentsVerified, sourceDocuments: plan.documents.length, mediaMetadataCount, mediaBlobs: plan.mediaDependencies.length, mediaBlobsVerified, mediaBytes }, recordSetSha256: recordHash(plan.records.map(item => ({ originalId: item.originalId, version: item.version, recordSha256: item.recordSha256, storageId: item.storageId }))), versionMappings: versions, archiveIntegrity, issues };
  }

  async function appendRecordVersion(profileId, record, options = {}) {
    const identity = normalizeIdentity(options.identity);
    const existing = await read(profileId, record.id, { identity });
    if (options.requestId !== undefined) validId(options.requestId, 'Write request ID');
    const mediaRefs = normaliseRefs(options.mediaRefs || [], limits), mediaMetadata = normaliseMetadata(options.mediaMetadata || []);
    const wantedPayload = recordHash({ record, mediaMetadata, mediaRefs });
    if (existing && existing.version === record.version) {
      if (existing.recordSha256 !== recordHash(record) || existing.payloadSha256 !== wantedPayload) fail('MIGRATION_SAME_VERSION_CONFLICT', 'The immutable logical version already contains different data.', { originalId: record.id, version: record.version });
      return { ok: true, duplicate: true, record: existing.record, storageId: existing.storageId, version: existing.version, receipts: [] };
    }
    if (options.previous && (!existing || recordHash(options.previous.record || options.previous) !== existing.recordSha256)) fail('MIGRATION_REVISION_CONFLICT', 'The supplied predecessor is no longer current.', { originalId: record.id });
    const encoded = encodeRecordVersion(profileId, record, { ...options, identity, previous: existing, mediaRefs, mediaMetadata, limits, maxPayloadBytes });
    const batches = makeBatches(identity, await reusableOperations(profileId, encoded.originals), limits, options.requestId || recordHash({ record, identity, dayKey: options.dayKey }));
    const receipts = [];
    // Reuse exactly the same copy engine and deterministic chunk request logic.
    const plan = { schemaVersion: 1, codec: CODEC, ready: true, identity, source: { profile: { id: identity.profileId, createdAt: identity.profileCreatedAt } }, records: [], batches };
    plan.planSha256 = planHash(plan);
    let cursor = 0;
    while (cursor < batches.length) { const result = await copy(plan, { cursor, maxBatches: 1 }); cursor = result.cursor; receipts.push(...result.receipts); }
    return { ok: true, duplicate: false, storageId: encoded.storageId, version: encoded.version, record: clone(record), recordSha256: encoded.recordSha256, receipts };
  }

  return Object.freeze({ prepare, copy, verify, read, appendRecordVersion });
}

module.exports = { CODEC, RECORDS_KEY, GENERATION_KEY, LearningArchiveMigrationError, stableJSON, recordHash, normalizeIdentity, identityScope, storageIds, encodeRecordVersion, decodeRecordVersion, referenceIds, blobRefs, createLearningArchiveMigration };
