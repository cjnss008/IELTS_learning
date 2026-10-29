'use strict';
// Synthetic state only: the 8000 public catalog is the normal test input.
const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../assets/assessment-core.js'),M=require('../assets/memory-core.js'),V=require('../assets/vocabulary-practice.js'),S=require('../assets/memory-session.js'),Data=require('../assets/essential-vocabulary-data.js'),E=require('../assets/essential-vocabulary-core.js');
const NOW=Date.parse('2026-01-02T04:00:00Z'),DAY=86400000;
function fixture(t){
 const keys=['IELTSAssessment','IELTSMemory','IELTSVocabularyPractice','IELTS_ESSENTIAL_VOCABULARY','IELTSFamilyLessonExpansionV95','IELTSContextualVocabulary'],saved=Object.fromEntries(keys.map(k=>[k,global[k]]));
 t.after(()=>{for(const key of keys)global[key]=saved[key];});
 let current=Object.freeze([]),owner=true,lexicon=[],checks=0;const catalog=structuredClone(Data);
 global.IELTSAssessment=A;global.IELTSMemory=M;global.IELTS_ESSENTIAL_VOCABULARY=catalog;
 global.IELTSVocabularyPractice={...V,verifyTrainingArtifact:()=>{checks++;return{valid:true};}};
 global.IELTSFamilyLessonExpansionV95={runtime:()=>({isCurrentFullRecords:records=>owner&&records===current})};
 global.IELTSContextualVocabulary={familyVocabularyLexicon:()=>({status:'ready',entries:lexicon}),familyVocabularyContext:()=>({status:'inactive',targets:[]})};
 const draft=words=>({id:'synthetic-draft',taskId:'vocabulary',text:JSON.stringify({kind:'vocabulary-practice-draft',wordKeys:words})});
 const form=(drafts=[],memory=M.newState())=>E.verifiedFormEvidence({data:catalog,records:current,drafts,memory,now:NOW});
 return{catalog,draft,form,records:()=>current,setRecords:records=>{current=Object.freeze(records.map(Object.freeze));},setOwner:value=>{owner=value;},setLexicon:value=>{lexicon=value;},checks:()=>checks};
}
function options(f,extra={}){return{data:f.catalog,records:f.records(),familyRecords:f.records(),now:NOW,courseDay:3,remainingMinutes:120,...extra};}
const pick=p=>({due:p.due,held:p.held,reviewDebt:p.reviewDebt,nextRetryAt:p.nextRetryAt,reviewBudget:{sessionCount:p.reviewBudget.sessionCount}});

test('form evidence reads current draft, lexicon, immutable originals and owner each time',t=>{
 const f=fixture(t),record={id:'original-1',kind:'original',skill:'vocabulary',submittedAt:new Date(NOW-DAY).toISOString(),answer:JSON.stringify({words:[{word:'book'}]})};f.setRecords([record]);
 f.setLexicon([{id:'extension:heating',word:'heating',lexicalKind:'extension',spellingVariants:[]}]);const first=f.form([f.draft(['heating'])]);assert.equal(first.status,'ready');assert.deepEqual(first.potentialBySurface[0].canonicalIds,['essential:heat','extension:heating']);
 const checks=f.checks(),second=f.form([f.draft(['book'])]);assert.equal(second.status,'ready');assert.equal(second.potentialBySurface[0].surface,'book');assert.equal(f.checks(),checks+1,'the original training artifact is rechecked');
 f.setLexicon([]);assert.deepEqual(f.form([f.draft(['heating'])]).potentialBySurface[0].canonicalIds,['essential:heat']);
 f.setRecords([{...record,id:'original-2',answer:JSON.stringify({words:[{word:'unindexedfictionalword'}]})}]);assert.ok(f.form().potentialBySurface.some(row=>row.surface==='unindexedfictionalword'));
 f.setOwner(false);assert.equal(f.form().status,'pending');f.setOwner(true);assert.equal(f.form().status,'ready');
});

test('a replaced canonical catalog is checked again and cannot use its old private index',t=>{
 const f=fixture(t);assert.equal(f.form().status,'ready');const old=f.catalog.entries;
 f.catalog.entries=old.map(row=>({...row}));f.catalog.entries[0].word='alteredcatalogword';assert.equal(f.form().status,'pending');
 const changed={...f.catalog.entries[0],example:'A synthetic altered catalog example.'},plan=E.plan(M.newState(),options(f,{contextWords:[changed]}));
 assert.ok(plan.newWords.some(row=>row.word==='alteredcatalogword'));assert.notEqual(f.catalog.entries,old);
});

test('catalog entry accessors stay live instead of reusing a frozen projection',t=>{
 const f=fixture(t),word=f.catalog.entries.find(row=>row.word==='book');let meaning='old synthetic meaning';Object.defineProperty(word,'meaning',{enumerable:true,configurable:true,get:()=>meaning});
 assert.equal(f.form().status,'ready');const context=[{word:'book',example:'A synthetic book example.'}],first=E.plan(M.newState(),options(f,{contextWords:context}));assert.equal(first.newWords[0].meaning,'old synthetic meaning');
 meaning='new synthetic meaning';const second=E.plan(M.newState(),options(f,{contextWords:context}));assert.equal(second.newWords[0].meaning,'new synthetic meaning');
});

test('catalog getter cannot substitute a different array after the canonical hash check',t=>{
 const f=fixture(t),good=f.catalog.entries,bad=structuredClone(good);bad[0].word='changedsyntheticword';let reads=0;
 Object.defineProperty(f.catalog,'entries',{configurable:true,get:()=>++reads%2?good:bad});
 assert.equal(f.form().status,'ready');assert.equal(reads,3,'projection uses the same source just checked');assert.equal(f.form().status,'pending');
});

test('a later toJSON prototype addition keeps the cached-source fallback usable',t=>{
 const f=fixture(t);assert.equal(f.form().status,'ready');Object.defineProperty(Array.prototype,'toJSON',{configurable:true,value(){return Array.from(this);}});
 try{const plan=E.plan(M.newState(),options(f));assert.equal(plan.stats.total,8000);assert.equal(plan.reviewDebt.required,false);}finally{delete Array.prototype.toJSON;}
});

test('review projection preserves current due work, retry delay, saved drafts and budget',t=>{
 const f=fixture(t),word=f.catalog.entries.find(row=>row.word==='book'),state=M.observe(M.newState(),word,'spelling',{id:'synthetic-earlier',at:new Date(NOW-3*DAY).toISOString(),correct:true,assisted:false,answer:'book'});
 let opts=options(f);assert.deepEqual(E.reviewPlan(state,opts),pick(E.plan(state,opts)));assert.ok(E.reviewPlan(state,opts).due.length>0);
 opts=options(f,{remainingMinutes:0});assert.equal(E.reviewPlan(state,opts).reviewBudget.sessionCount,0);assert.deepEqual(E.reviewPlan(state,opts),pick(E.plan(state,opts)));
 const wrong=M.observe(state,word,'spelling',{id:'synthetic-wrong',at:new Date(NOW-60000).toISOString(),correct:false,assisted:false,answer:'wrong'}),draft={...S.makeDraft({...word,skill:'spelling'},{id:'memory-synthetic-draft',courseDay:3,now:NOW-30000}),answer:'saved original'};wrong.drafts[draft.id]=draft;
 opts=options(f);let projection=E.reviewPlan(wrong,opts);assert.deepEqual(projection,pick(E.plan(wrong,opts)));assert.equal(projection.reviewDebt.waitingRetries,1);assert.equal(projection.reviewDebt.unfinishedDrafts,1);assert.equal(wrong.drafts[draft.id].answer,'saved original');
 opts=options(f,{now:NOW+15*60000,timerState:null});projection=E.reviewPlan(wrong,opts);assert.deepEqual(projection,pick(E.plan(wrong,opts)));assert.equal(projection.reviewBudget.sessionCount,0);
});

test('an existing batch and later live state are not cached as new-word decisions',t=>{
 const f=fixture(t),word=f.catalog.entries.find(row=>row.word==='book'),fresh=M.newState(),started=E.startBatch(fresh,{id:'essential-batch-synthetic',words:[word],courseDay:3,now:NOW-1000});
 f.form();const prior=JSON.stringify(started),held=E.plan(started,options(f,{contextWords:[word]}));assert.equal(held.activeBatches[0].id,'essential-batch-synthetic');assert.equal(held.newWords.length,0);assert.equal(JSON.stringify(started),prior);
 const empty=E.plan(M.newState(),options(f,{contextWords:[word]}));assert.ok(empty.newWords.some(row=>row.word==='book'));
});
