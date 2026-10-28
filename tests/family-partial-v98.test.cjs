'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const F=require('./family-lessons-v95-fixture.cjs'),Actual=require('./actual-lessons-fixture.cjs');

async function partialFixture({wrong=false}={}){
  const p=F.packageData();
  const vocab=p.data.materials.find(m=>m.id==='base-vocabulary');
  vocab.vocabulary=[{word:'pen',meaning:'synthetic pen',ipa:'/pen/',audio:'audio/synthetic.wav',example:'This is a pen.'}];
  const f=await F.mounted(p,{protectedDay:true,dictionary:true});
  const task=p.day.tasks.find(t=>t.id==='vocabulary');
  const input=Actual.original(2,task,vocab,Date.parse('2026-10-24T10:00:00Z'),false);
  const binding=f.win.IELTSCoursePlayer.freezeMaterialBinding(f.win.IELTSCurriculumData.materials.find(m=>m.id===vocab.id),{assessment:f.win.IELTSAssessment,data:f.win.IELTSCurriculumData,task,courseDay:2,attemptId:input.id});
  const session=f.win.IELTSVocabularyPractice.createSession({material:binding.material,courseDay:2});
  const word=session.words[0].word;for(let i=0;i<3;i++)session.recordSpelling(0,word);
  for(let i=0;i<3;i++)session.recordSpeaking(0,{workId:'work-synthetic-'+i+'123456789',reference:word,hash:String(i+1).repeat(64),evidenceId:'synthetic-evidence-'+i,provider:'Alibaba oral assessment',verified:true,nonSilent:true,durationSeconds:1,recordedAt:'2026-10-24T10:00:00Z',result:{accuracy:90,fluency:90,completeness:95}});
  session.begin();for(let i=0;i<3;i++){if(i===2)session.markPlayed(0,{kind:'local-audio',started:true,completed:true,completedAt:'2026-10-24T10:00:00Z'});session.setAnswer(0,wrong&&i===0?'incorrect':word);session.submitRound();session.next();}
  const payload=session.getSubmission(),artifact={...JSON.parse(input.answer),...JSON.parse(payload.answer),schema:1,trainingSchema:2,materialBinding:binding,materialVersion:'1',gradingPolicy:binding.gradingPolicy};input.answer=JSON.stringify(artifact);input.evaluation=payload.evaluation;
  delete input.version;delete input.history;
  f.context.__partial=JSON.stringify(input);
  await vm.runInContext('window.IELTSRecords.record(JSON.parse(__partial))',f.context);
  if(wrong){const saved=(await f.R.list()).find(r=>r.id===input.id);f.M.captureRecord(saved,{materials:f.win.IELTSCurriculumData.materials});}
  await f.win.IELTSTodayNavigation.refreshYearRecords();
  await F.settle();
  return f;
}
async function partialWithFamilyVocabulary(){
  const original=await partialFixture(),api=original.win.IELTSFamilyLessonExpansionV95.runtime(),prepared=await api.prepareVocabularyUnit({courseDay:2}),proof=api.readVocabularyContext({courseDay:2,records:prepared.records,drafts:[]});assert.equal(proof.status,'ready');
  return F.mounted(original.pack,{entries:await original.entries(),dictionary:true,completeFamilyPrerequisites:true,vocabularyOnly:true,seedBinding:proof.binding});
}

test('started day with complete old vocabulary can offer the reviewed family vocabulary without completing the old day',async()=>{
  const f=await partialFixture(),nav=f.win.IELTSTodayNavigation,api=f.win.IELTSFamilyLessonExpansionV95.runtime();
  const rows=await api.prepareCourseRecords(),data=f.win.IELTSCurriculumData,day=f.win.IELTSAdaptivePlan.getDay(data.days[0]);
  const before=JSON.stringify({record:await f.R.list(),frozen:f.win.IELTSAdaptivePlan.read().frozenDays[2]});
  const readiness=f.win.IELTSCoursePlayer.dayReadiness(data,2,rows,{recordCorrectionStatus:r=>f.M.recordCorrectionStatus(r)});
  assert.equal(readiness.states.find(s=>s.taskId==='vocabulary').done,true);
  assert.equal(readiness.ready,false);
  const result=api.planDay(day,data,{contextReady:true,records:rows,drafts:nav.allDrafts()});
  const queue=nav.learningQueue();
  const record=rows.find(r=>r.materialId==='base-vocabulary'),material=data.materials.find(m=>m.id==='base-vocabulary'),artifact=f.win.IELTSAssessment.decodeArtifact(record);
  assert.ok(queue.entries.some(e=>e.familyVocabularyContinuation),JSON.stringify({mode:result.mode,reason:result.reason,training:f.win.IELTSVocabularyPractice.verifyTrainingArtifact(artifact,material),binding:f.win.IELTSCoursePlayer.bindingMatchesMaterial(record,material,f.win.IELTSAssessment),resolved:f.win.IELTSAssessment.resolveArtifactMaterial(material,artifact,record),result:record.evaluation,items:f.M.store().read().items}));
  assert.equal(JSON.stringify({record:await f.R.list(),frozen:f.win.IELTSAdaptivePlan.read().frozenDays[2]}),before);
});

test('an incomplete old vocabulary cannot start a new group, including a direct source request',async()=>{
  const p=F.packageData(),f=await F.mounted(p,{protectedDay:true,dictionary:true}),nav=f.win.IELTSTodayNavigation,api=f.win.IELTSFamilyLessonExpansionV95.runtime();
  const prepared=await api.prepareVocabularyUnit({courseDay:2}),context=api.readVocabularyContext({courseDay:2,records:prepared.records,drafts:nav.allDrafts()});
  assert.equal(context.status,'pending');assert.equal(context.reason,'original-vocabulary-before-new-family-group');
  const queue=nav.learningQueue();assert.equal(queue.entries.some(e=>e.familyVocabularyContinuation),false);
  assert.equal(queue.entries.some(e=>e.kind==='extra'&&e.materialId==='new-vocabulary'),false);
  assert.equal((await f.R.list()).length,0);assert.equal(JSON.stringify(f.win.IELTSAdaptivePlan.read().frozenDays[2]),JSON.stringify(p.day));
});

test('an existing original grammar draft remains first and restores the same ID and answer',async()=>{
  const f=await partialFixture(),nav=f.win.IELTSTodayNavigation;
  await nav.resumeNext('grammar','base-grammar');await F.answer(f);await f.nodes.get('coursePause').fire('click');await F.settle();
  const draft=nav.allDrafts().find(d=>d.materialId==='base-grammar');assert.ok(draft);
  assert.equal(draft.answers['base-grammar-q1'],'on the table');
  const queue=nav.learningQueue();assert.equal(queue.next.draftId,draft.id);assert.ok(queue.entries.some(e=>e.familyVocabularyContinuation));
  assert.equal(queue.entries.some(e=>e.materialId==='new-grammar'&&e.familyLessonSupplement),false);
  const restored=await F.mounted(f.pack,{entries:await f.entries(),dictionary:true});
  await restored.win.IELTSTodayNavigation.resumeDraft(draft.id);
  const original=restored.win.IELTSTodayNavigation.allDrafts().find(d=>d.id===draft.id);
  assert.equal(original.answers['base-grammar-q1'],'on the table');assert.equal((await restored.R.list()).some(r=>r.id===draft.id),false);
});

test('after signed vocabulary an unstarted grammar supplement can be submitted without completing or removing old tasks',async()=>{
  const f=await partialWithFamilyVocabulary(),nav=f.win.IELTSTodayNavigation,before=JSON.stringify((await f.R.list()).find(r=>r.materialId==='base-vocabulary')),frozen=JSON.stringify(f.win.IELTSAdaptivePlan.read().frozenDays[2]);
  const queue=nav.learningQueue(),entry=queue.entries.find(e=>e.materialId==='new-grammar'&&e.familyLessonSupplement);
  assert.ok(entry,JSON.stringify(queue.entries));assert.equal(entry.waiting,false);assert.equal(queue.next.materialId,'new-grammar');
  assert.ok(queue.entries.some(e=>e.materialId==='base-grammar'));assert.equal(queue.currentComplete,false);
  assert.equal(await nav.openQueued(entry),true,f.nodes.get('courseNotice').textContent);
  await F.answer(f);f.advance(1000);await f.nodes.get('courseSubmit').fire('click');await F.settle();
  const records=await f.R.list(),record=records.find(r=>r.materialId==='new-grammar');assert.ok(record,f.nodes.get('courseNotice').textContent);
  assert.equal(f.win.IELTSAssessment.decodeArtifact(record).answers['new-grammar-q1'],'on the table');
  assert.equal(JSON.stringify(records.find(r=>r.materialId==='base-vocabulary')),before);assert.equal(JSON.stringify(f.win.IELTSAdaptivePlan.read().frozenDays[2]),frozen);
  assert.equal(records.some(r=>r.materialId==='base-grammar'),false);assert.equal(nav.learningQueue().currentComplete,false);
});

test('a cross-page original draft invalidates a prepared supplement ticket and keeps that draft',async()=>{
  const f=await partialWithFamilyVocabulary(),nav=f.win.IELTSTodayNavigation,api=f.win.IELTSFamilyLessonExpansionV95.runtime();
  const entry=nav.learningQueue().entries.find(e=>e.materialId==='new-grammar'&&e.familyLessonSupplement&&!e.waiting);assert.ok(entry);
  const started=await api.start(entry);
  const owner=f.win.IELTSProfiles.current;f.win.IELTSProfiles.current=()=>({id:'synthetic-other-owner'});assert.throws(()=>api.validateStart(started),/supplement-start-ticket-stale/);f.win.IELTSProfiles.current=owner;
  await nav.resumeNext('grammar','base-grammar');await F.answer(f);await f.nodes.get('coursePause').fire('click');await F.settle();
  const draft=nav.allDrafts().find(d=>d.materialId==='base-grammar');assert.ok(draft);assert.equal(draft.answers['base-grammar-q1'],'on the table');
  assert.throws(()=>api.validateStart(started),/supplement-start-ticket-stale/);await api.releaseFailedStart(started);
  assert.equal((await f.R.list()).some(r=>r.materialId==='new-grammar'),false);
  assert.equal(nav.allDrafts().find(d=>d.id===draft.id).answers['base-grammar-q1'],'on the table');
});

test('a concurrent original draft invalidates the native Record permit without deleting either input',async()=>{
  const f=await partialWithFamilyVocabulary(),nav=f.win.IELTSTodayNavigation,api=f.win.IELTSFamilyLessonExpansionV95.runtime();
  const entry=nav.learningQueue().entries.find(e=>e.materialId==='new-grammar'&&e.familyLessonSupplement&&!e.waiting);assert.ok(entry);
  assert.equal(await nav.openQueued(entry),true,f.nodes.get('courseNotice').textContent);await F.answer(f);await f.nodes.get('coursePause').fire('click');await F.settle();
  const draft=nav.allDrafts().find(d=>d.materialId==='new-grammar');assert.equal(draft.answers['new-grammar-q1'],'on the table');draft.submittedAt='2026-10-24T12:11:00Z';
  const data=f.win.IELTSCurriculumData,material=data.materials.find(m=>m.id==='new-grammar'),input=f.win.IELTSCoursePlayer.toRecord(draft,material,2,f.win.IELTSAssessment,{data});await api.authorizeRecord(input);
  await nav.resumeNext('grammar','base-grammar');await F.answer(f);await f.nodes.get('coursePause').fire('click');await F.settle();
  const original=nav.allDrafts().find(d=>d.materialId==='base-grammar');assert.ok(original);
  f.context.__input=JSON.stringify(input);await assert.rejects(vm.runInContext('window.IELTSRecords.record(JSON.parse(__input))',f.context),/supplement-private-submit-permit-pending/);
  assert.equal((await f.R.list()).some(r=>r.materialId==='new-grammar'),false);
  assert.equal(nav.allDrafts().find(d=>d.id===draft.id).answers['new-grammar-q1'],'on the table');assert.equal(nav.allDrafts().find(d=>d.id===original.id).answers['base-grammar-q1'],'on the table');
});

test('actual memory due debt stays first and is not removed when a partial lesson is eligible',async()=>{
  const f=await partialFixture(),M=f.win.IELTSMemory,E=f.win.IELTSEssentialVocabulary,catalog=f.win.IELTS_ESSENTIAL_VOCABULARY,word=catalog.entries.find(e=>e.word==='student');assert.ok(word);
  const memory=M.captureTraining(M.read(),{attempts:[{id:'synthetic-old-exposure',word:word.word,meaning:word.meaning,mode:'meaning',submittedAt:'2026-10-20T10:00:00Z',correct:true}]});
  f.win.localStorage.setItem(M.KEY,JSON.stringify(memory));
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/essential-vocabulary-course.js'),'utf8'),f.context,{filename:'essential-vocabulary-course.js'});
  const now=Date.parse('2026-10-24T12:00:00Z'),before=JSON.stringify(M.read()),rows=await f.R.list(),plan=E.plan(M.read(),{data:catalog,now,records:rows,courseDay:2,remainingMinutes:360});
  assert.ok(plan.allDue.length||plan.reviewDebt.required,JSON.stringify(plan.reviewDebt));
  const queue=f.win.IELTSTodayNavigation.learningQueue();assert.equal(queue.entries[0].dueReview,true);assert.equal(queue.next.dueReview,true);
  assert.ok(queue.entries.some(e=>e.familyVocabularyContinuation));assert.equal(JSON.stringify(M.read()),before);
});

test('a day frozen only by genuine prior review can continue into a signed new group without completing its old core',async()=>{
  const p=F.packageData(),f=await F.mounted(p,{protectedDay:true,dictionary:true}),S=require('../assets/memory-session.js'),item={word:'student',meaning:'student meaning',skill:'spelling'},draft=S.makeDraft(item,{id:'synthetic-review-only',courseDay:2,now:Date.parse('2026-10-24T09:00:00Z')});
  draft.answer='student';draft.activeSeconds=1;draft.activityByDate={'2026-10-24':1};const input=S.recordFor(draft,item,{correct:true},{now:Date.parse('2026-10-24T09:01:00Z')});f.context.__review=JSON.stringify(input);await vm.runInContext('window.IELTSRecords.record(JSON.parse(__review))',f.context);await f.win.IELTSTodayNavigation.refreshYearRecords();
  const nav=f.win.IELTSTodayNavigation,api=f.win.IELTSFamilyLessonExpansionV95.runtime(),prepared=await api.prepareVocabularyUnit({courseDay:2}),source=api.readVocabularyContext({courseDay:2,records:prepared.records,drafts:[]});
  assert.equal(source.status,'ready',source.reason);const queue=nav.learningQueue();assert.ok(queue.entries.some(e=>e.familyVocabularyContinuation),JSON.stringify(queue.entries));assert.equal(queue.currentComplete,false);
  assert.equal(JSON.stringify(f.win.IELTSAdaptivePlan.read().frozenDays[2]),JSON.stringify(p.day));assert.equal((await f.R.list()).length,1);
});

test('an earlier old-material exposure prevents family-only classification and retains the old snapshot',async()=>{
  const p=F.packageData(),f=await F.mounted(p,{dictionary:true,completeFamilyPrerequisites:true,vocabularyOnly:true}),api=f.win.IELTSFamilyLessonExpansionV95.runtime(),P=f.win.IELTSCoursePlayer,raw=f.win.localStorage.getItem(P.KEY),state=raw?P.parseState(raw):P.newState();
  state.exposures['base-vocabulary']={firstSeenAt:'2026-10-24T08:00:00.000Z',lastSeenAt:'2026-10-24T08:00:00.000Z',count:1,assisted:false,courseDays:[2]};f.win.localStorage.setItem(P.KEY,JSON.stringify(state));
  const before=f.win.localStorage.getItem(P.KEY),prepared=await api.prepareVocabularyUnit({courseDay:2}),source=api.readVocabularyContext({courseDay:2,records:prepared.records,drafts:[]});
  assert.equal(source.status,'pending');assert.equal(source.reason,'original-vocabulary-before-new-family-group');assert.equal(f.win.localStorage.getItem(P.KEY),before);
});

test('a real old V2 error stays pending until the exact original is corrected, without rewriting it',async()=>{
  const f=await partialFixture({wrong:true}),nav=f.win.IELTSTodayNavigation,record=(await f.R.list()).find(r=>r.materialId==='base-vocabulary'),before=record.answer;
  const summary=f.M.forDay(2);assert.ok(summary.remaining>0,JSON.stringify(summary));assert.equal(nav.learningQueue().entries.some(e=>e.familyVocabularyContinuation),false);
  const answers=Object.fromEntries(summary.remainingItems.map(item=>[item.id,item.question.answers[0]]));f.context.__correction=JSON.stringify(answers);vm.runInContext('window.IELTSMistakes.submitPage(2,JSON.parse(__correction),{id:"synthetic-old-vocabulary-correction"})',f.context);
  assert.equal(f.M.recordCorrectionStatus(record).corrected,true);assert.equal((await f.R.list()).find(r=>r.id===record.id).answer,before);
  await nav.refreshYearRecords();assert.ok(nav.learningQueue().entries.some(e=>e.familyVocabularyContinuation),'a passed real correction should release the separate continuation');
});

test('the new vocabulary entry uses Ecore incremental time and forecast rest, not the old whole-module minutes',async()=>{
  const f=await partialFixture(),nav=f.win.IELTSTodayNavigation,load=f.win.IELTSDailyLearningLoad,context=nav.yearContext(),budget={date:'2026-10-24',budgetMinutes:360,spentMinutes:350,remainingMinutes:10,exhausted:false};
  const ten=load.build({...context,budget});assert.equal(ten.next.familyVocabularyContinuation,true);assert.ok(ten.next.estimate.studyMinutes<=10);assert.equal(ten.currentComplete,false);
  const timer=f.win.IELTSStudyTimerCore.newState();timer.enabled=true;timer.phase='short-break';timer.remainingSeconds=300;
  const waiting=load.build({...context,budget:{...budget,spentMinutes:355,remainingMinutes:5},timerState:timer});
  const entry=waiting.entries.find(e=>e.familyVocabularyContinuation);assert.ok(entry);assert.ok(entry.estimate.breakMinutes>=5);assert.equal(entry.fitsBudget,false);assert.equal(waiting.next.kind,'rest');
  assert.equal((await f.R.list()).filter(r=>r.materialId==='base-vocabulary').length,1);
});
