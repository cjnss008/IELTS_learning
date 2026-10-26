'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const { createCatalog, validRef } = require('../server/year-material-catalog.cjs');
const { fixture, hash } = require('./year-material-fixture.cjs');

test('both activation switches default closed without reading a manifest, index or material', () => {
  for (const side of ['manifest', 'data']) {
    const f = fixture(); if (side === 'manifest') f.manifest.active = false; else f.data.yearFirstUse.active = false;
    let manifests = 0; const catalog = createCatalog({ ...f.catalogOptions, getManifest: () => { manifests++; return f.manifest; } });
    assert.equal(catalog.get(f.reading.id), null); assert.equal(catalog.status().active, false);
    assert.equal(f.reads.length, 0); if (side === 'data') assert.equal(manifests, 0);
  }
});
test('688 indexed materials hydrate individually and never mutate the course or shared returned values', () => {
  const f = fixture({ count: 688 }), before = JSON.stringify(f.data), catalog = createCatalog(f.catalogOptions);
  assert.equal(catalog.status().total, 688); assert.equal(f.materialReads().length, 0);
  const entry = catalog.readMaterial(f.reading.id, f.jobs[0].materialHash);
  assert.equal(f.materialReads().length, 1); assert.equal(entry.bytes.toString(), JSON.stringify(f.reading));
  entry.material.passage = 'caller mutation'; entry.bytes[0] = 0;
  assert.equal(catalog.get(f.reading.id).passage, f.reading.passage); assert.equal(f.materialReads().length, 1);
  assert.equal(JSON.stringify(f.data), before);
});
test('source and derived materials remain ordinary practice with hash-bound parent provenance', () => {
  const f = fixture(), catalog = createCatalog(f.catalogOptions), value = catalog.get(f.derived.id);
  assert.equal(f.materialReads().length, 2); assert.equal(value.source.practiceOnly, true);
  assert.equal(value.source.independentAssessmentEligible, false); assert.equal(value.source.independentTransferEligible, false);
  assert.equal(value.source.parentContentHash, catalog.get(f.reading.id).source.contentHash);
});
test('invalid identifiers, paths, byte limits and hash prefixes cannot authorize a public file', () => {
  const f = fixture(), catalog = createCatalog(f.catalogOptions);
  for (const id of ['../private/config', 'final-reading', 'expand-../secret', 'expand-a/b', '', null]) assert.equal(catalog.get(id), null);
  assert.equal(f.reads.length, 0);
  for (const ref of [{ ...f.jobs[0].ref, path: '../private/config.json' }, { ...f.jobs[0].ref, bytes: 131073 }, { ...f.jobs[0].ref, path: f.jobs[1].ref.path }]) assert.equal(validRef(ref, 'material', f.reading.id), false);
  for (const edit of [index => { index.jobs[0].ref.path = '../private/config.json'; }, index => { index.jobs[0].ref.bytes = 131073; }]) {
    const bad = fixture({ editIndex: edit }); assert.throws(() => createCatalog(bad.catalogOptions).get(bad.reading.id), { code: 'YEAR_JOB_REFERENCE' }); assert.equal(bad.materialReads().length, 0);
  }
});
test('four build pins plus actual core, public plan and context content are checked before an index read', () => {
  for (const key of ['inputHash', 'coreHash', 'publicPlanHash', 'contextCatalogHash']) {
    const f = fixture(); f.data.yearFirstUse[key] = hash('different');
    assert.throws(() => createCatalog(f.catalogOptions).get(f.reading.id), { code: 'YEAR_BUILD_CONTRACT' }); assert.equal(f.reads.length, 0);
  }
  for (const [edit, code] of [[f => f.data.days.push({ day: 1 }), 'YEAR_CORE_HASH'], [f => f.data.publicCoursePlan.assignments.push({ forged: true }), 'YEAR_PUBLIC_PLAN_HASH'], [f => f.contextCatalog.activities.push({ forged: true }), 'YEAR_CONTEXT_CATALOG_HASH']]) {
    const f = fixture(); edit(f); assert.throws(() => createCatalog(f.catalogOptions).status(), { code }); assert.equal(f.reads.length, 0);
  }
});
test('active runtime source contract is required and actual component source bytes are checked', () => {
  const f = fixture(), component = f.runtimeContract.components[0]; f.files.set(path.resolve(f.root, component.path), Buffer.from('changed source'));
  assert.throws(() => createCatalog(f.catalogOptions).status(), { code: 'YEAR_CONTENT_HASH' }); assert.equal(f.materialReads().length, 0);
  const missing = fixture(); delete missing.manifest.runtimeContract; assert.throws(() => createCatalog(missing.catalogOptions).status(), { code: 'YEAR_RUNTIME_CONTRACT' });
});
test('wrong requested hash is refused before material hydration and corrupt bytes are refused', () => {
  const f = fixture(), catalog = createCatalog(f.catalogOptions);
  assert.throws(() => catalog.readMaterial(f.reading.id, hash('wrong')), { code: 'YEAR_MATERIAL_HASH', status: 409 }); assert.equal(f.materialReads().length, 0);
  const file = path.resolve(f.root, f.jobs[0].ref.path), bytes = Buffer.from(f.files.get(file)); bytes[10] ^= 1; f.files.set(file, bytes);
  assert.throws(() => catalog.get(f.reading.id), { code: 'YEAR_CONTENT_HASH' });
});
test('a valid file hash cannot conceal stale teaching content hashes or a different derived parent', () => {
  const stale = fixture({ editMaterial: material => { material.passage += ' Unreviewed new text.'; } });
  assert.throws(() => createCatalog(stale.catalogOptions).get(stale.reading.id), { code: 'YEAR_SOURCE_CONTENT_HASH' });
  const parent = fixture({ editMaterial: (_material, materials) => { materials[2].source.parentContentHash = hash('other parent'); } });
  assert.throws(() => createCatalog(parent.catalogOptions).get(parent.derived.id), { code: 'YEAR_SOURCE_PARENT' });
});
test('exam, unreviewed and independent eligibility flags are refused even under a matching index file hash', () => {
  for (const edit of [m => { m.pool = 'gate'; }, m => { m.pool = 'final'; }, m => { m.pool = 'holdout'; }, m => { m.fullTest = true; }, m => { m.form = 'A'; }, m => { m.assessmentGroup = 'gate'; }, m => { m.holdout = true; }, m => { m.independentBank = true; }, m => { m.source.verification = 'pending'; }, m => { m.source.independentAssessmentEligible = true; }, m => { m.source.independentTransferEligible = true; }]) {
    const f = fixture({ editMaterial: edit }); assert.throws(() => createCatalog(f.catalogOptions).get(f.reading.id), { code: 'YEAR_MATERIAL_SCOPE' });
  }
});
test('turning either switch off revokes already hydrated access, and status only exposes allowlisted metadata', () => {
  const f = fixture(); f.manifest.privateConfiguration = 'secret-not-public'; f.manifest.runtimeContract.privateConfiguration = 'secret-not-public'; f.manifest.counts.privateConfiguration = 'secret-not-public';
  const ref = f.content('curriculum/year-first-use/index', f.index); f.manifest.index = ref; f.data.yearFirstUse.materialIndex = ref;
  const catalog = createCatalog(f.catalogOptions); assert(catalog.get(f.reading.id)); assert(!JSON.stringify(catalog.status()).includes('secret-not-public'));
  f.manifest.active = false; assert.equal(catalog.get(f.reading.id), null); assert.equal(catalog.status().hydrated, 0);
  f.manifest.active = true; assert(catalog.get(f.reading.id)); f.data.yearFirstUse.active = false; assert.equal(catalog.get(f.reading.id), null);
});
