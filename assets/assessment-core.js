(function (root) {
  'use strict';
  const SKILLS = ['listening', 'reading', 'writing', 'speaking'];
  const normalizeAnswer = value => typeof value === 'string' ? value.normalize('NFKC').replace(/[‘’]/g, "'").trim().replace(/\s+/g, ' ').replace(/^["“”]+|["“”]+$/g, '').toLowerCase() : '';
  const countWords = value => typeof value === 'string' ? (value.match(/(?:[A-Za-z]\.){2,}|[0-9]+(?:[:,.][0-9]+)*(?:[A-Za-z]+)?(?:[’'’-][A-Za-z0-9]+)*|[A-Za-z][A-Za-z0-9]*(?:[’'’-][A-Za-z0-9]+)*/g) || []).length : 0;
  function displayOptions(question, materialId = '', attemptId = '') {
    const options = Array.isArray(question?.options) ? question.options.slice() : [];
    if (!['single', 'multi'].includes(question?.type) || options.length < 2) return options;
    const keys = options.map(value => normalizeAnswer(value).replace(/[.!?。！？]+$/, '').replace(/[\s_-]+/g, ''));
    const enumerations = [['true', 'false'], ['true', 'false', 'notgiven'], ['yes', 'no'], ['yes', 'no', 'notgiven'], ['正确', '错误'], ['正确', '错误', '未提及']];
    // Keep conventional judgment enums and map/reference letters in their supplied order.
    if (enumerations.some(values => values.length === keys.length && values.every(value => keys.includes(value))) || options.every(value => typeof value === 'string' && /^[A-F]$/.test(value.normalize('NFKC').trim()))) return options;
    const seed = JSON.stringify([String(materialId), String(question.id || ''), String(attemptId)]);
    let state = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 0x01000193);
    state = state >>> 0 || 0x9e3779b9;
    for (let i = options.length - 1; i > 0; i--) {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      const j = Math.floor((state >>> 0) / 0x100000000 * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    return options;
  }
  function gradeQuestion(question, supplied) {
    const accepted = Array.isArray(question?.answers) ? question.answers : [];
    const multi = question?.type === 'multi';
    const values = multi ? (Array.isArray(supplied) ? supplied : []) : [typeof supplied === 'string' ? supplied : ''];
    const normalized = values.map(normalizeAnswer).filter(Boolean);
    const expected = accepted.map(normalizeAnswer).filter(Boolean);
    const answered = normalized.length > 0;
    const withinLimit = !question?.maxWords || values.every(value => countWords(value) <= question.maxWords);
    const correct = answered && withinLimit && expected.length > 0 && (multi ? new Set(normalized).size === normalized.length && normalized.length === expected.length && expected.every(answer => normalized.includes(answer)) : expected.includes(normalized[0]));
    return {id: question?.id || '', answered, correct, gradable: expected.length > 0, withinLimit, expected: accepted.slice(), explanation: question?.explanation || '', evidence: question?.evidence || ''};
  }
  function gradeMaterial(material, answers = {}) {
    const items = (material?.questions || []).map(question => gradeQuestion(question, answers[question.id]));
    const total = items.filter(item => item.gradable).length;
    const correct = items.filter(item => item.correct).length;
    return {items, correct, total, answered: items.filter(item => item.answered).length, ratio: total ? correct / total : null, allGradable: items.length > 0 && total === items.length};
  }
  function decodeArtifact(record) {
    try {
      const value = JSON.parse(record?.answer || '{}');
      return value && value.schema === 1 && typeof value === 'object' && !Array.isArray(value) ? value : null;
    } catch (_) { return null; }
  }
  function decodeReview(record) {
    try {
      const value = JSON.parse(record?.evaluation?.feedback || '{}');
      return value && Array.isArray(value.rounds) ? value : null;
    } catch (_) { return null; }
  }
  function assistanceUsed(record) { return Boolean(record?.assistance && ['hint', 'answer', 'ai'].some(key => record.assistance[key] === true)); }
  function audioGrounded(item,dimension,review,record) {
    const source=review?.audioSource,duration=source?.durationSeconds,mediaIds=(record.media||[]).map(m=>m.id);
    if(review?.audioAnalysisEvidence!==true||source?.recordId!==record.id||source?.completeCoverage!==true||!Number.isFinite(duration)||duration<=0||duration>900||!Array.isArray(source.mediaIds)||!source.mediaIds.length||source.mediaIds.length!==mediaIds.length||!source.mediaIds.every((id,index)=>id===mediaIds[index])||!Array.isArray(source.segments)||!source.segments.length)return false;
    let cursor=0;for(const segment of source.segments){if(!Number.isFinite(segment.startSeconds)||!Number.isFinite(segment.endSeconds)||Math.abs(segment.startSeconds-cursor)>.03||segment.endSeconds<=segment.startSeconds||segment.endSeconds>duration+.03||segment.audible!==true||!Array.isArray(segment.fluencyIds)||!segment.fluencyIds.length||!Array.isArray(segment.pronunciationIds)||!segment.pronunciationIds.length)return false;cursor=segment.endSeconds;}if(Math.abs(cursor-duration)>.05)return false;
    return Array.isArray(item?.audioEvidence)&&item.audioEvidence.some(e=>e?.dimension===dimension&&typeof e.id==='string'&&typeof e.quote==='string'&&e.quote.trim()&&Number.isFinite(e.startSeconds)&&Number.isFinite(e.endSeconds)&&e.startSeconds>=0&&e.endSeconds>e.startSeconds&&e.endSeconds<=duration+.01&&source.segments.some(s=>e.startSeconds>=s.startSeconds-.01&&e.endSeconds<=s.endSeconds+.01&&s[dimension+'Ids'].includes(e.id)));
  }
  function evaluatedCriteria(record, material, target = 7) {
    const review = decodeReview(record);
    const required = material.skill === 'writing' ? ['task', 'coherence', 'lexical', 'grammar'] : ['fluency', 'lexical', 'grammar', 'pronunciation'];
    const artifact = decodeArtifact(record);
    const text = normalizeAnswer(artifact?.text || artifact?.transcript || '');
    const rounds = review?.rounds?.filter(round => round.ok === true) || [];
    const reasons = [];
    if (review?.status !== 'complete') reasons.push('两轮评阅尚未完整完成');
    if (rounds.length < 2 || new Set(rounds.map(round => round.round)).size < 2) reasons.push('缺少两轮对同一原稿的有效 AI 评阅');
    const criteria = required.map(id => {
      const entries = rounds.map(round => round.criteria?.find(item => item.id === id));
      const bands = entries.map(item => item?.band).filter(band => typeof band === 'number' && Number.isFinite(band) && band >= 0 && band <= 9 && Number.isInteger(band*2));
      const complete = rounds.length >= 2 && entries.every(item => item && typeof item.band === 'number' && Number.isFinite(item.band) && item.band >= 0 && item.band <= 9 && Number.isInteger(item.band*2));
      const acoustic=material.skill==='speaking'&&['fluency','pronunciation'].includes(id);
      const grounded = entries.every(item => acoustic?audioGrounded(item,id,review,record):Array.isArray(item?.evidence) && item.evidence.some(evidence => typeof evidence.quote === 'string' && normalizeAnswer(evidence.quote).length > 0 && text.includes(normalizeAnswer(evidence.quote))));
      const difference = bands.length ? Math.max(...bands) - Math.min(...bands) : null;
      const pass = complete && grounded && bands.every(band => band >= target) && difference <= 0.5;
      if (!complete) reasons.push(id + ' 维度待验证');
      else if (!grounded) reasons.push(id + ' 缺少可核对的原稿证据');
      else if (difference > 0.5) reasons.push(id + ' 两轮意见分歧较大，需要新题复测');
      else if (!pass) reasons.push(id + ' 尚未稳定达到训练线');
      return {id, bands, complete, grounded, difference, pass};
    });
    if (review?.requiresRetest) reasons.push('AI 评阅标记需要复测');
    if (material.skill === 'speaking' && (!record.media?.length || review?.audioAnalysisEvidence!==true || !criteria.filter(c=>['fluency','pronunciation'].includes(c.id)).every(c=>c.grounded))) reasons.push('缺少可核对的原始录音及有效音频评价，发音不能由转写替代');
    if(material.skill==='speaking'&&(material.fullTest||material.pool==='final')&&(review?.audioSource?.task!=='full_test'||review.audioSource.durationSeconds<660))reasons.push('完整口语训练需要覆盖整套任务且不少于 11 分钟的原音证据');
    return {pass: reasons.length === 0 && criteria.every(item => item.pass), criteria, reasons: [...new Set(reasons)], source: 'ai-estimate'};
  }
  function evidenceFor(record, material, options = {}) {
    const artifact = decodeArtifact(record), reasons = [];
    const now = typeof options.now === 'number' ? options.now : Date.now();
    if (!record || !artifact) return {pass: false, pending: true, reasons: ['缺少课程原始作答记录']};
    if (record.materialId !== material.id || String(record.materialVersion || artifact.materialVersion) !== String(material.version)) reasons.push('材料或版本不匹配');
    if (artifact.mode !== 'assessment') reasons.push('这是练习记录，不是独立测评');
    if (record.exposure !== 'unseen' || artifact.exposureAtStart !== 'unseen') reasons.push('材料在本次测评前已经曝光或曝光状态不明');
    if (assistanceUsed(record)) reasons.push('作答中使用了提示、答案或 AI');
    if (artifact.interrupted) reasons.push('本次测评曾暂停或中断');
    const started = Date.parse(record.startedAt || artifact.startedAt), submitted = Date.parse(record.submittedAt || '');
    if (!Number.isFinite(started) || !Number.isFinite(submitted) || submitted < started || submitted > now + 1000) reasons.push('测评时间证据无效');
    if (!(record.activeSeconds > 0) || !(record.elapsedSeconds > 0)) reasons.push('缺少实际计时记录');
    if (!Number.isFinite(record.activeSeconds) || !Number.isFinite(record.elapsedSeconds) || record.activeSeconds > record.elapsedSeconds + 0.001) reasons.push('实际计时与经过时间不一致');
    const timeLimit = Number(material.timeLimitSeconds || material.estimatedMinutes * 60);
    if (Number.isFinite(timeLimit) && record.elapsedSeconds > timeLimit + 5) reasons.push('超过本材料限时');
    if (material.source?.verification !== 'reviewed') reasons.push('材料尚未完成内容复核，仅供练习');
    let grade = null, ai = null;
    if (['reading', 'listening', 'grammar'].includes(material.skill)) {
      grade = gradeMaterial(material, artifact.answers);
      if (!grade.allGradable) reasons.push('题目答案或计分配置不完整');
      const final = options.final === true;
      if (final && (!material.fullTest || grade.total !== 40)) reasons.push('不是完整 40 题测评');
      const threshold = final ? 32 / 40 : record.kind === 'retest' ? 0.8 : 0.85;
      if (grade.ratio === null || grade.ratio < threshold) reasons.push('客观题尚未达到本阶段训练线');
      if (material.skill === 'listening' && (!artifact.audioCompleted || !artifact.audioAvailable || artifact.transcriptViewed)) reasons.push('缺少完整听音证据，或作答时已查看听力原文');
    } else if (['writing', 'speaking'].includes(material.skill)) {
      const text = material.skill === 'writing' ? artifact.text : artifact.transcript;
      if (material.minWords && countWords(text) < material.minWords) reasons.push('原始输出未满足该任务最低词数');
      if (options.final || material.fullTest) {
        ai = evaluatedCriteria(record, material, options.target || 7);
        reasons.push(...ai.reasons);
      } else {
        const review = decodeReview(record), rounds = review?.rounds?.filter(round => round.ok === true) || [];
        const original = normalizeAnswer(text || '');
        const valid = review?.status === 'complete' && rounds.length >= 2 && new Set(rounds.map(round => round.round)).size >= 2 && !review.requiresRetest && rounds.every(round => round.levelCheck?.meetsGoal === true && round.levelCheck.evidence?.some(item => normalizeAnswer(item.quote) && original.includes(normalizeAnswer(item.quote))));
        if (!valid) reasons.push('新情境输出尚无两轮带原稿证据的有效 AI 目标核对');
        if (material.skill === 'speaking' && !record.media?.length) reasons.push('未保存原始口语录音');
      }
    }
    return {pass: reasons.length === 0, pending: !grade && (!ai || ai.criteria.some(item => !item.complete)), reasons: [...new Set(reasons)], grade, ai, artifact};
  }
  function localDate(iso) { const date = new Date(iso); return Number.isNaN(date.getTime()) ? '' : date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'); }
  function groupAssessments(records, materials, options = {}) {
    const groups = new Map(), materialMap = new Map(materials.map(material => [material.id, material]));
    for (const record of records) {
      const material = materialMap.get(record.materialId), artifact = decodeArtifact(record);
      if (!material?.assessmentGroup || !artifact || artifact.mode !== 'assessment' || (options.pool && material.pool !== options.pool)) continue;
      const key = material.assessmentGroup + ':' + (material.form || 'A');
      if (!groups.has(key)) groups.set(key, {id: key, assessmentGroup: material.assessmentGroup, form: material.form || 'A', pool: material.pool, records: [], materials: [], lastSubmittedAt: '', date: ''});
      const group = groups.get(key);
      group.records.push(record); group.materials.push(material);
      if (record.submittedAt > group.lastSubmittedAt) { group.lastSubmittedAt = record.submittedAt; group.date = localDate(record.submittedAt); }
    }
    return [...groups.values()].map(group => {
      const required = materials.filter(material => material.assessmentGroup === group.assessmentGroup && (material.form || 'A') === group.form && SKILLS.includes(material.skill));
      const results = required.map(material => {
        // A new attempt never erases a later failure; use the latest submitted version.
        const record = group.records.filter(item => item.materialId === material.id).sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)))[0];
        return {material, record, ...evidenceFor(record, material, {...options, final: material.pool === 'final'})};
      });
      const missingSkills = SKILLS.filter(skill => !required.some(material => material.skill === skill));
      const dates = new Set(results.filter(result => result.record).map(result => localDate(result.record.submittedAt)));
      return {...group, results, missingSkills, sameDate: dates.size === 1 && !dates.has(''), pass: missingSkills.length === 0 && results.length > 0 && results.every(result => result.pass) && dates.size === 1, reasons: [...missingSkills.map(skill => '材料包缺少 ' + skill), ...(dates.size !== 1 ? ['同一套测评未在同一天完成'] : []), ...results.flatMap(result => result.reasons)]};
    }).sort((a, b) => String(b.lastSubmittedAt).localeCompare(String(a.lastSubmittedAt)));
  }
  function readiness(records, materials, options = {}) {
    const now = typeof options.now === 'number' ? options.now : Date.now();
    const cutoff = now - (options.windowDays || 28) * 86400000;
    const recent = groupAssessments(records, materials, {...options, pool: 'final', now}).filter(group => Date.parse(group.lastSubmittedAt) >= cutoff && Date.parse(group.lastSubmittedAt) <= now).slice(0, 3);
    const dates = new Set(recent.map(group => group.date));
    const ids = recent.flatMap(group => group.results.map(result => result.material.id));
    const unique = new Set(ids).size === ids.length;
    const reasons = [];
    if (recent.length < 3) reasons.push('最近 28 天内不足三套完整末期测评记录');
    if (dates.size < recent.length) reasons.push('三套测评需要在不同日期进行');
    if (!unique) reasons.push('测评材料重复');
    recent.forEach(group => { if (!group.pass) reasons.push(group.id + '：' + group.reasons.join('；')); });
    return {ready: recent.length === 3 && dates.size === 3 && unique && recent.every(group => group.pass), recent, reasons, label: reasons.length ? '训练证据仍需补齐或补强' : '近期训练证据符合内部标准（写口为 AI 估计）', disclaimer: '这不是正式 IELTS 成绩，也不是考试结果保证；纯文字反馈不能验证口语发音。'};
  }
  function gateMastery(records,materials,options={}) {
    const groups=groupAssessments(records,materials,{...options,pool:'gate'});
    const ids=[...new Set(materials.filter(m=>m.pool==='gate'&&m.assessmentGroup).map(m=>m.assessmentGroup))];
    return ids.map(id=>{
      const a=groups.find(g=>g.assessmentGroup===id&&g.form==='A'),b=groups.find(g=>g.assessmentGroup===id&&g.form==='B'),reasons=[];
      const due=a?.pass?Date.parse(a.lastSubmittedAt)+48*3600000:null;
      if(!a?.pass)reasons.push(a?'A 卷仍有缺失或未通过的独立证据':'尚无合格 A 卷原稿');
      if(!b?.pass)reasons.push(b?'B 卷仍需补齐或补强':'A 卷通过后仍须进行 B 卷延迟复测');
      const aIds=new Set(a?.results.map(r=>r.material.id)||[]);
      if(b?.results.some(r=>aIds.has(r.material.id)))reasons.push('A、B 卷材料不能重复');
      const earliestB=b?.results.length?Math.min(...b.results.map(r=>Date.parse(r.record?.startedAt||''))):NaN;
      if(a?.pass&&b&&(!Number.isFinite(earliestB)||earliestB<due))reasons.push('B 卷必须在 A 卷完整提交后至少 48 小时才开始');
      const pass=Boolean(a?.pass&&b?.pass&&!reasons.length);
      const status=pass?'mastered':a?.pass&&!b?'awaiting-retest':a?.pass&&b?.pass?'too-early':'needs-evidence';
      return{id,week:Math.max(...materials.filter(m=>m.assessmentGroup===id).map(m=>m.week)),pass,status,label:pass?'A + 延迟 B 卷符合完整掌握条件':a?.pass&&!b?'A 卷合格，待延迟复测':'关卡证据仍需补齐或补强',a,b,dueAt:due?new Date(due).toISOString():null,reasons};
    });
  }
  function remediation(record, material) {
    const artifact = decodeArtifact(record), grade = gradeMaterial(material, artifact?.answers || {});
    return grade.items.filter(item => !item.correct).map(item => ({questionId: item.id, skill: material.skill, action: '先定位原文依据，解释错因，再闭卷回答同类新题。', evidence: item.evidence, explanation: item.explanation}));
  }
  function retestAvailability(record, alternatives, now = Date.now()) {
    const submitted = Date.parse(record?.submittedAt || '');
    const dueAt = Number.isFinite(submitted) ? submitted + 48 * 3600000 : Infinity;
    return {due: now >= dueAt, dueAt: Number.isFinite(dueAt) ? new Date(dueAt).toISOString() : null, materials: alternatives.filter(material => material.id !== record?.materialId), message: now >= dueAt ? '可以使用未见同级材料复测' : '先订正，至少间隔 48 小时后换题复测'};
  }
  const api = Object.freeze({SKILLS, normalizeAnswer, countWords, displayOptions, gradeQuestion, gradeMaterial, decodeArtifact, decodeReview, assistanceUsed, audioGrounded, evaluatedCriteria, evidenceFor, groupAssessments, gateMastery, readiness, remediation, retestAvailability, localDate});
  root.IELTSAssessment = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
