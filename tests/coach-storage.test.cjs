'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'assets', 'ai-coach.js'), 'utf8');
const KEY = 'ielts-ai-coach-v1';
function area(seed = {}) {
  const values = new Map(Object.entries(seed));
  return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
class Element {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.dataset = {}; this.events = {}; this._value = ''; this.textContent = ''; this.hidden = false; this.disabled = false; }
  get value() { return this.tag === 'select' && !this._value ? this.children[0]?.value || '' : this._value; }
  set value(value) { this._value = String(value); }
  get selectedOptions() { return this.children.filter(child => child.value === this.value); }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; if (this.tag === 'select') this._value = ''; }
  addEventListener(name, handler) { this.events[name] = handler; }
  setAttribute() {}
  focus() {}
  click() {}
}
function browser(local = area(), session = area(), preview = false) {
  const elements = new Map();
  const selects = ['coachMode', 'coachLevel', 'writingTask', 'questionSelect'];
  function get(id) { if (!elements.has(id)) elements.set(id, new Element(selects.includes(id) ? 'select' : 'div')); return elements.get(id); }
  const document = { getElementById: get, createElement: tag => new Element(tag) };
  const context = { document, localStorage: local, sessionStorage: session, location: { protocol: 'file:', hostname: '', search: preview ? '?preview=1' : '' },
    URLSearchParams, URL, Blob, AbortController, AbortSignal, Date, setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 1,
    addEventListener: () => {}, confirm: () => true };
  context.window = context;
  vm.runInNewContext(appSource, context, { filename: 'ai-coach.js' });
  return { get, type(value) { get('coachDraft').value = value; get('coachDraft').events.input(); },
    select(id, value) { get(id).value = value; get(id).events.change(); }, local, session };
}
test('coach does not write on page load and keeps malformed existing records untouched', () => {
  const empty = area(); browser(empty); assert.equal(empty.getItem(KEY), null);
  for (const bad of ['{broken', '[]', JSON.stringify({ drafts: { bad: { text: 23 } } })]) {
    const storage = area({ [KEY]: bad }), page = browser(storage);
    page.type('Unsaved learner draft');
    assert.equal(storage.getItem(KEY), bad);
    assert.match(page.get('draftSaved').textContent, /停止/);
    assert.equal(page.get('coachDraft').value, 'Unsaved learner draft');
  }
});
test('preview mode only saves into isolated session storage', () => {
  const local = area({ [KEY]: '{"drafts":{}}' }), session = area();
  const page = browser(local, session, true); page.type('Preview writing sample.');
  assert.equal(local.getItem(KEY), '{"drafts":{}}');
  assert.match(session.getItem('ielts-ai-coach-preview-v1'), /Preview writing sample/);
  assert.equal(page.get('coachPreview').hidden, false);
});
test('separate tabs merge different questions and stop on same-question conflicts', () => {
  const storage = area(), a = browser(storage), b = browser(storage);
  a.select('coachMode', 'writing'); b.select('coachMode', 'writing');
  b.select('questionSelect', 'courses'); b.type('Answer for courses.');
  a.type('Answer for transport.');
  let stored = JSON.parse(storage.getItem(KEY));
  assert.equal(stored.drafts['writing:academic_task1:courses'].text, 'Answer for courses.');
  assert.equal(stored.drafts['writing:academic_task1:transport'].text, 'Answer for transport.');
  b.type('Revised courses answer.');
  stored = JSON.parse(storage.getItem(KEY));
  assert.equal(stored.drafts['writing:academic_task1:transport'].text, 'Answer for transport.');
  const c = browser(storage), d = browser(storage);
  c.select('questionSelect', 'transport'); d.select('questionSelect', 'transport');
  c.type('Transport revision from tab C.');
  d.type('Conflicting transport revision from tab D.');
  assert.equal(JSON.parse(storage.getItem(KEY)).drafts['writing:academic_task1:transport'].text, 'Transport revision from tab C.');
  assert.match(d.get('draftSaved').textContent, /另一标签页/);
  assert.equal(d.get('coachDraft').value, 'Conflicting transport revision from tab D.');
  d.select('questionSelect', 'courses');
  assert.equal(d.get('questionSelect').value, 'transport');
  assert.equal(d.get('coachDraft').value, 'Conflicting transport revision from tab D.');
});

test('new beginners start with grammar while existing writing choices and drafts remain accessible', () => {
  const starter = browser();
  assert.equal(starter.get('coachMode').value, 'grammar');
  assert.equal(starter.get('coachLevel').value, 'A0');
  assert.equal(starter.local.getItem(KEY), null);
  const oldDraft = { drafts: { 'writing:academic_task1:transport': { text: 'Existing answer.' } } };
  const legacy = browser(area({ [KEY]: JSON.stringify(oldDraft) }));
  assert.equal(legacy.get('coachMode').value, 'writing');
  assert.equal(legacy.get('coachDraft').value, 'Existing answer.');
  const chosen = browser(area({ [KEY]: JSON.stringify({ mode: 'speaking_text', level: 'B1', drafts: {} }) }));
  assert.equal(chosen.get('coachMode').value, 'speaking_text');
  assert.equal(chosen.get('coachLevel').value, 'B1');
});
