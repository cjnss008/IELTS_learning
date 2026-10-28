'use strict';
// Developer-only, read-only inspection of the inactive 11–20 draft collection.
// No learner data, runtime course, progress, backups, or user configuration are read or written.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'curriculum', 'linked-course-next');
const reportFile = path.join(root, 'docs', 'validation', 'linked-course-next-draft.json');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const countWords = text => ((text || '').match(/\b[\w]+(?:['’-][\w]+)*\b/g) || []).length;
const escapeRx = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const includesWord = (text, word) => new RegExp('\\b' + escapeRx(word) + '\\b', 'i').test(text || '');
const skills = ['vocabulary', 'grammar', 'reading', 'listening', 'speaking', 'writing'];
const minimumQuestions = { grammar: 12, reading: 10, listening: 10 };

function inspect(overrides = {}) {
  const errors = [], warnings = [], lessons = [], ipaCorrections = [], canonicalCorrections = [], seenWords = new Map(), seenIds = new Map();
  const error = (code, day, detail) => errors.push({code, day, detail});
  const warn = (code, day, detail, extra = {}) => { const category = (code==='audio.listening-stale'||code==='audio.others-unproduced') ? 'audio-production-pending' : code.startsWith('audio.') ? 'audio-review-pending' : code==='review.scope' ? 'review-scope' : code==='ipa.pending-review' ? 'lexical-review-pending' : code==='question.day11-extra' ? 'question-count-variance' : 'content-review'; warnings.push({code, day, category, detail, ...extra}); };
  const plan = read(path.join(dir, 'authoring-plan.json'));
  if (plan.schema !== 1 || plan.active !== false) error('plan.state', null, '词表规划必须为未激活的 schema 1 候选。');
  const published = require(path.join(root, 'assets', 'curriculum-data.js')).familyLessonRelease;
  const assessment = require(path.join(root, 'assets', 'assessment-core.js'));
  const coreLiter = require(path.join(root, 'assets', 'essential-vocabulary-data.js')).entries.find(x=>x.id==='essential:litre');
  const prior = (published && published.units || []).filter(u => u.day >= 4 && u.day <= 10);
  if (prior.length !== 7 || new Set(prior.map(u => u.day)).size !== 7) error('prior.incomplete', null, '已发布 family 4–10 课不完整，不能确认去重。');
  for (const u of prior) for (const t of u.targets || []) {
    if (typeof t.canonicalWord !== 'string' || typeof t.canonicalId !== 'string') { error('prior.target', u.day, '已发布目标词缺少词头或 canonicalId。'); continue; }
    seenWords.set(t.canonicalWord.toLowerCase(), `published-day${u.day}`);
    seenIds.set(t.canonicalId.toLowerCase(), `published-day${u.day}`);
  }
  let candidateAudioCount = 0, extensionIpaPendingCount = 0, dictionaryReferenceCheckedCount = 0;
  const inspectedDays = new Map();
  function checkAudio(c, day, label, transcript) {
    if (!c || typeof c !== 'object') { error('audio.missing-candidate', day, label); return; }
    const expectedStatus = transcript === undefined ? 'candidate-generated-pending-listening-and-release-review' : 'stale-transcript-changed-regeneration-required';
    if (c.status !== expectedStatus || c.kind !== 'synthetic-en-US-candidate' || c.humanListened !== false) error('audio.review-state', day, label);
    const rel = c.projectRelativePath;
    if (typeof rel !== 'string' || !rel.startsWith('work/day11-rail-v111/audio/curriculum/') || rel.split('/').includes('..') || rel.includes('\\')) { error('audio.path', day, label); return; }
    const full = path.resolve(root, ...rel.split('/'));
    const allowed = path.resolve(root, 'work/day11-rail-v111/audio/curriculum');
    const relative = path.relative(allowed, full);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) { error('audio.path', day, label); return; }
    try {
      const bytes = fs.readFileSync(full);
      if (sha(bytes) !== c.sha256 || bytes.length !== c.bytes) error('audio.hash-mismatch', day, label);
      else candidateAudioCount++;
    } catch (e) { error('audio.unavailable', day, `${label}: ${e.message}`); }
    if (transcript !== undefined && (c.transcriptHash === sha(transcript) || c.currentTranscriptHash !== sha(transcript) || !c.staleReason)) error('audio.stale-binding', day, `${label} 过期音频须保留旧稿哈希并明确指向当前稿。`);
  }
  for (let day = 11; day <= 20; day++) {
    let d;
    try { d = overrides[day] || read(path.join(dir, `day${day}.json`)); }
    catch (e) { error('day.unreadable', day, e.message); continue; }
    if (d.schema !== 1 || d.day !== day || d.level !== 'A2' || d.active !== false || d.status !== 'author-draft-pending-review') error('day.state', day, 'schema、day、level、未激活或待审状态不符合候选合同。');
    inspectedDays.set(day,d);
    const targets = Array.isArray(d.targets) ? d.targets : [];
    if (targets.length !== 30) error('target.count', day, `目标词数量 ${targets.length}，应为 30。`);
    const planned = (plan.units || []).find(u => u.day === day);
    if (day >= 12 && (!planned || planned.targets.length !== 30)) error('plan.missing', day, '缺少 30 词规划。');
    const ms = Array.isArray(d.materials) ? d.materials : [];
    const bySkill = {};
    for (const m of ms) {
      if (!m || !skills.includes(m.skill) || bySkill[m.skill]) { error('material.skill', day, '模块缺失、重复或类型未知。'); continue; }
      bySkill[m.skill] = m;
      if (m.courseDay !== day || m.level !== 'A2' || m.pool !== 'training' || m.source?.kind !== 'original-ai-assisted-fiction' || m.source?.verification !== 'author-draft-pending-release-review' || m.source?.practiceOnly !== true || m.source?.independentAssessmentEligible !== false || m.source?.independentTransferEligible !== false || m.fullTest !== false || m.independentBank !== false) error('material.state', day, `${m.skill} 来源、课程归属或训练状态不符。`);
      if (typeof m.id !== 'string' || !m.id.includes(`d${day}-`) || !m.id.includes(m.skill)) error('material.id', day, `${m.skill} ID 无效。`);
    }
    if (ms.length !== 6 || skills.some(s => !bySkill[s])) error('material.count', day, '必须且只能包含六个不同模块。');
    const R = bySkill.reading, L = bySkill.listening, V = bySkill.vocabulary, G = bySkill.grammar, S = bySkill.speaking, W = bySkill.writing;
    const passage = typeof R?.passage === 'string' ? R.passage : '';
    const transcript = typeof L?.transcript === 'string' ? L.transcript : '';
    if (!passage || !transcript) error('material.text', day, '缺少阅读原文或听力逐字稿。');
    const vocab = Array.isArray(V?.vocabulary) ? V.vocabulary : [];
    if (vocab.length !== 30) error('vocabulary.count', day, `词汇模块 ${vocab.length} 项，应为 30。`);
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (!t || typeof t.word !== 'string' || typeof t.canonicalId !== 'string') { error('target.identity', day, `第 ${i + 1} 项缺少词头或 canonicalId。`); continue; }
      const word = t.word.toLowerCase(), id = t.canonicalId.toLowerCase();
      if (seenWords.has(word)) error('target.duplicate-word', day, `${t.word} 已出现在 ${seenWords.get(word)}。`); else seenWords.set(word, `day${day}`);
      if (seenIds.has(id)) error('target.duplicate-id', day, `${t.canonicalId} 已出现在 ${seenIds.get(id)}。`); else seenIds.set(id, `day${day}`);
      if (planned && (planned.targets[i]?.word !== t.word || planned.targets[i]?.canonicalId !== t.canonicalId)) {
        const correction = day===13 && t.word==='liter' && planned.targets[i]?.word==='liter' && planned.targets[i]?.canonicalId==='extension:liter' && coreLiter?.word==='litre' && coreLiter?.spellingVariants?.includes('liter') && t.canonicalId===coreLiter.id && t.canonicalWord===coreLiter.word && t.ipa===coreLiter.ipa && t.canonicalIdentityReference?.originalPlanCanonicalId==='extension:liter';
        if (!correction) error('target.plan', day, `${t.word} 与规划中的顺序或 ID 不符且无已核实的拼写变体依据。`);
        else canonicalCorrections.push({day,word:'liter',surface:'liter',originalPlanCanonicalId:'extension:liter',canonicalId:coreLiter.id,canonicalWord:coreLiter.word,source:'assets/essential-vocabulary-data.js'});
      }
      if (planned?.targets[i]?.ipa && planned.targets[i].ipa !== t.ipa) {
        const allowed = day===19 && ({essay:{ipa:'/ˈɛseɪ/',url:'https://dictionary.cambridge.org/us/pronunciation/english/essay'},curriculum:{ipa:'/kəˈɹɪkjələm/',url:'https://dictionary.cambridge.org/us/pronunciation/english/curriculum'}})[t.word];
        if (!allowed || t.ipa!==allowed.ipa || t.ipaReference?.url!==allowed.url || t.ipaReference?.originalPlanIpa!==planned.targets[i].ipa || t.ipaVerification!=='dictionary-reference-reviewed-audio-unverified') error('target.plan-ipa', day, `${t.word} 的规划 IPA 差异缺少正确的词典与原值记录。`);
        else ipaCorrections.push({day,word:t.word,originalPlanIpa:planned.targets[i].ipa,candidateIpa:t.ipa,source:allowed.url,audio:'not produced or independently reviewed'});
      }
      if (!t.meaning || !t.pos || !t.ipa) error('target.metadata', day, `${t.word} 缺释义、词性或 IPA。`);
      const coords = [t.start, t.end, t.quoteStart, t.quoteEnd];
      if (!coords.every(Number.isInteger) || t.quoteStart < 0 || t.quoteStart > t.start || t.start >= t.end || t.end > t.quoteEnd || t.quoteEnd > passage.length) error('target.range', day, `${t.word} UTF-16 范围无效。`);
      else {
        if (passage.slice(t.start, t.end).toLowerCase() !== word) error('target.word-offset', day, `${t.word} 词头坐标与阅读原文不符。`);
        if (passage.slice(t.quoteStart, t.quoteEnd) !== t.quote) error('target.quote-offset', day, `${t.word} 例句坐标与阅读原文不符。`);
        if ((t.start > 0 && /[A-Za-z]/.test(passage[t.start - 1])) || (t.end < passage.length && /[A-Za-z]/.test(passage[t.end]))) error('target.word-boundary', day, `${t.word} 被截取为其他单词的一部分。`);
      }
      if (t.sourceMaterialId && t.sourceMaterialId !== R?.id) error('target.source-id', day, `${t.word} 原文材料 ID 不符。`);
      if (t.sourceTextSha256 && t.sourceTextSha256 !== sha(passage)) error('target.source-hash', day, `${t.word} 原文哈希不符。`);
      if (t.supplementaryContexts !== undefined && !Array.isArray(t.supplementaryContexts)) error('target.supplementary-context',day,`${t.word} 的补充上下文必须为数组。`);
      for (const context of Array.isArray(t.supplementaryContexts)?t.supplementaryContexts:[]) {
        const source=bySkill[context?.skill], text=context?.skill==='listening'?source?.transcript:source?.passage;
        const valid=!!context && typeof text==='string' && context.sourceMaterialId===source?.id && context.sourceTextSha256===sha(text) &&
          [context.start,context.end,context.quoteStart,context.quoteEnd].every(Number.isInteger) && context.quoteStart>=0 && context.quoteStart<=context.start && context.start<context.end && context.end<=context.quoteEnd && context.quoteEnd<=text.length &&
          text.slice(context.start,context.end).toLowerCase()===word && typeof context.surface==='string' && context.surface.toLowerCase()===word && text.slice(context.quoteStart,context.quoteEnd)===context.quote &&
          Array.isArray(context.questionIds) && context.questionIds.length>0 && context.questionIds.every(id=>(source.questions||[]).some(q=>q.id===id && q.evidence===context.quote)) &&
          context.role==='same-unit-context-not-independent-new-source';
        if (!valid) error('target.supplementary-context',day,`${t.word} 的补充上下文、原文哈希、坐标或同源题引用不符。`);
      }
      const v = vocab.find(x => x.word === t.word);
      if (!v || v.meaning !== t.meaning || v.pos !== t.pos || v.ipa !== t.ipa || (v.canonicalId && v.canonicalId !== t.canonicalId) || v.example !== t.quote) error('vocabulary.binding', day, `${t.word} 的词汇卡与目标词或原文例句不一致。`);
      if (day === 11) { checkAudio(t.audioCandidate, day, `word:${t.word}`); if (!v?.audioCandidate || v.audioCandidate.sha256 !== t.audioCandidate?.sha256 || v.audioCandidate.projectRelativePath !== t.audioCandidate?.projectRelativePath || v.audioCandidate.status !== t.audioCandidate?.status || v.audioCandidate.humanListened !== false) error('audio.vocabulary-binding', day, `${t.word} 的词汇卡候选音频与目标词不符。`); }
      else if (t.audio || t.audioCandidate || v?.audio || v?.audioCandidate) error('audio.unexpected', day, `${t.word} 未有已核实的候选音频，却包含音频字段。`);
      const mark=t.ipaVerification||t.ipaSource||'';
      const ref=t.dictionaryReview;
      if(mark==='dictionary-reference-checked' || ref?.status==='dictionary-reference-checked') {
        let sourceOk=false, dateOk=false;
        try {
          const url=new URL(ref?.sourceUrl);
          sourceOk=url.protocol==='https:' && url.hostname==='dictionary.cambridge.org' && url.pathname===`/us/dictionary/english/${word}` && !url.search && !url.hash;
          const date=ref?.checkedOn;
          dateOk=typeof date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T00:00:00.000Z`).toISOString().slice(0,10)===date;
        } catch { /* malformed evidence is rejected below */ }
        if(mark!=='dictionary-reference-checked' || ref?.status!=='dictionary-reference-checked' || !sourceOk || !dateOk || ref.partOfSpeech!==t.pos || ref.audioListeningReview!=='pending' || (v?.ipaVerification||v?.ipaSource)!==mark || JSON.stringify(v?.dictionaryReview)!==JSON.stringify(ref)) error('ipa.dictionary-reference',day,`${t.word} 词典核验声明缺少对应词条来源、词性、日期、卡片一致性或待听审状态。`);
        else dictionaryReferenceCheckedCount++;
      } else if (t.canonicalId.startsWith('extension:')) {
        if(mark.includes('author-estimate')) extensionIpaPendingCount++;
        if(!mark.includes('not-dictionary-verified')) warn('ipa.explicit-unverified-label', day, `${t.word} 的作者估计需明确标记未经词典核验。`);
      }
    }
    const counts = {};
    for (const skill of ['grammar', 'reading', 'listening']) {
      const m = bySkill[skill], qs = Array.isArray(m?.questions) ? m.questions : [], text = skill === 'listening' ? transcript : m?.passage || '';
      counts[skill] = qs.length;
      if (qs.length < minimumQuestions[skill]) error('question.count', day, `${skill} ${qs.length} 题，最低 ${minimumQuestions[skill]}。`);
      if (m?.questionCount !== undefined && m.questionCount !== qs.length) error('question.declared-count', day, `${skill} questionCount 不符。`);
      const ids = new Set();
      for (const q of qs) {
        if (!q?.id || ids.has(q.id)) error('question.id', day, `${skill} 题目 ID 缺失或重复。`); else ids.add(q.id);
        if (typeof q.prompt !== 'string' || !q.prompt.trim() || /[\u3400-\u9fff]/.test(q.prompt) || (typeof q.explanation !== 'string' || !/[\u3400-\u9fff]/.test(q.explanation)) || !Array.isArray(q.answers) || q.answers.length === 0 || q.answers.some(a => typeof a !== 'string' || !a.trim())) error('question.fields', day, `${skill}/${q.id || '?'} 题干、中文解释或答案无效。`);
        if (q.type === 'single') {
          if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some(o => typeof o !== 'string' || !o.trim() || /[\u3400-\u9fff]/.test(o)) || new Set(q.options).size !== 4 || q.answers?.length !== 1 || !q.options.includes(q.answers?.[0])) error('question.answer', day, `${skill}/${q.id} 单选选项或正确答案无效。`);
        } else if (q.type === 'short') {
          if (!Number.isInteger(q.maxWords) || q.maxWords < 1) error('question.short', day, `${skill}/${q.id} 缺少短答字数上限。`);
          if (Array.isArray(q.answers) && q.answers.some(a => typeof a === 'string' && !assessment.gradeQuestion(q,a).correct)) error('question.alternative-grading', day, `${skill}/${q.id} 至少一个列出的短答无法通过评分。`);
        } else error('question.type', day, `${skill}/${q.id} 题型不支持。`);
        const o = q.evidenceOffsets;
        if (typeof q.evidence !== 'string' || !q.evidence || !o || o.unit !== 'UTF-16-code-unit' || !Number.isInteger(o.start) || !Number.isInteger(o.end) || o.start < 0 || o.end <= o.start || o.end > text.length || text.slice(o.start, o.end) !== q.evidence) error('question.evidence-offset', day, `${skill}/${q.id} 证据与原文 UTF-16 坐标不符。`);
      }
      if (qs.length && !errors.some(e => e.day === day && e.code.startsWith('question.'))) {
        try { const r = assessment.gradeMaterial(m, Object.fromEntries(qs.map(q => [q.id, q.answers[0]]))); if (r.correct !== qs.length) error('question.grading', day, `${skill} 正确答案在评分器中仅通过 ${r.correct}/${qs.length}。`); }
        catch (e) { error('question.grading', day, `${skill}: ${e.message}`); }
      }
      const positions = qs.filter(q => q.type === 'single' && q.options?.includes(q.answers?.[0])).map(q => q.options.indexOf(q.answers[0]));
      const period = [1,2,3,4].find(k => positions.length >= 8 && positions.every((v,i) => v === positions[i % k]));
      if (period) warn('question.predictable-options', day, `${skill} 正确选项每 ${period} 题重复相同位置模式，建议打乱并重新审核。`);
    }
    if (day === 11 && (counts.grammar !== 12 || counts.reading !== 10)) warn('question.day11-extra', day, `为保留原候选，第 11 课语法 ${counts.grammar} 题、阅读 ${counts.reading} 题；后续课程各为 12 和 10 题。`);
    const turnLines = transcript.split('\n').filter(Boolean), roles = [...new Set(turnLines.map(line => (line.match(/^([^:]+):\s*/) || [,''])[1]).filter(Boolean))];
    const spokenTranscript = turnLines.map(line => line.replace(/^[^:\n]+:\s*/, '')).join(' ');
    const readingWords = countWords(passage), listeningWords = countWords(spokenTranscript), speakingWords = countWords(S?.reference || '');
    const listeningTargets = targets.filter(t => typeof t?.word === 'string' && includesWord(spokenTranscript, t.word)).length;
    const speakingTargets = targets.filter(t => typeof t?.word === 'string' && includesWord(S?.reference, t.word)).length;
    if (roles.length !== 2 || turnLines.some(line => !/^[^:]+:\s*\S/.test(line))) warn('listening.roles', day, `识别到 ${roles.length} 个角色或存在未标角色段落，须人工核对。`);
    if (readingWords < 400 || readingWords > 550) warn('reading.length', day, `阅读约 ${readingWords} 词，目标约 400–550；词数规则对连字符等可能有差异。`);
    if (listeningWords < 250 || listeningWords > 350) warn('listening.length', day, `听力约 ${listeningWords} 词（不含角色标签），目标约 250–350。`);
    if (listeningTargets < 18) warn('listening.target-coverage', day, `听力逐字稿检测到 ${listeningTargets}/30 个目标词原形，目标至少 18。`);
    if (speakingWords < 100 || speakingWords > 130 || speakingTargets < 6) warn('speaking.model', day, `示例约 ${speakingWords} 词，检测到 ${speakingTargets} 个目标词，须复核 100–130 词及至少六词要求。`);
    if (!S?.prompt || !W?.prompt || !/120\s*[–-]\s*160/.test(W.prompt)) warn('output.tasks', day, '口语或写作题干缺失，或写作未明确 120–160 词，须复核。');
    if (day === 11) {
      if (L?.audio) error('audio.release-path', day, '不得把未发布音频标为运行时 audio。');
      if (d.audioPending?.status !== 'word-candidates-listening-stale-regeneration-required' || V?.audioPending?.status !== 'candidate-produced-pending-review' || L?.audioPending?.status !== 'stale-candidate-requires-regeneration') error('audio.pending-state', day, '已生成音频必须仍标记为待审候选。');
      checkAudio(L?.audioCandidate, day, 'listening', transcript);
      try {
        const c = L.audioCandidate, prov = read(path.join(root, 'work/day11-rail-v111/provenance/family-linked-d11-listening-v111.json'));
        const oldListening = read(path.join(root, 'work/day11-rail-v111/materials/family-linked-d11-listening-v111.json'));
        if (sha(oldListening.transcript) !== c.transcriptHash) error('audio.stale-original', day, '过期音频记录未绑定其原始逐字稿。');
        if (c.audioHash || c.sha256 !== prov.audioHash || c.transcriptHash !== prov.transcriptHash || c.configurationHash !== prov.configurationHash) error('audio.provenance', day, '听力候选与原生成记录不一致。');
        const report = read(path.join(root, 'work/day11-rail-v111/audio-report.json'));
        for (const t of targets) { const record = report.words.find(x => x.word === t.word); if (!record || record.sha256 !== t.audioCandidate?.sha256 || record.humanListened !== false || t.audioCandidate?.projectRelativePath !== 'work/day11-rail-v111/' + record.src) error('audio.word-report', day, `${t.word} 缺少匹配的未听审原生成记录。`); else if (record.ipaReference !== t.ipa && (t.ipaReference?.originalCandidateIpa !== record.ipaReference || t.audioCandidate?.recordedIpaReference !== record.ipaReference || !t.ipaReference?.url)) error('audio.word-ipa-history', day, `${t.word} 修正 IPA 缺少原录音 IPA 历史。`); }
      } catch (e) { error('audio.provenance-unavailable', day, e.message); }
      warn('audio.listening-stale', day, '第 11 课旧听力音频仅绑定旧稿；当前逐字稿须采用另行生成、逐段听审的双角色音频，旧文件不可作为新稿音频。');
      warn('audio.listening-review', day, '第 11 课 30 个词音仅为合成候选；文件哈希不代表逐词听审、发音校准或发布许可。');
      for (const word of ['arrival','arrive','transfer']) { const t=targets.find(x=>x.word===word); if (t?.ipaVerification === 'dictionary-reference-reviewed-audio-unverified') warn('audio.corrected-ipa-unheard',day,`${word} 的 IPA 已按词典更正，旧合成音频未复听验证。`,{source:t.ipaReference?.url,originalIpa:t.ipaReference?.originalCandidateIpa,candidateIpa:t.ipa}); }
    } else {
      if (L?.audio || L?.audioCandidate) error('audio.unexpected', day, '听力未有经核实的候选音频，却包含音频字段。');
      const rootPending = d.audioPending && d.audioPending.status === 'not-produced';
      const materialPending = V?.audioPending === true && L?.audioPending === true;
      if (!rootPending && !materialPending) error('audio.pending-state', day, '未制作的词音与听力必须显式保持待制作状态，不能标为已审。');
    }
    if (day === 19 && G?.questions?.[0]?.prompt.includes('Lena visits college') && G?.questions?.[0]?.evidence.includes('Lena visits the college')) warn('question.quote-mismatch', day, 'grammar/g01 题干引用句与教学证据仅差冠词 the；宜统一逐字引用。');
    if (day === 11 && R?.questions?.some(q => q.id === 'r08' && q.answers?.includes('It will run after the track check.')) && passage.includes('Staff do not plan to cancel it; they expect the track check to finish soon.')) warn('reading.inference-gap', day, 'reading/r08 的答案称列车检查后会运行；证据明确说不计划取消并预计检查很快结束，未直接承诺检查后开行，建议收窄答案或补充原文。');
    if (day === 12 && passage.includes('The poster explains that medicine is often an uncountable word in English') && transcript.includes('This is a language question, not a plan to take anything.')) warn('content.naturalness', day, '诊所海报和就诊对话直接解释可数性、语言问题，语境信息有助学习，但像嵌入式词汇教学，建议审阅交际自然度。');
    if (day === 14 && passage.includes('before the next visitor moves in')) warn('reading.word-choice', day, '阅读写 next visitor moves in，与租客入住语境不够自然，建议改为 next tenant；同步相应题目证据。');
    if (day === 19) {
      const essay=targets.find(t=>t.word==='essay'), curriculum=targets.find(t=>t.word==='curriculum');
      if (essay?.ipa === '/ɛˈseɪ/' && essay.pos === 'n.') warn('ipa.sense-mismatch',day,'essay 为名词时，规划继承的 /ɛˈseɪ/ 重音与所列词典的美式名词发音不同；需核对并修正，不能仅因匹配规划而认定正确。',{source:'https://dictionary.cambridge.org/us/pronunciation/english/essay',expectedDictionaryIpa:'/ˈes.eɪ/',candidateIpa:essay.ipa});
      if (curriculum?.ipa === '/kɚˈɪkjələm/') warn('ipa.dictionary-mismatch',day,'curriculum 继承的 IPA 与所列词典的美式音节及 /r/ 位置不同，需复核。',{source:'https://dictionary.cambridge.org/us/pronunciation/english/curriculum',expectedDictionaryIpa:'/kəˈrɪk.jə.ləm/',candidateIpa:curriculum.ipa});
    }
    lessons.push({day,targets:targets.length,materials:ms.length,questions:counts,readingWords,listeningWordsExcludingRoleLabels:listeningWords,listeningTargetWords:listeningTargets,speakingWords,speakingTargetWords:speakingTargets,readingSha256:sha(passage),listeningSha256:sha(transcript),audio:day===11?'30 word candidates need listening review; one stale listening candidate retained only as history and regeneration required':'inactive draft has no approved audio binding; separate work candidates await listening and release review'});
  }
  try {
    const pack=read(path.join(dir,'audio-pending-inputs.json'));
    if(pack.schema!==1 || pack.active!==false || pack.status!=='draft-authoring-inputs-not-runtime-release' || pack.listening?.length!==10 || pack.wordGeneration?.length!==9 || pack.speakingModels?.length!==10) error('audio-inputs.state',null,'音频输入清单状态或数量不符。');
    for(let day=11;day<=20;day++){
      const d=inspectedDays.get(day),ms=Object.fromEntries((d?.materials||[]).map(m=>[m.skill,m])), item=pack.listening?.find(x=>x.day===day), spoken=pack.speakingModels?.find(x=>x.day===day);
      if(!item || item.text!==ms.listening?.transcript || item.textSha256!==sha(ms.listening?.transcript||'') || item.materialId!==ms.listening?.id || item.productionStatus!=='not-produced-for-current-text' || item.minimumSpeakers!==2) error('audio-inputs.listening',day,'听力输入快照与当前逐字稿或待制作状态不符。');
      if(!spoken || spoken.text!==ms.speaking?.reference || spoken.textSha256!==sha(ms.speaking?.reference||'') || spoken.materialId!==ms.speaking?.id) error('audio-inputs.speaking',day,'口语示例输入快照与候选不符。');
      if(day>=12){const w=pack.wordGeneration?.find(x=>x.day===day);if(!w || w.materialId!==ms.vocabulary?.id || w.words?.length!==30 || w.words.some((x,i)=>x.text!==d.targets[i].word||x.ipa!==d.targets[i].ipa||x.pos!==d.targets[i].pos||x.canonicalId!==d.targets[i].canonicalId||x.canonicalWord!==(d.targets[i].canonicalWord||d.targets[i].word)||x.example!==d.targets[i].quote||(d.targets[i].dictionaryReview?.status==='dictionary-reference-checked'&&(x.ipaReview!=='dictionary-reference-checked'||JSON.stringify(x.dictionaryReview)!==JSON.stringify(d.targets[i].dictionaryReview))))) error('audio-inputs.words',day,'待制作单词清单与词汇、音标或语境不符。');}
      else if(pack.existingWordCandidates?.day!==11 || JSON.stringify(pack.existingWordCandidates.wordTexts)!==JSON.stringify(d.targets.map(t=>t.word))) error('audio-inputs.existing',day,'第 11 课已有词音候选清单与词表不符。');
    }
  } catch(e) { error('audio-inputs.unavailable',null,e.message); }
  warn('audio.others-unproduced',null,'第 12–20 课草稿尚未登记已审的 9 份听力与 270 个词音；work 中另有合成候选，须核对绑定、逐项听审及发布审核。');
  warn('audio.speaking-pending',null,'第 12–15 课草稿尚未登记已审的 4 份口语示范；work 中合成候选须核对绑定和听审，其他口语示范列为可选。');
  if(extensionIpaPendingCount) warn('ipa.pending-review',null,`${extensionIpaPendingCount} 个扩展词音标为作者估计、未经词典核验，生成语音前仍须按义项逐词复核。`);
  warn('review.scope', null, '结构、选项和原文定位可由规则检查；语义唯一性、教学难度、IPA 全表、真实听审及学习效果仍需逐项复核。');
  return {schema:1,scope:'Inactive original-ai-assisted draft collection days 11–20; compares targets against published family days 4–10. No learner records or runtime course modifications.',status:errors.length?'structural-check-failed':'structural-check-passed-with-content-review-pending',releaseReady:false,checks:{days:lessons.length,targets:lessons.reduce((n,x)=>n+x.targets,0),publishedComparisonDays:prior.map(x=>x.day),candidateAudioHashesChecked:candidateAudioCount,staleListeningCandidates:lessons.some(x=>x.day===11)?1:0,structuralErrors:errors.length,contentWarnings:warnings.filter(x=>x.category==='content-review').length,audioProductionOrReviewPending:warnings.filter(x=>x.category==='audio-production-pending'||x.category==='audio-review-pending').length,extensionIpaPending:extensionIpaPendingCount,dictionaryReferenceChecked:dictionaryReferenceCheckedCount,allWarnings:warnings.length,contentWarningsScope:'Only issues detected by implemented rules or limited manual checks; zero does not certify complete semantic review.'},lessons,documentedPlanIpaCorrections:ipaCorrections,documentedCanonicalCorrections:canonicalCorrections,errors,warnings};
}

function selfTest() {
  const d11=read(path.join(dir,'day11.json')),d13=read(path.join(dir,'day13.json')),d16=read(path.join(dir,'day16.json')),d18=read(path.join(dir,'day18.json')),d19=read(path.join(dir,'day19.json')),d20=read(path.join(dir,'day20.json'));
  const copy=x=>JSON.parse(JSON.stringify(x));
  const cases=[
    ['active state','day.state',()=>{const x=copy(d16);x.active=true;return {16:x};}],
    ['word coordinates','target.word-offset',()=>{const x=copy(d16);x.targets[0].start++;return {16:x};}],
    ['duplicate words','target.duplicate-word',()=>{const x=copy(d20);x.targets[0].word=d19.targets[0].word;x.targets[0].canonicalId=d19.targets[0].canonicalId;return {20:x};}],
    ['answer option','question.answer',()=>{const x=copy(d18),m=x.materials.find(m=>m.skill==='reading');m.questions[0].answers=['not an option'];return {18:x};}],
    ['evidence coordinates','question.evidence-offset',()=>{const x=copy(d18),m=x.materials.find(m=>m.skill==='reading');m.questions[0].evidenceOffsets.start++;return {18:x};}],
    ['audio byte binding','audio.hash-mismatch',()=>{const x=copy(d11);x.targets[0].audioCandidate.sha256='0'.repeat(64);return {11:x};}],
    ['audio cannot claim review','audio.pending-state',()=>{const x=copy(d16);x.audioPending.status='approved';return {16:x};}],
    ['stale audio cannot claim current','audio.review-state',()=>{const x=copy(d11);x.materials.find(m=>m.skill==='listening').audioCandidate.status='candidate-generated-pending-listening-and-release-review';return {11:x};}],
    ['stale binding to current text','audio.stale-binding',()=>{const x=copy(d11);x.materials.find(m=>m.skill==='listening').audioCandidate.currentTranscriptHash='0'.repeat(64);return {11:x};}],
    ['missing answer','question.answer',()=>{const x=copy(d18),m=x.materials.find(m=>m.skill==='reading');delete m.questions[0].answers;return {18:x};}],
    ['audio input transcript drift','audio-inputs.listening',()=>{const x=copy(d16);x.materials.find(m=>m.skill==='listening').transcript+=' Extra.';return {16:x};}],
    ['audio input word drift','audio-inputs.words',()=>{const x=copy(d16);x.targets[0].ipa='/changed/';return {16:x};}],
    ['supplementary context hash','target.supplementary-context',()=>{const x=copy(d13),t=x.targets.find(t=>t.word==='reduction');t.supplementaryContexts[0].sourceTextSha256='0'.repeat(64);return {13:x};}],
    ['dictionary verification needs source','ipa.dictionary-reference',()=>{const x=copy(d16),t=x.targets.find(t=>t.canonicalId.startsWith('extension:'));t.ipaVerification='dictionary-reference-checked';delete t.dictionaryReview;return {16:x};}],
    ['dictionary verification source must match word','ipa.dictionary-reference',()=>{const x=copy(d16),t=x.targets.find(t=>t.dictionaryReview?.status==='dictionary-reference-checked');t.dictionaryReview.sourceUrl='https://dictionary.cambridge.org/us/dictionary/english/another';return {16:x};}],
    ['dictionary verification needs a real date','ipa.dictionary-reference',()=>{const x=copy(d16),t=x.targets.find(t=>t.dictionaryReview?.status==='dictionary-reference-checked');t.dictionaryReview.checkedOn='2026-02-30';return {16:x};}],
    ['dictionary verification needs matching part of speech','ipa.dictionary-reference',()=>{const x=copy(d16),t=x.targets.find(t=>t.dictionaryReview?.status==='dictionary-reference-checked');t.dictionaryReview.partOfSpeech='other';return {16:x};}],
    ['dictionary verification never certifies listening','ipa.dictionary-reference',()=>{const x=copy(d16),t=x.targets.find(t=>t.dictionaryReview?.status==='dictionary-reference-checked');t.dictionaryReview.audioListeningReview='passed';return {16:x};}]
  ];
  const baseline=inspect();assert.equal(baseline.errors.length,0,`baseline errors: ${JSON.stringify(baseline.errors)}`);
  for(const [name,code,mutate] of cases){const r=inspect(mutate());assert(r.errors.some(e=>e.code===code),`${name} did not trigger ${code}`);}
  return {schema:1,mode:'in-memory mutations only',cases:cases.map(([name,code])=>({name,expectedCode:code,passed:true}))};
}

const args = process.argv.slice(2);
if (args.some(x => !['--write-report','--self-test'].includes(x)) || (args.includes('--write-report') && args.includes('--self-test'))) { console.error('Usage: node tools/audit-linked-course-next.cjs [--write-report | --self-test]'); process.exitCode = 2; }
else if (args.includes('--self-test')) { try { console.log(JSON.stringify(selfTest(), null, 2)); } catch(e) { console.error(e.stack); process.exitCode=1; } }
else { try { const result=inspect(); if(args.includes('--write-report')) fs.writeFileSync(reportFile, JSON.stringify(result,null,2)+'\n', 'utf8'); console.log(JSON.stringify(result,null,2)); if(result.errors.length) process.exitCode=1; } catch(e) { console.error(e.stack); process.exitCode=1; } }
