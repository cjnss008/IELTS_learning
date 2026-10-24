'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'speaking-workbench.js'), 'utf8');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
async function settle() { for (let i = 0; i < 6; i++) await new Promise(setImmediate); }
function browser() {
  const elements = new Map(), events = new Map(), updates = [], requests = [], getWaits = new Map();
  class Element {
    constructor() { this.children = []; this.value = ''; this.textContent = ''; this.disabled = false; this.hidden = false; }
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children = items; }
    pause() { this.paused = true; }
    play() { return Promise.resolve(); }
  }
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const work = id => ({id, kind: 'audio', name: id, blob: new Blob(['original-' + id], {type: 'audio/webm'}), durationSeconds: 1, originalText: 'Original ' + id, prompt: 'Talk about ' + id, task: 'part1', level: 'A1', createdAt: '2026-10-24T00:00:00.000Z', evidenceId: 'evidence-' + id});
  const entries = new Map(['A', 'B'].map(id => [id, work(id)]));
  const library = {
    async list() { return [...entries.values()]; },
    async get(id) { if (getWaits.has(id)) await getWaits.get(id).promise; return entries.get(id); },
    async update(id, patch) { assert.ok(entries.has(id)); updates.push({id, patch}); const entry = {...entries.get(id), ...patch}; entries.set(id, entry); return entry; },
    base64() { return 'converted-original-audio'; }
  };
  const env = {get, entries, updates, requests, getWaits, queueOptions: null};
  const review = {
    async renderQueue(container, options) { env.queueOptions = options; },
    async save(payload, meta) { return {...payload, ...meta, id: 'text-A'}; },
    async submit() { return {feedback: 'AI feedback', result: {status: 'complete'}}; },
    format() { return 'Saved AI feedback'; }
  };
  class AudioContext {
    async decodeAudioData() { return {duration: 1}; }
    async close() {}
  }
  class OfflineAudioContext {
    createBufferSource() { return {connect() {}, start() {}}; }
    async startRendering() { return {getChannelData: () => new Float32Array(16000)}; }
  }
  let nextURL = 0;
  const context = {
    document: {getElementById: get, createElement: () => new Element()},
    location: {protocol: 'http:', hostname: '127.0.0.1'},
    URL: {createObjectURL: () => 'blob:test-' + (++nextURL), revokeObjectURL() {}},
    IELTSMediaLibrary: library, IELTSReview: review,
    IELTSSpeakingAudio: {formatTime: n => String(n), encodeWav: () => new Uint8Array(32044)},
    AudioContext, OfflineAudioContext, AbortController, Blob, setTimeout, clearTimeout, console,
    fetch: async (url, options) => { const pending = deferred(); requests.push({url, options, pending}); return pending.promise; },
    addEventListener(name, callback) { events.set(name, callback); }
  };
  context.window = context;
  vm.runInNewContext(source, context);
  env.click = id => get(id).onclick();
  env.dispatch = (name, detail) => events.get(name)?.({detail});
  env.event = (name, event) => events.get(name)?.(event);
  env.answer = (index = 0, result = {ok: true, text: 'Actual transcript of A'}) => requests[index].pending.resolve({ok: true, json: async () => result});
  return env;
}

test('a newly saved recording is deferred until an in-flight transcription is archived against its original work', async () => {
  const env = browser(); await settle();
  assert.equal(env.get('audioWorkSelect').value, 'A');
  const running = env.click('transcribeAudio'); await settle();
  assert.equal(env.requests[0].url, '/api/transcription/transcribe');
  env.dispatch('ielts:audio-ready', {id: 'B'}); await settle();
  assert.equal(env.get('audioWorkSelect').value, 'A');
  assert.equal(env.get('refreshAudioLibrary').disabled, true);
  assert.equal(env.get('editedTranscript').disabled, true);
  env.answer(); await running;
  assert.deepEqual(env.updates.map(item => item.id), ['A']);
  assert.equal(env.entries.get('A').transcript.text, 'Actual transcript of A');
  assert.equal(env.entries.get('B').transcript, undefined);
  assert.equal(env.get('audioWorkSelect').value, 'B');
  assert.equal(env.entries.get('A').blob.type, 'audio/webm');
});

test('a late selection load cannot replace the work once a request starts', async () => {
  const env = browser(); await settle();
  const wait = deferred(); env.getWaits.set('B', wait);
  env.get('audioWorkSelect').value = 'B';
  const loading = env.get('audioWorkSelect').onchange();
  const running = env.click('transcribeAudio'); await settle();
  wait.resolve(); await loading;
  assert.match(env.get('audioWorkInfo').textContent, /^A ·/);
  env.answer(); await running;
  assert.deepEqual(env.updates.map(item => item.id), ['A']);
  assert.equal(env.entries.get('B').transcript, undefined);
});

test('queue navigation during a request cannot replace the transcript or original audio', async () => {
  const env = browser(); await settle();
  const running = env.click('transcribeAudio'); await settle();
  await env.queueOptions.onLoad({id: 'text-B', parentId: 'B', originalText: 'Text of B', prompt: 'B prompt', task: 'part2', level: 'B1'});
  assert.equal(env.get('editedTranscript').value, 'Original A');
  assert.match(env.get('audioWorkInfo').textContent, /^A ·/);
  env.answer(); await running;
  assert.deepEqual(env.updates.map(item => item.id), ['A']);
});

test('cancelled requests that return late keep the original and remain pending', async () => {
  const env = browser(); await settle();
  const running = env.click('transcribeAudio'); await settle();
  env.click('cancelAudioWork');
  assert.equal(env.requests[0].options.signal.aborted, true);
  env.answer(); await running;
  assert.equal(env.entries.get('A').transcript, undefined);
  assert.equal(env.entries.get('A').queueStatus, 'pending');
  assert.match(env.get('audioWorkMessage').textContent, /已取消或超时/);
  assert.equal(env.get('transcribeAudio').disabled, false);
});

test('a profile switch aborts the request and refuses late result writes and further actions', async () => {
  const env = browser(); await settle();
  const running = env.click('speechAdvice'); await settle();
  env.dispatch('ielts:profile-changed');
  assert.equal(env.requests[0].options.signal.aborted, true);
  env.answer(0, {ok: true, feedback: 'Old profile advice'}); await running;
  assert.equal(env.updates.length, 0);
  assert.match(env.get('audioWorkMessage').textContent, /学习档案已切换/);
  assert.equal(env.get('audioWorkPlayback').paused, true);
  assert.equal(env.get('speechAdvice').disabled, true);
  await env.click('speechAdvice');
  assert.equal(env.requests.length, 1);
});

test('returning through browser history restores playback and workbench actions for the same profile', async () => {
  const env = browser(); await settle();
  const oldURL = env.get('audioWorkPlayback').src;
  env.event('pagehide', {});
  env.event('pageshow', {persisted: true}); await settle();
  assert.notEqual(env.get('audioWorkPlayback').src, oldURL);
  assert.equal(env.get('audioWorkSelect').value, 'A');
  assert.equal(env.get('transcribeAudio').disabled, false);
  const running = env.click('transcribeAudio'); await settle();
  env.answer(); await running;
  assert.equal(env.entries.get('A').transcript.text, 'Actual transcript of A');
});
