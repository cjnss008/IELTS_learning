'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { coreContract } = require('../server/year-material-catalog.cjs');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hash = value => sha(JSON.stringify(value));
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const wrap = value => "(function(root){'use strict';const value=" + JSON.stringify(value) + ";root.IELTSYearFirstUseManifest=value;if(typeof module==='object'&&module.exports)module.exports=value;})(typeof globalThis!=='undefined'?globalThis:this);\n";
function fixture(options = {}) {
  const root = path.resolve(options.rootDir || path.join(__dirname, '..', '.cache', 'virtual-year-catalog'));
  const files = new Map(), reads = [], version = 'synthetic-year-protocol-1';
  const put = (relative, bytes) => { bytes = Buffer.from(bytes); files.set(path.resolve(root, ...relative.split('/')), bytes); return { path: relative, sha256: sha(bytes), bytes: bytes.length }; };
  const content = (prefix, value) => { const bytes = Buffer.from(JSON.stringify(value)), hash = sha(bytes); return put(prefix + '.' + hash.slice(0, 16) + '.json', bytes); };
  const contextCatalog = { schema: 1, activities: [{ id: 'synthetic-context', practiceOnly: true }] };
  const publicPlan = { schema: 1, assignments: [] }; publicPlan.planHash = hash(stable(publicPlan));
  const data = { version: 'synthetic', status: 'synthetic-only', materials: [], days: [], weeks: [], gates: [], publicCoursePlan: publicPlan };
  const policy = require('../server/year-runtime-contract-policy.cjs');
  const components = Object.entries(policy.REQUIRED_COMPONENTS).map(([role, relative]) => ({ role, ...put(relative, fs.readFileSync(path.join(__dirname, '..', relative))) }));
  const contractFile = { schema: 1, kind: 'year-first-use-runtime-contract', protocol: 1, runtimeConnected: true, activationReviewed: true, components };
  const runtimeContract = { protocol: 1, runtimeConnected: true, contract: put('curriculum/year-first-use-runtime-contract.json', JSON.stringify(contractFile)), components };
  const materials = [];
  function material(id, skill, parent) {
    const value = { id, version: '1', skill, level: 'A1', pool: 'training', fullTest: false, title: 'Synthetic ordinary ' + skill, instructions: 'Synthetic fixture only.', [skill === 'listening' ? 'transcript' : 'passage']: 'I learn English at a new evening class.', questions: [], source: { schemaVersion: 2, kind: parent ? 'derived-original' : 'original', verification: 'reviewed', yearExpansion: version, practiceOnly: true, independentAssessmentEligible: false, independentTransferEligible: false } };
    if (parent) { value.sourceMaterialId = parent.id; value.source.sourceId = parent.id; value.source.parentContentHash = parent.source.contentHash; }
    value.source.contentHashFields = ['title', 'instructions', skill === 'listening' ? 'transcript' : 'passage', 'questions'];
    value.source.contentHash = hash(Object.fromEntries(value.source.contentHashFields.map(key => [key, value[key]])));
    materials.push(value); return value;
  }
  const reading = material('expand-fixture-reading', 'reading'), listening = material('expand-fixture-listening', 'listening');
  const derived = material('expand-fixture-reading-grammar', 'grammar', reading);
  while (materials.length < (options.count || 3)) material('expand-fixture-extra-' + String(materials.length).padStart(3, '0'), 'reading');
  if (options.editMaterial) options.editMaterial(reading, materials);
  const jobs = materials.map(value => { const ref = content('curriculum/year-first-use/materials/' + value.id, value); return { materialId: value.id, materialHash: ref.sha256, skill: value.skill, level: value.level, kind: value.sourceMaterialId ? 'derived' : 'source', parentMaterialId: value.sourceMaterialId || null, sourceWeek: 1, releaseCourseIndex: 2, plannedCourseIndex: 2, staticStatus: 'assigned-first-use', staticReason: null, estimatedStudyMinutes: 12, ref }; });
  const contracts = { inputHash: hash('synthetic-input'), coreHash: hash(coreContract(data)), publicPlanHash: publicPlan.planHash, contextCatalogHash: hash(contextCatalog) };
  const counts = { total: jobs.length, assigned: jobs.length, pending: 0 };
  const planSha256 = hash('synthetic-plan');
  const index = { schema: 1, protocol: 1, kind: 'year-first-use-index', version, active: true, runtimeConnected: true, runtimeContract, ...contracts, planSha256, jobs };
  if (options.editIndex) options.editIndex(index);
  const indexRef = content('curriculum/year-first-use/index', index);
  const manifest = { schema: 1, protocol: 1, kind: 'year-first-use-manifest', version, active: true, runtimeConnected: true, runtimeContract, ...contracts, planSha256, index: indexRef, counts };
  data.yearFirstUse = { protocol: 1, version, active: true, runtimeConnected: true, runtimeContract, ...contracts, materialIndex: indexRef, plan: { path: 'curriculum/year-expansion-budget-plan.json', sha256: planSha256, bytes: 1 } };
  if (options.editManifest) options.editManifest(manifest, data);
  data.yearFirstUse.firstUseManifest = put('assets/year-first-use-manifest.js', wrap(manifest));
  const readFile = file => { reads.push(file); const value = files.get(file); if (!value) throw Error('synthetic fixture missing private-secret-diagnostic'); return value; };
  function writeFiles() { for (const [file, bytes] of files) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); } }
  const catalogOptions = { rootDir: root, data, contextCatalog, getContextCatalog: () => contextCatalog, manifest, readFile, loadedRuntimeComponents: { 'server-routes': require('../server/server.cjs').RUNTIME_SOURCE, 'user-data-server': require('../server/user-data.cjs').RUNTIME_SOURCE } };
  return { root, files, reads, data, contextCatalog, manifest, index, indexRef, jobs, reading, listening, derived, runtimeContract, catalogOptions, writeFiles, put, content, materialReads: () => reads.filter(file => file.includes(path.sep + 'materials' + path.sep)) };
}
module.exports = { fixture, sha, hash, wrap };
