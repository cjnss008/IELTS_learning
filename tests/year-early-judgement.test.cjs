'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const project = path.resolve(__dirname, '..');
const dependencyRoot = fs.existsSync(path.join(project, 'tools', 'year-expansion-manifest.cjs')) ? project : path.resolve(__dirname, '../../../public-course-source');
const sourceRoot = process.env.IELTS_TEST_VALIDATOR_VARIANT === 'before' ? path.resolve(__dirname, '../../inputs') : path.join(project, 'tools');
const manifestContract = {VERSION: 'year-expansion-69', STAGES: [], jobs: []};
const safeFS = {...fs, mkdirSync() {}};
function loadModule(code, filename, job) {
  const mod = {exports: {}};
  function localRequire(request) {
    if (request === 'node:fs') return safeFS;
    if (request === './year-expansion-manifest.cjs') return {...manifestContract, ...(job ? {jobs: [job]} : {})};
    if (request === './curriculum-manifest.cjs') return {jobs: []};
    if (request === './author-curriculum.cjs') {
      const target = path.join(dependencyRoot, 'tools', 'author-curriculum.cjs');
      return loadModule(fs.readFileSync(target, 'utf8'), target);
    }
    if (request.startsWith('node:')) return require(request);
    return require(path.resolve(dependencyRoot, 'tools', request));
  }
  localRequire.main = {};
  const context = {Buffer, URL, AbortSignal, console, setTimeout, clearTimeout, fetch() {throw new Error('Author API must never run in these tests');}};
  vm.runInNewContext('(function(require,module,exports,__filename,__dirname){' + code + '\n})', context, {filename})(localRequire, mod, mod.exports, filename, path.dirname(filename));
  return mod.exports;
}
function author() {
  const file = path.join(sourceRoot, 'author-year-expansion.cjs');
  return loadModule(fs.readFileSync(file, 'utf8'), file);
}
function year(job) {
  const file = path.join(sourceRoot, 'year-expansion.cjs');
  return loadModule(fs.readFileSync(file, 'utf8'), file, job);
}
function fixture({week = 1, level = 'A0', extra = 'Not given.'} = {}) {
  const job = {id: 'expand-w01-listen-2', yearExpansion: manifestContract.VERSION, skill: 'listening', type: 'dialogue', pool: 'training', fullTest: false, requireAudioHash: true, week, level, minWords: 1, maxWords: 200, questionCount: 1};
  const text = 'Mia: Good morning. I am Mia. I am a student. This is a book. The room is small. There is a table. There are two chairs. There is a clock. The door is open. Ben: Hello. I am Ben. I am a new student. Yes, I am a visitor.';
  const data = {...job, title: 'A test visitor', instructions: '测试用原创模拟场景，不是真实学习记录。', transcript: text, questions: [{id: 'q1', type: 'single', prompt: 'Is Ben a visitor?', options: ['Yes.', 'No.', ...(extra === null ? [] : [extra])], answers: ['Yes.'], explanation: 'Ben自己明确说是访客。', evidence: 'Yes, I am a visitor.'}], vocabulary: ['student', 'book', 'room', 'table', 'chairs', 'clock', 'door', 'visitor'].map(word => ({word, meaning: '测试词', example: text})), grammar: {explanation: '用be连接人物和身份。', example: 'I am a student.', questions: Array.from({length: 8}, (_, i) => ({id: 'g' + (i + 1), type: 'single', prompt: 'I ___ a student.', options: ['am', 'are'], answers: ['am'], explanation: 'I搭配am。', evidence: 'I am a student.'}))}, transfer: {speaking: {part1: ['What is your name?'], part2: 'Describe a different room.', part3: ['What is in your room?']}, writing: 'Write about a different room using your own details.'}, source: {kind: 'original', verification: 'reviewed'}, version: '1'};
  return {job, data};
}
function authorEarlyErrors(setup) {return Array.from(author().validate(setup.job, setup.data)).filter(message => /^Early source needs concrete direct questions/.test(message));}
function loadYear(setup) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ielts-early-judgement-'));
  try {
    const materials = path.join(directory, 'curriculum', 'materials');
    fs.mkdirSync(materials, {recursive: true});
    fs.writeFileSync(path.join(materials, setup.job.id + '.json'), JSON.stringify(setup.data));
    return year(setup.job).load({root: directory, partial: true, derive: false, requireAudio: false});
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('ielts-early-judgement-'));
    fs.rmSync(directory, {recursive: true, force: true});
  }
}

test('author validator rejects early judgement labels with trailing punctuation and surrounding whitespace', () => {
  for (const extra of ['Not given.', ' Not Given.  ', 'NOT   GIVEN!?', 'Not given。', 'False!', 'True…']) {
    assert.equal(authorEarlyErrors(fixture({extra})).length, 1, 'Missed abstract label: ' + JSON.stringify(extra));
    assert.equal(authorEarlyErrors(fixture({week: 8, level: 'A1', extra})).length, 1, 'A1 boundary missed: ' + JSON.stringify(extra));
  }
});
test('year loader rejects the same early labels instead of loading them as ordinary sources', () => {
  for (const extra of ['Not given.', ' Not Given.  ', 'NOT   GIVEN!?', 'Not given。', 'False!', 'True…']) {
    for (const level of ['A0', 'A1']) {
      const state = loadYear(fixture({level, extra}));
      assert.equal(state.materials.length, 0, 'Unexpectedly loaded ' + level + '/' + JSON.stringify(extra));
      assert.ok(state.audit.errors.some(row => /Early source needs concrete direct questions/.test(row.error)));
    }
  }
});
test('literal supported Yes/No questions continue to pass both validators', () => {
  const setup = fixture({extra: null});
  assert.equal(author().validate(setup.job, setup.data).length, 0);
  const state = loadYear(setup);
  assert.equal(state.materials.length, 1);
  assert.equal(state.audit.errors.length, 0);
});
test('judgement words inside a descriptive distractor are not treated as standalone labels', () => {
  const setup = fixture({extra: 'The book is not given to a visitor.'});
  assert.equal(author().validate(setup.job, setup.data).length, 0);
  assert.equal(loadYear(setup).materials.length, 1);
});
test('later A2 sources retain their existing judgement-question eligibility', () => {
  const setup = fixture({week: 12, level: 'A2', extra: 'Not given.'});
  assert.equal(author().validate(setup.job, setup.data).length, 0);
  assert.equal(loadYear(setup).materials.length, 1);
});
test('unpunctuated early labels remain rejected', () => {
  for (const extra of ['True', 'False', 'Not Given']) {
    const setup = fixture({extra});
    assert.equal(authorEarlyErrors(setup).length, 1);
    assert.equal(loadYear(setup).materials.length, 0);
  }
});
