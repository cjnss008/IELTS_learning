'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const H=require('./daily-review-fixture.cjs'),{M,V,S,Timer,NOW,DAY,base}=H,E=H.load('essential-vocabulary-core.js'),Course=H.load('essential-vocabulary-course.js');
const clone=v=>JSON.parse(JSON.stringify(v)),D=require(path.join(base,'assets/curriculum-data.js')),A=require(path.join(base,'assets/assessment-core.js')),Flow=require(path.join(base,'assets/course-expansion.js')),P=require(path.join(base,'assets/course-player.js')),Hub=require(path.join(base,'assets/today-hub.js'));
const options=extra=>({data:V,now:NOW,remainingMinutes:360,courseDay:2,records:[],timerState:{...Timer.newState(),enabled:true},...extra});
function isolatedAdaptive(){const values=new Map();return require(path.join(base,'assets/adaptive-plan.js')).createStore({data:D,storage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},profileId:'isolated-review',contextReady:true,synchronousPublicCourse:true,now:()=>NOW});}

test('more than 480 due words stay required with no review-count or vocabulary allowance cutoff',()=>{
 const state=H.dueState(),raw=JSON.stringify(state),plan=E.plan(state,options({reviewLimit:1,vocabularyMinutes:15}));
 assert.equal(plan.allDue.length,600);assert.equal(plan.due.length,600);assert.equal(plan.reviewBudget.requiredCount,600);assert.equal(plan.reviewBudget.limit,null);assert.equal(plan.reviewBudget.nextUnitMinutes,.3);assert(plan.reviewBudget.sessionCount>0&&plan.reviewBudget.sessionCount<=600);assert.equal(plan.newWords.length,0);assert.equal(JSON.stringify(state),raw);
});

test('a real 120 minute vocabulary record does not conceal due words while global budget remains',()=>{
 const record=H.spentRecord(),plan=E.plan(H.dueState(),options({records:[record],remainingMinutes:240}));
 assert.equal(plan.reviewBudget.vocabularySpentMinutes,120);assert.equal(plan.reviewBudget.newVocabularyAvailableMinutes,0);assert.equal(plan.due.length,600);assert.equal(plan.reviewBudget.availableForDueMinutes,240);assert(plan.reviewBudget.sessionCount>0);assert.equal(plan.newWords.length,0);
});

test('zero global budget preserves full required backlog, produces no new start, and is not course completion',()=>{
 const state=H.dueState(),raw=JSON.stringify(state),plan=E.plan(state,options({remainingMinutes:0}));assert.equal(plan.due.length,600);assert.equal(plan.reviewBudget.sessionCount,0);assert.equal(plan.reviewBudget.deferredCount,600);assert.equal(plan.newWords.length,0);
 const result=Course.state({day:2,data:D,adaptive:isolatedAdaptive(),dayPlan:Flow.familyGrammarProjection(Flow.unstartedLessonFlow(Flow.overlay(D.days[1],D),D,{contextReady:true}),D,{contextReady:true,assessment:A,records:[],drafts:[]}),memory:state,engine:E,memoryEngine:M,records:[],drafts:[],now:NOW,budget:{remainingMinutes:0},timerState:{...Timer.newState(),enabled:true}});
 assert.equal(result.done,false);assert.equal(result.dailyReviewRequired,true);assert.equal(result.deferred,true);assert.equal(JSON.stringify(state),raw);
});

test('thirty is the new-word goal; eligible context is still required and the first course is preserved',()=>{
 const contexts=V.entries.slice(0,60),empty=M.newState(),full=E.plan(empty,options({contextWords:contexts}));assert.equal(full.quota.dailyTarget,30);assert.equal(full.quota.baseline,30);assert.ok(full.newWords.length>=30);assert.ok(full.newWords.length<=contexts.length);assert.ok(full.newWords.every(word=>contexts.some(context=>context.word===word.word)));
 const noSource=E.plan(empty,options());assert.equal(noSource.newWords.length,0);assert.equal(noSource.quota.goalRemaining,30);
 const first=E.plan(empty,options({contextWords:contexts,courseDay:1}));assert.equal(first.newWords.length,0);assert.equal(first.quota.eligible,false);assert.throws(()=>E.startBatch(empty,{words:contexts.slice(0,1),courseDay:1,now:NOW}),/第2课/);
});

test('future wrong-word retry and a real unfinished review draft hold new words without removing intervals',()=>{
 const word=V.entries[0],wrong=M.observe(M.newState(),word,'spelling',{id:'just-wrong',at:new Date(NOW-60000).toISOString(),correct:false,assisted:true,answer:'incorrect'}),before=JSON.stringify(wrong),plan=E.plan(wrong,options({contextWords:V.entries.slice(1,50)}));
 assert.equal(plan.due.length,0);assert.equal(plan.reviewDebt.waitingRetries,1);assert.equal(plan.reviewDebt.required,true);assert.equal(plan.newWords.length,0);assert.equal(Date.parse(plan.nextRetryAt),NOW+9*60000);assert.equal(JSON.stringify(wrong),before);
 const draft={...S.makeDraft({...word,skill:'spelling'},{id:'memory-held-draft',courseDay:2,now:NOW-30000}),answer:'ori'};const withDraft=clone(wrong);withDraft.drafts[draft.id]=draft;M.parseState(withDraft);const held=E.plan(withDraft,options({contextWords:V.entries.slice(1,50)}));assert.equal(held.reviewDebt.unfinishedDrafts,1);assert.equal(held.newWords.length,0);assert.equal(held.unfinishedReviewDrafts[0].answer,'ori');
 const future=M.observe(M.newState(),word,'spelling',{id:'not-due',at:new Date(NOW-60000).toISOString(),correct:true,assisted:true,answer:word.word});assert.equal(E.plan(future,options({contextWords:V.entries.slice(1,50)})).reviewDebt.required,false,'normal future review is not a due obligation');
});

test('existing batches and past completed course contracts survive while daily review is a separate required Load entry',()=>{
 const state=H.dueState(4),batch=E.startBatch(state,{id:'essential-batch-existing',words:V.entries.slice(700,702),courseDay:2,now:NOW-60000}),before=JSON.stringify(batch),plan=E.plan(batch,options());assert.equal(plan.activeBatches[0].id,'essential-batch-existing');assert.equal(plan.newWords.length,0);assert.equal(JSON.stringify(batch),before);
 const actual=Course.state({day:2,data:D,adaptive:isolatedAdaptive(),dayPlan:Flow.familyGrammarProjection(Flow.unstartedLessonFlow(Flow.overlay(D.days[1],D),D,{contextReady:true}),D,{contextReady:true,assessment:A,records:[],drafts:[]}),memory:state,engine:E,memoryEngine:M,records:[],drafts:[],now:NOW,budget:{remainingMinutes:360},timerState:{...Timer.newState(),enabled:true}});assert.equal(actual.dailyReviewRequired,true);
 const saved=global.IELTSEssentialCourse;global.IELTSEssentialCourse={state:()=>actual};try{const Load=H.load('daily-learning-load.js'),queue=Load.build({data:D,records:[],drafts:[],currentDay:2,now:NOW,budget:{remainingMinutes:360,spentMinutes:0,exhausted:false},timerState:{...Timer.newState(),enabled:true},assessment:A,player:P,hub:Hub,adaptivePlan:null,yearFirstUse:false,getDay:day=>Flow.familyGrammarProjection(Flow.unstartedLessonFlow(Flow.overlay(day,D),D,{contextReady:true}),D,{contextReady:true,assessment:A,records:[],drafts:[]})});assert.equal(queue.next?.kind,'essential-vocabulary');assert.equal(queue.next?.dueReview,true);assert.equal(queue.next?.required,true);assert.equal(queue.next?.optional,false);}finally{global.IELTSEssentialCourse=saved;}
});

test('actual Essential App shows the full due count and blocks fresh start while 10 minute retry waits',async()=>{
 const dom=H.helper('essential-vocabulary-app-dom.test.cjs','fixture,button').fixture({words:['student','teacher','apple']}),word=dom.entries[0],now=Date.now(),state=M.observe(M.newState(),word,'spelling',{id:'ui-retry',at:new Date(now-60000).toISOString(),correct:false,assisted:true,answer:'incorrect'});dom.storage.setItem(M.KEY,JSON.stringify(state));let opened=0;const app=dom.mount({now:()=>now,openReview:async()=>opened++});try{const plan=app.getPlan();assert.equal(plan.newWords.length,0);assert.equal(plan.reviewDebt.required,true);await app.start();assert.equal(Object.keys(dom.memory.read().essential.batches).length,0);assert.match(dom.dashboard.textContent,/待|等待|未完成/);assert.doesNotMatch(dom.dashboard.textContent,/这轮没有到期复习/);}finally{app.destroy();}
});
