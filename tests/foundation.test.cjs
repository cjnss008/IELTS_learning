'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Foundation = require('../assets/foundation.js');
require('../assets/daily-plan-content.js');
const script = fs.readFileSync(path.join(__dirname, '..', 'assets', 'foundation.js'), 'utf8');
const KEY = 'ielts52-foundation-v1';
const PREVIEW_KEY = 'ielts52-foundation-preview-v1';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {writes: 0, getItem(key) { return values.has(key) ? values.get(key) : null; }, setItem(key, value) { this.writes++; values.set(key, String(value)); }};
}
class Element {
  constructor(tag, doc) { this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = []; this.events = {}; this.attributes = {}; this._text = ''; this.checked = false; this.className = ''; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set innerHTML(value) { throw new Error('innerHTML is forbidden'); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; this._text = ''; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, handler) { (this.events[type] ||= []).push(handler); }
  dispatch(type) { (this.events[type] || []).forEach(fn => fn({preventDefault() {}})); }
  querySelectorAll(selector) { return all(this).filter(child => selector[0] === '.' ? child.className.split(' ').includes(selector.slice(1)) : selector === 'a[href$=".html"]' && child.tagName === 'A' && child.href?.endsWith('.html')); }
}
function all(element) { return element.children.flatMap(child => [child, ...all(child)]); }
function elements(element, tag) { return all(element).filter(child => child.tagName === tag.toUpperCase()); }
function fixture(options = {}) {
  const doc = {createElement(tag) { return new Element(tag, doc); }};
  const body = doc.createElement('body'); const app = doc.createElement('main'); app.id = 'foundationApp'; body.append(app);
  const tags = {foundationWeek: 'select', foundationStop: 'button', foundationUnit: 'article', foundationVoice: 'p', foundationPreview: 'p', foundationStorage: 'p', foundationProgress: 'p'};
  for (const [id, tag] of Object.entries(tags)) { const element = doc.createElement(tag); element.id = id; app.append(element); }
  doc.getElementById = id => all(body).find(element => element.id === id) || null;
  doc.querySelectorAll = selector => body.querySelectorAll(selector);
  const localStorage = options.localStorage || memoryStorage(); const sessionStorage = options.sessionStorage || memoryStorage();
  const browserEvents = {};
  const speech = {spoken: [], cancelled: 0, voices: options.voices || [], events: {}, getVoices() { return this.voices; }, cancel() { this.cancelled++; }, speak(utterance) { this.spoken.push(utterance); }, addEventListener(type, fn) { this.events[type] = fn; }};
  const window = {document: doc, location: {search: options.search || ''}, localStorage, sessionStorage, speechSynthesis: speech, SpeechSynthesisUtterance: function(text) { this.text = text; }, addEventListener(type, fn) { browserEvents[type] = fn; }};
  vm.runInNewContext(script, {window, URLSearchParams});
  return {window, doc, app, localStorage, sessionStorage, speech, browserEvents};
}
function answerFirst(context, correct = true) {
  const form = elements(context.doc.getElementById('foundationUnit'), 'form')[0];
  const item = context.window.IELTSFoundation.units[Number(context.doc.getElementById('foundationWeek').value) - 1].questions[0];
  const selected = elements(form, 'input').find(input => (input.value === item.answer) === correct);
  selected.checked = true; form.dispatch('submit'); return form;
}

test('eight units align with foundation weeks and contain 64 explained questions', () => {
  assert.equal(Foundation.units.length, 8);
  const ids = new Set();
  Foundation.units.forEach((unit, index) => {
    assert.equal(unit.week, index + 1);
    assert.equal(unit.title, globalThis.IELTSPlanContent.weeks[index].title);
    assert.ok(unit.goal.length > 20); assert.ok(unit.lessons.length >= 3);
    assert.ok(unit.reading.length >= 4); assert.ok(unit.practice.length >= 3);
    unit.lessons.forEach(lesson => { assert.ok(lesson.text.length > 35); assert.ok(lesson.examples.length >= 2); lesson.examples.forEach(line => { assert.equal(line.length, 2); assert.ok(line.every(text => text.length > 0)); }); });
    assert.equal(unit.questions.length, 8);
    unit.questions.forEach(item => {
      ids.add(item.id); assert.equal(new Set(item.options).size, 3);
      assert.ok(item.options.includes(item.answer)); assert.ok(item.explanation.length >= 15);
      assert.equal(item.options.filter(option => Foundation.grade(item, option)).length, 1);
    });
  });
  assert.equal(ids.size, 64);
  assert.match(Foundation.units[0].lessons[0].text, /26/);
  assert.match(Foundation.units[0].lessons[1].text, /Z \/ziː\//);
  assert.ok(Object.isFrozen(Foundation.units[0].questions[0]));
});

test('state round trip derives answers from known IDs without storing scores', () => {
  const initial = Foundation.createState(); initial.selectedWeek = 8;
  for (const unit of Foundation.units) for (const item of unit.questions) initial.answers[item.id] = item.answer;
  const result = Foundation.parseState(JSON.stringify(initial));
  assert.deepEqual(result, initial); assert.notEqual(result.answers, initial.answers);
  assert.deepEqual(Object.keys(result), ['schema', 'selectedWeek', 'answers']);
  assert.equal(Object.keys(result.answers).length, 64);
  assert.equal(Foundation.grade(null, 'x'), false);
  assert.equal(Foundation.grade(Foundation.units[0].questions[0], {}), false);
});

test('state rejects invalid weeks, unknown IDs, corrupted answers, accessors and extra fields', () => {
  for (const week of [0, 9, 1.5, NaN, Infinity, '1', null]) assert.throws(() => Foundation.parseState({...Foundation.createState(), selectedWeek: week}));
  for (const answers of [null, [], {unknown: 'am'}, {'f1-1': 'not a choice'}, {'f1-1': 1}, {'f1-1': {correct: true}}]) assert.throws(() => Foundation.parseState({...Foundation.createState(), answers}));
  assert.throws(() => Foundation.parseState({...Foundation.createState(), score: 64}));
  assert.throws(() => Foundation.parseState({...Foundation.createState(), schema: 2}));
  assert.throws(() => Foundation.parseState('{broken'));
  assert.throws(() => Foundation.parseState('x'.repeat(131073)));
  assert.throws(() => Foundation.parseState(JSON.parse('{"schema":1,"selectedWeek":1,"answers":{"__proto__":"x"}}')));
  const accessor = Foundation.createState(); Object.defineProperty(accessor, 'selectedWeek', {get() { throw new Error('getter executed'); }});
  assert.throws(() => Foundation.parseState(accessor), /结构或版本/);
  const inherited = Object.create(Foundation.createState()); assert.throws(() => Foundation.parseState(inherited));
});

test('persist validates first and refuses stale writes, preserving the previous stored state', () => {
  const before = JSON.stringify(Foundation.createState()); const storage = memoryStorage({[KEY]: before});
  assert.throws(() => Foundation.persistState(storage, KEY, before, {...Foundation.createState(), selectedWeek: 99}));
  assert.equal(storage.writes, 0); assert.equal(storage.getItem(KEY), before);
  const candidate = Foundation.createState(); candidate.answers['f1-1'] = 'am';
  assert.throws(() => Foundation.persistState(storage, KEY, 'stale', candidate), /其他页面/);
  assert.equal(storage.writes, 0);
  const saved = Foundation.persistState(storage, KEY, before, candidate);
  assert.equal(storage.writes, 1); assert.equal(storage.getItem(KEY), saved.raw);
  const failure = {getItem() { return before; }, setItem() { throw new Error('quota'); }};
  assert.throws(() => Foundation.persistState(failure, KEY, before, candidate), /quota/);
});

test('backup/Node loading does not initialize UI or access storage without its root', () => {
  let storageTouched = false;
  const window = {document: {getElementById() { return null; }}};
  Object.defineProperty(window, 'localStorage', {get() { storageTouched = true; throw new Error('unexpected storage access'); }});
  vm.runInNewContext(script, {window});
  assert.equal(window.IELTSFoundation.units.length, 8); assert.equal(storageTouched, false);
  const context = {}; vm.runInNewContext(script, context); assert.equal(context.IELTSFoundation.units.length, 8);
});

test('week deep links show exactly that unit and do not auto-save or auto-play', () => {
  for (let week = 1; week <= 8; week++) {
    const context = fixture({search: '?week=' + week});
    assert.equal(context.doc.getElementById('foundationWeek').value, String(week));
    assert.equal(elements(context.doc.getElementById('foundationUnit'), 'form').length, 8);
    assert.equal(context.localStorage.writes, 0);
    assert.equal(context.speech.spoken.length, 0);
    assert.match(context.doc.getElementById('foundationVoice').textContent, /没有可用/);
    assert.ok(context.app.querySelectorAll('.foundation-speak').every(button => button.disabled));
  }
  assert.equal(fixture({search: '?week=999'}).doc.getElementById('foundationWeek').value, '1');
});

test('revealing an answer does not count; explicit submission saves the choice and feedback', () => {
  const context = fixture(); const form = elements(context.app, 'form')[0];
  elements(form, 'button')[1].dispatch('click');
  assert.equal(context.localStorage.writes, 0); assert.match(context.doc.getElementById('foundationProgress').textContent, /0 \/ 64/);
  form.dispatch('submit'); assert.equal(context.localStorage.writes, 0);
  answerFirst(context);
  assert.equal(context.localStorage.writes, 1);
  assert.equal(JSON.parse(context.localStorage.getItem(KEY)).answers['f1-1'], 'am');
  assert.match(context.doc.getElementById('foundationProgress').textContent, /已核对 1 \/ 64 题；当前答案正确 1/);
});

test('preview answers are isolated in session storage and corrupted formal data remains intact', () => {
  const localStorage = memoryStorage({[KEY]: '{invalid'}); const sessionStorage = memoryStorage();
  const preview = fixture({search: '?preview=1&week=2', localStorage, sessionStorage}); answerFirst(preview);
  assert.equal(localStorage.getItem(KEY), '{invalid'); assert.equal(localStorage.writes, 0);
  assert.ok(sessionStorage.getItem(PREVIEW_KEY)); assert.equal(preview.doc.getElementById('foundationPreview').hidden, false);
  const formal = fixture({localStorage}); answerFirst(formal);
  assert.equal(localStorage.getItem(KEY), '{invalid'); assert.equal(localStorage.writes, 0);
  assert.match(formal.doc.getElementById('foundationStorage').textContent, /原记录未覆盖/);
});

test('external update and storage quota failures keep existing data untouched', () => {
  const context = fixture(); const external = JSON.stringify({...Foundation.createState(), selectedWeek: 3});
  context.localStorage.setItem(KEY, external); answerFirst(context);
  assert.equal(context.localStorage.getItem(KEY), external);
  assert.match(context.doc.getElementById('foundationStorage').textContent, /仅临时保留/);
  const old = JSON.stringify(Foundation.createState());
  const storage = {getItem() { return old; }, setItem() { throw new Error('quota full'); }};
  const full = fixture({localStorage: storage}); answerFirst(full);
  assert.equal(storage.getItem(KEY), old); assert.match(full.doc.getElementById('foundationStorage').textContent, /保存失败/);
});

test('English TTS is opt-in, handles voices arriving later and never claims pronunciation scoring', () => {
  const context = fixture(); const first = context.app.querySelectorAll('.foundation-speak')[0];
  assert.equal(first.disabled, true); assert.equal(context.speech.spoken.length, 0);
  context.speech.voices = [{lang: 'en-GB', name: 'British first'}, {lang: 'en-US', name: 'American test voice'}]; context.speech.events.voiceschanged();
  assert.equal(first.disabled, false); first.dispatch('click');
  assert.equal(context.speech.spoken.length, 1); assert.equal(context.speech.spoken[0].lang, 'en-US');
  assert.equal(context.speech.spoken[0].text, 'My name is Anna.');
  assert.match(context.doc.getElementById('foundationVoice').textContent, /不评测发音/);
  context.speech.spoken[0].onerror(); assert.match(context.doc.getElementById('foundationVoice').textContent, /未能播放/);
});

test('page links only to local assets and contains the scope and synthetic voice notice', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '基础入门.html'), 'utf8');
  assert.match(html, /不能独立填满每天 6 小时/); assert.match(html, /非真人录音/);
  for (const match of html.matchAll(/(?:src|href)="(assets\/[^"?]+)"/g)) assert.ok(fs.existsSync(path.join(__dirname, '..', match[1])));
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('British-only browser voices keep American example speech unavailable without changing answers',()=>{const context=fixture({voices:[{lang:'en-GB',name:'British only'}]}),button=context.app.querySelectorAll('.foundation-speak')[0];assert.equal(button.disabled,true);assert.match(context.doc.getElementById('foundationVoice').textContent,/美式英语/);assert.equal(context.speech.spoken.length,0);});
