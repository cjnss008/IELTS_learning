(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IELTSPlanCore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var COURSE_WEEKS = 52;
  var COURSE_DAYS = COURSE_WEEKS * 7;
  var DAY_MS = 86400000;
  var OWN = Object.prototype.hasOwnProperty;
  var LEGACY_PLAN_VERSION = 'legacy';
  var CURRICULUM_PLAN_VERSION = 'curriculum:1.0';
  var TASK_NAMES = { vocabulary: '词汇与旧词回忆', grammar: '语法理解与运用', listening: '听力与听写', reading: '阅读理解', speaking: '口语表达与回听', writing: '写作与订正', reflection: '学习复盘与延迟复测' };
  var TASK_UNITS = { vocabulary: '条', grammar: '题', listening: '题', reading: '题', speaking: '词', writing: '词', reflection: '份复盘' };
  var STAGES = [
    { id: 'foundation', end: 8, newWords: 15, recall: 50, grammar: 10, listening: 10, reading: 8, speaking: 10, writing: 8 },
    { id: 'basic', end: 20, newWords: 15, recall: 60, grammar: 15, listening: 12, reading: 2, speaking: 12, writing: 12 },
    { id: 'academic', end: 36, newWords: 15, recall: 70, grammar: 18, listening: 20, reading: 2, speaking: 3, writing: 2 },
    { id: 'timed', end: 48, newWords: 10, recall: 80, grammar: 18, listening: 30, reading: 2, speaking: 3, writing: 2 },
    { id: 'consolidation', end: 52, newWords: 5, recall: 75, grammar: 18, listening: 40, reading: 2, speaking: 4, writing: 2 }
  ];
  var DAY_ACTIONS = [
    '建立初次理解，先独立尝试再查看讲解。',
    '遮住昨天的答案，先回忆再核对。',
    '换一个例子练习同一技能，并解释自己的选择。',
    '优先重练本周错题，再完成新的练习。',
    '选同难度但未做过的材料，检查是否能迁移。',
    '独立完成后订正，为本周复盘保留原始作答。'
  ];

  function integerInRange(value, min, max, name) {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new RangeError(name + '必须是 ' + min + '–' + max + ' 之间的整数。');
    }
    return value;
  }

  function stageForWeek(week) {
    for (var i = 0; i < STAGES.length; i += 1) {
      if (week <= STAGES[i].end) return STAGES[i];
    }
    throw new RangeError('学习周超出课程范围。');
  }

  function getWeekInfo(week, content) {
    if (!content || !Array.isArray(content.weeks) || content.weeks.length !== COURSE_WEEKS) {
      throw new TypeError('课程数据必须包含完整的 52 周 weeks 数组。');
    }
    var matches = content.weeks.filter(function (entry) { return entry && entry.week === week; });
    if (matches.length !== 1) throw new TypeError('第 ' + week + ' 周课程数据缺失或重复。');
    var info = matches[0];
    ['title', 'grammarFocus', 'readingFocus', 'listeningFocus'].forEach(function (key) {
      if (typeof info[key] !== 'string' || !info[key].trim()) throw new TypeError('第 ' + week + ' 周缺少 ' + key + '。');
    });
    ['speakingPrompts', 'writingPrompts'].forEach(function (key) {
      if (!Array.isArray(info[key]) || info[key].length < 3 || info[key].some(function (item) { return typeof item !== 'string' || !item.trim(); })) {
        throw new TypeError('第 ' + week + ' 周的 ' + key + ' 至少需要 3 条有效提示。');
      }
    });
    return Object.assign({}, info, {
      speakingPrompts: info.speakingPrompts.slice(),
      writingPrompts: info.writingPrompts.slice()
    });
  }

  function task(id, title, skill, minutes, quantity, unit, instruction, evidenceHint) {
    return { id: id, title: title, skill: skill, minutes: minutes, quantity: quantity, unit: unit, instruction: instruction, evidenceHint: evidenceHint };
  }

  function selectPrompt(prompts, weekday) {
    return prompts[(weekday - 1) % prompts.length];
  }

  function studyTasks(week, weekday, stage, info) {
    var isFoundation = stage.id === 'foundation';
    var isBasic = stage.id === 'basic';
    var action = DAY_ACTIONS[weekday - 1];
    var oldRecall = stage.recall - stage.newWords;
    var readingUnit = isFoundation ? '个短句' : '篇材料';
    var speakingUnit = isFoundation || isBasic ? '句口头表达' : '段录音回答';
    var writingUnit = isFoundation || isBasic ? '个完整句' : '份写作';
    var writingQuantity = stage.writing;
    var writingTitle = '写作与订正';
    var readingVolume = isFoundation ? '读懂 8 个适合当前基础的短句，标出主语和动作，并用中文或简单英文说明意思。' :
      isBasic ? '精读 2 篇各约 200–350 词的分级短文，分别写出主旨和至少 3 条信息。' :
        stage.id === 'academic' ? '精读 2 篇适合当前程度的约 500–800 词文章，记录主旨、结构和同义替换。' :
          '完成 2 篇约 700–1000 词的学术阅读材料及配套题，标记每道错题的原文依据。';
    var listeningVolume = isFoundation || isBasic ?
      '选取 ' + stage.listening + ' 个本周难度的短句，先盲听并写下听到的内容，再核对、订正和重听。' :
      '用未练过的合适音频完成 ' + stage.listening + ' 道听力题，记录原始答案，订正时定位对应音频片段。';
    var speakingVolume = isFoundation || isBasic ?
      '先口头说出至少 ' + stage.speaking + ' 个自己的完整句，再录音回听，重录一处需要改进的表达。' :
      '围绕提示录下 ' + stage.speaking + ' 段回答，保留初次回答，回听后改进内容展开、语法或清晰度。';
    var writingVolume;
    if (isFoundation || isBasic) {
      writingVolume = '独立写出至少 ' + stage.writing + ' 个完整句；核对本周语法，并保留原稿和订正。';
    } else {
      var schedule = week <= 36 ? ['task1', 'revise1', 'task2', 'revise2', 'transfer', 'retest'] : ['task1', 'task2', 'reviseBoth', 'task1', 'task2', 'reviseBoth'];
      var writingKind = schedule[weekday - 1];
      var writingKinds = {
        task1: ['Task 1 首稿', 1, '份首稿', '选一份尚未作答且有明确数据的 Task 1 题，独立写至少 150 词；初学时先练概述与关键比较，逐步达到完整要求。保留未经 AI 改写的原稿。余下时间检查数据与句子并记录问题。'],
        task2: ['Task 2 首稿', 1, '份首稿', '选一道尚未作答的 Task 2 题，独立写至少 250 词；先列立场、理由和例子，再展开。保留原稿，余下时间检查是否回答问题及论据是否具体。'],
        revise1: ['Task 1 反馈与重写', 1, '份订正稿', '回到本周 Task 1 原稿，核对关键数据、概述和比较；结合已有反馈挑出 3 个具体问题，理解原因后重写，并保留修改前后版本。没有 AI 时按题目数据和自查清单订正。'],
        revise2: ['Task 2 反馈与重写', 1, '份订正稿', '回到本周 Task 2 原稿，检查立场、段落主旨和例子；结合已有反馈挑出 3 个具体问题，理解原因后重写，保留修改理由。没有 AI 时先完成自查。'],
        transfer: ['写作迁移练习', 2, '段迁移练习', '换用未做过的题目或图表，独立写一段概述和一段观点展开。重点迁移本周订正过的表达，不复制旧稿；完成后检查用法与题意。'],
        retest: ['写作闭卷复测', 2, '项复测', '遮住原稿与反馈，针对本周两类反复错误，在新语境各完成一项改写或段落练习；提交后再核对，记录能否独立运用。'],
        reviseBoth: ['两份作文反馈与重写', 2, '份订正稿', '分别订正本周最近的 Task 1 与 Task 2 原稿，每篇选择最重要的 2–3 个问题，核对依据并重写。保留原稿和修改理由，不额外要求两篇新作文。']
      };
      var writingPlan = writingKinds[writingKind];
      writingTitle = writingPlan[0]; writingQuantity = writingPlan[1]; writingUnit = writingPlan[2]; writingVolume = writingPlan[3];
    }
    return [
      task('vocabulary', '词汇与旧词回忆', 'foundation', 45, stage.recall, '次遮挡回忆',
        '从适合程度的材料整理 ' + stage.newWords + ' 项新词或搭配，并完成 ' + oldRecall + ' 词次旧词回忆，共 ' + stage.recall + ' 次。旧词不足时，重复回忆已学词补足次数。' + action,
        '记录新词清单、旧词回忆次数，以及至少 2 个自己造的短句。'),
      task('grammar', '语法理解与运用', 'foundation', 30, stage.grammar, '题或句',
        '本周语法：' + info.grammarFocus.replace(/。+$/, '') + '。完成 ' + stage.grammar + ' 道练习或造句，核对理由后订正。' + action,
        '写出至少 2 个原始答案、订正及为什么这样用；可附练习名称与位置。'),
      task('listening', '听力与听写', 'listening', 75, stage.listening, isFoundation || isBasic ? '句听写' : '道听力题',
        '本周重点：' + info.listeningFocus.replace(/。+$/, '') + '。' + listeningVolume + action,
        '记录音频名称或位置、原始答案、重听次数及至少 1 项订正。'),
      task('reading', '阅读理解', 'reading', 60, stage.reading, readingUnit,
        '本周重点：' + info.readingFocus.replace(/。+$/, '') + '。' + readingVolume + action,
        '记录材料名称、读到的位置、主旨和具体理解依据。'),
      task('speaking', '口语表达与回听', 'speaking', 60, stage.speaking, speakingUnit,
        '今日提示：' + selectPrompt(info.speakingPrompts, weekday).replace(/。+$/, '') + '。' + speakingVolume,
        '记录录音文件名或保存位置、说了哪些内容、回听发现和重录结果。'),
      task('writing', writingTitle, 'writing', 75, writingQuantity, writingUnit,
        (isFoundation || isBasic ? '今日主题：' + selectPrompt(info.writingPrompts, weekday).replace(/。+$/, '') : '本周话题：' + info.title) + '。' + writingVolume,
        '保存原稿和订正稿，记录字数或句数，以及至少 1 项修改理由。'),
      task('reflection', '学习记录与明日安排', 'review', 15, 3, '条观察',
        '记录 3 条具体学习观察，涵盖已掌握、仍不熟或材料难度；其中至少 1 条写清明天要采取的行动。',
        '写出 3 条具体观察和下一步行动，避免只写“已完成”。')
    ];
  }

  function reviewTasks(stage, info) {
    var early = stage.id === 'foundation' || stage.id === 'basic';
    var listeningQuantity = stage.id === 'foundation' ? 8 : stage.id === 'basic' ? 10 : stage.id === 'academic' ? 16 : 20;
    return [
      task('review', '本周词汇与语法复盘', 'foundation', 60, stage.recall, '次回忆',
        '遮住答案复习本周旧词、搭配和语法，共 ' + stage.recall + ' 次回忆；将仍不熟的内容排入下周。语法重点：' + info.grammarFocus + '。',
        '记录复习范围、仍不熟的项目和下次复习安排。'),
      task('listening', '错句重听', 'listening', 75, listeningQuantity, early ? '句听写' : '道听力题',
        '重新完成本周最需要复习的 ' + listeningQuantity + ' 个听力项目，先独立作答，再与上次错误比较。',
        '记录上次错误、本次答案，以及听清关键片段的依据。'),
      task('reading', '阅读回顾', 'reading', 60, 2, '份复述',
        '选本周的两份阅读材料，分别遮住原文说明主旨和 3 条信息，再回看原文核对。',
        '记录材料名称、自己的主旨概括、细节及核对结果。'),
      task('speaking', '口语重录', 'speaking', 60, 2, '段重录',
        '重答本周的两个问题，保留前后两次录音，分别找出一处实际改进和一处仍需练习的地方。',
        '记录两份录音的位置，以及前后对比的具体观察。'),
      task('writing', '写作重写', 'writing', 75, 2, '份重写',
        '重写本周的两份句子或段落作品。分别改正一个语法问题和一个内容表达问题，保留原稿。',
        '记录原句、修改后表达和修改理由。'),
      task('reflection', '周总结与下周重点', 'review', 30, 4, '条结论',
        '整理 4 条周总结：分别说明听读说写的完成量、能力证据和下一周补弱任务。完成量是自报记录，能力仍需独立测评。',
        '列出本周完成情况、证据位置和下周补弱安排。')
    ];
  }

  function checkpointTasks(week, stage, info) {
    if (week <= 20) {
      var foundation = stage.id === 'foundation';
      return [
        task('vocabulary', '基础词汇抽查', 'foundation', 30, foundation ? 50 : 60, '次回忆',
          '从已学范围随机抽取词汇，遮住提示进行词义、听音或拼写回忆，保留原始记录。',
          '记录抽查范围、原始作答和仍不熟的词。'),
        task('grammar', '基础语法抽查', 'foundation', 30, foundation ? 15 : 20, '道练习',
          '围绕已学语法选择未做过的练习，独立作答后核对；本周重点为：' + info.grammarFocus + '。',
          '记录新题来源、原始答案、订正和错误类型。'),
        task('listening', '阶段听力检查', 'listening', 70, foundation ? 10 : 16, '个听力项目',
          '使用符合当前基础的陌生短句或短对话检查听懂与听写情况，记录是否使用提示，再订正并复测错项。题数用于跟踪练习，不换算雅思分数。',
          '记录音频来源、独立作答、提示使用情况和订正。'),
        task('reading', '阶段阅读检查', 'reading', 65, foundation ? 10 : 12, '个理解项目',
          '阅读符合当前程度的陌生短句或短文，完成对应理解问题；订正后标记答案依据并复测。',
          '记录材料来源、原始作答和原文依据。'),
        task('speaking', '阶段口语采样', 'speaking', 60, foundation ? 8 : 4, foundation ? '句独立表达' : '段回答',
          '围绕熟悉主题独立回答并录音，回听或请评阅者指出表达和清晰度问题。不要先背好答案。',
          '记录录音位置、题目、是否使用准备稿及具体反馈。'),
        task('writing', '阶段写作采样', 'writing', 75, foundation ? 8 : 2, foundation ? '个完整句' : '份段落',
          foundation ? '独立完成至少 8 个表达个人信息或日常活动的完整句，再核对意义、主谓和标点，完成订正。' : '选择陌生但熟悉主题的题目，独立写 2 份各约 80–120 词的短段落，保存原稿、反馈和订正。',
          '保存原始文字、题目、使用帮助情况以及订正。'),
        task('reflection', '四项证据复盘', 'review', 30, 4, '条能力观察',
          '分别记录听、读、说、写的实际表现与下一步任务。基础抽查不产生雅思分数，低于学习目标时增加补弱练习。',
          '每项技能写 1 条带证据的观察和后续行动。')
      ];
    }
    if (week <= 36) {
      return [
        task('listening', '阶段听力测评', 'listening', 75, 20, '道题',
          '使用未练过且难度合适的材料完成 20 道题，记录原始分，订正并复测错误。半套练习不能直接按比例换算完整雅思分数。',
          '记录材料、原始答案、答对题数、提示或重播情况。'),
        task('reading', '阶段阅读测评', 'reading', 90, 20, '道题',
          '使用未练过的阅读材料完成 20 道题，保留作答时间；订正后说明每道错题的原文依据并复测。',
          '记录材料、原始作答、用时和错题依据。'),
        task('speaking', '阶段口语采样', 'speaking', 45, 3, '段回答',
          '录下日常问答、话题陈述和延伸讨论各 1 段，请按流利连贯、词汇、语法和发音提供具体反馈。',
          '记录 3 段录音位置、题目、反馈来源和需要改进的内容。'),
        task('writing', '阶段写作采样', 'writing', 90, 2, '份作品',
          week <= 28 ? '独立完成 1 份图表概述和 1 份观点段落，保存原稿与批改依据；这是分项练习，不作为完整雅思写作成绩。' : '使用新题完成至少 150 词的 Task 1 和至少 250 词的 Task 2，保留两篇原稿并安排评阅。',
          '记录题目、原稿位置、字数、用时与反馈来源。'),
        task('reflection', '阶段反馈与补弱安排', 'review', 60, 4, '条技能结论',
          '分别整理四项证据和待改进问题。没有可靠评分时记录表现与限制，不填写猜测的雅思分数。',
          '每项写 1 条具体结论、证据来源及下一阶段补弱任务。')
      ];
    }
    return [
      task('listening', '完整听力模拟与订正', 'listening', 60, 40, '道题',
        '用未做过的完整官方或可靠等值试卷练习，按该试卷及考试形式规定播放和计时；其余时间订正与复测，记录原始分和该套评分依据。',
        '记录试卷名称、用时、原始答对题数、是否重播和评分依据。'),
      task('reading', '完整学术阅读模拟与订正', 'reading', 90, 40, '道题',
        '独立完成一套未做过的完整学术阅读，按试卷规定计时；其余时间订正与复测，保留原始答案及评分依据。',
        '记录试卷名称、用时、原始答对题数与评分依据。'),
      task('writing', '完整学术写作模拟与订正', 'writing', 90, 2, '篇作文',
        '按正式作答时间完成至少 150 词的 Task 1 和至少 250 词的 Task 2，其余时间检查与订正。保存原稿，由可靠评阅者按四项官方维度反馈。',
        '记录两道题、两篇原稿、用时、字数和评阅来源。'),
      task('speaking', '三部分口语模拟与重录', 'speaking', 45, 3, '个部分',
        '进行包含追问的三部分陌生话题模拟并录音，按所用模拟要求计时；其余时间回听、分析并重录，安排基于录音的四维反馈。',
        '记录录音位置、题目、互动形式与反馈来源。'),
      task('reflection', '四项复盘与下轮训练', 'review', 75, 4, '条技能结论',
        '分别核对四项结果、证据可靠性和需要补强的内容。训练以四项 7.0 为留余量目标；完成任务不代表已获得正式考试成绩。',
        '每项记录本次证据、评分来源、仍有风险的能力点和下一步练习。')
    ];
  }

  function buildLegacyDay(dayNumber, content) {
    integerInRange(dayNumber, 1, COURSE_DAYS, '学习日');
    var week = Math.floor((dayNumber - 1) / 7) + 1;
    var weekday = ((dayNumber - 1) % 7) + 1;
    var info = getWeekInfo(week, content);
    var stage = stageForWeek(week);
    var kind = weekday < 7 ? 'study' : week % 4 === 0 ? 'checkpoint' : 'review';
    var tasks = kind === 'study' ? studyTasks(week, weekday, stage, info) :
      kind === 'review' ? reviewTasks(stage, info) : checkpointTasks(week, stage, info);
    return {
      planVersion: LEGACY_PLAN_VERSION,
      dayNumber: dayNumber,
      week: week,
      weekday: weekday,
      kind: kind,
      totalMinutes: tasks.reduce(function (sum, item) { return sum + item.minutes; }, 0),
      tasks: tasks,
      weekInfo: info
    };
  }

  var curriculumIndexes = new WeakMap();
  function curriculumIndex(data) {
    if (!data || data.version !== '1.0' || !Array.isArray(data.days) || data.days.length !== COURSE_DAYS || !Array.isArray(data.materials)) {
      throw new TypeError('课程任务数据未完整加载，需包含 1.0 版的 364 天日程与材料。');
    }
    var cached = curriculumIndexes.get(data);
    if (cached) return cached;
    data.days.forEach(function (day, index) {
      if (!day || day.day !== index + 1) throw new TypeError('课程日程必须按 1–364 天排列，且不得缺失或重复。');
    });
    var materials = new Map();
    data.materials.forEach(function (item) {
      if (!item || typeof item.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(item.id) || materials.has(item.id)) {
        throw new TypeError('课程材料身份无效或重复。');
      }
      materials.set(item.id, item);
    });
    cached = { materials: materials };
    curriculumIndexes.set(data, cached);
    return cached;
  }

  function buildCurriculumDay(dayNumber, content, data) {
    integerInRange(dayNumber, 1, COURSE_DAYS, '学习日');
    var info = getWeekInfo(Math.ceil(dayNumber / 7), content);
    var index = curriculumIndex(data);
    var source = data.days[dayNumber - 1];
    var week = Math.ceil(dayNumber / 7), weekday = ((dayNumber - 1) % 7) + 1;
    if (source.week !== week || source.weekday !== weekday || !Array.isArray(source.tasks) || !source.tasks.length) {
      throw new TypeError('第 ' + dayNumber + ' 天的课程任务不完整。');
    }
    var seen = new Set();
    var tasks = source.tasks.map(function (entry) {
      if (!entry || !OWN.call(TASK_NAMES, entry.id) || entry.skill !== entry.id || seen.has(entry.id) ||
        entry.unit !== TASK_UNITS[entry.id] || !Number.isInteger(entry.minutes) || entry.minutes <= 0 ||
        !Number.isInteger(entry.quantity) || entry.quantity <= 0 || !Array.isArray(entry.materialIds) ||
        !['practice', 'assessment'].includes(entry.mode) || typeof entry.instructions !== 'string' || !entry.instructions.trim() ||
        typeof entry.deliverable !== 'string' || !entry.deliverable.trim()) {
        throw new TypeError('第 ' + dayNumber + ' 天的课程任务定义无效或单位不一致。');
      }
      seen.add(entry.id);
      var materials = entry.materialIds.map(function (id) {
        var material = index.materials.get(id);
        if (!material) throw new TypeError('课程任务引用的材料不存在：' + id);
        return { id: id, title: material.title || id, url: '学习课程.html?day=' + dayNumber + '&material=' + encodeURIComponent(id) + '&mode=' + entry.mode };
      });
      return Object.assign({}, entry, {
        title: TASK_NAMES[entry.id],
        skill: entry.id === 'vocabulary' || entry.id === 'grammar' ? 'foundation' : entry.id === 'reflection' ? 'review' : entry.skill,
        curriculumSkill: entry.skill,
        instruction: entry.instructions,
        evidenceHint: entry.deliverable + '；保留原始作品、订正依据和下一次复测安排。',
        materialIds: entry.materialIds.slice(),
        materials: materials
      });
    });
    var totalMinutes = tasks.reduce(function (sum, item) { return sum + item.minutes; }, 0);
    if (totalMinutes !== 360 || source.totalMinutes !== totalMinutes) throw new TypeError('每日课程任务必须合计 360 分钟。');
    return {
      planVersion: CURRICULUM_PLAN_VERSION,
      curriculumStatus: data.status,
      dayNumber: dayNumber, week: week, weekday: weekday,
      kind: weekday < 7 ? 'study' : week % 4 === 0 ? 'checkpoint' : 'review',
      totalMinutes: totalMinutes, tasks: tasks, weekInfo: info
    };
  }

  function buildDay(dayNumber, content, options) {
    options = typeof options === 'string' ? { planVersion: options } : options || {};
    var data = OWN.call(options, 'curriculum') ? options.curriculum : root.IELTSCurriculumData;
    var version = options.planVersion || (data ? CURRICULUM_PLAN_VERSION : LEGACY_PLAN_VERSION);
    if (version === LEGACY_PLAN_VERSION) return buildLegacyDay(dayNumber, content);
    if (version !== CURRICULUM_PLAN_VERSION) throw new TypeError('不支持此日程版本。');
    return buildCurriculumDay(dayNumber, content, data);
  }

  function numericValue(value) {
    if (typeof value === 'string') {
      if (!/^\d+(?:\.\d+)?$/.test(value.trim())) return NaN;
      value = Number(value.trim());
    }
    return typeof value === 'number' && Number.isFinite(value) ? value : NaN;
  }

  function assertTask(taskDefinition) {
    if (!taskDefinition || typeof taskDefinition.id !== 'string' || !taskDefinition.id ||
      !Number.isFinite(taskDefinition.minutes) || taskDefinition.minutes <= 0 ||
      !Number.isInteger(taskDefinition.quantity) || taskDefinition.quantity <= 0) {
      throw new TypeError('任务定义必须包含有效的 id、minutes 和 quantity。');
    }
  }

  function validateTask(taskDefinition, record) {
    assertTask(taskDefinition);
    var item = record && typeof record === 'object' && !Array.isArray(record) ? record : {};
    var minutes = numericValue(item.actualMinutes);
    var quantity = numericValue(item.actualQuantity);
    var evidence = typeof item.evidence === 'string' ? item.evidence : '';
    var visibleCount = Array.from(evidence.replace(/[\s\p{Cf}\p{Cc}]/gu, '')).length;
    var issues = [];
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 600) {
      issues.push('请填写 0–600 之间的整数学习分钟数。');
    } else if (minutes < taskDefinition.minutes) {
      issues.push('实际学习时间尚未达到 ' + taskDefinition.minutes + ' 分钟。');
    }
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 10000) {
      issues.push('请填写 0–10000 之间的整数完成量。');
    } else if (quantity < taskDefinition.quantity) {
      issues.push('完成量尚未达到 ' + taskDefinition.quantity + ' ' + taskDefinition.unit + '。');
    }
    if (visibleCount < 12) issues.push('请填写至少 12 个非空白字符的具体成果或证据位置。');
    return { complete: issues.length === 0, issues: issues };
  }

  function summarizeDay(plan, records) {
    if (!plan || !Array.isArray(plan.tasks) || !plan.tasks.length) throw new TypeError('日程必须包含至少一个任务。');
    var source = records && typeof records === 'object' && !Array.isArray(records) ? records : {};
    var completedTasks = 0;
    var minutes = 0;
    var requiredMinutes = 0;
    var seen = Object.create(null);
    plan.tasks.forEach(function (definition) {
      assertTask(definition);
      if (seen[definition.id]) throw new TypeError('任务 id 不得重复。');
      seen[definition.id] = true;
      var record = OWN.call(source, definition.id) ? source[definition.id] : undefined;
      if (validateTask(definition, record).complete) completedTasks += 1;
      var reported = numericValue(record && record.actualMinutes);
      if (Number.isInteger(reported) && reported >= 0 && reported <= 600) minutes += reported;
      requiredMinutes += definition.minutes;
    });
    return { complete: completedTasks === plan.tasks.length && minutes <= 1440, completedTasks: completedTasks, totalTasks: plan.tasks.length, minutes: minutes, requiredMinutes: requiredMinutes };
  }

  function parseStartDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('日期格式必须为 YYYY-MM-DD。');
    var parts = value.split('-').map(Number);
    if (parts[0] < 1) throw new RangeError('年份必须在 0001–9999 之间。');
    var date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
    if (date.getUTCFullYear() !== parts[0] || date.getUTCMonth() !== parts[1] - 1 || date.getUTCDate() !== parts[2]) {
      throw new RangeError('日期不存在，请检查月份、天数或闰年。');
    }
    return date;
  }

  function dayForDate(startDate, todayDate) {
    return Math.round((parseStartDate(todayDate).getTime() - parseStartDate(startDate).getTime()) / DAY_MS) + 1;
  }

  function dateForDay(startDate, dayNumber) {
    integerInRange(dayNumber, 1, COURSE_DAYS, '学习日');
    var date = new Date(parseStartDate(startDate).getTime() + (dayNumber - 1) * DAY_MS);
    if (date.getUTCFullYear() > 9999) throw new RangeError('计算后的日期超出 9999 年。');
    return String(date.getUTCFullYear()).padStart(4, '0') + '-' + String(date.getUTCMonth() + 1).padStart(2, '0') + '-' + String(date.getUTCDate()).padStart(2, '0');
  }

  function getWeekSchedule(week, content, options) {
    integerInRange(week, 1, COURSE_WEEKS, '学习周');
    return Array.from({ length: 7 }, function (_, i) { return buildDay((week - 1) * 7 + i + 1, content, options); });
  }

  function getCourseSummary(content, options) {
    var result = { days: COURSE_DAYS, weeks: COURSE_WEEKS, studyDays: 0, reviewDays: 0, checkpointDays: 0, minutes: 0, hours: 0 };
    for (var day = 1; day <= COURSE_DAYS; day += 1) {
      var plan = buildDay(day, content, options);
      result[plan.kind + 'Days'] += 1;
      result.minutes += plan.totalMinutes;
    }
    result.hours = result.minutes / 60;
    return result;
  }

  return Object.freeze({
    COURSE_WEEKS: COURSE_WEEKS,
    COURSE_DAYS: COURSE_DAYS,
    LEGACY_PLAN_VERSION: LEGACY_PLAN_VERSION,
    CURRICULUM_PLAN_VERSION: CURRICULUM_PLAN_VERSION,
    buildDay: buildDay,
    validateTask: validateTask,
    summarizeDay: summarizeDay,
    parseStartDate: parseStartDate,
    dayForDate: dayForDate,
    dateForDay: dateForDay,
    getWeekSchedule: getWeekSchedule,
    getCourseSummary: getCourseSummary
  });
});
