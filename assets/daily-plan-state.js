(function (root, factory) {
  'use strict';
  var core = root.IELTSPlanCore;
  if (!core && typeof module === 'object' && module.exports) core = require('./daily-plan-core.js');
  if (!core) throw new Error('请先加载 daily-plan-core.js。');
  var api = factory(core, root);
  root.IELTSPlanState = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core, root) {
  'use strict';

  var OWN = Object.prototype.hasOwnProperty;
  var SKILLS = ['listening', 'speaking', 'reading', 'writing'];
  var TASK_IDS = ['vocabulary', 'grammar', 'listening', 'reading', 'speaking', 'writing', 'reflection', 'review'];
  var MAX_ASSESSMENTS = 104;
  var SKILL_NAMES = { listening: '听力', speaking: '口语', reading: '阅读', writing: '写作' };
  var BOOST_ACTIONS = {
    listening: '用 20 分钟重听错误片段、分析漏听原因，再用 10 分钟完成相近的陌生听力项目复测',
    speaking: '用 20 分钟针对反馈改进表达或发音，再用 10 分钟回答一个相近的新问题并录音复测',
    reading: '用 20 分钟订正错题并找到原文依据，再用 10 分钟完成相近的陌生阅读题复测',
    writing: '用 20 分钟根据反馈重写问题句段，再用 10 分钟写一段相近的新内容复测'
  };

  function plainObject(value, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(name + '必须是对象。');
    var proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new TypeError(name + '不得包含自定义原型。');
    return value;
  }

  function allowedKeys(value, keys, name) {
    plainObject(value, name);
    Reflect.ownKeys(value).forEach(function (key) {
      if (typeof key !== 'string' || keys.indexOf(key) < 0) throw new TypeError(name + '包含不支持的字段。');
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && (descriptor.get || descriptor.set)) throw new TypeError(name + '不得包含访问器字段。');
    });
  }

  function denseArray(value, limit, name) {
    if (!Array.isArray(value) || value.length > limit || Object.getPrototypeOf(value) !== Array.prototype) {
      throw new TypeError(name + '必须是最多 ' + limit + ' 项的普通数组。');
    }
    var keys = Reflect.ownKeys(value);
    if (keys.some(function (key) { return key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length); })) {
      throw new TypeError(name + '包含不支持的数组字段。');
    }
    for (var i = 0; i < value.length; i += 1) {
      if (!OWN.call(value, String(i))) throw new TypeError(name + '不得包含空数组项。');
      var descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (descriptor && (descriptor.get || descriptor.set)) throw new TypeError(name + '不得包含访问器数组项。');
    }
    return value;
  }

  function visibleLength(value) {
    return Array.from(value.replace(/[\s\p{Cf}\p{Cc}]/gu, '')).length;
  }

  function text(value, name, min, max, preserveWhitespace) {
    if (typeof value !== 'string' || value.length > max || visibleLength(value) < min) {
      throw new TypeError(name + '需包含至少 ' + min + ' 个非空白字符，且最多 ' + max + ' 个字符。');
    }
    return preserveWhitespace ? value : value.trim();
  }

  function validDayKey(key) {
    if (!/^[1-9]\d{0,2}$/.test(key) || Number(key) > core.COURSE_DAYS) throw new RangeError('学习日键必须是 1–364 的标准整数。');
    return Number(key);
  }

  function draftNumber(value, name, maximum, integer) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'string') {
      if (!/^\d+(?:\.\d+)?$/.test(value.trim())) throw new TypeError(name + '必须是有效数字。');
      value = Number(value.trim());
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum || (integer && !Number.isInteger(value))) {
      throw new RangeError(name + '必须在 0–' + maximum + ' 之间' + (integer ? '且为整数。' : '。'));
    }
    return value;
  }

  function validDate(value) {
    core.parseStartDate(value);
    return value;
  }

  function localToday() {
    var date = new Date();
    return String(date.getFullYear()).padStart(4, '0') + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function endOfLocalDay(dateString) {
    validDate(dateString);
    var parts = dateString.split('-').map(Number);
    var result = new Date(0);
    result.setFullYear(parts[0], parts[1] - 1, parts[2]);
    result.setHours(23, 59, 59, 999);
    return result.getTime();
  }

  function validTimestamp(value) {
    if (typeof value !== 'string') throw new TypeError('completedAt 必须是带时区的 ISO 日期字符串。');
    var match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!match) throw new TypeError('completedAt 必须是带时区的 ISO 日期字符串。');
    validDate(match[1]);
    if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) throw new RangeError('completedAt 时间不存在。');
    if (match[6] !== 'Z' && (Number(match[6].slice(1, 3)) > 23 || Number(match[6].slice(4, 6)) > 59)) throw new RangeError('completedAt 时区无效。');
    var date = new Date(value);
    if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) throw new RangeError('completedAt 日期无效。');
    return date.toISOString();
  }

  function cleanTaskRecord(value) {
    allowedKeys(value, ['actualMinutes', 'actualQuantity', 'evidence'], '任务记录');
    return {
      actualMinutes: draftNumber(value.actualMinutes, '实际学习分钟数', 600, true),
      actualQuantity: draftNumber(value.actualQuantity, '实际完成量', 10000, true),
      evidence: value.evidence === undefined ? '' : text(value.evidence, '成果记录', 0, 1200, true)
    };
  }

  function cleanPlanVersion(value) {
    if (value === undefined) return core.LEGACY_PLAN_VERSION;
    if (value !== core.LEGACY_PLAN_VERSION && value !== core.CURRICULUM_PLAN_VERSION) throw new TypeError('每日记录的日程版本不受支持。');
    return value;
  }

  function cleanDay(value) {
    allowedKeys(value, ['tasks', 'completedAt', 'planVersion'], '每日记录');
    plainObject(value.tasks, '每日任务记录');
    var taskKeys = Reflect.ownKeys(value.tasks);
    if (taskKeys.length > 10) throw new RangeError('每日任务记录最多 10 项。');
    var tasks = {};
    taskKeys.forEach(function (key) {
      if (typeof key !== 'string' || TASK_IDS.indexOf(key) < 0) throw new TypeError('每日记录包含未知任务。');
      var descriptor = Object.getOwnPropertyDescriptor(value.tasks, key);
      if (descriptor && (descriptor.get || descriptor.set)) throw new TypeError('任务记录不得包含访问器。');
      tasks[key] = cleanTaskRecord(value.tasks[key]);
    });
    var result = { planVersion: cleanPlanVersion(value.planVersion), tasks: tasks };
    var totalMinutes = Object.keys(tasks).reduce(function (sum, key) { return sum + (tasks[key].actualMinutes || 0); }, 0);
    if (totalMinutes > 1440) throw new RangeError('每日实际学习总分钟数不能超过 1440。');
    if (value.completedAt !== undefined) result.completedAt = validTimestamp(value.completedAt);
    return result;
  }

  function cleanWeakSkills(value) {
    if (value === undefined) return [];
    denseArray(value, SKILLS.length, '薄弱项');
    var seen = new Set();
    return value.map(function (skill) {
      if (typeof skill !== 'string' || SKILLS.indexOf(skill) < 0 || seen.has(skill)) throw new TypeError('薄弱项须为不重复的听说读写技能。');
      seen.add(skill);
      return skill;
    });
  }

  function cleanScores(value) {
    allowedKeys(value, SKILLS, '四项分数');
    var scores = {};
    SKILLS.forEach(function (skill) {
      var score = value[skill];
      if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 9 || !Number.isInteger(score * 2)) {
        throw new RangeError('四项分数必须分别为 0–9 之间的整数或半分。');
      }
      scores[skill] = score;
    });
    return scores;
  }

  function weakSkillsForScores(scores) {
    return SKILLS.filter(function (skill) { return scores[skill] < 7; }).sort(function (a, b) {
      return scores[a] - scores[b] || SKILLS.indexOf(a) - SKILLS.indexOf(b);
    });
  }

  function cleanAssessment(value, requireId) {
    allowedKeys(value, ['id', 'week', 'date', 'type', 'source', 'notes', 'result', 'weakSkills', 'scores', 'reviewed'], '测评记录');
    if (!Number.isInteger(value.week) || value.week < 1 || value.week > 52) throw new RangeError('测评周必须为 1–52。');
    if (['foundation', 'mock', 'official'].indexOf(value.type) < 0) throw new TypeError('测评类型无效。');
    var id = value.id;
    if (id !== undefined || requireId) {
      if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(id)) throw new TypeError('测评 id 格式无效。');
    }
    if (value.reviewed !== undefined && typeof value.reviewed !== 'boolean') throw new TypeError('reviewed 必须为布尔值。');
    var providedWeakSkills = cleanWeakSkills(value.weakSkills);
    var result = {
      id: id,
      week: value.week,
      date: validDate(value.date),
      type: value.type,
      source: text(value.source, '测评来源', 4, 240, false),
      notes: text(value.notes, '测评依据与反馈', 12, 2000, false),
      reviewed: value.reviewed === true
    };
    if (value.type === 'foundation') {
      if (value.result !== 'pass' && value.result !== 'reinforce') throw new TypeError('基础测评需选择 pass 或 reinforce。');
      if (value.scores !== undefined) throw new TypeError('基础测评不记录雅思分数。');
      if (value.result === 'reinforce' && !providedWeakSkills.length) throw new TypeError('需要补强时至少选择一项薄弱技能。');
      result.result = value.result;
      result.weakSkills = value.result === 'reinforce' ? providedWeakSkills : [];
    } else {
      if (value.result !== undefined && value.result !== 'pass' && value.result !== 'reinforce') throw new TypeError('测评 result 字段无效。');
      result.scores = cleanScores(value.scores);
      result.weakSkills = weakSkillsForScores(result.scores);
    }
    return result;
  }

  function assessmentFitsCourse(assessment, startDate) {
    var day = core.dayForDate(startDate, assessment.date);
    if (day < 1) throw new RangeError('测评日期不能早于课程开始日期。');
    if (day < (assessment.week - 1) * 7 + 1) throw new RangeError('测评日期尚未到达所选学习周。');
  }

  function cleanBoost(value) {
    allowedKeys(value, ['skill', 'assessmentId'], '补强记录');
    if (SKILLS.indexOf(value.skill) < 0) throw new TypeError('补强技能必须属于听说读写。');
    if (typeof value.assessmentId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value.assessmentId)) throw new TypeError('补强来源 id 格式无效。');
    return { skill: value.skill, assessmentId: value.assessmentId };
  }

  function newState(startDate) {
    validDate(startDate);
    core.dateForDay(startDate, core.COURSE_DAYS);
    return { schemaVersion: 1, startDate: startDate, days: {}, assessments: [], boosts: {} };
  }

  function parseState(value, todayDate) {
    todayDate = validDate(todayDate === undefined ? localToday() : todayDate);
    var latestCompletedTime = endOfLocalDay(todayDate);
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch (error) { throw new TypeError('导入内容不是有效的 JSON。'); }
    }
    allowedKeys(value, ['schemaVersion', 'startDate', 'days', 'assessments', 'boosts'], '学习记录');
    if (value.schemaVersion !== 1) throw new RangeError('仅支持 schemaVersion 为 1 的学习记录。');
    var result = newState(value.startDate);
    plainObject(value.days, '每日记录集合');
    var dayKeys = Reflect.ownKeys(value.days);
    if (dayKeys.length > core.COURSE_DAYS) throw new RangeError('每日记录超过 364 天。');
    dayKeys.forEach(function (key) {
      if (typeof key !== 'string') throw new TypeError('学习日键必须是字符串。');
      validDayKey(key);
      var descriptor = Object.getOwnPropertyDescriptor(value.days, key);
      if (descriptor && (descriptor.get || descriptor.set)) throw new TypeError('每日记录不得包含访问器。');
      result.days[key] = cleanDay(value.days[key]);
      if (result.days[key].completedAt && new Date(result.days[key].completedAt).getTime() > latestCompletedTime) {
        throw new RangeError('提交时间不能晚于今天结束。');
      }
    });
    denseArray(value.assessments, MAX_ASSESSMENTS, '测评记录');
    var assessmentsById = new Map();
    result.assessments = value.assessments.map(function (entry) {
      var assessment = cleanAssessment(entry, true);
      assessmentFitsCourse(assessment, result.startDate);
      if (assessment.date > todayDate) throw new RangeError('测评日期不能晚于今天。');
      if (assessmentsById.has(assessment.id)) throw new TypeError('测评 id 不得重复。');
      assessmentsById.set(assessment.id, assessment);
      return assessment;
    });
    plainObject(value.boosts, '补强记录集合');
    var boostKeys = Reflect.ownKeys(value.boosts);
    if (boostKeys.length > core.COURSE_DAYS) throw new RangeError('补强记录超过课程范围。');
    boostKeys.forEach(function (key) {
      if (typeof key !== 'string') throw new TypeError('补强学习日键必须是字符串。');
      var day = validDayKey(key);
      var descriptor = Object.getOwnPropertyDescriptor(value.boosts, key);
      if (descriptor && (descriptor.get || descriptor.set)) throw new TypeError('补强记录不得包含访问器。');
      var boost = cleanBoost(value.boosts[key]);
      var assessment = assessmentsById.get(boost.assessmentId);
      if (!assessment || assessment.weakSkills.indexOf(boost.skill) < 0) throw new TypeError('补强记录缺少对应的薄弱项测评依据。');
      if ((day - 1) % 7 === 6 || day <= assessment.week * 7 || day <= core.dayForDate(result.startDate, assessment.date)) {
        throw new RangeError('补强只能安排在测评之后的后续学习日。');
      }
      result.boosts[key] = boost;
    });
    return result;
  }

  function getPlan(state, dayNumber, content, curriculum) {
    plainObject(state, '学习记录');
    plainObject(state.days, '每日记录集合');
    plainObject(state.boosts, '补强记录集合');
    var dayKey = String(dayNumber);
    var options = {};
    if (curriculum !== undefined) options.curriculum = curriculum;
    if (OWN.call(state.days, dayKey)) {
      plainObject(state.days[dayKey], '每日记录');
      options.planVersion = cleanPlanVersion(state.days[dayKey].planVersion);
    }
    var plan = core.buildDay(dayNumber, content, options);
    if (!OWN.call(state.boosts, dayKey)) return plan;
    var boost = cleanBoost(state.boosts[dayKey]);
    if (plan.kind !== 'study') throw new RangeError('补强应安排在常规学习日。');
    var matched = false;
    var tasks = plan.tasks.map(function (entry) {
      if (entry.skill !== boost.skill) return entry;
      matched = true;
      return Object.assign({}, entry, {
        instruction: entry.instruction + ' 本日' + SKILL_NAMES[boost.skill] + '补强：在本项时间内，' + BOOST_ACTIONS[boost.skill] + '；这 30 分钟计入本项既定学习时间与产出量。',
        evidenceHint: entry.evidenceHint + ' 同时记录补强材料、原错误、20 分钟练习内容和 10 分钟复测结果。'
      });
    });
    if (!matched) throw new TypeError('当天缺少补强所对应的技能任务。');
    return Object.assign({}, plan, { tasks: tasks, boost: boost });
  }

  function nextAssessmentId(state, assessment) {
    var known = new Set(state.assessments.map(function (item) { return item.id; }));
    var counter = state.assessments.length + 1;
    var base = 'a-' + assessment.date.replace(/-/g, '') + '-w' + assessment.week + '-';
    while (known.has(base + counter)) counter += 1;
    return base + counter;
  }

  function addAssessment(state, input, todayDate, content, curriculum) {
    validDate(todayDate);
    var result = parseState(state, todayDate);
    if (result.assessments.length >= MAX_ASSESSMENTS) throw new RangeError('最多保存 104 条测评记录。');
    var assessment = cleanAssessment(input, false);
    assessmentFitsCourse(assessment, result.startDate);
    if (assessment.date > todayDate) throw new RangeError('测评日期不能晚于今天。');
    if (!assessment.id) assessment.id = nextAssessmentId(result, assessment);
    if (result.assessments.some(function (entry) { return entry.id === assessment.id; })) throw new TypeError('测评 id 不得重复。');
    result.assessments.push(assessment);
    var boostDays = [];
    var weakSkills = assessment.weakSkills.slice();
    if (weakSkills.length) {
      var startDay = Math.max(assessment.week * 7, core.dayForDate(result.startDate, todayDate)) + 1;
      for (var day = startDay; day <= core.COURSE_DAYS && boostDays.length < 6; day += 1) {
        var key = String(day);
        var plan = getPlan(result, day, content, curriculum);
        if (plan.kind !== 'study' || (result.days[key] && result.days[key].completedAt) || OWN.call(result.boosts, key)) continue;
        result.boosts[key] = { skill: weakSkills[boostDays.length % weakSkills.length], assessmentId: assessment.id };
        boostDays.push(day);
      }
    }
    return { state: result, boostDays: boostDays, weakSkills: weakSkills };
  }

  function sourceKey(value) {
    return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function readiness(state, todayDate) {
    var clean = parseState(state, todayDate);
    var recent = clean.assessments.map(function (entry, index) { return { entry: entry, index: index }; })
      .filter(function (item) { return item.entry.type === 'mock' || item.entry.type === 'official'; })
      .sort(function (a, b) { return b.entry.date.localeCompare(a.entry.date) || b.index - a.index; })
      .slice(0, 3)
      .map(function (item) { return item.entry; });
    var seenDates = new Set();
    var seenSources = new Set();
    var qualifyingCount = 0;
    recent.forEach(function (entry) {
      var qualifies = (entry.type === 'official' || entry.reviewed) && SKILLS.every(function (skill) { return entry.scores[skill] >= 7; });
      var key = sourceKey(entry.source);
      if (qualifies && !seenDates.has(entry.date) && !seenSources.has(key)) {
        qualifyingCount += 1;
        seenDates.add(entry.date);
        seenSources.add(key);
      }
    });
    return { qualifyingCount: qualifyingCount, ready: recent.length === 3 && qualifyingCount === 3, latestScores: recent.length ? Object.assign({}, recent[0].scores) : null };
  }

  function validLinkedReview(record) {
    if(record?.evaluation?.method!=='ai'||record.evaluation.result!=='pass')return false;
    var review,artifact;try{review=JSON.parse(record.evaluation.feedback);artifact=JSON.parse(record.answer);}catch(_){try{review=JSON.parse(record.evaluation.feedback);}catch(_){return false;}}
    var text=artifact&&typeof artifact==='object'?(record.skill==='speaking'?artifact.transcript:artifact.text):record.answer;
    if(typeof text!=='string'||!text.trim()||review?.status!=='complete'||review.requiresRetest===true)return false;
    var rounds=Array.isArray(review.rounds)?review.rounds.filter(function(r){return r?.ok===true;}):[];
    var normalize=function(v){return typeof v==='string'?v.normalize('NFKC').replace(/[‘’]/g,"'").trim().replace(/\s+/g,' ').toLowerCase():'';},original=normalize(text);
    if(rounds.length<2||new Set(rounds.map(function(r){return r.round;})).size<2)return false;
    var material=root.IELTSCurriculumData?.materials?.find(function(m){return m.id===record.materialId;});
    var count=root.IELTSAssessment?.countWords?root.IELTSAssessment.countWords(text):(text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)||[]).length;if(count<(material?.minWords||1))return false;
    if(material?.fullTest||material?.pool==='final')return root.IELTSAssessment?.evaluatedCriteria?.(record,material,7)?.pass===true;
    if(!rounds.every(function(r){return r.levelCheck?.meetsGoal===true&&Array.isArray(r.levelCheck.evidence)&&r.levelCheck.evidence.some(function(e){return normalize(e?.quote)&&original.includes(normalize(e.quote));});}))return false;
    if(record.skill!=='speaking')return true;
    var ids=(record.media||[]).map(function(m){return m.id;});if(!ids.length)return false;
    var ali=review.pronunciationSource;
    if((material?.rubric?.taskType==='foundation'||rounds.every(function(r){return r.task==='foundation';}))&&ali){return Boolean(ali.provider==='ali'&&ali.recordId===record.id&&ali.evidenceId&&ali.completeCoverage===true&&normalize(ali.reference)===original&&Number.isFinite(ali.durationSeconds)&&ali.durationSeconds>0&&ali.durationSeconds<=180&&Array.isArray(ali.mediaIds)&&ali.mediaIds.length===ids.length&&ali.mediaIds.every(function(id,i){return id===ids[i];})&&['accuracy','fluency','completeness'].every(function(k){return Number.isFinite(ali.result?.[k])&&ali.result[k]>=0&&ali.result[k]<=100;})&&ali.result.accuracy>=80&&ali.result.fluency>=75&&ali.result.completeness>=90);}
    var source=review.audioSource;if(review.audioAnalysisEvidence!==true||source?.recordId!==record.id||source.completeCoverage!==true||!Array.isArray(source.mediaIds)||source.mediaIds.length!==ids.length||!source.mediaIds.every(function(id,i){return id===ids[i];})||!Number.isFinite(source.durationSeconds)||source.durationSeconds<=0||!Array.isArray(source.segments)||!source.segments.length)return false;
    var cursor=0;for(var segment of source.segments){if(segment.audible!==true||!Number.isFinite(segment.startSeconds)||!Number.isFinite(segment.endSeconds)||Math.abs(segment.startSeconds-cursor)>.05||segment.endSeconds<=cursor||segment.endSeconds>source.durationSeconds+.05)return false;cursor=segment.endSeconds;}return Math.abs(cursor-source.durationSeconds)<=.05;
  }
  function combineEvidence(plan, manual, linked, options) {
    var result = {};
    plan.tasks.forEach(function (task) {
      var old = manual && manual[task.id] || {};
      var entry = linked && linked.tasks && linked.tasks[task.id];
      if (!entry || !entry.count) { result[task.id] = Object.assign({}, old, task.requiresRecordedOutput ? {recordedSource:'learning-records',recordedCount:0,recordedQuantity:0} : {}); return; }
      var recordedMinutes = Math.min(600, Math.max(0, Math.floor(entry.minutes || 0)));
      var recordedQuantity = Math.min(10000, Math.max(0, Math.floor(entry.quantities && entry.quantities[task.unit] || 0)));
      var citations = entry.records.map(function (r) { return r.title + '（作品 ' + r.id + '；' + (r.kind === 'retest' ? '复测' : r.kind === 'correction' ? '订正' : '原稿') + '）'; }).join('；');
      var reviewPending = false;
      if (task.requiresVerifiedEvaluation) {
        var latest = new Map();entry.records.forEach(function (r) { var key=r.materialId||r.id,old=latest.get(key);if(!old||String(r.submittedAt||'')>=String(old.submittedAt||''))latest.set(key,r); });
        reviewPending = !latest.size || Array.from(latest.values()).some(function (r) { if(validLinkedReview(r)||r.mistakeReview?.corrected===true)return false;try{return root.IELTSMistakes?.recordCorrectionStatus?.(r)?.corrected!==true;}catch(_){return true;} });
      }
      result[task.id] = Object.assign({
        actualMinutes: Math.max(old.actualMinutes || 0, recordedMinutes),
        actualQuantity: Math.max(old.actualQuantity || 0, recordedQuantity),
        evidence: ((old.evidence || '') + (citations ? '\n关联作品：' + citations + '。以上仅为完成量和作品索引，能力需独立验证。' : '')).slice(0, 1200)
      }, task.requiresRecordedOutput ? {recordedSource:'learning-records',recordedCount:entry.count,recordedQuantity:recordedQuantity,...(task.requiresVerifiedEvaluation?{reviewPending:reviewPending}:{})} : {});
    });
    if (options && options.submissionReadiness) {
      var readiness = options.submissionReadiness;
      var statuses = new Map((readiness.states || []).map(function (state) { return [state.taskId, state]; }));
      plan.tasks.forEach(function (task) {
        if (!task.requiresRecordedOutput) return;
        var status = statuses.get(task.id), item = result[task.id];
        item.submissionComplete = task.id === 'reflection' ? readiness.ready === true : status?.done === true;
        item.submissionReason = item.submissionComplete ? '' : readiness.reason || '本项核心材料尚未完整提交或仍需真实评阅。';
      });
    }
    return result;
  }

  return Object.freeze({ newState: newState, parseState: parseState, getPlan: getPlan, addAssessment: addAssessment, readiness: readiness, combineEvidence: combineEvidence, validLinkedReview: validLinkedReview });
});
