'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), Module = require('node:module');
const root = path.resolve(__dirname, '..'), filename = path.join(root, 'tests/course-player-dom.test.cjs'), raw = fs.readFileSync(filename, 'utf8'), marker = raw.indexOf("test('vocabulary continuation");
assert.ok(marker > 0); const helper = new Module(filename, module); helper.filename = filename; helper.paths = Module._nodeModulePaths(path.dirname(filename)); helper._compile(raw.slice(0, marker) + '\nmodule.exports={fixture};', filename);
const A = require(path.join(root, 'assets/assessment-core.js'));
async function settle() { for (let n = 0; n < 8; n++) await new Promise(resolve => setImmediate(resolve)); }

for (const skill of ['grammar', 'listening', 'reading', 'writing']) test(skill + ': continuing a submitted original displays its exact answer without creating another empty attempt', async () => {
  const f = helper.exports.fixture({id: 'saved-trace-' + skill, skill, ...(skill === 'writing' ? {prompt: 'Describe your study routine.', minWords: 1, questions: []} : {})}, {search: '?day=2', setup(data, material, tasks) { const task = tasks.find(item => item.id === skill); task.materialIds = [material.id]; data.days = [{day: 2, week: 1, totalMinutes: 360, tasks: [task]}]; }});
  await settle();
  const P = f.win.IELTSCoursePlayer, task = f.win.IELTSCurriculumData.days[0].tasks[0], text = 'I keep my original study notes exactly as I wrote them.';
  const attempt = {id: 'course-original-trace-' + skill, materialId: f.mat.id, taskId: skill, courseDay: 2, mode: 'practice', kind: 'original', parentId: null, startedAt: '2026-10-24T11:59:30.000Z', submittedAt: '2026-10-24T12:00:00.000Z', activeSeconds: 15, elapsedSeconds: 30, activityByDate: {'2026-10-24': 15}, exposureAtStart: 'seen', answers: skill === 'writing' ? {} : {q1: 'blue'}, userEvidence: {}, text: skill === 'writing' ? text : '', transcript: '', audioAvailable: skill === 'listening', audioCompleted: skill === 'listening', transcriptViewed: false, interrupted: false, assistance: {hint: false, answer: false, ai: false}, media: []};
  attempt.materialBinding = P.freezeMaterialBinding(f.mat, {assessment: A, data: f.win.IELTSCurriculumData, task, courseDay: 2, attemptId: attempt.id});
  const record = (await f.win.IELTSRecords.record(P.toRecord(attempt, f.mat, 2, A))).record;
  const before = JSON.stringify(record);
  await f.win.IELTSTodayNavigation.refreshYearRecords();
  f.win.IELTSTodayNavigation.showTask(skill, f.mat.id); await settle();
  await f.win.IELTSTodayNavigation.resumeNext(skill, f.mat.id); await settle();
  assert.equal(f.win.IELTSTodayNavigation.current().submitted, true);
  assert.equal(f.win.IELTSTodayNavigation.allDrafts().length, 0);
  assert.equal(f.records().length, 1);
  assert.equal(JSON.stringify(f.records()[0]), before);
  if (skill === 'writing') { const area = f.nodes.get('courseOutput').querySelector('textarea'); assert.equal(area.value, text); assert.equal(area.disabled, true); }
  else { const option = f.nodes.get('courseQuestions').querySelectorAll('input').find(input => input.value === 'blue'); assert.equal(option.checked, true); assert.equal(option.disabled, true); }
});
