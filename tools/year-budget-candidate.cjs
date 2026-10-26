'use strict';
// Integration candidate only. No profile access, persistent writes or activation.
const B=require('./year-budget-estimates.cjs'),P=require('./year-budget-planner.cjs');
const legacy=require('../assets/course-expansion.js');
function futureBreaks(minutes,clock,policy){
 let remaining=minutes,focusUsed=clock.focusMinutesUsed,cycles=clock.completedFocusCycles,rest=clock.breakDueMinutes||0;
 if(!remaining)return rest;
 while(remaining>0){const step=Math.min(remaining,policy.focusMinutes-focusUsed);remaining-=step;focusUsed+=step;if(focusUsed>=policy.focusMinutes){cycles++;focusUsed=0;if(remaining>0)rest+=cycles%policy.cycles===0?policy.longBreakMinutes:policy.shortBreakMinutes;}}
 return rest;
}
function actualBudget(remainingStudyMinutes,clock,policy=B.DEFAULT){
 if(!Number.isFinite(policy.totalMinutes)||policy.totalMinutes<=0||!Number.isFinite(policy.focusMinutes)||policy.focusMinutes<=0||!Number.isInteger(policy.cycles)||policy.cycles<1||![policy.shortBreakMinutes,policy.longBreakMinutes].every(n=>Number.isFinite(n)&&n>=0))return{known:false,reason:'invalid-budget-policy'};
 if(!clock||!Number.isFinite(clock.elapsedCalendarMinutes)||clock.elapsedCalendarMinutes<0||!Number.isFinite(clock.focusMinutesUsed)||clock.focusMinutesUsed<0||clock.focusMinutesUsed>=policy.focusMinutes||!Number.isInteger(clock.completedFocusCycles)||clock.completedFocusCycles<0||!Number.isFinite(remainingStudyMinutes)||remainingStudyMinutes<0)return {known:false,reason:'missing-or-invalid-shared-calendar-clock'};
 const due=clock.breakDueMinutes===undefined?0:clock.breakDueMinutes;if(!Number.isFinite(due)||due<0)return{known:false,reason:'invalid-due-break'};
 const breaks=futureBreaks(remainingStudyMinutes,clock,policy),total=clock.elapsedCalendarMinutes+remainingStudyMinutes+breaks;
 return{known:true,elapsedCalendarMinutes:clock.elapsedCalendarMinutes,remainingStudyMinutes,additionalBreakMinutes:breaks,totalMinutes:total,withinBudget:total<=Math.min(360,policy.totalMinutes)};
}
function applyBudgetOverlay(baseDay,data,runtime={}){
 const plan=data?.yearExpansion,unchanged=reason=>({day:baseDay,status:'unchanged',reason,pending:plan?.assignments?.[baseDay?.day]?.rows?.map(r=>r.materialId)||[]});
 if(runtime.started||runtime.frozen)return unchanged('started-or-frozen');
 if(plan?.schema!==P.SCHEMA)return{day:legacy.yearOverlay(baseDay,data),status:'legacy-compatible',pending:[]};
 if(plan.active!==true)return unchanged('inactive');
 if(runtime.started!==false||runtime.frozen!==false)return unchanged('owner-course-state-not-verified');
 const slot=plan.assignments?.[baseDay?.day];if(!slot)return unchanged('no-first-use-slot');
 const map=new Map((data.materials||[]).map(m=>[m.id,m]));if(P.protectedReason(baseDay,map))return unchanged('protected-day');
 if(runtime.contextCatalogHash!==plan.contextCatalogHash||runtime.publicPlanHash!==plan.publicPlanHash)return unchanged('public-or-context-plan-changed-replan');
 // This verifier is supplied by the existing owner/day/public-plan runtime. Its
 // absence is a visible integration gap, not a signal to use a bare base day.
 if(typeof runtime.verifyPublicComposition!=='function'||runtime.verifyPublicComposition(baseDay,slot,plan)!==true)return unchanged('public-composition-not-verified');
 for(const row of slot.requiredPublicMaterials||[])if(!baseDay.tasks.find(t=>t.id===row.taskId)?.materialIds.includes(row.materialId))return unchanged('required-public-material-missing');
 for(const row of slot.baselineMaterials||[]){
  if(baseDay.tasks.find(t=>t.id===row.taskId)?.materialIds.includes(row.materialId)){if(!map.has(row.materialId)||P.hash(map.get(row.materialId))!==row.materialHash)return unchanged('core-or-public-content-changed-replan');}
  else if(typeof runtime.verifyMissingCoreMaterial!=='function'||runtime.verifyMissingCoreMaterial(row,baseDay,plan)!==true)return unchanged('removed-core-completion-guard-not-verified');
 }
 const rows=[...slot.rows].sort((a,b)=>Number(!!a.parentMaterialId)-Number(!!b.parentMaterialId)),pendingDetails=[],admitted=[];
 const extra=slot.baselineExtraStudyMinutes+slot.semanticContextMinutes+plan.policy.contingencyStudyMinutes;
 let result=P.clone(baseDay),budget;
 for(const row of rows){
  const reject=reason=>pendingDetails.push({materialId:row.materialId,reason}),m=map.get(row.materialId);
  if(!m||P.hash(m)!==row.materialHash){reject('material-changed-replan');continue;}
  if(m.pool!=='training'||m.fullTest){reject('reserved-material');continue;}
  if(typeof runtime.verifyPlacement!=='function'||runtime.verifyPlacement(m)!==true){reject('actual-placement-not-verified');continue;}
  if(row.parentMaterialId&&(typeof runtime.verifyParentCompletion!=='function'||runtime.verifyParentCompletion(row.parentMaterialId)!==true)){reject('actual-parent-completion-not-verified');continue;}
  if(typeof runtime.hasOrdinaryCompletion!=='function'){reject('ordinary-completion-state-not-verified');continue;}
  const completed=runtime.hasOrdinaryCompletion(row.materialId);if(completed!==true&&completed!==false){reject('ordinary-completion-state-not-verified');continue;}
  if(completed===true){reject('already-completed-replan-no-forced-repeat');continue;}
  const candidate=P.clone(result),skill=row.skill,task=candidate.tasks.find(t=>t.id===skill);
  if(!task){reject('target-task-missing');continue;}
  if((task.materialIds||[]).includes(row.materialId)){reject('already-applied');continue;}
  task.materialIds=[...(task.materialIds||[]),row.materialId];
  task.materialPractice=[...(task.materialPractice||[]),slot.materialPractice[row.materialId]];
  task.yearExpansion={version:plan.version,addedMaterialIds:[...(task.yearExpansion?.addedMaterialIds||[]),row.materialId],mode:'first-use-only',actualMasteryCredit:false};
  const materials=task.materialIds.map(id=>map.get(id));
  if(['grammar','reading','listening'].includes(skill))task.quantity=materials.reduce((s,m)=>s+(m?.questions?.length||0),0);
  if(skill==='vocabulary')task.quantity=materials.reduce((s,m)=>s+(m?.vocabulary?.length||0),0);
  if(['speaking','writing'].includes(skill))task.quantity=materials.reduce((s,m)=>s+(m?.minWords||12),0);
  // Admit independently: a deferred derivative cannot block its source reading.
  const cost=B.dayCost(candidate,map,plan.policy,extra);if(!cost.known){reject('unknown-material-workload');continue;}
  const nextBudget=actualBudget(cost.studyMinutes,runtime.clock,plan.policy);
  if(!nextBudget.known||!nextBudget.withinBudget){reject(nextBudget.reason||'shared-calendar-capacity-exhausted');continue;}
  result=candidate;budget=nextBudget;admitted.push(row.materialId);
 }
 if(!admitted.length)return{...unchanged(pendingDetails[0]?.reason||'no-first-use-ready'),pendingDetails};
 result.yearExpansion={version:plan.version,schema:plan.schema,firstUseMaterialIds:admitted,budget,referenceOnly:true};
 return{day:result,status:pendingDetails.length?'applied-first-use-partial':'applied-first-use',pending:pendingDetails.map(r=>r.materialId),pendingDetails,admitted,budget};
}
function admitSpacedPractice(job,context){
 const fail=reason=>({status:'pending',reason,jobId:job?.id});
 if(!job||!['actual-error-correction','new-context-retrieval'].includes(job.kind))return fail('unsupported-practice-kind');
 if(context.started||context.frozen)return fail('started-or-frozen');
 if(context.started!==false||context.frozen!==false)return fail('owner-course-state-not-verified');
 const material=(context.materials||[]).find(m=>m.id===job.materialId);if(!material||material.pool!=='training'||material.fullTest)return fail('unknown-or-reserved-source');
 if(!Number.isFinite(job.estimatedStudyMinutes)||job.estimatedStudyMinutes<=0)return fail('unknown-review-workload');
 if(typeof context.verifyLearningEvidence!=='function'||context.verifyLearningEvidence(job)!==true)return fail('actual-learning-evidence-required');
 if(job.kind==='actual-error-correction'&&(typeof context.verifyRecordedError!=='function'||context.verifyRecordedError(job)!==true))return fail('recorded-error-evidence-required');
 if(job.kind==='new-context-retrieval'&&(typeof context.verifyDifferentContext!=='function'||context.verifyDifferentContext(job)!==true))return fail('different-context-required');
 if(!Number.isFinite(context.remainingRequiredStudyMinutes)||context.remainingRequiredStudyMinutes<0)return fail('remaining-core-public-context-workload-required');
 const p={...B.DEFAULT,...context.policy},budget=actualBudget(context.remainingRequiredStudyMinutes+job.estimatedStudyMinutes,context.clock,p);
 if(!budget.known||!budget.withinBudget)return{...fail(budget.reason||'shared-calendar-capacity-exhausted'),budget};
 return{status:'admitted-practice',jobId:job.id,budget,independentAssessmentEligible:false,masteryCredit:false};
}
function admitFirstUseQueueItem(row,context){
 const fail=reason=>({status:'pending',reason,materialId:row?.materialId});
 // A separate not-yet-started queue entry may carry work forward; this function
 // never appends to, edits or unfreezes the historical course bundle.
 if(context.queueEntryStarted!==false||context.queueEntryFrozen!==false)return fail('queue-entry-state-not-verified-or-locked');
 const material=(context.materials||[]).find(m=>m.id===row?.materialId);if(!material||material.pool!=='training'||material.fullTest)return fail('unknown-or-reserved-source');
 if(P.hash(material)!==row.materialHash)return fail('material-changed-replan');
 if(typeof context.verifyPlacement!=='function'||context.verifyPlacement(material)!==true)return fail('actual-placement-not-verified');
 if(row.parentMaterialId&&(typeof context.verifyParentCompletion!=='function'||context.verifyParentCompletion(row.parentMaterialId)!==true))return fail('actual-parent-completion-not-verified');
 if(typeof context.hasOrdinaryCompletion!=='function'||context.hasOrdinaryCompletion(row.materialId)!==false)return fail('already-completed-or-completion-state-unknown');
 if(!Number.isFinite(context.remainingRequiredStudyMinutes)||context.remainingRequiredStudyMinutes<0)return fail('remaining-core-public-context-workload-required');
 const policy={...B.DEFAULT,...context.policy},estimate=B.estimate(material,policy);if(!estimate.known)return fail(estimate.reason);
 const budget=actualBudget(context.remainingRequiredStudyMinutes+estimate.minutes,context.clock,policy);
 if(!budget.known||!budget.withinBudget)return{...fail(budget.reason||'shared-calendar-capacity-exhausted'),budget};
 return{status:'admitted-first-use-queue-item',materialId:row.materialId,originalPlannedCourseIndex:row.day||null,budget,changesHistoricalCourse:false,sourceReadinessFromActualEvidence:true,independentAssessmentEligible:false,masteryCredit:false};
}
module.exports={futureBreaks,actualBudget,applyBudgetOverlay,admitSpacedPractice,admitFirstUseQueueItem};
