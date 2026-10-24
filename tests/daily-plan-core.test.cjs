'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../assets/daily-plan-core.js');

function fixtureContent() {
  return { weeks: Array.from({ length: 52 }, (_, index) => ({
    week: index + 1,
    title: '学习主题 ' + (index + 1),
    grammarFocus: '主语与谓语配合',
    readingFocus: '理解主旨和细节',
    listeningFocus: '听清时间与关键动作',
    speakingPrompts: ['介绍自己', '介绍一天的安排', '解释一次选择'],
    writingPrompts: ['写个人信息', '写日常安排', '说明一个观点'],
    guidance: '按当前基础选择练习材料。'
  })) };
}

function validRecord(definition) {
  return { actualMinutes: definition.minutes, actualQuantity: definition.quantity, evidence: '保存了原始练习和订正稿，并记录了下一次要重练的具体内容。' };
}

test('52周加第365天年度总结，13次阶段测评与2190小时可用预算', () => {
  const content = fixtureContent();
  assert.deepEqual(core.getCourseSummary(content), {
    days: 365, 'year-reviewDays':1, weeks: 52, studyDays: 312, reviewDays: 39, checkpointDays: 13,
    minutes: 131400, hours: 2190
  });
  const all = Array.from({ length: 364 }, (_, index) => core.buildDay(index + 1, content));
  assert.equal(all[0].week, 1);
  assert.equal(all[0].weekday, 1);
  assert.equal(all[363].week, 52);
  assert.equal(all[363].weekday, 7);
  for (const plan of all) {
    assert.equal(plan.totalMinutes, 360);
    assert.equal(plan.totalMinutes, plan.tasks.reduce((sum, item) => sum + item.minutes, 0));
    assert.equal(new Set(plan.tasks.map(item => item.id)).size, plan.tasks.length);
    for (const skill of ['listening', 'reading', 'speaking', 'writing']) {
      assert.ok(plan.tasks.some(item => item.skill === skill), `${plan.dayNumber} 缺少 ${skill}`);
    }
    assert.ok(plan.tasks.every(item => Number.isInteger(item.quantity) && item.quantity > 0 && item.evidenceHint));
  }
});

test('常规学习周42小时，第52周另含年度总结；阶段测评每4周第7天', () => {
  const content = fixtureContent();
  for (let week = 1; week <= 52; week++) {
    const plans = core.getWeekSchedule(week, content);
    assert.equal(plans.length, week===52?8:7);
    assert.equal(plans.reduce((sum, item) => sum + item.totalMinutes, 0), week===52?2880:2520);
    assert.ok(plans.slice(0, 6).every(item => item.kind === 'study'));
    assert.equal(plans[6].kind, week % 4 === 0 ? 'checkpoint' : 'review');
  }
});

test('学习任务随阶段推进且每日提示轮换', () => {
  const content = fixtureContent();
  const first = core.buildDay(1, content);
  const second = core.buildDay(2, content);
  const academic = core.buildDay(141, content);
  const timed = core.buildDay(253, content);
  assert.notEqual(first.tasks.find(item => item.id === 'speaking').instruction, second.tasks.find(item => item.id === 'speaking').instruction);
  assert.notEqual(first.tasks.find(item => item.id === 'grammar').instruction, second.tasks.find(item => item.id === 'grammar').instruction);
  assert.equal(first.tasks.find(item => item.id === 'listening').quantity, 10);
  assert.equal(academic.tasks.find(item => item.id === 'listening').quantity, 20);
  assert.equal(timed.tasks.find(item => item.id === 'listening').quantity, 30);
  assert.match(core.buildDay(28, content).tasks.find(item => item.id === 'listening').instruction, /不换算雅思分数/);
  assert.equal(core.buildDay(280, content).tasks.find(item => item.id === 'listening').quantity, 40);
  assert.equal(core.buildDay(364, content).tasks.find(item => item.id === 'writing').quantity, 2);
});

test('生成日程不改写传入课程，返回的提示数组也独立', () => {
  const content = fixtureContent();
  const original = JSON.stringify(content);
  content.weeks.forEach(info => { Object.freeze(info.speakingPrompts); Object.freeze(info.writingPrompts); Object.freeze(info); });
  Object.freeze(content.weeks);
  Object.freeze(content);
  const plan = core.buildDay(1, content);
  plan.weekInfo.speakingPrompts[0] = '另一条提示';
  assert.equal(JSON.stringify(content), original);
});

test('越界日序、错误课程与重复周数据明确报错', () => {
  const content = fixtureContent();
  for (const value of [0, -1, 366, 1.5, '1', NaN, Infinity]) assert.throws(() => core.buildDay(value, content), RangeError);
  assert.throws(() => core.buildDay(1, null), TypeError);
  assert.throws(() => core.buildDay(1, { weeks: [] }), TypeError);
  const duplicate = fixtureContent();
  duplicate.weeks[1].week = 1;
  assert.throws(() => core.buildDay(1, duplicate), /缺失或重复/);
  const incomplete = fixtureContent();
  incomplete.weeks[0].speakingPrompts = [];
  assert.throws(() => core.buildDay(1, incomplete), /至少需要 3 条/);
  assert.throws(() => core.getWeekSchedule(53, content), RangeError);
});

test('分钟、完成量和成果文字三个条件必须同时满足', () => {
  const definition = core.buildDay(1, fixtureContent()).tasks[0];
  const valid = validRecord(definition);
  assert.deepEqual(core.validateTask(definition, valid), { complete: true, issues: [] });
  assert.equal(core.validateTask(definition, { ...valid, actualMinutes: definition.minutes - 1 }).complete, false);
  assert.equal(core.validateTask(definition, { ...valid, actualQuantity: definition.quantity - 1 }).complete, false);
  assert.equal(core.validateTask(definition, { ...valid, evidence: '今天完成了' }).complete, false);
  assert.equal(core.validateTask(definition, { ...valid, evidence: ' \n\t\u200B\u200D'.repeat(20) }).complete, false);
  assert.equal(core.validateTask(definition, { ...valid, evidence: '一二三四五六七八九十甲乙' }).complete, true);
  assert.equal(core.validateTask(definition, { ...valid, actualMinutes: String(definition.minutes), actualQuantity: String(definition.quantity) }).complete, true);
});

test('缺失记录、非有限值和伪造完成标记均不产生完成状态', () => {
  const definition = core.buildDay(1, fixtureContent()).tasks[0];
  assert.equal(core.validateTask(definition).complete, false);
  assert.equal(core.validateTask(definition, { complete: true }).complete, false);
  for (const value of [Infinity, NaN, true, null, {}, [], '', 'NaN', 'Infinity', '-1', -1, 45.5, '45.5', 601, 1441]) {
    assert.equal(core.validateTask(definition, { ...validRecord(definition), actualMinutes: value }).complete, false, String(value));
  }
  for (const value of [1.5, Infinity, NaN, true, null, {}, '1.5', 10001, 100001]) {
    assert.equal(core.validateTask(definition, { ...validRecord(definition), actualQuantity: value }).complete, false, String(value));
  }
  assert.throws(() => core.validateTask({ id: 'bad', minutes: 0, quantity: 1 }, {}), TypeError);
});

test('整日完成只依据当前全部任务，保留部分用时并忽略额外记录', () => {
  const plan = core.buildDay(1, fixtureContent());
  assert.deepEqual(core.summarizeDay(plan, {}), { complete: false, completedTasks: 0, totalTasks: 7, minutes: 0, requiredMinutes: 360 });
  const records = Object.fromEntries(plan.tasks.map(item => [item.id, validRecord(item)]));
  records.unrelated = { actualMinutes: 1000, actualQuantity: 1000, evidence: '这条旧记录不属于当前任务' };
  assert.deepEqual(core.summarizeDay(plan, records), { complete: true, completedTasks: 7, totalTasks: 7, minutes: 360, requiredMinutes: 360 });
  records.listening = { ...records.listening, actualMinutes: 20, complete: true };
  assert.deepEqual(core.summarizeDay(plan, records), { complete: false, completedTasks: 6, totalTasks: 7, minutes: 305, requiredMinutes: 360 });
  const inherited = Object.create(Object.fromEntries(plan.tasks.map(item => [item.id, validRecord(item)])));
  assert.equal(core.summarizeDay(plan, inherited).completedTasks, 0);
  assert.throws(() => core.summarizeDay({ tasks: [] }, {}), TypeError);
  assert.throws(() => core.summarizeDay({ tasks: [plan.tasks[0], plan.tasks[0]] }, {}), /不得重复/);
});

test('单任务满足上限但整日超过24小时仍不得提交完成', () => {
  const plan = core.buildDay(1, fixtureContent());
  const records = Object.fromEntries(plan.tasks.map(item => [item.id, { ...validRecord(item), actualMinutes: 600 }]));
  const summary = core.summarizeDay(plan, records);
  assert.equal(summary.completedTasks, plan.tasks.length);
  assert.equal(summary.minutes, 4200);
  assert.equal(summary.complete, false);
});

test('日期严格校验真实日历，正确处理闰年和格式', () => {
  assert.equal(core.parseStartDate('2024-02-29').toISOString(), '2024-02-29T00:00:00.000Z');
  assert.equal(core.parseStartDate('0001-01-01').getUTCFullYear(), 1);
  for (const value of ['2023-02-29', '1900-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '0000-01-01']) {
    assert.throws(() => core.parseStartDate(value), RangeError, value);
  }
  for (const value of ['2026-1-01', '2026-01-1', '2026/01/01', '2026-01-01T00:00:00Z', ' 2026-01-01', '', null, new Date()]) {
    assert.throws(() => core.parseStartDate(value), TypeError, String(value));
  }
  assert.equal(core.parseStartDate('2000-02-29').getUTCDate(), 29);
});

test('相对日序不受夏令时影响，可识别尚未开始和已超52周', () => {
  assert.equal(core.dayForDate('2026-10-24', '2026-10-24'), 1);
  assert.equal(core.dayForDate('2026-10-24', '2026-10-23'), 0);
  assert.equal(core.dayForDate('2026-10-24', '2026-10-22'), -1);
  assert.equal(core.dayForDate('2026-10-24', '2027-10-23'), 365);
  assert.equal(core.dayForDate('2026-03-07', '2026-03-09'), 3);
  assert.equal(core.dayForDate('2026-10-31', '2026-11-02'), 3);
  assert.equal(core.dayForDate('2024-02-28', '2024-03-01'), 3);
  assert.equal(core.dateForDay('2026-10-24', 364), '2027-10-22');
  for (let day = 1; day <= 364; day++) assert.equal(core.dayForDate('2024-02-01', core.dateForDay('2024-02-01', day)), day);
  assert.throws(() => core.dateForDay('2026-01-01', 0), RangeError);
  assert.throws(() => core.dateForDay('9999-12-31', 2), RangeError);
});

test('浏览器直接script加载无需Node、DOM或构建步骤', () => {
  const source = fs.readFileSync(path.join(__dirname, '../assets/daily-plan-core.js'), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source, context);
  assert.equal(typeof context.IELTSPlanCore.buildDay, 'function');
  assert.equal(context.IELTSPlanCore.COURSE_DAYS, 365);
  assert.equal(context.IELTSPlanCore.dayForDate('2026-10-24', '2026-10-25'), 2);
});

test('完整写作保留首稿与订正轮换，常规任务合计48组首稿且每日仍360分钟', () => {
  const content = fixtureContent();
  let totalFirstDrafts = 0;
  for (let week = 21; week <= 52; week++) {
    const plans = core.getWeekSchedule(week, content).slice(0, 6);
    const writing = plans.map(plan => plan.tasks.find(task => task.id === 'writing'));
    const firstDrafts = writing.filter(task => task.unit === '份首稿');
    assert.equal(firstDrafts.length, week <= 36 ? 2 : 4);
    assert.equal(firstDrafts.filter(task => task.title.includes('Task 1')).length, week <= 36 ? 1 : 2);
    assert.equal(firstDrafts.filter(task => task.title.includes('Task 2')).length, week <= 36 ? 1 : 2);
    assert.ok(writing.some(task => task.unit === '份订正稿'));
    assert.ok(writing.every(task => task.minutes === 75));
    assert.ok(plans.every(plan => plan.totalMinutes === 360));
    totalFirstDrafts += firstDrafts.length;
  }
  assert.equal(totalFirstDrafts, 96);
  assert.equal(core.buildDay(1, content).tasks.find(task => task.id === 'writing').unit, '个完整句');
});
