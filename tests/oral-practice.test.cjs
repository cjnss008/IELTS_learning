'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const client = require('../assets/oral-practice.js'), coach = require('../server/oral-coach.cjs');
const { createEvidenceStore } = require('../server/evidence.cjs');
const reference = 'This is my book. I study every day.';
const good = () => ({ text: reference, accuracy: 80, fluency: 75, completeness: 90, pronunciation: null, words: [], quality: { snr: null, tipId: null } });
const evidence = result => ({ kind: 'pronunciation', scope: 'short_reading', provider: 'Alibaba oral assessment', result, reference: result.text, durationSeconds: 3 });
const reply = result => ({ ok: true, json: async () => result });
const raw = () => new Blob(['original mic bytes'], { type: 'audio/webm' });
const prepared = async () => ({ audio: 'cmVhbC1hdWRpby1ieXRlcw==', durationSeconds: 3 });
function modelReply(input) { return JSON.stringify({ summary: '专业指标仅用于本次朗读。', problems: input.problems.map(p => ({ id: p.id, explanation: '该词分数低，具体发音须回听确认。', practice: '先听示范，慢读后正常读，再录音比较。' })), nextStep: '听示范后再读一次。', limitations: '自动指标会受录音设备和噪声影响，不是雅思Band。' }); }

test('oral thresholds require every professional dimension, without a fabricated overall or Band', () => {
  assert.deepEqual(client.DEFAULT_THRESHOLDS, { accuracy: 80, fluency: 75, completeness: 90 });
  assert.equal(client.judge(good()).pass, true);
  assert.equal(client.judge({ ...good(), pronunciation: 0 }).pass, true);
  for (const field of ['accuracy', 'fluency', 'completeness']) {
    assert.equal(client.judge({ ...good(), [field]: null, pronunciation: 100 }).pass, null);
    assert.equal(client.judge({ ...good(), [field]: '100' }).pass, null);
    assert.equal(client.judge({ ...good(), [field]: good()[field] - 0.1 }).pass, false);
  }
  assert.deepEqual(client.judge(good()), coach.judge(good()));
  assert.throws(() => client.requiredScores({ overall: 80 }));
  assert.throws(() => coach.thresholds({ accuracy: Infinity }));
});

test('reading segmentation retains all source words and caps every segment', () => {
  const source = Array.from({ length: 26 }, (_, i) => 'Sentence ' + i + ' contains several useful everyday words.').join('\n');
  const parts = client.splitReference(source, 20);
  assert.ok(parts.length > 1);
  assert.ok(parts.every(p => p.split(/\s+/).length <= 20));
  assert.equal(parts.join(' ').replace(/\s+/g, ' '), source.replace(/\s+/g, ' '));
  const long = Array(95).fill('word').join(' ') + '.';
  assert.deepEqual(client.splitReference(long, 30).map(p => p.split(/\s+/).length), [30, 30, 30, 5]);
});

test('AI coach accepts only current, matching Ali audio evidence and ignores client score claims', () => {
  const store = createEvidenceStore(), result = { ...good(), accuracy: 65, words: [{ word: 'book', accuracy: 45, error: 'Unknown', phonemes: [] }, { word: 'not-in-reference', accuracy: 0, error: 'Omission' }] }, id = store.add(evidence(result));
  const body = { evidenceId: id, reference, level: 'A0', materialId: 'w01-read-1' }, input = coach.prepare(body, store);
  assert.equal(input.professional.accuracy, 65); assert.equal(input.judgement.pass, false);
  assert.equal(input.problems.length, 1); assert.equal(input.problems[0].quote, 'book');
  assert.throws(() => coach.prepare({ ...body, result: good() }, store), { code: 'INVALID_ORAL_COACH' });
  assert.throws(() => coach.prepare({ ...body, reference: 'Different original.' }, store), { code: 'AUDIO_EVIDENCE_MISMATCH' });
  assert.throws(() => coach.prepare({ ...body, evidenceId: 'forged' }, store), { code: 'AUDIO_EVIDENCE_REQUIRED' });
  const fakeId = store.add({ ...evidence(result), provider: 'Browser transcription' });
  assert.throws(() => coach.prepare({ ...body, evidenceId: fakeId }, store), { code: 'AUDIO_EVIDENCE_REQUIRED' });
  const messages = coach.messages(input); assert.match(messages[0].content, /不能改分/); assert.equal(JSON.parse(messages[1].content).professional.accuracy, 65);
});

test('coach explanations remain tied to professional problem IDs and demo the original quote', () => {
  const store = createEvidenceStore(), id = store.add(evidence({ ...good(), fluency: 55 })), input = coach.prepare({ evidenceId: id, reference }, store);
  const model = JSON.parse(modelReply(input)); model.pass = true; model.accuracy = 100; model.problems[0].quote = 'invented'; model.problems[0].demonstrationText = 'invented';
  const parsed = coach.parse(JSON.stringify(model), input);
  assert.equal(parsed.pass, undefined); assert.equal(parsed.accuracy, undefined); assert.equal(parsed.problems[0].quote, reference); assert.equal(parsed.problems[0].demonstrationText, reference);
  model.problems[0].id = 'invented'; assert.throws(() => coach.parse(JSON.stringify(model), input), { code: 'ORAL_COACH_UNGROUNDED' });
  assert.throws(() => coach.parse(JSON.stringify({ ...model, problems: [] }), input), { code: 'ORAL_COACH_FORMAT' });
  const safe = JSON.parse(modelReply(input)); safe.summary = 'fake-secret <unsafe>'; assert.equal(coach.parse(JSON.stringify(safe), input, 'fake-secret').summary, '[已隐藏] ＜unsafe＞');
});

test('completed recording automatically submits original audio before asking AI to interpret its evidence', async () => {
  const calls = [], professionalCalls = [], proof = { ok: true, provider: 'Alibaba oral assessment', result: good(), evidenceId: 'proof-one' };
  const result = await client.assessRecording(raw(), { reference, prepareAudio: prepared, onProfessional: p => professionalCalls.push(p), fetch: async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null; calls.push({ url, body });
    if (url === '/api/oral/status') return reply({ configured: true });
    if (url === '/api/oral/assess') { assert.equal(body.audio, 'cmVhbC1hdWRpby1ieXRlcw=='); assert.equal(body.reference, reference); return reply(proof); }
    if (url === '/api/ai/status') return reply({ connected: true, model: 'test' });
    assert.equal(url, '/api/ai/oral-coach'); assert.equal(body.evidenceId, 'proof-one'); assert.equal(body.result, undefined); assert.equal(body.audio, undefined);
    return reply({ evidenceId: 'proof-one', feedbackFormat: 'oral-coach-v1', summary: '练习完成', problems: [], nextStep: '重读', limitations: '自动诊断' });
  } });
  assert.deepEqual(calls.map(c => c.url), ['/api/oral/status', '/api/oral/assess', '/api/ai/status', '/api/ai/oral-coach']);
  assert.equal(professionalCalls.length, 1); assert.equal(result.overallPass, true); assert.equal(result.status, 'complete');
});

test('unconfigured, incomplete, mismatched and unavailable services never turn pending audio into a pass', async () => {
  const inactive = [];
  await assert.rejects(client.assessRecording(raw(), { reference, prepareAudio: prepared, fetch: async url => { inactive.push(url); return reply({ configured: false }); } }), { code: 'ORAL_NOT_CONFIGURED' });
  assert.deepEqual(inactive, ['/api/oral/status']);
  for (const missing of [false, true]) {
    const result = await client.assessRecording(raw(), { reference, prepareAudio: prepared, fetch: async url => url === '/api/oral/status' ? reply({ configured: true }) : url === '/api/oral/assess' ? reply({ provider: 'Alibaba oral assessment', evidenceId: 'valid', result: missing ? { ...good(), completeness: null } : good() }) : url === '/api/ai/status' ? reply({ connected: false }) : assert.fail('AI request cannot run without configuration') });
    assert.equal(result.status, 'pending'); assert.equal(result.overallPass, false); assert.equal(result.professional.pass, missing ? null : true);
  }
  await assert.rejects(client.assessRecording(raw(), { reference, prepareAudio: prepared, fetch: async url => reply(url === '/api/oral/status' ? { configured: true } : { provider: 'Alibaba oral assessment', evidenceId: 'bad', result: { ...good(), text: 'wrong reference' } }) }), /不完整或与本段原文不一致/);
  await assert.rejects(client.assessRecording(new Blob(['text'], { type: 'text/plain' }), { reference }), /真实的原始音频/);
});

test('cancellation after professional response retains evidence and prevents the follow-up AI request', async () => {
  const aborter = new AbortController(), calls = [];
  await assert.rejects(client.assessRecording(raw(), { reference, prepareAudio: prepared, signal: aborter.signal, onProfessional: p => { assert.equal(p.evidenceId, 'real'); aborter.abort(); }, fetch: async url => { calls.push(url); return reply(url === '/api/oral/status' ? { configured: true } : { provider: 'Alibaba oral assessment', evidenceId: 'real', result: good() }); } }), { name: 'AbortError' });
  assert.deepEqual(calls, ['/api/oral/status', '/api/oral/assess']);
});

function browser() {
  const env = { events: new Map(), entries: new Map(), callbacks: [], requests: [], profile: 'legacy', withheld: null, urls: new Map(), nextId: 0 };
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.events = {}; this.dataset = {}; this.hidden = false; this.disabled = false; this.attrs = {}; this.value = ''; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(k, v) { this.attrs[k] = v; }
    removeAttribute(k) { delete this.attrs[k]; }
    addEventListener(k, fn) { this.events[k] = fn; }
    pause() { this.paused = true; } load() {}
    async play() { this.paused = false; env.demonstration = this.src; if (env.demoWithheld) await env.demoWithheld; }
  }
  const library = {
    async get(id) { return env.entries.get(id) || null; },
    async create(meta, blob) { const work = { ...meta, id: 'work-original-' + (++env.nextId), blob, name: meta.name, version: 1 }; env.entries.set(work.id, work); return work; },
    async update(id, patch) { const old = env.entries.get(id), value = { ...old, ...patch }; assert.equal(value.blob, old.blob); assert.equal(value.originalText, old.originalText); env.entries.set(id, value); return value; },
  };
  const context = { document: { createElement: tag => new Element(tag) }, Blob, AbortController, Date, Set, Map, Object, Math, Number, String, Array, JSON, encodeURIComponent, setTimeout, clearTimeout, setInterval, clearInterval, IELTSProfiles: { current: () => ({ id: env.profile }) }, IELTSMediaLibrary: library,
    URL: { createObjectURL: blob => { const url = 'blob:test-' + (++env.nextId); env.urls.set(url, blob); return url; }, revokeObjectURL: url => env.urls.delete(url) },
    CustomEvent: class { constructor(type, value) { this.type = type; this.detail = value.detail; } },
    dispatchEvent(event) { for (const fn of env.events.get(event.type) || []) fn(event); },
    addEventListener(type, fn) { if (!env.events.has(type)) env.events.set(type, new Set()); env.events.get(type).add(fn); },
    removeEventListener(type, fn) { env.events.get(type)?.delete(fn); },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/passage-format.js'), 'utf8'), context);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/oral-practice.js'), 'utf8'), context);
  env.host = new Element('div'); env.api = context.IELTSOralPractice; env.root = context; env.library = library;
  env.fetch = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null; env.requests.push({ url, body });
    if (url === '/api/oral/status') return reply({ configured: true });
    if (url === '/api/oral/assess') { if (env.withheld) await env.withheld; return reply({ provider: 'Alibaba oral assessment', evidenceId: 'real-proof-' + env.requests.length, result: { ...good(), ...(env.result || {}), text: body.reference } }); }
    if (url === '/api/ai/status') return reply({ connected: true, model: 'fake-test' });
    return reply({ evidenceId: body.evidenceId, feedbackFormat: 'oral-coach-v1', summary: '本次朗读说明', problems: [], nextStep: '再读', limitations: '自动指标' });
  };
  env.mount = extra => env.api.mount(env.host, { reference, materialId: 'w01-read-1', dayNumber: 1, fetch: env.fetch, library, prepareAudio: prepared, onResult: value => env.callbacks.push(value), ...extra });
  env.switchProfile = () => { env.profile = 'p-new-profile'; context.dispatchEvent(new context.CustomEvent('ielts:profile-changed', { detail: {} })); };
  return env;
}
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };

test('mount preserves original raw audio and source while publishing assessment media and evidence', async () => {
  const page = browser(), app = await page.mount();
  try {
    const blob = raw(); await app.submitRecording(blob, 3);
    assert.equal(page.entries.size, 1); const saved = [...page.entries.values()][0];
    assert.equal(saved.blob, blob); assert.equal(saved.originalText, reference); assert.equal(saved.prompt, reference);
    assert.equal(saved.queueStatus, 'reviewed'); assert.equal(page.callbacks.length, 1);
    assert.equal(page.callbacks[0].overallPass, true); assert.equal(page.callbacks[0].professionalContext.provider, 'ali'); assert.equal(page.callbacks[0].professionalContext.verified, true);
    assert.equal(page.callbacks[0].media.id, saved.id); assert.equal(page.callbacks[0].recordable.professional.accuracy, 80);
    await app.submitRecording(raw(), 4); assert.equal(page.entries.size, 2, 'rerecording must add a version and retain prior raw audio');
  } finally { app.destroy(); }
});

test('late cancelled evaluation cannot publish into another segment or a changed profile', async () => {
  const page = browser(); let release; page.withheld = new Promise(resolve => { release = resolve; });
  const app = await page.mount();
  try {
    const pending = app.submitRecording(raw(), 3); await flush(); assert.equal(page.entries.size, 1); app.cancel(); release(); await pending;
    assert.equal(page.callbacks.length, 0); assert.equal(page.requests.some(r => r.url === '/api/ai/status'), false); assert.equal(app.getState().overallPass, false);
    page.withheld = null; let releaseAgain; page.withheld = new Promise(resolve => { releaseAgain = resolve; });
    const next = app.submitRecording(raw(), 3); await flush(); page.switchProfile(); releaseAgain(); await next;
    assert.equal(page.callbacks.length, 0); assert.equal(app.getState().blocked, true); assert.equal(app.getState().overallPass, false); assert.equal(page.entries.size, 2);
  } finally { app.destroy(); }
});

test('every source segment must complete before the daily reading is marked passed', async () => {
  const page = browser(), source = Array(4).fill('This is a simple sentence with ten useful English words.').join(' '), app = await page.mount({ reference: source, maxWords: 20 });
  try {
    const select = page.host.children[0].children[3].children[0];
    assert.ok(app.getState().segmentCount > 1); await app.submitRecording(raw(), 3); assert.equal(app.getState().overallPass, false);
    for (let i = 1; i < app.getState().segmentCount; i++) { select.value = String(i); await select.events.change(); await app.submitRecording(raw(), 3); }
    assert.equal(app.getState().overallPass, true); assert.equal(page.callbacks.at(-1).allSegments.every(s => s.pass), true);
  } finally { app.destroy(); }
});

test('only professionally failed words or dimensions enter mistakes; pending dimensions stay pending', async () => {
  const page = browser(), captured = []; page.result = { accuracy: 60, words: [{ word: 'book', accuracy: 40, error: 'Unknown', phonemes: [] }] };
  const app = await page.mount({ onMistakes: (items, context) => captured.push({ items, context }) });
  try {
    await app.submitRecording(raw(), 3); assert.equal(captured.length, 1); assert.equal(captured[0].items[0].word, 'book'); assert.equal(captured[0].context.result.accuracy, 60); assert.equal(captured[0].context.reference, reference);
    assert.match(captured[0].items[0].questionId, /^oral:w01-read-1:segment-0:word-book$/); assert.equal(app.getState().overallPass, false);
    page.result = { fluency: null }; await app.submitRecording(raw(), 3); assert.equal(captured.length, 1); assert.equal(app.getState().overallPass, false);
  } finally { app.destroy(); }
});

test('native recorder stop automatically saves its unmodified blob and starts assessment; late permission is stopped after cancellation', async () => {
  const page = browser(), tracks = [], recorders = []; let now = 1000, permissionResolve;
  class Clock extends Date { static now() { return now; } }
  class Recorder {
    static isTypeSupported() { return true; }
    constructor(stream, config = {}) { this.stream = stream; this.mimeType = config.mimeType || 'audio/webm'; this.state = 'inactive'; recorders.push(this); }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: raw() }); this.pending = this.onstop?.(); }
  }
  page.root.Date = Clock; page.root.MediaRecorder = Recorder;
  page.root.navigator = { mediaDevices: { getUserMedia: async () => { const track = { stopped: false, stop() { this.stopped = true; } }; tracks.push(track); return { getTracks: () => [track] }; } } };
  const app = await page.mount();
  try {
    await app.start(); assert.equal(app.getState().phase, 'recording'); now += 3000; app.stop(); await recorders[0].pending;
    assert.equal(tracks[0].stopped, true); assert.equal(app.getState().overallPass, true); assert.equal(page.callbacks.length, 1);
    const saved = [...page.entries.values()][0]; assert.equal(await saved.blob.text(), await raw().text()); assert.equal(saved.durationSeconds, 3);
    page.root.navigator.mediaDevices.getUserMedia = async () => { await new Promise(resolve => { permissionResolve = resolve; }); const track = { stopped: false, stop() { this.stopped = true; } }; tracks.push(track); return { getTracks: () => [track] }; };
    const pending = app.start(); await flush(); app.cancel(); permissionResolve(); await pending;
    assert.equal(tracks[1].stopped, true); assert.equal(recorders.length, 1); assert.equal(page.callbacks.length, 1); assert.equal(app.getState().overallPass, false);
  } finally { app.destroy(); }
});

test('resume recovers scores and AI from matching local raw works, without replaying a saved pass as new server evidence', async () => {
  const page = browser(), first = await page.mount(); await first.submitRecording(raw(), 3);
  const id = first.getState().segments[0].workId, requests = page.requests.length; first.destroy();
  const states = [], resumed = await page.mount({ resumeState: { workIds: [id], segmentIndex: 0, pass: false, result: { accuracy: 0 } }, onState: state => states.push(state) });
  try {
    assert.equal(resumed.getState().overallPass, true); assert.equal(resumed.getState().segments[0].source, 'local-archive');
    assert.equal(page.requests.length, requests, 'restoring must not submit paid API requests'); assert.equal(page.callbacks.length, 1, 'archived evidence cannot be announced as a new result');
    assert.equal(states[0].segments[0].workId, id, 'initial state callback must not overwrite the saved IDs before restoration');
    assert.match(resumed.getState().message, /归档/);
  } finally { resumed.destroy(); }
});

test('resume never trusts draft pass fields, missing raw audio, changed material or a mismatched AI evidence ID', async () => {
  const page = browser(), first = await page.mount(); await first.submitRecording(raw(), 3); const id = first.getState().workId; first.destroy();
  const work = page.entries.get(id);
  for (const patch of [{ materialId: 'different-material' }, { dayNumber: 2 }, { originalText: 'Changed reference.' }, { blob: null }, { audioReview: { ...work.audioReview, evidenceId: 'different-evidence' } }, { diagnosis: { ...work.diagnosis, result: { ...work.diagnosis.result, fluency: null } } }]) {
    page.entries.set(id, { ...work, ...patch });
    const app = await page.mount({ resumeState: { workIds: [id], segmentIndex: 0, pass: true, overallPass: true, professional: good() } });
    assert.equal(app.getState().overallPass, false); app.destroy();
  }
  page.entries.set(id, work);
  const missing = await page.mount({ resumeState: { workIds: ['work-missing-original'], segmentIndex: 0, pass: true } });
  assert.equal(missing.getState().overallPass, false); missing.destroy();
});

test('resuming a partial archive retries professional audio assessment to obtain current evidence, rather than sending an expired ID only to AI', async () => {
  const page = browser(), first = await page.mount(); await first.submitRecording(raw(), 3); const id = first.getState().workId, work = page.entries.get(id); first.destroy();
  page.entries.set(id, { ...work, audioReview: { ...work.audioReview, evidenceId: 'stale' } });
  const before = page.requests.filter(r => r.url === '/api/oral/assess').length, app = await page.mount({ resumeState: { workIds: [id], segmentIndex: 0 } });
  try {
    assert.equal(app.getState().overallPass, false); await app.retry();
    assert.equal(page.requests.filter(r => r.url === '/api/oral/assess').length, before + 1); assert.equal(app.getState().overallPass, true);
    assert.equal(page.callbacks.at(-1).professionalContext.verified, true); assert.equal(page.callbacks.at(-1).professionalContext.archived, false);
  } finally { app.destroy(); }
});

test('one archived recording cannot be reused for several source segments and profile switching cancels a late archive read', async () => {
  const page = browser(), source = Array(4).fill('This is a simple sentence with ten useful English words.').join(' '), first = await page.mount({ reference: source, maxWords: 20 });
  await first.submitRecording(raw(), 3); const id = first.getState().workId, count = first.getState().segmentCount; first.destroy();
  const duplicated = await page.mount({ reference: source, maxWords: 20, resumeState: { workIds: Array(count).fill(id), segmentIndex: 0 } });
  assert.equal(duplicated.getState().overallPass, false); assert.ok(duplicated.getState().segments.every(s => !s.workId)); duplicated.destroy();
  let release; const oldGet = page.library.get; page.library.get = async key => { await new Promise(resolve => { release = resolve; }); return oldGet(key); };
  const mounting = page.mount({ reference: source, maxWords: 20, resumeState: { workIds: [id, ...Array(count - 1).fill('')], segmentIndex: 0 } });
  await flush(); page.switchProfile(); release(); const app = await mounting;
  try { assert.equal(app.getState().blocked, true); assert.equal(app.getState().overallPass, false); assert.equal(page.callbacks.length, 1); } finally { app.destroy(); }
});

test('local exact-reference demonstrations work without browser voices and word examples reuse local vocabulary audio', async () => {
  const page = browser(); page.root.IELTSOralModelAudio = { get: value => value === reference ? { reference, src: 'audio/oral-models/exact.mp3' } : null };
  page.root.IELTSVocabularyAudio = { items: { book: { audio: 'audio/vocabulary/book-exact.mp3' } } };
  const app = await page.mount();
  try {
    await app.demonstrate(reference); assert.equal(page.demonstration, 'audio/oral-models/exact.mp3'); assert.match(app.getState().message, /本地英文合成示范/);
    await app.demonstrate('book'); assert.equal(page.demonstration, 'audio/vocabulary/book-exact.mp3');
    await app.demonstrate('study'); assert.equal(page.demonstration, 'audio/oral-models/exact.mp3'); assert.match(app.getState().message, /整段/);
  } finally { app.destroy(); }
});

test('model audio never fetches an external source or plays a mismatched reference as the requested segment', async () => {
  const page = browser(), app = await page.mount({ modelAudio: () => ({ reference, src: 'https://foreign.example/audio.mp3' }) });
  try { await app.demonstrate(reference); assert.equal(page.demonstration, undefined); assert.match(app.getState().message, /路径无效/); } finally { app.destroy(); }
  const wrong = await page.mount({ modelAudio: () => ({ reference: 'different source', src: 'audio/oral-models/wrong.mp3' }) });
  try { await wrong.demonstrate(reference); assert.equal(page.demonstration, undefined); assert.match(wrong.getState().message, /没有英文合成示范能力/); } finally { wrong.destroy(); }
});

test('model stage completion records full professional evidence plus matching AI feedback even when scores require practice', async () => {
  const page=browser();page.result={accuracy:60,words:[{word:'book',accuracy:45,error:'Unknown',phonemes:[]}]};const app=await page.mount({onMistakes:()=>{}});
  try {assert.equal(app.getState().modelComplete,false);await app.submitRecording(raw(),3);const state=app.getState(),out=page.callbacks.at(-1);assert.equal(state.overallPass,false);assert.equal(state.modelComplete,true);assert.equal(out.modelComplete,true);assert.equal(out.recordable.modelComplete,true);assert.deepEqual(JSON.parse(JSON.stringify(state.segments[0].coach)),{feedbackFormat:'oral-coach-v1',evidenceId:state.segments[0].evidenceId});assert.equal(out.allSegments[0].professional.result.accuracy,60);
    page.result={accuracy:80,fluency:null};await app.submitRecording(raw(),3);assert.equal(app.getState().modelComplete,false);assert.equal(page.callbacks.at(-1).modelComplete,false);
  }finally{app.destroy();}
});
