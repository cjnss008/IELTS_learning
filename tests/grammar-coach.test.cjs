'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Grammar = require('../assets/grammar-coach.js');
const sourcePath = path.join(__dirname, '..', '开始学习.html');
const html = fs.readFileSync(sourcePath, 'utf8');
const lessons = JSON.parse(html.match(/^const LESSONS=(.+);\r?$/m)[1]);

class Element {
  constructor(tag, document) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = document;
    this.children = []; this.attributes = {}; this.events = {}; this.parentNode = null;
    this._text = ''; this.checked = false;
  }
  set textContent(value) { this._text = String(value); this.children.forEach(x => { x.parentNode = null; }); this.children = []; }
  get textContent() { return this._text + this.children.map(x => x.textContent).join(''); }
  set innerHTML(value) { throw new Error('Unsafe innerHTML assignment: ' + value); }
  append(...children) { for (const child of children) { child.parentNode = this; this.children.push(child); } }
  replaceChildren(...children) { this.children.forEach(x => { x.parentNode = null; }); this.children = []; this._text = ''; this.append(...children); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(type, fn) { (this.events[type] ||= new Set()).add(fn); }
  removeEventListener(type, fn) { this.events[type]?.delete(fn); }
  dispatch(type) { for (const fn of this.events[type] || []) fn({preventDefault() {}}); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(x => x !== this); this.parentNode = null; }
}
function makeContainer() { const document = {createElement(tag) { return new Element(tag, document); }}; return document.createElement('div'); }
function descendants(node) { return node.children.flatMap(child => [child, ...descendants(child)]); }
function byTag(node, tag) { return descendants(node).filter(child => child.tagName === tag.toUpperCase()); }
function byClass(node, name) { return descendants(node).filter(child => (child.className || '').split(' ').includes(name)); }

test('all 52 lessons match the three source grammar passages with specific analyses', () => {
  assert.equal(Grammar.data.length, 52);
  for (let i = 0; i < 52; i++) {
    const pack = Grammar.data[i]; const original = lessons[i];
    assert.equal(pack.day, i + 1); assert.equal(pack.title, original.title);
    assert.equal(pack.points.length, 3);
    pack.points.forEach((point, index) => {
      assert.equal(point.quote, original.grammar[index].quote, `${i + 1}/${index + 1}`);
      assert.equal(point.sourceExplanation, original.grammar[index].explain);
      for (const field of ['title', 'pattern', 'explanation', 'mistake', 'analysis']) {
        assert.equal(typeof point[field], 'string'); assert.ok(point[field].length >= 8, `${point.id}/${field}`);
      }
      assert.equal(point.exercises.length, 2);
    });
  }
  assert.equal(new Set(Grammar.data.flatMap(pack => pack.points.map(point => point.analysis))).size, 156);
});

test('312 exercises have unique IDs and exactly one supported option; every distractor is rejected', () => {
  const exercises = Grammar.data.flatMap(pack => pack.points.flatMap(point => point.exercises));
  assert.equal(exercises.length, 312); assert.equal(new Set(exercises.map(q => q.id)).size, 312);
  for (const q of exercises) {
    assert.equal(q.options.length, 3); assert.equal(new Set(q.options).size, 3, q.id);
    assert.equal(q.answers.length, 1); assert.ok(q.options.includes(q.answers[0]), q.id);
    assert.ok(q.prompt.length >= 6); assert.ok(q.explanation.length >= 15, q.id);
    assert.equal(q.options.filter(option => Grammar.grade(q, option).correct).length, 1, q.id);
    assert.equal(Grammar.grade(q, '').answered, false);
    assert.equal(Grammar.grade(q, 'unrelated answer').correct, false);
  }
});

test('grading is whitespace/case tolerant and rejects missing or non-text answers', () => {
  const q = Grammar.data[0].points[0].exercises[0];
  assert.equal(Grammar.grade(q, '  MEASURING  ').correct, true);
  assert.equal(Grammar.grade(q, 'measuring extra').correct, false);
  for (const answer of [null, undefined, NaN, {}, [], 1]) assert.equal(Grammar.grade(q, answer).answered, false);
  assert.equal(Grammar.grade(null, 'test').correct, false);
  assert.equal(Grammar.grade({}, 'test').correct, false);
  assert.equal(Grammar.grade({answers: []}, '').answered, false);
});

test('source-specific distinctions are preserved rather than using one blanket participle rule', () => {
  assert.equal(Grammar.data[6].points[0].familyId, 'state');
  assert.match(Grammar.data[0].points[2].sourceExplanation, /不是完成时/);
  assert.match(Grammar.data[13].points[0].analysis, /existence and their randomly consuming energy/);
  assert.equal(Grammar.data[28].points[1].familyId, 'with');
  assert.equal(Grammar.data[39].points[1].familyId, 'with');
  assert.match(Grammar.data[47].points[2].exercises[0].explanation, /50%/);
  assert.match(Grammar.data[51].points[2].exercises[0].explanation, /打算/);
});

test('data is deeply frozen to prevent one lesson changing another during practice', () => {
  assert.ok(Object.isFrozen(Grammar.data));
  assert.ok(Object.isFrozen(Grammar.data[0].points[0].exercises[0].options));
  assert.throws(() => { Grammar.data[0].points[0].exercises[0].answers[0] = 'bad'; }, TypeError);
});

test('all lessons mount six local questions with safe DOM nodes and unique radio IDs', () => {
  for (const lesson of lessons) {
    const container = makeContainer(); const dispose = Grammar.mount(container, lesson);
    assert.equal(byClass(container, 'grammar-coach-point').length, 3);
    assert.equal(byTag(container, 'form').length, 6);
    const inputs = byTag(container, 'input');
    assert.equal(inputs.length, 18); assert.equal(new Set(inputs.map(input => input.id)).size, 18);
    assert.ok(container.textContent.includes('不代表雅思评分'));
    assert.ok(container.textContent.includes('原课编号不是零基础学习顺序'));
    assert.equal(byTag(container, 'script').length, 0);
    dispose(); assert.equal(container.children.length, 0);
  }
});

test('checking, revealing, and changing a choice have distinct completion behavior', () => {
  const container = makeContainer(); Grammar.mount(container, lessons[0]);
  const form = byTag(container, 'form')[0];
  const progress = byClass(container, 'grammar-coach-progress')[0];
  const feedback = byClass(form, 'grammar-coach-feedback')[0];
  const radios = byTag(form, 'input');
  form.dispatch('submit'); assert.match(feedback.textContent, /先选择/);
  byTag(form, 'button')[1].dispatch('click');
  assert.match(feedback.textContent, /不计为作答/); assert.match(progress.textContent, /0 \/ 6/);
  const correct = radios.find(radio => radio.value === 'measuring'); correct.checked = true;
  form.dispatch('submit'); assert.match(progress.textContent, /1 \/ 6 题；答对 1/);
  correct.checked = false; radios.find(radio => radio !== correct).checked = true;
  radios.find(radio => radio !== correct).dispatch('change');
  assert.match(progress.textContent, /0 \/ 6/); assert.equal(feedback.textContent, '');
  form.dispatch('submit'); assert.match(progress.textContent, /1 \/ 6 题；答对 0/);
  assert.match(feedback.textContent, /正确答案：measuring/);
});

test('stale lesson IDs/quotes do not show an unrelated answer bank and disposal is isolated', () => {
  const container = makeContainer();
  for (const bad of [null, {}, {day: 99}, {...lessons[0], grammar: []}, {...lessons[0], grammar: [{quote: '<img src=x onerror=alert(1)>'}, ...lessons[0].grammar.slice(1)]}]) {
    Grammar.mount(container, bad);
    assert.equal(byTag(container, 'form').length, 0);
    assert.match(container.textContent, /尚未匹配/);
    assert.equal(byTag(container, 'img').length, 0);
  }
  const oldDispose = Grammar.mount(container, lessons[0]);
  Grammar.mount(container, lessons[1]); oldDispose();
  assert.equal(byTag(container, 'form').length, 6);
  assert.throws(() => Grammar.mount(null, lessons[0]), TypeError);
});

test('plain browser script exposes IELTSGrammar without requiring DOM, network, or storage', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'assets', 'grammar-coach.js'), 'utf8');
  const window = {};
  vm.runInNewContext(script, {window});
  assert.equal(window.IELTSGrammar.data.length, 52);
  const context = {};
  vm.runInNewContext(script, context);
  assert.equal(context.IELTSGrammar.data.length, 52);
});
