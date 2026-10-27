'use strict';
// Synthetic DOM and in-memory ports; the actual Player, Essential, Memory,
// Records and vocabulary session execute. No learner files or service calls.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const M = require('../assets/memory-core.js'), E = require('../assets/essential-vocabulary-core.js'), Course = require('../assets/essential-vocabulary-course.js'), V = require('../assets/vocabulary-practice.js');
const filename = path.join(__dirname, 'course-player-dom.test.cjs'), source = fs.readFileSync(filename, 'utf8'), marker = source.indexOf("test('vocabulary continuation");
assert.ok(marker > 0);
const fixtures = new Module(filename, module); fixtures.filename = filename; fixtures.paths = Module._nodeModulePaths(__dirname);
fixtures._compile(source.slice(0, marker) + '\nmodule.exports={fixture};', filename);
const {fixture} = fixtures.exports;
async function settle() { for (let n = 0; n < 8; n++) await new Promise(resolve => setImmediate(resolve)); }
const word = {word: 'garden', meaning: '花园', example: 'There is a garden near the house.', rank: 1};
function dueMemory() { return M.captureTraining(M.newState(), {attempts: [{id: 'order-old-initial', word: word.word, meaning: word.meaning, submittedAt: '2026-10-20T12:00:00.000Z', correct: true}]}); }
function mounted(initial) {
  let memory = initial, session, controllerOptions;
  const f = fixture({id: 'vocabulary-order', skill: 'vocabulary', type: 'vocabulary', questions: [], vocabulary: [word]}, {
    search: '?day=2',
    setup(data, material, tasks) { const task = tasks.find(task => task.id === 'vocabulary'); task.materialIds = [material.id]; data.days = [{day: 2, week: 1, tasks: [task]}]; },
    window: {
      IELTSEssentialCourse: {state: options => Course.state({...options, memory, engine: E, memoryEngine: M, vocabularyData: {entries: [word]}, contextual: {daily: () => ({available: false})}}), mount() {}},
      IELTSMemory: {...M, read: () => memory},
      IELTSVocabularyPractice: {...V, mount(_host, options) { controllerOptions = options; session = V.createSession(options); options.onChange(session.getState()); return {getDraft: session.getDraft, getState: session.getState, getMediaState: () => ({busy: false}), pause() {}, destroy() {}}; }}
    }
  });
  return {...f, setMemory(value) { memory = value; }, memory: () => memory, session: () => session, changed() { controllerOptions.onChange(session.getState()); }};
}

test('opening a new core vocabulary original through the sidebar cannot bypass outstanding daily reviews', async () => {
  const memory = dueMemory(), before = JSON.stringify(memory), f = mounted(memory); await settle();
  await f.nodes.get('courseTasks').children.find(node => node.dataset.taskId === 'vocabulary').fire('click');
  await f.nodes.get('courseBegin').fire('click'); await settle();
  assert.equal(f.win.IELTSTodayNavigation.current().active, false);
  assert.equal(f.win.IELTSTodayNavigation.allDrafts().length, 0);
  assert.equal(f.records().length, 0);
  assert.match(f.nodes.get('courseNotice').textContent, /先完成今日必做词汇复习/);
  assert.equal(f.nodes.get('courseNotice').querySelector('a').href, '词汇记忆.html?day=2');
  assert.equal(JSON.stringify(memory), before);
});

test('an already started vocabulary draft resumes its exact typed progress when reviews later become due', async () => {
  const f = mounted(M.newState()); await settle();
  await f.nodes.get('courseBegin').fire('click'); await settle();
  assert.equal(f.win.IELTSTodayNavigation.current().active, true, f.nodes.get('courseNotice').textContent);
  f.session().recordSpelling(0, word.word); f.changed();
  await f.nodes.get('coursePause').fire('click');
  const old = f.win.IELTSTodayNavigation.allDrafts()[0], text = old.text, binding = JSON.stringify(old.materialBinding);
  assert.ok(text.includes('garden'));
  f.setMemory(dueMemory()); const memoryRaw = JSON.stringify(f.memory());
  await f.win.IELTSTodayNavigation.resumeDraft(old.id); await settle();
  const restored = f.win.IELTSTodayNavigation.allDrafts().find(draft => draft.id === old.id);
  assert.equal(f.win.IELTSTodayNavigation.current().active, true);
  assert.equal(restored.text, text);
  assert.equal(JSON.stringify(restored.materialBinding), binding);
  assert.equal(f.win.IELTSTodayNavigation.allDrafts().length, 1);
  assert.equal(f.session().getState().learning.items[0].spellings, 1);
  assert.equal(JSON.stringify(f.memory()), memoryRaw);
  assert.equal(f.records().length, 0);
});
