'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const M = require(path.join(root, 'assets/memory-core.js'));
const E = require(path.join(root, 'assets/essential-vocabulary-core.js'));
const Course = require(path.join(root, 'assets/essential-vocabulary-course.js'));
const Session = require(path.join(root, 'assets/memory-session.js'));
const base = Date.parse('2026-03-01T04:00:00Z'), day = 86400000, now = base + 4 * day;
function alpha(n) { let word = ''; do { word = String.fromCharCode(97 + n % 26) + word; n = Math.floor(n / 26) - 1; } while (n >= 0); return word; }
const entries = Array.from({length: 650}, (_, index) => ({word: 'audit' + alpha(index), rank: index + 1, meaning: '合成测试词义' + index, example: 'This is the synthetic item ' + 'audit' + alpha(index) + '.'}));
const memory = M.captureTraining(M.newState(), {attempts: entries.slice(0, 600).map((word, index) => ({id: 'root-initial-' + index, word: word.word, meaning: word.meaning, submittedAt: new Date(base).toISOString(), correct: true}))});
const options = more => ({entries, now, courseDay: 2, records: [], remainingMinutes: 360, contextWords: entries.slice(600), ...more});

test('all 600 due words remain mandatory despite an old reviewLimit=0 and a fully spent vocabulary reference allowance', () => {
  const raw = JSON.stringify(memory);
  const spent = {id: 'synthetic-spent', skill: 'vocabulary', activeSeconds: 120 * 60, submittedAt: new Date(now).toISOString(), answer: JSON.stringify({activityByDate: {[E.dateKey(now)]: 120 * 60}})};
  const value = E.plan(memory, options({reviewLimit: 0, records: [spent], remainingMinutes: 240}));
  assert.equal(value.allDue.length, 600);
  assert.equal(value.due.length, 600);
  assert.equal(new Set(value.due.map(item => item.word)).size, 600);
  assert.equal(value.newWords.length, 0);
  assert.equal(JSON.stringify(memory), raw);
});

test('ending a calendar day preserves the full queue and does not declare its required vocabulary work done', () => {
  const before = JSON.stringify(memory), planned = E.plan(memory, options({remainingMinutes: 0}));
  assert.equal(planned.allDue.length, 600);
  assert.equal(planned.due.length, 600);
  assert.equal(planned.newWords.length, 0);
  const value = Course.state({day: 2, data: {days: [{day: 2, requirements: {essential: true}, tasks: [{id: 'vocabulary', materialIds: []}]}], materials: []}, engine: E, memoryEngine: M, memory, vocabularyData: {entries}, records: [], drafts: [], budget: {remainingMinutes: 0}, now, contextual: {daily: () => ({available: false})}});
  assert.equal(value.applicable, true);
  assert.equal(value.done, false);
  assert.equal(value.required, true);
  assert.equal(value.plan.due.length, 600);
  assert.equal(JSON.stringify(memory), before);
});

test('the thirty-word target does not cap additional context-backed words or relabel old exposures', () => {
  const empty = M.newState(), value = E.plan(empty, options({contextWords: entries.slice(600)}));
  assert.equal(value.quota.dailyTarget, 30);
  assert.ok(value.newWords.filter(word => word.learningKind === 'new').length >= 30);
  assert.equal(new Set(value.newWords.map(word => word.word)).size, value.newWords.length);
  assert.ok(value.newWords.every(word => entries.slice(600).some(entry => entry.word === word.word)));
  const firstDay = E.plan(empty, options({courseDay: 1, contextWords: entries.slice(600)}));
  assert.equal(firstDay.newWords.length, 0);
  assert.equal(firstDay.todayNewWords.length, 0);
  const continued = E.plan(memory, options({remainingMinutes: 0, contextWords: entries.slice(0, 40)}));
  assert.ok(!continued.todayNewWords.some(word => word.learningKind === 'new'));
});

test('a wrong recall waiting for its short spacing interval cannot be hidden to unlock new words', () => {
  const word = entries[0], item = {...word, skill: 'spelling'};
  let isolated = M.captureTraining(M.newState(), {attempts: [{id: 'root-single-initial', word: word.word, meaning: word.meaning, submittedAt: new Date(base).toISOString(), correct: true}]});
  const draft = {...Session.makeDraft(item, {id: 'root-wrong-recall', courseDay: 2, now: now - 30000}), answer: 'wrong', activeSeconds: 20, activityByDate: {[E.dateKey(now)]: 20}};
  const record = Session.recordFor(draft, item, {correct: false}, {now});
  isolated = M.observe(isolated, word, item.skill, {id: record.id, recordId: record.id, startedAt: record.startedAt, at: record.submittedAt, correct: false, assisted: false, source: 'objective-recall', answer: draft.answer});
  const raw = JSON.stringify(isolated);
  const waiting = E.plan(isolated, options({now: now + 9 * 60000, records: [record]}));
  assert.equal(waiting.nextRetryAt, new Date(now + 10 * 60000).toISOString());
  assert.equal(waiting.due.length, 0);
  assert.equal(waiting.newWords.length, 0);
  assert.equal(JSON.stringify(isolated), raw);
  const due = E.plan(isolated, options({now: now + 10 * 60000, records: [record]}));
  assert.equal(due.due[0].word, word.word);
  assert.equal(due.due[0].reviewKind, 'retry');
});

test('a damaged rest snapshot keeps all due work visible while refusing an unverified new learning window', () => {
  const Timer = require(path.join(root, 'assets/study-timer-core.js'));
  const value = E.plan(memory, options({timerState: {...Timer.newState(), enabled: true, completedFocus: 'damaged'}}));
  assert.equal(value.due.length, 600);
  assert.equal(value.allDue.length, 600);
  assert.equal(value.reviewBudget.sessionCount, 0);
  assert.equal(value.reviewBudget.canStartNext, false);
  assert.equal(value.reviewBudget.nextUnitMinutes, null);
  assert.ok(value.reviewBudget.budgetError);
  assert.equal(value.newWords.length, 0);
});
