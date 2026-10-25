'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const { createServer } = require('../server/server.cjs');
const { DATABASES } = require('../server/user-data.cjs');

const FAKE_KEY = 'placement-fake-secret-no-real-service';
const PASSAGE = 'The library opens at seven. It is near a small park in the town centre. People can read newspapers, borrow books and use a quiet room upstairs. A local group meets there every Friday to talk about books. Visitors do not need to pay to enter the building.';
function wav(seconds = 15, silent = false) {
  const bytes = Buffer.alloc(44 + seconds * 32000);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(seconds * 32000, 40);
  if (!silent) for (let i = 0; i < seconds * 16000; i++) bytes.writeInt16LE(Math.round(4000 * Math.sin(i * .1)), 44 + i * 2);
  return bytes;
}
const CORRECT = { q1: 'seven', q2: 'a small park', q3: 'Friday' };
function question(id) {
  const q = id === 'q1' ? { prompt: 'When does the library open?', options: ['six', 'seven', 'eight'], evidence: 'The library opens at seven.' } : id === 'q2' ? { prompt: 'What is near the library?', options: ['a small park', 'a bus station', 'a museum'], evidence: 'It is near a small park in the town centre.' } : { prompt: 'When does the local group meet?', options: ['Friday', 'Monday', 'Wednesday'], evidence: 'A local group meets there every Friday to talk about books.' };
  return { id, type: 'single', ...q, answer: CORRECT[id], answers: [CORRECT[id]], explanation: '正文明确给出事实。' };
}
function snapshot(entries = {}) { return { schemaVersion: 1, profile: { id: 'legacy', name: '测试档案', createdAt: '2026-10-25T00:00:00.000Z' }, entries, session: {}, databases: Object.entries(DATABASES).map(([name, store]) => ({ name, stores: [{ name: store, rows: [] }] })) }; }
function curriculum(root) {
  fs.mkdirSync(path.join(root, 'audio'));
  const value = { days: [1, 8, 57, 99, 141].map(day => ({ day, week: Math.ceil(day / 7), title: 'Real course day ' + day })), materials: ['A1', 'A2', 'B1', 'B2'].map(level => {
    const audio = 'audio/' + level + '.mp3'; fs.writeFileSync(path.join(root, audio), Buffer.alloc(1024, 1));
    return { id: 'placement-fixture-' + level, title: level + ' library', skill: 'listening', pool: 'independent', level, transcript: PASSAGE, audio, audioDurationSeconds: 15, audioSynthetic: true, source: { verification: 'reviewed' }, questions: [1, 2, 3].map(n => question('q' + n)) };
  }) };
  const auditDir = path.join(root, 'curriculum', 'independent-bank'); fs.mkdirSync(auditDir, { recursive: true });
  for (const m of value.materials) { m.source.contentHashFields = ['title', 'transcript', 'questions']; m.source.contentHash = crypto.createHash('sha256').update(JSON.stringify(Object.fromEntries(m.source.contentHashFields.map(k => [k, m[k]])))).digest('hex'); }
  fs.writeFileSync(path.join(auditDir, 'audio-audit.json'), JSON.stringify({ items: value.materials.map(m => { const bytes = fs.readFileSync(path.join(root, m.audio)); return { id: m.id, audio: m.audio, bytes: bytes.length, audioHash: crypto.createHash('sha256').update(bytes).digest('hex'), transcriptHash: crypto.createHash('sha256').update(m.transcript).digest('hex') }; }) }));
  return value;
}
function localRequest(url, { method = 'GET', headers = {}, body } = {}) {
  // Each short-lived fixture owns its connections. Do not leave a global
  // fetch pool pointing at a closed server when Windows reuses its port.
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method, headers, agent: false }, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => {
        try { resolve({ status: response.statusCode, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); } catch (error) { reject(error); }
      });
    });
    request.on('error', reject); request.end(body);
  });
}
async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ielts-placement-test-')), dataDir = path.join(root, 'isolated-data'), course = curriculum(root);
  fs.writeFileSync(path.join(root, 'VERSION'), '0.0.63\n'); fs.writeFileSync(path.join(root, '今日学习.html'), '<title>Test only</title>');
  let app, base, mode = 'normal', requests = [], evaluations = 0;
  function reply(value) { return new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
  const fetchImpl = async (url, options = {}) => {
    const u = new URL(url);
    if (u.pathname === '/models') return reply({ data: [{ id: 'deepseek-flash' }, { id: 'second-model' }] });
    if (u.pathname === '/auth/authorize') return reply({ code: 0, data: { warrant_id: 'placement-fake-warrant', expire_at: Date.now() / 1000 + 7200 } });
    if (u.pathname === '/en.sent.score') return reply({ result: { accuracy: 88, fluency: 82, integrity: 98, overall: 89 } });
    if (u.pathname !== '/chat/completions') throw Error('Unexpected fake endpoint: ' + u.pathname);
    const input = JSON.parse(options.body);
    if (input.asr_options) return reply({ choices: [{ message: { content: 'I live in a quiet town.' } }] });
    if (input.stream === true) {
      const prompt = input.messages[0].content[0].text, marker = '用户确认转写（仅辅助核对，不能取代听音）：', transcript = JSON.parse(prompt.slice(prompt.lastIndexOf(marker) + marker.length));
      const quote = transcript.split(' ').slice(0, 5).join(' '), evidence = [{ kind: 'speech', startSeconds: 0, endSeconds: 2, quote, comment: '模拟听音时点。' }];
      const observed = { audible: true, transcript, fluency: { comment: '模拟流利观察。', evidence }, pronunciation: { comment: '模拟可理解性观察。', evidence } };
      const event = 'data: ' + JSON.stringify({ choices: [{ delta: { content: JSON.stringify(observed) }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n';
      return new Response(event, { headers: { 'Content-Type': 'text/event-stream' } });
    }
    const system = input.messages[0].content, user = JSON.parse(input.messages[1].content);
    requests.push(input);
    if (system.includes('你为中文成人生成英语入学短测')) {
      const output = { listening: user.listeningSources.map(s => ({ taskId: s.taskId, questions: [1, 2, 3].map(n => question('q' + n)) })), reading: ['A1', 'A2', 'B1', 'B2'].map(level => ({ taskId: 'read-' + level.toLowerCase(), level, title: level + ' library reading', passage: PASSAGE, questions: [1, 2, 3].map(n => question('q' + n)) })), writing: { prompt: 'Describe a place you know. Add reasons and examples if you can.', instructions: '自主写3个句子或80–180词；真的不会可选择不会。' }, speaking: { prompt: 'Describe your usual day and explain one activity you enjoy.', instructions: '自主回答45–120秒；真的不会可选择不会。' } };
      if (mode === 'bad-evidence') output.reading[0].questions[0].evidence = 'This quote was never in the passage.';
      return reply({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] });
    }
    if (system.includes('你独立审查入学短测')) {
      const checks = user.tasks.flatMap(t => t.questions.map(q => ({ taskId: t.taskId, questionId: q.id, supported: mode !== 'bad-audit', uniqueAnswer: true, comment: '原文支持唯一答案。' })));
      return reply({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ checks }) } }] });
    }
    if (!system.includes('你为中文成人做英语入学分级')) throw Error('Unexpected fake prompt.');
    evaluations++;
    if (mode === 'upstream-failure') return new Response('private-' + FAKE_KEY, { status: 503 });
    if (mode === 'second-round-failure' && evaluations % 2 === 0) return new Response('{}', { status: 503 });
    const skills = ['listening', 'reading', 'writing', 'speaking'].map(skill => {
      const r = user.responses.find(r => r.taskId === skill), task = user.tasks.find(t => t.skill === skill), unanswered = r?.unanswered === true;
      let level = unanswered ? 'A0' : 'B2';
      if (mode === 'uncertain-writing' && skill === 'writing') level = null;
      if (skill === 'speaking' && user.verifiedSpeech.verification === 'missing' && !unanswered) level = null;
      let quote = unanswered ? '[explicit-unanswered]' : skill === 'writing' || skill === 'speaking' ? r?.text.slice(0, 25) || 'missing text' : 'The library opens at seven.';
      if (mode === 'invented-writing-quote' && skill === 'writing') quote = 'This was never written by the learner.';
      const audioEvidenceIds = ['fluency', 'pronunciation'].flatMap(d => user.verifiedSpeech.proof?.segments?.[0]?.[d]?.evidence?.map(e => e.id) || []);
      return { skill, level, confidence: 'medium', evidence: [{ taskId: task.taskId, quote, comment: '根据本次真实原稿与逐题结果作保守分级。', audioEvidenceIds }], gaps: ['需要后续不同任务复核。'] };
    });
    return reply({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ skills, summary: '保守分级，非正式成绩。' }) } }] });
  };
  async function start() {
    app = createServer({ rootDir: root, dataDir, fetchImpl, placementCurriculum: course, materialMigration: false, migrateLegacy: false, defaultCredentialPersistence: false });
    await new Promise(resolve => app.listen(0, '127.0.0.1', resolve)); base = 'http://127.0.0.1:' + app.address().port;
  }
  await start();
  t.after(async () => { if (app.listening) await new Promise(resolve => app.close(resolve)); const resolved = path.resolve(root); assert.equal(path.dirname(resolved), os.tmpdir()); assert.ok(path.basename(resolved).startsWith('ielts-placement-test-')); fs.rmSync(resolved, { recursive: true, force: true }); });
  async function api(endpoint, body, method) {
    return localRequest(base + endpoint, { method: method || (body === undefined ? 'GET' : 'POST'), headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  async function connect() { assert.equal((await api('/api/ai/connect', { baseUrl: 'https://placement.test', apiKey: FAKE_KEY, preferredModel: 'deepseek-flash' })).status, 200); }
  assert.equal((await api('/api/user-data/profiles/legacy/snapshot', { expectedRevision: 0, snapshot: snapshot(), activate: true }, 'PUT')).status, 200);
  await connect();
  const generate = () => api('/api/placement/generate', { profileId: 'legacy' });
  const answers = assessment => assessment.tasks.map(task => task.questions ? { taskId: task.id, answers: Object.fromEntries(task.questions.map(q => [q.id, CORRECT[q.id]])), ...(task.skill === 'listening' ? { audioCompleted: true, plays: 1 } : {}) } : { taskId: task.id, text: 'I live in a quiet town and I enjoy learning at our library because it has many interesting books. I usually go there with my family on Friday. We compare the stories that we have read and explain why we liked them. This activity helps me understand other people and gives me a chance to practise English. Although the library is small, the staff are helpful and the rooms are comfortable. I think it is a valuable place for everyone in the community.' });
  async function audioEvidence(text, bytes = wav()) {
    assert.equal((await api('/api/oral/configure', { appid: 'fake-app', appSecret: 'fake-app-secret-no-real-account', userId: 'placement-test', clientIp: '127.0.0.1' })).status, 200);
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    const upload = await localRequest(base + '/api/user-data/blobs/' + sha, { method: 'PUT', headers: { 'Content-Type': 'audio/wav' }, body: bytes }); assert.equal(upload.status, 200);
    const result = await api('/api/oral/assess', { reference: text, audio: bytes.toString('base64'), coreType: 'en.sent.score' }); assert.equal(result.status, 200);
    return { audioSha256: sha, evidenceId: result.data.evidenceId };
  }
  async function omniEvidence(assessment, text, bytes = wav(65)) {
    assert.equal((await api('/api/omni/configure', { baseUrl: 'https://omni.placement.test', apiKey: 'fake-omni-no-real-account', model: 'fake-omni' })).status, 200);
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    assert.equal((await localRequest(base + '/api/user-data/blobs/' + sha, { method: 'PUT', headers: { 'Content-Type': 'audio/wav' }, body: bytes })).status, 200);
    const result = await api('/api/omni/evidence', { audio: bytes.toString('base64'), transcript: text, prompt: assessment.tasks.find(t => t.id === 'speaking').prompt, task: 'foundation', level: 'A0' });
    assert.equal(result.status, 200); assert.equal(result.data.audioAnalysisEvidence, true);
    return { audioSha256: sha, evidenceId: result.data.evidenceId };
  }
  return { root, dataDir, course, api, generate, answers, audioEvidence, omniEvidence, requests, setMode: value => { mode = value; }, restart: async () => { await new Promise(resolve => app.close(resolve)); await start(); await connect(); } };
}

test('placement generates audited multilevel tasks and never exposes answer keys', async t => {
  const f = await fixture(t), output = await f.generate();
  assert.equal(output.status, 200); const assessment = output.data.assessment;
  assert.equal(assessment.tasks.length, 10); assert.equal(assessment.tasks.filter(t => t.questions).length, 8);
  assert.deepEqual(assessment.tasks.filter(t => t.skill === 'listening').map(t => t.level), ['A1', 'A2', 'B1', 'B2']);
  assert.equal(assessment.tasks.find(t => t.id === 'speaking').task, 'foundation');
  for (const task of assessment.tasks) for (const q of task.questions || []) { assert.equal(Object.hasOwn(q, 'answer'), false); assert.equal(Object.hasOwn(q, 'evidence'), false); }
  assert.equal(Object.hasOwn(assessment.tasks[0], 'transcript'), false);
  const privateDoc = JSON.parse(fs.readFileSync(path.join(f.dataDir, 'config', 'placement', 'legacy', assessment.id + '.json')));
  assert.equal(privateDoc.tasks[0].questions[0].answer, 'seven'); assert.equal(privateDoc.questionAudit.checks.length, 24);
  assert.equal(f.requests.length, 2); assert.ok(f.requests.every(r => r.response_format.type === 'json_object'));
  assert.ok(!JSON.stringify(output).includes(FAKE_KEY));
  f.setMode('bad-evidence'); assert.equal((await f.generate()).data.error.code, 'PLACEMENT_AI_EVIDENCE');
  f.setMode('bad-audit'); assert.equal((await f.generate()).data.error.code, 'PLACEMENT_QUESTION_AUDIT');
});

test('server grades raw answers, requires real speech, caps Ali and persists blind rounds', async t => {
  const f = await fixture(t), generated = await f.generate(), assessment = generated.data.assessment, responses = f.answers(assessment);
  const request = { profileId: 'legacy', assessmentId: assessment.id, responses };
  const noSpeech = await f.api('/api/placement/evaluate', request);
  assert.equal(noSpeech.status, 200); assert.equal(noSpeech.data.complete, false); assert.equal(noSpeech.data.skills.speaking.verification, 'missing'); assert.equal(noSpeech.data.skills.speaking.verified, false);
  assert.equal(noSpeech.data.skills.speaking.level, null); assert.equal(noSpeech.data.recommendation, null);
  const speech = responses.find(r => r.taskId === 'speaking'); Object.assign(speech, await f.audioEvidence(speech.text));
  const result = await f.api('/api/placement/evaluate', request);
  assert.equal(result.status, 200); assert.equal(result.data.complete, true); assert.equal(result.data.skills.speaking.level, 'A2'); assert.equal(result.data.skills.speaking.verification, 'limited'); assert.equal(result.data.skills.speaking.verified, false);
  assert.equal(result.data.provisional, true); assert.equal(result.data.recommendation.day, 57); assert.equal(result.data.rounds.length, 2); assert.equal(result.data.reviewMode, 'same-model-blind');
  assert.equal(result.data.skills.listening.objective.correct, 12); assert.equal(result.data.skills.reading.level, 'B2');
  const count = f.requests.length;
  assert.equal((await f.api('/api/placement/evaluate', { ...request, level: 'B2', score: 100 })).status, 400);
  assert.equal((await f.api('/api/placement/generate', { profileId: ['legacy'] })).status, 400);
  assert.equal((await f.api('/api/placement/evaluate', { ...request, profileId: ['legacy'] })).status, 400);
  assert.equal(f.requests.length, count);
  const tampered = structuredClone(request); tampered.responses[0].answers.q1 = 'forged answer'; assert.equal((await f.api('/api/placement/evaluate', tampered)).status, 400);
  const mismatch = structuredClone(request); mismatch.responses.at(-1).text = 'This is a different text.'; assert.equal((await f.api('/api/placement/evaluate', mismatch)).data.error.code, 'PLACEMENT_AUDIO_MISMATCH');
  await f.restart();
  const saved = await f.api('/api/placement/' + assessment.id + '?profileId=legacy'); assert.equal(saved.status, 200); assert.equal(saved.data.report.complete, true); assert.equal(saved.data.responses.at(-1).text, speech.text);
  assert.equal(Object.hasOwn(saved.data.assessment.tasks[0].questions[0], 'answer'), false);
  const resumed = await f.api('/api/placement/evaluate', request); assert.equal(resumed.data.complete, true); assert.equal(resumed.data.skills.speaking.verification, 'limited');
});

test('explicit inability is distinct from unsubmitted answers, silence and failed AI', async t => {
  const f = await fixture(t), assessment = (await f.generate()).data.assessment;
  const responses = f.answers(assessment).map(r => r.answers ? { taskId: r.taskId, answers: {}, skipped: true } : { taskId: r.taskId, text: '', unanswered: true });
  const request = { profileId: 'legacy', assessmentId: assessment.id, responses };
  const result = await f.api('/api/placement/evaluate', request);
  assert.equal(result.status, 200); assert.equal(result.data.complete, true); assert.equal(result.data.recommendation.day, 1); assert.equal(result.data.skills.speaking.verification, 'explicit-unanswered');
  const missing = await f.api('/api/placement/evaluate', { ...request, responses: responses.slice(1) }); assert.equal(missing.data.complete, false);
  const normal = f.answers(assessment), speech = normal.at(-1); Object.assign(speech, await f.audioEvidence(speech.text, wav(15, true)));
  const silent = await f.api('/api/placement/evaluate', { ...request, responses: normal }); assert.equal(silent.data.error.code, 'PLACEMENT_AUDIO_SILENT');
  f.setMode('upstream-failure');
  const failed = await f.api('/api/placement/evaluate', request); assert.equal(failed.status, 200); assert.equal(failed.data.status, 'pending'); assert.equal(failed.data.complete, false);
  const saved = await f.api('/api/placement/' + assessment.id + '?profileId=legacy'); assert.deepEqual(saved.data.responses, responses); assert.equal(saved.data.report.rounds[0].ok, false);
  assert.ok(!JSON.stringify(failed).includes(FAKE_KEY));
});

test('playing incompletely, wrong low-level answers or invented quotations cannot unlock a higher start', async t => {
  const f = await fixture(t), assessment = (await f.generate()).data.assessment, responses = f.answers(assessment), speech = responses.at(-1);
  Object.assign(speech, await f.audioEvidence(speech.text));
  responses[0].audioCompleted = false;
  let result = await f.api('/api/placement/evaluate', { profileId: 'legacy', assessmentId: assessment.id, responses });
  assert.equal(result.data.complete, false); assert.equal(result.data.skills.listening.objective.complete, false);
  responses[0].audioCompleted = true; responses[0].answers = { q1: 'six', q2: 'a museum', q3: 'Monday' };
  result = await f.api('/api/placement/evaluate', { profileId: 'legacy', assessmentId: assessment.id, responses });
  assert.equal(result.data.skills.listening.level, 'A0'); assert.equal(result.data.recommendation.day, 1);
  f.setMode('invented-writing-quote');
  result = await f.api('/api/placement/evaluate', { profileId: 'legacy', assessmentId: assessment.id, responses });
  assert.equal(result.data.complete, false); assert.equal(result.data.skills.writing.verified, false);
  f.setMode('uncertain-writing');
  result = await f.api('/api/placement/evaluate', { profileId: 'legacy', assessmentId: assessment.id, responses });
  assert.equal(result.data.complete, false); assert.equal(result.data.skills.writing.verified, false); assert.equal(result.data.rounds[0].skills.writing.level, null); assert.equal(result.data.skills.writing.level, null); assert.equal(result.data.recommendation, null);
});

test('profile reset blocks old assessments while restored completed references can only read private reports', async t => {
  const f = await fixture(t), assessment = (await f.generate()).data.assessment, responses = f.answers(assessment);
  responses.at(-1).text = ''; responses.at(-1).unanswered = true;
  const result = await f.api('/api/placement/evaluate', { profileId: 'legacy', assessmentId: assessment.id, responses }); assert.equal(result.data.complete, true);
  const reset = await f.api('/api/user-data/profiles/legacy/reset', { expectedRevision: 1 }); assert.equal(reset.status, 200);
  assert.equal((await f.api('/api/placement/' + assessment.id + '?profileId=legacy')).data.error.code, 'PLACEMENT_PROFILE_RESET');
  assert.equal((await f.api('/api/placement/evaluate', { profileId: 'legacy', assessmentId: assessment.id, responses })).data.error.code, 'PLACEMENT_PROFILE_RESET');
  const state = { version: 1, sessions: [{ id: assessment.id, report: { assessmentId: assessment.id, complete: true } }], adopted: { sessionId: assessment.id, adoptedAt: '2026-10-25T00:00:00.000Z' } };
  const restored = snapshot({ 'ielts52-placement-v1': JSON.stringify(state), 'ielts52-data-generation-v1': 'restore:' + reset.data.resetEpoch });
  assert.equal((await f.api('/api/user-data/profiles/legacy/snapshot', { expectedRevision: reset.data.revision, expectedResetEpoch: reset.data.resetEpoch, snapshot: restored }, 'PUT')).status, 200);
  const read = await f.api('/api/placement/' + assessment.id + '?profileId=legacy'); assert.equal(read.status, 200); assert.equal(read.data.report.complete, true);
  assert.equal(read.data.report.recommendation.day, result.data.recommendation.day);
  assert.equal((await f.api('/api/placement/evaluate', { profileId: 'legacy', assessmentId: assessment.id, responses })).status, 409);
  assert.equal((await f.api('/api/placement/' + assessment.id + '?profileId=legacy&profileId=legacy')).status, 400);
  assert.equal((await f.api('/api/placement/' + assessment.id + '?profileId=p-other0001')).status, 404);
});

test('complete Omni evidence matches audio, prompt, transcript and both acoustic dimensions', async t => {
  const f = await fixture(t), assessment = (await f.generate()).data.assessment, responses = f.answers(assessment), speaking = responses.at(-1);
  speaking.text += ' This is also where my friends and I organise activities for younger children, which is especially useful during the school holidays.';
  Object.assign(speaking, await f.omniEvidence(assessment, speaking.text));
  assert.equal((await f.api('/api/ai/reviewer/configure', { usePrimaryConnection: true, model: 'second-model' })).status, 200);
  const result = await f.api('/api/placement/evaluate', { profileId: 'legacy', assessmentId: assessment.id, responses });
  assert.equal(result.status, 200); assert.equal(result.data.complete, true); assert.equal(result.data.recommendation.day, 141); assert.equal(result.data.skills.speaking.level, 'B2'); assert.equal(result.data.skills.speaking.verification, 'audio'); assert.equal(result.data.skills.speaking.verified, true);
  assert.equal(result.data.reviewMode, 'second-model-blind'); assert.deepEqual(result.data.rounds.map(r => r.reviewer.model), ['deepseek-flash', 'second-model']);
  const altered = structuredClone(responses); altered.at(-1).text += ' Different words.';
  assert.equal((await f.api('/api/placement/evaluate', { profileId: 'legacy', assessmentId: assessment.id, responses: altered })).data.error.code, 'PLACEMENT_AUDIO_MISMATCH');
  const other = (await f.generate()).data.assessment;
  assert.equal((await f.api('/api/placement/evaluate', { profileId: 'legacy', assessmentId: other.id, responses })).data.error.code, 'PLACEMENT_AUDIO_MISMATCH');
});

test('a failed second blind request preserves the first round and retries against saved original work', async t => {
  const f = await fixture(t), assessment = (await f.generate()).data.assessment, responses = f.answers(assessment), speech = responses.at(-1);
  Object.assign(speech, await f.audioEvidence(speech.text)); f.setMode('second-round-failure');
  const request = { profileId: 'legacy', assessmentId: assessment.id, responses }, result = await f.api('/api/placement/evaluate', request);
  assert.equal(result.data.status, 'partial'); assert.equal(result.data.complete, false); assert.equal(result.data.rounds[0].ok, true); assert.equal(result.data.rounds[1].ok, false);
  const file = path.join(f.dataDir, 'config', 'placement', 'legacy', assessment.id + '.json'), saved = JSON.parse(fs.readFileSync(file));
  assert.equal(saved.attempts[0].responses.at(-1).text, speech.text); assert.equal(saved.attempts[0].speechProof.audioSha256, speech.audioSha256);
  f.setMode('normal'); const retry = await f.api('/api/placement/evaluate', request); assert.equal(retry.data.complete, true);
  assert.equal(JSON.parse(fs.readFileSync(file)).attempts.length, 2);
});

test('ASR alone and an audio hash from another recording cannot manufacture speaking evidence', async t => {
  const f = await fixture(t), assessment = (await f.generate()).data.assessment, responses = f.answers(assessment), speech = responses.at(-1);
  Object.assign(speech, await f.audioEvidence(speech.text));
  const bytes = wav(16), sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const another = await f.audioEvidence(speech.text, bytes);
  const mismatch = structuredClone(responses); mismatch.at(-1).audioSha256 = sha;
  assert.equal((await f.api('/api/placement/evaluate', { profileId: 'legacy', assessmentId: assessment.id, responses: mismatch })).data.error.code, 'PLACEMENT_AUDIO_MISMATCH');
  assert.equal((await f.api('/api/transcription/configure', { provider: 'qwen-asr', baseUrl: 'https://asr.placement.test', apiKey: 'fake-asr-no-real-account', model: 'fake-asr' })).status, 200);
  const asr = await f.api('/api/transcription/transcribe', { audio: bytes.toString('base64') }); assert.equal(asr.status, 200);
  const noSpeech = structuredClone(responses); noSpeech[noSpeech.length - 1] = { taskId: 'speaking', text: asr.data.text, audioSha256: another.audioSha256, evidenceId: asr.data.evidenceId };
  assert.equal((await f.api('/api/placement/evaluate', { profileId: 'legacy', assessmentId: assessment.id, responses: noSpeech })).data.error.code, 'PLACEMENT_AUDIO_MISMATCH');
});

test('missing or LFS pointer audio blocks generation before any AI work', async t => {
  const f = await fixture(t);
  fs.writeFileSync(path.join(f.root, 'audio', 'A1.mp3'), 'version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 1000000\n');
  assert.equal((await f.generate()).data.error.code, 'PLACEMENT_LISTENING_UNAVAILABLE'); assert.equal(f.requests.length, 0);
});

test('changing the transcript after the published audio audit invalidates the listening source', async t => {
  const f = await fixture(t); f.course.materials[0].transcript += ' A sentence never present in the audio.';
  assert.equal((await f.generate()).data.error.code, 'PLACEMENT_LISTENING_UNAVAILABLE'); assert.equal(f.requests.length, 0);
});
