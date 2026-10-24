'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const audio = require('../assets/speaking-audio.js');
const { checkWav } = require('../server/speech.cjs');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'assets', 'speaking-app.js'), 'utf8');

test('mode limits and mm:ss clock separate short reading from free speaking', () => {
  assert.deepEqual(audio.limitsFor('reading'), { recordSeconds: 25, importSeconds: 30 });
  assert.deepEqual(audio.limitsFor('free'), { recordSeconds: 180, importSeconds: 180 });
  assert.equal(audio.validDuration(30, 'reading'), true);
  assert.equal(audio.validDuration(30.01, 'reading'), false);
  assert.equal(audio.validDuration(180, 'free'), true);
  for (const duration of [180.01, Infinity, NaN, -1, 0]) assert.equal(audio.validDuration(duration, 'free'), false);
  assert.equal(audio.formatTime(7), '00:07'); assert.equal(audio.formatTime(125.8), '02:05'); assert.equal(audio.formatTime(180), '03:00');
});

test('browser WAV encoder produces valid 16kHz mono PCM and clips sample peaks', () => {
  const samples = new Float32Array(16000);
  samples.set([-2, -1, -0.5, 0, 0.5, 1, 2, NaN]);
  const bytes = Buffer.from(audio.encodeWav(samples));
  assert.equal(checkWav(bytes), 1);
  assert.equal(bytes.readUInt32LE(24), 16000); assert.equal(bytes.readUInt16LE(22), 1);
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => bytes.readInt16LE(44 + 2 * i)), [-32768, -32768, -16384, 0, 16383, 32767, 32767, 0]);
  const long = Buffer.from(audio.encodeWav(new Float32Array(180 * 16000)));
  assert.equal(long.readUInt32LE(4) + 8, long.length);
  assert.equal(long.readUInt32LE(40) / 32000, 180);
  assert.throws(() => checkWav(long), 'the Azure short-audio endpoint must still reject long free recordings');
  assert.throws(() => audio.encodeWav(new Float32Array(180 * 16000 + 1)));
});

function browser(options = {}) {
  const env = { now: 0, decodeDuration: 1, metadataHeld: false, stopHeld: false, permissionHeld: false, elements: new Map(), timers: new Map(), urls: new Map(), revoked: [], requests: [], streams: [], recorders: [], contexts: [], stopEvents: [], permissionResolvers: [], nextId: 1, ...options };
  class Element {
    constructor(tag = 'div', probe = false) { this.tag = tag; this.probe = probe; this.children = []; this.dataset = {}; this.events = {}; this.attrs = {}; this._value = ''; this.textContent = ''; this.hidden = false; this.disabled = false; this._src = ''; }
    get value() { return this.tag === 'select' && !this._value ? this.children[0]?.value || '' : this._value; }
    set value(v) { this._value = String(v); }
    get src() { return this._src; }
    set src(v) { this._src = v; if (this.probe && !env.metadataHeld) queueMicrotask(() => { this.duration = env.urls.get(v)?.duration ?? env.decodeDuration; this.onloadedmetadata?.(); }); }
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children = items; if (this.tag === 'select') this._value = ''; }
    addEventListener(name, handler) { this.events[name] = handler; }
    setAttribute(name, value) { this.attrs[name] = value; }
    removeAttribute(name) { delete this.attrs[name]; if (name === 'src') this._src = ''; }
    pause() {}
    load() {}
  }
  const selectIds = ['speakingMode', 'speakingLesson', 'speakingSentence', 'speakingPart'];
  function get(id) { if (!env.elements.has(id)) env.elements.set(id, new Element(selectIds.includes(id) ? 'select' : 'div')); return env.elements.get(id); }
  get('speakingMode').value = 'reading'; get('speakingPart').value = 'part1';
  function timer(fn, ms, type) { const id = env.nextId++; env.timers.set(id, { fn, ms, type }); return id; }
  class Recorder {
    static isTypeSupported() { return true; }
    constructor(stream, config) { this.stream = stream; this.mimeType = config.mimeType || 'audio/webm'; this.state = 'inactive'; env.recorders.push(this); }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      const run = async () => { this.ondataavailable?.({ data: new Blob(['fake audio']) }); await this.onstop?.(); };
      if (env.stopHeld) env.stopEvents.push(run); else queueMicrotask(run);
    }
  }
  class AudioContext {
    constructor() { this.closed = false; env.contexts.push(this); }
    async decodeAudioData() { return { duration: env.decodeDuration }; }
    async close() { this.closed = true; }
  }
  class OfflineContext {
    constructor(channels, frames, rate) { this.frames = frames; assert.equal(channels, 1); assert.equal(rate, 16000); }
    createBufferSource() { return { connect() {}, start() {} }; }
    async startRendering() { return { getChannelData: () => new Float32Array(this.frames) }; }
  }
  const windowEvents = {};
  class MockDate extends Date { static now() { return env.now; } }
  const context = {
    document: { getElementById: get, createElement: tag => new Element(tag, tag === 'audio') },
    IELTSCourse: { lessons: [{ day: 1, cn: '测试课', text: 'This is a short reading sentence. Another sentence follows.' }] },
    IELTSSpeakingAudio: audio, location: { protocol: 'http:', hostname: '127.0.0.1', search: '?day=1' },
    isSecureContext: true, AudioContext, OfflineAudioContext: OfflineContext, MediaRecorder: Recorder,
    navigator: { mediaDevices: { getUserMedia: async () => {
      const track = { stopped: false, stop() { this.stopped = true; } };
      const stream = { track, getTracks: () => [track] }; env.streams.push(stream);
      if (env.permissionHeld) await new Promise(resolve => env.permissionResolvers.push(resolve));
      return stream;
    } } },
    URL: { createObjectURL: blob => { const url = 'blob:test-' + env.nextId++; env.urls.set(url, blob); return url; }, revokeObjectURL: url => { env.revoked.push(url); env.urls.delete(url); } },
    URLSearchParams, Blob, Uint8Array, Float32Array, ArrayBuffer, DataView, Intl, Date: MockDate, AbortController, AbortSignal,
    btoa: str => Buffer.from(str, 'binary').toString('base64'),
    setTimeout: (fn, ms) => timer(fn, ms, 'timeout'), clearTimeout: id => env.timers.delete(id),
    setInterval: (fn, ms) => timer(fn, ms, 'interval'), clearInterval: id => env.timers.delete(id),
    addEventListener: (name, fn) => { windowEvents[name] = fn; },
    fetch: async (url, options) => { env.requests.push({ url, options }); return { ok: true, json: async () => ({ ok: true, configured: true, endpoint: 'https://example.cognitiveservices.azure.com', verified: false }) }; },
  };
  context.window = context;
  vm.runInNewContext(appSource, context, { filename: 'speaking-app.js' });
  return Object.assign(env, {
    get, fire: (id, event, args = {}) => get(id).events[event]?.(args),
    async switchMode(mode) { get('speakingMode').value = mode; await get('speakingMode').events.change(); },
    runTimeout(ms) { const match = [...env.timers].find(([, value]) => value.type === 'timeout' && value.ms === ms); assert.ok(match, 'timer ' + ms + ' exists'); env.timers.delete(match[0]); match[1].fn(); },
    tick(now) { env.now = now; for (const value of env.timers.values()) if (value.type === 'interval') value.fn(); },
    hasTimeout: ms => [...env.timers.values()].some(value => value.type === 'timeout' && value.ms === ms),
    async import(seconds) { const file = new Blob(['audio']); file.duration = seconds; await get('audioImport').events.change({ target: { files: [file], value: 'file' } }); },
    pagehide: () => windowEvents.pagehide(),
  });
}
async function flush() { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); }

test('recording timers follow mode; free audio cannot call the assessment API', async () => {
  const page = browser({ decodeDuration: 25 }); await flush();
  await page.fire('recordStart', 'click');
  assert.equal(page.hasTimeout(25000), true); assert.equal(page.hasTimeout(180000), false);
  page.tick(25000); assert.equal(page.get('recordClock').textContent, '00:25');
  page.runTimeout(25000); await flush();
  assert.equal(page.streams[0].track.stopped, true); assert.equal(page.get('playbackSection').hidden, false);
  const previousUrl = page.get('recordPlayback').src;
  await page.switchMode('free');
  assert.ok(page.revoked.includes(previousUrl)); assert.equal(page.get('playbackSection').hidden, true);
  page.get('referenceText').value = ''; await page.fire('referenceText', 'input');
  assert.equal(page.get('referenceInvalid').hidden, true);
  assert.equal(page.get('recordStart').disabled, false);
  page.decodeDuration = 180.25; // The browser may deliver the automatic-stop callback slightly late.
  await page.fire('recordStart', 'click');
  assert.equal(page.hasTimeout(180000), true);
  page.tick(150000); assert.equal(page.get('recordClock').textContent, '02:05');
  page.tick(205000); assert.equal(page.get('recordClock').textContent, '03:00');
  page.runTimeout(180000); await flush();
  assert.equal(page.streams[1].track.stopped, true);
  assert.match(page.get('audioInfo').textContent, /03:00/);
  const freeWav = Buffer.from(await page.urls.get(page.get('recordPlayback').src).arrayBuffer());
  assert.equal(freeWav.readUInt32LE(40) / 32000, 180);
  assert.equal(page.get('assessSpeech').disabled, true);
  await page.fire('assessSpeech', 'click');
  assert.equal(page.requests.filter(item => item.url.endsWith('/assess')).length, 0);
  await page.switchMode('reading');
  assert.equal(page.get('referenceInvalid').hidden, false);
  assert.equal(page.get('recordStart').disabled, true);
  assert.equal(page.get('audioImport').disabled, true);
  page.pagehide();
});

test('imports allow 180 seconds only in free mode and keep the 30-second reading boundary', async () => {
  const page = browser({ decodeDuration: 120 }); await flush();
  await page.import(120); assert.match(page.get('recordMessage').textContent, /30 秒/);
  assert.equal(page.get('playbackSection').hidden, true);
  await page.switchMode('free'); await page.import(120);
  assert.equal(page.get('playbackSection').hidden, false);
  assert.match(page.get('audioInfo').textContent, /02:00/);
  await page.import(181); assert.match(page.get('recordMessage').textContent, /180 秒/);
  assert.equal(page.get('playbackSection').hidden, true);
  await page.switchMode('reading'); page.decodeDuration = 30; await page.import(30);
  assert.equal(page.get('playbackSection').hidden, false);
  assert.match(page.get('audioInfo').textContent, /00:30/);
  page.pagehide();
});

test('switching stops active tracks and timers; delayed old callbacks cannot stop a new capture', async () => {
  const page = browser({ stopHeld: true }); await flush();
  await page.fire('recordStart', 'click');
  await page.switchMode('free');
  assert.equal(page.streams[0].track.stopped, true);
  assert.equal(page.hasTimeout(25000), false);
  assert.equal(page.get('recordClock').textContent, '00:00');
  await page.fire('recordStart', 'click');
  await page.stopEvents.shift()();
  assert.equal(page.streams[1].track.stopped, false);
  assert.equal(page.recorders[1].state, 'recording');
  assert.equal(page.hasTimeout(180000), true);
  page.pagehide();
  assert.equal(page.streams[1].track.stopped, true); assert.equal(page.timers.size, 0);
});

test('switching cancels pending microphone permission and releases imported metadata URLs', async () => {
  const page = browser({ permissionHeld: true }); await flush();
  const pending = page.fire('recordStart', 'click'); await flush();
  await page.switchMode('free'); page.permissionResolvers.shift()(); await pending;
  assert.equal(page.streams[0].track.stopped, true); assert.equal(page.recorders.length, 0);
  assert.equal(page.get('recordStart').disabled, false);
  page.metadataHeld = true;
  const imported = page.import(60); await flush();
  const probeUrl = [...page.urls.keys()][0]; assert.ok(probeUrl);
  await page.switchMode('reading'); await imported;
  assert.ok(page.revoked.includes(probeUrl)); assert.equal(page.urls.size, 0);
  assert.equal(page.hasTimeout(7000), false);
  assert.equal(page.get('playbackSection').hidden, true);
  page.pagehide();
});
