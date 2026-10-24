'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../assets/daily-plan-core.js');
const stateApi = require('../assets/daily-plan-state.js');

function content() {
  return { weeks: Array.from({ length: 52 }, (_, index) => ({
    week: index + 1, title: '学习主题 ' + (index + 1), grammarFocus: '句子结构', readingFocus: '主旨和细节', listeningFocus: '听清关键词',
    speakingPrompts: ['个人信息', '日常安排', '表达观点'], writingPrompts: ['个人信息', '日常安排', '说明理由']
  })) };
}

function foundation(overrides = {}) {
  return { week: 1, date: '2026-01-07', type: 'foundation', source: '第一周基础测评', notes: '保留了原始作答与具体反馈，听力弱读仍需专项练习。', result: 'reinforce', weakSkills: ['listening'], reviewed: false, ...overrides };
}

function scored(overrides = {}) {
  return { id: 'mock-one', week: 1, date: '2026-01-07', type: 'mock', source: '陌生模拟卷第一套', notes: '四项均保存了原始作答，并由评阅者结合证据反馈。', scores: { listening: 7, speaking: 7, reading: 7, writing: 7 }, reviewed: true, ...overrides };
}

function withAssessments(assessments) {
  return { ...stateApi.newState('2026-01-01'), assessments };
}

test('新状态与JSON往返保留合法草稿，数值字符串规范为数字', () => {
  const original = stateApi.newState('2026-01-01');
  assert.deepEqual(original, { schemaVersion: 1, startDate: '2026-01-01', days: {}, assessments: [], boosts: {} });
  original.days['1'] = { tasks: { vocabulary: { actualMinutes: '', actualQuantity: null, evidence: '' }, listening: { actualMinutes: '75', actualQuantity: '10', evidence: '保留了听写原稿与逐句订正，明天重练漏听的冠词。' } } };
  const clean = stateApi.parseState(JSON.stringify(original));
  assert.deepEqual(clean.days['1'].tasks.vocabulary, { actualMinutes: null, actualQuantity: null, evidence: '' });
  assert.equal(clean.days['1'].tasks.listening.actualMinutes, 75);
  assert.equal(clean.days['1'].tasks.listening.actualQuantity, 10);
  assert.notEqual(clean, original);
  assert.notEqual(clean.days['1'].tasks, original.days['1'].tasks);
});

test('导入拒绝schema、日期、日键、未知字段、错误数组与稀疏数组', () => {
  const base = stateApi.newState('2026-01-01');
  for (const value of ['', '{', 'null', '[]', { ...base, schemaVersion: 2 }, { ...base, startDate: '2026-02-29' }, { ...base, complete: true }, { ...base, days: [] }, { ...base, assessments: {} }, { ...base, boosts: [] }]) {
    assert.throws(() => stateApi.parseState(value));
  }
  for (const key of ['0', '01', '366', '-1', '1.5', 'week1']) {
    assert.throws(() => stateApi.parseState({ ...base, days: { [key]: { tasks: {} } } }));
  }
  const sparse = new Array(1);
  assert.throws(() => stateApi.parseState({ ...base, assessments: sparse }), /空数组项/);
  const extraArrayKey = [];
  extraArrayKey.fake = true;
  assert.throws(() => stateApi.parseState({ ...base, assessments: extraArrayKey }), /数组字段/);
});

test('导入不接受complete标记、原型污染与访问器', () => {
  const base = stateApi.newState('2026-01-01');
  assert.throws(() => stateApi.parseState({ ...base, days: { 1: { tasks: {}, complete: true } } }));
  assert.throws(() => stateApi.parseState({ ...base, days: { 1: { tasks: { listening: { actualMinutes: 75, actualQuantity: 10, evidence: '已完成全部测试并保留了录音证据', complete: true } } } } }));
  const malicious = JSON.stringify(base).replace('"days":{}', '"days":{"__proto__":{"polluted":true}}');
  assert.throws(() => stateApi.parseState(malicious));
  assert.equal({}.polluted, undefined);
  assert.throws(() => stateApi.parseState({ ...base, constructor: {} }));
  assert.throws(() => stateApi.parseState(Object.assign(Object.create({ polluted: true }), base)));
  const accessor = { ...base };
  Object.defineProperty(accessor, 'days', { enumerable: true, get() { throw new Error('访问器不应执行'); } });
  assert.throws(() => stateApi.parseState(accessor), /访问器/);
});

test('任务记录限制600分钟、整数完成量10000和1200字符证据', () => {
  function input(record) { return { ...stateApi.newState('2026-01-01'), days: { 1: { tasks: { listening: record } } } }; }
  const valid = { actualMinutes: 600, actualQuantity: 10000, evidence: '字'.repeat(1200) };
  assert.equal(stateApi.parseState(input(valid)).days['1'].tasks.listening.actualMinutes, 600);
  for (const record of [{ ...valid, actualMinutes: 601 }, { ...valid, actualMinutes: 75.5 }, { ...valid, actualMinutes: '75.5' }, { ...valid, actualMinutes: Infinity }, { ...valid, actualMinutes: true }, { ...valid, actualQuantity: 10001 }, { ...valid, actualQuantity: 1.5 }, { ...valid, evidence: '字'.repeat(1201) }, { ...valid, evidence: {} }]) {
    assert.throws(() => stateApi.parseState(input(record)));
  }
  assert.throws(() => stateApi.parseState({ ...stateApi.newState('2026-01-01'), days: { 1: { tasks: { boost: valid } } } }), /未知任务/);
});

test('导入拒绝超过24小时的日总分钟数以及不能容纳364天的开课日期', () => {
  const state = stateApi.newState('2026-01-01');
  state.days['1'] = { tasks: { listening: { actualMinutes: 600 }, reading: { actualMinutes: 600 }, writing: { actualMinutes: 241 } } };
  assert.throws(() => stateApi.parseState(state), /1440/);
  state.days['1'].tasks.writing.actualMinutes = 240;
  assert.doesNotThrow(() => stateApi.parseState(state));
  assert.throws(() => stateApi.newState('9999-12-31'), /9999/);
  assert.throws(() => stateApi.parseState({ ...state, startDate: '9999-12-31' }), /9999/);
});

test('提交日期只接受真实、带时区ISO时间；时间戳本身不代表任务完成', () => {
  const base = stateApi.newState('2026-01-01');
  const clean = stateApi.parseState({ ...base, days: { 1: { tasks: {}, completedAt: '2026-01-01T08:00:00+08:00' } } });
  assert.equal(clean.days['1'].completedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(core.summarizeDay(core.buildDay(1, content()), clean.days['1'].tasks).complete, false);
  for (const timestamp of ['2026-01-01', '2026-02-30T00:00:00Z', '2026-01-01T24:00:00Z', '2026-01-01T00:60:00Z', '2026-01-01T00:00:00', '', null]) {
    assert.throws(() => stateApi.parseState({ ...base, days: { 1: { tasks: {}, completedAt: timestamp } } }));
  }
});

test('测评拒绝空来源、空依据、无效半分和伪造基础分数', () => {
  const base = stateApi.newState('2026-01-01');
  const invalid = [
    foundation({ source: '  a  ' }), foundation({ notes: '\u200B'.repeat(20) }), foundation({ weakSkills: [] }), foundation({ weakSkills: ['reading', 'reading'] }),
    foundation({ result: 'maybe' }), foundation({ scores: { listening: 9 } }), foundation({ source: '字'.repeat(241) }), foundation({ notes: '字'.repeat(2001) }),
    scored({ scores: { listening: 6.7, speaking: 7, reading: 7, writing: 7 } }), scored({ scores: { listening: '7', speaking: 7, reading: 7, writing: 7 } }),
    scored({ scores: { listening: 7, speaking: 7, reading: 7 } }), scored({ scores: { listening: 10, speaking: 7, reading: 7, writing: 7 } }), scored({ reviewed: 'true' })
  ];
  for (const entry of invalid) assert.throws(() => stateApi.addAssessment(base, entry, '2026-01-07', content()));
});

test('未来日期、未来学习周和早于开课日期的测评被拒绝', () => {
  const base = stateApi.newState('2026-01-01');
  assert.throws(() => stateApi.addAssessment(base, foundation({ date: '2026-01-08' }), '2026-01-07', content()), /晚于今天/);
  assert.throws(() => stateApi.addAssessment(base, foundation({ week: 2, date: '2026-01-07' }), '2026-01-07', content()), /尚未到达/);
  assert.throws(() => stateApi.addAssessment(base, foundation({ date: '2025-12-31' }), '2026-01-07', content()), /早于课程/);
  assert.throws(() => stateApi.addAssessment(base, foundation({ week: 53 }), '2027-01-01', content()));
  assert.doesNotThrow(() => stateApi.addAssessment(base, foundation({ week: 2, date: '2026-01-08' }), '2026-01-08', content()));
});

test('补强从当前日期和测评周末之后安排6个学习日，跳过完成历史和已有补强', () => {
  const base = stateApi.newState('2026-01-01');
  const initial = stateApi.addAssessment(base, foundation({ id: 'first', weakSkills: ['listening', 'writing'] }), '2026-01-07', content());
  assert.deepEqual(initial.boostDays, [8, 9, 10, 11, 12, 13]);
  assert.equal(initial.state.boosts['8'].skill, 'listening');
  assert.equal(initial.state.boosts['9'].skill, 'writing');
  initial.state.days['15'] = { tasks: {}, completedAt: '2026-01-09T12:00:00Z' };
  const before = JSON.stringify(initial.state);
  const next = stateApi.addAssessment(initial.state, foundation({ id: 'second', weakSkills: ['reading'] }), '2026-01-10', content());
  assert.deepEqual(next.boostDays, [16, 17, 18, 19, 20, 22]);
  assert.equal(next.state.boosts['8'].assessmentId, 'first');
  assert.equal(next.state.boosts['16'].assessmentId, 'second');
  assert.equal(next.state.boosts['15'], undefined);
  assert.equal(next.state.boosts['14'], undefined);
  assert.equal(JSON.stringify(initial.state), before);
  assert.deepEqual(stateApi.parseState(next.state), next.state);
});

test('导入和readiness均拒绝未来测评，提交时间不得超过指定今天的结束', () => {
  const state = withAssessments([
    scored({ id: 'future-1', date: '2026-01-08', source: '未来模拟试卷一' }),
    scored({ id: 'future-2', date: '2026-01-09', source: '未来模拟试卷二' }),
    scored({ id: 'future-3', date: '2026-01-10', source: '未来模拟试卷三' })
  ]);
  assert.throws(() => stateApi.parseState(state, '2026-01-07'), /晚于今天/);
  assert.throws(() => stateApi.readiness(state, '2026-01-07'), /晚于今天/);
  assert.equal(stateApi.readiness(state, '2026-01-10').ready, true);
  const records = stateApi.newState('2026-01-01');
  records.days['1'] = { tasks: {}, completedAt: '2026-01-03T12:00:00Z' };
  assert.throws(() => stateApi.parseState(records, '2026-01-01'), /提交时间/);
  records.days['1'].completedAt = '2026-01-01T00:00:00Z';
  assert.doesNotThrow(() => stateApi.parseState(records, '2026-01-01'));
});

test('同一日期迟到登记仍从今天之后补强，课程末尾不安排越界任务', () => {
  const base = stateApi.newState('2026-01-01');
  const late = stateApi.addAssessment(base, foundation(), '2026-01-20', content());
  assert.deepEqual(late.boostDays, [22, 23, 24, 25, 26, 27]);
  const finishDate = core.dateForDay(base.startDate, 364);
  const atEnd = stateApi.addAssessment(base, foundation({ week: 52, date: finishDate }), finishDate, content());
  assert.deepEqual(atEnd.boostDays, []);
  assert.deepEqual(atEnd.weakSkills, ['listening']);
});

test('低于7的科目按最低分优先排列，未复核测评也可提供参考补强', () => {
  const base = stateApi.newState('2026-01-01');
  const result = stateApi.addAssessment(base, scored({ id: undefined, reviewed: false, weakSkills: [], scores: { listening: 6.5, speaking: 5.5, reading: 7.5, writing: 6 } }), '2026-01-07', content());
  assert.deepEqual(result.weakSkills, ['speaking', 'writing', 'listening']);
  assert.deepEqual(result.boostDays.map(day => result.state.boosts[String(day)].skill), ['speaking', 'writing', 'listening', 'speaking', 'writing', 'listening']);
  assert.match(result.state.assessments[0].id, /^a-/);
  assert.equal(stateApi.readiness(result.state).qualifyingCount, 0);
  const imported = withAssessments([scored({ weakSkills: [], scores: { listening: 6, speaking: 7, reading: 7, writing: 7 } })]);
  assert.deepEqual(stateApi.parseState(imported).assessments[0].weakSkills, ['listening']);
});

test('补强在既定6小时内重分配，保持任务数、分钟和数量，不修改原状态或课程', () => {
  const material = content();
  const scheduled = stateApi.addAssessment(stateApi.newState('2026-01-01'), foundation(), '2026-01-07', material).state;
  const beforeState = JSON.stringify(scheduled);
  const beforeContent = JSON.stringify(material);
  const ordinary = core.buildDay(8, material);
  const plan = stateApi.getPlan(scheduled, 8, material);
  assert.equal(plan.totalMinutes, 360);
  assert.equal(plan.tasks.length, ordinary.tasks.length);
  assert.equal(plan.tasks.reduce((sum, item) => sum + item.minutes, 0), 360);
  assert.deepEqual(plan.tasks.map(item => [item.id, item.minutes, item.quantity]), ordinary.tasks.map(item => [item.id, item.minutes, item.quantity]));
  assert.equal(plan.tasks.some(item => item.id === 'boost'), false);
  assert.match(plan.tasks.find(item => item.skill === 'listening').instruction, /20 分钟.*10 分钟/);
  assert.match(plan.tasks.find(item => item.skill === 'listening').evidenceHint, /复测结果/);
  assert.equal(plan.boost.skill, 'listening');
  assert.equal(JSON.stringify(scheduled), beforeState);
  assert.equal(JSON.stringify(material), beforeContent);
  assert.deepEqual(core.buildDay(8, material), ordinary);
  plan.boost.skill = 'reading';
  assert.equal(scheduled.boosts['8'].skill, 'listening');
  assert.deepEqual(stateApi.getPlan(scheduled, 1, material), core.buildDay(1, material));
});

test('导入拒绝孤立补强、非薄弱项、复盘日和测评之前的补强', () => {
  const base = withAssessments([scored({ id: 'weak', scores: { listening: 6, speaking: 7, reading: 7, writing: 7 } })]);
  for (const boosts of [
    { 8: { skill: 'listening', assessmentId: 'missing' } },
    { 8: { skill: 'writing', assessmentId: 'weak' } },
    { 7: { skill: 'listening', assessmentId: 'weak' } },
    { 14: { skill: 'listening', assessmentId: 'weak' } },
    { 365: { skill: 'listening', assessmentId: 'weak' } },
    { 8: { skill: 'listening', assessmentId: 'weak', complete: true } }
  ]) assert.throws(() => stateApi.parseState({ ...base, boosts }));
});

test('最近3次不同日期和来源的已复核模拟达到四项7才标训练参考就绪', () => {
  const entries = [
    scored({ id: 'first', date: '2026-01-07', source: '模拟试卷第一套' }),
    scored({ id: 'second', date: '2026-01-08', source: '模拟试卷第二套', scores: { listening: 7.5, speaking: 7, reading: 8, writing: 7 } }),
    scored({ id: 'third', date: '2026-01-09', source: '模拟试卷第三套' })
  ];
  assert.deepEqual(stateApi.readiness(withAssessments(entries)), { qualifyingCount: 3, ready: true, latestScores: { listening: 7, speaking: 7, reading: 7, writing: 7 } });
  assert.equal(stateApi.readiness(withAssessments(entries.slice(0, 2))).ready, false);
  assert.equal(stateApi.readiness(withAssessments([entries[0], { ...entries[1], reviewed: false }, entries[2]])).qualifyingCount, 2);
  assert.equal(stateApi.readiness(withAssessments([entries[0], { ...entries[1], type: 'official', reviewed: false }, entries[2]])).ready, true);
  assert.deepEqual(stateApi.readiness(stateApi.newState('2026-01-01')), { qualifyingCount: 0, ready: false, latestScores: null });
});

test('不能跳过最近3次中的低分或未复核结果，基础测评不参与Band门槛', () => {
  const entries = [1, 2, 3].map(index => scored({ id: 'mock-' + index, date: '2026-01-0' + (index + 1), source: '独立模拟试卷' + index }));
  const low = scored({ id: 'latest-low', date: '2026-01-06', source: '最新模拟试卷', scores: { listening: 6.5, speaking: 7, reading: 7, writing: 7 } });
  const state = withAssessments([...entries, low, foundation({ id: 'foundation-last', date: '2026-01-07', result: 'pass', weakSkills: [] })]);
  const before = JSON.stringify(state);
  const result = stateApi.readiness(state);
  assert.equal(result.ready, false);
  assert.equal(result.qualifyingCount, 2);
  assert.equal(result.latestScores.listening, 6.5);
  assert.equal(JSON.stringify(state), before);
  const chronological = withAssessments([low, entries[2], entries[0], entries[1]]);
  assert.equal(stateApi.readiness(chronological).ready, false);
  assert.equal(stateApi.readiness(chronological).latestScores.listening, 6.5);
});

test('重复日期或规范化后重复来源不能累计成3次独立证据', () => {
  const first = scored({ id: 'first', date: '2026-01-07', source: 'Mock Paper A' });
  const second = scored({ id: 'second', date: '2026-01-08', source: '  mock   paper a  ' });
  const third = scored({ id: 'third', date: '2026-01-09', source: '另一份独立模拟卷' });
  assert.deepEqual(stateApi.readiness(withAssessments([first, second, third])).qualifyingCount, 2);
  assert.equal(stateApi.readiness(withAssessments([first, { ...second, date: first.date, source: '新的独立模拟试卷' }, third])).ready, false);
});

test('104条上限和唯一id保护历史，合格测评不额外分配补强', () => {
  const entries = Array.from({ length: 104 }, (_, index) => scored({ id: 'record-' + index, source: '独立材料编号' + index }));
  assert.equal(stateApi.parseState(withAssessments(entries)).assessments.length, 104);
  assert.throws(() => stateApi.addAssessment(withAssessments(entries), scored({ id: 'extra' }), '2026-01-07', content()), /104/);
  assert.throws(() => stateApi.parseState(withAssessments([...entries, scored({ id: 'extra' })])), /104/);
  assert.throws(() => stateApi.parseState(withAssessments([scored(), scored()])), /不得重复/);
  const base = stateApi.newState('2026-01-01');
  const result = stateApi.addAssessment(base, scored(), '2026-01-07', content());
  assert.deepEqual(result.boostDays, []);
  assert.deepEqual(result.weakSkills, []);
  assert.equal(base.assessments.length, 0);
});

test('浏览器script加载兼容全局core，无需Node与DOM', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/daily-plan-core.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/daily-plan-state.js'), 'utf8'), context);
  assert.equal(typeof context.IELTSPlanState.addAssessment, 'function');
  assert.equal(context.IELTSPlanState.newState('2026-01-01').schemaVersion, 1);
  assert.equal(context.IELTSPlanState.parseState('{"schemaVersion":1,"startDate":"2026-01-01","days":{},"assessments":[],"boosts":{}}').startDate, '2026-01-01');
});
