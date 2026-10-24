'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../assets/daily-plan-core.js');
const Store = require('../assets/daily-plan-state.js');
const Records = require('../assets/learning-records.js');
const Player = require('../assets/course-player.js');
const Assessment = require('../assets/assessment-core.js');
const curriculum = require('../assets/curriculum-data.js');
require('../assets/daily-plan-content.js');
const content = global.IELTSPlanContent;
const options = { curriculum };

test('全年365天直接使用课程任务、材料和单位，保持每天360分钟', () => {
  const state = Store.newState('2026-01-01');
  let total = 0;
  for (const source of curriculum.days) {
    const plan = Store.getPlan(state, source.day, content, curriculum);
    assert.equal(plan.planVersion, 'curriculum:1.0');
    assert.equal(plan.totalMinutes, 360);
    assert.equal(plan.tasks.length, source.tasks.length);
    total += plan.totalMinutes;
    plan.tasks.forEach((task, index) => {
      const original = source.tasks[index];
      for (const field of ['id', 'minutes', 'quantity', 'unit', 'mode', 'deliverable']) assert.equal(task[field], original[field], source.day + ':' + field);
      assert.equal(task.instruction, original.instructions);
      assert.deepEqual(task.materialIds, original.materialIds);
      assert.deepEqual(task.materials.map(m => m.id), original.materialIds);
      for (const material of task.materials) {
        const url = new URL(material.url, 'http://127.0.0.1:8765/');
        assert.equal(url.searchParams.get('day'), String(source.day));
        assert.equal(url.searchParams.get('material'), material.id);
        assert.equal(url.searchParams.get('mode'), task.mode);
      }
      if (['grammar', 'vocabulary'].includes(task.id)) assert.equal(task.skill, 'foundation');
    });
  }
  assert.equal(total, curriculum.days.length * 360);
  assert.equal(Core.getCourseSummary(content, options).hours, 2190);
});

test('课程作品按真实单位汇总，整日完成仍须通过本日错题和 AI 复盘', () => {
  const source = curriculum.days.find(day => day.tasks.length === 7 && day.tasks.every(task => task.materialIds.length));
  assert.ok(source, '需要一套完整的常规学习日材料');
  const plan = Core.buildDay(source.day, content, options);
  const materials = new Map(curriculum.materials.map(item => [item.id, item]));
  let records = Records.newState(), cursor = Date.parse('2026-10-24T00:00:00.000Z'), sequence = 0;
  for (const task of plan.tasks) for (const id of task.materialIds) {
    const material = materials.get(id), activeSeconds = task.minutes * 60 / task.materialIds.length;
    const startedAt = new Date(cursor).toISOString();
    cursor += activeSeconds * 1000;
    const submittedAt = new Date(cursor).toISOString();
    const text = task.id === 'vocabulary' ? material.vocabulary.map((item, i) => 'word ' + i + ' — meaning and my own example').join('\n') : task.id === 'reflection' ? '记录了今天的错误、订正依据和新题复测时间。' : Array(material.minWords || 12).fill('word').join(' ');
    const answers = Object.fromEntries((material.questions || []).map(q => [q.id, q.type === 'multi' ? q.answers : q.answers[0]]));
    const attempt = { id: 'integration-' + (++sequence), materialId: id, taskId: task.id, courseDay: source.day, mode: task.mode, kind: 'original', parentId: null, startedAt, submittedAt, activeSeconds, exposureAtStart: 'unseen', answers, userEvidence: {}, text, transcript: text, audioAvailable: true, audioCompleted: true, transcriptViewed: false, interrupted: false, assistance: { hint: false, answer: false, ai: false }, media: [] };
    const record = Player.toRecord(attempt, material, source.day, Assessment);
    if (['writing','speaking'].includes(task.id)) {
      const review={ok:true,status:'complete',requiresRetest:false,rounds:[1,2].map(round=>({ok:true,round,task:'foundation',criteria:[],levelCheck:{meetsGoal:true,evidence:[{quote:text,comment:'本次已提交原稿的真实片段。'}]}}))};
      if(task.id==='speaking'){record.media=[{id:'integration-voice',name:'本次原音引用',mime:'audio/webm',durationSeconds:35}];review.audioAnalysisEvidence=false;review.pronunciationSource={provider:'ali',recordId:record.id,evidenceId:'integration-ali-proof',mediaIds:['integration-voice'],durationSeconds:35,reference:text,completeCoverage:true,result:{accuracy:90,fluency:85,completeness:95}};}
      record.evaluation={method:'ai',result:'pass',feedback:JSON.stringify(review)};
    }
    if (task.id === 'reflection') Object.assign(record, { source:'mistake-review', answer:JSON.stringify({schema:1,courseDay:source.day,token:'integration-token',recap:{ok:true,status:'complete',recap:'已按当天原稿和订正表现完成 AI 复盘。'}}), evaluation:{method:'ai',result:'pass',feedback:'本日错题和 AI 复盘已完成。'} });
    assert.equal(record.unit, task.unit, task.id);
    records = Records.put(records, record, submittedAt).state;
  }
  const linked = Records.summary(records.records, source.day, new Date(cursor).toISOString());
  let effective = Store.combineEvidence(plan, {}, linked);
  assert.equal(Core.summarizeDay(plan, effective).complete, false);
  const previousMistakes = global.IELTSMistakes;
  try {
    global.IELTSMistakes = { forDay: day => ({ dayNumber: day, token:'integration-token', allCorrect: true, remaining: 0, completionValid: true }) };
    effective = Store.combineEvidence(plan, {}, Records.summary(records.records, source.day, new Date(cursor).toISOString()));
    assert.equal(Core.summarizeDay(plan, effective).complete, true);
  } finally { global.IELTSMistakes = previousMistakes; }
  assert.equal(Core.summarizeDay(plan, effective).minutes, 360);
  for (const task of plan.tasks) assert.equal(effective[task.id].actualQuantity, task.quantity, task.id);
});

test('已有无版本旧日继续使用原任务，未记录日使用新课程并可保存显式版本', () => {
  const original = Store.newState('2026-01-01');
  original.days['1'] = { tasks: { reading: { actualMinutes: 60, actualQuantity: 8, evidence: '旧版完成了八个短句，保留了自己的主旨和原句。' } } };
  original.days['2'] = { tasks: {} };
  original.days['3'] = { planVersion: 'curriculum:1.0', tasks: { reading: { actualMinutes: 60, actualQuantity: 2, evidence: '新课程独立作答两题，并核对了原文中的具体依据。' } } };
  const before = JSON.stringify(original);
  const restored = Store.parseState(original, '2026-10-24');
  assert.equal(JSON.stringify(original), before);
  for (const day of [1, 2]) {
    assert.equal(restored.days[String(day)].planVersion, 'legacy');
    assert.equal(Store.getPlan(restored, day, content, curriculum).planVersion, 'legacy');
    assert.equal(Store.getPlan(restored, day, content, curriculum).tasks.find(t => t.id === 'reading').unit, '个短句');
  }
  assert.equal(restored.days['1'].tasks.reading.actualQuantity, 8);
  assert.equal(Store.getPlan(restored, 3, content, curriculum).tasks.find(t => t.id === 'reading').unit, '题');
  assert.equal(Store.getPlan(restored, 4, content, curriculum).planVersion, 'curriculum:1.0');
  assert.equal(restored.days['4'], undefined, '预览不应创建每日记录');
  assert.equal(Store.parseState(JSON.stringify(restored), '2026-10-24').days['3'].planVersion, 'curriculum:1.0');
});

test('旧版八句不会变成新课程八题，只有相同单位的自动产出才计量', () => {
  const state = Store.newState('2026-01-01');
  state.days['1'] = { tasks: { reading: { actualMinutes: 60, actualQuantity: 8, evidence: '保留八个短句的原始理解与核对依据。' } } };
  const linked = { tasks: { reading: { count: 1, minutes: 60, quantities: { '个短句': 8, '题': 2 }, records: [{ id: 'new-reading', title: '课程作答', kind: 'original' }] } } };
  const legacy = Store.getPlan(state, 1, content, curriculum);
  const fresh = Store.getPlan(state, 2, content, curriculum);
  assert.equal(Store.combineEvidence(legacy, state.days['1'].tasks, linked).reading.actualQuantity, 8);
  assert.equal(Store.combineEvidence(fresh, {}, linked).reading.actualQuantity, 2);
  delete linked.tasks.reading.quantities['题'];
  assert.equal(Store.combineEvidence(fresh, {}, linked).reading.actualQuantity, 0);
  for (const version of ['', 'curriculum:2.0', 'future', 1, null]) assert.throws(() => Store.parseState({ ...state, days: { 1: { planVersion: version, tasks: {} } } }), /版本/);
});

test('浏览器UMD读取后加载的课程全局，Node显式注入与缺失数据的版本保护一致', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/daily-plan-core.js'), 'utf8'), context);
  context.content = content;
  assert.equal(context.IELTSPlanCore.buildDay(1, content).planVersion, 'legacy');
  context.IELTSCurriculumData = curriculum;
  assert.equal(context.IELTSPlanCore.buildDay(1, content).planVersion, 'curriculum:1.0');
  assert.equal(context.IELTSPlanCore.buildDay(1, content, 'legacy').planVersion, 'legacy');
  assert.throws(() => Core.buildDay(1, content, { planVersion: 'curriculum:1.0', curriculum: null }), /未完整加载/);
  assert.throws(() => Core.buildDay(1, content, { planVersion: 'curriculum:2.0', curriculum }), /版本/);
});
