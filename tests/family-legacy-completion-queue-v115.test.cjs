'use strict';
// Synthetic learning histories, test-only speech scores and capability. No
// learner account, external service or real audio evaluation is used here.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const F=require('./family-lessons-v95-fixture.cjs'),Actual=require('./actual-lessons-fixture.cjs'),D=require('../assets/curriculum-data.js');
const X=require('../assets/course-expansion.js'),Adaptive=require('../assets/adaptive-plan.js'),Plan=require('../assets/daily-plan-state.js'),Essential=require('../assets/essential-vocabulary-data.js');
const root=path.resolve(__dirname,'..');
function history({missing=false,wrong=false}={}){
 const adaptive=Adaptive.newState(),records=[];
 for(let day=1;day<=3;day++){
  const d=X.overlay(Actual.D.days[day-1],Actual.D),at=Date.parse('2026-10-24T08:00:00Z')+(day-1)*86400000;adaptive.startedDays.push(day);adaptive.frozenDays[day]=d;
  for(const task of d.tasks.filter(t=>t.id!=='reflection'))for(const id of task.materialIds){
   const m=Actual.D.materials.find(m=>m.id===id),r=Actual.original(day,task,m,at,false),a=JSON.parse(r.answer);
   a.materialBinding=Actual.P.freezeMaterialBinding(m,{data:Actual.D,task,courseDay:day,attemptId:r.id});r.answer=JSON.stringify(a);delete r.version;delete r.history;records.push(r);
  }
 }
 // Keep the original valid ledger to exercise stale-recap safety as well as
 // ordinary completion. Errors are not erased or replaced by a fake pass.
 const ledger=Actual.ledgerFor(records);
 if(missing){const i=records.findIndex(r=>r.dayNumber===2&&r.materialId==='w01-read-2');assert.ok(i>=0);records.splice(i,1);}
 if(wrong){
  const r=records.find(r=>r.dayNumber===2&&r.materialId==='w01-read-2'),m=Actual.D.materials.find(m=>m.id===r.materialId),q=m.questions.find(q=>q.type==='single'&&q.options.some(v=>!q.answers.includes(v)));
  assert.ok(q);const a=JSON.parse(r.answer);a.answers[q.id]=q.options.find(v=>!q.answers.includes(v));r.answer=JSON.stringify(a);
  r.evaluation={method:'objective',result:'revise',score:0,maxScore:m.questions.length,threshold:.8,feedback:'Synthetic incorrect answer.'};
  assert.ok(Actual.A.gradeMaterialForArtifact(m,a).correct<m.questions.length);
 }
 let state=F.R.newState();for(const r of records)state=F.R.put(state,r,r.submittedAt).state;
 return{records,entries:{[F.R.KEY]:JSON.stringify(state),[Actual.M.KEY]:JSON.stringify(ledger),[Adaptive.KEY]:JSON.stringify(adaptive),'ielts52-daily-plan-v1':JSON.stringify(Plan.newState('2026-10-25'))}};
}
async function mount(options={}){
 const saved=history(options),f=await F.mounted({root,data:D,day:D.days[3]},{entries:saved.entries,dictionary:true,now:Date.parse('2026-10-28T08:00:00Z')});
 for(const name of ['public-course-planner.js','public-material-selector.js','public-context-data.js','contextual-vocabulary-exposure.js','contextual-vocabulary-course.js','essential-vocabulary-course.js'])vm.runInContext(fs.readFileSync(path.join(root,'assets',name),'utf8'),f.context,{filename:name});
 const fallback=f.win.fetch;f.win.fetch=async(url,options)=>{
  if(String(url).startsWith('/audio/')){const bytes=fs.readFileSync(path.join(root,String(url).slice(1)));return{ok:true,headers:{get:()=>String(bytes.length)},arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}
  return fallback(url,options);
 };
 f.win.IELTSMediaLibrary={list:async()=>[]};const nav=f.win.IELTSTodayNavigation;nav.showDay(4);await nav.refreshYearRecords();await F.settle();return{f,nav,saved};
}
test('old completed days do not force unstarted newly added units before the current course',async()=>{
 const {f,nav}=await mount(),api=f.win.IELTSFamilyLessonExpansionV95.runtime(),before=JSON.stringify(await f.R.list()),memory=JSON.stringify(f.win.IELTSMemory.read());
 for(const n of [1,2,3])assert.equal(f.M.forDay(n).completionValid,true,'a genuinely valid old recap is required');
 const queue=nav.learningQueue();assert.equal(queue.courseDay,4);assert.equal(queue.next.familyVocabularyContinuation,true);assert.equal(queue.next.day,4);
 assert.equal(queue.entries.some(e=>e.familyVocabularyContinuation&&[2,3].includes(e.day)),false);
 assert.equal(await nav.showTask('vocabulary'),true);assert.equal(f.win.location.href,'词汇记忆.html?day=4');
 for(const n of [2,3]){const p=await api.prepareVocabularyUnit({courseDay:n}),progress=api.vocabularyUnitProgress(n,p.records,[]);assert.equal(progress.status,'ready',JSON.stringify(progress));assert.equal(progress.submitted,0);assert.ok(progress.remaining>0);}
 assert.equal(JSON.stringify(await f.R.list()),before);assert.equal(JSON.stringify(f.win.IELTSMemory.read()),memory);
});
test('explicitly revisiting the old completed day still offers its unlearned family unit',async()=>{
 const {f,nav}=await mount();nav.showDay(2);await F.settle();
 const queue=nav.learningQueue(),entry=queue.entries.find(e=>e.familyVocabularyContinuation&&e.day===2);assert.ok(entry);assert.equal(queue.next.id,entry.id);
 assert.equal(await nav.showTask('vocabulary'),true);assert.equal(f.win.location.href,'词汇记忆.html?day=2');
});
test('a family group draft only in Memory remains started and keeps the previous queue priority',async()=>{
 const {f,nav}=await mount(),win=f.win,api=win.IELTSFamilyLessonExpansionV95.runtime();nav.showDay(2);await F.settle();
 const p=await api.prepareVocabularyUnit({courseDay:2}),context=api.readVocabularyContext({courseDay:2,records:p.records,drafts:[]});assert.equal(context.status,'ready',context.reason);
 const M=win.IELTSMemory,E=win.IELTSEssentialVocabulary,V=win.IELTSVocabularyPractice,id='essential-batch-memory-only-early',now=f.context.Date.now();
 let state=E.startBatch(M.read(),{id,words:context.targets.slice(0,6),courseDay:2,now,contextSource:{type:'family-lesson-v95-context',binding:context.binding}}),batch=state.essential.batches[id];
 const session=V.createSession({material:{id:batch.materialId,version:'1',vocabulary:batch.words},courseDay:2});
 state=E.saveBatchDraft(state,id,{draft:session.getDraft(),activeSeconds:0,activityByDate:{}},now,{expectedDraft:null});const store=M.createStore(win.IELTSProfiles.storage());store.read();store.save(state);
 assert.ok(M.read().essential.batches[id].draft);
 const playerRaw=win.localStorage.getItem(F.P.KEY),player=playerRaw?F.P.parseState(playerRaw):F.P.newState();
 assert.equal(Object.values(player.drafts).some(d=>d.materialId===batch.materialId),false);
 assert.equal((await f.R.list()).some(r=>r.materialId===batch.materialId),false);
 const prior=JSON.stringify(M.read()),records=JSON.stringify(await f.R.list());nav.showDay(4);await F.settle();
 const queue=nav.learningQueue();assert.equal(queue.courseDay,4);assert.equal(queue.next.familyVocabularyContinuation,true);assert.equal(queue.next.day,2);
 assert.equal(JSON.stringify(M.read()),prior);assert.equal(JSON.stringify(await f.R.list()),records);
});
test('an incomplete earlier original and a genuine uncorrected error cannot be bypassed',async()=>{
 for(const mode of ['missing','wrong']){
  const {f,nav}=await mount({[mode]:true}),before=JSON.stringify(await f.R.list()),q=nav.learningQueue();
  assert.equal(q.courseDay,2,mode);assert.ok(q.next&&q.next.day===2,mode);assert.equal(q.entries.some(e=>e.familyVocabularyContinuation&&e.day===4&&e.kind==='essential-vocabulary'),false,mode);
  assert.equal(JSON.stringify(await f.R.list()),before);
 }
});
test('a genuinely due review remains mandatory ahead of the current family unit',async()=>{
 const {f,nav}=await mount(),win=f.win,M=win.IELTSMemory,E=win.IELTSEssentialVocabulary,word=Essential.entries.find(w=>w.word==='student'),now=f.context.Date.now();
 const state=M.captureTraining(M.read(),{attempts:[{id:'synthetic-prior-training',word:word.word,meaning:word.meaning,mode:'meaning',submittedAt:new Date(now-4*86400000).toISOString(),correct:true}]});
 win.localStorage.setItem(M.KEY,JSON.stringify(state));const before=JSON.stringify(M.read()),records=JSON.stringify(await f.R.list()),plan=E.plan(M.read(),{data:Essential,records:await f.R.list(),courseDay:4,now,remainingMinutes:360});
 assert.ok(plan.allDue.length>0||plan.reviewDebt.required);const queue=nav.learningQueue();assert.equal(queue.next.dueReview,true);assert.notEqual(queue.next.id,queue.entries.find(e=>e.familyVocabularyContinuation&&e.day===4)?.id);
 assert.equal(JSON.stringify(M.read()),before);assert.equal(JSON.stringify(await f.R.list()),records);
});
