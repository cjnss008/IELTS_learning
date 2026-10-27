'use strict';
// Authoring only. Compose reviewed, distinct ordinary reading onto a verified
// blueprint without changing a single prior assignment or owner-day patch.
// Runtime continues to use the existing planner's profile/level/history guards.
const Planner=require('../assets/public-course-planner.js');
const copy=value=>JSON.parse(JSON.stringify(value));
function check(value,message){if(!value)throw Error('Ordinary reading composition: '+message);}
function compose({baseData,data,basePlan,baseSourceContexts,sourceContexts,newMaterialIds,entries,materialContentHash,expandDay,newReadingStartDay=2}={}){
 const shared={entries,materialContentHash,expandDay};
 check(Planner.validatePlan(basePlan,baseData,{...shared,sourceContexts:baseSourceContexts}).valid,'base blueprint or source contract changed');
 check(basePlan.blocked.length===0&&basePlan.retainedAssignments.length===0&&basePlan.exemptions.length===0,'complete base blueprint required');
 check(Number.isInteger(newReadingStartDay)&&newReadingStartDay>=2&&newReadingStartDay<365,'invalid earliest new reading day');
 check(Planner.hash(baseData.days)===Planner.hash(data.days)&&Planner.hash(baseData.gates||[])===Planner.hash(data.gates||[]),'original days or gates changed');
 const before=Planner.hash({baseData,data,basePlan,baseSourceContexts,sourceContexts}),map=new Map(data.materials.map(m=>[m.id,m]));
 check(map.size===data.materials.length,'duplicate material ID');
 for(const m of baseData.materials)check(map.has(m.id)&&Planner.hash(m)===Planner.hash(map.get(m.id)),'previous material changed: '+m.id);
 const ids=new Set(newMaterialIds),priorIds=new Set(baseData.materials.map(m=>m.id)),priorSources=new Set(baseSourceContexts.sources.map(s=>s.sourceId));
 check(ids.size>0&&ids.size===newMaterialIds.length&&data.materials.length===baseData.materials.length+ids.size,'only the explicitly listed additions are allowed');
 const additions=newMaterialIds.map(id=>map.get(id));
 for(const m of additions)check(m&&!priorIds.has(m.id)&&m.skill==='reading'&&m.source?.coursePolicy?.appendOnly===true&&!priorSources.has(m.source.publicSourceId)&&Planner.validPublic(m)===null,'addition is not a distinct reviewed append-only reading');
 check(new Set(additions.map(m=>m.source.publicSourceId)).size===additions.length,'new source IDs must be distinct');
 for(const c of baseSourceContexts.sources)check(Planner.hash(c)===Planner.hash(sourceContexts.sources.find(s=>s.sourceId===c.sourceId)),'previous context changed: '+c.sourceId);
 check(sourceContexts.sources.length===baseSourceContexts.sources.length+additions.length,'unexpected context source');
 const reserved=[...new Set([...basePlan.dailyChanges.map(v=>v.day),...basePlan.assignments.map(v=>v.day),...basePlan.reviews.map(v=>v.day)])].sort((a,b)=>a-b);
 const delta=Planner.build(data,{...shared,sourceContexts,startDay:newReadingStartDay,publicMaterials:additions,protectedDays:reserved,vocabularyCoverage:basePlan.audit.vocabularyCoverage});
 check(delta.blocked.length===0&&delta.assignments.length===additions.length,'all added readings need suitable complete-unit budget slots: '+JSON.stringify(delta.blocked));
 check(delta.assignments.every(a=>a.strategy==='append-within-task-budget'&&a.replaceMaterialIds.length===0),'new reading may not replace an existing material');
 check(delta.dailyChanges.every(d=>!reserved.includes(d.day)),'new reading/context review touches a previous owner day');
 const plan=copy(delta),order=(a,b)=>a.day-b.day||a.skill.localeCompare(b.skill,'en')||a.materialId.localeCompare(b.materialId,'en');
 plan.assignments=[...copy(basePlan.assignments),...copy(delta.assignments)].sort(order);
 plan.reviews=[...copy(basePlan.reviews),...copy(delta.reviews)].sort((a,b)=>a.day-b.day||a.reviewId.localeCompare(b.reviewId,'en'));
 plan.dailyChanges=[...copy(basePlan.dailyChanges),...copy(delta.dailyChanges)].sort((a,b)=>a.day-b.day);
 plan.reviewBlocked=[...copy(basePlan.reviewBlocked),...copy(delta.reviewBlocked)];
 plan.policy=copy(basePlan.policy);
 plan.input.protectedDayNumbers=copy(basePlan.input.protectedDayNumbers);
 plan.input.materials=[...copy(basePlan.input.materials),...copy(delta.input.materials)].sort((a,b)=>a.id.localeCompare(b.id,'en'));
 const protectedDays=copy(basePlan.audit.protectedDays),summary=plan.audit.summary,groups=new Set(plan.assignments.map(a=>a.exposureGroup));
 Object.assign(summary,{publicVariants:plan.assignments.length,assignedVariants:plan.assignments.length,retainedVariants:0,exemptVariants:0,blockedVariants:0,readingAssignments:plan.assignments.filter(a=>a.skill==='reading').length,listeningAssignments:plan.assignments.filter(a=>a.skill==='listening').length,replacements:plan.assignments.filter(a=>a.strategy==='replace-repeated-practice').length,appends:plan.assignments.filter(a=>a.strategy==='append-within-task-budget').length,sourceGroups:groups.size,plannedContextReviews:plan.reviews.length,blockedReviewWindows:plan.reviewBlocked.length,changedDays:plan.dailyChanges.length,maximumReferenceCalendarMinutes:Math.max(0,...plan.dailyChanges.map(d=>d.dayBudget.after.totalMinutes))});
 plan.audit.protectedDays=protectedDays;
 plan.audit.invariants={...copy(basePlan.audit.invariants),...copy(delta.audit.invariants),noAssessmentOrAnnualDayAssignment:plan.assignments.every(a=>!protectedDays.some(d=>d.day===a.day)),onePublicPerSkillDay:new Set(plan.assignments.map(a=>a.day+':'+a.skill)).size===plan.assignments.length,everyPublicVariantAccountedFor:plan.assignments.length===plan.input.materials.length,allChangedDaysWithinReferenceBudget:plan.dailyChanges.every(d=>d.dayBudget.after.totalMinutes<=360),noDay1Changes:plan.dailyChanges.every(d=>d.day>=2)};
 plan.audit.appendOnlyComposition={schema:1,basePlanHash:basePlan.planHash,newReadingStartDay,preservedAssignments:basePlan.assignments.length,preservedOwnerDayPatches:basePlan.dailyChanges.length,preservedReviewWindows:basePlan.reviews.length,addedMaterialIds:[...newMaterialIds],reservedDayNumbers:reserved,previousAssignmentsHash:Planner.hash(basePlan.assignments),previousOwnerPatchesHash:Planner.hash(basePlan.dailyChanges),previousReviewsHash:Planner.hash(basePlan.reviews),deltaOptimization:copy(delta.audit.optimization),historyPolicy:'Static existing assignments, reviews and owner-day patches are retained exactly. Later profile replanning may move only eligible unstarted work using the unchanged runtime history and prerequisite guards.'};
 delete plan.audit.optimization;
 check(Object.values(plan.audit.invariants).every(Boolean),'combined invariant failed');
 delete plan.planHash;plan.planHash=Planner.hash(plan);
 check(Planner.validatePlan(plan,data,{...shared,sourceContexts}).valid,'combined runtime validation failed');
 for(const a of basePlan.assignments)check(Planner.hash(a)===Planner.hash(plan.assignments.find(v=>v.assignmentId===a.assignmentId)),'previous assignment changed');
 for(const d of basePlan.dailyChanges)check(Planner.hash(d)===Planner.hash(plan.dailyChanges.find(v=>v.day===d.day)),'previous day patch changed');
 for(const r of basePlan.reviews)check(Planner.hash(r)===Planner.hash(plan.reviews.find(v=>v.reviewId===r.reviewId)),'previous review changed');
 check(Planner.hash({baseData,data,basePlan,baseSourceContexts,sourceContexts})===before,'composition mutated its input');
 return plan;
}
module.exports={compose};
