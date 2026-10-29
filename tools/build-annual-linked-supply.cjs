'use strict';

// Authoring triage only. This program does not access a learner profile, issue a
// teaching release, or determine what an individual has learned.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const SKILLS = ['reading', 'listening', 'grammar', 'speaking', 'writing'];
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const norm = value => String(value).toLowerCase().replace(/[’‘]/g, "'");
const tokenPattern = /[A-Za-z]+(?:['’‘-][A-Za-z]+)*/g;
// Only this reviewed public snapshot is executable by the command-line tool.
// A later course build needs an independently reviewed, explicit new profile.
const PUBLIC_V98 = Object.freeze({
  'assets/curriculum-data.js': 'd60f1cdf5c7bff610a3c23751f1722bc21aba3fbabb779c410e186eda69aed2c',
  'assets/essential-vocabulary-data.js': 'bf0f6fe5b623a9e5d5a37df16cda1a2a0c1c9ff73b76ed6318d45cc546eb8079',
  'assets/assessment-core.js': '1213fd82e082cc0979c07c9cd2084c73b08b3194524c05d44ed2232514c6e8d4',
  'assets/year-first-use-manifest.js': '662ba1544f13dd84b5f24903e68bce0c42e9cc2cb6ad4270e717fd161b82b332'
});
// v107 changes runtime/index bindings only; course bodies, days, word entries
// and assessment code were compared with the v98 snapshot before adding this
// separate profile. Keep the old profile for reproducible historical reports.
const PUBLIC_V107 = Object.freeze({
  ...PUBLIC_V98,
  'assets/curriculum-data.js': '0c2ecbdecc92278378ebbc9954afee6001f749ccc43d9a334a4be43ad6ef58e3',
  'assets/year-first-use-manifest.js': '602b599611662887fa71b0a311c512c95f4c572a2bb0110b981da66ddab326e6'
});

// v108 preserves all published materials, days and public-plan objects.
const PUBLIC_V108 = Object.freeze({
  ...PUBLIC_V107,
  'assets/curriculum-data.js': 'e1014386cd72dce8f00cdb0531a028c6591a0bbe9e86d5d1f786f25557506196',
  'assets/year-first-use-manifest.js': 'a6e33b1f66750b851e184274ca07251b101b5c9890c8512b13f928ab9e71a0f6'
});

// v109 appends only the reviewed linked lessons 5–10; original public content stays pinned.
const PUBLIC_V109 = Object.freeze({
  ...PUBLIC_V108,
  'assets/curriculum-data.js': 'baa5791b58a24f0527eacebd1b2a52f8324d652aff638bdf6d4d6fca1ea0499c',
  'assets/year-first-use-manifest.js': '5df4b480a5365fd77200e1c3c6358e8cc837e77dd309aa8405ebb20dc17dbc7d'
});
// v111 preserves assessment results while memoizing pure immutable hashes.
const PUBLIC_V111 = Object.freeze({
  ...PUBLIC_V109,
  "assets/curriculum-data.js": "decb972e5227460cdd566758a18ec0da2cbcd8f9ce32493bc43a9adc2cf444bf",
  "assets/year-first-use-manifest.js": "fb43c6c9d79a279182db15140e9f1ac03cbacb4b5fed317b1cca8ac9bbe425ad",
  "assets/assessment-core.js": "ce482dd90e0ffed7ce4bff347a50a2df7b5398c93473e8af1b94beb16b61f0ac"
});

// v112 changes startup and replay runtime bindings; public course bodies are unchanged.
const PUBLIC_V112 = Object.freeze({ ...PUBLIC_V111,
  "assets/curriculum-data.js": "956082d1eb26db431acd03a425aa71b4f3473167eb833e1cc36e921c3a4f4da2",
  "assets/year-first-use-manifest.js": "fa714b091dad937fedafdad51de183848635810d3eefd87e2918cbe8127c913c"
});

// v113 adds multiple reviewed batches while retaining the published first batch; public course bodies are unchanged.
const PUBLIC_V113 = Object.freeze({ ...PUBLIC_V112,
  "assets/curriculum-data.js": "32befccf132c38bc4904d7f96aa9f14e53da5effa813b30923e348e365856f78",
  "assets/year-first-use-manifest.js": "a4ff0d474e81ca5fc0a4b5e79d28cf2af15d104368f892eaeb4f6e8b8c76e956"
});

// v114 appends days11–20; the original public plan and first batch stay unchanged.
const PUBLIC_V114 = Object.freeze({ ...PUBLIC_V113,
  "assets/curriculum-data.js": "14f4132ba16e5f8d691885b7e0718ee426094a81ffab604b4feb9966841124e0",
  "assets/year-first-use-manifest.js": "faa6758ae410f16f913ca8f833b3ade727fe0737b28503eb8ba734cf35a477a3"
});

// v115 appends earlier days 2–3 without changing the original plans or installed batches.
const PUBLIC_V115 = Object.freeze({ ...PUBLIC_V114,
  "assets/curriculum-data.js": "2ab585d06f382cff35019da50d532714e37f3a777e0fdab4ed0b7b566f1162bb",
  "assets/year-first-use-manifest.js": "f673830aa5dddac63f7fad0023a287c784721099b95fda3977649935f09d7853"
});

function tokens(text) {
  return Array.from(String(text).matchAll(tokenPattern), match => ({
    key: norm(match[0]), start: match.index, end: match.index + match[0].length
  }));
}

function indexWords(entries) {
  const trie = { next: new Map(), words: [] }, ids = new Set(), wordKeys = new Set();
  let unsupported = 0;
  for (const entry of entries) {
    assert.ok(entry && typeof entry.id === 'string' && !ids.has(entry.id), 'duplicate vocabulary ID');
    ids.add(entry.id);
    const raw = String(entry.word || '').trim();
    const wordKey = norm(raw.normalize('NFKC')).replace(/\s+/g, ' ');
    assert.ok(wordKey && !wordKeys.has(wordKey), 'duplicate normalized vocabulary headword');
    wordKeys.add(wordKey);
    const parts = tokens(raw);
    if (!parts.length || norm(parts.map(part => raw.slice(part.start, part.end)).join(' ')) !== norm(raw.replace(/\s+/g, ' '))) {
      unsupported++;
      continue;
    }
    let node = trie;
    for (const part of parts) {
      if (!node.next.has(part.key)) node.next.set(part.key, { next: new Map(), words: [] });
      node = node.next.get(part.key);
    }
    node.words.push({ id: entry.id, word: raw, rank: Number.isFinite(entry.rank) ? entry.rank : Number.MAX_SAFE_INTEGER });
  }
  return { trie, indexed: ids.size - unsupported, unsupported };
}

function matchText(text, trie, onMatch) {
  const parts = tokens(text);
  for (let i = 0; i < parts.length; i++) {
    let node = trie;
    for (let j = i; j < parts.length; j++) {
      if (j > i && !/^\s+$/.test(text.slice(parts[j - 1].end, parts[j].start))) break;
      node = node.next.get(parts[j].key);
      if (!node) break;
      for (const word of node.words) onMatch(word, parts[i].start, parts[j].end);
    }
  }
}

function eligible(material) {
  return material && material.pool === 'training' && !material.fullTest &&
    !material.independentBank && !material.assessmentGroup && !material.form &&
    !material.source?.holdout && SKILLS.includes(material.skill);
}

function fields(material) {
  const add = (array, field, value) => {
    if (typeof value === 'string' && value.trim()) array.push({ field, text: value });
  };
  const result = [];
  if (material.skill === 'reading') add(result, 'passage', material.passage);
  if (material.skill === 'listening') add(result, 'transcript', material.transcript);
  if (material.skill === 'grammar') {
    add(result, 'passage', material.passage);
    add(result, 'grammar.explanation', material.grammar?.explanation);
    for (const [i, question] of (material.questions || []).entries()) add(result, `questions[${i}].prompt`, question.prompt);
  }
  if (material.skill === 'speaking') {
    add(result, 'prompt', material.prompt);
    add(result, 'reference', material.reference);
  }
  if (material.skill === 'writing') add(result, 'prompt', material.prompt);
  return result;
}

function summarizeLiteralLinks(days) {
  const targets = days.flatMap(day => day.selectedCandidates);
  const inBoth = item => Boolean(item.links.reading && item.links.listening);
  const inAll = item => SKILLS.every(skill => Boolean(item.links[skill]));
  return {
    selectedWithMultipleSkillFields: targets.filter(item => item.literalSkillCount >= 2).length,
    selectedInReadingAndListening: targets.filter(inBoth).length,
    selectedInAllFiveSkillFields: targets.filter(inAll).length,
    daysWithAnyReadingListeningMatch: days.filter(day => day.selectedCandidates.some(inBoth)).length,
    daysWithAnyAllFiveMatch: days.filter(day => day.selectedCandidates.some(inAll)).length,
    daysWithSixTaskEntries: days.filter(day => day.sixSkillTasksPresent).length,
    daysWithoutEligiblePracticeField: Object.fromEntries(SKILLS.map(skill => [skill,
      days.filter(day => day.missingEligiblePracticeSkills.includes(skill)).length]))
  };
}

function buildInventory({ days, materials, wordEntries, yearJobs, publicAssignments, assessment, inputPins }, options = {}) {
  const dailyTarget = options.dailyTarget === undefined ? 30 : options.dailyTarget;
  assert.ok(dailyTarget === 30 || dailyTarget === 40, 'daily target must be 30 or 40');
  assert.equal(days.length, 365, '365 course days required');
  const numberedDays = new Set(days.map(day => day?.day));
  assert.equal(numberedDays.size, 365, 'course day numbers must be unique');
  assert.ok(Array.from({ length: 365 }, (_, i) => i + 1).every(day => numberedDays.has(day)), 'course days 1–365 are required');
  const annualDay = days.find(day => day.day === 365);
  assert.ok(annualDay?.tasks?.some(task => task.id === 'reflection' && task.materialIds?.includes('reflection-365')),
    'day 365 annual reflection entry is missing');
  assert.ok(wordEntries.length >= 8000, 'at least 8000 reference headwords required');
  assert.ok(assessment?.materialContentHash && assessment?.sourceTextHash, 'assessment consumer required');
  const index = indexWords(wordEntries);
  const byId = new Map();
  for (const material of materials) {
    assert.ok(material && typeof material.id === 'string' && !byId.has(material.id), 'duplicate material ID');
    byId.set(material.id, material);
  }
  const plannedByDay = new Map();
  const addPlanned = (day, id, origin) => {
    if (!Number.isInteger(day) || day < 2 || day > 365 || typeof id !== 'string') return;
    if (!plannedByDay.has(day)) plannedByDay.set(day, []);
    plannedByDay.get(day).push({ id, origin });
  };
  for (const assignment of publicAssignments) {
    for (const id of assignment.materialIds || [assignment.materialId]) addPlanned(assignment.day, id, 'public-static-plan');
  }
  for (const job of yearJobs) {
    if (job.staticStatus === 'assigned-first-use') addPlanned(job.plannedCourseIndex, job.materialId, 'annual-static-plan');
  }
  const materialCache = new Map();
  function describe(material) {
    if (materialCache.has(material.id)) return materialCache.get(material.id);
    const description = {
      materialId: material.id,
      materialVersion: String(material.version || '1'),
      materialContentHash: assessment.materialContentHash(material),
      skill: material.skill,
      fields: fields(material).map(field => ({ ...field, sourceTextSha256: assessment.sourceTextHash(field.text) }))
    };
    materialCache.set(material.id, description);
    return description;
  }
  const alreadySelected = new Set(), allCandidateIds = new Set(), outputDays = [];
  let missingReferences = 0;
  for (let dayNumber = 2; dayNumber <= 365; dayNumber++) {
    const day = days.find(row => row.day === dayNumber);
    assert.ok(day && Array.isArray(day.tasks), 'course day missing');
    const refs = [], seen = new Set();
    const add = (id, origin) => {
      if (typeof id !== 'string' || seen.has(id)) return;
      seen.add(id);
      const material = byId.get(id);
      if (!material) { missingReferences++; refs.push({ materialId: id, origin, status: 'missing-reference' }); return; }
      if (!eligible(material)) return;
      refs.push({ materialId: id, origin, status: 'candidate-only' });
    };
    for (const task of day.tasks) if (SKILLS.includes(task.id)) for (const id of task.materialIds || []) add(id, 'original-course');
    for (const ref of plannedByDay.get(dayNumber) || []) add(ref.id, ref.origin);
    const matches = new Map();
    for (const ref of refs) {
      if (ref.status !== 'candidate-only') continue;
      const material = describe(byId.get(ref.materialId));
      for (const field of material.fields) {
        matchText(field.text, index.trie, (word, start, end) => {
          let found = matches.get(word.id);
          if (!found) matches.set(word.id, found = { ...word, links: {} });
          if (!found.links[material.skill]) found.links[material.skill] = {
            materialId: material.materialId, materialVersion: material.materialVersion,
            materialContentHash: material.materialContentHash, field: field.field,
            sourceTextSha256: field.sourceTextSha256, start, end,
            surface: field.text.slice(start, end), offsetUnit: 'UTF-16-code-unit', origin: ref.origin
          };
        });
      }
    }
    const candidates = [...matches.values()].filter(row => row.links.reading || row.links.listening);
    candidates.forEach(row => allCandidateIds.add(row.id));
    candidates.sort((a, b) => Object.keys(b.links).length - Object.keys(a.links).length || a.rank - b.rank || a.id.localeCompare(b.id));
    // The final day can have authoring candidates, but the existing annual
    // prerequisite must still be checked before any future runtime adoption.
    const available = candidates.filter(row => !alreadySelected.has(row.id));
    const selected = available.slice(0, dailyTarget);
    selected.forEach(row => alreadySelected.add(row.id));
    const present = new Set(refs.filter(row => row.status === 'candidate-only' && describe(byId.get(row.materialId)).fields.length)
      .map(row => byId.get(row.materialId).skill));
    outputDays.push({
      day: dayNumber, title: String(day.title || ''), status: 'candidate-only-not-a-course-release',
      sixSkillTasksPresent: ['vocabulary', ...SKILLS].every(skill => day.tasks.some(task => task.id === skill)),
      missingEligiblePracticeSkills: SKILLS.filter(skill => !present.has(skill)),
      plannedSources: refs, literalInputCandidates: candidates.length, availableCandidatesBeforeSelection: available.length,
      targetCount: dailyTarget, selectedCandidateCount: selected.length,
      candidateShortfall: dailyTarget - selected.length,
      selectedCandidates: selected.map(row => ({
        canonicalId: row.id, headword: row.word, rank: row.rank, literalSkillCount: Object.keys(row.links).length,
        links: row.links, meaningStatus: 'unreviewed-context-sense', actualLearnerNewness: 'unknown', mastery: false
      })),
      annualReview: dayNumber === 365 ? 'baseline-annual-reflection-entry-present; runtime prerequisite and learner completion not checked' : undefined
    });
  }
  const ordinary = outputDays.filter(row => row.day < 365);
  return {
    schema: 1, status: 'authoring-triage-only-inactive', inputPins,
    selectionHeuristic: 'greedy literal cross-skill overlap then reference rank; not an optimal allocation or learner history',
    dailyTarget, referenceHeadwords: wordEntries.length, indexedReferenceHeadwords: index.indexed,
    unsupportedHeadwords: index.unsupported, days: outputDays.length,
    minimumAdditionalHeadwordsForThirtyDaily: Math.max(0, outputDays.length * 30 - wordEntries.length),
    minimumAdditionalHeadwordsForTarget: Math.max(0, outputDays.length * dailyTarget - wordEntries.length),
    uniqueLiteralInputCandidates: allCandidateIds.size, uniqueSelectedCandidates: alreadySelected.size,
    daysWithThirtyCandidates: outputDays.filter(day => day.selectedCandidateCount >= 30).length,
    daysMeetingTarget: outputDays.filter(day => day.candidateShortfall === 0).length,
    totalCandidateShortfall: outputDays.reduce((sum, day) => sum + day.candidateShortfall, 0),
    ordinaryDaysWithThirtyCandidates: ordinary.filter(day => day.selectedCandidateCount >= 30).length,
    ordinaryDaysMeetingTarget: ordinary.filter(day => day.candidateShortfall === 0).length,
    ordinaryCandidateShortfall: ordinary.reduce((sum, day) => sum + day.candidateShortfall, 0), missingReferences,
    literalLinkage: summarizeLiteralLinks(outputDays),
    limitations: [
      'Candidate links are exact textual matches, not verified word senses, appropriate level, grammar, learner newness or mastery.',
      'A greedy shortfall is an authoring triage result, not proof of the best possible allocation; the calculation of additional headwords assumes none were previously learned.',
      'Static references are proposals: access, budget, due reviews, material exposure, rights and completed work require runtime verification.',
      'Generated candidates do not create course materials, learner records, a release or independent assessment credit.',
      'This tool only reads the public snapshot; day 365 has an annual-reflection entry but runtime prerequisites and learner completion are not checked.',
      'The daily target is an authoring target, not a promise of truly new words or a cutoff on due reviews.',
      'A 40-target greedy run changes allocation for later days, so its thirty-candidate count is not comparable to a separate 30-target run.',
      'Literal linkage does not verify a shared sense or teaching relationship; missing ordinary fields also include independent assessment and annual-review days.'
    ],
    dailyCandidates: outputDays
  };
}

function safePublicRead(root, relative) {
  assert.ok(typeof relative === 'string' && !path.isAbsolute(relative) && !relative.includes('\\'), 'relative public path required');
  const fixed = Object.prototype.hasOwnProperty.call(PUBLIC_V98, relative);
  const index = /^curriculum\/year-first-use\/index\.[a-f0-9]{16}\.json$/.test(relative);
  const body = /^curriculum\/year-first-use\/materials\/[A-Za-z0-9][A-Za-z0-9_.-]*\.json$/.test(relative);
  assert.ok(fixed || index || body, 'source is outside the public allowlist');
  let current = root;
  for (const [i, segment] of relative.split('/').entries()) {
    assert.ok(segment && segment !== '.' && segment !== '..', 'invalid path segment');
    current = path.join(current, segment);
    const stat = fs.lstatSync(current);
    assert.ok(!stat.isSymbolicLink(), 'public source contains a symbolic link or junction');
    if (i === relative.split('/').length - 1) {
      assert.ok(stat.isFile() && stat.nlink === 1, 'public source must be a single-link file');
    } else assert.ok(stat.isDirectory(), 'public source parent must be a directory');
  }
  const beforeOpen = fs.lstatSync(current, { bigint: true });
  assert.ok(beforeOpen.isFile() && beforeOpen.nlink === 1n && beforeOpen.ino > 0n, 'source identity before opening is unavailable');
  const descriptor = fs.openSync(current, 'r');
  try {
    const normalizePath = value => process.platform === 'win32' ? value.toLowerCase() : value;
    const resolved = fs.realpathSync(current);
    assert.equal(normalizePath(resolved), normalizePath(path.join(root, ...relative.split('/'))), 'opened source resolved outside its expected public path');
    const stat = fs.fstatSync(descriptor, { bigint: true });
    const named = fs.statSync(current, { bigint: true });
    assert.ok(stat.isFile() && stat.nlink === 1n && stat.ino > 0n, 'opened source must be an identifiable single-link file');
    assert.ok(beforeOpen.dev === stat.dev && beforeOpen.ino === stat.ino, 'source identity changed before opening');
    assert.ok(named.dev === stat.dev && named.ino === stat.ino && named.nlink === 1n, 'opened source identity changed');
    const data = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor, { bigint: true });
    assert.ok(after.dev === stat.dev && after.ino === stat.ino && after.size === stat.size && after.mtimeNs === stat.mtimeNs,
      'opened source changed while being read');
    return data;
  } finally { fs.closeSync(descriptor); }
}

function evaluatePublicModule(bytes, name) {
  const sandbox = { module: { exports: {} }, require: value => {
    if (value === 'node:crypto') return crypto;
    throw Error('unexpected module in public snapshot');
  } };
  vm.runInNewContext(bytes.toString('utf8'), sandbox, { filename: name, timeout: 10000 });
  return sandbox.module.exports;
}

function loadPublicInputs(root, profile = PUBLIC_V98) {
  const requested = path.resolve(root), canonical = fs.realpathSync(requested);
  const comparePath = value => process.platform === 'win32' ? value.toLowerCase() : value;
  assert.equal(comparePath(canonical), comparePath(requested), 'public root may not be a symlink or junction');
  assert.ok(!fs.lstatSync(canonical).isSymbolicLink(), 'public root may not be a symbolic link');
  const read = relative => safePublicRead(canonical, relative);
  const modulePaths = Object.keys(PUBLIC_V98), modules = {}, moduleHashes = {};
  for (const name of modulePaths) {
    const bytes = read(name), actual = sha(bytes);
    assert.equal(actual, profile[name], `unapproved public module: ${name}`);
    moduleHashes[name] = actual;
    modules[name] = evaluatePublicModule(bytes, name);
  }
  const D = modules['assets/curriculum-data.js'];
  const E = modules['assets/essential-vocabulary-data.js'];
  const A = modules['assets/assessment-core.js'];
  const manifest = modules['assets/year-first-use-manifest.js'];
  const indexBytes = read(manifest.index.path);
  assert.equal(indexBytes.length, manifest.index.bytes, 'annual index length');
  assert.equal(sha(indexBytes), manifest.index.sha256, 'annual index hash');
  const index = JSON.parse(indexBytes);
  const yearMaterials = index.jobs.map(job => {
    const body = read(job.ref.path);
    assert.equal(body.length, job.ref.bytes, `annual material length: ${job.materialId}`);
    assert.equal(sha(body), job.ref.sha256, `annual material hash: ${job.materialId}`);
    const material = JSON.parse(body);
    assert.equal(material.id, job.materialId, 'annual material identity');
    assert.equal(material.skill, job.skill, 'annual material skill');
    return material;
  });
  return {
    days: D.days, materials: [...D.materials, ...yearMaterials], wordEntries: E.entries,
    yearJobs: index.jobs, publicAssignments: D.publicCoursePlan?.assignments || [], assessment: A,
    inputPins: {
      curriculumSha256: moduleHashes['assets/curriculum-data.js'],
      vocabularySha256: moduleHashes['assets/essential-vocabulary-data.js'],
      annualIndexPath: manifest.index.path, annualIndexSha256: manifest.index.sha256,
      assessmentSha256: moduleHashes['assets/assessment-core.js'],
      manifestSha256: moduleHashes['assets/year-first-use-manifest.js'],
      toolSha256: sha(fs.readFileSync(__filename))
    }
  };
}

function parseArguments(argv) {
  const usage = 'Use --root REVIEWED_PUBLIC_SNAPSHOT [--full] [--daily-target 30|40] [--profile 0.0.98|0.0.107|0.0.108|0.0.109|0.0.111|0.0.112|0.0.113|0.0.114|0.0.115]';
  assert.ok(argv.length >= 2 && argv[0] === '--root' && typeof argv[1] === 'string' && argv[1], usage);
  let full = false, dailyTarget = 30, hasTarget = false, profile;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--full' && !full) full = true;
    else if (argv[i] === '--daily-target' && !hasTarget && ['30', '40'].includes(argv[i + 1])) {
      dailyTarget = Number(argv[++i]); hasTarget = true;
    } else if (argv[i] === '--profile' && !profile && ['0.0.98', '0.0.107', '0.0.108', '0.0.109', '0.0.111', '0.0.112', '0.0.113', '0.0.114', '0.0.115'].includes(argv[i + 1])) {
      profile = argv[++i];
    } else throw Error(usage);
  }
  return { root: argv[1], full, dailyTarget, ...(profile ? { profile } : {}) };
}

function main(argv) {
  const args = parseArguments(argv);
  const root = path.resolve(args.root);
  const report = buildInventory(loadPublicInputs(root, args.profile === '0.0.115' ? PUBLIC_V115 : args.profile === '0.0.114' ? PUBLIC_V114 : args.profile === '0.0.113' ? PUBLIC_V113 : args.profile === '0.0.112' ? PUBLIC_V112 : args.profile === '0.0.111' ? PUBLIC_V111 : args.profile === '0.0.109' ? PUBLIC_V109 : args.profile === '0.0.108' ? PUBLIC_V108 : args.profile === '0.0.107' ? PUBLIC_V107 : PUBLIC_V98), { dailyTarget: args.dailyTarget });
  if (args.full) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }
  console.log(JSON.stringify({ status: report.status, days: report.days, dailyTarget: report.dailyTarget,
    uniqueLiteralInputCandidates: report.uniqueLiteralInputCandidates,
    uniqueSelectedCandidates: report.uniqueSelectedCandidates,
    daysWithThirtyCandidates: report.daysWithThirtyCandidates,
    daysMeetingTarget: report.daysMeetingTarget,
    minimumAdditionalHeadwordsForTarget: report.minimumAdditionalHeadwordsForTarget,
    literalLinkage: report.literalLinkage,
    totalCandidateShortfall: report.totalCandidateShortfall,
    missingReferences: report.missingReferences }));
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error('Annual supply triage failed:', error.message); process.exitCode = 1; }
}
module.exports = { PUBLIC_V98, PUBLIC_V107, PUBLIC_V108, PUBLIC_V109, PUBLIC_V111, PUBLIC_V112, PUBLIC_V113, PUBLIC_V114, PUBLIC_V115, tokens, indexWords, matchText, eligible, fields, summarizeLiteralLinks, buildInventory, safePublicRead, loadPublicInputs, parseArguments, main };
