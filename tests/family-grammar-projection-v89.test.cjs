'use strict';
// Real main81 consumers with synthetic materials/answers; no learner data.
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../assets/curriculum-data.js'),Flow=require('../assets/course-expansion.js'),Adaptive=require('../assets/adaptive-plan.js'),A=require('../assets/assessment-core.js'),P=require('../assets/course-player.js'),Hub=require('../assets/today-hub.js'),M=require('../assets/mistake-book.js'),Records=require('../assets/learning-records.js'),Backup=require('../assets/backup-core.js');
const {original}=require('./actual-lessons-fixture.cjs');
const NOW=Date.parse('2026-10-26T00:00:00.000Z'),copy=value=>JSON.parse(JSON.stringify(value)),grammar=day=>day.tasks.find(t=>t.id==='grammar');
function memory(){const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};}
function data(){
 const materials=D.materials.slice(),model=D.materials.find(m=>m.id==='day02-expansion-grammar'),units=[];
 for(let day=2;day<=10;day++){
  const material=day===2?model:{...copy(model),id:'synthetic-family-grammar-'+day,title:'Synthetic new grammar '+day,questions:model.questions.map((q,i)=>({...copy(q),id:'d'+day+'-q'+i}))};
  if(day!==2)materials.push(material);units.push({day,materialId:material.id,materialContentHash:A.materialContentHash(material)});
 }
 return{...D,materials,publicCoursePlan:null,familyGrammarRelease:{schema:1,id:'family-grammar-02-10-v89',active:true,units}};
}
const deps={contextReady:true,assessment:A,player:P,hub:Hub};
function project(day,data,extra={}){return Flow.familyGrammarProjection(day,data,{...deps,records:[],drafts:[],...extra});}
function sourceRecord(day,task,material,wrong=false){
 const record=original(day,task,material,NOW-60000),artifact=A.decodeArtifact(record);
 artifact.materialBinding=P.freezeMaterialBinding(material,{assessment:A,task,courseDay:day,attemptId:record.id});artifact.gradingPolicy=artifact.objectiveGrading=artifact.materialBinding.gradingPolicy;
 if(wrong)artifact.answers[material.questions[0].id]='synthetic incorrect answer';
 record.answer=JSON.stringify(artifact);if(wrong)record.evaluation={method:'objective',result:'revise',score:0,maxScore:material.questions.length};return record;
}
function completed(day,data){const task=grammar(day);return(task.coreMaterialIds||task.materialIds).map(id=>sourceRecord(day.day,task,data.materials.find(m=>m.id===id)));}
function oldState(day){const state=Adaptive.newState();state.startedDays=[day.day];state.frozenDays[day.day]=copy(day);return state;}
function oldDraft(day,data){
 const task=grammar(day),material=data.materials.find(m=>m.id===task.materialIds[0]);
 return{id:'family-old-grammar-draft',materialId:material.id,taskId:'grammar',courseDay:day.day,mode:'practice',kind:'original',parentId:null,startedAt:'2026-10-25T12:00:00.000Z',activeSeconds:30,activityByDate:{'2026-10-25':30},exposureAtStart:'unseen',answers:{[material.questions[0].id]:material.questions[0].answers[0]},userEvidence:{},text:'',transcript:'',audioAvailable:false,audioCompleted:false,transcriptViewed:false,interrupted:false,assistance:{hint:false,answer:false,ai:false},media:[],materialBinding:P.freezeMaterialBinding(material,{assessment:A,task,courseDay:day.day,attemptId:'family-old-grammar-draft'}),dayPlanBinding:{schema:1,contentHash:A.materialContentHash(day),day:copy(day)}};
}

test('release/context/hash guards preserve first lesson, source data and unsupported days without throwing',()=>{
 const d=data(),before=JSON.stringify(d),day=d.days[1];
 assert.equal(project(d.days[0],d),d.days[0]);assert.equal(project(d.days[10],d),d.days[10]);
 assert.equal(project(day,d,{contextReady:false}),day);
 for(const change of [value=>{delete value.familyGrammarRelease;},value=>{value.familyGrammarRelease.active=false;},value=>{value.familyGrammarRelease.units[0].materialContentHash='0'.repeat(64);},value=>{value.familyGrammarRelease.units.pop();},value=>{value.familyGrammarRelease.units[8].day=2;},value=>{value.materials=value.materials.filter(m=>m.id!==value.familyGrammarRelease.units[2].materialId);}]){const invalid=copy(d);change(invalid);assert.equal(project(day,invalid),day);}
 assert.equal(JSON.stringify(d),before);
});

test('each effective lesson2–10 uses its own pinned grammar while all other tasks and minutes stay exact',()=>{
 const d=data(),before=JSON.stringify(d);
 for(const base of d.days.slice(1,10)){
  const result=project(base,d),unit=d.familyGrammarRelease.units.find(u=>u.day===base.day);
  assert.deepEqual(grammar(result).materialIds,[unit.materialId]);assert.equal(grammar(result).minutes,grammar(base).minutes);assert.equal(grammar(result).quantity,10);
  assert.deepEqual(result.tasks.filter(t=>t.id!=='grammar'),base.tasks.filter(t=>t.id!=='grammar'));assert.equal(result.totalMinutes,360);
  assert.equal(result.familyGrammar.materialContentHash,unit.materialContentHash);assert.equal(result.familyGrammar.releaseId,d.familyGrammarRelease.id);assert.deepEqual(result.familyGrammar.originalTask,grammar(base));
  assert.ok(Flow.validFamilyGrammarProjection(result,d,{assessment:A}));assert.deepEqual(Flow.restoreFamilyGrammarBase(result),base);assert.equal(project(result,d),result);assert.equal(Flow.unstartedLessonFlow(result,d,{contextReady:true}),result,'an effective family projection is already resolved');
  const material=d.materials.find(m=>m.id===unit.materialId);assert.ok(grammar(result).instructions.includes(material.title));assert.ok(grammar(result).instructions.includes(material.instructions));if(base.day===2)assert.match(grammar(result).instructions,/be 提问、not 否定、we \/ they 和规则复数/);
 }
 assert.equal(JSON.stringify(d),before);
});

test('unknown and semantic-only grammar tasks receive no first family upgrade',()=>{
 const d=data(),base=copy(d.days[2]);grammar(base).materialIds=['custom-grammar-only'];grammar(base).coreMaterialIds=['custom-grammar-only'];assert.equal(project(base,d),base);
 const C=require('../assets/public-context-practice.js'),catalog=require('../assets/public-context-practice-data.js'),context=C.resolveMaterial('context-grammar:speaker-identity:1:study',{data:d,catalog}),semantic=copy(d.days[7]);assert.ok(context);d.materials.push(context);grammar(semantic).materialIds=[context.id];grammar(semantic).coreMaterialIds=[context.id];grammar(semantic).quantity=context.questions.length;assert.equal(project(semantic,d),semantic);
 const fake={id:'unbound-family-draft',materialId:d.familyGrammarRelease.units.find(u=>u.day===semantic.day).materialId,taskId:'grammar',courseDay:semantic.day};assert.equal(project(semantic,d,{drafts:[fake]}),semantic);
});

test('actual full old grammar originals remain complete; another day, cached pass, partial or pending cannot borrow completion',()=>{
 const d=data(),day=d.days[1],records=completed(day,d),saved=JSON.stringify(records);
 assert.equal(project(day,d,{records}),day);
 for(const mutate of [rows=>{rows[0].dayNumber=1;},rows=>{const a=A.decodeArtifact(rows[0]);a.answers[Object.keys(a.answers)[0]]='wrong';rows[0].answer=JSON.stringify(a);},rows=>{const a=A.decodeArtifact(rows[0]);delete a.answers[Object.keys(a.answers)[0]];rows[0].answer=JSON.stringify(a);},rows=>{rows[0].evaluation.result='pending';},rows=>{rows[0].evaluation.result='unverified';}]){const changed=copy(records);mutate(changed);assert.ok(project(day,d,{records:changed}).familyGrammar);}
 assert.equal(JSON.stringify(records),saved);assert.equal(Hub.taskState(grammar(day),records,{data:d,dayNumber:2}).done,true);
 const fresh=project(day,d,{records:records.slice(0,1)});assert.equal(Hub.taskState(grammar(fresh),records.slice(0,1),{data:d,dayNumber:2}).done,false,'an old source pass does not grant the new unit a pass');
});

test('real Mistakes whole-page correction preserves the completed old requirement and its original wrong answer',()=>{
 const d=data(),day=d.days[1],records=completed(day,d),material=d.materials.find(m=>m.id===records[0].materialId);records[0]=sourceRecord(2,grammar(day),material,true);
 const saved=records[0].answer,storage=memory(),book=M.createStore(storage,{now:()=>new Date(NOW).toISOString()});book.captureRecord(records[0],{material,materials:d.materials});
 assert.ok(book.summary(2).remaining);assert.ok(project(day,d,{records,recordCorrectionStatus:r=>book.recordCorrectionStatus(r)}).familyGrammar);
 book.submitRound(2,Object.fromEntries(book.summary(2).remainingItems.map(item=>[item.id,item.question.answers[0]])),{id:'family-real-correction'});
 assert.equal(book.recordCorrectionStatus(records[0]).corrected,true);assert.equal(project(day,d,{records,recordCorrectionStatus:r=>book.recordCorrectionStatus(r)}),day);assert.equal(records[0].answer,saved);
});

test('frozen unfinished lessons project reversibly without rewriting frozenDays, old drafts or old material bindings',()=>{
 const d=data(),base=d.days[1],storage=memory(),state=oldState(base),raw=JSON.stringify(state),draft=oldDraft(base,d),draftBytes=JSON.stringify(draft);
 storage.setItem(Adaptive.KEY,raw);const store=Adaptive.createStore({data:d,storage,now:()=>NOW});assert.deepEqual(store.getDay(base),base);
 store.adoptStarted({records:[],drafts:[draft]});const before=storage.getItem(Adaptive.KEY),projected=store.getDay(base);assert.equal(before,raw);assert.ok(projected.familyGrammar);assert.deepEqual(store.read().frozenDays[2],base);
 store.markStarted(2,projected);assert.equal(storage.getItem(Adaptive.KEY),before);assert.deepEqual(store.read().frozenDays[2],state.frozenDays[2]);assert.equal(JSON.stringify(draft),draftBytes);assert.ok(P.resolveDraftMaterial(draft,d.materials.find(m=>m.id===draft.materialId),{assessment:A}).compatible);assert.deepEqual(Adaptive.validDayBinding(draft.dayPlanBinding,2),base);
 const completeStore=Adaptive.createStore({data:d,storage:memory(),now:()=>NOW});completeStore.adoptStarted({records:completed(base,d),drafts:[]});assert.deepEqual(completeStore.getDay(base),base);
});

test('markStarted still refuses any non-grammar change and forged or stale projected grammar',()=>{
 const d=data(),base=d.days[2],storage=memory();storage.setItem(Adaptive.KEY,JSON.stringify(oldState(base)));const store=Adaptive.createStore({data:d,storage,now:()=>NOW});store.adoptStarted({records:[],drafts:[]});const day=store.getDay(base),raw=storage.getItem(Adaptive.KEY);
 for(const change of [value=>{value.tasks.find(t=>t.id==='reading').instructions+=' modified';},value=>{value.tasks[0].minutes++;value.tasks[2].minutes--;},value=>{grammar(value).quantity++;},value=>{value.familyGrammar.originalTask.instructions+=' changed';},value=>{value.familyGrammar.materialContentHash='0'.repeat(64);}]){const invalid=copy(day);change(invalid);assert.equal(Flow.validFamilyGrammarProjection(invalid,d,{assessment:A}),false);assert.throws(()=>store.markStarted(3,invalid),/固定|任务|课程/);assert.equal(storage.getItem(Adaptive.KEY),raw);}
 store.markStarted(3,day);assert.equal(storage.getItem(Adaptive.KEY),raw);
 const stale=copy(d);stale.materials.find(m=>m.id===grammar(day).materialIds[0]).instructions+=' changed';assert.equal(Flow.validFamilyGrammarProjection(day,stale,{assessment:A}),false);
});

test('real Backup/Records/draft parsers restore the new bound unit and keep old state, answers and scores exact',()=>{
 const d=data(),base=d.days[2],day=project(base,d),task=grammar(day),material=d.materials.find(m=>m.id===task.materialIds[0]),record=sourceRecord(3,task,material),artifact=A.decodeArtifact(record);
 artifact.dayPlanBinding={schema:1,contentHash:A.materialContentHash(day),day:copy(day)};record.answer=JSON.stringify(artifact);
 const {version,...input}=record,works=Records.put(Records.newState(),input,new Date(NOW).toISOString()).state,old=oldState(base),state=P.newState(),draft=oldDraft(base,d);state.day=3;state.drafts[draft.id]=draft;
 const bundle=Backup.parseBundle(JSON.stringify({app:'ielts52-backup',schemaVersion:1,entries:{[P.KEY]:JSON.stringify(state),[Records.KEY]:JSON.stringify(works),[Adaptive.KEY]:JSON.stringify(old)}})),restoredWorks=Backup.validate(Records.KEY,bundle[Records.KEY]),restoredPlayer=Backup.validate(P.KEY,bundle[P.KEY]),restoredAdaptive=Backup.validate(Adaptive.KEY,bundle[Adaptive.KEY]);
 assert.deepEqual(restoredAdaptive,old);assert.deepEqual(restoredPlayer.drafts[draft.id],draft);assert.equal(restoredWorks.records[0].answer,record.answer);assert.deepEqual(restoredWorks.records[0].evaluation,works.records[0].evaluation);
 const storage=memory();storage.setItem(Adaptive.KEY,JSON.stringify(restoredAdaptive));const store=Adaptive.createStore({data:d,storage,now:()=>NOW});store.adoptStarted({records:restoredWorks.records,drafts:Object.values(restoredPlayer.drafts)});assert.deepEqual(store.getDay(base),day);assert.deepEqual(store.read().frozenDays[3],base);
 const fromNewBinding=Adaptive.createStore({data:d,storage:memory(),now:()=>NOW});fromNewBinding.adoptStarted({records:restoredWorks.records,drafts:[]});assert.deepEqual(fromNewBinding.getDay(base),day);assert.ok(Flow.validFamilyGrammarProjection(fromNewBinding.getDay(base),d,{assessment:A}));assert.equal(Hub.taskState(task,restoredWorks.records,{data:d,dayNumber:3}).done,true);
});

test('a real scheduled public-context grammar, its filled draft and a separate reinforcement survive the foundation replacement',()=>{
 const C=require('../assets/public-context-practice.js'),catalog=require('../assets/public-context-practice-data.js'),d=data(),sourceMaterial=d.materials.find(m=>m.skill==='reading'&&m.source?.publicSourceId==='voa-l1-01'),source=sourceRecord(1,{id:'reading',mode:'practice'},sourceMaterial),projection=C.plan(d,{catalog,records:[source],assessment:A,now:NOW}),assignment=projection.assignments.find(a=>a.stage==='study');
 assert.ok(assignment&&assignment.day>=2&&assignment.day<=10);const context=C.resolveMaterial(assignment.materialId,{data:d,catalog}),base=C.overlay(d.days.find(day=>day.day===assignment.day),projection,{data:d,catalog,assessment:A}),task=grammar(base),extra={...copy(d.materials.find(m=>m.id==='w02-read-1-grammar')),id:'retained-adaptive-grammar'};
 d.materials.push(context,extra);task.materialIds.push(extra.id);task.reinforcementMaterialIds=[extra.id];task.quantity+=extra.questions.length;task.materialPractice=[...(task.materialPractice||[]),{materialId:context.id,cycle:'first-planned',firstPlannedDay:base.day},{materialId:extra.id,cycle:'scheduled-reuse',firstPlannedDay:2}];task.grammarLearningPlan={newMaterialIds:[context.id],reviewMaterialIds:[task.materialIds[0],extra.id]};
 const draft={...oldDraft(base,d),materialId:context.id,answers:{[context.questions[0].id]:context.questions[0].answers[0]},materialBinding:P.freezeMaterialBinding(context,{assessment:A,task,courseDay:base.day,attemptId:'family-old-grammar-draft'})};draft.contextPracticeAssignment={...assignment,bindingContentHash:draft.materialBinding.contentHash};
 const draftBytes=JSON.stringify(draft),baseBytes=JSON.stringify(base),storage=memory(),saved=oldState(base);saved.startedDays=[1,base.day];saved.frozenDays[1]=copy(d.days[0]);storage.setItem(Adaptive.KEY,JSON.stringify(saved));const store=Adaptive.createStore({data:d,storage,now:()=>NOW,contextPractice:C,contextPracticeCatalog:catalog});store.adoptStarted({records:[source],drafts:[draft]});
 const day=store.getDay(base),unit=d.familyGrammarRelease.units.find(u=>u.day===base.day),effective=grammar(day);assert.deepEqual(effective.materialIds,[unit.materialId,context.id,extra.id]);assert.deepEqual(effective.coreMaterialIds,[unit.materialId,context.id]);assert.equal(effective.quantity,10+context.questions.length+extra.questions.length);assert.deepEqual(effective.contextPracticeAssignments,[assignment]);assert.deepEqual(effective.reinforcementMaterialIds,[extra.id]);assert.deepEqual(effective.grammarLearningPlan,{newMaterialIds:[unit.materialId,context.id],reviewMaterialIds:[extra.id]});assert.deepEqual(effective.materialPractice.map(row=>row.materialId),effective.materialIds);
 assert.deepEqual(day.publicContextPractice,base.publicContextPractice);assert.deepEqual(day.tasks.filter(t=>t.id!=='grammar'),base.tasks.filter(t=>t.id!=='grammar'));assert.ok(Flow.validFamilyGrammarProjection(day,d,{assessment:A}));assert.equal(JSON.stringify(Flow.restoreFamilyGrammarBase(day)),baseBytes);store.markStarted(base.day,day);assert.equal(JSON.stringify(store.read().frozenDays[base.day]),baseBytes);
 const playerState=P.newState();playerState.day=base.day;playerState.drafts[draft.id]=draft;assert.equal(JSON.stringify(P.parseState(playerState).drafts[draft.id]),draftBytes);assert.ok(P.resolveDraftMaterial(draft,context,{assessment:A}).compatible);assert.equal(C.beginAccess(context,effective.contextPracticeAssignments[0],{data:d,catalog,assessment:A,records:[source],now:NOW}).allowed,true);
 const record=sourceRecord(base.day,effective,context),artifact=A.decodeArtifact(record);artifact.contextPracticeAssignment={...assignment,bindingContentHash:artifact.materialBinding.contentHash};record.answer=JSON.stringify(artifact);assert.equal(C.submissionSatisfied(record,assignment,{assessment:A}),true);assert.ok(Hub.latestForMaterial(effective,[record],base.day,d.materials,d).has(context.id));assert.equal(Hub.taskState(effective,[record],{data:d,dayNumber:base.day}).done,false,'the retained context original cannot complete the new family unit');
 const Load=require('../assets/daily-learning-load.js'),queue=Load.build({data:{...d,days:[day]},records:[source],drafts:[draft],currentDay:base.day,current:{day:base.day,taskId:'grammar',active:false},now:NOW,assessment:A,player:P,hub:Hub,contextPractice:C,adaptivePlan:null,materialAccess:()=>({allowed:true}),summaryForDay:()=>({completionValid:false,remaining:0}),budget:{remainingMinutes:1,spentMinutes:359,exhausted:false}}),pending=queue.entries.filter(row=>row.taskId==='grammar');
 assert.deepEqual(pending.map(row=>row.materialId).sort(),effective.materialIds.slice().sort());assert.ok(pending.every(row=>row.fitsBudget===false));assert.equal(queue.next.kind,'rest');assert.equal(pending.find(row=>row.materialId===context.id).draftId,draft.id);assert.equal(JSON.stringify(draft),draftBytes);
 const unavailable={...d,materials:d.materials.filter(m=>m.id!==context.id)},held=project(base,unavailable,{records:[source],drafts:[draft]});assert.deepEqual(grammar(held).materialIds,effective.materialIds);assert.equal(grammar(held).quantity,effective.quantity,'unknown retained material keeps its original quantity allocation');
});

test('a genuinely bound new draft or pending Record keeps its assignment after another page completes all old grammar',()=>{
 const d=data(),base=d.days[2],old=completed(base,d),first=project(base,d,{records:old.slice(0,1)}),draft=oldDraft(first,d),material=d.materials.find(m=>m.id===grammar(first).materialIds[0]),draftBytes=JSON.stringify(draft),storage=memory();storage.setItem(Adaptive.KEY,JSON.stringify(oldState(base)));const store=Adaptive.createStore({data:d,storage,now:()=>NOW});
 store.adoptStarted({records:old.slice(0,1),drafts:[draft]});assert.deepEqual(store.getDay(base),first);store.markStarted(3,first);const frozen=JSON.stringify(store.read().frozenDays[3]);store.adoptStarted({records:old,drafts:[draft]});assert.deepEqual(store.getDay(base),first);assert.equal(JSON.stringify(draft),draftBytes);assert.equal(JSON.stringify(store.read().frozenDays[3]),frozen);
 const raw=sourceRecord(3,grammar(first),material),artifact=A.decodeArtifact(raw);artifact.dayPlanBinding=copy(draft.dayPlanBinding);raw.answer=JSON.stringify(artifact);raw.evaluation={method:'none',result:'pending',feedback:'Synthetic pending input'};const{version,...input}=raw,record=Records.put(Records.newState(),input,new Date(NOW).toISOString()).record;
 const held=project(base,d,{records:[...old,record]});assert.deepEqual(held,first);assert.equal(Hub.taskState(grammar(held),[record],{data:d,dayNumber:3}).pending,true);assert.equal(Hub.taskState(grammar(held),[record],{data:d,dayNumber:3}).done,false);assert.equal(record.evaluation.result,'pending');assert.equal(project(base,d,{records:old}),base,'an old completed module with no new start is still protected');
});

test('a material-ID stub, cross-day draft, wrong version or invalid day binding cannot reopen an already completed old module',()=>{
 const d=data(),base=d.days[2],old=completed(base,d),first=project(base,d),draft=oldDraft(first,d),fake={id:'fake-new-start',materialId:draft.materialId,taskId:'grammar',courseDay:3};
 const invalid=[fake,...[value=>{value.courseDay=2;},value=>{delete value.dayPlanBinding;},value=>{value.materialBinding.material.version='wrong-version';value.materialBinding.contentHash=A.materialContentHash(value.materialBinding.material);},value=>{value.dayPlanBinding.day.tasks.find(t=>t.id==='reading').instructions+=' changed';value.dayPlanBinding.contentHash=A.materialContentHash(value.dayPlanBinding.day);}].map(change=>{const value=copy(draft);change(value);return value;})];
 for(const value of invalid)assert.equal(project(base,d,{records:old,drafts:[value]}),base);assert.equal(project(base,d,{records:old}),base);
 const raw=sourceRecord(3,grammar(first),d.materials.find(m=>m.id===draft.materialId)),a=A.decodeArtifact(raw);a.dayPlanBinding=copy(draft.dayPlanBinding);raw.answer=JSON.stringify(a);const{version,...input}=raw,record=Records.put(Records.newState(),input,new Date(NOW).toISOString()).record;
 for(const mutate of [value=>{value.dayNumber=2;},value=>{value.materialVersion='wrong-version';},value=>{const a=A.decodeArtifact(value);delete a.dayPlanBinding;value.answer=JSON.stringify(a);}]){const value=copy(record);mutate(value);assert.equal(project(base,d,{records:[...old,value]}),base);}
});
