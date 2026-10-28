'use strict';

// Read-only inventory of public course assets. Writes JSON to stdout only.
// From the repository root: node tools/audit-year-linked-gap-v113.cjs > report.json
// This does not load learner profiles, service configuration, or credentials.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const snapshotBytes = new Map();
const read = (name) => {
  if (!snapshotBytes.has(name)) snapshotBytes.set(name, fs.readFileSync(path.join(root, name)));
  return snapshotBytes.get(name);
};
const json = (name) => JSON.parse(read(name).toString('utf8').replace(/^\uFEFF/, ''));
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const unique = (items) => [...new Set(items)];
const ascending = (a, b) => a - b;
const curriculum = require(path.join(root, 'assets/curriculum-data.js'));
const dictionary = require(path.join(root, 'assets/essential-vocabulary-data.js'));
const original = require(path.join(root, 'assets/course-data.js'));
const contextPractice = require(path.join(root, 'assets/public-context-practice-data.js'));
const coverage = json('curriculum/coverage.json');
const publicCatalog = json('curriculum/public-supplement-catalog.json');
const publicHistory = json('curriculum/public-target-coverage.json');
const lexicalHistory = json('curriculum/lexical-coverage.json');
const textbookHistory = json('curriculum/textbook-vocabulary-candidate-audit.json');
const textbookCatalog = json('materials/textbook-catalog.json');
const textbookMap = json('materials/textbook-training-map.json');
const draftAudit = json('docs/validation/linked-course-next-draft.json');
const koolearnPath = 'work/koolearn-reference-audit-20261028-v2/report.json';
const koolearnAudit = fs.existsSync(path.join(root, koolearnPath)) ? json(koolearnPath) : null;
const drafts = Array.from({ length: 10 }, (_, i) => json(`curriculum/linked-course-next/day${i + 11}.json`));

const fixedInputs = [
  'tools/audit-year-linked-gap-v113.cjs', 'assets/curriculum-data.js', 'assets/essential-vocabulary-data.js', 'assets/course-data.js',
  'assets/public-context-practice-data.js', 'curriculum/coverage.json',
  'curriculum/public-course-plan.json', 'curriculum/public-supplement-catalog.json',
  'curriculum/public-target-coverage.json', 'curriculum/lexical-coverage.json', 'curriculum/textbook-vocabulary-candidate-audit.json',
  'materials/textbook-catalog.json', 'materials/textbook-training-map.json',
  'docs/validation/linked-course-next-draft.json', ...(koolearnAudit ? [koolearnPath] : []),
  ...drafts.map((unit) => `curriculum/linked-course-next/day${unit.day}.json`),
];
const inputHashes = Object.fromEntries(fixedInputs.map((name) => [name, sha(read(name))]));
const materialById = new Map(curriculum.materials.map((material) => [material.id, material]));
const entryByWord = new Map(dictionary.entries.map((entry) => [norm(entry.word), entry]));
const entryById = new Map(dictionary.entries.map((entry) => [entry.id, entry]));
const coreIdsBySpelling = new Map();
for (const entry of dictionary.entries) {
  for (const spelling of [entry.word, ...(entry.spellingVariants || [])]) {
    const key = norm(spelling);
    if (!coreIdsBySpelling.has(key)) coreIdsBySpelling.set(key, new Set());
    coreIdsBySpelling.get(key).add(entry.id);
  }
}
const possibleCoreForms = (word) => {
  const w = norm(word);
  if (!w.endsWith('ing') || w.length < 5) return [];
  // These are only candidates for review: an -ing spelling can also be a
  // separate noun/adjective sense, so this never declares the item a duplicate.
  return unique([w.slice(0, -3), `${w.slice(0, -3)}e`]).map((base) => entryByWord.get(base)?.id).filter(Boolean);
};
const sourceAuditById = new Map((coverage.publicSupplements?.perSource || []).map((source) => [source.sourceId, source]));
const pubAssignments = curriculum.publicCoursePlan.assignments || [];
const publishedUnits = curriculum.familyLessonRelease.units || [];
const publishedByDay = new Map(publishedUnits.map((unit) => [unit.day, unit]));
const draftByDay = new Map(drafts.map((unit) => [unit.day, unit]));
const legacyGrammarByDay = new Map((curriculum.familyGrammarRelease.units || []).map((unit) => [unit.day, unit]));

// These labels locate teaching materials by title only, not the 101 individual
// IOT entries and not a semantic completeness or difficulty assessment.
const topicRules = [
  ['名词', /名词|noun|可数|不可数|复数|单复数/i],
  ['代词', /代词|pronoun|物主|宾格|人称|whose/i],
  ['动词、时态、语态、语气及短语动词', /动词|时态|语态|语气|被动|主动|祈使|情态|过去式|现在时|将来|完成时|verb|tense|passive|future|present|past/i],
  ['句子成分', /主语|谓语|宾语|定语|状语|主谓|句子成分|sentence structure/i],
  ['形容词', /形容词|比较级|最高级|adjective|comparative|superlative/i],
  ['副词', /副词|频率|adverb/i],
  ['介词', /介词|preposition/i],
  ['连词', /连词|conjunction|因果|连接词/i],
  ['非谓语', /非谓语|不定式|分词|动名词|non.?finite|infinitive|gerund|participle/i],
  ['从句', /从句|条件句|clause|conditional|relative/i],
  ['句子类型', /句型|句子|疑问|问句|否定|祈使|question|imperative|sentence/i],
];
const topicsFor = (title) => topicRules.filter(([, rule]) => rule.test(title || '')).map(([name]) => name);
const hasExplanationAndExercise = (material) => !!String(material?.passage || '').trim() &&
  (material?.questions || []).some((question) => !!String(question.prompt || '').trim() && Array.isArray(question.answers) && question.answers.length > 0);

const grammarCatalog = curriculum.materials.filter((material) => material.skill === 'grammar').map((material) => ({
  materialId: material.id,
  title: material.title,
  level: material.level || null,
  baseDays: curriculum.days.filter((day) => day.tasks.some((task) => task.skill === 'grammar' && (task.materialIds || []).includes(material.id))).map((day) => day.day),
  legacyFamilyDays: (curriculum.familyGrammarRelease.units || []).filter((unit) => unit.materialId === material.id).map((unit) => unit.day),
  publishedLinkedDays: publishedUnits.filter((unit) => unit.tasks.some((task) => task.id === 'grammar' && (task.materialRefs || []).some((ref) => ref.materialId === material.id))).map((unit) => unit.day),
  explanationAndAnswerableExercisePresent: hasExplanationAndExercise(material),
  exerciseItemsInMaterial: (material.questions || []).length,
  sourceContentHash: material.source?.contentHash || null,
  broadTopicTitleMatches: topicsFor(material.title),
}));
const grammarById = new Map(grammarCatalog.map((material) => [material.materialId, material]));
const draftGrammar = drafts.map((unit) => {
  const material = unit.materials.find((candidate) => candidate.skill === 'grammar');
  return { day: unit.day, materialId: material?.id || null, title: material?.title || null,
    explanationAndAnswerableExercisePresent: hasExplanationAndExercise(material),
    exerciseItemsInMaterial: (material?.questions || []).length,
    broadTopicTitleMatches: topicsFor(material?.title), active: false };
});

const articles = original.lessons.map((lesson) => {
  const localVocab = original.vocab.filter((v) => v.day === lesson.day).map((v) => ({
    id: v.id, word: v.word, contextLocatedInArticle: !!v.context && lesson.text.includes(v.context),
  }));
  return { sourceId: `legacy-article-${String(lesson.day).padStart(2, '0')}`, articleIndex: lesson.day,
    title: lesson.title, textSha256: sha(lesson.text), vocabulary: localVocab,
    grammarExamples: (lesson.grammar || []).map((item, i) => ({ index: i, explanation: item.explain, quoteLocatedInArticle: !!item.quote && lesson.text.includes(item.quote) })),
    grammarExercisePresent: !!lesson.grammarQuiz?.q && !!lesson.grammarQuiz?.answers?.length,
    status: 'supplementary-original-article-not-a-365-day-assignment', _text: lesson.text };
});

// Only catalogued public text under materials/public can be opened; recorded
// bytes must still match their catalog hash to be considered as candidates.
const sources = publicCatalog.sources.map((source) => {
  const textPath = source.text?.path || '';
  const pathAllowed = /^materials\/public\/[a-zA-Z0-9._/-]+$/.test(textPath) && !textPath.split('/').includes('..');
  let sourceText = '';
  let observedSha256 = null;
  if (pathAllowed && fs.existsSync(path.join(root, textPath))) {
    const bytes = read(textPath);
    observedSha256 = sha(bytes);
    if (observedSha256 === source.text.sha256) sourceText = bytes.toString('utf8');
    inputHashes[textPath] = observedSha256;
  }
  const audit = sourceAuditById.get(source.sourceId);
  return { sourceId: source.sourceId, title: source.title, provider: source.provider,
    sourceUrl: source.sourceUrl, textPath, sourceTextSha256: source.text?.sha256 || null,
    observedSha256, textVerifiedForCandidateSearch: !!sourceText,
    exposureGroup: audit?.sourceExposureGroup || null,
    catalogStatus: source.status, levelEstimate: source.level || null,
    phaseIds: source.phaseIds || [], prerequisites: source.prerequisiteCapabilityIds || [],
    grammarTags: source.grammarTags || [], rightsStatus: source.rights?.status || null,
    rightsScope: source.rights?.scope || null, readingStatus: audit?.reading || null,
    listeningStatus: audit?.listening || null, canonicalAudio: audit?.canonicalAudio || null,
    plannedAssignments: pubAssignments.filter((a) => a.sourceId === source.sourceId).map((a) => ({ day: a.day, skill: a.skill, assignmentId: a.assignmentId })),
    _text: sourceText };
});

const wordPatternCache = new Map();
function containsHeadword(text, word) {
  const needle = norm(word);
  if (!needle) return false;
  let pattern = wordPatternCache.get(needle);
  if (!pattern) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    pattern = new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i');
    wordPatternCache.set(needle, pattern);
  }
  return pattern.test(text);
}

// One ledger for the authored linked batches; the original base schedule is a
// separate ledger and is never added to the linked targets as learner novelty.
const linkedSeenId = new Map();
const linkedSeenWord = new Map();
const linkedSeenCoreSpelling = new Map();
const linkedUnitInfo = new Map();
for (const unit of [...publishedUnits, ...drafts].sort((a, b) => a.day - b.day)) {
  const duplicateIds = [];
  const duplicateWords = [];
  const unknownCoreIds = [];
  const aliasCollisions = [];
  const knownVariantUses = [];
  const possibleMorphology = [];
  const duplicateKnownSpelling = [];
  for (const target of unit.targets) {
    const word = norm(target.word || target.canonicalWord || entryById.get(target.canonicalId)?.word || target.surface);
    if (linkedSeenId.has(target.canonicalId)) duplicateIds.push({ id: target.canonicalId, earlierDay: linkedSeenId.get(target.canonicalId) });
    else linkedSeenId.set(target.canonicalId, unit.day);
    if (word && linkedSeenWord.has(word)) duplicateWords.push({ word, earlierDay: linkedSeenWord.get(word) });
    else if (word) linkedSeenWord.set(word, unit.day);
    if (!entryById.has(target.canonicalId)) unknownCoreIds.push(target.canonicalId);
    const coreMatches = [...(coreIdsBySpelling.get(word) || [])];
    if (coreMatches.length && !coreMatches.includes(target.canonicalId)) aliasCollisions.push({ targetId: target.canonicalId, word, matchesCoreIds: coreMatches });
    const canonicalEntry = entryById.get(target.canonicalId);
    if (canonicalEntry && norm(canonicalEntry.word) !== word && coreMatches.includes(target.canonicalId)) {
      knownVariantUses.push({ targetId: target.canonicalId, canonicalWord: canonicalEntry.word, surfaceWord: word });
    }
    const stems = possibleCoreForms(word);
    if (stems.length && !entryById.has(target.canonicalId)) possibleMorphology.push({ targetId: target.canonicalId, word, possibleCoreForms: stems, reviewRequired: true });
    for (const coreId of coreMatches) {
      if (linkedSeenCoreSpelling.has(coreId)) duplicateKnownSpelling.push({ targetId: target.canonicalId, matchingCoreId: coreId, earlierDay: linkedSeenCoreSpelling.get(coreId) });
      else linkedSeenCoreSpelling.set(coreId, unit.day);
    }
  }
  linkedUnitInfo.set(unit.day, { status: publishedByDay.has(unit.day) ? 'published-linked-unit' : 'inactive-author-draft-pending-review',
    activeInSource: unit.active, targetCount: unit.targets.length, targetIds: unit.targets.map((target) => target.canonicalId),
    duplicateIdsInThisOrEarlierLinkedUnits: duplicateIds, duplicateNormalizedWordsInThisOrEarlierLinkedUnits: duplicateWords,
    targetsOutsideCore8000ByCanonicalId: unknownCoreIds,
    otherCoreIdsMatchingWordOrKnownVariant: aliasCollisions,
    targetsUsingKnownCoreSpellingVariants: knownVariantUses,
    duplicateByCoreSpellingOrKnownVariantInLinkedUnits: duplicateKnownSpelling,
    possibleInflectionOfCoreHeadwordNeedsSenseReview: possibleMorphology,
    audioStatus: publishedByDay.has(unit.day) ? 'published-release-audio-references' :
      (unit.materials?.some((m) => m.currentAudioCandidate) || unit.targets.some((t) => t.currentAudioCandidate) ? 'synthetic-candidates-referenced-listening-review-pending' : 'no-current-candidate-reference'),
    historicalDraftAudioPendingStatus: unit.audioPending?.status || null,
    currentCandidateReferences: publishedByDay.has(unit.day) ? null : {
      listening: unit.materials.filter((m) => m.skill === 'listening' && m.currentAudioCandidate).length,
      speaking: unit.materials.filter((m) => m.skill === 'speaking' && m.currentAudioCandidate).length,
      wordTargets: unit.targets.filter((t) => t.currentAudioCandidate).length,
      note: '只统计草稿中的候选引用，不在本审计中重验音频或将候选视为听审、发布或学习完成。'
    },
    grammarMaterialId: publishedByDay.has(unit.day) ? unit.tasks.find((t) => t.id === 'grammar')?.materialRefs?.[0]?.materialId || null : unit.materials.find((m) => m.skill === 'grammar')?.id || null,
    inputPath: publishedByDay.has(unit.day) ? 'assets/curriculum-data.js#familyLessonRelease.units' : `curriculum/linked-course-next/day${unit.day}.json` });
}

const baseSeen = new Map();
const allBaseSurfaces = new Set();
const dayRows = curriculum.days.map((day) => {
  const vocabularyTask = day.tasks.find((task) => task.skill === 'vocabulary');
  const grammarTask = day.tasks.find((task) => task.skill === 'grammar');
  const baseWords = [];
  const unmatchedCoreSurfaces = [];
  for (const materialId of vocabularyTask?.materialIds || []) {
    for (const item of materialById.get(materialId)?.vocabulary || []) {
      const surface = norm(item.word);
      if (!surface) continue;
      allBaseSurfaces.add(surface);
      const entry = entryByWord.get(surface);
      if (entry) baseWords.push({ id: entry.id, word: entry.word });
      else unmatchedCoreSurfaces.push({ word: item.word, materialId, possibleCoreIdsByKnownSpelling: [...(coreIdsBySpelling.get(surface) || [])] });
    }
  }
  const distinctBase = [...new Map(baseWords.map((item) => [item.id, item])).values()];
  const firstBaseIds = [];
  const repeatedBaseIds = [];
  for (const item of distinctBase) {
    if (baseSeen.has(item.id)) repeatedBaseIds.push({ id: item.id, firstBaseDay: baseSeen.get(item.id) });
    else { baseSeen.set(item.id, day.day); firstBaseIds.push(item.id); }
  }
  const linked = publishedByDay.get(day.day) || draftByDay.get(day.day);
  const wordsForCandidateSearch = linked ? linked.targets.map((target) => ({ id: target.canonicalId, word: target.word || target.canonicalWord || entryById.get(target.canonicalId)?.word || target.surface })) : distinctBase;
  const dedupedSearchWords = [...new Map(wordsForCandidateSearch.map((item) => [norm(item.word), item])).values()].filter((item) => norm(item.word));
  const articleCandidates = articles.map((article) => {
    const names = new Set(article.vocabulary.filter((item) => item.contextLocatedInArticle).map((item) => norm(item.word)));
    const shared = dedupedSearchWords.filter((item) => norm(item.word).length >= 4 && containsHeadword(article._text, item.word));
    return { sourceId: article.sourceId, articleIndex: article.articleIndex,
      sharedTargetIds: shared.map((item) => item.id),
      inArticleAuthoredVocabulary: shared.filter((item) => names.has(norm(item.word))).map((item) => item.id) };
  }).filter((candidate) => candidate.sharedTargetIds.length >= 3).sort((a, b) => b.inArticleAuthoredVocabulary.length - a.inArticleAuthoredVocabulary.length || b.sharedTargetIds.length - a.sharedTargetIds.length || a.articleIndex - b.articleIndex).slice(0, 5);
  const publicCandidates = sources.filter((source) => source._text).map((source) => {
    const shared = dedupedSearchWords.filter((item) => containsHeadword(source._text, item.word)).map((item) => item.id);
    return { sourceId: source.sourceId, sharedTargetIds: shared, alreadyAssignedToThisDay: source.plannedAssignments.some((a) => a.day === day.day) };
  }).filter((candidate) => candidate.sharedTargetIds.length >= 3).sort((a, b) => Number(b.alreadyAssignedToThisDay) - Number(a.alreadyAssignedToThisDay) || b.sharedTargetIds.length - a.sharedTargetIds.length || a.sourceId.localeCompare(b.sourceId)).slice(0, 5);
  const dayAssignments = pubAssignments.filter((assignment) => assignment.day === day.day);
  const textbook = textbookMap.recommendations.find((item) => item.week === day.week);
  const baseGrammarIds = grammarTask?.materialIds || [];
  return { day: day.day, week: day.week, title: day.title, kind: day.kind || 'ordinary-or-assessment-in-base-plan',
    targetThirtyApplies: day.day >= 2,
    baseVocabulary: { taskPresent: !!vocabularyTask, materialIds: vocabularyTask?.materialIds || [],
      distinctExactCoreHeadwordIds: distinctBase.map((item) => item.id), firstOccurrenceInLiteralBasePlan: firstBaseIds,
      repeatedFromEarlierLiteralBasePlan: repeatedBaseIds,
      nonExactCoreSurfaces: [...new Map(unmatchedCoreSurfaces.map((item) => [norm(item.word), item])).values()] },
    linkedUnit: linkedUnitInfo.get(day.day) || { status: day.day === 1 ? 'outside-day2-365-target' : 'no-published-or-draft-linked-30-target-unit-in-inputs' },
    linkedWordsAlsoInLiteralBasePlanByThisDay: linked ? linked.targets.flatMap((target) => {
      const word = norm(target.word || target.canonicalWord || entryById.get(target.canonicalId)?.word || target.surface);
      return [...(coreIdsBySpelling.get(word) || [])].filter((coreId) => baseSeen.has(coreId)).map((coreId) =>
        ({ targetId: target.canonicalId, matchedCoreId: coreId, firstBaseDay: baseSeen.get(coreId) }));
    }) : [],
    grammar: { baseMaterialIds: baseGrammarIds, baseMaterialsWithExplanationAndExercise: baseGrammarIds.filter((id) => grammarById.get(id)?.explanationAndAnswerableExercisePresent),
      legacyFamilyMaterialId: legacyGrammarByDay.get(day.day)?.materialId || null,
      linkedMaterialId: linkedUnitInfo.get(day.day)?.grammarMaterialId || null },
    publicAssignmentIds: dayAssignments.map((assignment) => assignment.assignmentId),
    originalArticleCandidates: articleCandidates,
    publicTextCandidates: publicCandidates,
    textbookWeekCandidate: textbook ? { week: textbook.week, testId: textbook.testId, role: textbook.role,
      documentId: textbook.documentId, readingPage: textbook.readingPage, writingPage: textbook.writingPage,
      listeningStatus: textbook.listeningStatus, unseenStatus: textbook.unseenStatus } : null };
});

const assignmentRows = pubAssignments.map((assignment) => ({ assignmentId: assignment.assignmentId, day: assignment.day,
  skill: assignment.skill, materialId: assignment.materialId, sourceId: assignment.sourceId,
  sourceTextSha256: assignment.sourceTextSha256, exposureGroup: assignment.exposureGroup,
  levelEligibility: assignment.levelEligibility, prerequisiteCapabilityIds: assignment.prerequisiteCapabilityIds,
  contextWordCandidateCount: assignment.contextLinks?.words?.length || 0,
  contextGrammarTags: unique((assignment.contextLinks?.grammar || []).map((item) => item.tag)),
  contextExecutionStatus: assignment.contextLinks?.executionStatus || null,
  independentAssessmentEligible: assignment.independentAssessmentEligible, exposureClaim: assignment.exposureClaim }));
const exerciseDays = dayRows.filter((day) => day.grammar.baseMaterialsWithExplanationAndExercise.length).map((day) => day.day);
const noVocabulary = dayRows.filter((day) => day.day >= 2 && !day.baseVocabulary.taskPresent).map((day) => day.day);
const exerciseTopics = topicRules.map(([name]) => ({ name,
  publishedMaterialIdsAndDays: grammarCatalog.filter((item) => item.explanationAndAnswerableExercisePresent && item.broadTopicTitleMatches.includes(name))
    .map((item) => ({ materialId: item.materialId, title: item.title, baseDays: item.baseDays, legacyFamilyDays: item.legacyFamilyDays, publishedLinkedDays: item.publishedLinkedDays })),
  inactiveDrafts: draftGrammar.filter((item) => item.explanationAndAnswerableExercisePresent && item.broadTopicTitleMatches.includes(name))
    .map((item) => ({ day: item.day, materialId: item.materialId, title: item.title })) }));
const sourceGroups = [...new Set(assignmentRows.map((item) => `${item.sourceId}|${item.sourceTextSha256}|${item.exposureGroup}`))].map((key) => {
  const [sourceId, sourceTextSha256, exposureGroup] = key.split('|');
  const uses = assignmentRows.filter((item) => item.sourceId === sourceId && item.sourceTextSha256 === sourceTextSha256 && item.exposureGroup === exposureGroup);
  return { sourceId, sourceTextSha256, exposureGroup, uses: uses.map((item) => ({ day: item.day, skill: item.skill, assignmentId: item.assignmentId })) };
});
const storedSources = sources.map(({ _text, ...source }) => source);
const storedArticles = articles.map(({ _text, ...article }) => article);
// These are individually inspected anchors, not an exhaustive topic audit.
const inspectedGrammarAnchors = [
  ['名词', 'w02-read-1-grammar', 'q4', '单数可数名词前a/an'],
  ['代词', 'w01-read-1-grammar', 'q1', 'I、you与be'],
  ['动词、时态、语态、语气及短语动词', 'w09-read-1-grammar', 'q3', '现在进行时'],
  ['句子成分', 'w25-read-1-grammar', 'q2', '分词作名词定语'],
  ['形容词', 'w14-read-1-grammar', 'q3', '形容词比较级'],
  ['副词', 'w09-read-1-grammar', 'q1', '频率副词位置'],
  ['介词', 'w07-read-1-grammar', 'q4', '位置短语next to'],
  ['连词', 'w16-read-1-grammar', 'q2', 'because引出原因'],
  ['非谓语', 'w25-read-1-grammar', 'q2', '过去分词作定语'],
  ['从句', 'w16-read-1-grammar', 'q1', '第一条件句'],
  ['句子类型', 'w04-read-1-grammar', 'q2', 'be一般疑问句'],
].map(([category, materialId, questionId, observedTopic]) => {
  const material = materialById.get(materialId);
  const question = (material?.questions || []).find((item) => item.id === questionId);
  if (!material || !question || !hasExplanationAndExercise(material)) throw new Error(`Missing inspected grammar anchor ${materialId}/${questionId}`);
  return { category, materialId, questionId, observedTopic, baseDays: grammarById.get(materialId).baseDays,
    explanationTextPresent: !!material.passage?.trim(), questionExplanationPresent: !!question.explanation?.trim() };
});
const textbooks = textbookMap.recommendations.map((item) => {
  const document = textbookCatalog.documents.find((candidate) => candidate.id === item.documentId);
  return { ...item, documentPath: document?.path || null, documentSha256: document?.sha256 || null,
    candidateOnly: true, pageNumbersNeedVerification: item.readingPage === null || item.writingPage === null,
    assessmentReservation: item.role === 'reserved-unseen-assessment' };
});

const output = {
  schema: 1,
  purpose: '全年关联课程缺口规划；只读公开资产的静态清点，不读取学习者记录、不声明实际掌握或已验证成绩。',
  reproducibility: { command: 'node tools/audit-year-linked-gap-v113.cjs', output: 'stdout JSON', inputsSha256: inputHashes,
    externalPageScope: '外部页面范围由本轮只读核查提供；本脚本不抓取外网，不缓存页面词表。' },
  referenceScope: {
    vocabulary: { url: 'https://ielts.koolearn.com/20140411/785955.html', title: '雅思7600词汇表(顺序版) 汇总',
      interpretation: '26字母索引页面；不是8000词完整清单或官方7分清单。',
      aggregateAuditPath: koolearnPath,
      aggregateAuditSnapshot: koolearnAudit ? { status: koolearnAudit.status, articlePagesParsed: koolearnAudit.articlePagesParsed,
        paragraphsSeen: koolearnAudit.paragraphsSeen, unparsedParagraphs: koolearnAudit.unparsedParagraphs,
        uniqueParsedHeadwords: koolearnAudit.uniqueParsedHeadwords, exactNormalizedHeadwordsInCatalog: koolearnAudit.exactNormalizedHeadwordsInCatalog,
        parsedHeadwordsNotExactlyInCatalog: koolearnAudit.parsedHeadwordsNotExactlyInCatalog } : null,
      aggregateAuditCaveat: '旧审计仅保留汇总；按源页解析的不同形式和本地精确匹配数不能直接视作缺词或同义词核验。' },
    grammar: { url: 'https://ieltsonlinetests.com/zh-hans/ielts-grammar/18880730.html', title: '雅思101个必备语法',
      broadCategories: topicRules.map(([name]) => name), interpretation: '11个大类用于候选定位；不能将标题命中当成101项均已完整教授。' } },
  capacity: { firstDay: 2, lastDay: 365, days: 364, targetsPerDay: 30, distinctFirstAcquisitionSlots: 10920,
    coreEntryCount: dictionary.entries.length, uniqueCanonicalIds: new Set(dictionary.entries.map((entry) => entry.id)).size,
    uniqueExactNormalizedHeadwords: new Set(dictionary.entries.map((entry) => norm(entry.word))).size,
    coreStages: dictionary.stages, sourceReferences: dictionary.sources.map((source) => ({ id: source.id, revision: source.revision || null, license: source.license || null })),
    examplesAiTwoPass: dictionary.entries.filter((entry) => entry.source?.example?.verification === 'ai-two-pass').length,
    examplesWithoutIndependentHumanReview: dictionary.entries.filter((entry) => entry.source?.example?.independentHumanReview === false).length,
    minimumOutsideCoreIfAllCoreFirstAcquiredOnDays2to365: 10920 - dictionary.entries.length,
    caveat: '2920只是理论下界，前提是核心8000词全部在第2–365天首次学习、所有目标词按词头及变形去重；既有先学核心词越多，所需库外首次词头越多。不得把同词不同大小写、词形或同源题重复计新。词库收录不等于语境授课、学习完成或掌握。',
    withoutDay365: { days: 363, slots: 10890, theoreticalMinimumOutsideCore: 10890 - dictionary.entries.length,
      caveat: '仅用于说明365日复盘冲突的替代算术，并非自动更改用户目标。' },
    currentDay365: '原始365日课表只有年度复盘；需另行设计不破坏复盘与预算的目标安排，不能静默视为已实现。',
    baseDaysWithoutVocabularyTask: noVocabulary,
    baseNoVocabularyCaveat: '上述23个非365日为阶段检查或限时训练日；另有365年度复盘。这些日子没有原课表词汇任务，如何同时满足每日新词需规划。' },
  planningState: {
    coverageFileStatus: coverage.status, declaredDays: coverage.days, materialObjects: coverage.materials,
    compiledMaterialCount: coverage.compiledMaterialCount, caveat: '旧材料集完整状态只反映对应构建口径，不证明365日每课有30个彼此不同的新词或完成语义/语法覆盖。',
    literalBaseVocabulary: { distinctNormalizedSurfaces: allBaseSurfaces.size,
      uniqueExactCoreHeadwords: baseSeen.size, firstExactCoreHeadwordsOnDay1: dayRows[0].baseVocabulary.firstOccurrenceInLiteralBasePlan.length,
      firstExactCoreHeadwordsOnDays2to365: dayRows.slice(1).reduce((sum, day) => sum + day.baseVocabulary.firstOccurrenceInLiteralBasePlan.length, 0),
      nonExactSurfaceFormsMatchingKnownCoreSpellingVariant: [...allBaseSurfaces].filter((word) => !entryByWord.has(word) && coreIdsBySpelling.has(word)).length,
      nonExactSurfaceFormsWithoutKnownVariantMatch: [...allBaseSurfaces].filter((word) => !coreIdsBySpelling.has(word)).length,
      caveat: '只检查原始日课词汇任务的字面词条。其不含8000参考词库动态续学或关联版后续任务，词形、短语、专名、词义和日程覆盖未经语义判定；不得把这些数量相加或当作独立新词及掌握证据。逐日nonExactCoreSurfaces给出原材料坐标与已知拼写变体。' },
    publishedLinkedDays: publishedUnits.map((unit) => unit.day).sort(ascending),
    publishedLinkedTargetSlots: publishedUnits.reduce((sum, unit) => sum + unit.targets.length, 0),
    publishedLinkedDistinctCanonicalIds: new Set(publishedUnits.flatMap((unit) => unit.targets.map((target) => target.canonicalId))).size,
    daysWithoutPublishedLinkedUnit: 364 - publishedUnits.filter((unit) => unit.day >= 2 && unit.day <= 365).length,
    inactiveDraftDays: drafts.map((unit) => unit.day), inactiveDraftTargetSlots: drafts.reduce((sum, unit) => sum + unit.targets.length, 0),
    draftTargetsWithNonCoreCanonicalId: drafts.flatMap((unit) => linkedUnitInfo.get(unit.day).targetsOutsideCore8000ByCanonicalId).length,
    draftTargetCoreSpellingAliases: drafts.flatMap((unit) => linkedUnitInfo.get(unit.day).otherCoreIdsMatchingWordOrKnownVariant.map((item) => ({ day: unit.day, ...item }))),
    draftTargetsUsingCoreSpellingVariants: drafts.flatMap((unit) => linkedUnitInfo.get(unit.day).targetsUsingKnownCoreSpellingVariants.map((item) => ({ day: unit.day, ...item }))),
    draftPotentialInflections: drafts.flatMap((unit) => linkedUnitInfo.get(unit.day).possibleInflectionOfCoreHeadwordNeedsSenseReview.map((item) => ({ day: unit.day, ...item }))),
    daysWithoutEitherPublishedOrDraftLinkedUnit: 364 - unique([...publishedUnits, ...drafts].filter((unit) => unit.day >= 2 && unit.day <= 365).map((unit) => unit.day)).length,
    countingCaveat: '无发布关联单元并不等于原始课完全无词；已发布目标是排课而非个人新词；草稿未启用。旧课表和关联单元为不同视图，不能相加。',
    draftAuditStatus: draftAudit.status, draftAuditReleaseReady: draftAudit.releaseReady, draftAuditChecks: draftAudit.checks,
    draftAuditCaveat: '随文件记录的既有审计快照不自动认证当前原稿；其零告警仅表示已实施规则内未发现问题，不替代逐题语义、音频及词义审核。' },
  grammar: { scope: '原始课表、v89已发布语法、v109关联单元及11–20未启用草稿分层记录。标题规则只用于定位；每题数量只表示同材料内条目数，不计独立新题。',
    materialCount: grammarCatalog.length, materialsWithPassageAndAnswerableExercise: grammarCatalog.filter((item) => item.explanationAndAnswerableExercisePresent).length,
    baseDaysWithPassageAndAnswerableExercise: exerciseDays.length,
    baseDaysWithoutGrammarTask: dayRows.filter((day) => !day.grammar.baseMaterialIds.length).map((day) => day.day),
    titleMatchingRules: topicRules.map(([name, rule]) => ({ name, regex: rule.source })), inspectedGrammarAnchors, topicIndex: exerciseTopics,
    materials: grammarCatalog, inactiveDraftMaterials: draftGrammar,
    contextualPublicPracticePacks: { packCount: (contextPractice.packs || []).length, status: contextPractice.scope,
      caveat: '独立练习包及素材语法标签均不可自动合并成每日新题或完整101项覆盖。' } },
  historicLexicalSnapshots: {
    legacySchedule: { source: 'curriculum/lexical-coverage.json', scheduledLexemes: lexicalHistory.scheduledLexemes,
      scheduledVocabularyDays: lexicalHistory.scheduledVocabularyDays, uncoveredCount: lexicalHistory.uncoveredCount,
      caveat: 'uncoveredCount=0只针对当时的训练词条分配口径，不是8000词或全年30新词覆盖；原始词面中可能包含词形、短语和专名。' },
    publicTarget: { generatedAt: publicHistory.generatedAt, baseline: publicHistory.baseline,
      publicHeadwordCandidates: publicHistory.publicHeadwordCandidates, additionalOrthographicCandidates: publicHistory.additionalOrthographicCandidates,
      combinedOrthographicCandidates: publicHistory.combinedOrthographicCandidates, remainingOrthographicGaps: publicHistory.remainingOrthographicGaps,
      source: 'curriculum/public-target-coverage.json', caveat: '历史输入快照与当前关联批次不同步；是字面及明确词形匹配，非新词、词义或学习完成证明。' },
    cambridge17: { generatedAt: textbookHistory.generatedAt, sourceDocument: textbookHistory.source, documentId: textbookHistory.documentId,
      summary: textbookHistory.summary, candidateUnionWithLegacyAndScheduled: textbookHistory.candidateUnionWithLegacyAndScheduled,
      passageReferences: textbookHistory.items.map((item) => ({ id: item.id, documentId: item.documentId, pages: item.pages, exactExtractedBodySha256: item.exactExtractedBodySha256, senseReview: item.senseReview })),
      source: 'curriculum/textbook-vocabulary-candidate-audit.json', caveat: '候选来自相同旧基线，不能与公开素材增量相加；未完成词义审核、未发布，预留卷与个人曝光须另保护。' } },
  sources: {
    originalArticles: { count: articles.length, vocabularyItems: original.vocab.length, articleIndexNotCalendarDay: true,
      caveat: '保留原52篇补充材料；词与文章的共享仅是候选，须复核同词义、难度、来源和已见情况；原文题不能作为陌生新题。', entries: storedArticles },
    publicCatalog: { sourceCount: storedSources.length, entries: storedSources,
      caveat: '级别是未标定估计；同sourceId、原文哈希和exposureGroup的多次使用只是一份来源。听力仅依覆盖文件中的实际状态，候选匹配不表示可安排或已学。' },
    publicAssignments: { assignmentCount: assignmentRows.length, days: unique(assignmentRows.map((item) => item.day)).sort(ascending),
      distinctSourceIds: new Set(assignmentRows.map((item) => item.sourceId)).size,
      distinctSourceTextHashes: new Set(assignmentRows.map((item) => item.sourceTextSha256)).size,
      assignments: assignmentRows, sourceGroups,
      caveat: '计划中的读听可共享同源及题目，不得把读听或重复安排计成独立新题；词义候选需逐句核实，先修、级别和实际曝光需另验。' },
    textbooks: { documents: textbookCatalog.summary, recommendations: textbooks,
      caveat: '第21–36周readingPage/writingPage若为null不可把试卷起始页当阅读写作页；第49–52周剑19保留陌生测评；来源曝光和使用权须核对；无真实音频，不作完整听力或四科模考。' } },
  workItems: [
    { priority: 1, action: '完成11–20草稿的词义、IPA、逐题、听力与词音频审核；与4–10及既有课程和实际学过的词跨批去重，先前草稿不能直接视为已交付。', dayRange: '11–20' },
    { priority: 2, action: '补齐2–3及21–365的关联单元设计；原课表已有内容可作候选，不把已见词或同源题算新。第365日保留年度复盘。', days: [2, 3], dayRange: '21–365' },
    { priority: 3, action: '针对23个阶段检查/限时训练日和365年度复盘日单独设计符合360分钟总预算的新词与复习衔接，保持测评材料未见条件。', days: noVocabulary },
    { priority: 4, action: '建立经过真实词义、词形、发音及授权核验的库外候选；至少2920个仅为数学下界，不把表格词头或原文出现视作已教或已掌握。' },
    { priority: 5, action: '据IOT参考逐项建立101条人工可复核的主题—讲解—练习—材料—课日索引；本报告仅提供11类标题定位及11个已检查示例。' },
    { priority: 6, action: '基于同义项、难度、先修、音频、来源权利和实际曝光审核原52篇、公开素材及剑桥映射；剑19预留陌生卷、无音频的剑桥听力不得安排为完整模考。' },
    { priority: 7, action: '课程后续批次采用新来源及绑定且保留旧release和已开始课、历史原稿；实际新词按学习者已学记录去重，复习队列和每日剩余预算单独处理。' }
  ],
  dayCandidateMethod: {
    searchTarget: '第4–10天按已发布关联目标；第11–20天按未启用草稿目标；其余按原始课表词汇材料中与8000库完全同词头的候选。缺词汇任务则不检索。',
    baseLedger: 'firstOccurrenceInLiteralBasePlan仅表示该规范词头在静态原始计划中首次出现，不是学习者首次学习；linkedWordsAlsoInLiteralBasePlanByThisDay是与原课表及已知拼写变体的潜在重合，原课表和关联版是不同视图，不证明已学习。其他词形、义项和已学记录须另核实。',
    article: '原52篇正文中与当天候选词头精确重合至少3个（词头长度至少4），优先列已定位原句的原词表重合项；最多列5篇。词面命中须核义。',
    public: '仅对源文件SHA与目录一致的46篇文本检索精确词头，至少重合3个；优先列本日已安排材料，最多5篇。',
    caution: '这些结果仅作选材线索，常见词重合可能无教学关联；未做义项、词形族、难度、完整题质、听力与曝光验证，不能产生新增词或独立题。已开始/冻结课程和原绑定必须保留。' },
  days: dayRows,
};
// Reject a moving input snapshot rather than silently mixing authoring versions.
for (const [name, expected] of Object.entries(inputHashes)) {
  if (sha(fs.readFileSync(path.join(root, name))) !== expected) throw new Error(`Input changed during audit: ${name}`);
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
