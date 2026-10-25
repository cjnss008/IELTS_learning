'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), http = require('node:http');
const { normalize, createOralHandler } = require('../server/oral.cjs');
const coach = require('../server/oral-coach.cjs');
const { createEvidenceStore } = require('../server/evidence.cjs');

// Field names and meanings are from the official sentence/paragraph API docs:
// https://help.aliyun.com/zh/document_detail/2996314.html
// https://help.aliyun.com/zh/document_detail/2996315.html
const result = details => ({ result: { accuracy: 85, overall: 84, fluency: { overall: 80 }, integrity: 95, details } });

test('official sentence phones and word flags survive normalization without invented IPA or substitutions', () => {
  const out = normalize(result([{ char: 'play', score: 42, dp_type: 2, is_pause: 1, start: 1580, end: 1820, dur: 240, accent: 'ea', phone: [
    { char: 'p', score: 0, pherr: 1, phid: '1', ph2alpha: 'p', start: 1580, end: 1640 },
    { char: 'ey', score: 89, pherr: 0, phid: '3_4', ph2alpha: 'ay', start: 1700, end: 1820 },
  ], privateCredential: 'not-public' }]), 'We play together.');
  assert.equal(out.words[0].error, 'Repetition');
  assert.deepEqual(out.words[0].providerEvidence, { dp_type: 2, is_pause: 1, start: 1580, end: 1820, dur: 240, accent: 'ea' });
  assert.deepEqual(out.words[0].phonemes[0], { phoneme: 'p', accuracy: 0, pherr: 1, phid: '1', ph2alpha: 'p', start: 1580, end: 1640 });
  assert.equal(out.words[0].phonemes[1].phoneme, 'ey');
  assert.equal(out.words[0].phonemes[1].ipa, undefined);
  assert.equal(out.words[0].phonemes[0].actualSound, undefined);
  assert.ok(!JSON.stringify(out).includes('not-public'));
});

test('paragraph flags keep omission, repetition, pause and dictionary limitation separate with no fabricated phones', () => {
  const out = normalize(result([{ snt_details: [
    { char: 'book', score: 0, dp_type: 1 },
    { char: 'read', score: 92, dp_type: 2 },
    { char: 'today', score: 90, is_pause: 1 },
    { char: 'Quenya', score: 0, fake_pron: 1 },
    { char: 'unknown', score: 80, dp_type: 99, is_pause: true, fake_pron: '1', phone: [{ char: 'x', score: 101, pherr: 7 }, { char: 'k', pherr: 1, start: 50, end: 40 }] },
  ] }]), 'I read a book today in Quenya, unknown.');
  assert.equal(out.words[0].error, 'Omission');
  assert.equal(out.words[1].error, 'Repetition');
  assert.deepEqual(out.words[2].providerEvidence, { is_pause: 1 });
  assert.deepEqual(out.words[3].providerEvidence, { fake_pron: 1 });
  assert.deepEqual(out.words[0].phonemes, []);
  assert.deepEqual(out.words[4].providerEvidence, {});
  assert.equal(out.words[4].phonemes[1].accuracy, null);
  assert.equal(out.words[4].phonemes[1].start, undefined);
  const problems = coach.problemEvidence(out, out.text, coach.DEFAULT_THRESHOLDS);
  const byWord = Object.fromEntries(problems.map(p => [p.quote, p]));
  assert.equal(byWord.book.error, 'Omission');
  assert.equal(byWord.read.error, 'Repetition');
  assert.equal(byWord.today.error, 'Pause');
  assert.equal(byWord.Quenya.error, 'OutOfDictionary');
  assert.equal(byWord.Quenya.dimension, 'reference');
  assert.ok(!byWord.Quenya.errors.includes('LowScore'));
  assert.deepEqual(byWord.today.phonemes, []);
});

test('a missing provider fluency stays pending without discarding actual word evidence', () => {
  const raw = result([{ char: 'book', score: 40, dp_type: 1 }]); raw.result.fluency = null;
  const out = normalize(raw, 'This is my book.');
  assert.equal(out.fluency, null); assert.equal(out.words[0].error, 'Omission');
  assert.equal(coach.judge(out).verdict, 'pending');
  assert.equal(coach.judge(out).pass, null);
});

test('coach retains measured phone detail but generic articulation guidance is explicitly teaching, not an acoustic finding', () => {
  const out = normalize(result([{ char: 'play', score: 92, phone: [{ char: 'p', score: 0, pherr: 1, phid: '1', ph2alpha: 'p', start: 0, end: 80 }] }]), 'We play together.');
  const store = createEvidenceStore(), evidenceId = store.add({ kind: 'pronunciation', provider: 'Alibaba oral assessment', scope: 'short_reading', reference: out.text, result: out, durationSeconds: 3 });
  const input = coach.prepare({ evidenceId, reference: out.text }, store);
  assert.equal(input.problems[0].error, 'PhonemeFlag');
  assert.equal(input.problems[0].phonemes[0].pherr, 1);
  assert.equal(input.judgement.pass, true); // Observations never rewrite numeric thresholds.
  const system = coach.messages(input)[0].content;
  for (const term of ['证据观察', '教学提示', '口型/舌位', '词重音', '不能直接当作IPA', '不是检测出该音错了', '不能改分']) assert.ok(system.includes(term), term);
  assert.ok(system.includes('直接进入该词的标准读法教学'));
  assert.ok(!system.includes('否则明确该词低分但具体音待回听验证'));
  assert.ok(!system.includes('简短说明不能定位具体错音'));
  const parsed = coach.parse(JSON.stringify({ summary: '本次指标达到门槛，音素检错标记供回听核对。', problems: [{ id: input.problems[0].id, explanation: '证据观察：p被标记。教学提示：双唇闭合后送出气流，是标准读法练习。', practice: '听示范，慢练，再放回原句重录。' }], nextStep: '回听并复录。', limitations: '教学提示不是已检测到的错音。' }), input);
  assert.deepEqual(parsed.problems[0].phonemes, input.problems[0].phonemes);
  assert.equal(parsed.problems[0].demonstrationText, 'play');
  assert.deepEqual(coach.problemEvidence({ words: [{ word: 'he', accuracy: 0, error: 'Omission' }] }, 'The book is here.', coach.DEFAULT_THRESHOLDS), []);
});

function wav() { const b = Buffer.alloc(32044); b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(32000, 40); return b.toString('base64'); }
test('HTTP requests sentence diagnostics only for the documented core and stores actual returned evidence', async t => {
  const requests = [], store = createEvidenceStore(), time = 1800000000000;
  const handler = createOralHandler({ now: () => time, evidenceStore: store, fetchImpl: async (url, options) => {
    if (url.endsWith('/auth/authorize')) return new Response(JSON.stringify({ code: 0, data: { warrant_id: 'fake-warrant-for-tests', expire_at: time / 1000 + 7200 } }));
    const request = JSON.parse(options.body.get('text')).start.param.request; requests.push(request);
    return new Response(JSON.stringify(result(request.coreType === 'en.sent.score' ? [{ char: 'play', score: 70, phone: [{ char: 'p', score: 40, pherr: 1 }] }] : [{ snt_details: [{ char: 'play', score: 70, dp_type: 2 }] }])));
  } });
  const server = http.createServer((req, res) => handler(req, res, req.url)); await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => { handler.close(); server.close(r); server.closeAllConnections(); }));
  const base = 'http://127.0.0.1:' + server.address().port;
  async function api(route, body) { const response = await fetch(base + '/api/oral/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); assert.equal(response.status, 200); return response.json(); }
  await api('configure', { appid: 'test-only', appSecret: 'fake-only-secret', clientIp: '203.0.113.4' });
  const a = await api('assess', { reference: 'We play together.', audio: wav() });
  const b = await api('assess', { reference: 'We play together.', audio: wav(), coreType: 'en.pred.score' });
  assert.equal(requests[0].outputPhones, 1); assert.equal(requests[0].phdet, 1);
  assert.equal(requests[1].outputPhones, undefined); assert.equal(requests[1].phdet, undefined);
  assert.equal(store.get(a.evidenceId).result.words[0].phonemes[0].pherr, 1);
  assert.equal(store.get(b.evidenceId).result.words[0].error, 'Repetition');
  assert.deepEqual(b.result.words[0].phonemes, []);
});
