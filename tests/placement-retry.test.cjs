'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { createUserData, DATABASES } = require('../server/user-data.cjs');
const { createPlacement } = require('../server/placement.cjs');

const AT = '2026-10-25T00:00:00.000Z';
const PASSAGE = 'The library opens at seven. It is near a small park in the town centre. People can read newspapers, borrow books and use a quiet room upstairs. A local group meets there every Friday to talk about books. Visitors do not need to pay to enter the building.';
const ORIGINAL = 'I work in a small shop near my home. I open the door at nine every morning. Then I help people find things they need. I like my work because I meet many friendly people. After work I walk home and cook dinner with my family. We talk about our day while we eat. In the evening I read a book before I go to bed.';
const SPOKEN = 'I live in a small town with my family. My home is near a quiet park and I often walk there after work because I like the trees.';
const clone = value => structuredClone(value), hash = value => crypto.createHash('sha256').update(value).digest('hex');
const sourcePolicy = () => ({ eligible: true, priority: 0, category: 'isolated-fixture', reason: 'test-only', basis: {} });
function questions() {
  return [
    { id: 'q1', type: 'single', prompt: 'When does the library open?', options: ['six', 'seven', 'eight'], answer: 'seven', evidence: 'The library opens at seven.', explanation: '原文给出开放时间。' },
    { id: 'q2', type: 'single', prompt: 'What is near the library?', options: ['a small park', 'a museum', 'a station'], answer: 'a small park', evidence: 'It is near a small park in the town centre.', explanation: '原文给出邻近地点。' },
    { id: 'q3', type: 'single', prompt: 'When does the group meet?', options: ['Friday', 'Monday', 'Wednesday'], answer: 'Friday', evidence: 'A local group meets there every Friday to talk about books.', explanation: '原文给出聚会日期。' }
  ];
}
function curriculum(rootDir) {
  fs.mkdirSync(path.join(rootDir, 'audio')); const auditDir = path.join(rootDir, 'curriculum', 'independent-bank'); fs.mkdirSync(auditDir, { recursive: true });
  const materials = ['A1', 'A2', 'B1', 'B2'].map(level => {
    const audio = 'audio/' + level + '.mp3'; fs.writeFileSync(path.join(rootDir, audio), Buffer.alloc(1024, 1));
    const material = { id: 'retry-source-' + level, title: level + ' library', skill: 'listening', pool: 'independent', level, transcript: PASSAGE, audio, audioSynthetic: true, audioDurationSeconds: 15, questions: questions().map(q => ({ ...q, answers: [q.answer] })), source: { verification: 'reviewed', contentHashFields: ['title', 'transcript', 'questions'] } };
    material.source.contentHash = hash(JSON.stringify(Object.fromEntries(material.source.contentHashFields.map(key => [key, material[key]])))); return material;
  });
  fs.writeFileSync(path.join(auditDir, 'audio-audit.json'), JSON.stringify({ items: materials.map(m => ({ id: m.id, audio: m.audio, bytes: 1024, audioHash: hash(fs.readFileSync(path.join(rootDir, m.audio))), transcriptHash: hash(m.transcript) })) }));
  return { days: [1, 8, 57, 99, 141].map(day => ({ day, week: Math.ceil(day / 7), title: 'Isolated retry course ' + day })), materials };
}
async function author(messages) {
  const input = JSON.parse(messages[1].content);
  const value = input.listeningSources ? {
    listening: input.listeningSources.map(source => ({ taskId: source.taskId, questions: questions() })),
    reading: ['A1', 'A2', 'B1', 'B2'].map(level => ({ taskId: 'read-' + level.toLowerCase(), level, title: level + ' reading', passage: PASSAGE, questions: questions() })),
    writing: { prompt: 'Describe your usual day and explain one activity you like.', instructions: '按真实能力写。' },
    speaking: { prompt: 'Describe your home.', instructions: '按真实能力回答。' }
  } : { checks: input.tasks.flatMap(task => task.questions.map(q => ({ taskId: task.taskId, questionId: q.id, supported: true, uniqueAnswer: true, plausibleDistractors: true, selfContainedEvidence: true, comment: '隔离模拟独立审题。' }))) };
  return { content: JSON.stringify(value), reviewer: { model: 'isolated-author', providerHost: 'fixture.invalid' } };
}
function writing(input, text, level) {
  const rank = ['A0', 'A1', 'A2', 'B1', 'B2'].indexOf(level), first = text.slice(0, 32), last = text.slice(-32);
  const criteria = input.writingScale.criteria.map(definition => {
    const notElicited = definition.id === 'extended_organisation';
    const limit = definition.id === 'simple_linking' && rank < 2 || definition.id === 'linear_progression' && rank < 3;
    return { id: definition.id, applicability: notElicited ? 'not_elicited' : 'applicable', status: notElicited ? 'not_applicable' : limit ? 'not_met' : 'met', issueType: limit ? definition.id === 'simple_linking' ? 'isolated_sentences' : 'disconnected_points' : null,
      evidence: notElicited ? [] : [{ quote: first, comment: '仅为隔离模拟解析和保留测试，不代表真人能力判断。' }],
      links: !notElicited && !limit && ['simple_linking', 'linear_progression'].includes(definition.id) ? [{ fromQuote: first, toQuote: last, relation: 'sequence', comment: '隔离模拟中的两个实际原稿信息单位。' }] : [],
      comment: notElicited ? '未引出长文组织，不据此限制阶段。' : '隔离模拟逐项核对。' };
  });
  return { criteria, levelBasis: { supportingCriterionIds: criteria.filter(c => c.status === 'met').map(c => c.id), limitingCriterionIds: criteria.filter(c => c.status === 'not_met').map(c => c.id), uncertainCriterionIds: [] } };
}
function grader(outcomes = {}) {
  const calls = [];
  const run = async (messages, { round }) => {
    const input = JSON.parse(messages[1].content), action = outcomes[round] || {}; calls.push({ round, input, system: messages[0].content });
    assert.ok(!Object.hasOwn(input, 'rounds')); assert.ok(!Object.hasOwn(input, 'report'));
    if (action.fail) throw Object.assign(Error('Isolated upstream unavailable.'), { code: 'ISOLATED_UPSTREAM_FAILED' });
    if (action.invalidJSON) return { content: '{"skills":', reviewer: { model: 'isolated-grader', providerHost: 'fixture.invalid' } };
    const skills = ['listening', 'reading', 'writing', 'speaking'].map(skill => {
      const response = input.responses.find(r => r.taskId === skill), explicit = response?.unanswered === true, task = input.tasks.find(t => t.skill === skill);
      const level = action[skill + 'Null'] ? null : Object.hasOwn(action, skill + 'Level') ? action[skill + 'Level'] : skill === 'writing' ? 'A1' : skill === 'speaking' ? explicit ? 'A0' : 'A2' : 'A0';
      return { skill, level, confidence: 'low', evidence: [{ taskId: task.taskId, quote: explicit ? '[explicit-unanswered]' : response?.text || 'The library opens at seven.', comment: '隔离模拟逐字证据。' }],
        ...(skill === 'writing' && !explicit && !action.invalidWriting ? writing(input, response.text, level) : {}), gaps: [] };
    });
    return { content: JSON.stringify({ skills, summary: 'Isolated retry evaluation; no real AI call.' }), reviewer: { model: 'isolated-grader-' + round, providerHost: 'fixture.invalid' } };
  };
  run.calls = calls; return run;
}
function wav() {
  const seconds = 12, bytes = Buffer.alloc(44 + seconds * 32000); bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(seconds * 32000, 40);
  for (let i = 0; i < seconds * 16000; i++) bytes.writeInt16LE(Math.round(3000 * Math.sin(i * .1)), 44 + i * 2); return bytes;
}
async function fixture(t, { speech = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ielts-placement-retry-')), rootDir = path.join(dir, 'app'), dataDir = path.join(dir, 'isolated-data'); fs.mkdirSync(rootDir); const course = curriculum(rootDir), evidence = new Map(), options = { rootDir, dataDir, migrateLegacy: false, now: () => new Date(AT) };
  let userData, placement; function restart() { userData = createUserData(options); placement = createPlacement({ rootDir, userData, curriculum: course, evidenceStore: evidence, sourcePolicy, now: options.now }); } restart();
  t.after(() => { assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('ielts-placement-retry-')); fs.rmSync(dir, { recursive: true, force: true }); });
  const empty = { schemaVersion: 1, profile: { id: 'legacy', name: 'Isolated retry profile', createdAt: AT }, entries: {}, session: {}, databases: Object.entries(DATABASES).map(([name, store]) => ({ name, stores: [{ name: store, rows: [] }] })) };
  await userData.putSnapshot('legacy', { expectedRevision: 0, snapshot: empty, activate: true });
  const { assessment } = await placement.generate({ profileId: 'legacy' }, author), file = path.join(dataDir, 'config', 'placement', 'legacy', assessment.id + '.json');
  let audio, audioSha256, evidenceId;
  if (speech) { audio = wav(); audioSha256 = hash(audio); evidenceId = crypto.randomUUID(); await userData.putBlob(audioSha256, audio, 'audio/wav'); evidence.set(evidenceId, { kind: 'pronunciation', audioSha256, durationSeconds: 12, createdAt: Date.parse(AT), scope: 'short_reading', reference: SPOKEN, result: { accuracy: 95, fluency: 90, completeness: 100 } }); }
  const responses = assessment.tasks.map(task => task.questions ? { taskId: task.id, answers: {}, skipped: true } : task.skill === 'writing' ? { taskId: task.id, text: ORIGINAL } : speech ? { taskId: task.id, text: SPOKEN, audioSha256, evidenceId } : { taskId: task.id, unanswered: true });
  return { dir, file, assessment, request: { profileId: 'legacy', assessmentId: assessment.id, responses }, evidence, audio, audioSha256, evidenceId, restart, read: () => JSON.parse(fs.readFileSync(file, 'utf8')), bytes: () => fs.readFileSync(file), get placement() { return placement; }, get userData() { return userData; } };
}

test('retry preserves the original responses and valid first round, and calls only the invalid writing round', async t => {
  const f = await fixture(t), request = clone(f.request), first = grader({ 2: { invalidWriting: true } }), partial = await f.placement.evaluate(f.request, first), old = f.read().attempts[0];
  assert.equal(partial.complete, false); assert.equal(partial.rounds[0].skills.writing.criteriaValid, true); assert.equal(partial.rounds[1].skills.writing.criteriaValid, false); assert.equal(partial.rounds[1].skills.writing.level, null); assert.deepEqual(first.calls.map(c => c.round), [1, 2]);
  const retry = grader(), completed = await f.placement.evaluate({ ...f.request, retry: true }, retry), saved = f.read();
  assert.equal(completed.complete, true); assert.deepEqual(retry.calls.map(c => c.round), [2]); assert.equal(saved.attempts.length, 2); assert.deepEqual(saved.attempts[0], old); assert.deepEqual(saved.attempts[1].rawResponses, request.responses); assert.deepEqual(saved.attempts[1].responses, old.responses); assert.deepEqual(f.request, request);
  assert.deepEqual(saved.attempts[1].retry, { sourceAttemptId: old.id, reason: 'retry-incomplete-rounds', reusedRounds: [1] });
  assert.equal(completed.rounds[0].reused, true); assert.equal(completed.rounds[0].sourceAttemptId, old.id); assert.ok(completed.rounds[0].reuseReason); assert.deepEqual(completed.rounds[0].skills, old.rounds[0].skills); assert.equal(completed.rounds[1].reused, undefined);
  assert.deepEqual((await f.placement.get('legacy', f.assessment.id)).responses, request.responses);
});

test('changed writing, objective answers, evidence id or audio hash cannot reuse an older evaluation', async t => {
  const f = await fixture(t, { speech: true }); await f.placement.evaluate(f.request, grader({ 2: { invalidWriting: true } })); const before = f.bytes();
  const changes = {
    writing: request => { request.responses.find(r => r.taskId === 'writing').text += ' A new sentence.'; },
    objective: request => { Object.assign(request.responses[0], { skipped: false, answers: { q1: f.assessment.tasks[0].questions[0].options[0] } }); },
    evidence: request => { request.responses.find(r => r.taskId === 'speaking').evidenceId = crypto.randomUUID(); },
    audio: request => { request.responses.find(r => r.taskId === 'speaking').audioSha256 = 'a'.repeat(64); }
  };
  for (const [name, change] of Object.entries(changes)) await t.test(name, async () => { const request = { ...clone(f.request), retry: true }, run = grader(); change(request); await assert.rejects(f.placement.evaluate(request, run), error => error.code === 'PLACEMENT_RETRY_RESPONSES_CHANGED' && error.status === 409); assert.equal(run.calls.length, 0); assert.deepEqual(f.bytes(), before); });
});

test('retry requires a latest incomplete private attempt, and normal resubmission still evaluates changed answers twice', async t => {
  const f = await fixture(t), untouched = f.bytes(), unused = grader(); await assert.rejects(f.placement.evaluate({ ...f.request, retry: true }, unused), error => error.code === 'PLACEMENT_RETRY_UNAVAILABLE'); assert.deepEqual(f.bytes(), untouched);
  await assert.rejects(f.placement.evaluate({ ...f.request, retry: 'true' }, unused), error => error.code === 'PLACEMENT_INPUT'); assert.equal(unused.calls.length, 0);
  await f.placement.evaluate(f.request, grader({ 2: { invalidWriting: true } })); const original = f.read().attempts[0], changed = clone(f.request); changed.responses.find(r => r.taskId === 'writing').text += ' I also learn English.';
  const normal = grader(); assert.equal((await f.placement.evaluate(changed, normal)).complete, true); assert.deepEqual(normal.calls.map(c => c.round), [1, 2]); assert.deepEqual(f.read().attempts[0], original); assert.equal(f.read().attempts[1].retry, undefined);
  const complete = f.bytes(); await assert.rejects(f.placement.evaluate({ ...changed, retry: true }, unused), error => error.code === 'PLACEMENT_RETRY_UNAVAILABLE'); assert.deepEqual(f.bytes(), complete); assert.equal(unused.calls.length, 0);
});

test('an invalid first round can be retried repeatedly without losing the valid second round when AI fails again', async t => {
  const f = await fixture(t); await f.placement.evaluate(f.request, grader({ 1: { invalidWriting: true } })); const original = f.read().attempts[0], failing = grader({ 1: { fail: true } });
  const stillPartial = await f.placement.evaluate({ ...f.request, retry: true }, failing), middle = f.read().attempts[1]; assert.equal(stillPartial.complete, false); assert.deepEqual(failing.calls.map(c => c.round), [1]); assert.equal(middle.rounds[1].reused, true); assert.equal(middle.rounds[1].sourceAttemptId, original.id); assert.equal(middle.rounds[0].ok, true); assert.equal(middle.rounds[0].pendingError.code, 'ISOLATED_UPSTREAM_FAILED'); assert.equal(middle.rounds[0].skills.writing.level, null); assert.deepEqual(middle.rounds[0].reusedSkills, ['listening', 'reading', 'speaking']);
  const good = grader(), result = await f.placement.evaluate({ ...f.request, retry: true }, good), attempts = f.read().attempts; assert.equal(result.complete, true); assert.deepEqual(good.calls.map(c => c.round), [1]); assert.equal(attempts.length, 3); assert.deepEqual(attempts[0], original); assert.deepEqual(attempts[1], middle); assert.equal(result.rounds[1].sourceAttemptId, middle.id); assert.deepEqual(result.rounds[1].skills, original.rounds[1].skills);
});

test('missing rounds after upstream failure and rounds with any null skill both require independent replacement', async t => {
  for (const mode of ['missing-round', 'null-skill']) await t.test(mode, async sub => {
    const f = await fixture(sub), first = grader(mode === 'missing-round' ? { 1: { fail: true } } : { 1: { listeningNull: true }, 2: { invalidWriting: true } });
    const partial = await f.placement.evaluate(f.request, first), old = f.read().attempts[0]; assert.equal(partial.complete, false); assert.deepEqual(first.calls.map(c => c.round), mode === 'missing-round' ? [1] : [1, 2]);
    const retry = grader(), complete = await f.placement.evaluate({ ...f.request, retry: true }, retry); assert.equal(complete.complete, true); assert.deepEqual(retry.calls.map(c => c.round), [1, 2]); assert.deepEqual(f.read().attempts[0], old); assert.deepEqual(f.read().attempts[1].retry.reusedRounds, []); assert.ok(complete.rounds.every(r => !r.reused));
  });
});

test('a failed or malformed second AI response keeps the first round eligible for a single-call retry', async t => {
  for (const mode of ['fail', 'invalidJSON']) await t.test(mode, async sub => {
    const f = await fixture(sub), first = grader({ 2: { [mode]: true } }); await f.placement.evaluate(f.request, first); const old = f.read().attempts[0]; assert.equal(old.rounds[0].ok, true); assert.equal(old.rounds[1].ok, false);
    const run = grader(), complete = await f.placement.evaluate({ ...f.request, retry: true }, run); assert.equal(complete.complete, true); assert.deepEqual(run.calls.map(c => c.round), [2]); assert.deepEqual(f.read().attempts[0], old); assert.equal(complete.rounds[0].sourceAttemptId, old.id);
  });
});

test('retry considers only the latest original attempt instead of selecting a valid result from older history', async t => {
  const f = await fixture(t); await f.placement.evaluate(f.request, grader({ 2: { invalidWriting: true } })); const older = f.read().attempts[0]; await f.placement.evaluate(f.request, grader({ 1: { fail: true } })); const latest = f.read().attempts[1];
  const run = grader(), report = await f.placement.evaluate({ ...f.request, retry: true }, run); assert.equal(report.complete, true); assert.deepEqual(run.calls.map(c => c.round), [1, 2]); assert.deepEqual(f.read().attempts[2].retry.reusedRounds, []); assert.equal(f.read().attempts[2].retry.sourceAttemptId, latest.id); assert.deepEqual(f.read().attempts[0], older); assert.deepEqual(f.read().attempts[1], latest);
});

test('two valid rounds separated by two stages are both independently reevaluated and never cherry picked', async t => {
  const f = await fixture(t), different = { 1: { writingLevel: 'A1' }, 2: { writingLevel: 'B1' } }, originalReport = await f.placement.evaluate(f.request, grader(different)), old = f.read().attempts[0];
  assert.equal(originalReport.complete, false); assert.equal(originalReport.skills.writing.disagreementSteps, 2); assert.ok(originalReport.rounds.every(r => r.skills.writing.criteriaValid && r.skills.writing.level));
  const stillDifferent = grader(different), partial = await f.placement.evaluate({ ...f.request, retry: true }, stillDifferent); assert.equal(partial.complete, false); assert.deepEqual(stillDifferent.calls.map(c => c.round), [1, 2]); assert.ok(partial.rounds.every(r => !r.reused)); assert.equal(f.read().attempts[1].retry.reason, 'independent-reassessment-after-disagreement');
  const agreed = grader({ 1: { writingLevel: 'B1' }, 2: { writingLevel: 'B1' } }), complete = await f.placement.evaluate({ ...f.request, retry: true }, agreed); assert.equal(complete.complete, true); assert.deepEqual(agreed.calls.map(c => c.round), [1, 2]); assert.ok(complete.rounds.every(r => !r.reused)); assert.deepEqual(f.read().attempts[0], old);
});

test('a service restart reuses the saved matching private speech proof without a new Ali call or upload', async t => {
  const f = await fixture(t, { speech: true }), partial = await f.placement.evaluate(f.request, grader({ 2: { invalidWriting: true } })), old = f.read().attempts[0];
  assert.equal(partial.skills.speaking.verification, 'limited'); assert.equal(old.speechEvidenceId, f.evidenceId); assert.equal(old.speechProof.placementAssessmentId, f.assessment.id); f.evidence.clear(); f.restart();
  const run = grader(), report = await f.placement.evaluate({ ...f.request, retry: true }, run), latest = f.read().attempts[1]; assert.equal(report.complete, true); assert.deepEqual(run.calls.map(c => c.round), [2]); assert.equal(report.skills.speaking.verification, 'limited'); assert.equal(report.skills.speaking.verified, false); assert.equal(report.skills.speaking.level, 'A2'); assert.equal(latest.speechEvidenceId, old.speechEvidenceId); assert.deepEqual(latest.speechProof, old.speechProof); assert.deepEqual(f.userData.getBlob(f.audioSha256), f.audio); assert.deepEqual(latest.rawResponses, old.rawResponses); assert.deepEqual(f.read().attempts[0], old);
});

test('clear and another profile cannot revive a private retry or consume any AI calls', async t => {
  const f = await fixture(t, { speech: true }); await f.placement.evaluate(f.request, grader({ 2: { invalidWriting: true } })); const privateBefore = f.bytes(), previous = await f.userData.getSnapshot('legacy'); await f.userData.resetProfile('legacy', previous.revision);
  const run = grader(); await assert.rejects(f.placement.evaluate({ ...f.request, retry: true }, run), error => error.code === 'PLACEMENT_PROFILE_RESET'); await assert.rejects(f.placement.evaluate({ ...f.request, profileId: 'p-another-profile', retry: true }, run), error => error.code === 'PLACEMENT_NOT_FOUND'); assert.equal(run.calls.length, 0); assert.deepEqual(f.bytes(), privateBefore); assert.deepEqual(f.userData.getBlob(f.audioSha256), f.audio);
});

test('slow retry keeps the previous partial report and reusable round durable, while duplicate clicks stay blocked', async t => {
  const f = await fixture(t); await f.placement.evaluate(f.request, grader({ 2: { invalidWriting: true } })); const old = f.read().attempts[0]; let release, entered, result;
  const waiting = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { entered = resolve; }), run = grader();
  const pending = f.placement.evaluate({ ...f.request, retry: true }, async (...args) => { entered(); await waiting; return run(...args); }); await started;
  try { const current = await f.placement.get('legacy', f.assessment.id); assert.deepEqual(current.report, old.report); assert.deepEqual(current.responses, f.request.responses); assert.equal(f.read().attempts[1].rounds[0].sourceAttemptId, old.id); await assert.rejects(f.placement.evaluate({ ...f.request, retry: true }, grader()), error => error.code === 'PLACEMENT_BUSY'); } finally { release(); result = await pending; }
  assert.equal(result.complete, true); assert.deepEqual(run.calls.map(c => c.round), [2]); assert.equal(f.read().attempts.length, 2); assert.deepEqual(f.read().attempts[0], old);
});

test('a new response only fills the missing skill and never revokes or replaces valid same-round skills', async t => {
  const f = await fixture(t, { speech: true }); await f.placement.evaluate(f.request, grader({ 2: { invalidWriting: true } })); const original = f.read().attempts[0];
  const run = grader({ 2: { writingLevel: 'A2', listeningNull: true, readingNull: true, speakingLevel: 'A1' } }), report = await f.placement.evaluate({ ...f.request, retry: true }, run), latest = f.read().attempts[1];
  assert.equal(report.complete, true); assert.deepEqual(run.calls.map(c => c.round), [2]); assert.deepEqual(report.rounds[1].reusedSkills, ['listening', 'reading', 'speaking']);
  assert.equal(report.rounds[1].skills.speaking.level, 'A2', 'A fresh lower or higher mark cannot replace an already completed slot.'); assert.equal(report.rounds[1].skills.writing.level, 'A2');
  for (const skill of ['listening', 'reading', 'speaking']) { assert.deepEqual(report.rounds[1].skills[skill], original.rounds[1].skills[skill]); assert.equal(report.rounds[1].skillProvenance[skill].sourceAttemptId, original.id); assert.equal(report.rounds[1].skillProvenance[skill].reused, true); }
  assert.equal(report.rounds[1].skillProvenance.writing.sourceAttemptId, latest.id); assert.equal(report.rounds[1].skillProvenance.writing.reused, false); assert.equal(report.skillProgressReused, true); assert.equal(report.reviewMode, 'preserved-skill-progress'); assert.match(report.disclaimer, /不是最新两次完整整轮盲评/); assert.match(report.rounds[1].summary, /按科保留/); assert.deepEqual(f.read().attempts[0], original);
});

test('a strictly validated writing round remains reusable after the original parser applies its sample-size ceiling', async t => {
  const f = await fixture(t); f.request.responses.find(r => r.taskId === 'writing').text = 'I read books at home because I enjoy stories. Then I discuss them with my sister.';
  const first = await f.placement.evaluate(f.request, grader({ 1: { writingLevel: 'B2' }, 2: { invalidWriting: true } })), old = f.read().attempts[0];
  assert.equal(first.rounds[0].skills.writing.criteriaValid, true); assert.equal(first.rounds[0].skills.writing.level, 'A2');
  const run = grader({ 2: { writingLevel: 'A2' } }), report = await f.placement.evaluate({ ...f.request, retry: true }, run);
  assert.equal(report.complete, true); assert.deepEqual(run.calls.map(c => c.round), [2]); assert.deepEqual(report.rounds[0].skills.writing, old.rounds[0].skills.writing); assert.equal(report.rounds[0].skillProvenance.writing.sourceAttemptId, old.id);
});

function legacyRetry(f, { olderVersion } = {}) {
  // An isolated pre-feature record: old retries replaced an entire parsed round.
  // Reproduce that saved history without changing any live learner data.
  const doc = f.read(), first = doc.attempts[0], latest = doc.attempts.at(-1);
  latest.retry = { sourceAttemptId: doc.attempts.at(-2).id, reason: 'retry-incomplete-rounds', reusedRounds: [] };
  for (const attempt of doc.attempts) for (const round of attempt.rounds) { delete round.skillProvenance; delete round.reusedSkills; }
  if (olderVersion) { first.promptVersion = olderVersion; first.report.promptVersion = olderVersion; for (const round of first.rounds) round.reviewer.promptVersion = olderVersion; }
  fs.writeFileSync(f.file, JSON.stringify(doc)); return f.read().attempts;
}

test('complementary valid skills from a legacy same-input retry chain complete with zero new AI calls', async t => {
  const f = await fixture(t, { speech: true }); await f.placement.evaluate(f.request, grader({ 2: { invalidWriting: true } }));
  await f.placement.evaluate(f.request, grader({ 2: { writingLevel: 'A2', listeningNull: true, readingNull: true, speakingLevel: 'A1' } }));
  const old = legacyRetry(f, { olderVersion: 'placement-legacy-fixture-v4' }); f.evidence.clear(); f.restart(); const run = grader(), report = await f.placement.evaluate({ ...f.request, retry: true }, run), latest = f.read().attempts.at(-1);
  assert.equal(report.complete, true); assert.equal(run.calls.length, 0); assert.equal(f.read().attempts.length, 3); assert.deepEqual(f.read().attempts.slice(0, 2), old);
  assert.ok(report.rounds.every(round => round.completedFromSavedSkills && round.reusedSkills.length === 4)); assert.equal(report.rounds[1].skills.speaking.level, 'A1', 'Use the latest valid slot, never the highest older observation.');
  assert.equal(report.rounds[1].skillProvenance.listening.sourceAttemptId, old[0].id); assert.equal(report.rounds[1].skillProvenance.listening.promptVersion, 'placement-legacy-fixture-v4');
  assert.equal(report.rounds[1].skillProvenance.reading.sourceAttemptId, old[0].id); assert.equal(report.rounds[1].skillProvenance.writing.sourceAttemptId, old[1].id); assert.equal(report.rounds[1].skillProvenance.speaking.sourceAttemptId, old[1].id);
  assert.deepEqual(latest.rawResponses, old[1].rawResponses); assert.deepEqual(latest.speechProof, old[1].speechProof); assert.equal(report.skills.writing.level, 'A1'); assert.equal(report.skills.speaking.level, 'A1'); assert.equal(report.reviewMode, 'preserved-skill-progress');
});

test('a normal same-input submission breaks older skill-progress history', async t => {
  const f = await fixture(t); await f.placement.evaluate(f.request, grader({ 2: { invalidWriting: true } }));
  await f.placement.evaluate(f.request, grader({ 1: { fail: true } })); const old = f.read().attempts, run = grader();
  const report = await f.placement.evaluate({ ...f.request, retry: true }, run); assert.equal(report.complete, true); assert.deepEqual(run.calls.map(c => c.round), [1, 2]); assert.ok(report.rounds.every(r => r.reusedSkills.length === 0)); assert.deepEqual(f.read().attempts.slice(0, 2), old);
});

test('a disagreement barrier is durable before requests and prevents older conflicting slots returning after a failure', async t => {
  const f = await fixture(t); await f.placement.evaluate(f.request, grader({ 1: { writingLevel: 'A1' }, 2: { writingLevel: 'B1' } })); const old = f.read().attempts[0], run = grader({ 1: { writingLevel: 'B1' }, 2: { fail: true } });
  const partial = await f.placement.evaluate({ ...f.request, retry: true }, (...args) => { const active = f.read().attempts.at(-1); assert.equal(active.retry.reassessmentBarrier, true); assert.equal(active.retry.reason, 'independent-reassessment-after-disagreement'); return run(...args); });
  const barrier = f.read().attempts.at(-1); assert.equal(partial.complete, false); assert.deepEqual(run.calls.map(c => c.round), [1, 2]); assert.equal(barrier.rounds[1].ok, false);
  const next = grader({ 2: { writingLevel: 'B1' } }), report = await f.placement.evaluate({ ...f.request, retry: true }, next);
  assert.equal(report.complete, true); assert.deepEqual(next.calls.map(c => c.round), [2]); assert.equal(report.rounds[0].skillProvenance.writing.sourceAttemptId, barrier.id); assert.equal(report.rounds[1].skillProvenance.writing.sourceAttemptId, f.read().attempts.at(-1).id); assert.deepEqual(f.read().attempts[0], old); assert.deepEqual(f.read().attempts[1], barrier);
});

test('a serious disagreement discovered only after combining saved skills triggers two fresh independent rounds', async t => {
  const f = await fixture(t); await f.placement.evaluate(f.request, grader({ 2: { invalidWriting: true } }));
  await f.placement.evaluate(f.request, grader({ 1: { invalidWriting: true }, 2: { writingLevel: 'B1' } })); const old = legacyRetry(f), run = grader({ 1: { writingLevel: 'B1' }, 2: { writingLevel: 'B1' } });
  const report = await f.placement.evaluate({ ...f.request, retry: true }, run); assert.equal(report.complete, true); assert.deepEqual(run.calls.map(c => c.round), [1, 2]); assert.ok(report.rounds.every(r => r.reusedSkills.length === 0)); assert.equal(f.read().attempts.at(-1).retry.reassessmentBarrier, true); assert.deepEqual(f.read().attempts.slice(0, 2), old);
});

test('a malformed source pointer cannot jump history or consume model calls', async t => {
  for (const mode of ['self', 'future', 'duplicate']) await t.test(mode, async sub => {
    const f = await fixture(sub); await f.placement.evaluate(f.request, grader({ 2: { invalidWriting: true } })); const doc = f.read(), latest = doc.attempts[0];
    if (mode === 'duplicate') doc.attempts.push(clone(latest)); else latest.retry = { sourceAttemptId: mode === 'self' ? latest.id : crypto.randomUUID(), reason: 'retry-incomplete-rounds', reusedRounds: [] };
    fs.writeFileSync(f.file, JSON.stringify(doc)); const before = f.bytes(), run = grader(); await assert.rejects(f.placement.evaluate({ ...f.request, retry: true }, run), e => e.code === 'PLACEMENT_RETRY_HISTORY'); assert.equal(run.calls.length, 0); assert.deepEqual(f.bytes(), before);
  });
});
