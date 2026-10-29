'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const M=require('../assets/memory-core.js'),E=require('../assets/essential-vocabulary-core.js'),Vocab=require('../assets/vocabulary-practice.js');
const Data=require('../assets/essential-vocabulary-data.js'),C=require('../assets/contextual-vocabulary-course.js');
const {training}=require('./daily-review-fixture.cjs').helper('essential-vocabulary-core.test.cjs','training');
const BASE=Date.parse('2026-01-01T04:00:00Z'),DAY=86400000,copy=x=>JSON.parse(JSON.stringify(x));
const extWords=['kilogram','rent','heating','cloudy','snowy','freezing','Celsius','volleyball','aerobics','yoga','website','email','password','username','login','logout','download','upload','browser','online','offline','tutorial','algebra','reuse'];
const binding={schema:1,originCourseDay:13,releaseId:'test-release',releaseSha256:'a'.repeat(64),rootReviewSha256:'b'.repeat(64),unitId:'test-unit',unitSha256:'c'.repeat(64),targetSetSha256:'d'.repeat(64),sourceContractSha256:'e'.repeat(64)};
function fixture(t){
 const old={family:global.IELTSFamilyLessonExpansionV95,context:global.IELTSContextualVocabulary,data:global.IELTS_ESSENTIAL_VOCABULARY};
 t.after(()=>{global.IELTSFamilyLessonExpansionV95=old.family;global.IELTSContextualVocabulary=old.context;global.IELTS_ESSENTIAL_VOCABULARY=old.data;});
 const core=Data.entries.filter(e=>['the','be','and','of','to','litre'].includes(e.word)),review={status:'dictionary-reference-checked'};
 assert.equal(core.length,6);assert.equal(extWords.length,24);
 const lexicon=[...core.map(e=>({id:e.id,word:e.word,canonicalWord:e.word,kind:'core',spellingVariants:e.spellingVariants||[]})),...extWords.map(word=>({id:'extension:'+word.toLowerCase(),word,canonicalWord:word,kind:'extension',spellingVariants:[],dictionaryReview:review}))];
 const targets=lexicon.map(e=>({canonicalId:e.id,canonicalWord:e.canonicalWord,lexicalKind:e.kind,word:e.word==='litre'?'liter':e.word,
  meaning:'测试义-'+e.word,partOfSpeech:'n.',ipa:'/test/',example:'A source sentence for '+e.word+'.',audio:'audio/test.mp3',sourceRef:{materialId:'synthetic-reading'},...(e.kind==='extension'?{dictionaryReview:review}:{})}));
 let current=[],contextEnabled=true;
 const runtime={isCurrentFullRecords:records=>records===current,readVocabularyLexicon:({records})=>records===current?{status:'ready',entries:copy(lexicon)}:{status:'pending',reason:'unbranded'},
  readVocabularyContext:({records,courseDay})=>records!==current?{status:'pending',reason:'unbranded'}:!contextEnabled||courseDay!==13?{status:'inactive'}:{status:'ready',binding:copy(binding),releaseCanonicalIds:targets.map(v=>v.canonicalId),targets:copy(targets)}};
 global.IELTS_ESSENTIAL_VOCABULARY=Data;global.IELTSContextualVocabulary=C;
 global.IELTSFamilyLessonExpansionV95={runtime:()=>runtime,cleanVocabularyBinding:value=>copy(value)};
 const opts=(more={})=>({data:Data,now:BASE,courseDay:13,remainingMinutes:360,vocabularyMinutes:180,newWordMinutes:.5,records:current,familyRecords:current,familyDrafts:[],...more});
 return{opts,targets,lexicon,records:()=>current,setRecords:r=>{current=r;},disableContext:()=>{contextEnabled=false;}};
}
test('signed family context accepts all 24 extensions and the single core liter spelling, without inflating 8000',t=>{
 const f=fixture(t),before=crypto.createHash('sha256').update(JSON.stringify(Data.entries.map(e=>[e.id,e.word]))).digest('hex');
 assert.equal(before,'1397fef3504e90e7f21f3b71d3fcd95fdb46678154962f0feea9e77dacfb4350');
 const context=C.familyVocabularyContext({courseDay:13,records:f.records(),vocabularyData:Data});assert.equal(context.status,'ready',context.reason);assert.equal(context.targets.length,30);
 assert.equal(context.targets.filter(w=>w.lexicalKind==='extension').length,24);const liter=context.targets.find(w=>w.word==='liter');assert.equal(liter.familyCanonicalId,'essential:litre');assert.equal(liter.canonicalWord,'litre');
 const p=E.plan(M.newState(),f.opts());assert.equal(p.newWords.length,30);assert.equal(p.newWords.filter(w=>w.lexicalKind==='extension').length,24);assert.equal(p.quota.dailyTarget,30);assert.equal(p.stats.total,8000);assert.equal(p.stats.started,0);assert.equal(p.stats.initialCompleted,0);
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(Data.entries.map(e=>[e.id,e.word]))).digest('hex'),before);
});
test('unbranded snapshots and arbitrary contextWords cannot manufacture an extension',t=>{
 const f=fixture(t),candidate={word:'kilogram',meaning:'千克',example:'One kilogram of rice.',id:'extension:kilogram'};
 const other=[];assert.equal(C.familyVocabularyContext({courseDay:13,records:other,vocabularyData:Data}).status,'pending');
 let p=E.plan(M.newState(),f.opts({records:other,familyRecords:other,contextWords:[candidate]}));assert.equal(p.newWords.length,0);
 f.disableContext();p=E.plan(M.newState(),f.opts({contextWords:[candidate],courseWords:[candidate]}));assert.equal(p.newWords.length,0);assert.equal(p.todayNewWords.length,0);assert.equal(p.quota.courseReservedToday,0);const forged={word:'liter',id:'extension:liter',familyCanonicalId:'extension:liter',meaning:'升',example:'One liter of water.'};const core=E.plan(M.newState(),f.opts({courseDay:21,contextWords:[forged]}));assert.equal(core.newWords.length,1);assert.equal(core.newWords[0].word,'litre');assert.equal(core.newWords[0].id,'essential:litre');assert.equal(core.newWords[0].familyCanonicalId,undefined);
});
test('real signed extension and spelling variant complete once and count daily while core stays separate',t=>{
 const f=fixture(t),initial=E.plan(M.newState(),f.opts()),words=[initial.newWords.find(w=>w.word==='kilogram'),initial.newWords.find(w=>w.word==='liter')],contextSource=initial.familyContext.contextSource;
 const id='essential-batch-extension-test';let state=E.startBatch(M.newState(),{id,words,courseDay:13,now:BASE,contextSource}),batch=state.essential.batches[id];
 const planned=E.plan(state,f.opts());assert.equal(planned.quota.startedToday,2);assert.equal(planned.stats.started,1);assert.equal(planned.stats.extensionStarted,1);assert.equal(planned.newWords.length,0);
 const saved=training(batch.words,batch),src=JSON.parse(saved.payload.answer),art=JSON.parse(saved.record.answer);src.contextSource=copy(contextSource);art.contextSource=copy(contextSource);saved.payload.answer=JSON.stringify(src);saved.record.answer=JSON.stringify(art);
 state=E.completeBatch(state,id,saved.payload,saved.record);f.setRecords([saved.record]);const p=E.plan(state,f.opts({now:BASE+600001}));assert.equal(p.stats.initialCompleted,1);assert.equal(p.stats.extensionInitialCompleted,1);assert.equal(p.quota.completedToday,2);assert.equal(p.familyUnit.completed,2);assert.equal(p.familyUnit.goalRemaining,28);assert.ok(!p.newWords.some(w=>w.word==='litre'||w.word==='liter'||w.word==='kilogram'));const forms=E.verifiedFormEvidence({records:f.records(),data:Data,memory:state,drafts:[],now:BASE+600001});assert.equal(forms.status,'ready');assert.ok(!forms.potentialBySurface.some(x=>['liter','kilogram'].includes(x.surface.toLowerCase())));
 f.disableContext();const pending=E.plan(state,f.opts({courseDay:21,now:BASE+600001,familyRecords:[],contextWords:[Data.entries.find(w=>w.word==='study')]}));assert.equal(pending.formSafety.familyHistoryPending,true);assert.equal(pending.newWords.length,0);assert.match(pending.quota.reason,/身份待核验/);const future=E.plan(state,f.opts({courseDay:21,now:BASE+4*DAY}));assert.equal(future.stats.initialCompleted,1);assert.equal(future.stats.extensionInitialCompleted,1);assert.ok(future.allDue.some(w=>w.word==='liter'));assert.ok(future.allDue.some(w=>w.word==='kilogram'));const stale=E.plan(state,f.opts({courseDay:21,now:BASE+4*DAY,familyRecords:[]}));assert.ok(stale.allDue.some(w=>w.word==='liter'));assert.ok(stale.allDue.some(w=>w.word==='kilogram'));assert.equal(state.essential.batches[id].words[1].word,'liter');
});
test('open draft remains recoverable when the trusted lexicon is unavailable',t=>{
 const f=fixture(t),p=E.plan(M.newState(),f.opts()),words=[p.newWords.find(w=>w.word==='kilogram'),p.newWords.find(w=>w.word==='liter')],id='essential-batch-extension-draft';let state=E.startBatch(M.newState(),{id,words,courseDay:13,now:BASE,contextSource:p.familyContext.contextSource}),batch=state.essential.batches[id];
 const session=Vocab.createSession({material:{id:batch.materialId,version:'1',vocabulary:batch.words},courseDay:13});const draft=session.getDraft();state=E.saveBatchDraft(state,id,{draft,activeSeconds:0,activityByDate:{}},BASE+1000,{expectedDraft:null});const before=JSON.stringify(state);
 const other=[];const refreshed=E.plan(state,f.opts({records:other,familyRecords:other,now:BASE+2000}));assert.equal(refreshed.activeBatches[0].draft.id,draft.id);assert.equal(refreshed.newWords.length,0);assert.equal(JSON.stringify(state),before);
 assert.throws(()=>E.saveBatchDraft(state,id,{draft},BASE+2000,{expectedDraft:null}),/另一页面/);
});

test('an earlier core litre original excludes the signed US liter variant without rewriting history',t=>{
 const f=fixture(t),entry=Data.entries.find(e=>e.id==='essential:litre'),id='essential-batch-old-litre';let state=E.startBatch(M.newState(),{id,words:[entry],courseDay:2,now:BASE});const batch=state.essential.batches[id],saved=training(batch.words,batch);state=E.completeBatch(state,id,saved.payload,saved.record);f.setRecords([saved.record]);const raw=JSON.stringify(state),plan=E.plan(state,f.opts({now:BASE+600001}));assert.equal(plan.stats.initialCompleted,1);assert.equal(plan.familyUnit.alreadyKnown,1);assert.ok(!plan.newWords.some(word=>['liter','litre'].includes(word.word)));assert.equal(JSON.stringify(state),raw);assert.equal(state.essential.batches[id].words[0].word,'litre');
});

test('concurrent litre and liter drafts cannot be opened twice under either spelling',t=>{
 const f=fixture(t),p=E.plan(M.newState(),f.opts()),american=p.newWords.find(w=>w.word==='liter'),british=Data.entries.find(e=>e.id==='essential:litre');
 const old=E.startBatch(M.newState(),{id:'essential-batch-old-alias',words:[british],courseDay:13,now:BASE});const before=JSON.stringify(old);assert.throws(()=>E.startBatch(old,{id:'essential-batch-new-alias',words:[american],courseDay:13,now:BASE,contextSource:p.familyContext.contextSource}),/另一新词组/);assert.equal(JSON.stringify(old),before);
 const other=E.startBatch(M.newState(),{id:'essential-batch-us-alias',words:[american],courseDay:13,now:BASE,contextSource:p.familyContext.contextSource});assert.throws(()=>E.startBatch(other,{id:'essential-batch-uk-alias',words:[british],courseDay:13,now:BASE}),/另一新词组/);assert.throws(()=>E.startBatch(M.newState(),{id:'essential-batch-double-alias',words:[american,british],courseDay:13,now:BASE}),/不能在一组里重复/);
});


test('a ready lexicon missing a saved family identity retains reviews and blocks extra new starts',t=>{
 const f=fixture(t),p=E.plan(M.newState(),f.opts()),word=p.newWords.find(w=>w.word==='kilogram'),id='essential-batch-missing-signed-word',contextSource=p.familyContext.contextSource;
 let state=E.startBatch(M.newState(),{id,words:[word],courseDay:13,now:BASE,contextSource});const batch=state.essential.batches[id],saved=training(batch.words,batch);
 for(const artifact of [saved.payload,saved.record]){const answer=JSON.parse(artifact.answer);answer.contextSource=copy(contextSource);artifact.answer=JSON.stringify(answer);}
 state=E.completeBatch(state,id,saved.payload,saved.record);f.setRecords([saved.record]);f.disableContext();f.lexicon.splice(f.lexicon.findIndex(entry=>entry.id==='extension:kilogram'),1);
 const before=JSON.stringify(state),result=E.plan(state,f.opts({courseDay:21,now:BASE+4*DAY,contextWords:[Data.entries.find(w=>w.word==='study')]}));
 assert.equal(result.formSafety.familyHistoryPending,true);assert.equal(result.newWords.length,0);assert.ok(result.allDue.some(w=>w.word==='kilogram'));assert.equal(JSON.stringify(state),before);
});

test("an unrelated old unrecognized form does not hide a verified extension from today’s plan",t=>{
 const f=fixture(t),unknown={word:'unindexedfictionalword',meaning:'旧记录',example:'An old example.'},id='essential-batch-unindexed-old';
 const state=E.startBatch(M.newState(),{id,words:[unknown],courseDay:2,now:BASE-DAY}),saved=training(state.essential.batches[id].words,state.essential.batches[id]);f.setRecords([saved.record]);
 const p=E.plan(M.newState(),f.opts({now:BASE+600001}));assert.ok(p.pendingCanonicalWords.some(row=>row.word===unknown.word));assert.ok(p.newWords.some(row=>row.word==='kilogram'));assert.ok(p.todayNewWords.some(row=>row.word==='kilogram'));
});


test('indexed core forms and extension homographs both remain pending without caching draft data',t=>{
 const f=fixture(t),surfaces=['heating',...Array.from({length:200},(_,i)=>`unindexedfictional${i}`)];
 const draft=words=>({id:'synthetic-draft',taskId:'vocabulary',text:JSON.stringify({kind:'vocabulary-practice-draft',wordKeys:words})});
 const options={records:f.records(),data:Data,memory:M.newState(),now:BASE,drafts:[draft(surfaces)]};
 const forms=E.verifiedFormEvidence(options);assert.equal(forms.status,'ready');assert.equal(forms.potentialBySurface.length,surfaces.length);
 const heating=forms.potentialBySurface.find(row=>row.surface==='heating');assert.deepEqual(heating.canonicalIds,['essential:heat','extension:heating']);
 const next=E.verifiedFormEvidence({...options,drafts:[draft(['changedfictional'])]});assert.equal(next.potentialBySurface.length,1);assert.equal(next.potentialBySurface[0].surface,'changedfictional');
 f.lexicon.splice(0,f.lexicon.length);const coreOnly=E.verifiedFormEvidence({...options,drafts:[draft(['heating'])]});assert.deepEqual(coreOnly.potentialBySurface[0].canonicalIds,['essential:heat']);
});
