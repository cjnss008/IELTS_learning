'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const D = require('../assets/curriculum-data.js'), M = require('../assets/memory-core.js'), E = require('../assets/essential-vocabulary-core.js'), Course = require('../assets/essential-vocabulary-course.js'), Load = require('../assets/daily-learning-load.js'), V = require('../assets/essential-vocabulary-data.js'), T = require('../assets/study-timer-core.js');

test('a short retry interval offers the next real non-vocabulary task instead of a new vocabulary original that cannot start', () => {
  const now = Date.parse('2026-10-27T12:00:00Z'), memory = M.observe(M.newState(), V.entries[0], 'spelling', {id: 'waiting-wrong-answer', at: new Date(now - 60000).toISOString(), correct: false, assisted: true, answer: 'wrong'});
  const data = {...D, days: [D.days[1]]}, timerState = {...T.newState(), enabled: true}, budget = {remainingMinutes: 360, spentMinutes: 0, exhausted: false};
  const daily = Course.state({day: 2, data, memory, memoryEngine: M, engine: E, vocabularyData: V, contextual: {daily: () => ({available: false})}, now, budget, timerState});
  assert.equal(daily.reviewWaiting, true);
  const old = global.IELTSEssentialCourse;
  try {
    global.IELTSEssentialCourse = {state: () => daily};
    const queue = Load.build({data, records: [], drafts: [], currentDay: 2, now, budget, timerState, adaptivePlan: null, yearFirstUse: false, summaryForDay: () => ({remaining: 0, completionValid: false})});
    assert.equal(queue.next.kind, 'material');
    assert.notEqual(queue.next.taskId, 'vocabulary');
    assert.ok(queue.entries.some(entry => entry.dailyRequirement && entry.waiting));
    const requiredIds = data.days[0].tasks.find(task => task.id === 'vocabulary').materialIds;
    for (const id of requiredIds) assert.ok(queue.entries.some(entry => entry.materialId === id && entry.kind === 'blocked'), id + ' remains waiting, not completed or deleted');
    assert.equal(queue.currentComplete, false);
  } finally { if (old === undefined) delete global.IELTSEssentialCourse; else global.IELTSEssentialCourse = old; }
});
