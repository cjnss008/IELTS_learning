'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../assets/public-course-planner.js'),A=require('../assets/assessment-core.js'),Composer=require('../tools/append-ordinary-reading-plan.cjs');
const copy=v=>JSON.parse(JSON.stringify(v));
function fixture(){
 const material=(id)=>{const text='We collect samples. The samples are measured carefully.';return{id,version:'1',skill:'reading',type:'reading',level:'A1',pool:'training',estimatedMinutes:20,questions:[{id:'q1',type:'single',prompt:'What do we collect?',options:['samples','tickets'],answers:['samples']}],passage:text,transcript:'',audio:'',source:{publicSourceId:id,sourceTextSha256:P.textHash(text),practiceOnly:true,independentAssessmentEligible:false,independentTransferEligible:false,verification:'reviewed',exposureGroup:'public-source:'+id,phaseCandidates:['foundation'],prerequisiteCapabilityIds:['foundation:reading'],coursePolicy:{appendOnly:true}}};};
 const context=m=>({sourceId:m.id,sourceTextSha256:m.source.sourceTextSha256,words:[{word:'sample',surface:'samples',start:11,end:18,ambiguousLemma:false}],grammar:[{tag:'present-simple',quote:'We collect samples.',start:0,end:19,explanation:'collect是一般现在时。'}]});
 const minutes={vocabulary:45,grammar:30,listening:75,reading:60,speaking:60,writing:75,reflection:15},core=Object.keys(minutes).map(skill=>({id:'core-'+skill,version:'1',skill,type:skill,level:'A1',pool:'training',estimatedMinutes:10,questions:[{id:'q',type:'single',options:['a','b'],answers:['a']}]})),old=material('public-old'),added=material('public-new');
 const baseData={materials:[...core,old],days:Array.from({length:28},(_,i)=>({day:i+1,week:Math.ceil((i+1)/7),tasks:Object.entries(minutes).map(([id,minutes])=>({id,minutes,mode:'practice',materialIds:['core-'+id]})),totalMinutes:360})),gates:[]},baseSourceContexts={schema:1,sources:[context(old)]},sourceContexts={schema:1,sources:[context(old),context(added)]},data={...copy(baseData),materials:[...copy(baseData.materials),added]},entries=[{word:'sample',rank:800}],expandDay=d=>d,shared={entries,expandDay,materialContentHash:A.materialContentHash};
 const basePlan=P.build(baseData,{...shared,sourceContexts:baseSourceContexts});
 return{baseData,data,baseSourceContexts,sourceContexts,basePlan,newMaterialIds:[added.id],...shared};
}
test('append composition retains previous assignments, review windows and full owner-day patches exactly',()=>{
 const f=fixture(),before=JSON.stringify(f),plan=Composer.compose(f),old=f.basePlan;
 assert.equal(JSON.stringify(f),before);assert.equal(plan.assignments.length,2);assert.equal(plan.input.materials.length,2);assert.equal(plan.audit.summary.readingAssignments,2);assert.equal(plan.blocked.length,0);
 assert.deepEqual(P.validatePlan(plan,f.data,{sourceContexts:f.sourceContexts,materialContentHash:A.materialContentHash,expandDay:f.expandDay}),{valid:true,reasons:[]});
 for(const a of old.assignments)assert.deepEqual(plan.assignments.find(v=>v.assignmentId===a.assignmentId),a);
 for(const d of old.dailyChanges)assert.deepEqual(plan.dailyChanges.find(v=>v.day===d.day),d);
 for(const r of old.reviews)assert.deepEqual(plan.reviews.find(v=>v.reviewId===r.reviewId),r);
 const newDay=plan.assignments.find(a=>a.materialId==='public-new').day;assert.ok(!old.dailyChanges.some(v=>v.day===newDay));assert.ok(plan.dailyChanges.every(d=>d.day>1&&d.dayBudget.after.totalMinutes<=360));assert.equal(plan.assignments[1].independentAssessmentEligible,false);
});
test('old material/question, raw day, context and base blueprint mutations are refused',()=>{
 for(const mutate of [f=>f.data.materials[0].questions[0].answers=['changed'],f=>f.data.days[1].title='changed',f=>f.sourceContexts.sources[0].words[0].word='changed',f=>f.basePlan.planHash='0'.repeat(64)]){const f=fixture();mutate(f);assert.throws(()=>Composer.compose(f));}
});
test('insufficient complete-unit capacity cannot lower budgets, split the material or silently drop the reading',()=>{
 const f=fixture();f.data.materials.at(-1).estimatedMinutes=400;const before=JSON.stringify(f.data);assert.throws(()=>Composer.compose(f),/suitable complete-unit budget slots/);assert.equal(JSON.stringify(f.data),before);
});
test('unchanged runtime replan retains started original ownership and schedules only unstarted additions',()=>{
 const f=fixture(),plan=Composer.compose(f),old=plan.assignments.find(a=>a.materialId==='public-old');const next=P.replan(plan,f.data,{sourceContexts:f.sourceContexts,entries:f.entries,materialContentHash:A.materialContentHash,expandDay:f.expandDay,protectedDays:[old.day],retainedAssignments:[old],seenSourceGroups:[old.exposureGroup],cache:false});
 assert.equal(next.valid,true);assert.equal(next.retainedAssignments.length,1);assert.equal(next.retainedAssignments[0].materialId,old.materialId);assert.ok(!next.dailyChanges.some(d=>d.day===old.day));assert.equal(next.assignments.length,1);assert.equal(next.assignments[0].materialId,'public-new');assert.ok(!next.blocked.length);
});
test('unlisted, duplicate-source or non-reading additions do not enter the blueprint',()=>{
 for(const mutate of [f=>f.data.materials.push({...copy(f.data.materials.at(-1)),id:'unlisted'}),f=>f.data.materials.at(-1).source.publicSourceId='public-old',f=>f.data.materials.at(-1).skill='listening']){const f=fixture();mutate(f);assert.throws(()=>Composer.compose(f));}
});
