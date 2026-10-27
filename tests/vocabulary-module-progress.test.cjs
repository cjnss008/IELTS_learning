'use strict';
// Synthetic engineering evidence only. The candidate is read-only; no user data is loaded.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const base=path.resolve(process.env.IELTS_TEST_CANDIDATE||(fs.existsSync(path.join(__dirname,'../assets/curriculum-data.js'))?path.join(__dirname,'..'):path.join(__dirname,'../../../answer-replay-v95/candidate')));
const asset=name=>require(path.join(base,'assets',name+'.js'));
const D=asset('curriculum-data'),V=asset('vocabulary-practice'),P=asset('course-player'),A=asset('assessment-core'),R=asset('learning-records'),M=asset('mistake-book'),X=asset('course-expansion');
const hubFile=path.resolve(__dirname,'../assets/today-hub.js'),win={IELTSVocabularyPractice:V,IELTSCoursePlayer:P,IELTSAssessment:A,IELTSCourseExpansion:X};
vm.runInNewContext(fs.readFileSync(hubFile,'utf8'),{window:win,globalThis:win,URLSearchParams,URL});const H=win.IELTSTodayHub;
const day=X.overlay(D.days.find(d=>d.day===2),D),task=day.tasks.find(t=>t.id==='vocabulary'),ordered=X.orderedMaterialIds(task,2),materials=ordered.map(id=>D.materials.find(m=>m.id===id));
const options={dayNumber:2,data:D,materials:D.materials},plain=value=>JSON.parse(JSON.stringify(value));let serial=0;
function make(material,{wrong=false,low=false,kind='original',parentId,priorRecords=[],draftOnly=false}={}){
 const id='vocab-synthetic-'+(++serial),at=new Date(),now=at.toISOString(),start=new Date(+at-60000).toISOString(),s=V.createSession({material,courseDay:2});
 for(const [index,word] of s.words.entries()){
  for(let i=0;i<3;i++)s.recordSpelling(index,word.word);
  for(let i=0;i<3;i++){const hash=crypto.createHash('sha256').update(id+':'+index+':'+i).digest('hex');s.recordSpeaking(index,{workId:'work-'+hash.slice(0,40),reference:word.word,hash,evidenceId:hash,provider:'Alibaba oral assessment',verified:true,nonSilent:true,durationSeconds:1,recordedAt:now,result:{accuracy:low&&index===0&&i===0?70:90,fluency:90,completeness:95}});}
 }
 s.begin();for(let round=0;round<3;round++){s.words.forEach((word,index)=>{s.setAnswer(index,wrong&&round<2&&index<2?'wrong-synthetic':word.word);if(round===2)s.markPlayed(index,{kind:'local-audio',started:true,completed:true,completedAt:now});});s.submitRound();s.next();}
 if(draftOnly)return s.getDraft();
 const payload=s.getSubmission(),binding=P.freezeMaterialBinding(material,{assessment:A,task,data:D,courseDay:2,attemptId:id});
 const attempt={id,materialId:material.id,taskId:'vocabulary',courseDay:2,mode:'practice',kind,parentId:parentId||null,startedAt:start,submittedAt:now,activeSeconds:1,activityByDate:{[now.slice(0,10)]:1},exposureAtStart:'seen',answers:{},userEvidence:{},text:'',transcript:'',audioAvailable:false,audioCompleted:false,transcriptViewed:false,interrupted:false,assistance:{hint:false,answer:false,ai:false},media:[],materialBinding:binding};
 const input=P.toRecord(attempt,material,2,A,{data:D});input.source='vocabulary-practice';input.quantity=payload.quantity;input.unit=payload.unit;input.evaluation=payload.evaluation;input.answer=JSON.stringify({...JSON.parse(input.answer),...JSON.parse(payload.answer),schema:1,trainingSchema:2,gradingPolicy:binding.gradingPolicy,materialBinding:binding});
 return R.put({schemaVersion:1,records:priorRecords},input,new Date(+at+10000).toISOString()).record;
}
function summary(records,extra={}){return H.vocabularyModuleProgress(task,records,{...options,...extra});}
function subset(value){return{totalGroups:value.totalGroups,submittedGroups:value.submittedGroups,completedCycles:value.completedCycles,missingMaterialIds:[...value.missingMaterialIds],allSubmitted:value.allSubmitted,correctionPending:value.correctionPending,completed:value.completed};}

test('real lesson 2 has three exact required groups and the reported 5/7, 5/7, 7/7 is a submission, not mastery',()=>{
 assert.deepEqual(ordered,['day02-expansion-vocabulary','w01-read-2-vocabulary','lexical-w01-2']);assert.deepEqual(materials.map(m=>V.wordsFor(m,{curriculumData:D}).length),[7,8,4]);
 const wrong=make(materials[0],{wrong:true}),a=JSON.parse(wrong.answer),proof=V.verifyTrainingArtifact(a,materials[0]);assert.deepEqual(a.rounds.map(r=>r.correct),[5,5,7]);assert.equal(proof.submitted,true);assert.equal(proof.mastered,false);
 const records=[wrong,make(materials[1]),make(materials[2])],before=JSON.stringify(records);
 assert.deepEqual(subset(summary([])),{totalGroups:3,submittedGroups:0,completedCycles:0,missingMaterialIds:ordered,allSubmitted:false,correctionPending:false,completed:false});
 assert.deepEqual(subset(summary(records.slice(0,1))),{totalGroups:3,submittedGroups:1,completedCycles:0,missingMaterialIds:ordered.slice(1),allSubmitted:false,correctionPending:true,completed:false});
 assert.deepEqual(subset(summary(records.slice(0,2))),{totalGroups:3,submittedGroups:2,completedCycles:0,missingMaterialIds:ordered.slice(2),allSubmitted:false,correctionPending:true,completed:false});
 assert.deepEqual(subset(summary(records)),{totalGroups:3,submittedGroups:3,completedCycles:1,missingMaterialIds:[],allSubmitted:true,correctionPending:true,completed:false});
 assert.equal(H.taskState(task,records,options).count,3);assert.deepEqual([...H.taskState(task,records,options).missingMaterialIds],[]);assert.equal(JSON.stringify(records),before);
});

test('browser without Node require or a loaded word dictionary keeps real submitted v2 groups recognizable',()=>{
 const browser={IELTSCoursePlayer:P,IELTSAssessment:A,IELTSCourseExpansion:X,IELTSCurriculumData:D},context=vm.createContext({window:browser,globalThis:browser,URLSearchParams,URL});
 vm.runInContext(fs.readFileSync(path.join(base,'assets/vocabulary-practice.js'),'utf8'),context);assert.equal(vm.runInContext('typeof require',context),'undefined');assert.equal(browser.IELTSVocabularyPractice.wordsFor(materials[0],{curriculumData:D}).length,0);
 vm.runInContext(fs.readFileSync(hubFile,'utf8'),context);const works=materials.map(m=>make(m)),hub=browser.IELTSTodayHub;assert.equal(browser.IELTSVocabularyPractice.verifyTrainingArtifact(JSON.parse(works[0].answer),materials[0]).submitted,true);assert.equal(hub.learningCount(task,works,options),1);assert.equal(hub.taskState(task,works,options).count,3);assert.equal(hub.vocabularyModuleProgress(task,works,options).submittedGroups,3);
});

test('an empty inherited vocabulary group follows the actual parent contract without guessing missing words',()=>{
 const inherited={...materials[0],id:'synthetic-parent-vocabulary',vocabulary:[]},parent={id:'synthetic-parent',skill:'reading',vocabulary:plain(materials[0].vocabulary)},full={...inherited,vocabulary:parent.vocabulary},record=make(full),one={...task,materialIds:[inherited.id]},data={...D,materials:[inherited,parent]},opts={dayNumber:2,data,materials:data.materials};
 const browser={IELTSCoursePlayer:P,IELTSAssessment:A,IELTSCourseExpansion:X,IELTSCurriculumData:data},context=vm.createContext({window:browser,globalThis:browser,URLSearchParams,URL});vm.runInContext(fs.readFileSync(path.join(base,'assets/vocabulary-practice.js'),'utf8'),context);vm.runInContext(fs.readFileSync(hubFile,'utf8'),context);const hub=browser.IELTSTodayHub;
 assert.equal(hub.learningCount(one,[record],opts),1);assert.equal(hub.taskState(one,[record],opts).done,true);assert.equal(hub.vocabularyModuleProgress(one,[record],opts).submittedGroups,1);
 const noParent={...opts,data:{...data,materials:[inherited]},materials:[inherited]};assert.equal(hub.learningCount(one,[record],noParent),0);assert.equal(hub.taskState(one,[record],noParent).done,false);assert.equal(hub.vocabularyModuleProgress(one,[record],noParent).completed,false);
 const malformed={...inherited,vocabulary:[...parent.vocabulary,{word:''}]},invalidOptions={...opts,data:{...data,materials:[malformed,parent]},materials:[malformed,parent]};assert.equal(hub.learningCount(one,[record],invalidOptions),0);assert.equal(hub.taskState(one,[record],invalidOptions).done,false);
});

test('real mistake book correction clears actual errors without changing the three original R records',()=>{
 const records=[make(materials[0],{wrong:true}),make(materials[1]),make(materials[2])],before=JSON.stringify(records);let raw=null;const store=M.createStore({getItem:()=>raw,setItem:(_key,value)=>{raw=value;}});
 for(const record of records)store.captureRecord(record,{materials:D.materials});const first=store.summary(2);assert.equal(first.remaining,4);const opts={recordCorrectionStatus:r=>store.recordCorrectionStatus(r),historicalRecordCorrectionStatus:r=>store.historicalRecordCorrectionStatus(r)};
 assert.equal(summary(records,opts).correctionPending,true);const answers=Object.fromEntries(first.remainingItems.map(item=>[item.id,item.question.answers[0]]));store.submitRound(2,answers,{id:'vocabulary-real-redo'});assert.equal(store.summary(2).remaining,0);assert.equal(store.recordCorrectionStatus(records[0]).corrected,true);
 const result=summary(records,opts);assert.equal(result.completed,true);assert.equal(result.correctionPending,false);assert.equal(result.completedCycles,1);assert.equal(JSON.stringify(records),before);assert.deepEqual(JSON.parse(records[0].answer).rounds.map(r=>r.correct),[5,5,7]);
});

test('invalid, old, unsubmitted, cross-day, wrong-ID and incomplete records cannot create a group',()=>{
 const good=make(materials[0]),draft=make(materials[0],{draftOnly:true}),old=plain(good),incomplete=plain(good),wrongDay=plain(good),wrongId=plain(good),differentDay=plain(good),invalidBinding=plain(good),wrongSkillBinding=plain(good),badWord=plain(good),missingVersion=plain(good);assert.equal(draft.phase,'complete');assert.equal(draft.roundSubmittedAt.length,3);
 let a=JSON.parse(old.answer);a.trainingVersion=1;old.answer=JSON.stringify(a);a=JSON.parse(incomplete.answer);a.rounds.pop();incomplete.answer=JSON.stringify(a);
 wrongDay.dayNumber=3;wrongId.materialId=materials[1].id;differentDay.answer=JSON.stringify({...JSON.parse(differentDay.answer),courseDay:3});a=JSON.parse(invalidBinding.answer);a.materialBinding.contentHash='f'.repeat(64);invalidBinding.answer=JSON.stringify(a);a=JSON.parse(wrongSkillBinding.answer);a.materialBinding.material.skill='writing';a.materialBinding.contentHash=A.materialContentHash(a.materialBinding.material);wrongSkillBinding.answer=JSON.stringify(a);a=JSON.parse(badWord.answer);a.words[0].word='not-the-bound-word';badWord.answer=JSON.stringify(a);delete missingVersion.version;
 for(const record of [draft,old,incomplete,wrongDay,wrongId,differentDay,invalidBinding,wrongSkillBinding,badWord,missingVersion,{...good,kind:'correction',parentId:'missing-root'}, {...good,kind:'retest',parentId:'missing-root'}])assert.equal(summary([record]).submittedGroups,0,JSON.stringify({kind:record.kind,id:record.id}));
 assert.equal(H.vocabularyModuleProgress({id:'grammar',materialIds:['x']},[],options),null);
});

test('all-pass, pending review, low pronunciation, repeated rounds and linked corrections remain distinct',()=>{
 const originals=materials.map(m=>make(m)),before=JSON.stringify(originals),complete=summary(originals);assert.equal(complete.completed,true);assert.equal(complete.completedCycles,1);
 const pending=plain(originals);pending[1].evaluation.result='pending';assert.equal(summary(pending).pending,true);assert.equal(summary(pending).completed,false);
 const low=[make(materials[0],{low:true}),...originals.slice(1)];assert.equal(summary(low).correctionPending,true);assert.equal(summary(low).completed,false);
 const repeats=materials.map((m,i)=>make(m,{kind:'retest',parentId:originals[i].id,priorRecords:[originals[i]]})),two=summary([...originals,...repeats]);assert.equal(two.completedCycles,2);assert.equal(two.completed,true);
 assert.equal(summary([...originals,repeats[0]]).completedCycles,1);const correction=make(materials[0],{kind:'correction',parentId:repeats[0].id,priorRecords:[originals[0],repeats[0]]});assert.equal(summary([...originals,...repeats,correction]).completedCycles,2);
 const single=H.vocabularyModuleProgress({...task,materialIds:[materials[0].id]},[originals[0],repeats[0]],options);assert.equal(single.totalGroups,1);assert.equal(single.completedCycles,2);assert.equal(JSON.stringify(originals),before);
});

test('a saved bound original remains visible after the same material gains a word, without completing the new version',async()=>{
 const originals=materials.map(m=>make(m)),before=JSON.stringify(originals),changed={...materials[0],version:'2',vocabulary:[...materials[0].vocabulary,{word:'additional',meaning:'额外的'}]},changedMaterials=D.materials.map(m=>m.id===changed.id?changed:m),result=summary(originals,{materials:changedMaterials});
 assert.equal(result.submittedGroups,2);assert.equal(result.completedCycles,0);assert.equal(result.completed,false);assert.deepEqual([...result.missingMaterialIds],[changed.id]);assert.deepEqual([...result.updatedMaterialIds],[changed.id]);assert.equal(result.historicalSubmittedGroups,1);assert.equal(result.historicalCyclesByMaterial[changed.id],1);assert.equal(H.learningCount(task,originals,{...options,materials:changedMaterials}),0);assert.deepEqual([...H.taskState(task,originals,{...options,materials:changedMaterials}).missingMaterialIds],[changed.id]);
 const data={days:[day],materials:changedMaterials},f=await hubFixture()({data:plain(data),current:{day:2,taskId:'vocabulary'},records:originals}),small=f.nodes.get('todayRoute').children.find(n=>n.children.some(c=>c.textContent==='词汇')).children.find(n=>n.tagName==='SMALL');assert.match(small.textContent,/原版已提交.*1 次.*新版待学/);assert.equal(JSON.stringify(originals),before);
});

test('an unbound legacy v2 work recognized in 0.0.95 keeps its real submission count or an explicit verification state',()=>{
 const bound=make(materials[0]),input=plain(bound);delete input.history;delete input.version;const answer=JSON.parse(input.answer);delete answer.materialBinding;input.answer=JSON.stringify(answer);const old=R.put(R.newState(),input,new Date(Date.now()+10000).toISOString()).record,one={...task,materialIds:[materials[0].id]},result=H.vocabularyModuleProgress(one,[old],options);
 assert.equal(V.verifyTrainingArtifact(JSON.parse(old.answer),materials[0]).submitted,true);assert.equal(H.learningCount(one,[old],options),1);assert.equal(result.submittedGroups,1);assert.equal(result.completedCycles,1);assert.ok(result.completed||result.verificationPending);const broken=plain(bound),a=JSON.parse(broken.answer);a.materialBinding.contentHash='f'.repeat(64);broken.answer=JSON.stringify(a);assert.equal(H.vocabularyModuleProgress(one,[broken],options).completed,false);assert.equal(H.learningCount(one,[broken],options),0);assert.deepEqual([...H.taskState(one,[broken],options).missingMaterialIds],[materials[0].id]);
});

test('a wrong relearning retains the completed original and separately shows the new correction debt',async()=>{
 const originals=materials.map(m=>make(m)),retest=make(materials[0],{wrong:true,kind:'retest',parentId:originals[0].id,priorRecords:[originals[0]]}),records=[...originals,retest],before=JSON.stringify(records);let raw=null;const store=M.createStore({getItem:()=>raw,setItem:(_key,value)=>{raw=value;}});for(const record of records)store.captureRecord(record,{materials:D.materials});assert.equal(store.summary(2).remaining,4);
 const result=summary(records,{recordCorrectionStatus:r=>store.recordCorrectionStatus(r),historicalRecordCorrectionStatus:r=>store.historicalRecordCorrectionStatus(r)});assert.equal(result.completed,true);assert.equal(result.correctionPending,true);assert.equal(result.completedCycles,1);
 const f=await hubFixture()({data:plain({days:[day],materials:D.materials}),current:{day:2,taskId:'vocabulary'},records,recordCorrectionStatus:r=>store.recordCorrectionStatus(r)}),small=f.nodes.get('todayRoute').children.find(n=>n.children.some(c=>c.textContent==='词汇')).children.find(n=>n.tagName==='SMALL');assert.match(small.textContent,/已完成.*新增错题待订正/);assert.equal(store.summary(2).remaining,4);assert.equal(JSON.stringify(records),before);
});

test('a real corrected original remains complete when a later relearning reopens its own mistakes',()=>{
 const original=make(materials[0],{wrong:true}),other=materials.slice(1).map(m=>make(m));let raw=null;const store=M.createStore({getItem:()=>raw,setItem:(_key,value)=>{raw=value;}});store.captureRecord(original,{materials:D.materials});let due=store.summary(2);store.submitRound(2,Object.fromEntries(due.remainingItems.map(i=>[i.id,i.question.answers[0]])),{id:'original-v2-correction'});assert.equal(store.recordCorrectionStatus(original).corrected,true);
 const retest=make(materials[0],{wrong:true,kind:'retest',parentId:original.id,priorRecords:[original]}),records=[original,...other,retest],before=JSON.stringify(records);store.captureRecord(retest,{materials:D.materials});assert.equal(store.recordCorrectionStatus(original).corrected,false);assert.equal(store.historicalRecordCorrectionStatus(original).corrected,true);due=store.summary(2);assert.equal(due.remaining,4);
 const opts={recordCorrectionStatus:r=>store.recordCorrectionStatus(r),historicalRecordCorrectionStatus:r=>store.historicalRecordCorrectionStatus(r)},pending=summary(records,opts);assert.equal(pending.completed,true);assert.equal(pending.correctionPending,true);assert.equal(pending.completedCycles,1);store.submitRound(2,Object.fromEntries(due.remainingItems.map(i=>[i.id,i.question.answers[0]])),{id:'relearning-v2-correction'});const cleared=summary(records,opts);assert.equal(cleared.completed,true);assert.equal(cleared.correctionPending,false);assert.equal(cleared.completedCycles,1);assert.equal(JSON.stringify(records),before);
});

function hubFixture(){const file=path.join(base,'tests/today-hub.test.cjs'),source=fs.readFileSync(file,'utf8').split("test('home Start resumes")[0],local=createRequire(file),custom=name=>name==='node:test'?()=>{}:name==='node:fs'?{...fs,readFileSync(file,...rest){return fs.readFileSync(path.resolve(file)===path.join(base,'assets/today-hub.js')?hubFile:file,...rest);}}:local(name);return new Function('require','__dirname',source+'\nreturn fixture;')(custom,path.dirname(file));}
test('today route visibly distinguishes partial groups, full submitted mistakes and actual completion',async()=>{
 const originals=[make(materials[0],{wrong:true}),make(materials[1]),make(materials[2])],data={days:[day],materials:D.materials},fixture=hubFixture();
 for(const [records,expected,forbidden] of [[[],/待学习/,/已提交/],[originals.slice(0,1),/已提交 1\/3 组.*错题待订正/,/已学习 0 次/],[originals,/已提交 3\/3 组.*已学习 1 次.*错题待订正/,/已完成/]]){
  const f=await fixture({data:plain(data),current:{day:2,taskId:'vocabulary'},records}),small=f.nodes.get('todayRoute').children.find(n=>n.children.some(c=>c.textContent==='词汇')).children.find(n=>n.tagName==='SMALL');assert.match(small.textContent,expected);assert.doesNotMatch(small.textContent,forbidden);
 }
 const corrected=materials.map(m=>make(m)),f=await fixture({data:plain(data),current:{day:2,taskId:'vocabulary'},records:corrected}),small=f.nodes.get('todayRoute').children.find(n=>n.children.some(c=>c.textContent==='词汇')).children.find(n=>n.tagName==='SMALL');assert.match(small.textContent,/已完成.*已提交 3\/3 组.*已学习 1 次/);
});
