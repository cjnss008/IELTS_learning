'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {materials} = require('../tools/foundation-sounds.cjs');
const Assessment = require('../assets/assessment-core.js');
const numberNames = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const choice = question => question.options[question.answer === 'A' ? 0 : 1].slice(3);

test('foundation listening provides eight original modules with 64 single-choice items', () => {
  assert.equal(materials.length, 8);
  const ids = new Set();
  materials.forEach((material, index) => {
    assert.equal(material.id, 'sounds-' + String(index + 1).padStart(2, '0'));
    assert.equal(material.week, index + 1);
    assert.equal(material.level, index === 0 ? 'A0' : 'A1');
    assert.equal(material.version, '1');
    assert.equal(material.skill, 'listening');
    assert.equal(material.pool, 'training');
    assert.equal(material.type, 'sounds');
    assert.equal(material.fullTest, false);
    assert.equal(material.questionCount, 8);
    assert.equal(material.questions.length, material.questionCount);
    assert.equal(material.source.kind, 'original');
    assert.equal(material.source.verification, 'reviewed');
    assert.ok(material.source.rights);
    assert.match(material.source.method, /试听/);
    assert.match(material.instructions, /听辨/);
    assert.match(material.instructions, /不能.*发音/);
    assert.match(material.instructions, /暂停/);
    material.questions.forEach((question, qIndex) => {
      const uniqueId = material.id + ':' + question.id;
      assert.ok(!ids.has(uniqueId));
      ids.add(uniqueId);
      assert.equal(question.id, 'q' + (qIndex + 1));
      assert.equal(question.type, 'single');
      assert.equal(question.options.length, 2);
      assert.equal(new Set(question.options).size, 2);
      assert.match(question.options[0], /^A\. \S/);
      assert.match(question.options[1], /^B\. \S/);
      assert.ok(['A', 'B'].includes(question.answer));
      assert.ok(question.explanation.length >= 20);
      assert.match(question.explanation, /[\u3400-\u9fff]/);
      assert.ok(question.evidence.length > 5);
      assert.ok(!question.prompt.includes(question.evidence));
    });
    // Avoid an answer-key bias within any one short foundation module.
    assert.equal(material.questions.filter(question => question.answer === 'A').length, 4);
    assert.equal(material.questions.filter(question => question.answer === 'B').length, 4);
  });
  assert.equal(ids.size, 64);
});

test('letter keys and full-string answers agree with the actual course grader', () => {
  for (const material of materials) {
    const answers = {};
    for (const question of material.questions) {
      const selected = question.options[question.answer === 'A' ? 0 : 1];
      const distractor = question.options[question.answer === 'A' ? 1 : 0];
      assert.deepEqual(question.answers, [selected]);
      assert.equal(Assessment.gradeQuestion(question, selected).correct, true);
      assert.equal(Assessment.gradeQuestion(question, distractor).correct, false);
      answers[question.id] = selected;
    }
    const grade = Assessment.gradeMaterial(material, answers);
    assert.equal(grade.correct, material.questions.length);
  }
});

test('every item has an English numbered cue, two supported readings, and a response interval', () => {
  for (const material of materials) {
    assert.doesNotMatch(material.transcript, /[\u3400-\u9fff]/);
    assert.doesNotMatch(material.transcript, /<[^>]+>|\[[^\]]+\]/);
    const blocks = material.transcript.split(/\n\n/).slice(1, -1);
    assert.equal(blocks.length, material.questions.length);
    material.questions.forEach((question, index) => {
      const block = blocks[index];
      assert.ok(block.startsWith('Number ' + numberNames[index] + '.'));
      assert.equal(block.split(question.evidence).length - 1, 2);
      assert.ok(block.indexOf('Again.') > block.indexOf(question.evidence));
      assert.ok(block.lastIndexOf(question.evidence) < block.indexOf('Choose your answer now.'));
      assert.match(block, /Take your time before the next item\./);
    });
  }
});

test('letter names, number contrasts and word pairs are supported by the spoken target', () => {
  for (const question of materials[0].questions) {
    const letters = [...question.evidence.matchAll(/Capital ([AEIGJ])\./g)].map(match => match[1]);
    assert.ok(letters.length === 1 || letters.length === 2);
    assert.equal(choice(question), letters.join(' — '));
  }
  const numbers = {fifteen: 15, thirty: 30, forty: 40, sixteen: 16, seventy: 70, eighteen: 18, nineteen: 19, twenty: 20};
  for (const question of materials[1].questions) {
    const spoken = question.evidence.match(/^The number is ([a-z]+)\.$/)[1];
    assert.ok(Number.isInteger(numbers[spoken]));
    assert.equal(choice(question), numbers[spoken] + ' — ' + spoken);
    assert.ok(!question.prompt.includes(spoken));
  }
  for (const material of materials.slice(2, 5)) {
    for (const question of material.questions) {
      const spoken = question.evidence.match(/([a-z]+)\.$/)[1];
      assert.ok(choice(question).startsWith(spoken + ' — '));
      assert.ok(!question.prompt.includes(spoken));
      assert.ok(question.explanation.includes(spoken));
      const other = question.options[question.answer === 'A' ? 1 : 0].slice(3).split(' — ')[0];
      assert.ok(!question.evidence.includes(other + '.'));
    }
  }
});

test('stress choices use common stress and disambiguate record with noun and verb contexts', () => {
  const fixedStress = {table: 'TA-ble', about: 'a-BOUT', teacher: 'TEA-cher', begin: 'be-GIN', window: 'WIN-dow', hotel: 'ho-TEL'};
  const questions = materials[5].questions;
  for (const question of questions.slice(0, 6)) {
    const spoken = question.evidence.match(/^The word is ([a-z]+)\.$/)[1];
    assert.ok(choice(question).startsWith(fixedStress[spoken] + '（'));
  }
  assert.equal(questions[6].evidence, 'This is a record.');
  assert.ok(choice(questions[6]).startsWith('RE-cord（'));
  assert.match(questions[6].explanation, /名词/);
  assert.equal(questions[7].evidence, 'Please record the song.');
  assert.ok(choice(questions[7]).startsWith('re-CORD（'));
  assert.match(questions[7].explanation, /动词/);
});

test('plural and past-tense endings have the correct sound class and extra-syllable distinction', () => {
  const endings = {cats: '/s/', dogs: '/z/', buses: '/ɪz/', books: '/s/', worked: '/t/', played: '/d/', wanted: '/ɪd/', watched: '/t/'};
  for (const [index, question] of materials[6].questions.entries()) {
    const spoken = question.evidence.match(/^The word is ([a-z]+)\.$/)[1];
    assert.ok(choice(question).startsWith(endings[spoken]));
    assert.match(question.prompt, index < 4 ? /复数.*-s/ : /过去式.*-ed/);
    if (spoken === 'buses' || spoken === 'wanted') {
      assert.match(choice(question), /增加一个弱读音节/);
    } else {
      assert.match(choice(question), /不加音节/);
    }
  }
});

test('connected-phrase options are distinct phrases with a literal English audio basis', () => {
  for (const question of materials[7].questions) {
    const selected = choice(question).split(' — ')[0].toLowerCase();
    const other = question.options[question.answer === 'A' ? 1 : 0].slice(3).split(' — ')[0].toLowerCase();
    assert.ok(question.evidence.toLowerCase().includes(selected));
    assert.ok(!question.evidence.toLowerCase().includes(other));
    assert.ok(!question.prompt.toLowerCase().includes(selected));
    assert.match(question.explanation, /接|连|弱读/);
  }
});
