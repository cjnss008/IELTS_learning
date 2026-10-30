'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { PUBLIC_V120, loadPublicInputs, buildInventory, eligible, fields } = require('../tools/build-annual-linked-supply.cjs');

test('every public candidate resolves to its exact ordinary source and is not counted twice', () => {
  const input = loadPublicInputs(path.resolve(__dirname, '..'), PUBLIC_V120);
  const materials = new Map(input.materials.map(item => [item.id, item]));
  const words = new Map(input.wordEntries.map(item => [item.id, item]));
  const hashCache = new Map(), fieldCache = new Map();
  for (const target of [30, 40]) {
    const report = buildInventory(input, { dailyTarget: target }), ids = new Set();
    assert.equal(report.status, 'authoring-triage-only-inactive');
    assert.equal(report.days, 364);
    assert.equal(report.missingReferences, 0);
    for (const day of report.dailyCandidates) {
      assert.ok(day.day >= 2 && day.day <= 365);
      assert.equal(day.targetCount, target);
      assert.equal(day.candidateShortfall, target - day.selectedCandidates.length);
      assert.ok(day.selectedCandidates.length <= target);
      const sourceIds = new Set(day.plannedSources.filter(item => item.status === 'candidate-only').map(item => item.materialId));
      for (const candidate of day.selectedCandidates) {
        assert.ok(!ids.has(candidate.canonicalId), candidate.canonicalId);
        ids.add(candidate.canonicalId);
        assert.equal(words.get(candidate.canonicalId)?.word, candidate.headword);
        assert.ok(candidate.links.reading || candidate.links.listening);
        assert.equal(candidate.literalSkillCount, Object.keys(candidate.links).length);
        assert.equal(candidate.meaningStatus, 'unreviewed-context-sense');
        assert.equal(candidate.actualLearnerNewness, 'unknown');
        assert.equal(candidate.mastery, false);
        for (const [skill, link] of Object.entries(candidate.links)) {
          const item = materials.get(link.materialId);
          assert.ok(item && eligible(item) && sourceIds.has(item.id), link.materialId);
          assert.equal(item.skill, skill);
          if (!hashCache.has(item.id)) hashCache.set(item.id, input.assessment.materialContentHash(item));
          assert.equal(link.materialContentHash, hashCache.get(item.id));
          if (!fieldCache.has(item.id)) fieldCache.set(item.id, fields(item));
          const field = fieldCache.get(item.id).find(row => row.field === link.field);
          assert.ok(field, link.field);
          assert.equal(link.sourceTextSha256, input.assessment.sourceTextHash(field.text));
          assert.equal(field.text.slice(link.start, link.end), link.surface);
          const normalize = value => value.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
          assert.equal(normalize(link.surface), normalize(candidate.headword));
        }
      }
    }
    assert.equal(ids.size, report.uniqueSelectedCandidates);
    assert.equal(report.dailyCandidates.at(-1).day, 365);
    assert.match(report.dailyCandidates.at(-1).annualReview, /runtime prerequisite and learner completion not checked/);
  }
});
