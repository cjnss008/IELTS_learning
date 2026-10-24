'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { checkWav, normalizeResult, createSpeechHandler } = require('../server/speech.cjs');

const FAKE_KEY = 'FAKEVOICEKEY1234567890123456789012';
function wav(seconds = 1) {
  const size = Math.round(seconds * 16000) * 2;
  const b = Buffer.alloc(44 + size);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(size, 40);
  return b;
}
function sample() {
  return { RecognitionStatus: 'Success', NBest: [{ Display: 'Hello world.',
    PronunciationAssessment: { AccuracyScore: 85, FluencyScore: 72, CompletenessScore: 90, PronScore: 80 },
    Words: [{ Word: 'Hello', PronunciationAssessment: { AccuracyScore: 82, ErrorType: 'None' },
      Phonemes: [{ Phoneme: 'h', PronunciationAssessment: { AccuracyScore: 75 } }] }] }] };
}
test('WAV parser rejects malformed headers, unsupported formats and unsafe duration', () => {
  assert.equal(checkWav(wav(1)), 1);
  assert.equal(checkWav(wav(30)), 30);
  for (const value of [Buffer.from('not wav'), wav(0.09), wav(30.01), wav().subarray(0, 100)]) assert.throws(() => checkWav(value));
  for (const [offset, value, width] of [[4, 12, 32], [20, 3, 16], [22, 2, 16], [24, 44100, 32], [28, 123, 32], [32, 1, 16], [34, 8, 16], [40, 999999, 32]]) {
    const b = wav(); width === 32 ? b.writeUInt32LE(value, offset) : b.writeUInt16LE(value, offset);
    assert.throws(() => checkWav(b), String(offset));
  }
});
test('speech normalization requires a successful scored result and preserves missing scores as null', () => {
  assert.throws(() => normalizeResult({ RecognitionStatus: 'NoMatch' }));
  assert.throws(() => normalizeResult({ RecognitionStatus: 'Success', NBest: [{}] }));
  const body = sample(); body.NBest[0].PronunciationAssessment.FluencyScore = 101;
  body.NBest[0].Words[0].PronunciationAssessment.ErrorType = 'arbitrary';
  const result = normalizeResult(body);
  assert.equal(result.accuracy, 85); assert.equal(result.fluency, null);
  assert.equal(result.words[0].error, 'Unknown'); assert.equal(result.words[0].phonemes[0].accuracy, 75);
});
test('speech REST adapter validates inputs, protects credentials, and supports cancellation', async t => {
  let mode = 'normal', captured, started, aborted = () => {}, release;
  const fakeFetch = async (url, options) => {
    captured = { url, options };
    if (mode === 'failure') return new Response('private ' + FAKE_KEY, { status: 401 });
    if (mode === 'empty') return new Response(JSON.stringify({ RecognitionStatus: 'NoMatch' }));
    if (mode === 'missing-score') return new Response(JSON.stringify({ RecognitionStatus: 'Success', NBest: [{}] }));
    if (mode === 'throw') throw new Error('Diagnostic ' + FAKE_KEY);
    if (mode === 'slow') {
      started();
      await new Promise((resolve, reject) => { release = resolve; options.signal.addEventListener('abort', () => { aborted(); reject(new Error(FAKE_KEY)); }, { once: true }); });
    }
    const result = sample(); result.NBest[0].Display += FAKE_KEY;
    result.NBest[0].Words[0].Word = FAKE_KEY;
    return new Response(JSON.stringify(result));
  };
  const handler = createSpeechHandler({ fetchImpl: fakeFetch, timeoutMs: 150 });
  const server = http.createServer(async (req, res) => { if (!await handler(req, res, req.url)) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  t.after(() => new Promise(resolve => { handler.close(); server.close(resolve); server.closeAllConnections(); }));
  async function request(route, body, method = body ? 'POST' : 'GET', signal) {
    const res = await fetch(base + '/api/speech/' + route, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal });
    return { status: res.status, body: await res.json() };
  }
  const configure = { endpoint: 'https://example.cognitiveservices.azure.com', apiKey: FAKE_KEY };
  const assess = { reference: 'Hello world.', audio: wav().toString('base64') };
  assert.equal((await request('status')).body.configured, false);
  assert.equal((await request('assess', assess)).status, 409);
  for (const endpoint of ['http://example.cognitiveservices.azure.com', 'https://example.com', 'https://example.cognitiveservices.azure.com/extra',
    'https://example.cognitiveservices.azure.com?key=x', 'https://x@example.cognitiveservices.azure.com', 'https://example.cognitiveservices.azure.com.evil.example']) {
    assert.equal((await request('configure', { ...configure, endpoint })).status, 400);
  }
  assert.equal((await request('configure', { ...configure, apiKey: 'short' })).status, 400);
  const status = await request('configure', configure);
  assert.equal(status.status, 200); assert.equal(status.body.configured, true); assert.equal(status.body.verified, false);
  assert.ok(!JSON.stringify(status).includes(FAKE_KEY));
  for (const value of [{ ...assess, reference: '' }, { ...assess, reference: 'word '.repeat(81) }, { ...assess, audio: 'invalid' },
    { ...assess, audio: wav(30.01).toString('base64') }, { ...assess, audio: 'a'.repeat(1400001) }]) assert.equal((await request('assess', value)).status, 400);
  const valid = await request('assess', assess);
  assert.equal(valid.status, 200); assert.equal(valid.body.result.accuracy, 85);
  assert.ok(!JSON.stringify(valid).includes(FAKE_KEY));
  assert.equal(captured.options.redirect, 'error');
  assert.equal(captured.options.headers['Ocp-Apim-Subscription-Key'], FAKE_KEY);
  assert.match(captured.options.headers['Content-Type'], /samplerate=16000/);
  const header = JSON.parse(Buffer.from(captured.options.headers['Pronunciation-Assessment'], 'base64'));
  assert.equal(header.ReferenceText, assess.reference); assert.equal(header.Granularity, 'Phoneme');
  assert.equal(header.GradingSystem, 'HundredMark'); assert.match(captured.url, /language=en-GB/);
  for (const errorMode of ['failure', 'empty', 'missing-score', 'throw']) {
    mode = errorMode; const failed = await request('assess', assess);
    assert.notEqual(failed.status, 200); assert.ok(!JSON.stringify(failed).includes(FAKE_KEY));
  }
  mode = 'slow';
  let entered = new Promise(resolve => { started = resolve; });
  const pending = request('assess', assess); await entered;
  assert.equal((await request('assess', assess)).status, 429);
  release(); assert.equal((await pending).status, 200);
  entered = new Promise(resolve => { started = resolve; });
  const timedOut = request('assess', assess); await entered;
  assert.notEqual((await timedOut).status, 200);
  entered = new Promise(resolve => { started = resolve; });
  let cancelled = new Promise(resolve => { aborted = resolve; });
  const pendingDisconnect = request('assess', assess); await entered;
  await request('connection', undefined, 'DELETE'); await cancelled;
  assert.notEqual((await pendingDisconnect).status, 200);
  assert.equal((await request('status')).body.configured, false);
  await request('configure', configure);
  entered = new Promise(resolve => { started = resolve; });
  cancelled = new Promise(resolve => { aborted = resolve; });
  const client = new AbortController();
  const pendingClient = request('assess', assess, 'POST', client.signal); await entered;
  client.abort(); await assert.rejects(pendingClient, { name: 'AbortError' }); await cancelled;
  mode = 'normal';
  assert.equal((await request('assess', assess)).status, 200);
  handler.close(); assert.equal((await request('status')).body.configured, false);
});
