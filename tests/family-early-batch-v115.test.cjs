'use strict';
// Engineering fixtures only. A locally simulated release review is never an
// approval of the underlying content or a claim about real learner records.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const F=require('./family-lessons-v95-fixture.cjs'),Actual=require('./actual-lessons-fixture.cjs');
const Catalog=require('../tools/family-release-catalog.cjs'),D=require('../assets/curriculum-data.js');
const Essential=require('../assets/essential-vocabulary-data.js');
const Helper=require('../assets/family-lesson-expansion-v95.js');
const {binding}=require('./daily-review-fixture.cjs').helper('family-multibatch-runtime.test.cjs','binding');
const root=path.resolve(__dirname,'..'),copy=F.copy,A=F.A,P=F.P;
// Environment overrides are intended for an isolated inactive-package copy;
// a normal integrated checkout reads its own eventual v115 release.
const earlyRoot=process.env.FAMILY_EARLY_BATCH_ROOT?path.resolve(process.env.FAMILY_EARLY_BATCH_ROOT):root;
const earlyPath=process.env.FAMILY_EARLY_BATCH_PATH||'curriculum/family-lessons-v115/release.json';
const oldReleases=[{root,releasePath:'curriculum/family-lessons-v109/release.json'},
  {root,releasePath:'curriculum/family-lessons-v114/release.json'}];
let cached;
function fixtures(){
 if(cached)return cached;
 const base=require('./published-public-baseline-fixture.cjs')(D);delete base.yearFirstUse;
 const old=copy(base),before=Catalog.append(old,{releases:oldReleases});
 const history=Catalog.history(old.familyLessonRelease);
 const combined=copy(base),appended=Catalog.append(combined,{releases:[...oldReleases,{root:earlyRoot,releasePath:earlyPath}],requiredHistory:history});
 for(const [data,build] of [[old,before],[combined,appended]]){data.yearFirstUse=copy(D.yearFirstUse);data.yearFirstUse.coreHash=build.combinedCoreHash;}
 return cached={base,old,combined,before,appended};
}
function recordState(inputs){
 let state=F.R.newState();for(const input of inputs)state=F.R.put(state,input,'2026-10-24T11:00:00.000Z').state;return state;
}
function originalInputs(data,dayNumber,onlySkill){
 const day=data.days.find(d=>d.day===dayNumber),inputs=[];
 for(const task of day.tasks.filter(t=>t.id!=='reflection'&&(!onlySkill||t.id===onlySkill))){
  for(const id of task.materialIds){const material=data.materials.find(m=>m.id===id),input=Actual.original(dayNumber,task,material,Date.parse('2026-10-20T10:00:00Z'),false);
   delete input.version;delete input.history;inputs.push(input);
  }
 }
 return inputs;
}
function completedPriorEntries(data){
 // Full synthetic answers and recap, not a boolean override of completion.
 const records=recordState(originalInputs(data,1)),ledger=Actual.ledgerFor(records.records);
 return{[F.R.KEY]:JSON.stringify(records),[Actual.M.KEY]:JSON.stringify(ledger)};
}
function bindLegacyInputs(data,inputs){
 for(const input of inputs){
  const day=data.days.find(d=>d.day===input.dayNumber),task=day.tasks.find(t=>t.id===input.taskId),material=data.materials.find(m=>m.id===input.materialId),artifact=JSON.parse(input.answer);
  artifact.materialBinding=P.freezeMaterialBinding(material,{assessment:A,data,task,courseDay:day.day,attemptId:input.id});
  input.answer=JSON.stringify(artifact);assert.equal(P.bindingMatchesMaterial(input,material,A),true);
 }
 return inputs;
}
function legacyArchive(data){
 const inputs=bindLegacyInputs(data,[...originalInputs(data,2,'reading'),...originalInputs(data,3,'reading')]);
 const records=recordState(inputs),ledger=Actual.ledgerFor(records.records),player=P.newState(),adaptive=F.Adaptive.newState();
 for(const n of [2,3]){
  const day=data.days.find(d=>d.day===n),task=day.tasks.find(t=>t.id==='grammar'),material=data.materials.find(m=>m.id===task.materialIds[0]),question=material.questions.find(q=>q.answers?.length),id='legacy-synthetic-draft-'+n;
  assert.ok(question);const answer=question.type==='multi'?question.answers.slice():question.answers[0];
  player.drafts[id]={id,materialId:material.id,taskId:'grammar',courseDay:n,mode:'practice',kind:'original',parentId:null,
   startedAt:'2026-10-21T10:00:00.000Z',activeSeconds:5,activityByDate:{'2026-10-21':5},exposureAtStart:'seen',answers:{[question.id]:answer},userEvidence:{},text:'',transcript:'',audioAvailable:false,audioCompleted:false,transcriptViewed:false,interrupted:false,
   assistance:{hint:false,answer:false,ai:false},media:[],materialBinding:P.freezeMaterialBinding(material,{assessment:A,data,task,courseDay:n,attemptId:id})};
  adaptive.startedDays.push(n);adaptive.frozenDays[n]=copy(day);
 }
 P.parseState(JSON.stringify(player));F.Adaptive.parseState(JSON.stringify(adaptive));
 return{[F.R.KEY]:JSON.stringify(records),[Actual.M.KEY]:JSON.stringify(ledger),[P.KEY]:JSON.stringify(player),[F.Adaptive.KEY]:JSON.stringify(adaptive)};
}
function completedLegacyEntries(data,days=[1,2,3]){
 // Older saved attempts may predate per-material snapshots. Preserve their
 // original artifacts as created by the historical-course fixture.
 const inputs=days.flatMap(day=>originalInputs(data,day)),records=recordState(inputs),ledger=Actual.ledgerFor(records.records),adaptive=F.Adaptive.newState();
 adaptive.startedDays=days.filter(day=>day>=2);for(const day of adaptive.startedDays)adaptive.frozenDays[day]=copy(data.days.find(d=>d.day===day));
 return{[F.R.KEY]:JSON.stringify(records),[Actual.M.KEY]:JSON.stringify(ledger),[F.Adaptive.KEY]:JSON.stringify(adaptive)};
}
async function finishOldRecaps(f,days){
 const rows=await f.R.list(),Clock=f.context.Date,at=Date.parse('2026-10-21T10:00:00.000Z');
 let archive=copy(await f.R.exportState());
 f.context.Date=class HistoricalClock extends Clock{constructor(...args){super(...(args.length?args:[at]));}static now(){return at;}};
 for(const n of days){const data=f.win.IELTSCurriculumData,day=f.win.IELTSAdaptivePlan.getDay(data.days.find(d=>d.day===n)),summary=f.M.forDay(n);
  const ready=f.win.IELTSCoursePlayer.dayReadiness({...data,days:[day]},n,rows,{recordCorrectionStatus:r=>f.M.recordCorrectionStatus(r)});
  assert.equal(ready.ready,true,'a genuine complete synthetic old core is required before its recap');assert.equal(summary.remaining,0);
  if(!summary.completionValid){f.context.__oldRecap=JSON.stringify({token:summary.token,recap:{ok:true,status:'complete',text:'Synthetic previous recap for engineering regression.'}});vm.runInContext('window.IELTSMistakes.finishRecap('+n+',JSON.parse(__oldRecap))',f.context);}
  const completed=f.M.forDay(n);assert.equal(completed.completionValid,true);
  const time=new Date(at).toISOString(),input={id:'synthetic-old-recap-'+n,materialId:'reflection-'+n,title:'Synthetic completed prior recap',skill:'reflection',taskId:'reflection',source:'mistake-review',dayNumber:n,kind:'original',answer:JSON.stringify({schema:1,dayNumber:n,token:completed.token,recap:completed.completion.recap}),minutes:0,activeSeconds:0,elapsedSeconds:0,quantity:1,unit:'份复盘',startedAt:time,submittedAt:time,exposure:'seen',assistance:{hint:false,answer:false,ai:false},media:[],evaluation:{method:'ai',result:'pass',feedback:'Synthetic old recap fixture only.'}};
  archive=F.R.put(archive,input,'2026-10-24T11:00:00.000Z').state;
 }
 f.context.Date=Clock;f.context.__oldArchive=JSON.stringify(archive);await vm.runInContext('window.IELTSRecords.importState(JSON.parse(__oldArchive),{mode:"replace"})',f.context);
 await F.settle();for(const n of days)assert.equal(f.M.forDay(n).completionValid,true,'existing recap must survive archive import');
 const api=f.win.IELTSFamilyLessonExpansionV95.runtime(),records=await api.prepareCourseRecords();f.win.IELTSAdaptivePlan.adoptStarted({records,drafts:f.win.IELTSTodayNavigation.allDrafts()});await f.win.IELTSAdaptivePlan.preparePublicCourse();
}
async function mount(data,entries){
 const day=data.days.find(d=>d.day===2),f=await F.mounted({root:earlyRoot,data,day},{entries,dictionary:true}),win=f.win;
 const fallback=win.fetch;win.fetch=async(url,options)=>{
  if(String(url).startsWith('/audio/')){const relative=String(url).slice(1),local=path.join(earlyRoot,relative),file=fs.existsSync(local)?local:path.join(root,relative),bytes=fs.readFileSync(file);
   return{ok:true,headers:{get:()=>String(bytes.length)},arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}
  return fallback(url,options);
 };
 win.IELTSMediaLibrary={list:async()=>[]};
 for(const name of ['public-course-planner.js','public-course-worker.js','contextual-vocabulary-exposure.js','contextual-vocabulary-course.js','essential-vocabulary-course.js','essential-vocabulary-app.js'])
  vm.runInContext(fs.readFileSync(path.join(root,'assets',name),'utf8'),f.context,{filename:name});
 const api=win.IELTSFamilyLessonExpansionV95.runtime();await api.ensureReady();
 const adaptive=win.IELTSAdaptivePlan.createStore({data:win.IELTSCurriculumData,storage:win.IELTSProfiles.storage(),profileId:'legacy',getProfile:()=>win.IELTSProfiles.current().id,automaticAdjustments:false,
  preparePublicCourse:async request=>{let response;await win.IELTSPublicCourseWorkerProtocol.createHandler({planner:win.IELTSPublicCoursePlanner,postMessage:value=>{response=value;}})(request);return response;}});
 win.IELTSAdaptivePlan={...win.IELTSAdaptivePlan,...adaptive};const records=await api.prepareCourseRecords();
 adaptive.adoptStarted({records,drafts:win.IELTSTodayNavigation.allDrafts()});await adaptive.preparePublicCourse();
 assert.equal(adaptive.verifiedPublicCourseState().ready,true,'test uses real public planner and a synthetic backend capability');
 await win.IELTSTodayNavigation.refreshYearRecords();await F.settle();return f;
}

test('earlier batch appends without changing any installed v109/v114 release, material, unit or attempt binding',()=>{
 const {old,combined,appended}=fixtures(),legacy=old.familyLessonRelease,newer=combined.familyLessonRelease;
 assert.deepEqual(legacy.units.map(u=>u.day),Array.from({length:17},(_,i)=>i+4));
 assert.deepEqual(newer.units.map(u=>u.day),[...legacy.units.map(u=>u.day),2,3]);
 assert.deepEqual(Catalog.history(newer).slice(0,2),Catalog.history(legacy));
 assert.equal(JSON.stringify(newer.batches.slice(0,2)),JSON.stringify(legacy.batches));
 assert.equal(JSON.stringify(newer.units.slice(0,17)),JSON.stringify(legacy.units));
 assert.equal(JSON.stringify(combined.materials.slice(0,old.materials.length)),JSON.stringify(old.materials));
 assert.equal(JSON.stringify(combined.days),JSON.stringify(old.days));
 assert.equal(JSON.stringify(combined.publicCoursePlan),JSON.stringify(old.publicCoursePlan));
 assert.deepEqual(newer.publicAppendReceipt,legacy.publicAppendReceipt);
 assert.equal(appended.catalog.counts.days,19);assert.equal(appended.catalog.counts.newWords,570);
 const installedUnits=D.familyLessonRelease.units.filter(u=>u.day>=4&&u.day<=20);
 assert.equal(JSON.stringify(installedUnits),JSON.stringify(legacy.units));
 assert.equal(JSON.stringify(D.familyLessonRelease.batches.slice(0,2)),JSON.stringify(legacy.batches));
 assert.equal(JSON.stringify(D.materials.slice(0,old.materials.length)),JSON.stringify(old.materials));
 for(const release of oldReleases){const bytes=fs.readFileSync(path.join(release.root,release.releasePath)),id=JSON.parse(bytes).id;
  assert.equal(F.sha(bytes),legacy.batches.find(b=>b.id===id).releaseSha256);}
 for(const unit of legacy.units){
  const oldBinding=binding(unit,old);
  assert.deepEqual(Helper.cleanVocabularyBinding(oldBinding,{currentRelease:true,data:combined,assessment:A}),
    Helper.cleanVocabularyBinding(oldBinding,{currentRelease:true,data:old,assessment:A}));
  for(const task of unit.tasks)for(const ref of task.materialRefs){
   const m0=old.materials.find(m=>m.id===ref.materialId),m1=combined.materials.find(m=>m.id===ref.materialId);
   assert.equal(JSON.stringify(m1),JSON.stringify(m0));assert.equal(A.materialContentHash(m1),ref.contentHash);
   const opts={assessment:A,task:{id:task.id,mode:'practice',instructions:task.instructions||'Ordinary reviewed practice'}};
   assert.equal(JSON.stringify(P.freezeMaterialBinding(m1,{...opts,data:combined})),JSON.stringify(P.freezeMaterialBinding(m0,{...opts,data:old})));
  }
 }
});

test('both newly appended ordinary units bind 30 distinct targets in five groups of six and all six modules',()=>{
 const {old,combined}=fixtures(),oldTargets=new Set(old.familyLessonRelease.units.flatMap(u=>u.targets.map(t=>t.canonicalId))),newTargets=new Set();
 const byId=new Map(combined.materials.map(m=>[m.id,m]));
 for(const day of [2,3]){
  const u=combined.familyLessonRelease.units.find(unit=>unit.day===day),tasks=new Map(u.tasks.map(t=>[t.id,t]));
  assert.deepEqual([...tasks.keys()].sort(),F.skills.slice().sort());assert.equal(u.targets.length,30);
  assert.equal(tasks.get('vocabulary').materialRefs.length,5);
  const words=tasks.get('vocabulary').materialRefs.flatMap(ref=>{const m=byId.get(ref.materialId);assert.equal(m.vocabulary.length,6);return m.vocabulary;});
  assert.equal(words.length,30);assert.equal(new Set(words.map(w=>w.word.toLowerCase())).size,30);
  const estimate=task=>tasks.get(task).materialRefs.reduce((sum,ref)=>sum+byId.get(ref.materialId).estimatedMinutes,0);
  assert.equal(estimate('vocabulary'),90);assert.equal(['grammar','listening','reading','speaking','writing'].reduce((sum,skill)=>sum+estimate(skill),0),300);
  for(const target of u.targets){
   assert.ok(!oldTargets.has(target.canonicalId));assert.ok(!newTargets.has(target.canonicalId));newTargets.add(target.canonicalId);
   const material=byId.get(target.sourceMaterialId),text=material.skill==='listening'?material.transcript:material.passage;
   assert.equal(A.sourceTextHash(text),target.sourceTextSha256);assert.equal(text.slice(target.start,target.end),target.surface);
   assert.equal(text.slice(target.quoteStart,target.quoteEnd),target.quote);
   const identity=Helper.createLexemeResolver(Essential.entries)(target),word=words.find(w=>w.word===identity.word);
   assert.ok(word,target.canonicalId);assert.equal(word.example,target.quote);assert.equal(word.meaning,target.meaning);assert.equal(word.pos,target.partOfSpeech);
   const bytes=fs.readFileSync(path.join(earlyRoot,target.audioRef.src));assert.equal(bytes.length,target.audioRef.bytes);assert.equal(F.sha(bytes),target.audioRef.sha256);
  }
 }
 assert.equal(newTargets.size,60);
});

test('unstarted day 2 exposes its 30 verified targets while day 3 cannot bypass the unfinished prior course',async()=>{
 const {combined}=fixtures(),f=await mount(combined,completedPriorEntries(combined)),win=f.win,api=win.IELTSFamilyLessonExpansionV95.runtime();
 const two=await api.prepareVocabularyUnit({courseDay:2}),ctx=api.readVocabularyContext({courseDay:2,records:two.records,drafts:[]});
 assert.equal(two.status,'ready');assert.equal(ctx.status,'ready',ctx.reason);assert.equal(ctx.targets.length,30);
 const plan=win.IELTSEssentialVocabulary.plan(win.IELTSMemory.newState(),{data:Essential,courseDay:2,records:two.records,familyRecords:two.records,familyDrafts:[],now:f.context.Date.now(),remainingMinutes:360,vocabularyMinutes:180,newWordMinutes:.5});
 assert.equal(plan.newWords.length,30);assert.equal(new Set(plan.newWords.map(w=>w.familyCanonicalId)).size,30);
 const three=await api.prepareVocabularyUnit({courseDay:3});assert.equal(three.status,'ready');
 const blocked=api.readVocabularyContext({courseDay:3,records:three.records,drafts:[]});
 assert.equal(blocked.status,'pending');assert.equal(blocked.reason,'family-earlier-course-pending');
 const nav=win.IELTSTodayNavigation,queue=win.IELTSDailyLearningLoad.build({...nav.yearContext(),currentDay:3,selectedDay:3});
 assert.equal(queue.courseDay,2);assert.equal(queue.entries.some(e=>e.day===3&&e.familyVocabularyContinuation),false);
 assert.equal((await f.R.list()).filter(r=>r.dayNumber===2||r.dayNumber===3).length,0);
});

test('original day 2/3 answers, completed reading tasks, frozen days and drafts survive the append and restore',async()=>{
 const {old,combined}=fixtures(),entries=legacyArchive(old),before=await mount(old,entries),after=await mount(combined,entries);
 const oldRecords=await before.R.list(),newRecords=await after.R.list();assert.equal(JSON.stringify(newRecords),JSON.stringify(oldRecords));
 const oldDrafts=before.win.IELTSTodayNavigation.allDrafts(),newDrafts=after.win.IELTSTodayNavigation.allDrafts();
 assert.equal(JSON.stringify(newDrafts),JSON.stringify(oldDrafts));assert.equal(newDrafts.length,2);
 for(const n of [2,3]){
  const oldData=before.win.IELTSCurriculumData,newData=after.win.IELTSCurriculumData;
  const oldDay=before.win.IELTSAdaptivePlan.getDay(oldData.days.find(d=>d.day===n)),newDay=after.win.IELTSAdaptivePlan.getDay(newData.days.find(d=>d.day===n));
  const draft=oldDrafts.find(d=>d.courseDay===n);
  assert.equal(JSON.stringify(after.win.IELTSAdaptivePlan.read().frozenDays[n]),JSON.stringify(before.win.IELTSAdaptivePlan.read().frozenDays[n]));
  if(JSON.stringify(newDay)!==JSON.stringify(oldDay)){
   // The old grammar view can omit a still-existing original draft. The
   // family guard deliberately restores the exact frozen day in that case.
   const flow=before.win.IELTSCourseExpansion;
   assert.equal(flow.validFamilyGrammarProjection(oldDay,oldData,{assessment:before.win.IELTSAssessment}),true);
   assert.equal(JSON.stringify(flow.restoreFamilyGrammarBase(oldDay)),JSON.stringify(newDay));
   assert.equal(oldDay.tasks.find(t=>t.id==='grammar').materialIds.includes(draft.materialId),false);
   assert.equal(newDay.tasks.find(t=>t.id==='grammar').materialIds.includes(draft.materialId),true);
  }
  const readiness=(f,data,rows,day)=>f.win.IELTSCoursePlayer.dayReadiness({...data,days:[day]},n,rows,{recordCorrectionStatus:r=>f.M.recordCorrectionStatus(r)});
  const a=readiness(before,oldData,oldRecords,oldDay),b=readiness(after,newData,newRecords,newDay);
  const oldReading=a.states.find(s=>s.taskId==='reading'),newReading=b.states.find(s=>s.taskId==='reading');
  assert.equal(oldReading.done,true);assert.equal(JSON.stringify(newReading),JSON.stringify(oldReading));
  const saved=oldRecords.find(r=>r.dayNumber===n&&r.taskId==='reading'),nav=after.win.IELTSTodayNavigation;
  nav.showDay(n);await nav.showLatestRecord('reading',saved.materialId);assert.match(after.nodes.get('courseSubmitStatus').textContent,/只读查看/);
  assert.equal(JSON.stringify((await after.R.list()).find(r=>r.id===saved.id)),JSON.stringify(saved));
  await nav.resumeDraft(draft.id);assert.equal(JSON.stringify(nav.allDrafts().find(d=>d.id===draft.id)),JSON.stringify(draft));
 }
 assert.equal(JSON.stringify(await after.R.list()),JSON.stringify(oldRecords));
});

test('fully completed original days 2 and 3 remain complete without inventing family-word submissions',async()=>{
 const {old,combined}=fixtures(),entries=completedLegacyEntries(old),before=await mount(old,entries);await finishOldRecaps(before,[1,2,3]);
 const after=await mount(combined,await before.entries());
 const original=await before.R.list(),current=await after.R.list();assert.equal(JSON.stringify(current),JSON.stringify(original));
 for(const n of [2,3]){
  const evaluate=async(f,rows)=>{
   const data=f.win.IELTSCurriculumData,day=f.win.IELTSAdaptivePlan.getDay(data.days.find(d=>d.day===n)),summary=f.M.forDay(n);
   const ready=f.win.IELTSCoursePlayer.dayReadiness({...data,days:[day]},n,rows,{recordCorrectionStatus:r=>f.M.recordCorrectionStatus(r)});
   const queue=f.win.IELTSDailyLearningLoad.build({...f.win.IELTSTodayNavigation.yearContext(),currentDay:n,selectedDay:undefined});
   return{day,summary,ready,complete:queue.currentComplete};
  };
  const a=await evaluate(before,original),b=await evaluate(after,current);
  assert.equal(a.ready.ready,true,'the full synthetic original work must actually satisfy its old core');
  assert.equal(a.summary.completionValid,true,JSON.stringify({day:n,total:a.summary.total,remaining:a.summary.remaining,pending:a.summary.pending,token:a.summary.token,completion:a.summary.completion}));
  assert.equal(JSON.stringify(b.day),JSON.stringify(a.day));assert.equal(JSON.stringify(b.ready),JSON.stringify(a.ready));
  assert.equal(b.summary.completionValid,a.summary.completionValid);assert.equal(a.complete,true,'the old saved course must actually be complete');assert.equal(b.complete,true);
  const api=after.win.IELTSFamilyLessonExpansionV95.runtime(),prepared=await api.prepareVocabularyUnit({courseDay:n}),progress=api.vocabularyUnitProgress(n,prepared.records,[]);
  assert.equal(progress.status,'ready',JSON.stringify(progress));assert.equal(progress.submitted,0);assert.ok(progress.remaining>0);
 }
});

test('unstarted day 3 can read its own 30 targets after the previous original course is actually complete',async()=>{
 const {old,combined}=fixtures(),before=await mount(old,completedLegacyEntries(old,[1,2]));await finishOldRecaps(before,[1,2]);
 const after=await mount(combined,await before.entries()),api=after.win.IELTSFamilyLessonExpansionV95.runtime(),prepared=await api.prepareVocabularyUnit({courseDay:3});
 assert.equal((await after.R.list()).some(r=>r.dayNumber===3),false);
 const context=api.readVocabularyContext({courseDay:3,records:prepared.records,drafts:[]});assert.equal(context.status,'ready',context.reason);assert.equal(context.targets.length,30);
 const progress=api.vocabularyUnitProgress(3,prepared.records,[]);assert.equal(progress.status,'ready',JSON.stringify(progress));assert.equal(progress.submitted,0);assert.ok(progress.remaining>0);
});

test('one word genuinely trained in earlier synthetic history is deduplicated without awarding 30 new words',async()=>{
 const {combined}=fixtures(),f=await mount(combined,completedPriorEntries(combined)),win=f.win,api=win.IELTSFamilyLessonExpansionV95.runtime();
 const target=combined.familyLessonRelease.units.find(u=>u.day===2).targets[0],word=Essential.entries.find(e=>e.id===target.canonicalId);assert.ok(word);
 const E=win.IELTSEssentialVocabulary,M=win.IELTSMemory,V=win.IELTSVocabularyPractice,Clock=f.context.Date,now=Clock.now()-3*86400000,id='essential-batch-prior-early-test';
 f.context.Date=class EarlierClock extends Clock{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
 let state=E.startBatch(M.newState(),{id,words:[word],courseDay:4,now}),batch=state.essential.batches[id];
 const session=V.createSession({material:{id:batch.materialId,version:'1',vocabulary:batch.words},courseDay:4});
 session.words.forEach((item,i)=>{for(let n=0;n<3;n++)session.recordSpelling(i,item.word);for(let n=0;n<3;n++){
  const hash=String(n+1).padStart(64,'0'),workId='work-'+hash.slice(-40);session.registerStudyWork(i,workId);
  // Provider label is required by the artifact codec; no external call is made.
  session.recordSpeaking(i,{workId,hash,evidenceId:hash,provider:'Alibaba oral assessment',verified:true,nonSilent:true,reference:item.word,recordedAt:new Date(now).toISOString(),durationSeconds:1,result:{accuracy:90,fluency:90,completeness:95}});
 }});
 session.begin();for(let round=0;round<3;round++){session.words.forEach((item,i)=>{session.setAnswer(i,item.word);if(round===2)session.markPlayed(i,{kind:'local-audio',started:true,completed:true,completedAt:new Date(now).toISOString()});});session.submitRound();session.next();}
 const payload=session.getSubmission();state=E.saveBatchDraft(state,id,{draft:session.getDraft(),activeSeconds:0,activityByDate:{}},now,{expectedDraft:null});
 const store=M.createStore(win.IELTSProfiles.storage());store.read();store.save(state);batch=M.read().essential.batches[id];
 const input=win.IELTSEssentialVocabularyApp.recordForBatch(batch,payload,{now}),saved=await f.R.record(input);
 state=E.completeBatch(state,id,payload,saved.record);store.save(state);f.context.Date=Clock;
 const prepared=await api.prepareVocabularyUnit({courseDay:2});win.IELTSAdaptivePlan.adoptStarted({records:prepared.records,drafts:win.IELTSTodayNavigation.allDrafts()});await win.IELTSAdaptivePlan.preparePublicCourse();
 const progress=api.vocabularyUnitProgress(2,prepared.records,[]);assert.equal(progress.status,'ready',JSON.stringify(progress));
 assert.equal(progress.previouslyLearned,1);assert.equal(progress.submitted,0);assert.equal(progress.remaining,29);
 const plan=E.plan(state,{data:Essential,courseDay:2,records:prepared.records,familyRecords:prepared.records,familyDrafts:[],now:f.context.Date.now(),remainingMinutes:360,vocabularyMinutes:180,newWordMinutes:.5});
 assert.equal(plan.familyUnit.completed,0);assert.equal(plan.familyUnit.alreadyKnown,1);assert.equal(plan.familyUnit.sourceGap,1);
 assert.equal(plan.quota.completedToday,0);assert.equal(plan.newWords.some(w=>w.familyCanonicalId===target.canonicalId),false);
 assert.equal(JSON.stringify((await f.R.list()).find(r=>r.id===saved.record.id)),JSON.stringify(saved.record));
});

test('due review stays ahead of the early unit and real exhausted or insufficient budget preserves debts and originals',async()=>{
 const {combined}=fixtures(),f=await mount(combined,completedPriorEntries(combined)),win=f.win,nav=win.IELTSTodayNavigation,M=win.IELTSMemory,E=win.IELTSEssentialVocabulary;
 const api=win.IELTSFamilyLessonExpansionV95.runtime(),prepared=await api.prepareVocabularyUnit({courseDay:2});
 assert.equal(api.readVocabularyContext({courseDay:2,records:prepared.records,drafts:[]}).status,'ready');
 const available=nav.learningQueue().entries.find(e=>e.familyVocabularyContinuation&&e.kind==='essential-vocabulary');assert.ok(available);
 const dueWord=Essential.entries.find(w=>w.word==='student');assert.ok(dueWord);
 const now=f.context.Date.now(),memory=M.captureTraining(M.read(),{attempts:[{id:'synthetic-earlier-training',word:dueWord.word,meaning:dueWord.meaning,mode:'meaning',submittedAt:new Date(now-4*86400000).toISOString(),correct:true}]});
 win.localStorage.setItem(M.KEY,JSON.stringify(memory));const oldMemory=JSON.stringify(M.read()),oldRows=JSON.stringify(await f.R.list());
 const review=E.plan(M.read(),{data:Essential,records:prepared.records,courseDay:2,now,remainingMinutes:360});assert.ok(review.allDue.length>0||review.reviewDebt.required);
 const dueQueue=nav.learningQueue();assert.equal(dueQueue.next.dueReview,true);assert.equal(dueQueue.currentComplete,false);
 const href=win.location.href;assert.equal(await nav.openQueued(available),false);assert.equal(win.location.href,href);
 assert.equal(JSON.stringify(M.read()),oldMemory);assert.equal(JSON.stringify(await f.R.list()),oldRows);
 // Record real elapsed time using the standard memory-recall input codec. The
 // answer and long duration are synthetic, not a claimed learner activity.
 const S=require('../assets/memory-session.js'),word=Essential.entries.find(w=>w.word!=='student'),item={...word,skill:'spelling'},seconds=359.9*60;
 const draft=S.makeDraft(item,{id:'synthetic-budget-spent',courseDay:2,now:now-seconds*1000});draft.answer=item.word;draft.activeSeconds=seconds;draft.activityByDate={[win.IELTSYearPlanner.dateKey(now)]:seconds};
 const spent=S.recordFor(draft,item,{correct:true},{now});f.context.__spent=JSON.stringify(spent);await vm.runInContext('window.IELTSRecords.record(JSON.parse(__spent))',f.context);
 await F.settle();await nav.refreshYearRecords();await F.settle();const remaining=nav.budget();assert.equal(remaining.budgetMinutes,360);assert.ok(remaining.remainingMinutes>0&&remaining.remainingMinutes<1,JSON.stringify(remaining));
 const low=nav.learningQueue(),due=low.entries.find(e=>e.dueReview);assert.ok(due);assert.equal(due.fitsBudget,false);assert.equal(low.next.kind,'rest');
 assert.equal(await nav.openQueued(available),false);assert.equal(win.location.href,href);assert.equal(JSON.stringify(M.read()),oldMemory);
 const beforeFinish=JSON.stringify(await f.R.list());f.advance(7000);const end=f.context.Date.now(),small=S.makeDraft(item,{id:'synthetic-budget-last',courseDay:2,now:end-7000});
 small.answer=item.word;small.activeSeconds=7;small.activityByDate={[win.IELTSYearPlanner.dateKey(end)]:7};const input=S.recordFor(small,item,{correct:true},{now:end});
 f.context.__finish=JSON.stringify(input);await vm.runInContext('window.IELTSRecords.record(JSON.parse(__finish))',f.context);await F.settle();await nav.refreshYearRecords();await F.settle();
 const exhausted=nav.budget();assert.equal(exhausted.exhausted,true);assert.equal(nav.learningQueue().next.kind,'budget');assert.equal(await nav.openQueued(available),false);
 const finalRows=await f.R.list();for(const prior of JSON.parse(beforeFinish))assert.equal(JSON.stringify(finalRows.find(r=>r.id===prior.id)),JSON.stringify(prior));
 assert.equal(JSON.stringify(M.read()),oldMemory);assert.equal(nav.learningQueue().currentComplete,false);
});
