'use strict';
// Local, inactive and unsigned candidate only. No network, TTS, service or learner data.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const cp = require('node:child_process');

const pkg = path.resolve(__dirname, '..');
const work = path.dirname(pkg);
const repo = '\\\\mynas\\family\\IELTS_learning开发';
assert.equal(path.basename(pkg), 'linked-course-package-v115');
const rebound = path.join(work, 'linked02-03-audio-rebound');
const generated = path.join(work, 'linked2-3-audio-candidates');
const oralDir = path.join(work, 'linked02-03-oral-candidates');
const asrDir = path.join(work, 'linked02-03-audio-content');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const readJson = bytes => JSON.parse(bytes.toString('utf8'));
const norm = value => String(value || '').toLowerCase();
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
  }
  return value;
}
const canonicalSha = value => sha(JSON.stringify(sorted(value)));
const pins = {
  'assets/assessment-core.js': 'ce482dd90e0ffed7ce4bff347a50a2df7b5398c93473e8af1b94beb16b61f0ac',
  'assets/oral-practice.js': 'c6023e70f713f02209ea461f4ff6fad7224b1f5783d9fe049def157d79a3bfdb',
  'assets/course-player.js': '0bae0b4e268a71801805e52d2475c18df17f49db803d21f33a5e7ab89b0b84fa',
  'assets/family-lesson-expansion-v95.js': 'fff72eb8b252bec9d33de32db98159b7b60867f80949b821b5c35ed8e32cfaa6',
  'assets/essential-vocabulary-data.js': 'bf0f6fe5b623a9e5d5a37df16cda1a2a0c1c9ff73b76ed6318d45cc546eb8079',
  'assets/curriculum-data.js': '14f4132ba16e5f8d691885b7e0718ee426094a81ffab604b4feb9966841124e0',
  'tools/apply-family-lessons-v95.cjs': 'ea56be2401e4a8edaf127199f4c48889e1b430fdad2305cd7901367fc5e7e0c9',
  'tools/family-release-catalog.cjs': '27c01f58360d8abd8ecd68cfe8c06170b60812aec9d0fcfb27385952a15020ca',
  'curriculum/family-lessons-v109/release.json': '0b18cc52823cb1ce1e72192647a7293ee260ba2d65f4799e6e8af38442cbf467',
  'curriculum/family-lessons-v114/release.json': '17f24aef0ccbc25224fa2ed3641f6ccb8de4f9c8fff2eb085bfb8fc4315e28ca'
};
const draftPins = {
  2: '8985133f495899bc533254c27669f53187305c8980da1bbb9e68ef8d8246a381',
  3: '48fa5999ddbda6af4334c22b67ec21c3db36ace81211c8612423ec804d508c13'
};
const fixedInputPins = {
  'linked02-03-audio-rebound/audio-report.json': '581ef862a92e68139db7a1ba54cf47c70712d3b089348ef91c97fe6c13b99742',
  'linked02-03-audio-rebound/binding-manifest.json': '86bda0672206c24e8d8418b2277f32d090e6e96f8394f1248e964ba05764160f',
  'linked02-03-audio-rebound/verification.json': '67ff3779c0fc6a03454254bd3e40bbc6e6c00fee8c9a11f230c98b70c6d2a766',
  'linked02-03-audio-rebound/audio-equivalence-for-rebinding.json': '43e084a84dc3857d76657007d6f1334bf6ded154e4dfd473eb045753ec9a2628',
  'linked02-03-audio-rebound/history/audio-report.json': 'f4d596be705201d12a6752e3816f6afc6b88f9ebb5ef539f85235423933cc259',
  'linked02-03-audio-rebound/history/input-manifest.json': 'b4b7c230136bdb1806c2652b8b1f2a8ebfa871e5acd3fe2249731d0ac1d9c324',
  'linked02-03-oral-candidates/plan.json': '803ebfd174928127c1b26d8eaa149ceb9f2b883e06877a651fdf9303ce5f5b11',
  'linked02-03-oral-candidates/audio-report.json': '94c2a036aef1d9f7f342cc1c9940da7ef16dfafb3e90192dfa88dbfacda1599c',
  'linked02-03-oral-candidates/verification.json': 'a31775410667dc21f1222d1660a36005540ed2e57ff42fa28693922e43fb6f61',
  'linked02-03-audio-content/plan.json': '143df01480101e7417c49fd8ac3a15adb8753f5dfe4711eb8351209d3ba4353c',
  'linked02-03-audio-content/report.json': 'ec9018546acecbb39962260ee88eae421d7b157489e993974292a96f2bdfee9b',
  'linked02-03-audio-content/results/d2-listening-1.json': 'a66c7afb4fa103538164e136cee938150d7dcb19885593d39eb7513e206cea15',
  'linked02-03-audio-content/results/d2-listening-2.json': 'dd4e7bf4569e1a4727978a5e41381d5b66a93719160a226cab8ac1e7510fbdd0',
  'linked02-03-audio-content/results/d2-oral-1.json': '85123a9c6150e50812707a6276c0a7ddeeb99c5fa48ba44853dceaad57b43129',
  'linked02-03-audio-content/results/d2-oral-2.json': '6390d3a77331c1128310ae35a51ffdc1e6ee6a1dc3293709c4776eacfeb84313',
  'linked02-03-audio-content/results/d2-oral-full.json': '66dc08ac60ebff5f670460cbd213ba497cd7f2d27883dc273391809a49e1f5e5',
  'linked02-03-audio-content/results/d3-listening-1.json': 'b0619b26e9fc9f2b5bf569defecd85edadbd5557e9de50976cabedb794f44585',
  'linked02-03-audio-content/results/d3-listening-2.json': '3532f9a42487862c4a4871bc94a84547a3b9bf3b41e5035be5ecb3625d955d25',
  'linked02-03-audio-content/results/d3-oral-1.json': 'aef1aa521d1f90b8d43573df75bc8336c60e77954677e3c924744b14db929d13',
  'linked02-03-audio-content/results/d3-oral-2.json': 'c9ba28e2f909afaf51f7fe02f8855e217dd5e51dfe77c87c6ab8b29159e77ec9',
  'linked02-03-audio-content/results/d3-oral-full.json': '21485b6ba044832cba7fb2928b68ce8af253e10ba07cd3a54e033dccbc5cd39e'
};
const head = cp.execFileSync('git', ['-c', 'safe.directory=//mynas/family/IELTS_learning开发', '-C', repo, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
assert.equal(head, '735dbcc8e7c4a8e5a2ad89aa4c7ea9d65e7319d6');
for (const [rel, expected] of Object.entries(pins)) {
  assert.equal(sha(fs.readFileSync(path.join(repo, ...rel.split('/')))), expected, 'Project dependency changed: ' + rel);
}
const A = require(path.join(repo, 'assets/assessment-core.js'));
const oral = require(path.join(repo, 'assets/oral-practice.js'));
const helper = require(path.join(repo, 'assets/family-lesson-expansion-v95.js'));
const E = require(path.join(repo, 'assets/essential-vocabulary-data.js')).entries;
const current = require(path.join(repo, 'assets/curriculum-data.js'));
const resolve = helper.createLexemeResolver(E);
const core = new Map(E.map(entry => [entry.id, entry]));
const files = new Map(), inputs = new Map(), audioRows = [], draftRows = [], changes = [];
function validRelative(rel) {
  assert(typeof rel === 'string' && rel && !rel.includes('\\') && !path.isAbsolute(rel));
  assert(!rel.split('/').some(part => !part || part === '.' || part === '..'));
}
function add(rel, value) {
  validRelative(rel);
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (files.has(rel)) assert(files.get(rel).equals(bytes), 'Conflicting output: ' + rel);
  else files.set(rel, bytes);
  return {path:rel, sha256:sha(bytes), bytes:bytes.length};
}
function addJson(rel, value) { return add(rel, JSON.stringify(value, null, 2) + '\n'); }
function loadInput(file, expected) {
  const resolved = path.resolve(file);
  assert(resolved.startsWith(work + path.sep) || resolved.startsWith(repo + path.sep), 'Input outside fixed work/project roots');
  const bytes = fs.readFileSync(resolved), digest = sha(bytes);
  if (expected) assert.equal(digest, expected, 'Input hash changed: ' + resolved);
  const prior = inputs.get(resolved);
  if (prior) assert.equal(prior, digest);
  inputs.set(resolved, digest);
  return bytes;
}
function stage(file, dest, expected) {
  const bytes = loadInput(file, expected), ref = add(dest, bytes);
  return {...ref, originalPath:file.startsWith(work + path.sep)
    ? 'work/' + path.relative(work, file).split(path.sep).join('/')
    : 'project/' + path.relative(repo, file).split(path.sep).join('/')};
}
function fromWork(rel, dest) {
  validRelative(rel);
  return stage(path.join(work, ...rel.split('/')), dest, fixedInputPins[rel]);
}
function audioOut(kind, day, rel, bytes, details) {
  const pin = add(rel, bytes);
  const row = {kind, day, src:rel, sha256:pin.sha256, bytes:pin.bytes, ...details};
  audioRows.push(row);
  return {src:rel, sha256:pin.sha256, bytes:pin.bytes};
}
function cleanCandidateFields(value) {
  if (Array.isArray(value)) return value.map(cleanCandidateFields);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['audioPending','audioCandidate','currentAudioCandidate'].includes(key))
    .map(([key, child]) => [key, cleanCandidateFields(child)]));
}
function exactQuestions(material, wanted) {
  assert.equal(material.questionCount, wanted);
  assert.equal(material.questions.length, wanted);
  const text = material.skill === 'listening' ? material.transcript : material.passage;
  const ids = new Set();
  for (const q of material.questions) {
    assert(q.id && !ids.has(q.id)); ids.add(q.id);
    assert(q.prompt && q.evidence && q.explanation && Array.isArray(q.answers) && q.answers.length);
    assert.equal(q.evidenceOffsets.unit, 'UTF-16-code-unit');
    assert.equal(text.slice(q.evidenceOffsets.start, q.evidenceOffsets.end), q.evidence);
    assert(Array.isArray(q.options) && q.options.length === 4 && q.answers.every(answer => q.options.includes(answer)));
    for (const answer of q.answers) {
      const result = A.gradeQuestion(q, answer);
      assert(result.correct && result.gradable, material.id + ':' + q.id);
    }
  }
}
function group(folder, key, expectedAudio, options = {}) {
  assert(/^[a-f0-9]{64}$/.test(key));
  const metaPath = path.join(folder, 'tts-work', 'groups', key + '.json');
  const metaRef = stage(metaPath, 'provenance/tts/groups/' + key + '.json', options.metadataSha256);
  const meta = readJson(files.get(metaRef.path));
  assert.equal(canonicalSha(meta.identity), key);
  assert.equal(meta.audioHash, expectedAudio);
  assert(Array.isArray(meta.wordBoundaries) && meta.wordBoundaries.length > 0);
  const groupAudio = loadInput(path.join(folder, 'tts-work', 'groups', key + '.mp3'), expectedAudio);
  const groupRef = options.keepAudio ? add('provenance/tts/groups/' + key + '.mp3', groupAudio) : null;
  return {meta, metaRef, groupRef, audio:groupAudio};
}
const refs = {};
for (const [rel, dest] of [
  ['linked02-03-audio-rebound/audio-report.json','provenance/audio-rebound/audio-report.json'],
  ['linked02-03-audio-rebound/binding-manifest.json','provenance/audio-rebound/binding-manifest.json'],
  ['linked02-03-audio-rebound/verification.json','provenance/audio-rebound/verification.json'],
  ['linked02-03-audio-rebound/audio-equivalence-for-rebinding.json','provenance/audio-rebound/audio-equivalence-for-rebinding.json'],
  ['linked02-03-audio-rebound/history/audio-report.json','provenance/audio-rebound/history/audio-report.json'],
  ['linked02-03-audio-rebound/history/input-manifest.json','provenance/audio-rebound/history/input-manifest.json'],
  ['linked02-03-oral-candidates/plan.json','provenance/oral/plan.json'],
  ['linked02-03-oral-candidates/audio-report.json','provenance/oral/audio-report.json'],
  ['linked02-03-oral-candidates/verification.json','provenance/oral/verification.json'],
  ['linked02-03-audio-content/plan.json','provenance/asr/plan.json'],
  ['linked02-03-audio-content/report.json','provenance/asr/report.json']
]) refs[rel] = fromWork(rel, dest);
const audioReport = readJson(files.get(refs['linked02-03-audio-rebound/audio-report.json'].path));
const binding = readJson(files.get(refs['linked02-03-audio-rebound/binding-manifest.json'].path));
const audioVerification = readJson(files.get(refs['linked02-03-audio-rebound/verification.json'].path));
const eq = readJson(files.get(refs['linked02-03-audio-rebound/audio-equivalence-for-rebinding.json'].path));
const oldReport = readJson(files.get(refs['linked02-03-audio-rebound/history/audio-report.json'].path));
const oralPlan = readJson(files.get(refs['linked02-03-oral-candidates/plan.json'].path));
const oralReport = readJson(files.get(refs['linked02-03-oral-candidates/audio-report.json'].path));
const oralVerification = readJson(files.get(refs['linked02-03-oral-candidates/verification.json'].path));
const asrPlan = readJson(files.get(refs['linked02-03-audio-content/plan.json'].path));
const asrReport = readJson(files.get(refs['linked02-03-audio-content/report.json'].path));
assert.equal(audioReport.active, false); assert.equal(binding.active, false);
assert.equal(audioVerification.reportSha256, refs['linked02-03-audio-rebound/audio-report.json'].sha256);
assert.equal(audioReport.rebinding.previousReportSha256, refs['linked02-03-audio-rebound/history/audio-report.json'].sha256);
assert.equal(audioReport.rebinding.equivalenceReportSha256, refs['linked02-03-audio-rebound/audio-equivalence-for-rebinding.json'].sha256);
assert.equal(audioReport.rebinding.audioRegenerated, false);
assert.equal(audioReport.words.length, 60); assert.equal(audioReport.listeningAudit.items.length, 2);
assert.equal(eq.wordFiles.length, 60); assert.equal(eq.listeningFiles.length, 2);
assert.equal(oralPlan.active, false); assert.equal(oralReport.active, false);
assert.equal(oralReport.planSha256, refs['linked02-03-oral-candidates/plan.json'].sha256);
assert.equal(oralVerification.reportSha256, refs['linked02-03-oral-candidates/audio-report.json'].sha256);
assert.deepEqual(oralReport.sources, oralPlan.sources);
assert.equal(oralPlan.entries.length, 6); assert.equal(oralReport.entries.length, 6);
assert.equal(asrPlan.active, false); assert.equal(asrReport.active, false);
assert.equal(asrPlan.sourcePromptProvided, false); assert.equal(asrReport.sourcePromptProvided, false);
assert.equal(asrPlan.jobs.length, 10); assert.equal(asrReport.results.length, 10);

// Preserve historical release snapshots, never rewrite their originals.
const historic = [];
for (const v of [109, 114]) {
  const rel = 'curriculum/family-lessons-v' + v + '/release.json';
  const snapshot = stage(path.join(repo, ...rel.split('/')), 'provenance/history/family-lessons-v' + v + '-release.json', pins[rel]);
  historic.push(readJson(files.get(snapshot.path)));
}
assert.deepEqual(historic.map(r => r.units.length), [7,10]);
const historicTargets = historic.flatMap(r => r.units.flatMap(u => u.targets.map(t => ({...t, day:u.day}))));
assert.equal(historicTargets.length, 510);
const historicIds = new Set(historicTargets.map(t => t.canonicalId));
const historicForms = new Set();
for (const t of historicTargets) {
  const lexeme = resolve(t);
  for (const value of [t.surface, t.canonicalWord, t.trainingWord, lexeme.word, lexeme.canonicalWord, ...lexeme.spellingVariants]) {
    if (value) historicForms.add(norm(value));
  }
}
const installedMaterialIds = new Set(current.materials.map(m => m.id));
const installedUnitIds = new Set(current.familyLessonRelease.units.map(u => u.id));
const oldDayHash = A.materialContentHash(current.days);
assert.equal(current.materials.length, 2012); assert.equal(current.days.length, 365);

const vocabularyInstructions = '先完成到期复习，再练本组六词：每词正确输入三遍、录音跟读三遍，再完成补全、中文写英文和听写。提交后查看结果与订正。';
const listeningInstructions = '先按对话分段听人物与数字，再独立作答；订正时回听对应片段。';
const releaseMaterials = [], units = [], seenTargets = new Set(), seenForms = new Set(), seenMaterials = new Set();
const asrAudio = new Map();
function materialFile(m) {
  assert(!installedMaterialIds.has(m.id), 'Material identity already installed');
  assert(!seenMaterials.has(m.id)); seenMaterials.add(m.id);
  assert.equal(m.source.verification, 'author-draft-pending-independent-review');
  assert.equal(m.source.practiceOnly, true); assert.equal(m.pool, 'training');
  if (m.skill === 'grammar') exactQuestions(m, 12);
  if (m.skill === 'reading' || m.skill === 'listening') exactQuestions(m, 10);
  const file = 'materials/' + m.id + '.json', ref = addJson(file, m);
  const row = {id:m.id, file, fileSha256:ref.sha256, materialContentHash:A.materialContentHash(m),
    questionsSha256:sha(JSON.stringify(m.questions || []))};
  if (m.skill === 'listening') {
    const audio = audioRows.find(x => x.src === m.audio); assert(audio);
    row.audio = {src:audio.src, sha256:audio.sha256, bytes:audio.bytes};
  }
  releaseMaterials.push(row);
  return row;
}
for (const day of [2,3]) {
  const dn = '0' + day;
  const sourcePath = path.join(work, 'linked-course-days02-03', 'day' + dn + '.json');
  const draftRef = stage(sourcePath, 'provenance/drafts/day' + dn + '.json', draftPins[day]);
  const draft = readJson(files.get(draftRef.path));
  assert.equal(draft.active, false); assert.equal(draft.day, day);
  assert.equal(draft.targets.length, 30); assert.equal(draft.materials.length, 6);
  assert(loadInput(path.join(rebound, 'sources', 'day' + dn + '.json'), draftPins[day]).equals(files.get(draftRef.path)));
  const sourcePin = audioReport.sources.find(x => x.day === day);
  assert.equal(sourcePin.sha256, draftPins[day]);
  assert.equal(binding.sources.find(x => x.day === day).sha256, draftPins[day]);
  assert.equal(oralPlan.sources.find(x => x.day === day).sha256, draftPins[day]);
  assert.equal(asrPlan.sources.find(x => x.day === day).sha256, draftPins[day]);
  assert.equal(asrReport.sources.find(x => x.day === day).sha256, draftPins[day]);
  const previousRef = stage(path.join(rebound, 'history', 'sources', 'day' + dn + '.json'),
    'provenance/audio-rebound/history/sources/day' + dn + '.json');
  const previous = readJson(files.get(previousRef.path)), eqSource = eq.sources.find(x => x.day === day);
  assert.equal(previousRef.sha256, eqSource.beforeSha256);
  assert.equal(draftRef.sha256, eqSource.afterSha256);
  assert.deepEqual(previous.targets.map(t => [t.word,t.canonicalId,t.ipa]), draft.targets.map(t => [t.word,t.canonicalId,t.ipa]));
  const by = new Map(draft.materials.map(m => [m.skill,m]));
  const previousBy = new Map(previous.materials.map(m => [m.skill,m]));
  assert.deepEqual(new Set(by.keys()), new Set(['vocabulary','grammar','reading','listening','speaking','writing']));
  assert.equal(by.get('reading').passage, previousBy.get('reading').passage);
  assert.equal(by.get('listening').transcript, previousBy.get('listening').transcript);
  assert.deepEqual(by.get('listening').questions, previousBy.get('listening').questions);
  assert.equal(by.get('speaking').reference, previousBy.get('speaking').reference);
  assert.equal(by.get('writing').reference, previousBy.get('writing').reference);
  draftRows.push({day, path:draftRef.path, sourceSha256:draftRef.sha256, sourceBytes:draftRef.bytes,
    previousSourcePath:previousRef.path, previousSourceSha256:previousRef.sha256});
  const reading = by.get('reading'), readingId = 'family-linked-d' + dn + '-reading-v115';
  const readHash = A.sourceTextHash(reading.passage), words = by.get('vocabulary').vocabulary;
  assert.equal(words.length, 30);
  const cards = [], targets = [];
  for (let i = 0; i < 30; i++) {
    const t = draft.targets[i], w = words[i], canonical = core.get(t.canonicalId);
    assert(canonical && t.canonicalId.startsWith('essential:'));
    for (const key of ['word','canonicalId','meaning','pos','ipa','ipaAccent','ipaSource','ipaVerification']) assert.equal(w[key], t[key]);
    assert.equal(w.example, t.quote); assert.equal(t.ipa, canonical.ipa); assert.equal(t.ipaAccent, 'en-US');
    assert.equal(t.sourceMaterialId, reading.id); assert.equal(t.sourceTextSha256, readHash);
    assert.equal(reading.passage.slice(t.start,t.end), t.surface); assert.equal(norm(t.surface), norm(t.word));
    assert.equal(reading.passage.slice(t.quoteStart,t.quoteEnd), t.quote);
    assert(t.quoteStart <= t.start && t.quoteEnd >= t.end);
    const lexeme = resolve({canonicalId:t.canonicalId, canonicalWord:canonical.word});
    assert.equal(lexeme.word, t.word);
    const forms = [t.word,t.surface,lexeme.word,lexeme.canonicalWord,...lexeme.spellingVariants].filter(Boolean).map(norm);
    assert(!historicIds.has(t.canonicalId), 'Historical canonical ID: ' + t.canonicalId);
    assert(forms.every(form => !historicForms.has(form)), 'Historical spelling: ' + t.word);
    assert(!seenTargets.has(t.canonicalId) && !seenForms.has(norm(t.word)), 'Repeated target');
    seenTargets.add(t.canonicalId); seenForms.add(norm(t.word));
    const candidate = audioReport.words.find(x => x.day === day && x.canonicalId === t.canonicalId);
    const old = oldReport.words.find(x => x.day === day && x.canonicalId === t.canonicalId);
    const equiv = eq.wordFiles.find(x => x.day === day && x.canonicalId === t.canonicalId);
    assert(candidate && old && equiv);
    assert.equal(candidate.word, t.word); assert.equal(candidate.ipaReference, t.ipa);
    assert.equal(candidate.humanListened, false); assert.equal(candidate.locale, 'en-US');
    assert.equal(candidate.sha256, old.sha256); assert.equal(candidate.sha256, equiv.audioSha256);
    assert.equal(equiv.afterPos, t.pos); assert.equal(equiv.recordedTtsText, t.word);
    const raw = loadInput(path.join(rebound, ...candidate.src.split('/')), candidate.sha256);
    assert.equal(raw.length, candidate.bytes);
    const gr = group(generated, candidate.cacheKey, candidate.sha256, {metadataSha256:equiv.authoringMetadataSha256});
    assert(raw.equals(gr.audio)); assert.equal(gr.meta.identity.text, t.word);
    assert.equal(gr.meta.identity.voice, candidate.voice); assert.equal(gr.meta.identity.rate, equiv.recordedRate);
    const groupNo = Math.floor(i / 6) + 1;
    const audio = audioOut('word', day, 'audio/curriculum/family-linked-d' + dn +
      '-vocabulary-v115-g' + groupNo + '-word-' + t.word.toLowerCase() + '.mp3', raw,
      {canonicalId:t.canonicalId, spokenText:t.word, textSha256:sha(t.word), sourceCandidate:candidate.src,
        sourceIpaReference:candidate.ipaReference, voice:candidate.voice, metadata:gr.metaRef,
        humanListened:false});
    const card = cleanCandidateFields(w); card.audio = audio.src; cards.push(card);
    targets.push({canonicalId:t.canonicalId, canonicalWord:canonical.word, sourceMaterialId:readingId,
      sourceTextSha256:readHash, surface:t.surface, start:t.start, end:t.end, quote:t.quote,
      quoteStart:t.quoteStart, quoteEnd:t.quoteEnd, meaning:t.meaning, partOfSpeech:t.pos, audioRef:audio});
  }
  changes.push({day, kind:'vocabulary-grouping', originalMaterialId:by.get('vocabulary').id,
    newMaterialIds:[1,2,3,4,5].map(i => 'family-linked-d' + dn + '-vocabulary-v115-g' + i),
    originalEstimatedMinutes:by.get('vocabulary').estimatedMinutes, groupEstimatedMinutes:18,
    totalGroupEstimatedMinutes:90, note:'Recommended per-group planning estimate; completion and carry-forward remain evidence-based.'});
  changes.push({day, kind:'instructions', skill:'vocabulary', before:by.get('vocabulary').instructions, after:vocabularyInstructions});
  changes.push({day, kind:'instructions', skill:'listening', before:by.get('listening').instructions, after:listeningInstructions});
  const made = new Map();
  for (let i = 0; i < 5; i++) {
    const m = cleanCandidateFields(by.get('vocabulary'));
    m.id = 'family-linked-d' + dn + '-vocabulary-v115-g' + (i + 1);
    m.title = '第' + day + '课主题词汇 · 第' + (i + 1) + '/5组';
    m.estimatedMinutes = 18; m.instructions = vocabularyInstructions;
    m.vocabulary = cards.slice(i * 6, (i + 1) * 6);
    const row = materialFile(m); made.set(m.id,{m,row});
  }
  for (const skill of ['grammar','reading','listening','speaking','writing']) {
    const source = by.get(skill), m = cleanCandidateFields(source);
    m.id = 'family-linked-d' + dn + '-' + skill + '-v115';
    if (skill === 'listening') {
      m.instructions = listeningInstructions;
      const q = m.questions.find(x => x.id === (day === 2 ? 'l05' : 'l07'));
      if (day === 2) {
        assert.equal(q.prompt, 'What can Ava and Tom write in their books?');
        changes.push({day,kind:'question-field',skill,id:q.id,field:'prompt',before:q.prompt,
          after:'What does Ava say they can write?'});
        q.prompt = 'What does Ava say they can write?';
      } else {
        assert.equal(q.explanation, '她下课后留下五分钟检查给老师的便条；没有说留下吃晚饭、等到十点或找鞋。');
        changes.push({day,kind:'question-field',skill,id:q.id,field:'explanation',before:q.explanation,
          after:'结合“下课后留下五分钟”和紧接着“检查给老师的便条”两句，可推断她留下是为了检查便条；没有说留下吃晚饭、等到十点或找鞋。'});
        q.explanation = '结合“下课后留下五分钟”和紧接着“检查给老师的便条”两句，可推断她留下是为了检查便条；没有说留下吃晚饭、等到十点或找鞋。';
      }
      const oldId = 'family-linked-d' + day + '-listening-candidate-v1';
      const candidateRef = stage(path.join(rebound,'materials',oldId + '.json'),
        'provenance/audio-rebound/materials/' + oldId + '.json');
      const candidate = readJson(files.get(candidateRef.path));
      assert.equal(candidate.transcript, source.transcript); assert.deepEqual(candidate.questions, source.questions);
      const metaRef = stage(path.join(rebound,'provenance',oldId + '.json'),
        'provenance/audio-rebound/listening/' + oldId + '.json');
      const meta = readJson(files.get(metaRef.path));
      const audit = audioReport.listeningAudit.items.find(x => x.id === oldId);
      const equiv = eq.listeningFiles.find(x => x.day === day);
      assert(meta && audit && equiv);
      const raw = loadInput(path.join(rebound,'audio','curriculum',oldId + '.mp3'), audit.audioHash);
      assert.equal(raw.length, equiv.bytes); assert.equal(meta.audioHash, audit.audioHash);
      assert.equal(meta.audioHash, equiv.audioSha256); assert.equal(meta.transcriptHash, sha(source.transcript));
      assert.equal(meta.transcriptHash, audit.transcriptHash); assert.equal(meta.configurationHash, audit.configurationHash);
      assert.equal(canonicalSha(meta.configuration), meta.configurationHash);
      assert.equal(meta.synthetic, true); assert.equal(meta.locale, 'en-US');
      assert.equal(meta.segments.length, 8); assert.equal(meta.configuration.segments.length, 8);
      assert.equal(audit.pauseCount, 7); assert.equal(audit.voices.length, 2);
      assert.equal(meta.pauseConfiguration['speaker-change'], 0.65); assert.equal(meta.pauseConfiguration.paragraph, 0.8);
      const groups = new Map();
      for (let i = 0; i < meta.segments.length; i++) {
        const s = meta.segments[i], c = meta.configuration.segments[i], label = meta.configuration.sourceLabels[i];
        const text = source.transcript.slice(s.sourceStart,s.sourceEnd);
        assert.equal(text, c.text); assert.equal(sha(text), s.textHash); assert.equal(s.textHash, c.textHash);
        for (const field of ['role','speaker','sourceStart','sourceEnd','voice','boundary','pauseBeforeSeconds']) assert.equal(s[field],c[field]);
        assert.equal(source.transcript.slice(label.sourceStart,label.sourceEnd), label.label + ': ');
        assert.equal(label.role, s.role); assert.equal(label.sourceEnd, s.sourceStart);
        assert.equal(meta.roleVoices[s.role], s.voice);
        if (i === 0) assert.equal(s.pauseBeforeSeconds, 0);
        else {
          assert.notEqual(s.role, meta.segments[i-1].role);
          assert.equal(s.pauseBeforeSeconds, 0.65);
          assert(Math.abs(s.startSeconds - meta.segments[i-1].endSeconds - 0.65) < 0.00001);
        }
        const list = groups.get(s.groupConfigurationHash) || []; list.push({segment:s,text}); groups.set(s.groupConfigurationHash,list);
      }
      const groupRefs = [];
      for (const [key, list] of groups) {
        const gr = group(generated,key,list[0].segment.groupAudioHash,{keepAudio:true});
        assert.equal(gr.meta.identity.text, list.map(x => x.text).join('\n\n'));
        assert(list.every(x => x.segment.voice === gr.meta.identity.voice && x.segment.groupAudioHash === gr.meta.audioHash));
        groupRefs.push({metadata:gr.metaRef, audio:gr.groupRef});
      }
      assert.equal(groups.size,2);
      const audio = audioOut('listening',day,'audio/curriculum/' + m.id + '.mp3',raw,
        {sourceCandidate:'audio/curriculum/' + oldId + '.mp3', textSha256:meta.transcriptHash,
          metadata:metaRef, candidateMaterial:candidateRef, groups:groupRefs, humanListened:false});
      m.audio = audio.src; m.audioKind = 'synthetic'; m.audioSynthetic = true;
      m.audioLocale = 'en-US'; m.audioVoices = meta.voices; m.audioProvider = meta.provider;
      m.audioDurationSeconds = meta.durationSeconds;
      m.audioRequirements = {...m.audioRequirements, accent:'en-US', minimumSpeakers:2,
        paragraphGapMs:800, turnGapMs:650, roleVoices:meta.roleVoices};
      delete m.audioRequirements.productionStatus;
      for (let part = 0; part < 2; part++) {
        const selected = meta.segments.slice(part * 4, (part + 1) * 4);
        asrAudio.set('d' + day + '-listening-' + (part+1), {sha256:audio.sha256,
          reference:selected.map(s => source.transcript.slice(s.sourceStart,s.sourceEnd)).join(' '),
          start:selected[0].startSeconds, end:selected[selected.length-1].endSeconds});
      }
    }
    if (skill === 'speaking') {
      const parts = oral.spokenReferenceParts(m.reference, 65);
      assert.equal(parts.length, 2);
      const expected = oralPlan.entries.filter(x => x.day === day), actual = oralReport.entries.filter(x => x.day === day);
      assert.equal(expected.length,3); assert.equal(actual.length,3);
      const make = (kind,index,text) => {
        const plan = expected.find(x => x.kind === kind && x.segmentIndex === index);
        const entry = actual.find(x => x.kind === kind && x.segmentIndex === index);
        assert(plan && entry);
        for (const [key,value] of Object.entries(plan)) assert.deepEqual(entry[key],value);
        assert.equal(entry.reference,text); assert.equal(entry.textSha256,sha(text)); assert.equal(entry.humanListened,false);
        const raw = loadInput(path.join(oralDir,...entry.relativePath.split('/')),entry.audioSha256);
        assert.equal(raw.length,entry.bytes);
        const gr = group(oralDir,entry.cacheKey,entry.audioSha256);
        assert(raw.equals(gr.audio)); assert.equal(gr.meta.identity.text,text);
        assert.equal(gr.meta.identity.voice,entry.voice); assert.equal(gr.meta.identity.rate,entry.rate);
        const suffix = kind === 'full' ? '' : '-part' + (index + 1);
        const pin = audioOut(kind === 'full' ? 'speaking-full' : 'speaking-segment',day,
          'audio/curriculum/' + m.id + suffix + '.mp3',raw,
          {sourceCandidate:entry.relativePath, textSha256:entry.textSha256, metadata:gr.metaRef,
            part:kind === 'full' ? null : index + 1, voice:entry.voice, humanListened:false});
        asrAudio.set('d' + day + '-oral-' + (kind === 'full' ? 'full' : index+1),
          {sha256:pin.sha256, reference:text, start:0, end:entry.durationSeconds});
        return {pin,entry};
      };
      const full = make('full',null,m.reference);
      m.audio = full.pin.src; m.audioKind = 'synthetic'; m.audioSynthetic = true;
      m.audioVoice = full.entry.voice; m.audioLocale = 'en-US';
      m.audioProvider = 'Microsoft online TTS via edge-tts'; m.audioDurationSeconds = full.entry.durationSeconds;
      m.oralModelAudio = parts.map((text,index) => ({text,...make('segment',index,text).pin}));
    }
    const row = materialFile(m); made.set(m.id,{m,row});
  }
  const tasks = [];
  for (const skill of ['vocabulary','grammar','listening','reading','speaking','writing']) {
    const rows = [...made.values()].filter(x => x.m.skill === skill);
    const materialRefs = rows.map(x => ({materialId:x.m.id,contentHash:x.row.materialContentHash,
      ...(skill === 'listening' ? {audioRef:x.row.audio} : {})}));
    tasks.push({id:skill,materialRefs,replaceIds:[],requires:[],instructions:rows[0].m.instructions});
  }
  const id = 'family-linked-d' + dn + '-unit-v115'; assert(!installedUnitIds.has(id));
  units.push({id,day,targetGoal:30,targets,tasks});
}
assert.equal(releaseMaterials.length,20); assert.equal(units.length,2); assert.equal(seenTargets.size,60);
assert.equal(audioRows.filter(x => x.kind === 'word').length,60);
assert.equal(audioRows.filter(x => x.kind === 'listening').length,2);
assert.equal(audioRows.filter(x => x.kind === 'speaking-full').length,2);
assert.equal(audioRows.filter(x => x.kind === 'speaking-segment').length,4);
assert.equal(asrAudio.size,10);
const asrRefs = [];
for (const job of asrPlan.jobs) {
  const row = asrReport.results.find(x => x.id === job.id), expected = asrAudio.get(job.id);
  assert(row && expected); assert.equal(job.audioSha256, expected.sha256);
  assert.equal(job.reference,expected.reference); assert.equal(job.referenceSha256,sha(expected.reference));
  assert(Math.abs(job.start - expected.start) < 0.00001 && Math.abs(job.end - expected.end) < 0.00001);
  const rel = 'linked02-03-audio-content/results/' + job.id + '.json';
  const ref = fromWork(rel,'provenance/asr/results/' + job.id + '.json');
  const result = readJson(files.get(ref.path));
  for (const [key,value] of Object.entries(job)) assert.deepEqual(result[key],value);
  assert.equal(result.active,false); assert.equal(result.sourcePromptProvided,false);
  assert.equal(result.normalizedDiff.edits,row.normalizedEdits);
  asrRefs.push({id:job.id,path:ref.path,sha256:ref.sha256,normalizedEdits:row.normalizedEdits});
}
assert.equal(asrRefs.filter(x => x.normalizedEdits === 0).length,6);
assert.equal(asrRefs.filter(x => x.normalizedEdits === 1).length,4);
const release = {schema:1,id:'family-linked-days02-03-v115',active:false,
  policy:'ordinary-six-module-unstarted-and-after-core-v95',ordinaryPracticeOnly:true,
  independentAssessmentEligible:false,status:'author-draft-pending-review',
  materials:releaseMaterials,units};
const releaseRef = addJson('release.json',release);
const manifest = {schema:1,active:false,status:'candidate-packaged-review-pending',
  scope:'Pinned local source, exact authorized changes, synthetic audio and ASR evidence only. No activation or approval.',
  projectHead:head,projectInputHashes:pins,drafts:draftRows,assets:audioRows,
  historicalCollisionCheck:{releaseSources:historic.map((r,i) => ({id:r.id,days:r.units.map(u => u.day),
    path:'provenance/history/family-lessons-v' + [109,114][i] + '-release.json',
    sha256:pins['curriculum/family-lessons-v' + [109,114][i] + '/release.json']})),
    historicalTargetCount:historicTargets.length, candidateTargetCount:seenTargets.size,
    canonicalIdCollisions:[], spellingVariantCollisions:[], installedMaterialIdCollisions:[], installedUnitIdCollisions:[],
    currentAssetSha256:pins['assets/curriculum-data.js'], currentDayHash:oldDayHash},
  authorizedChanges:changes, asr:{plan:refs['linked02-03-audio-content/plan.json'],
    report:refs['linked02-03-audio-content/report.json'],results:asrRefs,exact:6,withDifferences:4,
    classification:'pending-root-review'},release:releaseRef,
  limitations:['All material source.verification fields remain pending and release.active is false.',
    'Audio hashes, generation metadata, pauses and ASR do not establish pronunciation or learner outcomes.',
    'Content review, browser behavior, older draft compatibility and release approval remain outstanding.']};
addJson('provenance/package-manifest.json',manifest);
for (const [file,expected] of inputs) assert.equal(sha(fs.readFileSync(file)),expected,'Input changed during build: ' + file);
// Preflight all destinations before writing; existing differing package files are never overwritten.
for (const [rel,bytes] of files) {
  const dst = path.join(pkg,...rel.split('/'));
  if (fs.existsSync(dst)) assert(fs.readFileSync(dst).equals(bytes),'Existing output differs: ' + rel);
}
for (const [rel,bytes] of files) {
  const dst = path.join(pkg,...rel.split('/'));
  if (!fs.existsSync(dst)) { fs.mkdirSync(path.dirname(dst),{recursive:true}); fs.writeFileSync(dst,bytes,{flag:'wx'}); }
  assert.equal(sha(fs.readFileSync(dst)),sha(bytes));
}
console.log(JSON.stringify({active:false,status:release.status,releaseSha256:releaseRef.sha256,
  materials:releaseMaterials.length,units:units.length,targets:seenTargets.size,
  audio:{words:60,listening:2,speakingFull:2,speakingSegments:4},asr:{exact:6,withDifferences:4},
  historicTargets:historicTargets.length,changes:changes.length,files:files.size}));
