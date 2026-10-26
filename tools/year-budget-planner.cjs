'use strict';
const crypto=require('node:crypto'),assert=require('node:assert/strict');
const B=require('./year-budget-estimates.cjs');
const SCHEMA='year-budget-first-use-v1';
const clone=x=>JSON.parse(JSON.stringify(x));
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
// Exported core content only: stable across build audit updates and sidecar metadata.
const coreContract=data=>Object.fromEntries(['version','status','createdDate','scope','weeks','materials','days','gates','lessonExpansions'].filter(k=>data[k]!==undefined).map(k=>[k,data[k]]));
const sum=(xs,f=x=>x)=>xs.reduce((s,x)=>s+f(x),0);
const SKILLS=['reading','listening','writing','grammar','vocabulary','speaking'];
function protectedReason(day,map){
 if(day.day===1||day.day===365)return 'day-1-or-365';
 if(day.tasks.some(t=>t.mode==='assessment'||t.skill==='assessment'||t.id==='assessment'))return 'assessment-day';
 if(day.tasks.some(t=>(t.materialIds||[]).some(id=>{const m=map.get(id);return !m||m.fullTest||m.pool==='gate'||m.pool==='final'||m.pool==='independent';})))return 'reserved-or-unknown-core-material';
 return null;
}
function composeBaseline(base,policy){
 const map=new Map(base.materials.map(m=>[m.id,m])),publicPlan=base.publicCoursePlan;
 const requiredPublic=base.materials.filter(m=>m.source?.publicSourceId&&m.pool==='training'&&!m.fullTest&&['reading','listening'].includes(m.skill));
 assert(requiredPublic.every(m=>m.source.verification==='reviewed'),'public material roster must be reviewed');
 assert.equal(publicPlan.blocked?.length||0,0,'required public plan must not contain blocked variants');
 const assignedPublic=publicPlan.assignments.map(a=>a.materialId);
 assert.equal(new Set(assignedPublic).size,assignedPublic.length,'public assignments must be unique');
 assert.deepEqual([...assignedPublic].sort(),requiredPublic.map(m=>m.id).sort(),'required public plan must exactly cover the reviewed material roster');
 const changes=new Map(publicPlan.dailyChanges.map(c=>[c.day,c]));
 assert.equal(changes.size,publicPlan.dailyChanges.length,'public daily changes must be unique');
 for(const assignment of publicPlan.assignments){const c=changes.get(assignment.day)?.tasks.find(t=>t.taskId===assignment.taskId);assert(c?.materialIdsAfter?.includes(assignment.materialId),'every required public assignment must have a composed material slot');}
 const days=base.days.map(original=>{
  const day=clone(original),change=changes.get(day.day),extra=[];
  // A static prior occurrence is not completed-learning evidence. Reserve originals
  // AND the public replacement, until the runtime proves the existing guard.
  for(const c of change?.tasks||[]){
   const task=day.tasks.find(t=>t.id===c.taskId);assert(task,'public task exists');
   assert.deepEqual(task.materialIds,c.materialIdsBefore,'public plan must bind the frozen core');
   task.materialIds=[...new Set([...task.materialIds,...c.materialIdsAfter])];
   const authorSum=sum(c.materialIdsAfter,id=>map.get(id)?.estimatedMinutes||0);
   const minutes=c.predictedStudyAfter-authorSum;
   assert(minutes>=0,'public/context calculation must not hide missing time');
   if(minutes)extra.push({kind:'public-source-context-and-spaced-review',taskId:c.taskId,minutes:Math.ceil(minutes*policy.estimateScale)});
  }
  const c=B.dayCost(day,map,policy,sum(extra,x=>x.minutes));
  return {day:day.day,week:day.week,coreDay:original,coreHash:hash(original),composedDay:day,composedHash:hash(day),protectedReason:protectedReason(original,map),publicAssignmentIds:publicPlan.assignments.filter(a=>a.day===day.day).map(a=>a.assignmentId),publicReviewIds:(publicPlan.reviews||[]).filter(a=>a.day===day.day).map(a=>a.reviewId),contextAndReview:extra,baseline:c,semanticContext:[],semanticContextMinutes:0,year:[],yearMinutes:0};
 });
 return {days,map,publicPlan};
}
function levelEligible(material,day,map,policy){
 const src=B.level(material.level),task=day.tasks.find(t=>t.id===material.skill);if(!src||!task)return false;
 const ranks=(task.materialIds||[]).map(id=>map.get(id)).filter(m=>m&&!m.source?.publicSourceId).map(m=>B.level(m.level)).filter(Boolean);
 if(!ranks.length)return false;
 const ceiling=Math.max(...ranks.map(x=>x.high)),floor=Math.min(...ranks.map(x=>x.low));
 return src.high<=ceiling && src.low>=floor-policy.maxBelowLevel;
}
function stateBudget(state,policy,additional=0){
 return B.forecast(state.baseline.studyMinutes+state.semanticContextMinutes+state.yearMinutes+policy.contingencyStudyMinutes+additional,policy);
}
function build(input,options={}){
 const policy={...B.DEFAULT,maxNewMaterialsPerDay:3,maxBelowLevel:1,...options.policy};
 for(const k of ['totalMinutes','focusMinutes','shortBreakMinutes','longBreakMinutes','cycles','estimateScale','vocabularyMinutesPerWord','grammarMinutesPerQuestion','maxNewMaterialsPerDay'])assert(Number.isFinite(policy[k])&&policy[k]>0,`invalid positive policy ${k}`);
 assert(policy.totalMinutes<=360,'daily limit may not exceed 360');assert(policy.estimateScale>=1,'never lower published/reference workload to make it fit');
 assert(Number.isFinite(policy.contingencyStudyMinutes)&&policy.contingencyStudyMinutes>=0,'contingency must be finite and nonnegative');
 assert(Number.isInteger(policy.maxBelowLevel)&&policy.maxBelowLevel>=0,'maxBelowLevel must be a nonnegative integer');
 assert(Number.isInteger(policy.cycles)&&Number.isInteger(policy.maxNewMaterialsPerDay),'cycles and maxNewMaterialsPerDay must be positive integers');
 const lockedDays=new Set([...(options.startedDays||[]),...(options.frozenDays||[])]);
 const {base,yearMaterials,catalog}=input,{days,map,publicPlan}=composeBaseline(base,policy);
 const pristine=hash({base,yearMaterials,catalog});
 assert.equal(new Set(yearMaterials.map(m=>m.id)).size,yearMaterials.length,'unique material identities');
 const semanticContext=[];
 // These are reservations, not proof that either source/study/review has happened.
 for(const pack of catalog.packs||[]){
  const linked=publicPlan.assignments.filter(a=>a.sourceId===pack.sourceId).sort((a,b)=>a.day-b.day)[0];let priorDay=null;
  for(const stage of ['study','review']){
   const row={id:`context-grammar:${pack.id}:${stage}`,packId:pack.id,sourceId:pack.sourceId,stage,estimatedMinutes:Math.ceil(pack.estimatedMinutes[stage]*policy.estimateScale),requiresActualSourceCompletion:true,requiresActualPriorStudy:stage==='review',minimumDelayHours:stage==='review'?pack.delayHours:0,independentAssessmentEligible:false};
   const earliest=stage==='study'?(linked?.day||365)+1:(priorDay===null?365:priorDay+Math.ceil((pack.delayHours||48)/24));
   const fit=days.find(s=>s.day>=earliest&&!s.protectedReason&&!lockedDays.has(s.day)&&s.baseline.known&&stateBudget(s,policy,row.estimatedMinutes).totalMinutes<=policy.totalMinutes);
   if(fit){row.status='reserved-conditional';row.day=fit.day;fit.semanticContext.push(row.id);fit.semanticContextMinutes+=row.estimatedMinutes;if(stage==='study')priorDay=fit.day;}
   else {row.status='pending';row.reason=!linked?'no-linked-public-source':stage==='review'&&priorDay===null?'prior-study-not-reserved':'no-capacity-before-year-end';}
   semanticContext.push(row);
  }
 }
 const estimates=new Map(yearMaterials.map(m=>[m.id,B.estimate(m,policy)])),assigned=new Map(),ledger=[];
 // Source coverage is prioritized before derivative reinforcement. No source is
 // sacrificed silently to fit one of its derived tasks.
 const ordered=[...yearMaterials].sort((a,b)=>Number(!!a.sourceMaterialId)-Number(!!b.sourceMaterialId)||a.week-b.week||SKILLS.indexOf(a.skill)-SKILLS.indexOf(b.skill)||a.id.localeCompare(b.id));
 for(const m of ordered){
  const e=estimates.get(m.id),releaseDay=Math.max(2,(m.week-1)*7+1,(m.availableAfterWeek||0)*7+1),row={materialId:m.id,materialHash:hash(m),skill:m.skill,level:m.level,sourceWeek:m.week,kind:m.sourceMaterialId?'derived':'source',parentMaterialId:m.sourceMaterialId||null,releaseDay,estimate:e,mode:'practice',independentAssessmentEligible:false,independentTransferEligible:false};
  if(m.pool!=='training'||m.fullTest){row.status='pending';row.reason='not-ordinary-training';ledger.push(row);continue;}
  if(!e.known){row.status='pending';row.reason=e.reason;ledger.push(row);continue;}
  if(m.sourceMaterialId&&!assigned.has(m.sourceMaterialId)){row.status='pending';row.reason='parent-first-use-pending';ledger.push(row);continue;}
  const rejects={protected:0,startedOrFrozen:0,level:0,parentOrder:0,unknownBudget:0,dailyCount:0,sameSkill:0,budget:0};
  const candidates=days.filter(s=>s.day>=releaseDay&&s.day<=364);let fit=null;
  for(const s of candidates){
   if(s.protectedReason){rejects.protected++;continue;}
   if(lockedDays.has(s.day)){rejects.startedOrFrozen++;continue;}
   if(!levelEligible(m,s.coreDay,map,policy)){rejects.level++;continue;}
   if(m.sourceMaterialId&&s.day<=assigned.get(m.sourceMaterialId)){rejects.parentOrder++;continue;}
   if(!s.baseline.known){rejects.unknownBudget++;continue;}
   if(s.year.length>=policy.maxNewMaterialsPerDay){rejects.dailyCount++;continue;}
   if(s.year.some(x=>x.skill===m.skill)){rejects.sameSkill++;continue;}
   if(stateBudget(s,policy,e.minutes).totalMinutes>policy.totalMinutes){rejects.budget++;continue;}
   fit=s;break;
  }
  if(fit){row.status='assigned-first-use';row.day=fit.day;row.delayDays=fit.day-releaseDay;row.runtimeGuards={unstartedUnfrozen:true,actualSkillPlacement:true,actualParentCompletion:!!m.sourceMaterialId,recomputeRemaining360:true};fit.year.push(row);fit.yearMinutes+=e.minutes;assigned.set(m.id,fit.day);}
  else {row.status='pending';row.reason='no-safe-slot';row.rejectedDaysByReason=rejects;}
  ledger.push(row);
 }
 const assignments={};
 for(const s of days){
  if(!s.year.length)continue;
  assignments[s.day]={day:s.day,week:s.week,afterCore:false,taskMaterialIds:Object.fromEntries(SKILLS.map(k=>[k,s.year.filter(r=>r.skill===k).map(r=>r.materialId)]).filter(([,ids])=>ids.length)),materialPractice:Object.fromEntries(s.year.map(r=>[r.materialId,{materialId:r.materialId,cycle:'first-planned',firstPlannedDay:s.day}])),rows:s.year,coreHash:s.coreHash,composedHash:s.composedHash,budget:stateBudget(s,policy),baselineExtraStudyMinutes:s.baseline.extraStudyMinutes,semanticContextMinutes:s.semanticContextMinutes};
  assignments[s.day].baselineMaterials=s.composedDay.tasks.flatMap(t=>(t.materialIds||[]).map(id=>({taskId:t.id,materialId:id,materialHash:hash(map.get(id))})));
  assignments[s.day].requiredPublicMaterials=publicPlan.assignments.filter(a=>a.day===s.day).map(a=>({taskId:a.taskId,materialId:a.materialId}));
 }
 const spacedPractice=ledger.map(row=>({materialId:row.materialId,status:row.status==='assigned-first-use'?'awaiting-actual-learning-evidence':'awaiting-first-use-slot',firstPlannedDay:row.day||null,notBeforeActualCompletion:true,proposedWindowsDays:[[2,4],[7,10],[21,28]],taskKinds:['actual-error-correction','new-context-retrieval'],sameQuestionMandatoryRepeats:0,scheduledCount:0,capacity:'Unscheduled; consumes the same daily budget at runtime, including the reserved contingency. Must not be appended after a full day.',proof:'Bound ordinary completion and correction proof; retrieval content must differ, or remain a correction of the recorded error. Never unseen exam credit.'}));
 const dayLedger=days.map(s=>({day:s.day,protectedReason:s.protectedReason,startedOrFrozen:lockedDays.has(s.day),coreHash:s.coreHash,composedHash:s.composedHash,coreTaskMinutes:sum(s.composedDay.tasks,t=>t.minutes),baseline:s.baseline,publicAssignmentIds:s.publicAssignmentIds,publicReviewIds:s.publicReviewIds,publicContextStudyMinutes:sum(s.contextAndReview,x=>x.minutes),semanticContextIds:s.semanticContext,semanticContextStudyMinutes:s.semanticContextMinutes,yearMaterialIds:s.year.map(r=>r.materialId),yearStudyMinutes:s.yearMinutes,contingencyStudyMinutes:policy.contingencyStudyMinutes,budget:stateBudget(s,policy),baselineOverBudget:s.baseline.totalMinutes>policy.totalMinutes,admissionStatus:s.year.length?'new-first-use-admitted':s.baseline.totalMinutes>policy.totalMinutes?'existing-core-public-budget-blocker':'no-new-first-use'}));
 const counts=kind=>({total:ledger.filter(r=>!kind||r.kind===kind).length,assigned:ledger.filter(r=>(!kind||r.kind===kind)&&r.status==='assigned-first-use').length,pending:ledger.filter(r=>(!kind||r.kind===kind)&&r.status==='pending').length});
 const summary={sources:counts('source'),derived:counts('derived'),all:counts(),sameMaterialForcedRepeats:0,newAssignmentOccurrences:assigned.size,addedDays:dayLedger.filter(d=>d.yearMaterialIds.length).length,maximumAdmittedCalendarMinutes:Math.max(0,...dayLedger.filter(d=>d.yearMaterialIds.length).map(d=>d.budget.totalMinutes)),baselineOverBudgetDays:dayLedger.filter(d=>d.baselineOverBudget).map(d=>d.day),requiredPublicVariantsRetained:publicPlan.assignments.length,publicVariantsOnBaselineOverBudgetDays:sum(dayLedger.filter(d=>d.baselineOverBudget),d=>d.publicAssignmentIds.length),existingPublicReviewReservations:(publicPlan.reviews||[]).length,existingPublicBlockedReviewWindows:(publicPlan.reviewBlocked||[]).length,semanticContextReservations:semanticContext.filter(r=>r.status==='reserved-conditional').length,semanticContextPending:semanticContext.filter(r=>r.status==='pending').length,yearSpacedReviewsAwaitingEvidence:spacedPractice.length,actualLearningOrMasteryValidated:false};
 const plan={schema:SCHEMA,active:false,runtimeConnected:false,version:'candidate-only',status:'candidate-with-explicit-pending-and-baseline-blockers',scheduleAxis:'Existing day numbers are course/lesson indices, not measured natural-calendar days. Static 360-minute buckets are conservative admission scenarios; runtime carries unfinished work and may advance early across lessons within one shared calendar budget.',inputHash:input.inputHash,baseHash:hash(coreContract(base)),publicPlanHash:publicPlan.planHash,contextCatalogHash:hash(catalog),policy,assignments,ledger,days:dayLedger,semanticContext,spacedPractice,summary,limitations:['These unit-aware durations are conservative engineering assumptions, not measured learner throughput or examiner calibration. Actual overruns, due reviews and errors must remain unfinished and replan within 360.','The existing core/public baseline has its own over-budget lesson bundles; preserving them is not a claim they fit one natural day. Protected exam/day1/day365 material remains unchanged. Timed papers remain indivisible; post-test correction uses later real remaining capacity.','Public replacement capacity is not credited without actual prior-completion evidence. Every reviewed public variant, context activity and existing review reservation remains accounted for.','Course level compatibility is not demonstrated learner readiness. Runtime must validate actual placement and prerequisite completion.','This is a local candidate, not installed or active, and it makes no claim of 365-day IELTS 7.0 attainment. Four-skill blind gates and human-calibrated output evaluation still determine outcomes.']};
 assert.equal(hash({base,yearMaterials,catalog}),pristine,'input mutation forbidden');
 return plan;
}
module.exports={SCHEMA,hash,clone,coreContract,protectedReason,composeBaseline,levelEligible,stateBudget,build};
