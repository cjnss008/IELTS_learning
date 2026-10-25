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
const { shuffleOptions, writingChecks } = require('../server/placement.cjs');

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
  let app, base, mode = 'normal', requests = [], evaluations = 0, generations = 0, audits = 0;
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
      const acoustic = mode.startsWith('acoustic') || mode === 'audio-only-evidence';
      const observed = { audible: true, transcript, fluency: { comment: '模拟流利观察。', evidence: acoustic ? [{ kind: 'acoustic', observation: 'pause', startSeconds: 2, endSeconds: 3, quote: '', comment: '模拟真实句间停顿。' }] : evidence }, pronunciation: { comment: '模拟可理解性观察。', evidence: acoustic ? [{ kind: 'acoustic', observation: 'stress', startSeconds: 4, endSeconds: 5, quote: '', comment: '模拟真实重音。' }] : evidence } };
      const event = 'data: ' + JSON.stringify({ choices: [{ delta: { content: JSON.stringify(observed) }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n';
      return new Response(event, { headers: { 'Content-Type': 'text/event-stream' } });
    }
    const system = input.messages[0].content, user = JSON.parse(input.messages[1].content);
    requests.push(input);
    if (system.includes('你为中文成人生成英语入学短测')) {
      generations++;
      if (mode === 'generation-service-failure') return new Response('{}', { status: 503 });
      const output = { listening: user.listeningSources.map(s => ({ taskId: s.taskId, questions: [1, 2, 3].map(n => question('q' + n)) })), reading: ['A1', 'A2', 'B1', 'B2'].map(level => ({ taskId: 'read-' + level.toLowerCase(), level, title: level + ' library reading', passage: PASSAGE, questions: [1, 2, 3].map(n => question('q' + n)) })), writing: { prompt: 'Describe a place you know. Add reasons and examples if you can.', instructions: '自主写3个句子或80–180词；真的不会可选择不会。' }, speaking: { prompt: 'Describe your usual day and explain one activity you enjoy.', instructions: '自主回答45–120秒；真的不会可选择不会。' } };
      if (mode === 'bad-evidence') output.reading[0].questions[0].evidence = 'This quote was never in the passage.';
      if (mode === 'invalid-first-generation' && generations === 1) delete output.listening[0].questions[1].prompt;
      if (mode === 'audit-reject-first' && generations === 1) output.reading[1].questions[1].prompt = 'Which nearby landmark is NOT mentioned?';
      return reply({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] });
    }
    if (system.includes('你独立审查入学短测')) {
      audits++;
      const checks = user.tasks.flatMap(t => t.questions.map(q => ({ taskId: t.taskId, questionId: q.id, supported: mode !== 'bad-audit', uniqueAnswer: true, plausibleDistractors: mode !== 'bad-distractors', selfContainedEvidence: mode !== 'bad-evidence-scope', comment: '原文支持唯一答案，干扰项与完整引证已核对。' })));
      if (mode === 'audit-reject-first' && audits === 1) Object.assign(checks.find(c => c.taskId === 'read-a2' && c.questionId === 'q2'), { supported: false, comment: '题干是否定提问，但答案指向已明确提及的地点。' });
      return reply({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ checks }) } }] });
    }
    if (!system.includes('你为中文成人做英语入学分级')) throw Error('Unexpected fake prompt.');
    evaluations++;
    if (mode === 'upstream-failure') return new Response('private-' + FAKE_KEY, { status: 503 });
    if (mode === 'second-round-failure' && evaluations % 2 === 0) return new Response('{}', { status: 503 });
    if (mode === 'invalid-json-second-round' && evaluations % 2 === 0) return reply({ choices: [{ finish_reason: 'stop', message: { content: '{"skills":[{"skill":"listening","levelReason":"text"in: "levelReason":"other"}]}' } }] });
    const skills = ['listening', 'reading', 'writing', 'speaking'].map(skill => {
      const r = user.responses.find(r => r.taskId === skill), task = user.tasks.find(t => t.skill === skill), unanswered = r?.unanswered === true;
      let level = unanswered ? 'A0' : 'B2';
      if (mode === 'uncertain-writing' && skill === 'writing') level = null;
      if (mode === 'one-step-writing-disagreement' && skill === 'writing') level = evaluations % 2 ? 'A1' : 'A2';
      if (mode === 'two-step-writing-disagreement' && skill === 'writing') level = evaluations % 2 ? 'A1' : 'B1';
      if (['both-low-writing', 'criteria-all-not-met-a1'].includes(mode) && skill === 'writing') level = 'A1';
      if (mode === 'criteria-inconsistent-lower' && skill === 'writing') level = 'A2';
      if (skill === 'speaking' && user.verifiedSpeech.verification === 'missing' && !unanswered) level = null;
      let quote = unanswered ? '[explicit-unanswered]' : skill === 'writing' || skill === 'speaking' ? r?.text.slice(0, 25) || 'missing text' : 'The library opens at seven.';
      if (mode === 'invented-writing-quote' && skill === 'writing') quote = 'This was never written by the learner.';
      const audioEvidenceIds = ['fluency', 'pronunciation'].flatMap(d => user.verifiedSpeech.proof?.segments?.[0]?.[d]?.evidence?.map(e => e.id) || []);
      let evidence = [{ taskId: task.taskId, quote, comment: '根据本次真实原稿与逐题结果作保守分级。', audioEvidenceIds }];
      if (skill === 'speaking' && (mode.startsWith('acoustic') || mode === 'audio-only-evidence')) {
        evidence = [{ taskId: task.taskId, quote, comment: '原稿中的实际表达。', audioEvidenceIds: [] }, ...['fluency', 'pronunciation'].flatMap(d => (user.verifiedSpeech.proof?.segments?.[0]?.[d]?.evidence || []).map(o => ({ taskId: task.taskId, quote: mode === 'acoustic-invented-quote' && d === 'pronunciation' ? '[noise]' : o.quote, comment: '引用已验证原声观察。', audioEvidenceIds: [mode === 'acoustic-forged-id' && d === 'pronunciation' ? 'invented-audio-id' : o.id] })))];
        if (mode === 'audio-only-evidence') evidence.shift();
      }
      let writing = {};
      if (skill === 'writing' && r?.text && !unanswered && mode !== 'criteria-missing') {
        const rank = ['A0', 'A1', 'A2', 'B1', 'B2'].indexOf(level), modelRank = mode === 'criteria-inconsistent-lower' ? 3 : rank;
        const first = r.text.slice(0, Math.min(30, Math.floor(r.text.length / 2))), last = r.text.slice(-Math.min(30, Math.floor(r.text.length / 2)));
        const criteria = user.writingScale.criteria.map(c => {
          let applicability = c.id === 'extended_organisation' ? 'not_elicited' : 'applicable', status = c.id === 'extended_organisation' ? 'not_applicable' : 'met', issueType = null;
          if (c.id === 'simple_linking' && modelRank < 2) { status = 'not_met'; issueType = 'isolated_sentences'; }
          if (c.id === 'linear_progression' && modelRank < 3) { status = 'not_met'; issueType = 'disconnected_points'; }
          const links = ['simple_linking', 'linear_progression'].includes(c.id) && status === 'met' ? [{ fromQuote: first, toQuote: last, relation: 'sequence', comment: '模拟评阅：本稿两个实际信息单位的关系。' }] : [];
          return { id: c.id, applicability, status, issueType, evidence: status === 'not_applicable' ? [] : [{ quote: first, comment: '模拟评阅本次原稿中的实际表现。' }], links, comment: status === 'not_applicable' ? '短任务未引出长文组织，不能据此降级。' : '模拟评阅针对当前稿，不代表真实能力判断。' };
        });
        if (mode === 'criteria-all-not-met-a1') for (const c of criteria) if (c.id !== 'extended_organisation') { c.status = 'not_met'; c.issueType = user.writingScale.criteria.find(d => d.id === c.id).allowedIssueTypes[0]; c.links = []; }
        const levelBasis = { supportingCriterionIds: criteria.filter(c => c.status === 'met').map(c => c.id), limitingCriterionIds: criteria.filter(c => c.status === 'not_met').map(c => c.id), uncertainCriterionIds: [] };
        if (mode === 'criteria-invalid-quote') criteria.find(c => c.id === 'grammar_control').evidence[0].quote = 'Words that were not in the learner draft.';
        if (mode === 'criteria-invalid-link') criteria.find(c => c.id === 'linear_progression').links[0].toQuote = 'An invented second sentence.';
        if (mode === 'criteria-advanced-gate') { Object.assign(criteria.find(c => c.id === 'extended_organisation'), { applicability: 'applicable', status: 'not_met', issueType: 'requires_multiple_paragraphs' }); levelBasis.limitingCriterionIds = ['extended_organisation']; }
        writing = { criteria, levelBasis };
      }
      return { skill, level, confidence: 'medium', evidence, ...writing, gaps: ['需要后续不同任务复核。'] };
    });
    return reply({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ skills, summary: '保守分级，非正式成绩。' }) } }] });
  };
  async function start() {
    app = createServer({ rootDir: root, dataDir, fetchImpl, placementCurriculum: course, placementSourcePolicy: () => ({ eligible: true, priority: 0, category: 'isolated-fixture', reason: 'Test-only injected curriculum', basis: {} }), materialMigration: false, migrateLegacy: false, defaultCredentialPersistence: false });
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
  return { root, dataDir, course, api, generate, answers, audioEvidence, omniEvidence, requests, setMode: value => { mode = value; generations = audits = evaluations = 0; }, restart: async () => { await new Promise(resolve => app.close(resolve)); await start(); await connect(); } };
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
  const auditedTasks = JSON.parse(f.requests[1].messages[1].content).tasks;
  for (const task of assessment.tasks.filter(t => t.questions)) for (const q of task.questions) assert.deepEqual(auditedTasks.find(t => t.taskId === task.id).questions.find(t => t.id === q.id).options, q.options);
  assert.deepEqual((await f.api('/api/placement/' + assessment.id + '?profileId=legacy')).data.assessment.tasks, assessment.tasks, 'A persisted question order is never reshuffled when read.');
  assert.ok(!JSON.stringify(output).includes(FAKE_KEY));
  f.setMode('bad-evidence'); assert.equal((await f.generate()).data.error.code, 'PLACEMENT_AI_EVIDENCE');
  f.setMode('bad-audit'); assert.equal((await f.generate()).data.error.code, 'PLACEMENT_QUESTION_AUDIT');
});

test('Fisher-Yates option shuffling preserves every option and the literal answer without mutating source order', () => {
  const original = ['first', 'second', 'third', 'fourth'], calls = [];
  const shuffled = shuffleOptions(original, limit => { calls.push(limit); return 0; });
  assert.deepEqual(calls, [4, 3, 2]); assert.deepEqual(shuffled, ['second', 'third', 'fourth', 'first']);
  assert.deepEqual(original, ['first', 'second', 'third', 'fourth']); assert.deepEqual(new Set(shuffled), new Set(original)); assert.equal(shuffled.filter(v => v === 'third').length, 1);
});

test('generation gives complete examples and repairs one malformed candidate without relaxing validation', async t => {
  const f = await fixture(t); f.setMode('invalid-first-generation');
  const result = await f.generate(); assert.equal(result.status, 200); assert.equal(f.requests.length, 3);
  const firstSystem = f.requests[0].messages[0].content;
  assert.match(firstSystem, /三个不同事实/); assert.match(firstSystem, /三题都必须完整包含/);
  assert.equal((firstSystem.match(/"id":"q2","prompt"/g) || []).length, 8);
  const repair = JSON.parse(f.requests[1].messages[2].content).repair;
  assert.equal(repair.failure.details.taskId, 'listen-a1'); assert.equal(repair.failure.details.questionId, 'q2');
  assert.match(repair.previousCandidate, /listen-a1/);
  const doc = JSON.parse(fs.readFileSync(path.join(f.dataDir, 'config', 'placement', 'legacy', result.data.assessment.id + '.json')));
  assert.equal(doc.generationAttempts.length, 2); assert.equal(doc.generationAttempts[0].status, 'rejected'); assert.equal(doc.generationAttempts[1].status, 'accepted');
  assert.equal(doc.questionAudit.checks.length, 24); assert.ok(doc.questionAudit.checks.every(c => c.supported && c.uniqueAnswer));
  assert.equal(Object.hasOwn(result.data.assessment, 'generationAttempts'), false);
});

test('a semantic rejection is preserved and the changed candidate needs a fresh complete question audit', async t => {
  const f = await fixture(t); f.setMode('audit-reject-first');
  const result = await f.generate(); assert.equal(result.status, 200); assert.equal(f.requests.length, 4);
  const repair = JSON.parse(f.requests[2].messages[2].content).repair;
  assert.equal(repair.failure.code, 'PLACEMENT_QUESTION_AUDIT'); assert.equal(repair.failure.details.taskId, 'read-a2'); assert.match(repair.failure.details.comment, /否定/);
  const doc = JSON.parse(fs.readFileSync(path.join(f.dataDir, 'config', 'placement', 'legacy', result.data.assessment.id + '.json')));
  assert.match(doc.generationAttempts[0].candidate.content, /NOT mentioned/); assert.match(doc.generationAttempts[0].audit.content, /"supported":false/);
  assert.ok(!doc.generationAttempts[1].candidate.content.includes('NOT mentioned'));
  assert.equal(doc.generationAttempts[1].status, 'accepted'); assert.equal(doc.questionAudit.checks.length, 24);
  f.setMode('bad-audit'); const failed = await f.generate(); assert.equal(failed.status, 502);
  assert.equal(f.requests.length, 8, 'A second rejected audit stops after the single repair.');
});

test('implausible distractors or incomplete referents still reject the whole candidate after the one repair', async t => {
  const f = await fixture(t);
  f.setMode('bad-distractors'); const distractors = await f.generate(); assert.equal(distractors.status, 502); assert.equal(distractors.data.error.code, 'PLACEMENT_QUESTION_AUDIT');
  f.setMode('bad-evidence-scope'); const fragments = await f.generate(); assert.equal(fragments.status, 502); assert.equal(fragments.data.error.code, 'PLACEMENT_QUESTION_AUDIT');
  assert.equal(f.requests.length, 8); assert.match(f.requests[1].messages[0].content, /先行词/); assert.match(f.requests[1].messages[0].content, /荒谬常识/);
});

test('upstream generation failures are saved once without extra requests or exposing unaudited candidates', async t => {
  const f = await fixture(t); f.setMode('generation-service-failure');
  const result = await f.generate(); assert.equal(result.status, 502); assert.equal(f.requests.length, 1);
  const dir = path.join(f.dataDir, 'config', 'placement', 'legacy'), doc = JSON.parse(fs.readFileSync(path.join(dir, fs.readdirSync(dir).find(n => n.endsWith('.json')))));
  assert.equal(doc.generationAttempts.length, 1); assert.equal(doc.generationAttempts[0].status, 'rejected'); assert.equal(doc.status, 'pending');
  const saved = await f.api('/api/placement/' + doc.id + '?profileId=legacy'); assert.equal(saved.status, 200); assert.equal(saved.data.assessment.status, 'pending'); assert.deepEqual(saved.data.assessment.tasks, []);
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
  const evalPayload = JSON.parse(f.requests.at(-1).messages[1].content);
  assert.equal(evalPayload.objective.listening.stages[0].items[0].prompt, assessment.tasks[0].questions[0].prompt);
  assert.deepEqual(evalPayload.objective.listening.stages[0].items[0].options, assessment.tasks[0].questions[0].options);
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

test('CEFR writing guidance makes adjacent disagreement explicit while keeping the lower evidenced level', async t => {
  const f = await fixture(t), assessment = (await f.generate()).data.assessment, responses = f.answers(assessment), speech = responses.at(-1);
  Object.assign(speech, await f.audioEvidence(speech.text));
  const request = { profileId: 'legacy', assessmentId: assessment.id, responses };
  f.setMode('one-step-writing-disagreement'); const adjacent = await f.api('/api/placement/evaluate', request), writing = adjacent.data.skills.writing;
  assert.equal(adjacent.data.complete, true); assert.equal(writing.level, 'A1'); assert.deepEqual(writing.levelRange, ['A1', 'A2']); assert.equal(writing.disagreementSteps, 1); assert.equal(writing.provisional, true); assert.equal(writing.confidence, 'low'); assert.equal(writing.needsRetest, false); assert.match(writing.gaps.join(' '), /相差一档/); assert.equal(adjacent.data.recommendation.day, 8);
  assert.equal(adjacent.data.rubricSources[0].version, '2020'); assert.ok(adjacent.data.rubricSources[0].printedPages.includes(66)); assert.ok(adjacent.data.rubricSources[0].printedPages.includes(68)); assert.ok(adjacent.data.rubricSources[0].printedPages.includes(188));
  const system = f.requests.at(-1).messages[0].content;
  assert.match(system, /A1时basic_message必须/); assert.match(system, /A2同样需要simple_linking/); assert.match(system, /B1\/B2同样需要linear_progression/); assert.match(system, /不要为了通过校验强填met或捏造依据/);
  assert.match(system, /CEFR Companion Volume 2020/); assert.match(system, /多段、多个例子/); assert.match(system, /不能只因出现because\/however\/if就升级/); assert.match(system, /线性顺序/);
  f.setMode('two-step-writing-disagreement'); const wide = await f.api('/api/placement/evaluate', request); assert.equal(wide.data.complete, false); assert.equal(wide.data.skills.writing.needsRetest, true); assert.equal(wide.data.skills.writing.disagreementSteps, 2); assert.equal(wide.data.recommendation, null);
  f.setMode('both-low-writing'); const low = await f.api('/api/placement/evaluate', request); assert.equal(low.data.skills.writing.level, 'A1'); assert.equal(low.data.skills.writing.provisional, false, 'Guidance never injects a higher mark just for connectors in the sample.'); assert.deepEqual(low.data.skills.writing.levelRange, ['A1', 'A1']);
});

test('structured writing checks retain real criteria but never manufacture a higher mark to resolve contradictions', async t => {
  const f = await fixture(t), assessment = (await f.generate()).data.assessment, responses = f.answers(assessment), speech = responses.at(-1);
  Object.assign(speech, await f.audioEvidence(speech.text));
  const request = { profileId: 'legacy', assessmentId: assessment.id, responses };
  const valid = await f.api('/api/placement/evaluate', request); assert.equal(valid.data.complete, true);
  for (const round of valid.data.rounds) { const w = round.skills.writing; assert.equal(w.criteriaValid, true); assert.equal(w.criteria.length, 7); assert.equal(w.criteria.find(c => c.id === 'extended_organisation').status, 'not_applicable'); assert.ok(w.levelBasis.supportingCriterionIds.includes('linear_progression')); }
  const payload = JSON.parse(f.requests.at(-1).messages[1].content); assert.equal(payload.writingScale.criteria.length, 7); assert.match(payload.writingScale.anchors.status, /不是官方/); assert.equal(f.requests.at(-1).max_tokens, 9000);
  for (const mode of ['criteria-missing', 'criteria-invalid-quote', 'criteria-invalid-link', 'criteria-advanced-gate', 'criteria-inconsistent-lower', 'criteria-all-not-met-a1']) {
    f.setMode(mode); const result = await f.api('/api/placement/evaluate', request);
    assert.equal(result.data.complete, false, mode); assert.equal(result.data.skills.writing.level, null, mode); assert.equal(result.data.recommendation, null, mode); assert.equal(result.data.rounds[0].skills.writing.criteriaValid, false, mode); assert.equal(result.data.rounds[0].formatRepair, undefined, mode);
  }
});

test('a grounded elaboration relation is parsed without discarding it or changing a contradictory model level', () => {
  const first = 'We borrow books.', last = 'This helps our children learn.', text = first + ' ' + last;
  const ids = ['basic_message', 'simple_linking', 'linear_progression', 'relevant_support', 'grammar_control', 'lexical_control', 'extended_organisation'];
  const criteria = ids.map(id => ({ id, applicability: id === 'extended_organisation' ? 'not_elicited' : 'applicable', status: id === 'extended_organisation' ? 'not_applicable' : 'met', issueType: null, evidence: id === 'extended_organisation' ? [] : [{ quote: first, comment: '原稿中的可核对表现。' }], links: ['simple_linking', 'linear_progression'].includes(id) ? [{ fromQuote: first, toQuote: last, relation: 'elaboration', comment: '后句进一步说明借书的作用。' }] : [], comment: id === 'extended_organisation' ? '短稿未引出长文要求。' : '针对本稿的具体观察。' }));
  const raw = { criteria, levelBasis: { supportingCriterionIds: ids.slice(0, 6), limitingCriterionIds: [], uncertainCriterionIds: [] } };
  const valid = writingChecks(raw, text, 'B1', false); assert.equal(valid.valid, true); assert.equal(valid.criteria.find(c => c.id === 'linear_progression').links[0].relation, 'elaboration');
  const inconsistent = writingChecks(raw, text, 'A2', false); assert.equal(inconsistent.valid, false); assert.equal(inconsistent.criteria.find(c => c.id === 'linear_progression').links.length, 1); assert.equal(inconsistent.gaps.length, 1); assert.match(inconsistent.gaps[0], /真实.*缺口/);
  raw.criteria.find(c => c.id === 'linear_progression').links[0].toQuote = 'A sentence that was never written.';
  assert.equal(writingChecks(raw, text, 'B1', false).valid, false, 'An accepted relation label never excuses fabricated evidence.');
});

test('malformed upstream JSON receives one new strictly validated format repair', async t => {
  const f = await fixture(t), assessment = (await f.generate()).data.assessment, responses = f.answers(assessment);
  responses.at(-1).text = ''; responses.at(-1).unanswered = true;
  f.setMode('invalid-json-second-round'); const result = await f.api('/api/placement/evaluate', { profileId: 'legacy', assessmentId: assessment.id, responses });
  assert.equal(result.status, 200); assert.equal(result.data.complete, true); assert.equal(result.data.rounds[1].formatRepair.repaired, true); assert.equal(result.data.rounds[1].skills.writing.criteriaValid, true); assert.equal(JSON.stringify(result.data).includes('modelFormatDiagnostics'), false);
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

test('profile reset and a browser-made restore marker cannot revive an old completed assessment', async t => {
  const f = await fixture(t), assessment = (await f.generate()).data.assessment, responses = f.answers(assessment);
  responses.at(-1).text = ''; responses.at(-1).unanswered = true;
  const result = await f.api('/api/placement/evaluate', { profileId: 'legacy', assessmentId: assessment.id, responses }); assert.equal(result.data.complete, true);
  const reset = await f.api('/api/user-data/profiles/legacy/reset', { expectedRevision: 1 }); assert.equal(reset.status, 200);
  assert.equal((await f.api('/api/placement/' + assessment.id + '?profileId=legacy')).data.error.code, 'PLACEMENT_PROFILE_RESET');
  assert.equal((await f.api('/api/placement/evaluate', { profileId: 'legacy', assessmentId: assessment.id, responses })).data.error.code, 'PLACEMENT_PROFILE_RESET');
  const timestamp = new Date().toISOString(), state = { version: 1, sessions: [{ id: assessment.id, assessment, createdAt: timestamp, updatedAt: timestamp, status: 'complete', answers: {}, report: result.data }], adopted: { sessionId: assessment.id, adoptedAt: timestamp } };
  const restored = snapshot({ 'ielts52-placement-v1': JSON.stringify(state), 'ielts52-data-generation-v1': 'restore:' + reset.data.resetEpoch });
  assert.equal((await f.api('/api/user-data/profiles/legacy/snapshot', { expectedRevision: reset.data.revision, expectedResetEpoch: reset.data.resetEpoch, snapshot: restored }, 'PUT')).status, 200);
  const read = await f.api('/api/placement/' + assessment.id + '?profileId=legacy'); assert.equal(read.status, 409); assert.equal(read.data.error.code, 'PLACEMENT_PROFILE_RESET');
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

test('verified acoustic quotes are usable only with their exact audio IDs and a separate real transcript anchor', async t => {
  const f = await fixture(t), assessment = (await f.generate()).data.assessment, responses = f.answers(assessment), speech = responses.at(-1);
  speech.text += ' I also help the younger children choose interesting stories during the holidays, because reading together gives them more confidence.';
  f.setMode('acoustic'); Object.assign(speech, await f.omniEvidence(assessment, speech.text));
  const request = { profileId: 'legacy', assessmentId: assessment.id, responses };
  const valid = await f.api('/api/placement/evaluate', request);
  assert.equal(valid.data.complete, true); assert.equal(valid.data.skills.speaking.level, 'B2');
  for (const round of valid.data.rounds) { const e = round.skills.speaking.evidence; assert.ok(e.some(e => e.source === 'text')); assert.ok(e.some(e => e.quote === '[pause]' && e.source === 'audio')); assert.ok(e.some(e => e.quote === '[stress]' && e.source === 'audio')); }
  f.setMode('acoustic-invented-quote'); const invented = await f.api('/api/placement/evaluate', request); assert.equal(invented.data.complete, false); assert.equal(invented.data.skills.speaking.level, null);
  f.setMode('acoustic-forged-id'); const forged = await f.api('/api/placement/evaluate', request); assert.equal(forged.data.complete, false); assert.equal(forged.data.skills.speaking.level, null);
  f.setMode('audio-only-evidence'); const noText = await f.api('/api/placement/evaluate', request); assert.equal(noText.data.complete, false); assert.equal(noText.data.skills.speaking.level, null); assert.match(noText.data.skills.speaking.gaps.join(' '), /准确引文/);
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
