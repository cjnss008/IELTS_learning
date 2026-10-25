'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const { createServer } = require('../server/server.cjs');
const { DATABASES } = require('../server/user-data.cjs');

const AT = '2026-10-25T00:00:00.000Z', MODEL = 'isolated-primary', KEY = 'isolated-placement-key-not-a-real-account';
const PASSAGE = 'The library opens at seven. It is near a small park in the town centre. People can read newspapers, borrow books and use a quiet room upstairs. A local group meets there every Friday to talk about books. Visitors do not need to pay to enter the building.';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function questions() {
  return [
    { id: 'q1', type: 'single', prompt: 'When does the library open?', options: ['six', 'seven', 'eight'], answer: 'seven', evidence: 'The library opens at seven.', explanation: '原文给出时间。' },
    { id: 'q2', type: 'single', prompt: 'What is near the library?', options: ['a small park', 'a museum', 'a station'], answer: 'a small park', evidence: 'It is near a small park in the town centre.', explanation: '原文给出地点。' },
    { id: 'q3', type: 'single', prompt: 'When does the group meet?', options: ['Friday', 'Monday', 'Wednesday'], answer: 'Friday', evidence: 'A local group meets there every Friday to talk about books.', explanation: '原文给出日期。' },
  ];
}
function curriculum(rootDir) {
  fs.mkdirSync(path.join(rootDir, 'audio')); const auditDir = path.join(rootDir, 'curriculum', 'independent-bank'); fs.mkdirSync(auditDir, { recursive: true });
  const materials = ['A1', 'A2', 'B1', 'B2'].map(level => {
    const audio = 'audio/' + level + '.mp3'; fs.writeFileSync(path.join(rootDir, audio), Buffer.alloc(1024, 1));
    const value = { id: 'connection-fixture-' + level, title: level + ' library', skill: 'listening', pool: 'independent', level, transcript: PASSAGE, audio, audioDurationSeconds: 15, audioSynthetic: true, questions: questions(), source: { verification: 'reviewed', contentHashFields: ['title', 'transcript', 'questions'] } };
    value.source.contentHash = hash(JSON.stringify(Object.fromEntries(value.source.contentHashFields.map(key => [key, value[key]])))); return value;
  });
  fs.writeFileSync(path.join(auditDir, 'audio-audit.json'), JSON.stringify({ items: materials.map(m => ({ id: m.id, audio: m.audio, bytes: 1024, audioHash: hash(fs.readFileSync(path.join(rootDir, m.audio))), transcriptHash: hash(m.transcript) })) }));
  return { materials, days: [1, 8, 57, 99, 141].map(day => ({ day, week: Math.ceil(day / 7), title: 'Isolated course ' + day })) };
}
function request(base, route, body, method) {
  return new Promise((resolve, reject) => {
    const req = http.request(base + route, { agent: false, method: method || (body === undefined ? 'GET' : 'POST'), headers: body === undefined ? {} : { 'Content-Type': 'application/json' } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); } catch (error) { reject(error); }
      });
    });
    req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ielts-placement-connection-')), rootDir = path.join(dir, 'app'), dataDir = path.join(dir, 'isolated-data'); fs.mkdirSync(rootDir);
  const course = curriculum(rootDir), calls = []; let evaluations = 0, failSecond = false, server, base;
  const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  const fetchImpl = async (url, options = {}) => {
    if (url === 'https://placement-connection.invalid/models') return reply({ data: [{ id: MODEL }] });
    assert.equal(url, 'https://placement-connection.invalid/chat/completions', 'No real AI, Ali, upload or unrelated provider calls are permitted.');
    const input = JSON.parse(options.body), value = JSON.parse(input.messages[1].content); let output;
    if (value.listeningSources) {
      calls.push({ kind: 'generate', input });
      output = { listening: value.listeningSources.map(source => ({ taskId: source.taskId, questions: questions() })), reading: ['A1', 'A2', 'B1', 'B2'].map(level => ({ taskId: 'read-' + level.toLowerCase(), level, title: level + ' reading', passage: PASSAGE, questions: questions() })), writing: { prompt: 'Describe your day.', instructions: '按真实能力回答。' }, speaking: { prompt: 'Describe your home.', instructions: '按真实能力回答。' } };
    } else if (!value.responses) {
      calls.push({ kind: 'audit', input });
      output = { checks: value.tasks.flatMap(task => task.questions.map(q => ({ taskId: task.taskId, questionId: q.id, supported: true, uniqueAnswer: true, plausibleDistractors: true, selfContainedEvidence: true, comment: '隔离连接测试审题。' }))) };
    } else {
      evaluations++; calls.push({ kind: 'evaluate', input });
      if (failSecond && evaluations === 2) return reply({}, 503);
      output = { skills: ['listening', 'reading', 'writing', 'speaking'].map(skill => ({ skill, level: 'A0', confidence: 'low', evidence: [{ taskId: value.tasks.find(task => task.skill === skill).taskId, quote: ['writing', 'speaking'].includes(skill) ? '[explicit-unanswered]' : 'The library opens at seven.', comment: '隔离测试，明确不会与服务故障分开。' }], gaps: [] })), summary: 'Isolated connection regression; not a real ability judgement.' };
    }
    return reply({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] });
  };
  async function start() {
    server = createServer({ rootDir, dataDir, fetchImpl, migrateLegacy: false, defaultCredentialPersistence: false, materialMigration: false, placementCurriculum: course, placementSourcePolicy: () => ({ eligible: true, priority: 0, category: 'isolated-fixture', reason: 'test-only', basis: {} }) });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); base = 'http://127.0.0.1:' + server.address().port;
  }
  async function close() { if (server?.listening) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); }
  await start(); t.after(async () => { await close(); assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('ielts-placement-connection-')); fs.rmSync(dir, { recursive: true, force: true }); });
  const api = (route, body, method) => request(base, route, body, method);
  const snapshot = { schemaVersion: 1, profile: { id: 'legacy', name: 'Isolated connection fixture', createdAt: AT }, entries: {}, session: {}, databases: Object.entries(DATABASES).map(([name, store]) => ({ name, stores: [{ name: store, rows: [] }] })) };
  assert.equal((await api('/api/user-data/profiles/legacy/snapshot', { expectedRevision: 0, snapshot, activate: true }, 'PUT')).status, 200);
  return { api, calls, dataDir, setFailSecond: value => { failSecond = value; }, restart: async () => { await close(); await start(); },
    connect: (selected = true) => api('/api/ai/connect', { baseUrl: 'https://placement-connection.invalid', apiKey: KEY, preferredModel: selected ? MODEL : 'unavailable-model' }),
    files: () => { const folder = path.join(dataDir, 'config', 'placement', 'legacy'); return fs.existsSync(folder) ? fs.readdirSync(folder).sort() : []; },
    bytes: id => fs.readFileSync(path.join(dataDir, 'config', 'placement', 'legacy', id + '.json')),
    read: id => JSON.parse(fs.readFileSync(path.join(dataDir, 'config', 'placement', 'legacy', id + '.json'), 'utf8')),
  };
}
function assessmentRequest(assessment) {
  return { profileId: 'legacy', assessmentId: assessment.id, responses: assessment.tasks.map(task => task.questions ? { taskId: task.id, answers: {}, skipped: true } : { taskId: task.id, unanswered: true }) };
}

test('placement connection and model prechecks reject before generating files or saving an evaluation attempt', async t => {
  const f = await fixture(t), generate = () => f.api('/api/placement/generate', { profileId: 'legacy' });
  let result = await generate(); assert.equal(result.status, 409); assert.equal(result.data.error.code, 'NOT_CONNECTED'); assert.match(result.data.error.message, /AI 设置/); assert.deepEqual(f.files(), []); assert.equal(f.calls.length, 0);
  await f.connect(false); result = await generate(); assert.equal(result.status, 409); assert.equal(result.data.error.code, 'MODEL_REQUIRED'); assert.deepEqual(f.files(), []); assert.equal(f.calls.length, 0);
  await f.api('/api/ai/model', { model: MODEL }); const assessment = (await generate()).data.assessment, body = assessmentRequest(assessment), before = f.bytes(assessment.id), count = f.calls.length;
  await f.api('/api/ai/connection', undefined, 'DELETE'); result = await f.api('/api/placement/evaluate', body); assert.equal(result.status, 409); assert.equal(result.data.error.code, 'NOT_CONNECTED'); assert.deepEqual(f.bytes(assessment.id), before); assert.equal(f.calls.length, count);
  await f.connect(false); result = await f.api('/api/placement/evaluate', body); assert.equal(result.status, 409); assert.equal(result.data.error.code, 'MODEL_REQUIRED'); assert.deepEqual(f.bytes(assessment.id), before); assert.equal(f.read(assessment.id).attempts.length, 0); assert.equal(f.calls.length, count);
});

test('a disconnected retry preserves its old partial report and attempt count, then a connected retry calls only round two', async t => {
  const f = await fixture(t); await f.connect(); const assessment = (await f.api('/api/placement/generate', { profileId: 'legacy' })).data.assessment, body = assessmentRequest(assessment); f.setFailSecond(true);
  const partial = await f.api('/api/placement/evaluate', body); assert.equal(partial.status, 200); assert.equal(partial.data.complete, false); assert.equal(partial.data.rounds[0].ok, true); assert.equal(partial.data.rounds[1].ok, false);
  const original = f.read(assessment.id), before = f.bytes(assessment.id), count = f.calls.length; assert.equal(original.attempts.length, 1); assert.equal(original.report.status, 'partial');
  await f.restart(); assert.equal((await f.api('/api/ai/status')).data.connected, false); assert.equal((await f.api('/api/ai/reviewer/status')).data.configured, false);
  for (let i = 0; i < 3; i++) { const rejected = await f.api('/api/placement/evaluate', { ...body, retry: true }); assert.equal(rejected.status, 409); assert.equal(rejected.data.error.code, 'NOT_CONNECTED'); assert.deepEqual(f.bytes(assessment.id), before); }
  await f.connect(false); const noModel = await f.api('/api/placement/evaluate', { ...body, retry: true }); assert.equal(noModel.status, 409); assert.equal(noModel.data.error.code, 'MODEL_REQUIRED'); assert.deepEqual(f.bytes(assessment.id), before); assert.equal(f.calls.length, count);
  const recovered = await f.api('/api/placement/' + assessment.id + '?profileId=legacy'); assert.equal(recovered.status, 200); assert.deepEqual(recovered.data.report, original.report); assert.deepEqual(recovered.data.responses, body.responses);
  await f.api('/api/ai/model', { model: MODEL }); const completed = await f.api('/api/placement/evaluate', { ...body, retry: true }), latest = f.read(assessment.id);
  assert.equal(completed.status, 200); assert.equal(completed.data.complete, true); assert.equal(completed.data.reviewMode, 'preserved-skill-progress'); assert.equal(f.calls.length, count + 1); assert.equal(f.calls.at(-1).kind, 'evaluate'); assert.equal(f.calls.at(-1).input.model, MODEL); assert.match(f.calls.at(-1).input.messages[0].content, /第2轮独立盲评/);
  assert.equal(latest.attempts.length, 2); assert.deepEqual(latest.attempts[0], original.attempts[0]); assert.deepEqual(latest.attempts[1].retry.reusedRounds, [1]); assert.deepEqual(latest.attempts[1].rawResponses, body.responses); assert.equal(completed.data.rounds[0].sourceAttemptId, original.attempts[0].id); assert.equal(completed.data.rounds[1].reviewer.model, MODEL); assert.ok(!JSON.stringify(completed.data).includes(KEY));
});
