'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../assets/memory-core.js'), E = require('../assets/essential-vocabulary-core.js'), S = require('../assets/memory-session.js'), V = require('../assets/vocabulary-practice.js'), P = require('../assets/year-planner.js');
const DAY = 86400000, BASE = Date.parse('2026-01-01T04:00:00.000Z');
const names = ['student','friend','happy','room','good','hello','book','pencil','window','table','flower','garden','market','future','system','reason','lesson','answer','teacher','morning','family','mother','father','sister','brother','water','little','large','house','place','thing','number','other','always','people','write','listen','speak','read','study'];
const entries = names.map((word, index) => ({id: 'essential:' + word, word, meaning: '中文义' + index, ipa: '', example: 'I use ' + word + ' at work.', rank: index + 1, stage: 'foundation'}));
const opts = more => ({entries, now: BASE, remainingMinutes: 120, courseDay: 2, ...more});
function training(words, batch, {wrong = false, legacy = false, lowScore = false} = {}) {
  const id = 'vocab-training-' + batch.id.slice(16), at = new Date(BASE + 600000).toISOString(), startedAt = new Date(BASE + 1000).toISOString();
  const learning = words.map((word, index) => ({word: word.word, spellings: [word.word, word.word, word.word], speaking: Array.from({length: 3}, (_, n) => ({workId: 'work-' + String(index * 3 + n).padStart(8, '0'), hash: (index * 3 + n + 1).toString(16).padStart(64, '0'), evidenceId: 'evidence-' + index + '-' + n, provider: 'Alibaba oral assessment', durationSeconds: 1, recordedAt: startedAt, result: {accuracy: lowScore ? 50 : 90, fluency: 90, completeness: 100}}))}));
  const rounds = V.MODES.map(mode => ({mode, correct: wrong ? words.length - 1 : words.length, total: words.length, attempts: words.map((word, index) => ({id: id + '-' + mode + '-' + index, attemptId: id + '-' + mode + '-' + index, word: word.word, meaning: word.meaning, example: word.example, mode, materialId: batch.materialId, expectedAnswer: word.word, userAnswer: wrong && index === 0 ? 'wrong' : word.word, correct: !(wrong && index === 0), submittedAt: at, ...(mode === 'dictation' ? {audio: {started: true, completed: true, kind: 'browser-tts', completedAt: at}} : {})}))}));
  const artifact = {schema: legacy ? 1 : 2, trainingVersion: legacy ? 1 : 2, trainingComplete: !legacy, kind: 'vocabulary-three-modes', words, rounds, learning, allModesCompleted: true};
  const payload = {id, materialId: batch.materialId, courseDay: batch.courseDay, trainingVersion: artifact.trainingVersion, trainingComplete: !legacy, startedAt, submittedAt: at, attempts: rounds.flatMap(round => round.attempts), answer: JSON.stringify(artifact), allModesCompleted: true};
  const record = {id, materialId: batch.materialId, source: 'essential-vocabulary', skill: 'vocabulary', kind: 'original', startedAt, submittedAt: at, answer: JSON.stringify({...artifact, schema: 1, trainingSchema: artifact.schema, activityByDate: {[E.dateKey(BASE)]: 30}}), activeSeconds: 30, elapsedSeconds: 599, assistance: {hint: false, answer: false, ai: false}, evaluation: {method: 'objective', result: wrong ? 'revise' : 'pass'}};
  return {payload, record};
}
function batchState(words = entries.slice(0, 2)) {
  const state = E.startBatch(M.newState(), {id: 'essential-batch-test', words, now: BASE, courseDay: 2});
  return {state, batch: state.essential.batches['essential-batch-test']};
}
function recall(state, records, word, skill, at, correct = true, assisted = false) {
  const id = 'memory-test-' + records.length, item = {...word, skill};
  const draft = {...S.makeDraft(item, {id, courseDay: 1, now: at - 30000}), answer: correct ? skill === 'recognition' ? word.meaning : skill === 'production' ? 'I use ' + word.word + ' for study.' : word.word : 'wrong', audioCompleted: skill === 'listening', activeSeconds: 25, activityByDate: {[E.dateKey(at)]: 25}, assisted};
  const result = {correct, ...(skill === 'production' ? {ok: true, evidenceQuote: word.word, promptVersion: 'memory-context-test'} : {})};
  const record = S.recordFor(draft, item, result, {now: at}); records.push(record);
  return M.observe(state, word, skill, {id, recordId: id, startedAt: draft.startedAt, at: record.submittedAt, correct, assisted, answer: draft.answer, source: skill === 'production' ? 'ai-context-review' : 'objective-recall'});
}

test('contextual acquisition is optional, course words reuse their original task, and viewing creates no fixed quota', () => {
  const state=M.newState(),before=JSON.stringify(state),empty=E.plan(state,opts());
  assert.equal(empty.newWords.length,0);assert.equal(empty.quota.target,0);assert.equal(empty.todayNewWords.length,0);
  const plan=E.plan(state,opts({courseWords:entries.slice(0,19)}));
  assert.equal(plan.quota.courseReservedToday,19);assert.equal(plan.todayNewWords.length,19);assert.equal(plan.newWords.length,0);assert.equal(plan.stats.started,0);
  const context={...entries[19],example:'Our listening task discusses the morning train.'},contextual=E.plan(state,opts({contextWords:[context]}));
  assert.deepEqual(contextual.newWords.map(w=>w.word),['morning']);assert.equal(contextual.newWords[0].example,context.example);
  assert.equal(E.plan(state,opts({contextWords:[{word:'morning'}]})).newWords.length,0,'a bare dictionary headword is not a material context');
  assert.equal(E.plan(state,opts({remainingMinutes:1.9,contextWords:[context]})).newWords.length,0);
  const one=E.plan(state,opts({courseDay:1,contextWords:[context]}));assert.equal(one.todayNewWords.length,0);assert.equal(one.newWords.length,0);
  assert.throws(()=>E.startBatch(state,{words:entries.slice(0,1),courseDay:1,now:BASE}),/第2课/);assert.equal(JSON.stringify(state),before);
});

test('a fixed new-word batch restores the original IDs and order, resists stale drafts, and shares the real daily budget', () => {
  const {state, batch} = batchState(), session = V.createSession({material: {id: batch.materialId, version: '1', vocabulary: batch.words}, courseDay: batch.courseDay});
  const draft = session.getDraft();
  let saved = E.saveBatchDraft(state, batch.id, {draft, activeSeconds: 60, activityByDate: {[E.dateKey(BASE)]: 60}}, Date.now(), {expectedDraft: null});
  assert.equal(saved.essential.batches[batch.id].draft.id, draft.id); assert.deepEqual(saved.essential.batches[batch.id].draft.wordKeys, ['student','friend']);
  assert.throws(() => E.saveBatchDraft(saved, batch.id, {draft}, Date.now(), {expectedDraft: null}), /另一页面/);
  assert.equal(E.plan(saved, opts()).newWords.length, 0);assert.equal(E.plan(saved, opts()).todayNewWords.length,2);assert.equal(E.plan(saved, opts()).quota.remaining,0);assert.equal(E.plan(saved, opts()).quota.completed,0); assert.equal(E.plan(saved, opts()).stats.pendingLearning, 2);
  const activity = E.activityDrafts(saved); assert.equal(activity[0].id, draft.id);
  assert.equal(P.calendarBudget([], activity, E.dateKey(BASE)).spentMinutes, 1);
  const malformed = structuredClone(saved); malformed.essential.batches[batch.id].draft.wordKeys.reverse(); assert.throws(() => M.parseState(malformed), /初学档案/);
  assert.throws(() => E.clearBatchDraft(saved, batch.id), /尚未提交/);
});

test('only consistent saved three-write, three-oral and three-round artifacts complete initial learning, without granting delayed mastery', () => {
  const {state, batch} = batchState(), {payload, record} = training(batch.words, batch);
  let saved = E.completeBatch(state, batch.id, payload, record);
  assert.equal(saved.essential.batches[batch.id].recordId, payload.id); assert.equal(Object.keys(saved.items).length, 8);
  const plan = E.plan(saved, opts({now: BASE + 600001, records: [record]}));
  assert.equal(plan.stats.initialCompleted, 2); assert.equal(plan.stats.needLearning, entries.length - 2); assert.equal(plan.stats.delayedVerifiedWords, 0);
  const once = JSON.stringify(saved); saved = E.completeBatch(saved, batch.id, payload, record); assert.equal(JSON.stringify(saved), once);
  const legacy = training(batch.words, batch, {legacy: true}); assert.throws(() => E.completeBatch(state, batch.id, legacy.payload, legacy.record), /三写三读/);
  const mismatch = structuredClone(record); const a = JSON.parse(mismatch.answer); a.rounds[0].attempts[0].userAnswer = 'different'; mismatch.answer = JSON.stringify(a); assert.throws(() => E.completeBatch(state, batch.id, payload, mismatch), /一致/);
  assert.equal(E.plan(saved, opts({now: BASE + 600001, records: []})).stats.initialCompleted, 0, 'missing originals are not verified from a cached index');
});

test('old course originals deduplicate into 8000 without changing their IDs or upgrading legacy self reports', () => {
  const {batch} = batchState(), {payload, record} = training(batch.words, batch), courseRecord = {...record, id: 'course-old-real-id', source: 'vocabulary-practice'};
  const state = M.captureTraining(M.newState(), payload), before = JSON.stringify(state);
  const plan = E.plan(state, opts({now: BASE + DAY, records: [courseRecord]}));
  assert.equal(plan.stats.initialCompleted, 2); assert.equal(plan.stats.started, 2);
  assert.ok(!plan.newWords.some(word => ['student','friend'].includes(word.word))); assert.equal(JSON.stringify(state), before);
  const legacy = training(batch.words, batch, {legacy: true}).record; assert.equal(E.plan(M.newState(), opts({records: [legacy]})).stats.initialCompleted, 0);
});

test('old exposure can be repaired in current context without becoming a new word or changing its history',()=>{
  const original=M.captureTraining(M.newState(),{attempts:[{id:'old-spelling',word:'student',meaning:'学生',mode:'meaning',submittedAt:new Date(BASE-DAY).toISOString(),correct:true}]}),records=[];
  const blocked=E.plan(original,opts({reviewLimit:0,contextWords:[entries[0],entries[6]]}));assert.equal(blocked.due.length,1);assert.equal(blocked.newWords.length,0,'old reviewLimit=0 cannot bypass required reviews');
  const memory=recall(original,records,entries[0],'spelling',BASE),before=structuredClone(memory),plan=E.plan(memory,opts({now:BASE+1,records,contextWords:[entries[0],entries[6]]}));
  assert.deepEqual(plan.newWords.map(w=>[w.word,w.learningKind]),[['student','complete-initial'],['book','new']]);assert.ok(!plan.todayNewWords.some(w=>w.word==='student'));assert.equal(plan.stats.initialCompleted,0);
  const opened=E.startBatch(memory,{id:'essential-batch-old-completion',words:[entries[0]],now:BASE});assert.deepEqual(opened.items,before.items);assert.equal(E.plan(opened,opts({reviewLimit:0})).quota.startedToday,0);assert.deepEqual(memory,before);
});

test('global cross-page budget includes a persisted acquisition and never double-counts its committed original', async () => {
  const {state, batch} = batchState(), session = V.createSession({material: {id: batch.materialId, version: '1', vocabulary: batch.words}, courseDay: batch.courseDay}), date = E.dateKey(BASE);
  const memory = E.saveBatchDraft(state, batch.id, {draft: session.getDraft(), activeSeconds: 90, activityByDate: {[date]: 90}}, Date.now());
  const storage = {getItem: key => key === M.KEY ? JSON.stringify(memory) : null};
  const loaded = await P.readBudget({storage, records: [], mediaEntries: [], today: date, profileId: 'legacy'}); assert.equal(loaded.spentMinutes, 1.5);
  const record = {id: session.getDraft().id, activeSeconds: 90, submittedAt: new Date(BASE).toISOString(), answer: JSON.stringify({activityByDate: {[date]: 90}})};
  const committed = await P.readBudget({storage, records: [record], mediaEntries: [], today: date, profileId: 'legacy'}); assert.equal(committed.spentMinutes, 1.5);
  const tomorrow = await P.readBudget({storage, records: [], mediaEntries: [], today: E.dateKey(BASE + DAY), profileId: 'legacy'}); assert.equal(tomorrow.spentMinutes, 0);
});

test('errors return after a same-day spacing interval; retry success cannot inflate FSRS or delayed mastery', () => {
  const {state, batch} = batchState([entries[0]]), {payload, record} = training(batch.words, batch);
  let memory = E.completeBatch(state, batch.id, payload, record); const records = [record], at = BASE + 2 * DAY;
  memory = recall(memory, records, entries[0], 'spelling', at, false);
  const card = structuredClone(memory.items[M.idFor(entries[0].word, 'spelling')].card);
  assert.equal(E.plan(memory, opts({now: at + 9 * 60000, records})).due.length, 0);
  const retry = E.plan(memory, opts({now: at + 10 * 60000, records})).due[0]; assert.equal(retry.word, 'student'); assert.equal(retry.reviewKind, 'retry');
  memory = recall(memory, records, entries[0], 'spelling', at + 11 * 60000, true);
  assert.deepEqual(memory.items[M.idFor(entries[0].word, 'spelling')].card, card);
  assert.equal(E.plan(memory, opts({now: at + 12 * 60000, records})).stats.delayedVerifiedWords, 0);
  const nextDay = E.plan(memory, opts({now: at + 2 * DAY, records})); assert.ok(nextDay.allDue.some(word => word.word === 'student'));
});

test('one word cadence rotates core skills without forcing four daily due cards or silently rewriting their dates', () => {
  const word=entries[0], records=[];
  let memory=M.captureTraining(M.newState(),{attempts:[{id:'initial-rotate',word:word.word,meaning:word.meaning,submittedAt:new Date(BASE).toISOString(),correct:true}]}),at=BASE+3*DAY;
  memory=recall(memory,records,word,'recognition',at);
  const before=JSON.stringify(memory),held=E.plan(memory,opts({now:at+DAY+1,records}));
  assert.equal(held.allDue.length,0,'other-skill null cards do not force the word back the next day');
  assert.equal(JSON.stringify(memory),before);
  const next=E.plan(memory,opts({now:at+10*DAY,records}));
  assert.equal(next.allDue.length,1);assert.equal(next.allDue[0].skill,'spelling');assert.equal(next.allDue[0].cadence,'rotating-word');
  memory=recall(memory,records,word,'spelling',at+10*DAY);memory=recall(memory,records,word,'listening',at+40*DAY);
  const ordinary=E.plan(memory,opts({now:at+170*DAY,records,recognitionReadyWordKeys:[word.word]}));assert.equal(ordinary.allDue[0].skill,'recognition');assert.equal(ordinary.stats.verifiedBySkill.production,0);
  const coreProduction=E.plan(memory,opts({now:at+170*DAY,records,productionWords:[word.word]}));assert.equal(coreProduction.allDue[0].skill,'production');
});

test('real cross-page vocabulary activity constrains contextual new work without creating a compulsory remainder',()=>{
  const date=E.dateKey(BASE),record={id:'real-vocab-time',skill:'vocabulary',activeSeconds:80*60,submittedAt:new Date(BASE).toISOString(),answer:JSON.stringify({activityByDate:{[date]:80*60}})},draft={id:'open-course-vocab',skill:'vocabulary',startedAt:new Date(BASE).toISOString(),activeSeconds:8*60,activityByDate:{[date]:8*60}};
  const plan=E.plan(M.newState(),opts({contextWords:entries,records:[record],remainingMinutes:300,vocabularyDrafts:[draft]}));
  assert.equal(plan.reviewBudget.vocabularyMinutes,120);assert.equal(plan.reviewBudget.vocabularySpentMinutes,88);assert.equal(plan.reviewBudget.availableMinutes,32);assert.equal(plan.newWords.length,16);assert.equal(plan.reviewBudget.reservedNewMinutes,0);assert.equal(plan.stats.started,0);
  draft.activeSeconds=40*60;draft.activityByDate[date]=40*60;const full=E.plan(M.newState(),opts({contextWords:entries,records:[record],remainingMinutes:300,vocabularyDrafts:[draft]}));
  assert.equal(full.quota.newStartAllowed,false);assert.equal(full.newWords.length,0);assert.equal(full.todayNewWords.length,0);assert.match(full.quota.reason,/参考份额已用完/);
});

test('four skills need separate linked, unaided delayed answers; exposure, self-report, missing original and later errors cannot grant mastery', () => {
  const word = entries[0], initial = M.captureTraining(M.newState(), {attempts: [{id: 'initial', word: word.word, meaning: word.meaning, submittedAt: new Date(BASE).toISOString(), correct: true}]}), records = [];
  let memory = initial, at = BASE + 3 * DAY;
  for (let round = 0; round < 2; round++) for (const skill of M.SKILLS) { memory = recall(memory, records, word, skill, at); at += 3 * DAY; }
  const plan = E.plan(memory, opts({now: at - 3 * DAY + 1, records}));
  assert.equal(plan.stats.delayedVerifiedWords, 1); for (const skill of M.SKILLS) assert.equal(plan.stats.verifiedBySkill[skill], 1);
  assert.equal(E.plan(memory, opts({now: at - 3 * DAY + 1, records: records.slice(1)})).stats.delayedVerifiedWords, 0);
  memory = recall(memory, records, word, 'recognition', at - 3 * DAY + 60000, false, true);
  assert.equal(E.plan(memory, opts({now: at - 3 * DAY + 60001, records})).stats.delayedVerifiedWords, 0);
  const legacy = M.observe(M.observe(M.newState(), word, 'recognition', {id: 'legacy-a', at: new Date(BASE).toISOString(), correct: true}), word, 'recognition', {id: 'legacy-b', at: new Date(BASE + 3 * DAY).toISOString(), correct: true});
  assert.equal(E.plan(legacy, opts({now: BASE + 3 * DAY + 1})).stats.delayedVerifiedWords, 0);
});

test('daily reviews retain every due word and consume actual submissions before contextual new work, without a count quota', () => {
  let memory = M.captureTraining(M.newState(), {attempts: entries.slice(0, 8).map((word, index) => ({id: 'training-' + index, word: word.word, meaning: word.meaning, submittedAt: new Date(BASE).toISOString(), correct: true}))});
  const records = [], now = BASE + 3 * DAY;
  let plan = E.plan(memory, opts({now, remainingMinutes: 2.2, reviewLimit: 2,contextWords:[entries[8]]})); assert.equal(plan.due.length, 8); assert.equal(plan.reviewBudget.sessionCount,7); assert.equal(plan.newWords.length, 0);
  memory = recall(memory, records, entries[0], plan.due[0].skill, now);
  plan = E.plan(memory, opts({now: now + 1, remainingMinutes: 120, records, reviewLimit: 2,entries:entries.slice(0,8)})); assert.equal(plan.reviewBudget.completed, 1); assert.equal(plan.due.length, 7);
  memory = recall(memory, records, entries[1], plan.due[0].skill, now + 1000);
  plan = E.plan(memory, opts({now: now + 1001, remainingMinutes: 120, records, reviewLimit: 2,contextWords:[entries[8]]})); assert.equal(plan.reviewBudget.remaining, 6); assert.equal(plan.due.length, 6); assert.equal(plan.newWords.length,0);
  for(let n=2;n<8;n++){const item=plan.due[0],word=entries.find(word=>word.word===item.word);memory=recall(memory,records,word,item.skill,now+n*1000);plan=E.plan(memory,opts({now:now+n*1000+1,records,reviewLimit:0,contextWords:[entries[8]]}));}
  assert.equal(plan.due.length,0);assert.equal(plan.reviewBudget.completed,8);assert.equal(plan.reviewDebt.required,false);assert.deepEqual(plan.newWords.map(word=>word.word),[entries[8].word]);
  assert.equal(E.plan(M.newState(), opts({courseDay: 365})).stats.started, 0);
});

test('legacy memory, acquisition drafts and full-size 8000-by-four storage survive validation and conflict-aware backup merging', () => {
  const legacy = M.newState(); delete legacy.essential;
  assert.deepEqual(M.parseState(legacy).essential, {schema: 1, startDate: null, batches: {}, acquisitions: {},days:{}});
  const {state, batch} = batchState(), {payload, record} = training(batch.words, batch); const done = E.completeBatch(state, batch.id, payload, record);
  assert.equal(M.mergeStates(legacy, done).essential.batches[batch.id].recordId, record.id);
  const conflict = structuredClone(done); conflict.essential.batches[batch.id].words[0].meaning = '冲突'; assert.throws(() => M.mergeStates(done, conflict), /不同来源/);
  const full = M.newState();
  function alpha(n) { let out = ''; do { out = String.fromCharCode(97 + n % 26) + out; n = Math.floor(n / 26) - 1; } while (n >= 0); return out; }
  for (let n = 0; n < 8000; n++) for (const skill of M.SKILLS) { const word = 'fixture' + alpha(n); full.items[M.idFor(word, skill)] = {word, meaning: '隔离fixture', example: '', skill, card: null, history: []}; }
  assert.equal(Object.keys(M.parseState(full).items).length, 32000);
  assert.ok(require('../assets/user-data-store.js').KEYS.includes(M.KEY));
  const B = require('../assets/backup-core.js'); assert.equal(B.validate(M.KEY, JSON.stringify(done)).essential.batches[batch.id].recordId, record.id);
});


test('a single available meaning never hides the due word: unavailable recognition rotates real spelling and listening',()=>{const word=entries[0],records=[];let memory=M.captureTraining(M.newState(),{attempts:[{id:'one-meaning-initial',word:word.word,meaning:word.meaning,submittedAt:new Date(BASE).toISOString(),correct:true}]});let plan=E.plan(memory,opts({now:BASE+3*DAY,records}));assert.equal(plan.due.length,1);assert.equal(plan.due[0].skill,'spelling');assert.equal(plan.due[0].reviewFallback,'recognition-options-unavailable');memory=recall(memory,records,word,'spelling',BASE+3*DAY);plan=E.plan(memory,opts({now:BASE+13*DAY,records}));assert.equal(plan.due[0].skill,'listening');assert.equal(plan.stats.verifiedBySkill.recognition,0);const explicit=E.plan(memory,opts({now:BASE+13*DAY,records,recognitionReadyWordKeys:[word.word]}));assert.equal(explicit.due[0].skill,'recognition');});


test('legacy day manifests remain byte-for-byte inert: viewing yesterday does not exclude an unlearned context word',()=>{
  const memory=M.newState(),yesterday=E.dateKey(BASE-DAY),today=E.dateKey(BASE);
  memory.essential.days[yesterday]={date:yesterday,courseDay:2,createdAt:new Date(BASE-DAY).toISOString(),target:2,wordKeys:['student','friend'],courseWordKeys:['student']};
  memory.essential.days[today]={date:today,courseDay:3,createdAt:new Date(BASE).toISOString(),target:1,wordKeys:['happy'],courseWordKeys:[]};
  const before=JSON.stringify(memory),ensured=E.ensureDailyPlan(memory,opts({courseDay:3,contextWords:[entries[0]]}));
  assert.equal(ensured.changed,false);assert.equal(JSON.stringify(ensured.state),before);assert.equal(JSON.stringify(memory),before);
  const plan=E.plan(memory,opts({courseDay:3,contextWords:[entries[0]]}));assert.deepEqual(plan.newWords.map(w=>w.word),['student']);assert.equal(plan.stats.started,0);assert.equal(plan.carryWords.length,0);assert.equal(plan.dailyPlanPersisted,false);assert.equal(JSON.stringify(memory),before);
  assert.deepEqual(M.mergeStates(memory,memory).essential.days,memory.essential.days);assert.deepEqual(require('../assets/backup-core.js').validate(M.KEY,before).essential.days,memory.essential.days);
});

test('adaptive planning preserves submitted originals, active acquisition drafts, recall drafts and every legacy manifest',()=>{
  const {state,batch}=batchState(),{payload,record}=training(batch.words,batch);let memory=E.completeBatch(state,batch.id,payload,record);
  memory=E.startBatch(memory,{id:'essential-batch-continuation',words:[entries[2]],now:BASE+700000,courseDay:2});
  const active=memory.essential.batches['essential-batch-continuation'],session=V.createSession({material:{id:active.materialId,version:'1',vocabulary:active.words},courseDay:2});
  memory=E.saveBatchDraft(memory,active.id,{draft:session.getDraft(),activeSeconds:12,activityByDate:{[E.dateKey(BASE)]:12}},BASE+800000,{expectedDraft:null});
  const draft=S.makeDraft({...entries[0],skill:'spelling'},{id:'memory-preserved-adaptive',courseDay:2,now:BASE+900000});memory.drafts[draft.id]=draft;
  const date=E.dateKey(BASE);memory.essential.days[date]={date,courseDay:2,createdAt:new Date(BASE).toISOString(),target:2,wordKeys:['student','friend'],courseWordKeys:[]};
  const before=structuredClone(memory),raw=JSON.stringify(memory),recordsBefore=JSON.stringify(record),plan=E.plan(memory,opts({now:BASE+DAY,records:[record],contextWords:[entries[3]]})),ensured=E.ensureDailyPlan(memory);
  assert.equal(ensured.changed,false);assert.equal(JSON.stringify(ensured.state),raw);assert.deepEqual(memory,before);assert.equal(JSON.stringify(record),recordsBefore);
  assert.equal(plan.stats.initialCompleted,2);assert.equal(plan.stats.delayedVerifiedWords,0);assert.equal(plan.activeBatches[0].id,active.id);assert.equal(plan.activeBatches[0].draft.id,session.getDraft().id);assert.equal(plan.carryWords[0].word,'happy');assert.equal(plan.newWords.length,0);
});

test('normal old v2 course records including missing legacy kind exclude learned words without changing previous completion',()=>{
  const {batch}=batchState(entries.slice(0,2)),{record}=training(batch.words,batch);record.id='course-old-v2';record.source='vocabulary-practice';record.dayNumber=1;delete record.kind;const before=JSON.stringify(record);
  const plan=E.plan(M.newState(),opts({now:BASE+DAY,courseWords:entries.slice(0,19),records:[record]}));assert.equal(plan.stats.initialCompleted,2);assert.equal(plan.todayNewWords.length,17);assert.ok(plan.todayNewWords.every(w=>!['student','friend'].includes(w.word)));assert.equal(plan.quota.courseReservedToday,17);assert.equal(plan.newWords.length,0);assert.equal(JSON.stringify(record),before);
});
