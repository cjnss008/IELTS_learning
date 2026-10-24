'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const S = require('../assets/selection-ai.js');
const html = fs.readFileSync(path.join(__dirname, '..', '开始学习.html'), 'utf8');
const lessons = JSON.parse(html.match(/^const LESSONS=(.+);\r?$/m)[1]);
const gapLine = html.split(/\r?\n/).find(line => line.startsWith('const GAPDATA='));
const gapContext = {}; vm.runInNewContext(gapLine.replace('const GAPDATA=', 'globalThis.groups='), gapContext);
const version = 'a'.repeat(64);
const fixtureData = {lesson: {day: 1, title: 'A lesson', text: 'Mia likes reading. She has two books.'}, groups: [{index: 0, text: 'A lesson'}, {index: 1, text: 'Mia likes reading.'}, {index: 2, text: 'She has two books.'}]};
const snapshot = S.makeSnapshot(fixtureData, 1, 4, 9);
const status = {connected: true, baseUrl: 'https://example.test/v1', model: 'study-model', connectionVersion: 'process-a:1', selectionPromptVersion: 'selection-a0-detail-v2'};
function storage(initial = null) {
  let raw = initial;
  return {writes: 0, getItem() { return raw; }, setItem(key, value) { this.writes++; raw = value; }, value() { return raw; }};
}
function response(value, ok = true) { return {ok, json: async () => value}; }
function resultFor(selected = snapshot, remaining = 2) {
  return {ok: true, promptVersion: status.selectionPromptVersion, feedback: 'likes 是 like 的第三人称单数形式。这里说 Mia 喜欢阅读。', feedbackFormat: 'text', model: status.model, threadId: 'thread-a', followupsRemaining: remaining, selection: {lessonId: selected.lessonId, version, start: selected.start, end: selected.end, text: selected.text, context: selected.context}};
}
function setup(overrides = {}) {
  const calls = [], saved = overrides.storage || storage(); let connection = {...status}; let answer = resultFor();
  const fetch = async (url, options) => {
    calls.push({url, options, body: options.body ? JSON.parse(options.body) : null});
    if (overrides.fetch) return overrides.fetch(url, options, calls);
    if (url === '/api/ai/status') return response(connection);
    if (url.startsWith('/api/ai/selection/lesson/')) return response({ok: true, lesson: {id: 1, text: fixtureData.lesson.text, version, promptVersion: status.selectionPromptVersion, sentences: []}});
    return response(answer);
  };
  const controller = S.createController({origin: S.LOCAL_ORIGIN, fetch, storage: saved, ...overrides, fetch});
  controller.setLesson(fixtureData);
  return {controller, calls, storage: saved, setStatus(value) { connection = value; }, setResult(value) { answer = value; }};
}
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }

test('all 52 lessons map rendered paragraph text back to exact canonical UTF-16 offsets', () => {
  for (const lesson of lessons) {
    const data = {lesson, groups: gapContext.groups[lesson.day].groups};
    const ranges = S.paragraphRanges(data);
    assert.equal(ranges.length, data.groups.length - 1, String(lesson.day));
    for (const range of ranges) {
      assert.equal(lesson.text.slice(range.start, range.end), range.text);
      const word = range.text.match(/[A-Za-z]+/)[0]; const start = range.text.indexOf(word);
      const selected = S.makeSnapshot(data, range.index, start, start + word.length);
      assert.equal(selected.text, word); assert.equal(S.matches(selected, data), true);
    }
  }
});

test('selection bounds reject titles, punctuation, negative/oversized input and trim only edge whitespace', () => {
  assert.equal(snapshot.text, 'likes'); assert.equal(snapshot.start, 4); assert.equal(snapshot.end, 9);
  assert.equal(S.makeSnapshot(fixtureData, 0, 0, 1), null);
  assert.equal(S.makeSnapshot(fixtureData, 1, -1, 3), null);
  assert.equal(S.makeSnapshot(fixtureData, 1, 2, 900), null);
  assert.equal(S.makeSnapshot(fixtureData, 1, 17, 18), null);
  const trimmed = S.makeSnapshot(fixtureData, 1, 3, 10); assert.equal(trimmed.text, 'likes'); assert.equal(trimmed.start, 4);
  const long = {lesson: {day: 1, title: 'Long', text: 'a'.repeat(801)}, groups: [{index: 1, text: 'a'.repeat(801)}]};
  assert.equal(S.makeSnapshot(long, 1, 0, 801), null);
  assert.equal(S.matches({...snapshot, text: 'other'}, fixtureData), false);
});

test('DOM capture requires one range entirely in a marked current lesson paragraph', () => {
  const host = {};
  const paragraph = {dataset: {aiParagraph: '1'}, textContent: 'Mia likes reading.', closest(selector) { return selector === '#lesson' ? host : null; }};
  const span = {nodeType: 1, isContentEditable: false, closest(selector) { return selector === '[data-ai-reading]' ? paragraph : null; }};
  const text = {nodeType: 3, parentElement: span};
  const range = {startContainer: text, endContainer: text, startOffset: 4, endOffset: 9, toString: () => 'likes', cloneRange: () => ({selectNodeContents() {}, setEnd() {}, toString: () => 'Mia '}), getBoundingClientRect: () => ({left: 10, right: 50, top: 10, bottom: 30})};
  const selection = {isCollapsed: false, rangeCount: 1, getRangeAt: () => range};
  assert.equal(S.captureSelection(selection, fixtureData).text, 'likes');
  assert.equal(S.captureSelection({...selection, rangeCount: 2}, fixtureData), null);
  assert.equal(S.captureSelection({...selection, isCollapsed: true}, fixtureData), null);
  span.isContentEditable = true; assert.equal(S.captureSelection(selection, fixtureData), null); span.isContentEditable = false;
  const different = {...span, closest: () => ({})}; range.endContainer = {nodeType: 3, parentElement: different};
  assert.equal(S.captureSelection(selection, fixtureData), null); range.endContainer = text;
  paragraph.textContent = 'Other lesson'; assert.equal(S.captureSelection(selection, fixtureData), null);
});

test('first explanation validates course/status and sends only same-origin A0 selection fields', async () => {
  const ctx = setup(); assert.equal(await ctx.controller.explain(snapshot), true);
  const state = ctx.controller.getState(); assert.equal(state.phase, 'done'); assert.equal(state.remaining, 2);
  assert.equal(ctx.calls.length, 3);
  assert.deepEqual(ctx.calls[2].body, {lessonId: 1, version, start: 4, end: 9, selectedText: 'likes', intent: 'both', level: 'A0'});
  for (const call of ctx.calls) { assert.ok(call.url.startsWith('/api/')); assert.equal(call.options.credentials, 'same-origin'); assert.equal(call.options.redirect, 'error'); }
  assert.equal(ctx.storage.writes, 1);
  const cached = S.parseCache(ctx.storage.value()); assert.equal(cached.entries.length, 1);
  assert.equal(cached.entries[0].threadId, undefined); assert.equal(cached.entries[0].apiKey, undefined);
});

test('same selection uses temporary cache but changed model/connection/version keys cannot collide', async () => {
  const ctx = setup(); await ctx.controller.explain(snapshot); await ctx.controller.explain(snapshot);
  assert.equal(ctx.calls.filter(call => call.body).length, 1); assert.equal(ctx.controller.getState().cacheHit, true);
  assert.equal(ctx.controller.getState().threadId, ''); assert.equal(ctx.controller.followup('为什么？'), false);
  ctx.setStatus({...status, connectionVersion: 'process-a:2'}); await ctx.controller.explain(snapshot);
  assert.equal(ctx.calls.filter(call => call.body).length, 2);
  assert.notEqual(S.cacheKey(snapshot, version, status), S.cacheKey(snapshot, 'b'.repeat(64), status));
  assert.notEqual(S.cacheKey(snapshot, version, status), S.cacheKey(snapshot, version, {...status, model: 'another'}));
  assert.notEqual(S.cacheKey(snapshot, version, status), S.cacheKey(snapshot, version, {...status, baseUrl: 'https://other.test'}));
  assert.notEqual(S.cacheKey(snapshot, version, status), S.cacheKey(snapshot, version, {...status, connectionVersion: 'another-process:1'}));
  assert.notEqual(S.cacheKey(snapshot, version, status), S.cacheKey(snapshot, version, {...status, selectionPromptVersion: 'selection-a0-detail-v3'}));
  await ctx.controller.explain(snapshot, true); assert.equal(ctx.calls.filter(call => call.body).length, 3);
});

test('unconfigured/file/foreign pages do not send provider requests, while explicit offline cache is labeled', async () => {
  for (const origin of ['null', 'https://example.test', 'http://localhost:8765']) {
    const ctx = setup({origin}); assert.equal(await ctx.controller.explain(snapshot), false); assert.equal(ctx.calls.length, 0); assert.equal(ctx.controller.getState().code, 'LOCAL_SERVICE_REQUIRED');
  }
  const ctx = setup(); ctx.setStatus({connected: false, model: null}); await ctx.controller.explain(snapshot);
  assert.equal(ctx.calls.length, 1); assert.equal(ctx.controller.getState().code, 'NOT_CONNECTED');
  const online = setup(); await online.controller.explain(snapshot);
  const offline = setup({origin: 'null', storage: online.storage}); await offline.controller.explain(snapshot);
  assert.equal(offline.calls.length, 0); assert.equal(offline.controller.getState().offlineCache, true); assert.equal(offline.controller.getState().threadId, '');
});

test('canonical changes and a mismatched response cannot be displayed or cached', async () => {
  const ctx = setup({fetch: async url => url === '/api/ai/status' ? response(status) : response({lesson: {id: 1, text: 'Changed course', version}})});
  await ctx.controller.explain(snapshot); assert.equal(ctx.controller.getState().code, 'COURSE_CHANGED'); assert.equal(ctx.storage.writes, 0);
  const mismatch = setup(); mismatch.setResult({...resultFor(), selection: {...resultFor().selection, start: 0}});
  await mismatch.controller.explain(snapshot); assert.equal(mismatch.controller.getState().code, 'INVALID_RESPONSE'); assert.equal(mismatch.storage.writes, 0);
});

test('cancel and changing lessons invalidate even a late response from a fetch that ignores abort', async () => {
  for (const action of ['cancel', 'lesson']) {
    let release; let signal;
    const ctx = setup({fetch: async (url, options) => {
      if (url === '/api/ai/status') return response(status);
      if (url.includes('/lesson/')) return response({lesson: {id: 1, text: fixtureData.lesson.text, version, promptVersion: status.selectionPromptVersion}});
      signal = options.signal; return new Promise(resolve => { release = resolve; });
    }});
    const running = ctx.controller.explain(snapshot); await settle(); assert.ok(release);
    if (action === 'cancel') ctx.controller.cancel(); else ctx.controller.setLesson({...fixtureData, lesson: {...fixtureData.lesson, day: 2}});
    assert.equal(signal.aborted, true); release(response(resultFor())); await running;
    assert.equal(ctx.controller.getState().phase, action === 'cancel' ? 'cancelled' : 'idle');
    assert.equal(ctx.controller.getState().feedback, ''); assert.equal(ctx.storage.writes, 0);
  }
});

test('duplicate initial request is ignored while busy and timeout restores an actionable error', async () => {
  let release;
  const ctx = setup({fetch: async url => url === '/api/ai/status' ? new Promise(resolve => { release = resolve; }) : response({})});
  const pending = ctx.controller.explain(snapshot); assert.equal(await ctx.controller.explain(snapshot), false); assert.equal(ctx.calls.length, 1);
  ctx.controller.cancel(); release(response(status)); await pending;
  const timeout = setup({timeout: 5, fetch: (url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('abort'))))});
  await timeout.controller.explain(snapshot); assert.equal(timeout.controller.getState().phase, 'error'); assert.equal(timeout.controller.getState().code, 'TIMEOUT');
});

test('followups stay on the server thread, are bounded and retain the initial explanation', async () => {
  const ctx = setup(); await ctx.controller.explain(snapshot);
  assert.equal(ctx.controller.followup(''), false); assert.equal(ctx.controller.followup('a'.repeat(401)), false);
  ctx.setResult({...resultFor(snapshot, 1), feedback: '这里第三人称单数使用 likes。'}); await ctx.controller.followup('为什么加 s？');
  assert.deepEqual(ctx.calls.at(-1).body, {threadId: 'thread-a', question: '为什么加 s？'});
  assert.equal(ctx.controller.getState().history.length, 1); assert.equal(ctx.controller.getState().feedback, resultFor().feedback);
  ctx.setResult({...resultFor(snapshot, 0), feedback: 'I like; she likes。'}); await ctx.controller.followup('再给一个例子');
  assert.equal(ctx.controller.getState().history.length, 2); assert.equal(ctx.controller.followup('第三次'), false);
  assert.equal(ctx.storage.writes, 1, 'only initial explanation enters the temporary cache');
});

test('expired followup shows a recoverable error and does not invent a new conversation', async () => {
  const ctx = setup(); await ctx.controller.explain(snapshot);
  ctx.setResult({ok: false, error: {code: 'THREAD_EXPIRED', message: '解释会话已过期，请重新解释。'}});
  await ctx.controller.followup('为什么？');
  assert.equal(ctx.controller.getState().remaining, 0); assert.equal(ctx.controller.getState().threadId, '');
  assert.equal(ctx.controller.getState().code, 'THREAD_EXPIRED'); assert.ok(ctx.controller.getState().feedback);
});

test('bad temporary cache is preserved and safe in-memory explanations still work', async () => {
  const bad = storage('{bad'); const ctx = setup({storage: bad}); await ctx.controller.explain(snapshot);
  assert.equal(ctx.controller.getState().phase, 'done'); assert.equal(bad.value(), '{bad'); assert.equal(bad.writes, 0);
  assert.throws(() => S.parseCache({schema: 1, entries: [{feedback: '<script>'}]}));
  const valid = setup(); await valid.controller.explain(snapshot);
  const parsed = JSON.parse(valid.storage.value()); parsed.entries[0].apiKey = 'never retain this field';
  assert.equal(S.parseCache(parsed).entries[0].apiKey, undefined);
});

test('truncated explanations remain visible with a warning and never enter the cache', async () => {
  const ctx = setup(); ctx.setResult({...resultFor(), truncated: true}); await ctx.controller.explain(snapshot);
  assert.equal(ctx.controller.getState().phase, 'done'); assert.equal(ctx.controller.getState().truncated, true);
  assert.ok(ctx.controller.getState().feedback); assert.equal(ctx.storage.writes, 0);
  await ctx.controller.explain(snapshot); assert.equal(ctx.calls.filter(call => call.body).length, 2);
  ctx.setResult({...resultFor(), promptVersion: 'unexpected-version'}); await ctx.controller.explain(snapshot, true);
  assert.equal(ctx.controller.getState().code, 'INVALID_RESPONSE'); assert.equal(ctx.storage.writes, 0);
});

test('double-click and drag selections suppress word audio; plain and keyboard clicks keep playback', async () => {
  const previous = global.getSelection; let selection = ''; let count = 0;
  global.getSelection = () => ({isCollapsed: !selection, toString: () => selection});
  try {
    S.handleReadClick({type: 'click', button: 0, detail: 1}, () => count++);
    S.handleReadClick({type: 'click', button: 0, detail: 2}, () => count++);
    await new Promise(resolve => setTimeout(resolve, 270)); assert.equal(count, 0);
    selection = 'likes'; S.handleReadClick({type: 'click', button: 0, detail: 1}, () => count++);
    await new Promise(resolve => setTimeout(resolve, 270)); assert.equal(count, 0);
    selection = ''; S.handleReadClick({type: 'keydown', key: 'Enter', detail: 0}, () => count++); assert.equal(count, 1);
    S.handleReadClick({type: 'click', button: 0, detail: 1}, () => count++);
    await new Promise(resolve => setTimeout(resolve, 270)); assert.equal(count, 2);
  } finally { if (previous === undefined) delete global.getSelection; else global.getSelection = previous; }
});

test('main page integrates selectable text without changing lesson data and all scripts parse', () => {
  assert.match(html, /assets\/selection-ai\.js/); assert.match(html, /assets\/selection-ai\.css/);
  assert.match(html, /data-ai-reading/); assert.match(html, /role="button" tabindex="0" class="read-word"/);
  assert.match(html, /基础入门\.html\?week=1/); assert.match(html, /第一篇不是零基础第一课/);
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) if (match[1].trim()) new vm.Script(match[1]);
  const script = fs.readFileSync(path.join(__dirname, '..', 'assets', 'selection-ai.js'), 'utf8');
  assert.doesNotMatch(script, /\.innerHTML\s*=/); assert.doesNotMatch(script, /localStorage/);
  const window = {}; vm.runInNewContext(script, {window}); assert.equal(window.IELTSSelectionAI.MAX_SELECTION, 800);
});
