'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const { indexWords, matchText, eligible, fields, buildInventory, safePublicRead, loadPublicInputs, main } = require('../tools/build-annual-linked-supply.cjs');

const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const assessment = { sourceTextHash: sha, materialContentHash: material => sha(JSON.stringify(material)) };

test('literal matching uses word boundaries, respects phrase spacing, and returns original offsets', () => {
  const entries = [{ id: 'map', word: 'map' }, { id: 'take-up', word: 'take up' }, { id: 'cant', word: "can't" }];
  const { trie } = indexWords(entries);
  const text = "Maple, MAP; take  up; take-up; can’t.";
  const found = [];
  matchText(text, trie, (word, start, end) => found.push([word.id, text.slice(start, end)]));
  assert.deepEqual(found, [['map', 'MAP'], ['take-up', 'take  up'], ['cant', 'can’t']]);
});

test('exam, holdout and non-training materials are excluded', () => {
  const ordinary = { id: 'r', skill: 'reading', pool: 'training' };
  assert.equal(eligible(ordinary), true);
  for (const change of [{ pool: 'final' }, { fullTest: true }, { independentBank: true },
    { assessmentGroup: 'g' }, { form: 'B' }, { source: { holdout: true } }]) {
    assert.equal(eligible({ ...ordinary, ...change }), false);
  }
});

function fillerWord(number) {
  let value = number, result = '';
  do { result = String.fromCharCode(97 + value % 26) + result; value = Math.floor(value / 26); } while (value);
  return 'zzq' + result;
}
function fixture() {
  const words = ['map', 'cross', 'park', 'take up', ...Array.from({ length: 7996 }, (_, i) => fillerWord(i))];
  const wordEntries = words.map((word, i) => ({ id: 'essential:' + word, word, rank: i + 1 }));
  const materials = [
    { id: 'read-2', version: 1, pool: 'training', skill: 'reading', passage: 'The MAP shows a park. We can cross.' },
    { id: 'listen-2', pool: 'training', skill: 'listening', transcript: 'Look at the map before you cross.' },
    { id: 'grammar-2', pool: 'training', skill: 'grammar', passage: 'We use a map.', questions: [{ prompt: 'Where is the park?' }] },
    { id: 'speak-2', pool: 'training', skill: 'speaking', prompt: 'Describe your map.', reference: 'I take up a new game.' },
    { id: 'write-2', pool: 'training', skill: 'writing', prompt: 'Write about a park.' },
    { id: 'read-3', pool: 'training', skill: 'reading', passage: 'The park has a map. We take up a game.' },
    { id: 'secret', pool: 'final', skill: 'reading', passage: fillerWord(100) },
    { id: 'read-365', pool: 'training', skill: 'reading', passage: fillerWord(101) }
  ];
  const days = Array.from({ length: 365 }, (_, i) => ({ day: i + 1, title: 'Synthetic', tasks: [] }));
  days[0].tasks = [{ id: 'reading', materialIds: ['secret'] }];
  days[1].tasks = [
    { id: 'vocabulary', materialIds: [] }, { id: 'reading', materialIds: ['read-2', 'secret'] },
    { id: 'listening', materialIds: ['listen-2'] }, { id: 'grammar', materialIds: ['grammar-2'] },
    { id: 'speaking', materialIds: ['speak-2'] }, { id: 'writing', materialIds: ['write-2'] }
  ];
  days[2].tasks = [{ id: 'reading', materialIds: ['read-3'] }];
  days[364].tasks = [{ id: 'reading', materialIds: ['read-365'] }, { id: 'reflection', materialIds: ['reflection-365'] }];
  return { days, materials, wordEntries, yearJobs: [], publicAssignments: [], assessment, inputPins: { synthetic: true } };
}

test('daily triage retains source offsets, counts shortfalls and never asserts learner progress', () => {
  const input = fixture(), report = buildInventory(input), day2 = report.dailyCandidates[0], day3 = report.dailyCandidates[1];
  assert.equal(report.days, 364);
  assert.equal(report.minimumAdditionalHeadwordsForThirtyDaily, 2920);
  assert.equal(day2.day, 2);
  assert.equal(day2.sixSkillTasksPresent, true);
  assert.equal(day2.targetCount, 30);
  const map = day2.selectedCandidates.find(word => word.headword === 'map');
  assert.equal(map.literalSkillCount, 4);
  assert.equal(map.actualLearnerNewness, 'unknown');
  assert.equal(map.meaningStatus, 'unreviewed-context-sense');
  assert.equal(map.mastery, false);
  for (const [skill, link] of Object.entries(map.links)) {
    const material = input.materials.find(item => item.id === link.materialId);
    const field = fields(material).find(item => item.field === link.field);
    assert.equal(material.skill, skill);
    assert.equal(sha(field.text), link.sourceTextSha256);
    assert.equal(field.text.slice(link.start, link.end), link.surface);
  }
  assert.ok(day2.candidateShortfall > 0);
  assert.ok(!day2.selectedCandidates.some(word => word.headword === fillerWord(100)));
  assert.ok(!day3.selectedCandidates.some(word => word.headword === 'map'));
  const last = report.dailyCandidates.at(-1);
  assert.equal(last.day, 365);
  assert.equal(last.targetCount, 30);
  assert.match(last.annualReview, /runtime prerequisite and learner completion not checked/);
  assert.ok(last.selectedCandidates.some(word => word.headword === fillerWord(101)));
  assert.equal(report.status, 'authoring-triage-only-inactive');
  assert.equal(report.missingReferences, 0);
});

test('a reference list can expand beyond 8000 entries without falsely claiming completion', () => {
  const input = fixture();
  input.wordEntries.push({ id: 'essential:extension', word: 'extension', rank: 8001 });
  const report = buildInventory(input);
  assert.equal(report.referenceHeadwords, 8001);
  assert.equal(report.minimumAdditionalHeadwordsForThirtyDaily, 2919);
  assert.equal(report.status, 'authoring-triage-only-inactive');
});

test('missing planned references stay visible rather than becoming completed content', () => {
  const input = fixture();
  input.publicAssignments = [{ day: 3, materialId: 'does-not-exist' }];
  const report = buildInventory(input);
  assert.equal(report.missingReferences, 1);
  assert.deepEqual(report.dailyCandidates[1].plannedSources.find(ref => ref.materialId === 'does-not-exist'),
    { materialId: 'does-not-exist', origin: 'public-static-plan', status: 'missing-reference' });
});

test('triage does not accept an arbitrary output path', () => {
  assert.throws(() => main(['--root', __dirname, '--output', path.join(__dirname, '..candidate.json')]), /Use --root/);
});

test('duplicate normalized headwords and missing days cannot inflate the course target', () => {
  const first = fixture();
  first.wordEntries[7999] = { id: 'essential:duplicate-map', word: 'MAP', rank: 8000 };
  assert.throws(() => buildInventory(first), /duplicate normalized vocabulary headword/);
  const second = fixture();
  second.days[0].day = 2;
  assert.throws(() => buildInventory(second), /course day numbers must be unique/);
  const third = fixture();
  third.days[364].tasks = [];
  assert.throws(() => buildInventory(third), /annual reflection entry is missing/);
});

test('a tampered annual source is rejected before a report can be built', t => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ielts-public-supply-'));
  t.after(() => {
    assert.equal(path.dirname(tempRoot), path.resolve(os.tmpdir()));
    assert.ok(path.basename(tempRoot).startsWith('ielts-public-supply-'));
    fs.rmSync(tempRoot, { recursive: true });
  });
  fs.mkdirSync(path.join(tempRoot, 'assets'));
  fs.mkdirSync(path.join(tempRoot, 'curriculum', 'year-first-use', 'materials'), { recursive: true });
  const source = Buffer.from(JSON.stringify({ id: 'annual-reading', skill: 'reading', pool: 'training', passage: 'A map.' }));
  const ref = { path: 'curriculum/year-first-use/materials/annual.json', bytes: source.length, sha256: sha(source) };
  const indexBytes = Buffer.from(JSON.stringify({ jobs: [{ materialId: 'annual-reading', skill: 'reading', ref }] }));
  fs.writeFileSync(path.join(tempRoot, ref.path), source);
  const indexPath = 'curriculum/year-first-use/index.0123456789abcdef.json';
  fs.writeFileSync(path.join(tempRoot, indexPath), indexBytes);
  fs.writeFileSync(path.join(tempRoot, 'assets/curriculum-data.js'), 'module.exports={days:[],materials:[],publicCoursePlan:{assignments:[]}};');
  fs.writeFileSync(path.join(tempRoot, 'assets/essential-vocabulary-data.js'), 'module.exports={entries:[]};');
  fs.writeFileSync(path.join(tempRoot, 'assets/assessment-core.js'), 'module.exports={};');
  fs.writeFileSync(path.join(tempRoot, 'assets/year-first-use-manifest.js'), 'module.exports=' + JSON.stringify({ index: { path: indexPath, bytes: indexBytes.length, sha256: sha(indexBytes) } }) + ';');
  const names = ['assets/curriculum-data.js', 'assets/essential-vocabulary-data.js', 'assets/assessment-core.js', 'assets/year-first-use-manifest.js'];
  const profile = Object.fromEntries(names.map(name => [name, sha(fs.readFileSync(path.join(tempRoot, name)))]));
  assert.equal(loadPublicInputs(tempRoot, profile).materials[0].id, 'annual-reading');
  fs.writeFileSync(path.join(tempRoot, ref.path), Buffer.from(source.toString().replace('map', 'cat')));
  assert.throws(() => loadPublicInputs(tempRoot, profile), /annual material hash/);
  fs.writeFileSync(path.join(tempRoot, 'assets/curriculum-data.js'), 'throw Error("not approved");');
  assert.throws(() => loadPublicInputs(tempRoot, profile), /unapproved public module/);
  assert.throws(() => safePublicRead(tempRoot, 'private/settings.json'), /outside the public allowlist/);
  const second = path.join(tempRoot, 'curriculum/year-first-use/materials/linked.json');
  fs.linkSync(path.join(tempRoot, ref.path), second);
  assert.throws(() => safePublicRead(tempRoot, 'curriculum/year-first-use/materials/linked.json'), /single-link/);
});
