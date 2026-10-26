'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./year-budget-fixture.cjs'),P=require('../tools/year-budget-planner.cjs'),B=require('../tools/year-budget-estimates.cjs'),R=require('../tools/year-budget-candidate.cjs');
const actualInput=load(),input=actualInput.legacyInput,plan=P.build(input),map=new Map([...input.base.materials,...input.yearMaterials].map(m=>[m.id,m])),composed=P.composeBaseline(input.base,plan.policy);
function fixture(slot){
 const day=composed.days.find(d=>d.day===slot.day).composedDay;
 return{day,data:{materials:[...map.values()],yearExpansion:{...plan,active:true}},runtime:{started:false,frozen:false,clock:{elapsedCalendarMinutes:0,focusMinutesUsed:0,completedFocusCycles:0},contextCatalogHash:plan.contextCatalogHash,publicPlanHash:plan.publicPlanHash,verifyPublicComposition:()=>true,verifyPlacement:()=>true,verifyParentCompletion:()=>true,hasOrdinaryCompletion:()=>false}};
}
test('all 688 identities are accounted for once, including all 272 first-use sources',()=>{
 assert.equal(plan.ledger.length,688);assert.equal(new Set(plan.ledger.map(r=>r.materialId)).size,688);assert.deepEqual(plan.summary.sources,{total:272,assigned:272,pending:0});
 assert.equal(plan.summary.all.assigned+plan.summary.all.pending,688);assert.equal(plan.summary.sameMaterialForcedRepeats,0);
 const ids=Object.values(plan.assignments).flatMap(s=>Object.values(s.taskMaterialIds).flat());assert.equal(ids.length,new Set(ids).size);assert.equal(ids.length,461);
});
test('first-use source order, level, ordinary pool, and complete protected days are preserved',()=>{
 const first=new Map(plan.ledger.filter(r=>r.day).map(r=>[r.materialId,r.day]));
 for(const row of plan.ledger.filter(r=>r.day)){
  const source=map.get(row.materialId),day=input.base.days[row.day-1];assert.equal(source.pool,'training');assert.equal(source.fullTest,false);assert.equal(P.protectedReason(day,map),null);assert(P.levelEligible(source,day,map,plan.policy));assert(row.day>=row.releaseDay);
  if(row.parentMaterialId)assert(first.get(row.parentMaterialId)<row.day);
 }
 for(const d of composed.days.filter(d=>d.protectedReason))assert.equal(plan.assignments[d.day],undefined);
});
test('all 75 public variants and 137 future review reservations coexist within every added slot',()=>{
 assert.equal(plan.summary.requiredPublicVariantsRetained,75);assert.equal(plan.summary.existingPublicReviewReservations,137);assert.equal(plan.summary.semanticContextReservations,6);
 for(const day of plan.days.filter(d=>d.yearMaterialIds.length)){
  assert(day.budget.totalMinutes<=360);assert.equal(day.budget.studyMinutes,day.baseline.studyMinutes+day.semanticContextStudyMinutes+day.yearStudyMinutes+15);
  const composedIds=composed.days[day.day-1].composedDay.tasks.flatMap(t=>t.materialIds);for(const a of input.base.publicCoursePlan.assignments.filter(a=>a.day===day.day))assert(composedIds.includes(a.materialId));
 }
 assert(plan.days.some(d=>d.publicContextStudyMinutes>0));
});
test('unit estimates never shrink author durations; timed complete papers are not practice doubles',()=>{
 for(const m of map.values()){const e=B.estimate(m,plan.policy);assert(e.known,m.id);assert(e.minutes>=m.estimatedMinutes,m.id);if(m.fullTest){assert.equal(e.minutes,m.estimatedMinutes);assert.equal(B.estimate(m,{...plan.policy,estimateScale:1.25}).minutes,m.estimatedMinutes);}}
 assert.deepEqual(plan.summary.baselineOverBudgetDays,[2,365]);assert.throws(()=>P.build(input,{policy:{estimateScale:0.8}}));
});
test('recomputing does not mutate source/core/public data or label minutes',()=>{
 const before=P.hash(input),again=P.build(input);assert.equal(P.hash(input),before);assert.equal(P.hash(again),P.hash(plan));
 const f=fixture(Object.values(plan.assignments)[0]),original=P.clone(f.day),r=R.applyBudgetOverlay(f.day,f.data,f.runtime);assert.equal(r.status,'applied-first-use');assert.deepEqual(f.day,original);
 assert.deepEqual(r.day.tasks.map(t=>t.minutes),original.tasks.map(t=>t.minutes));assert.deepEqual(r.day.tasks.map(t=>t.coreMaterialIds),original.tasks.map(t=>t.coreMaterialIds));
});
test('started/frozen course protection holds during recompute and runtime',()=>{
 const chosen=Object.keys(plan.assignments).slice(0,2).map(Number),p=P.build(input,{startedDays:[chosen[0]],frozenDays:[chosen[1]]});for(const n of chosen)assert.equal(p.assignments[n],undefined);
 const f=fixture(plan.assignments[chosen[0]]);for(const flag of ['started','frozen']){const r=R.applyBudgetOverlay(f.day,f.data,{...f.runtime,[flag]:true});assert.equal(r.day,f.day);assert.equal(r.reason,'started-or-frozen');}
 assert.equal(R.applyBudgetOverlay(f.day,f.data,{...f.runtime,started:undefined}).reason,'owner-course-state-not-verified');
});
test('unknown audio duration remains visible pending, never admitted as free work',()=>{
 const altered=P.clone(input);const m=altered.yearMaterials.find(m=>m.skill==='listening');delete m.audioDurationSeconds;
 const p=P.build(altered),row=p.ledger.find(r=>r.materialId===m.id);assert.equal(row.status,'pending');assert.equal(row.reason,'missing-positive-audio-duration');assert.equal(p.ledger.length,688);
});
test('runtime fails closed without actual placement, source completion or ordinary-completion state',()=>{
 const slot=Object.values(plan.assignments).find(s=>s.rows.some(r=>r.parentMaterialId)),f=fixture(slot);
 assert.equal(R.applyBudgetOverlay(f.day,f.data,{...f.runtime,verifyPlacement:undefined}).reason,'actual-placement-not-verified');
 const parentBlocked=R.applyBudgetOverlay(f.day,f.data,{...f.runtime,verifyParentCompletion:()=>false});assert(parentBlocked.pendingDetails.some(row=>row.reason==='actual-parent-completion-not-verified'));
 assert.equal(R.applyBudgetOverlay(f.day,f.data,{...f.runtime,hasOrdinaryCompletion:()=>undefined}).reason,'ordinary-completion-state-not-verified');
 assert.equal(R.applyBudgetOverlay(f.day,f.data,{...f.runtime,hasOrdinaryCompletion:()=>true}).reason,'already-completed-replan-no-forced-repeat');
});
test('bare-base/public omission, stale content or catalog cannot bypass composition budget',()=>{
 const slot=Object.values(plan.assignments).find(s=>s.requiredPublicMaterials.length),f=fixture(slot),bare=input.base.days[slot.day-1];
 assert.equal(R.applyBudgetOverlay(bare,f.data,f.runtime).reason,'required-public-material-missing');
 assert.equal(R.applyBudgetOverlay(f.day,f.data,{...f.runtime,contextCatalogHash:'changed'}).reason,'public-or-context-plan-changed-replan');
 const changed=P.clone(f.data);changed.materials.find(m=>m.id===slot.baselineMaterials[0].materialId).estimatedMinutes++;
 assert.equal(R.applyBudgetOverlay(f.day,changed,f.runtime).reason,'core-or-public-content-changed-replan');
 const removed=P.clone(f.day);removed.tasks[0].materialIds.shift();assert.equal(R.applyBudgetOverlay(removed,f.data,f.runtime).reason,'removed-core-completion-guard-not-verified');
});
test('remaining daily clock is shared across courses and keeps partial focus cycles',()=>{
 const slot=Object.values(plan.assignments).find(s=>s.budget.totalMinutes===360),f=fixture(slot);
 assert.equal(R.applyBudgetOverlay(f.day,f.data,{...f.runtime,clock:{elapsedCalendarMinutes:10,focusMinutesUsed:10,completedFocusCycles:0}}).reason,'shared-calendar-capacity-exhausted');
 assert.equal(R.applyBudgetOverlay(f.day,f.data,{...f.runtime,clock:undefined}).reason,'missing-or-invalid-shared-calendar-clock');
 assert.equal(R.actualBudget(2,{elapsedCalendarMinutes:24,focusMinutesUsed:24,completedFocusCycles:0}).additionalBreakMinutes,5);
 assert.equal(R.actualBudget(2,{elapsedCalendarMinutes:99,focusMinutesUsed:24,completedFocusCycles:3}).additionalBreakMinutes,15);
 assert.equal(R.actualBudget(10,{elapsedCalendarMinutes:10,focusMinutesUsed:10,completedFocusCycles:0}).withinBudget,true);
 assert.equal(R.actualBudget(20,{elapsedCalendarMinutes:350,focusMinutesUsed:0,completedFocusCycles:0},{...B.DEFAULT,totalMinutes:400}).withinBudget,false);
 assert.equal(R.actualBudget(20,{elapsedCalendarMinutes:350,focusMinutesUsed:0,completedFocusCycles:0},{...B.DEFAULT,focusMinutes:0}).known,false);
});
test('actual error/new-context review consumes remaining required core/public/context time',()=>{
 const m=input.yearMaterials[0],job={id:'review-test',materialId:m.id,kind:'new-context-retrieval',estimatedStudyMinutes:8},context={started:false,frozen:false,materials:[m],clock:{elapsedCalendarMinutes:10,focusMinutesUsed:10,completedFocusCycles:0},remainingRequiredStudyMinutes:20,verifyLearningEvidence:()=>true,verifyDifferentContext:()=>true};
 assert.equal(R.admitSpacedPractice(job,context).status,'admitted-practice');
 assert.equal(R.admitSpacedPractice(job,{...context,verifyLearningEvidence:()=>false}).reason,'actual-learning-evidence-required');
 assert.equal(R.admitSpacedPractice(job,{...context,verifyDifferentContext:()=>false}).reason,'different-context-required');
 assert.equal(R.admitSpacedPractice(job,{...context,remainingRequiredStudyMinutes:350}).reason,'shared-calendar-capacity-exhausted');
 assert.equal(R.admitSpacedPractice({...job,kind:'actual-error-correction'},context).reason,'recorded-error-evidence-required');
 assert.equal(R.admitSpacedPractice(job,{...context,materials:[{...m,pool:'gate',fullTest:true}]}).reason,'unknown-or-reserved-source');
});
test('legacy year plan contract remains identical, candidate remains inactive by default',()=>{
 const legacy=require('../assets/course-expansion.js'),day=input.base.days[2],assignments=input.Year.assignments(input.base.days,input.yearMaterials),data={materials:[...map.values()],yearExpansion:{active:true,version:'legacy',assignments}};
 assert.deepEqual(R.applyBudgetOverlay(day,data).day,legacy.yearOverlay(day,data));
 const f=fixture(Object.values(plan.assignments)[0]);f.data.yearExpansion.active=false;assert.equal(R.applyBudgetOverlay(f.day,f.data,f.runtime).reason,'inactive');
 assert.equal(plan.active,false);assert.equal(plan.summary.actualLearningOrMasteryValidated,false);
});
test('a static pending item can use later actual free capacity without changing its old course',()=>{
 const row=plan.ledger.find(r=>r.status==='pending'),context={queueEntryStarted:false,queueEntryFrozen:false,materials:[...map.values()],clock:{elapsedCalendarMinutes:30,focusMinutesUsed:0,completedFocusCycles:1},remainingRequiredStudyMinutes:20,verifyPlacement:()=>true,verifyParentCompletion:()=>true,hasOrdinaryCompletion:()=>false};
 const before=P.hash(input.base.days),r=R.admitFirstUseQueueItem(row,context);assert.equal(r.status,'admitted-first-use-queue-item');assert.equal(r.changesHistoricalCourse,false);assert.equal(P.hash(input.base.days),before);
 assert.equal(R.admitFirstUseQueueItem(row,{...context,clock:{elapsedCalendarMinutes:350,focusMinutesUsed:0,completedFocusCycles:10}}).reason,'shared-calendar-capacity-exhausted');
 assert.equal(R.admitFirstUseQueueItem(row,{...context,verifyParentCompletion:()=>false}).reason,'actual-parent-completion-not-verified');
 assert.equal(R.admitFirstUseQueueItem(row,{...context,queueEntryFrozen:true}).reason,'queue-entry-state-not-verified-or-locked');
});
test('a same-bundle uncompleted derivative cannot prevent its source from entering',()=>{
 const slot=Object.values(plan.assignments).find(s=>s.rows.some(r=>r.skill==='reading')),f=fixture(slot),parent=slot.rows.find(r=>r.skill==='reading'),child=plan.ledger.find(r=>r.parentMaterialId===parent.materialId&&r.skill==='grammar');
 f.data.yearExpansion=P.clone(f.data.yearExpansion);const s=f.data.yearExpansion.assignments[slot.day];s.rows.push(child);s.taskMaterialIds.grammar=[...(s.taskMaterialIds.grammar||[]),child.materialId];s.materialPractice[child.materialId]={materialId:child.materialId,cycle:'first-planned',firstPlannedDay:slot.day};
 const result=R.applyBudgetOverlay(f.day,f.data,{...f.runtime,verifyParentCompletion:()=>false});assert.equal(result.status,'applied-first-use-partial');assert(result.admitted.includes(parent.materialId));assert(!result.admitted.includes(child.materialId));assert(result.pendingDetails.some(r=>r.materialId===child.materialId&&r.reason==='actual-parent-completion-not-verified'));
 const later=R.admitFirstUseQueueItem(child,{queueEntryStarted:false,queueEntryFrozen:false,materials:f.data.materials,clock:{elapsedCalendarMinutes:40,focusMinutesUsed:10,completedFocusCycles:1},remainingRequiredStudyMinutes:20,verifyPlacement:()=>true,verifyParentCompletion:id=>id===parent.materialId,hasOrdinaryCompletion:()=>false});assert.equal(later.status,'admitted-first-use-queue-item');
});
test('required public completeness follows the actual reviewed roster, not the current count 75',()=>{
 const material=id=>({id,skill:'reading',level:'A0',pool:'training',fullTest:false,estimatedMinutes:10,questions:[],source:{verification:'reviewed'}}),core=material('core'),pub={...material('public-test'),source:{verification:'reviewed',publicSourceId:'test'}};
 const base={materials:[core,pub],days:[{day:2,week:1,tasks:[{id:'reading',minutes:20,materialIds:['core']}]}],publicCoursePlan:{assignments:[{day:2,taskId:'reading',materialId:'public-test'}],blocked:[],dailyChanges:[{day:2,tasks:[{taskId:'reading',materialIdsBefore:['core'],materialIdsAfter:['core','public-test'],predictedStudyAfter:20}]}]}};
 assert.equal(P.composeBaseline(base,B.DEFAULT).publicPlan.assignments.length,1);
 const missing=P.clone(base);missing.publicCoursePlan.assignments=[];assert.throws(()=>P.composeBaseline(missing,B.DEFAULT),/exactly cover/);
 const orphan=P.clone(base);orphan.publicCoursePlan.dailyChanges=[];assert.throws(()=>P.composeBaseline(orphan,B.DEFAULT),/composed material slot/);
});
