'use strict';

// Public, ordinary practice only. Nothing is read while the two activation
// switches are off; an active index never hydrates the complete material bank.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const RUNTIME_SOURCE = (() => { const bytes = fs.readFileSync(__filename); return Object.freeze({ path: 'server/year-material-catalog.cjs', sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }); })();
const RuntimePolicy = require('./year-runtime-contract-policy.cjs');

const PROTOCOL = 1;
const QUEUE_KEY = 'ielts52-year-first-use-v1';
const HASH = /^[a-f0-9]{64}$/;
const ID = /^expand-[a-z0-9-]{1,100}$/;
const CONTRACT_KEYS = ['inputHash', 'coreHash', 'publicPlanHash', 'contextCatalogHash'];
const CORE_FIELDS = ['version', 'status', 'createdDate', 'scope', 'weeks', 'materials', 'days', 'gates', 'lessonExpansions','familyLessonRelease'];
const CONTENT_FIELDS = new Set(['title', 'instructions', 'transcript', 'questions', 'vocabulary', 'grammar', 'transfer', 'rubric', 'passage', 'prompt', 'figure']);
const ROLES = RuntimePolicy.REQUIRED_ROLES;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const clone = value => structuredClone(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const coreContract = data => Object.fromEntries(CORE_FIELDS.filter(key => data[key] !== undefined).map(key => [key, data[key]]));
const stable = value => Array.isArray(value) ? value.map(stable) : object(value) ? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, stable(value[key])])) : value;
const equal = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const publicRef = ref => ({ path: ref.path, sha256: ref.sha256, bytes: ref.bytes });

class YearCatalogError extends Error {
  constructor(code, status = 503) {
    super(status === 409 ? '全年练习内容版本已改变，请重新读取；原稿保留。' : '全年练习材料无法完成版本核验，原记录保留，请完成学习包更新后重试。');
    Object.assign(this, { code, status });
  }
}
function check(value, code = 'YEAR_CATALOG_INVALID') { if (!value) throw new YearCatalogError(code); }
function inside(root, file) { const relative = path.relative(root, file); return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); }
function validRef(ref, kind, id) {
  if (!object(ref) || !HASH.test(ref.sha256) || !Number.isInteger(ref.bytes) || ref.bytes < 1) return false;
  const prefix = ref.sha256.slice(0, 16);
  if (kind === 'index') return ref.bytes <= 2000000 && ref.path === 'curriculum/year-first-use/index.' + prefix + '.json';
  if (kind === 'material') return ID.test(id) && ref.bytes <= 131072 && ref.path === 'curriculum/year-first-use/materials/' + id + '.' + prefix + '.json';
  return false;
}
function sameContract(value, expected) { return CONTRACT_KEYS.every(key => HASH.test(expected?.[key]) && value?.[key] === expected[key]); }

function createCatalog(options = {}) {
  const root = path.resolve(options.rootDir || path.join(__dirname, '..'));
  const data = options.data || {};
  const getContextCatalog = options.getContextCatalog || (() => options.contextCatalog);
  const cache = new Map();
  const maxCached = Math.min(64, Math.max(1, Number.isInteger(options.maxCachedMaterials) ? options.maxCachedMaterials : 16));
  let rootReal, preparedKey = null, preparedStamp = null, prepared = null, runtimePathState = null;
  const loaded = { 'server-routes': options.loadedRuntimeComponents?.['server-routes'], 'user-data-server': options.loadedRuntimeComponents?.['user-data-server'], 'server-catalog': RUNTIME_SOURCE, 'runtime-contract-policy': RuntimePolicy.RUNTIME_SOURCE };

  function read(relative, maximum, ref) {
    check(typeof relative === 'string' && relative && !relative.includes('\\') && !relative.split('/').some(part => !part || part === '.' || part === '..') && !path.isAbsolute(relative), 'YEAR_CONTENT_PATH');
    const file = path.resolve(root, ...relative.split('/'));
    check(inside(root, file), 'YEAR_CONTENT_PATH');
    let bytes;
    if (options.readFile) bytes = Buffer.from(options.readFile(file)); // Explicit isolated-fixture seam.
    else {
      rootReal ||= fs.realpathSync(root);
      const real = fs.realpathSync(file);
      check(inside(rootReal, real), 'YEAR_CONTENT_PATH');
      const fd = fs.openSync(real, 'r');
      try {
        const before = fs.fstatSync(fd);
        check(before.isFile() && before.size > 0 && before.size <= maximum && (!ref || before.size === ref.bytes), 'YEAR_CONTENT_SIZE');
        bytes = fs.readFileSync(fd);
        const after = fs.fstatSync(fd);
        check(after.size === before.size && after.mtimeMs === before.mtimeMs, 'YEAR_CONTENT_CHANGED');
      } finally { fs.closeSync(fd); }
    }
    check(bytes.length > 0 && bytes.length <= maximum, 'YEAR_CONTENT_SIZE');
    if (ref) check(bytes.length === ref.bytes && sha(bytes) === ref.sha256, 'YEAR_CONTENT_HASH');
    return bytes;
  }
  function json(bytes) {
    try { const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); check(object(value)); return value; }
    catch (error) { if (error instanceof YearCatalogError) throw error; throw new YearCatalogError('YEAR_CONTENT_JSON'); }
  }
  function bound(ref, kind, id) { check(validRef(ref, kind, id), 'YEAR_CONTENT_PATH'); const bytes = read(ref.path, kind === 'index' ? 2000000 : 131072, ref); return { bytes, value: json(bytes) }; }
  function defaultManifest() {
    const ref = data.yearFirstUse?.firstUseManifest;
    check(ref?.path === 'assets/year-first-use-manifest.js' && HASH.test(ref.sha256) && Number.isInteger(ref.bytes) && ref.bytes > 0 && ref.bytes <= 262144, 'YEAR_MANIFEST_REFERENCE');
    const bytes = read(ref.path, 262144, ref), text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const prefix = "(function(root){'use strict';const value=", suffix = ";root.IELTSYearFirstUseManifest=value;if(typeof module==='object'&&module.exports)module.exports=value;})(typeof globalThis!=='undefined'?globalThis:this);";
    check(text.startsWith(prefix) && text.trimEnd().endsWith(suffix), 'YEAR_MANIFEST_FORMAT');
    return json(Buffer.from(text.trimEnd().slice(prefix.length, -suffix.length)));
  }
  const getManifest = options.getManifest || (Object.hasOwn(options, 'manifest') ? () => options.manifest : defaultManifest);

  function runtimeFileStamp(manifest) {
    const metadata = manifest.runtimeContract, ref = metadata?.contract;
    check(metadata?.protocol === PROTOCOL && metadata.runtimeConnected === true && equal(metadata, data.yearFirstUse.runtimeContract), 'YEAR_RUNTIME_CONTRACT');
    check(['curriculum/year-first-use-runtime-contract.json', 'curriculum/year-first-use-runtime-contract-v93-family.json', 'curriculum/year-first-use-runtime-contract-v94-daily-review.json','curriculum/year-first-use-runtime-contract-v95-replay.json','curriculum/year-first-use-runtime-contract-v96-vocabulary-completion.json','curriculum/year-first-use-runtime-contract-v97-compact-queue.json','curriculum/year-first-use-runtime-contract-v97-family-lessons.json','curriculum/year-first-use-runtime-contract-v107-broadcast.json','curriculum/year-first-use-runtime-contract-v108-linked-continuation.json','curriculum/year-first-use-runtime-contract-v109-linked-lessons.json','curriculum/year-first-use-runtime-contract-v111-course-audit.json','curriculum/year-first-use-runtime-contract-v112-nas-startup.json','curriculum/year-first-use-runtime-contract-v113-multibatch.json','curriculum/year-first-use-runtime-contract-v114-context-lexicon.json'].includes(ref?.path) && HASH.test(ref.sha256) && Number.isInteger(ref.bytes) && ref.bytes > 0 && ref.bytes <= 262144, 'YEAR_RUNTIME_CONTRACT');
    check(RuntimePolicy.componentListProblem(metadata?.components,ref.path) === null, 'YEAR_RUNTIME_COMPONENT');
    // An injected byte reader is deliberately rechecked on every call. Native
    // files reuse hashes only while real path, file identity and timestamps agree.
    if (options.readFile) return null;
    const refs = [metadata.contract, ...metadata.components, manifest.index];
    rootReal ||= fs.realpathSync(root);
    const files = refs.map(ref => {
      check(ref && typeof ref.path === 'string' && !ref.path.includes('\\') && !ref.path.split('/').some(part => !part || part === '.' || part === '..') && !path.isAbsolute(ref.path), 'YEAR_CONTENT_PATH');
      const file = path.resolve(root, ...ref.path.split('/')); check(inside(root, file), 'YEAR_CONTENT_PATH'); return { ref, file };
    });
    const identity = stat => [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs ?? stat.mtimeMs, stat.ctimeNs ?? stat.ctimeMs, stat.birthtimeNs ?? stat.birthtimeMs].map(String);
    const canonical = () => files.map(({ ref, file }) => {
      const real = fs.realpathSync(file); check(inside(rootReal, real), 'YEAR_CONTENT_PATH');
      const stat = fs.statSync(real, { bigint: true }); check(stat.isFile() && stat.size === BigInt(ref.bytes), 'YEAR_CONTENT_SIZE'); return [real, ...identity(stat)];
    });
    // Every lexical directory in the reference paths is checked once, including
    // the root itself. A reparse point must take the complete realpath/hash path
    // on every request: stamps of a link cannot certify its target's containment.
    const directories = new Set([root]);
    for (const { file } of files) for (let parent = path.dirname(file); parent !== root; parent = path.dirname(parent)) { check(inside(root, parent), 'YEAR_CONTENT_PATH'); directories.add(parent); }
    const ordered = [...directories].sort((a, b) => a.length - b.length || a.localeCompare(b)), observed = [];
    for (const directory of ordered) {
      const stat = fs.lstatSync(directory, { bigint: true });
      if (stat.isSymbolicLink()) { runtimePathState = null; canonical(); return null; }
      check(stat.isDirectory(), 'YEAR_CONTENT_PATH'); observed.push([directory, ...identity(stat)]);
    }
    for (const { ref, file } of files) {
      const stat = fs.lstatSync(file, { bigint: true });
      if (stat.isSymbolicLink()) { runtimePathState = null; canonical(); return null; }
      check(stat.isFile() && stat.size === BigInt(ref.bytes), 'YEAR_CONTENT_SIZE'); observed.push([file, ...identity(stat)]);
    }
    const key = JSON.stringify(refs.map(ref => [ref.path, ref.bytes, ref.sha256])), stamp = JSON.stringify(observed);
    if (runtimePathState?.key === key && runtimePathState.observed === stamp) return runtimePathState.validated;
    // Cold, replaced, or edited paths require canonical containment, all hashes,
    // and the index again. ctime is retained even when size and mtime are restored.
    const validated = JSON.stringify([stamp, canonical()]); runtimePathState = { key, observed: stamp, validated }; return validated;
  }
  function runtimeContract(manifest) {
    const metadata = manifest.runtimeContract, ref = metadata?.contract;
    check(metadata?.protocol === PROTOCOL && metadata.runtimeConnected === true && equal(metadata, data.yearFirstUse.runtimeContract), 'YEAR_RUNTIME_CONTRACT');
    check(['curriculum/year-first-use-runtime-contract.json', 'curriculum/year-first-use-runtime-contract-v93-family.json', 'curriculum/year-first-use-runtime-contract-v94-daily-review.json','curriculum/year-first-use-runtime-contract-v95-replay.json','curriculum/year-first-use-runtime-contract-v96-vocabulary-completion.json','curriculum/year-first-use-runtime-contract-v97-compact-queue.json','curriculum/year-first-use-runtime-contract-v97-family-lessons.json','curriculum/year-first-use-runtime-contract-v107-broadcast.json','curriculum/year-first-use-runtime-contract-v108-linked-continuation.json','curriculum/year-first-use-runtime-contract-v109-linked-lessons.json','curriculum/year-first-use-runtime-contract-v111-course-audit.json','curriculum/year-first-use-runtime-contract-v112-nas-startup.json','curriculum/year-first-use-runtime-contract-v113-multibatch.json','curriculum/year-first-use-runtime-contract-v114-context-lexicon.json'].includes(ref?.path) && HASH.test(ref.sha256) && Number.isInteger(ref.bytes) && ref.bytes > 0 && ref.bytes <= 262144, 'YEAR_RUNTIME_CONTRACT');
    const contract = json(read(ref.path, 262144, ref));
    check(contract.schema === 1 && contract.kind === 'year-first-use-runtime-contract' && contract.protocol === PROTOCOL && contract.runtimeConnected === true && contract.activationReviewed === true && Array.isArray(contract.components) && Array.isArray(metadata.components) && contract.components.length === metadata.components.length && contract.components.length >= ROLES.length && contract.components.length <= RuntimePolicy.componentLimit(ref.path), 'YEAR_RUNTIME_CONTRACT');
    check(RuntimePolicy.componentListProblem(contract.components,ref.path) === null && RuntimePolicy.componentListProblem(metadata.components,ref.path) === null, 'YEAR_RUNTIME_COMPONENT');
    const roles = new Set();
    for (const component of metadata.components) {
      check(component && typeof component.role === 'string' && !roles.has(component.role), 'YEAR_RUNTIME_COMPONENT'); roles.add(component.role);
      check(typeof component.path === 'string' && /^(?:assets\/[^\\]+\.(?:js|mjs)|server\/[^\\]+\.(?:cjs|js|mjs)|tools\/year-runtime-activation\.cjs|[^/\\]+\.html)$/.test(component.path) && HASH.test(component.sha256) && Number.isInteger(component.bytes) && component.bytes > 0 && component.bytes <= 16 * 1024 * 1024, 'YEAR_RUNTIME_COMPONENT');
      if (Object.hasOwn(loaded, component.role)) {
        const actual = loaded[component.role];
        check(actual?.path === component.path && actual.sha256 === component.sha256 && actual.bytes === component.bytes, 'YEAR_RUNTIME_RESTART_REQUIRED');
      }
      const declared = contract.components.find(row => row?.role === component.role);
      check(declared?.path === component.path && declared.sha256 === component.sha256 && (declared.bytes === undefined || declared.bytes === component.bytes), 'YEAR_RUNTIME_COMPONENT');
      const content = read(component.path, 16 * 1024 * 1024, component);
      check(RuntimePolicy.pageDependencyProblem(component.path, content.toString('utf8'),ref.path) === null, 'YEAR_RUNTIME_PAGE_DEPENDENCY');
    }
    check(ROLES.every(role => roles.has(role)), 'YEAR_RUNTIME_COMPONENT');
    return { protocol: PROTOCOL, runtimeConnected: true, contract: publicRef(ref), components: metadata.components.map(component => ({ role: component.role, ...publicRef(component) })) };
  }
  function validateIndex(value, manifest) {
    check(value.schema === 1 && value.protocol === PROTOCOL && value.kind === 'year-first-use-index' && value.version === manifest.version && value.active === true && value.runtimeConnected === true && value.planSha256 === manifest.planSha256 && sameContract(value, manifest) && equal(value.runtimeContract, manifest.runtimeContract) && Array.isArray(value.jobs) && value.jobs.length > 0 && value.jobs.length <= 5000, 'YEAR_INDEX_INVALID');
    const jobs = new Map();
    for (const job of value.jobs) {
      check(job && ID.test(job.materialId) && !jobs.has(job.materialId) && HASH.test(job.materialHash) && job.ref?.sha256 === job.materialHash && validRef(job.ref, 'material', job.materialId), 'YEAR_JOB_REFERENCE');
      check(['reading', 'listening', 'writing', 'grammar', 'vocabulary', 'speaking'].includes(job.skill) && typeof job.level === 'string' && job.level.length > 0 && job.level.length <= 24 && ['source', 'derived'].includes(job.kind) && Number.isFinite(job.estimatedStudyMinutes) && job.estimatedStudyMinutes > 0 && job.estimatedStudyMinutes <= 1440 && Number.isInteger(job.releaseCourseIndex) && job.releaseCourseIndex >= 2 && job.releaseCourseIndex <= 365 && ['assigned-first-use', 'pending'].includes(job.staticStatus), 'YEAR_JOB_CONTRACT');
      check(job.kind === 'source' ? job.parentMaterialId === null : ID.test(job.parentMaterialId) && job.parentMaterialId !== job.materialId, 'YEAR_JOB_PARENT');
      jobs.set(job.materialId, job);
    }
    for (const job of jobs.values()) if (job.parentMaterialId) check(jobs.get(job.parentMaterialId)?.kind === 'source', 'YEAR_JOB_PARENT');
    const counts = manifest.counts;
    check(object(counts) && ['total', 'assigned', 'pending'].every(key => Number.isSafeInteger(counts[key]) && counts[key] >= 0) && counts.total === jobs.size && counts.assigned === value.jobs.filter(job => job.staticStatus === 'assigned-first-use').length && counts.pending === value.jobs.filter(job => job.staticStatus === 'pending').length && counts.assigned + counts.pending === counts.total, 'YEAR_INDEX_ACCOUNTING');
    return jobs;
  }
  function prepare() {
    // Check the already-loaded course first: 0.0.81 has no yearFirstUse and must
    // not even read a bootstrap, much less the index or 688 material bodies.
    if (data.yearFirstUse?.active !== true) { prepared = null; preparedKey = null; preparedStamp = null; runtimePathState = null; cache.clear(); return null; }
    try {
      const manifest = getManifest();
      if (manifest?.active !== true) { prepared = null; preparedKey = null; preparedStamp = null; runtimePathState = null; cache.clear(); return null; }
      const contract = data.yearFirstUse;
      check(manifest.schema === 1 && manifest.protocol === PROTOCOL && manifest.kind === 'year-first-use-manifest' && manifest.runtimeConnected === true && contract.protocol === PROTOCOL && contract.runtimeConnected === true && typeof manifest.version === 'string' && manifest.version === contract.version && HASH.test(manifest.planSha256) && contract.plan?.sha256 === manifest.planSha256 && sameContract(manifest, contract) && validRef(manifest.index, 'index') && equal(manifest.index, contract.materialIndex), 'YEAR_BUILD_CONTRACT');
      check(manifest.coreHash === sha(JSON.stringify(coreContract(data))), 'YEAR_CORE_HASH');
      const publicPlan = { ...data.publicCoursePlan }; delete publicPlan.planHash;
      check(manifest.publicPlanHash === data.publicCoursePlan?.planHash && manifest.publicPlanHash === sha(JSON.stringify(stable(publicPlan))), 'YEAR_PUBLIC_PLAN_HASH');
      check(manifest.contextCatalogHash === sha(JSON.stringify(getContextCatalog())), 'YEAR_CONTEXT_CATALOG_HASH');
      const key = sha(JSON.stringify(manifest));
      const stamp = runtimeFileStamp(manifest), changedIndex = key !== preparedKey;
      if (changedIndex || stamp === null || stamp !== preparedStamp) {
        const runtime = runtimeContract(manifest), index = bound(manifest.index, 'index').value, jobs = validateIndex(index, manifest);
        // Only public, validated contract fields leave this module.
        const publicManifest = { schema: 1, protocol: PROTOCOL, kind: 'year-first-use-manifest', version: manifest.version, active: true, runtimeConnected: true, runtimeContract: runtime, ...(data.familyLessonRelease!==undefined?{familyLessonReleaseSha256:sha(Buffer.from(JSON.stringify(stable(data.familyLessonRelease))))}:{}), ...Object.fromEntries(CONTRACT_KEYS.map(name => [name, manifest[name]])), planSha256: manifest.planSha256, index: publicRef(manifest.index), counts: { total: manifest.counts.total, assigned: manifest.counts.assigned, pending: manifest.counts.pending } };
        prepared = { manifest: publicManifest, jobs }; preparedKey = key; preparedStamp = stamp; if (changedIndex) cache.clear();
      }
      return prepared;
    } catch (error) { prepared = null; preparedKey = null; preparedStamp = null; runtimePathState = null; cache.clear(); if (error instanceof YearCatalogError) throw error; throw new YearCatalogError('YEAR_CATALOG_UNAVAILABLE'); }
  }
  function hydrate(meta, ready) {
    const key = meta.materialId + '@' + meta.materialHash;
    if (cache.has(key)) { const entry = cache.get(key); cache.delete(key); cache.set(key, entry); return entry; }
    const { value: material, bytes } = bound(meta.ref, 'material', meta.materialId), source = material.source;
    check(material.id === meta.materialId && material.skill === meta.skill && material.level === meta.level && material.pool === 'training' && material.fullTest === false && !material.independentBank && !material.assessmentGroup && !material.form && !material.holdout && source?.verification === 'reviewed' && source.yearExpansion === ready.manifest.version && source.practiceOnly === true && source.independentAssessmentEligible === false && source.independentTransferEligible === false && (material.sourceMaterialId || null) === meta.parentMaterialId, 'YEAR_MATERIAL_SCOPE');
    const fields = source.contentHashFields;
    check(Array.isArray(fields) && fields.length > 0 && fields.length <= CONTENT_FIELDS.size && new Set(fields).size === fields.length && fields.every(field => CONTENT_FIELDS.has(field) && Object.hasOwn(material, field)) && HASH.test(source.contentHash) && sha(JSON.stringify(Object.fromEntries(fields.map(field => [field, material[field]])))) === source.contentHash, 'YEAR_SOURCE_CONTENT_HASH');
    if (meta.kind === 'derived') {
      check(source.kind === 'derived-original' && source.sourceId === meta.parentMaterialId && HASH.test(source.parentContentHash), 'YEAR_SOURCE_PARENT');
      const parent = hydrate(ready.jobs.get(meta.parentMaterialId), ready);
      check(source.parentContentHash === parent.material.source.contentHash, 'YEAR_SOURCE_PARENT');
    } else check(source.kind === 'original', 'YEAR_SOURCE_KIND');
    const entry = { material, bytes, ref: meta.ref };
    cache.set(key, entry); while (cache.size > maxCached) cache.delete(cache.keys().next().value);
    return entry;
  }
  function readMaterial(id, expectedHash) {
    if (typeof id !== 'string' || !ID.test(id)) return null;
    const ready = prepare(); if (!ready) return null;
    const meta = ready.jobs.get(id); if (!meta) return null;
    if (expectedHash !== undefined && expectedHash !== meta.materialHash) throw new YearCatalogError('YEAR_MATERIAL_HASH', 409);
    try { const entry = hydrate(meta, ready); return { material: clone(entry.material), bytes: Buffer.from(entry.bytes), ref: clone(entry.ref) }; }
    catch (error) { if (error instanceof YearCatalogError) throw error; throw new YearCatalogError('YEAR_MATERIAL_UNAVAILABLE'); }
  }
  return Object.freeze({
    get: id => readMaterial(id)?.material || null,
    readMaterial,
    status: () => { const ready = prepare(); return ready ? { protocol: PROTOCOL, active: true, manifest: clone(ready.manifest), contracts: Object.fromEntries(CONTRACT_KEYS.map(key => [key, ready.manifest[key]])), indexRef: clone(ready.manifest.index), total: ready.jobs.size, hydrated: cache.size } : { protocol: PROTOCOL, active: false, manifest: null, contracts: null, indexRef: null, total: 0, hydrated: 0 }; },
  });
}

module.exports = { RUNTIME_SOURCE, PROTOCOL, QUEUE_KEY, CONTRACT_KEYS, YearCatalogError, coreContract, validRef, createCatalog };
