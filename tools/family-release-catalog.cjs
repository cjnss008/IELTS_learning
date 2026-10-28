'use strict';
// Every batch is verified independently. Appending later batches must preserve
// the original public plan and all historical release/unit identities.
const assert = require('node:assert/strict');
const A = require('../assets/assessment-core.js');
const Loader = require('./apply-family-lessons-v95.cjs');
const Player = require('../assets/course-player.js');
const Essential = require('../assets/essential-vocabulary-data.js');
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => A.materialContentHash(value);
const KIND = 'family-release-catalog-v1';

function body(catalog) {
  const value = {...catalog};
  delete value.catalogSha256;
  return value;
}

function compile({baseData, releases, previous = null}) {
  assert(baseData && !baseData.familyLessonRelease, 'Use the immutable pre-family source');
  assert(Array.isArray(releases) && releases.length > 0 && releases.length <= 364, 'Release list required');
  // Runtime hashes and audit summaries change between software versions. They
  // are not the identity of the original teaching materials or fixed plan.
  const base = clone(baseData);
  delete base.audit;
  delete base.yearFirstUse;
  const baseSha256 = hash(base);
  if (previous) {
    assert.equal(previous.kind, KIND, 'Previous catalog kind');
    assert.equal(previous.schema, 1, 'Previous catalog schema');
    assert.equal(previous.catalogSha256, hash(body(previous)), 'Previous catalog hash');
    assert.equal(previous.baseSha256, baseSha256, 'Historical base source changed');
    assert(Array.isArray(previous.releases) && previous.releases.length <= releases.length, 'Cannot remove an earlier batch');
  }
  const ids = new Set(), days = new Set(), words = new Set(), unitIds = new Set();
  const materialIds = new Set(base.materials.map(m => m.id));
  const batches = [], assignments = [];
  for (const [index, input] of releases.entries()) {
    assert(input && typeof input.releasePath === 'string', 'Explicit reviewed release path required');
    const data = clone(base);
    const loaded = Loader.apply(data, {root:input.root, releasePath:input.releasePath,
      assessment:A, player:Player, essential:Essential});
    assert.equal(loaded.active, true, 'Inactive candidates cannot enter the catalog');
    const release = data.familyLessonRelease;
    assert(!ids.has(release.id), 'Duplicate release identity');
    ids.add(release.id);
    const materials = data.materials.slice(base.materials.length);
    assert.equal(materials.length, loaded.added);
    for (const material of materials) {
      assert(!materialIds.has(material.id), 'Material identity reused across batches');
      materialIds.add(material.id);
    }
    const batch = {sourcePath:input.releasePath, release, materials};
    if (index < (previous?.releases.length || 0)) {
      assert.deepEqual(batch, previous.releases[index], 'Historical batch changed or reordered');
    }
    for (const unit of release.units) {
      assert(!unitIds.has(unit.id), 'Unit identity reused across batches');
      unitIds.add(unit.id);
      assert(!days.has(unit.day), 'Course day belongs to more than one batch');
      days.add(unit.day);
      for (const target of unit.targets) {
        assert(!words.has(target.canonicalId), 'A repeated target cannot count as a new word');
        words.add(target.canonicalId);
      }
      // Keep the original release and unit hashes. Never restamp old units
      // with the aggregate catalog's hash when appending future lessons.
      assignments.push({day:unit.day, releaseId:release.id,
        releaseSha256:release.releaseSha256, rootReviewSha256:release.rootReviewSha256,
        unitId:unit.id, unitSha256:unit.unitSha256});
    }
    batches.push(batch);
  }
  const catalog = {schema:1, kind:KIND, active:false,
    status:'verified-build-catalog-awaiting-runtime-adoption', baseSha256,
    releases:batches, assignments:assignments.sort((a,b) => a.day - b.day),
    counts:{batches:batches.length, days:days.size, newWords:words.size,
      materials:batches.reduce((n,batch) => n + batch.materials.length, 0)}};
  return {...catalog, catalogSha256:hash(catalog)};
}

function history(release) {
  if (!release) return [];
  assert.equal(release.active, true, 'Historical family release must be active');
  const rows=release.batches || [release];
  assert(Array.isArray(rows)&&rows.length>0, 'Historical batches required');
  return rows.map(({id,releaseSha256,rootReviewSha256,units})=>{
    assert(Array.isArray(units)&&units.length>0, 'Historical unit bindings required');
    return {id,releaseSha256,rootReviewSha256,units:units.map(({day,id,unitSha256})=>({day,id,unitSha256}))};
  });
}

function append(data, {releases, previous = null, requiredHistory = []} = {}) {
  const Public = require('./family-public-append-v1.cjs');
  // Validate the complete set before publishing any mutation to the caller.
  const catalog = compile({baseData:data, releases, previous});
  assert(Array.isArray(requiredHistory)&&requiredHistory.length<=catalog.releases.length, 'Cannot remove an installed family batch');
  for(const [index,pin] of requiredHistory.entries()){
    const actual=history(catalog.releases[index].release)[0];
    assert.deepEqual(actual,pin,'Installed family batch changed, removed or reordered');
  }
  const staged = clone(data);
  const first = Public.append(staged, {...releases[0], player:Player, essential:Essential});
  const legacy = clone(staged.familyLessonRelease);
  const unreceipted = clone(legacy);
  delete unreceipted.publicAppendReceipt;
  assert.deepEqual(unreceipted, catalog.releases[0].release, 'First batch changed during append');
  if (catalog.releases.length > 1) {
    staged.materials = [...clone(data.materials), ...catalog.releases.flatMap(batch => clone(batch.materials))];
    staged.familyLessonRelease = {...legacy,
      units:catalog.releases.flatMap(batch => clone(batch.release.units)),
      batches:catalog.releases.map(({release}) => ({id:release.id,
        releaseSha256:release.releaseSha256, rootReviewSha256:release.rootReviewSha256,
        units:release.units.map(({day,id,unitSha256}) => ({day,id,unitSha256}))}))};
  }
  assert.deepEqual(staged.days, data.days, 'Raw365 changed during append');
  assert.deepEqual(staged.publicCoursePlan, data.publicCoursePlan, 'Historical public plan changed');
  data.materials = staged.materials;
  data.familyLessonRelease = staged.familyLessonRelease;
  return {...first,
    result:{...first.result, added:catalog.counts.materials, units:catalog.counts.days},
    combinedCoreHash:Public.textHash(Public.core(staged)), catalog};
}

module.exports = {compile, append, history, KIND};
