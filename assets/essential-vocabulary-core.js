(function (root, factory) {
  'use strict';
  const memory = root.IELTSMemory || (typeof require === 'function' ? require('./memory-core.js') : null);
  const fsrs = root.FSRS || (typeof require === 'function' ? require('./vendor/ts-fsrs.js') : null);
  const api = factory(root, memory, fsrs);
  root.IELTSEssentialVocabulary = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, M, F) {
  'use strict';
  const TARGET = 8000, DAY = 86400000, RETRY_MINUTES = 10, START_COURSE_DAY = 2, DAILY_NEW = 40;
  const COST = {recognition: .3, spelling: .45, listening: .6, production: 1.5};
  const clone = value => JSON.parse(JSON.stringify(value));
  const norm = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const stamp = value => Number.isFinite(Date.parse(value));
  const iso = value => new Date(value).toISOString();
  function dateKey(value = Date.now()) {
    const d = new Date(value);
    if (!Number.isFinite(+d)) throw Error('词汇安排日期无效。');
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function calendarDays(start, end) {
    return Math.max(0, Math.floor((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / DAY));
  }
  function dataFor(options = {}) {
    const data = options.data || root.IELTS_ESSENTIAL_VOCABULARY;
    const source = options.entries || (Array.isArray(data) ? data : data?.entries);
    if (!Array.isArray(source) || !source.length) throw Error('8000必学词库尚未加载，已有记录保留。');
    const seen = new Set(), entries = [];
    for (const word of source) {
      const key = norm(word?.word);
      // One headword is one target. Phrases and spelling variants are not silently
      // expanded into additional learned words.
      if (!/^[a-z]+(?:['-][a-z]+)*$/.test(key) || seen.has(key)) continue;
      seen.add(key);
      entries.push({...word, word: String(word.word).trim(), id: word.id || 'essential:' + key});
    }
    entries.sort((a, b) => (Number(a.rank) || TARGET + 1) - (Number(b.rank) || TARGET + 1) || norm(a.word).localeCompare(norm(b.word)));
    return entries;
  }
  function wordSnapshot(word) {
    if (!word || !/^[a-z]+(?:['-][a-z]+)*$/.test(norm(word.word)) || typeof word.meaning !== 'string' || !word.meaning.trim()) throw Error('新词缺少有效词形或中文义。');
    return {word: String(word.word).trim(), meaning: word.meaning.slice(0, 500), ipa: String(word.ipa || '').slice(0, 200), example: String(word.example || word.context || '').slice(0, 2000), audio: typeof word.audio === 'string' ? word.audio.slice(0, 500) : ''};
  }
  function grouped(state) {
    const words = new Map();
    for (const item of Object.values(state.items)) {
      const key = norm(item.word);
      if (!words.has(key)) words.set(key, {items: [], history: [], firstAt: null});
      const group = words.get(key); group.items.push(item);
      for (const h of item.history) {
        group.history.push({...h, skill: item.skill});
        if (!group.firstAt || h.at < group.firstAt) group.firstAt = h.at;
      }
    }
    for (const group of words.values()) group.history.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    return words;
  }
  function acquisition(state, records, entries) {
    const out = new Map();
    // Older course submissions did not carry the new index. Read their original
    // artifacts without rewriting an old draft, score, or record ID.
    const V = root.IELTSVocabularyPractice || (typeof require === 'function' ? require('./vocabulary-practice.js') : null);
    if (!V?.verifyTrainingArtifact) return out;
    const wanted = new Set(entries.map(word => norm(word.word)));
    for (const record of records || []) {
      if (!record || record.kind !== undefined && record.kind !== 'original' || record.skill !== 'vocabulary' || !stamp(record.submittedAt)) continue;
      let a; try { a = typeof record.answer === 'string' ? JSON.parse(record.answer) : record.answer; } catch (_) { continue; }
      if (!Array.isArray(a?.words) || !a.words.some(word => wanted.has(norm(word.word)))) continue;
      const proof = V.verifyTrainingArtifact(a, {vocabulary: a.words});
      if (!proof.valid) continue;
      for (const word of a.words) {
        const key = norm(word.word), prior = out.get(key);
        if (wanted.has(key) && (!prior || record.submittedAt < prior.at)) out.set(key, {recordId: record.id, at: record.submittedAt, trainingVersion: 2});
      }
    }
    return out;
  }
  function delayedEvidence(state, records, now) {
    const P = root.IELTSPersonalization || (typeof require === 'function' ? require('./personalization-core.js') : null);
    const events = P?.collect ? P.collect(state, records || [], now).events : [];
    const byCard = new Map();
    for (const event of events) {
      if (!byCard.has(event.card)) byCard.set(event.card, []);
      byCard.get(event.card).push(event);
    }
    const verified = new Set(), reviewed = new Set();
    for (const [id, history] of byCard) {
      const item = state.items[id], recent = history.slice(-2), last = history.at(-1);
      if (last?.correct) reviewed.add(id);
      const laterError = item.history.some(h => h.correct === false && Date.parse(h.at) > (last?.at || 0));
      if (recent.length === 2 && recent.every(h => h.correct) && recent[1].at - recent[0].at >= 2 * DAY && !laterError) verified.add(id);
    }
    return {verified, reviewed, events};
  }
  function queueFor(state, groups, now, entries, proof, options) {
    const base = M.reviewQueueFromParsed ? M.reviewQueueFromParsed(state, new Date(now)) : M.reviewQueue(state, new Date(now)), retries = [], futureRetries = [];
    const recallEvents = new Map();for(const event of proof.events){if(!recallEvents.has(event.word))recallEvents.set(event.word,[]);recallEvents.get(event.word).push(event);}
    const meanings = new Set(Object.values(state.items).map(item => item.meaning).filter(value => typeof value === 'string' && value.trim()));
    const explicitReady = options.recognitionReadyWordKeys === undefined ? null : new Set([...options.recognitionReadyWordKeys].map(norm));
    function available(item) {
      if (item.skill !== 'recognition') return item;
      const ready = typeof options.recognitionReady === 'function' ? options.recognitionReady(item.word, item) : explicitReady ? explicitReady.has(norm(item.word)) : Boolean(item.meaning && meanings.size >= 2);
      if (ready) return item;
      const history = recallEvents.get(norm(item.word)) || [], skills = ['spelling','listening'];
      skills.sort((a, b) => history.filter(event => event.skill === a).length - history.filter(event => event.skill === b).length || (history.filter(event => event.skill === a).at(-1)?.at || 0) - (history.filter(event => event.skill === b).at(-1)?.at || 0));
      const skill = skills[0], stored = state.items[M.idFor(item.word, skill)];
      return {...item, ...(stored || {card: null, history: []}), skill, reviewKind: item.reviewKind, ...(item.wordDue ? {wordDue: item.wordDue} : {}), ...(item.retryAt ? {retryAt: item.retryAt} : {}), reviewFallback: 'recognition-options-unavailable'};
    }

    const startCourseDay = Number.isInteger(options.startCourseDay) ? Math.max(2, options.startCourseDay) : START_COURSE_DAY;
    if (Number.isInteger(options.courseDay) && options.courseDay < startCourseDay) {
      const seen = new Set(), allDue = [];
      for (const item of base.due) if (!seen.has(norm(item.word))) { seen.add(norm(item.word)); allDue.push(available({...item, reviewKind: 'due'})); }
      return {...base, allDue, futureRetries};
    }
    for (const group of groups.values()) {
      for (const item of group.items) {
        const last = item.history.at(-1);
        if (!last || last.correct || dateKey(last.at) !== dateKey(now)) continue;
        const retryAt = Date.parse(last.at) + RETRY_MINUTES * 60000, retry = {...item, reviewKind: 'retry', retryAt: iso(retryAt)};
        (retryAt <= now ? retries : futureRetries).push(retry);
      }
    }
    retries.sort((a, b) => a.retryAt.localeCompare(b.retryAt) || M.idFor(a.word, a.skill).localeCompare(M.idFor(b.word, b.skill)));
    const catalog = new Map(entries.map(word => [norm(word.word), word])), events = new Map(), episodes = new Map(base.episodes.map(value => [value.word, value]));
    for (const event of proof.events) { if (!events.has(event.word)) events.set(event.word, []); events.get(event.word).push(event); }
    const production = new Set((options.productionWords || []).map(word => norm(typeof word === 'string' ? word : word?.word))), wordDue = [];
    const scheduler = F.fsrs({request_retention: state.retention, enable_fuzz: false, enable_short_term: false, maximum_interval: 180});
    for (const [key, group] of groups) {
      const word = catalog.get(key); if (!word || !group.history.length) continue;
      const history = events.get(key) || [], latest = group.history.at(-1), latestAt = Date.parse(latest.at);
      let card = null;
      // This read-only word cadence makes one due encounter, not four parallel
      // mandatory reviews. Original per-skill cards/due dates remain untouched.
      // It is a workload heuristic; separate skill evidence still decides what
      // has actually been verified and the personal fitter remains per skill.
      for (const event of history) card = scheduler.next(card || F.createEmptyCard(), new Date(event.at), event.correct ? F.Rating.Good : F.Rating.Again).card;
      const dueAt = Math.max(card ? +card.due : latestAt + DAY, latestAt + DAY);
      if (dueAt > now) continue;
      const core = ['recognition','spelling','listening'], counts = new Map(M.SKILLS.map(skill => [skill, history.filter(event => event.skill === skill)]));
      const unresolved = group.items.filter(item => { const lastWrong = item.history.filter(event => event.correct === false).at(-1), lastCorrect = counts.get(item.skill).filter(event => event.correct).at(-1); return lastWrong && (!lastCorrect || Date.parse(lastWrong.at) > lastCorrect.at); }).sort((a, b) => (Date.parse(a.history.filter(event => !event.correct).at(-1).at)) - (Date.parse(b.history.filter(event => !event.correct).at(-1).at)));
      const sample = Number(word.rank) % 20 === 0, episode = episodes.get(key);
      let skill;
      if (unresolved.length) skill = unresolved[0].skill;
      else if (sample && episode && history.at(-1)?.id === latest.id) skill = episode.skill;
      else if ((sample || production.has(key)) && core.every(value => counts.get(value).length) && (!counts.get('production').length || now - counts.get('production').at(-1).at >= 30 * DAY)) skill = 'production';
      else skill = core.slice().sort((a, b) => counts.get(a).length - counts.get(b).length || (counts.get(a).at(-1)?.at || 0) - (counts.get(b).at(-1)?.at || 0) || core.indexOf(a) - core.indexOf(b))[0];
      const item = group.items.find(value => value.skill === skill) || {...wordSnapshot(word), skill, materialId: '', card: null, history: []};
      wordDue.push({...item, reviewKind: 'due', wordDue: iso(dueAt), cadence: 'rotating-word', productionSample: sample});
    }
    const legacyDue = base.due.filter(item => !catalog.has(norm(item.word))).map(item => ({...item, reviewKind: 'due'}));
    const byDue = (a, b) => Date.parse(a.wordDue || a.card?.due || '1970-01-01T00:00:00Z') - Date.parse(b.wordDue || b.card?.due || '1970-01-01T00:00:00Z') || M.SKILLS.indexOf(a.skill) - M.SKILLS.indexOf(b.skill) || norm(a.word).localeCompare(norm(b.word));
    const seen = new Set(), allDue = [];
    for (const item of [...retries, ...wordDue.concat(legacyDue).sort(byDue)]) {
      const key = norm(item.word);
      if (!seen.has(key)) { seen.add(key); allDue.push(available(item)); }
    }
    return {...base, allDue, futureRetries};
  }
  function activityDrafts(memory) {
    const state = M.parseState(memory);
    let retentionDrafts=[];if(state.reviewedRetention!==undefined){const api=root.IELTSLexicalRetentionV88||(typeof require==='function'?require('./lexical-retention-v88.js'):null);if(!api?.activityDrafts)throw Error('新语境保持活动组件未加载，预算核验暂停，原输入保留。');retentionDrafts=api.activityDrafts(state);}
    return [...Object.values(state.essential.batches).filter(batch => batch.draft || batch.status === 'learning').map(batch => ({id: batch.draft?.id || batch.id, materialId: batch.materialId, courseDay: batch.courseDay, taskId: 'vocabulary', skill: 'vocabulary', startedAt: batch.draft?.startedAt || batch.startedAt, activeSeconds: batch.activeSeconds, activityByDate: {...batch.activityByDate}})),...retentionDrafts];
  }
  function vocabularyBudget(state, records, today, options, acquired) {
    const P = root.IELTSYearPlanner || (typeof require === 'function' ? require('./year-planner.js') : null);
    const works = (records || []).filter(record => record.skill === 'vocabulary'), ids = new Set(works.map(record => record.id)), seen = new Set();
    const batches = activityDrafts(state);
    const drafts = [...Object.values(state.drafts), ...batches, ...(options.vocabularyDrafts || [])];
    let seconds = 0;
    for (const record of [...works, ...drafts.filter(value => !ids.has(value.id))]) {
      if (seen.has(record.id)) continue; seen.add(record.id);
      const ledger = P?.activityByDate?.(record, !ids.has(record.id));
      seconds += ledger?.[today] || 0;
    }
    const budgetMinutes = Number.isFinite(options.vocabularyMinutes) ? Math.min(180, Math.max(15, options.vocabularyMinutes)) : 120;
    const sourceIds = new Set([...acquired.values()].map(value => value.recordId)), samples = works.filter(record => sourceIds.has(record.id) && record.quantity > 0 && record.activeSeconds > 0).slice(-30).map(record => record.activeSeconds / record.quantity / 60).sort((a, b) => a - b);
    const newWordMinutes = Number.isFinite(options.newWordMinutes) ? Math.min(10, Math.max(.5, options.newWordMinutes)) : samples.length >= 3 ? Math.min(10, Math.max(.75, samples[Math.floor((samples.length - 1) * .75)] * 1.2)) : 2;
    return {budgetMinutes, spentMinutes: seconds / 60, remainingMinutes: Math.max(0, budgetMinutes - seconds / 60), newWordMinutes, estimateSamples: samples.length};
  }
  function plan(memory, options = {}) {
    const state = M.parseState(memory), entries = dataFor(options), now = +(new Date(options.now ?? Date.now()));
    if (!Number.isFinite(now)) throw Error('词汇安排日期无效。');
    const today = dateKey(now), groups = grouped(state), acquired = acquisition(state, options.records || [], entries), knownKeys = new Set(entries.map(word => norm(word.word)));
    const activeBatches = Object.values(state.essential.batches).filter(batch => batch.status === 'learning' || batch.draft).sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id));
    const started = new Map();
    for (const [key, group] of groups) if (knownKeys.has(key) && group.firstAt && Date.parse(group.firstAt) <= now) started.set(key, group.firstAt);
    for (const [key, proof] of acquired) if (knownKeys.has(key) && Date.parse(proof.at) <= now && (!started.has(key) || proof.at < started.get(key))) started.set(key, proof.at);
    for (const batch of Object.values(state.essential.batches)) for (const key of batch.wordKeys) if (knownKeys.has(key) && Date.parse(batch.startedAt) <= now && (!started.has(key) || batch.startedAt < started.get(key))) started.set(key, batch.startedAt);
    const proof = delayedEvidence(state, options.records || [], now), queue = queueFor(state, groups, now, entries, proof, options);
    const introducedToday = [...started.values()].filter(at => dateKey(at) === today).length;
    const startedTodayKeys = new Set([...started].filter(([, at]) => dateKey(at) === today).map(([key]) => key));
    for (const batch of Object.values(state.essential.batches)) if (dateKey(batch.startedAt) === today) for (const key of batch.wordKeys) if (knownKeys.has(key) && (!started.has(key) || dateKey(started.get(key)) === today)) startedTodayKeys.add(key);
    const startedToday = startedTodayKeys.size;
    const reviewedToday = [...groups.values()].flatMap(group => group.history).filter(h => h.evidenceVersion === 1 && dateKey(h.at) === today && Date.parse(h.at) <= now);
    const completedToday = [...acquired].filter(([key, value]) => knownKeys.has(key) && dateKey(value.at) === today && Date.parse(value.at) <= now).length;
    const vocabulary = vocabularyBudget(state, options.records || [], today, options, acquired), globalRemainingMinutes = Math.min(360, Math.max(0, Number.isFinite(options.remainingMinutes) ? options.remainingMinutes : 90));
    const remainingMinutes = Math.min(globalRemainingMinutes, vocabulary.remainingMinutes);
    const startCourseDay = Number.isInteger(options.startCourseDay) ? Math.min(365, Math.max(2, options.startCourseDay)) : START_COURSE_DAY;
    const courseDay = Number.isInteger(options.courseDay) ? options.courseDay : START_COURSE_DAY, eligibleDay = courseDay >= startCourseDay;
    const completedBeforeToday = [...acquired].filter(([key, value]) => knownKeys.has(key) && Date.parse(value.at) <= now && dateKey(value.at) < today).length;
    const dailyTarget = eligibleDay ? Math.min(DAILY_NEW, Math.max(0, entries.length - completedBeforeToday)) : 0;
    const annualDays = 366 - startCourseDay, baseline = DAILY_NEW;
    // Required work is independent of a display batch, a daily count and the
    // new-word reference allowance. A finite session uses the shared calendar
    // budget, including the currently configured Pomodoro rest, without hiding
    // the remainder or writing any completion into Memory.
    const due = queue.allDue.slice(), unfinishedReviewDrafts = Object.values(state.drafts || {});
    const waitingRetryKeys = new Set(queue.futureRetries.map(item => norm(item.word)));
    const debtKeys = new Set([...due.map(item => norm(item.word)), ...waitingRetryKeys, ...unfinishedReviewDrafts.map(item => norm(item.word))]);
    const reviewDebt = {required: debtKeys.size > 0, requiredWords: debtKeys.size, due: due.length, waitingRetries: waitingRetryKeys.size, unfinishedDrafts: unfinishedReviewDrafts.length, heldCards: queue.held.length};
    const timer = options.timerCore || root.IELTSStudyTimerCore || (typeof require === 'function' ? require('./study-timer-core.js') : null), timerState = options.timerState === undefined ? root.IELTSStudyTimer?.snapshot?.() : options.timerState;
    let timerProblem = timerState === null ? '番茄钟状态尚未读取，原任务保留。' : null;
    const forecast = minutes => { if(timerProblem)return Infinity;try{const value=timer?.forecast ? timer.forecast(minutes,timerState).totalMinutes : minutes;if(!Number.isFinite(value)||value<0)throw Error('番茄钟预算尚未核验。');return value;}catch(error){timerProblem=error.message;return Infinity;} };
    forecast(0);
    let reviewMinutes = 0, sessionMinutes = 0, sessionCount = 0, sessionFull = false;
    for (const item of due) { const cost = COST[item.skill]; reviewMinutes += cost; if (!sessionFull && forecast(sessionMinutes + cost) <= globalRemainingMinutes + .0001) { sessionMinutes += cost; sessionCount++; } else sessionFull = true; }
    const nextUnitStudyMinutes = due.length ? COST[due[0].skill] : unfinishedReviewDrafts.length ? COST[unfinishedReviewDrafts[0].skill] : 0;
    const canStartNext = nextUnitStudyMinutes > 0 && forecast(nextUnitStudyMinutes) <= globalRemainingMinutes + .0001;
    const reservedKeys = new Set(activeBatches.flatMap(batch => batch.wordKeys));
    const courseWordKeys = new Set((options.courseWords || []).map(word => norm(typeof word === 'string' ? word : word?.word)).filter(key => knownKeys.has(key)));
    const courseKeys = new Set([...courseWordKeys].filter(key => !acquired.has(key) && !reservedKeys.has(key) && !started.has(key)));
    const catalog = new Map(entries.map(word => [norm(word.word), word])), contextual = new Map();
    // An example from a currently selected material is the candidate's context.
    // A global dictionary rank is not a reason to add a compulsory new task.
    for (const word of options.contextWords || []) {
      const key = norm(word?.word), example = word?.example || word?.context;
      if (!catalog.has(key) || typeof example !== 'string' || !example.trim()) continue;
      contextual.set(key, {...catalog.get(key), ...word, word: catalog.get(key).word, example: example.trim()});
    }
    const pendingKeys = new Set((options.pendingWords || []).map(word => norm(typeof word === 'string' ? word : word?.word)));
    const startDate = state.essential.startDate || options.startDate || today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(Date.parse(startDate + 'T00:00:00Z'))) throw Error('词汇年度起始日期无效。');
    const elapsedDays = calendarDays(startDate, today);
    const pace = dailyTarget;
    const recent = proof.events.filter(h => h.at >= now - 14 * DAY).slice(-120);
    const accuracy = recent.length >= 8 ? recent.filter(h => h.correct).length / recent.length : null;
    const reasons = [];
    if (accuracy !== null && accuracy < .85) reasons.push('近期回忆仍需巩固；保留每日40个真正新词的目标，先完成必做复习与订正');
    if (reviewDebt.required) reasons.push('必做复习、错词间隔或未提交原稿尚未处理完，保留全部积压，先复习后新词');
    const newWordMinutes = vocabulary.newWordMinutes;
    const adaptiveReference = pace;
    const contextNewCount = [...contextual.keys()].filter(key => !acquired.has(key) && !reservedKeys.has(key) && !courseWordKeys.has(key) && !pendingKeys.has(key) && !started.has(key)).length;
    const target = Math.min(adaptiveReference, startedToday + courseKeys.size + contextNewCount), dailyRemaining = Math.max(0, adaptiveReference - startedToday - courseKeys.size);
    const reservedVocabularyMinutes = Math.max(0, Number(options.reservedVocabularyMinutes) || 0);
    const sharedStudyHeadroomMinutes = Number.isFinite(options.sharedStudyHeadroomMinutes) ? Math.max(0, options.sharedStudyHeadroomMinutes - reviewMinutes) : Infinity;
    const budgetRemaining = Math.min(Math.max(0, remainingMinutes - reviewMinutes - reservedVocabularyMinutes), sharedStudyHeadroomMinutes), budgetCapacity = Math.floor(budgetRemaining / newWordMinutes);
    let count = Math.min(dailyRemaining, budgetCapacity);
    if (!eligibleDay) { count = 0; reasons.push('8000词新增训练从第' + startCourseDay + '课开始，第1课原有词汇与进度保留'); }
    if (activeBatches.length) { count = 0; reasons.push('继续已开始的新词组，保留原始输入'); }
    if (reviewDebt.required) count = 0;
    if (timerProblem) { count = 0; reasons.push(timerProblem); }
    if (budgetCapacity < dailyRemaining) reasons.push('按真实剩余预算保留复习与完整新词训练时间');
    if (vocabulary.remainingMinutes <= 0) reasons.push('新词参考份额已用完；到期复习仍为必做，按今日共享总预算逐题继续，超时保留积压');
    if (courseKeys.size) reasons.push('本课 ' + courseKeys.size + ' 个必学新词复用课程训练，不另做一遍');
    const eligible = [...contextual.values()].filter(word => !acquired.has(norm(word.word)) && !reservedKeys.has(norm(word.word)) && !courseWordKeys.has(norm(word.word)) && !pendingKeys.has(norm(word.word)));
    // A legacy exposure is preserved as exposure. A missing v2 initial artifact
    // still needs its real training, rather than being silently called learned.
    eligible.sort((a, b) => Number(started.has(norm(b.word))) - Number(started.has(norm(a.word))));
    const newWords = eligible.filter(word=>word.heldForVerification!==true).slice(0, count).map(word => ({...word, learningKind: started.has(norm(word.word)) ? 'complete-initial' : 'new'}));
    if (!contextual.size) reasons.push('新增词随本课听读说写语境选择；没有明确语境候选时不从词库排名补齐');
    const acquiredKeys = new Set([...acquired.keys()].filter(key => knownKeys.has(key) && Date.parse(acquired.get(key).at) <= now));
    const dueKeys = new Set(queue.allDue.map(word => norm(word.word)).filter(key => knownKeys.has(key)));
    const verifiedBySkill = {}, verifiedWords = [], delayedWords = [];
    for (const skill of M.SKILLS) verifiedBySkill[skill] = entries.filter(word => proof.verified.has(M.idFor(word.word, skill))).length;
    for (const word of entries) {
      if (M.SKILLS.every(skill => proof.verified.has(M.idFor(word.word, skill)))) verifiedWords.push(norm(word.word));
      if (M.SKILLS.some(skill => proof.reviewed.has(M.idFor(word.word, skill)))) delayedWords.push(norm(word.word));
    }
    const stats = {target: TARGET, total: entries.length, started: started.size, notStarted: Math.max(0, entries.length - started.size), initialCompleted: acquiredKeys.size, needLearning: Math.max(0, entries.length - acquiredKeys.size), pendingLearning: [...started.keys()].filter(key => !acquiredKeys.has(key)).length, dueWords: dueKeys.size, dueCards: queue.due.filter(item => knownKeys.has(norm(item.word))).length, retryWords: queue.allDue.filter(item => item.reviewKind === 'retry' && knownKeys.has(norm(item.word))).length, delayedRecallWords: delayedWords.length, delayedVerifiedWords: verifiedWords.length, verifiedBySkill, legacyStarted: [...started.keys()].filter(key => !acquiredKeys.has(key)).length, startDate, startCourseDay, annualDays, elapsedDays, expectedIntroduced: eligibleDay ? Math.min(entries.length, (elapsedDays + 1) * DAILY_NEW) : 0, recentAccuracy: accuracy, evidenceNote: '初学提交、到期复习和延迟已验证分别统计；全词验证需要四项技能各自两次有原稿关联的无辅助延迟正确回忆，间隔至少48小时。到期后仍需复习，后续明确错误会撤回相应验证。'};
    const displayWords = new Map();
    for (const word of options.courseWords || []) {
      const key = norm(typeof word === 'string' ? word : word?.word);
      if (catalog.has(key)) displayWords.set(key, {...catalog.get(key), ...(typeof word === 'object' ? word : {}), sourceKind: 'course'});
    }
    for (const word of newWords) { const key = norm(word.word); if (!displayWords.has(key)) displayWords.set(key, {...word, sourceKind: 'context'}); }
    const batchesByWord = new Map();
    for (const batch of Object.values(state.essential.batches)) for (let n = 0; n < batch.wordKeys.length; n++) {
      const key = batch.wordKeys[n], prior = batchesByWord.get(key);
      if (!prior || batch.startedAt > prior.startedAt) batchesByWord.set(key, batch);
      if (dateKey(batch.startedAt) === today && !displayWords.has(key) && catalog.has(key)) displayWords.set(key, {...catalog.get(key), ...batch.words[n], sourceKind: 'essential'});
    }
    const todayNewWords = [...displayWords].filter(([key]) => !started.has(key) || dateKey(started.get(key)) === today).map(([key, word]) => {
      const proof = acquired.get(key), batch = batchesByWord.get(key), status = proof ? 'submitted' : batch || pendingKeys.has(key) ? 'started' : 'not-started';
      return {...word, state: status, status, learningKind: 'new', ...(batch ? {batchId: batch.id} : {}), ...(proof ? {recordId: proof.recordId, submittedAt: proof.at} : {})};
    });
    const carryKeys = new Map();
    for (const batch of activeBatches) if (dateKey(batch.startedAt) < today) for (let n = 0; n < batch.wordKeys.length; n++) {
      const key = batch.wordKeys[n]; if (!acquired.has(key)) carryKeys.set(key, {...catalog.get(key), ...batch.words[n], batchId: batch.id, state: 'started', status: 'started', learningKind: 'carry'});
    }
    return {date: today, stats, quota: {baseline, dailyTarget, goalRemaining: Math.max(0, dailyTarget - completedToday), target, adaptiveReference, eligible: eligibleDay, startCourseDay, annualDays, startedToday, completedToday, completed: completedToday, courseReservedToday: courseKeys.size, contextCandidates: contextual.size, remaining: newWords.length, dailyRemaining: eligibleDay ? Math.min(dailyRemaining, eligible.length) : 0, newStartAllowed: newWords.length > 0, newWordMinutes, estimateSamples: vocabulary.estimateSamples, reason: reasons.join('；') || '先完成全部必做复习，再从真实语境安排每日40个真正新词；来源或预算不足时保留缺口，不从词表凑数。'}, pendingContextWords:eligible.map(word=>({...word})), due, todayDue: due, allDue: queue.allDue, held: queue.held, reviewDebt, unfinishedReviewDrafts, newWords, todayNewWords: eligibleDay ? todayNewWords : [], dayNewWords: eligibleDay ? todayNewWords : [], carryWords: [...carryKeys.values()], dailyPlanPersisted: false, activeBatches, reviewBudget: {limit: null, completed: reviewedToday.length, remaining: due.length, requiredCount: due.length, pendingCount: debtKeys.size, estimatedMinutes: Math.round(reviewMinutes * 100) / 100, requiredEstimatedMinutes: Math.round(reviewMinutes * 100) / 100, sessionCount, sessionEstimatedMinutes: Math.round(sessionMinutes * 100) / 100, nextUnitStudyMinutes, canStartNext, nextUnitMinutes: timerProblem ? null : forecast(nextUnitStudyMinutes), budgetError: timerProblem, deferredCount: due.length - sessionCount, availableMinutes: reviewDebt.required ? globalRemainingMinutes : remainingMinutes, globalRemainingMinutes, vocabularyMinutes: vocabulary.budgetMinutes, vocabularySpentMinutes: vocabulary.spentMinutes, newVocabularyAvailableMinutes: remainingMinutes, reservedNewMinutes: 0, availableForDueMinutes: globalRemainingMinutes}, nextRetryAt: queue.futureRetries.map(item => item.retryAt).sort()[0] || null, dayProgress: {reviewed: reviewedToday.length, initialStarted: startedToday, initialCompleted: completedToday}};
  }
  function ensureDailyPlan(memory) {
    // Compatibility with already-loaded pages. Historical day manifests remain
    // readable, but viewing a plan must neither write state nor create a quota.
    return {state: M.parseState(memory), changed: false};
  }

  function startBatch(memory, options = {}) {
    const state = M.parseState(memory), now = options.now ?? Date.now(), id = options.id || 'essential-batch-' + (root.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
    if (!/^essential-batch-[A-Za-z0-9-]{1,100}$/.test(id) || !Array.isArray(options.words) || !options.words.length || options.words.length > 12) throw Error('请按1至12词创建可完整保存的新词组。');
    const words = options.words.map(wordSnapshot), wordKeys = words.map(word => norm(word.word));
    if (new Set(wordKeys).size !== words.length) throw Error('同一新词不能在一组里重复安排。');
    if (state.essential.batches[id]) {
      if (JSON.stringify(state.essential.batches[id].contextSource) !== JSON.stringify(options.contextSource) || JSON.stringify(state.essential.batches[id].wordKeys) !== JSON.stringify(wordKeys)) throw Error('同一新词组存在不同单词，原稿保留。');
      return state;
    }
    const reserved = new Set(Object.values(state.essential.batches).filter(batch => batch.status === 'learning').flatMap(batch => batch.wordKeys));
    if (wordKeys.some(key => reserved.has(key))) throw Error('该词已在另一新词组开始学习，请继续原稿，避免再做一遍初学。');
    const courseDay = options.courseDay || START_COURSE_DAY;
    if (!Number.isInteger(courseDay) || courseDay < START_COURSE_DAY || courseDay > 365) throw Error('8000词新增训练从第2课开始，第1课原进度保留。');
    const at = iso(now), materialId = 'essential-vocabulary-' + id.slice('essential-batch-'.length);
    if (!state.essential.startDate) state.essential.startDate = options.startDate || dateKey(now);
    state.essential.batches[id] = {id, materialId, courseDay, words, wordKeys, startedAt: at, updatedAt: at, status: 'learning', draft: null, activeSeconds: 0, activityByDate: {}, recordId: null, submittedAt: null,...(options.contextSource?{contextSource:clone(options.contextSource)}:{})};
    return M.parseState(state);
  }
  function saveBatchDraft(memory, id, value, now = Date.now(), options = {}) {
    const state = M.parseState(memory), batch = state.essential.batches[id];
    if (!batch) throw Error('新词组不存在，当前输入保留。');
    const expected = Object.hasOwn(options, 'expectedDraft') ? options.expectedDraft : value?.expectedDraft;
    if (expected !== undefined && expected !== (batch.draft ? JSON.stringify(batch.draft) : null)) throw Error('这份新词草稿已被另一页面更新，请保留输入后刷新。');
    if (!value?.draft || value.draft.materialId !== batch.materialId || value.draft.courseDay !== batch.courseDay || JSON.stringify(value.draft.wordKeys) !== JSON.stringify(batch.wordKeys) || batch.draft && value.draft.id !== batch.draft.id) throw Error('新词草稿与原词组不一致，原稿保留。');
    if (batch.status === 'submitted' && JSON.stringify(value.draft) !== JSON.stringify(batch.draft)) throw Error('此新词原稿已经提交，不能用不同答案覆盖。');
    batch.draft = clone(value.draft); batch.activeSeconds = value.activeSeconds ?? batch.activeSeconds; batch.activityByDate = clone(value.activityByDate ?? batch.activityByDate); batch.updatedAt = iso(now);
    return M.parseState(state);
  }
  function completeBatch(memory, id, payload, record) {
    let state = M.parseState(memory); const batch = state.essential.batches[id];
    const V = root.IELTSVocabularyPractice || (typeof require === 'function' ? require('./vocabulary-practice.js') : null);
    if (!batch || !record || record.id !== payload?.id || record.materialId !== batch.materialId || record.skill !== 'vocabulary' || record.kind !== 'original' || record.source !== 'essential-vocabulary' || record.startedAt !== payload.startedAt || !stamp(record.submittedAt)) throw Error('新词训练须先完整保存匹配的真实原稿，草稿保留。');
    let artifact, source; try { artifact = JSON.parse(record.answer); source = JSON.parse(payload.answer); } catch (_) { throw Error('新词训练原稿无法读取。'); }
    if (JSON.stringify(artifact.contextSource)!==JSON.stringify(batch.contextSource) || !V?.verifyTrainingArtifact(artifact, {vocabulary: batch.words}).valid || !V.verifyTrainingArtifact(source, {vocabulary: batch.words}).valid || JSON.stringify(artifact.rounds) !== JSON.stringify(source.rounds) || JSON.stringify(artifact.learning) !== JSON.stringify(source.learning) || artifact.activityByDate && Object.values(artifact.activityByDate).reduce((n, seconds) => n + seconds, 0) > record.activeSeconds + .01) throw Error('新词原稿缺少一致的三写三读、三轮作答或完整听音证据。');
    if (batch.recordId && batch.recordId !== record.id) throw Error('同一新词组已有另一份已存原稿，停止覆盖。');
    state = M.captureTraining(state, payload, {recordId: record.id});
    const next = state.essential.batches[id]; next.status = 'submitted'; next.recordId = record.id; next.submittedAt = record.submittedAt; next.updatedAt = record.submittedAt;
    // Keep the draft through the user-folder durability barrier. The UI clears it
    // only after syncNow succeeds, so network/quota failures remain retryable.
    return M.parseState(state);
  }
  function clearBatchDraft(memory, id) {
    const state = M.parseState(memory), batch = state.essential.batches[id];
    if (!batch || batch.status !== 'submitted' || !batch.recordId) throw Error('新词原稿尚未提交，不能清理续学草稿。');
    batch.draft = null;
    return state;
  }
  return {TARGET, START_COURSE_DAY, DAILY_NEW, RETRY_MINUTES, COST, dateKey, entries: dataFor, plan, ensureDailyPlan, activityDrafts, startBatch, saveBatchDraft, completeBatch, clearBatchDraft};
});

