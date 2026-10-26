'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const B=require('../tools/build-public-supplement-materials.cjs'),P=require('../assets/public-material-practice.js'),S=require('../assets/public-material-selector.js'),Adaptive=require('../assets/adaptive-plan.js'),Load=require('../assets/daily-learning-load.js');
const root=path.join(__dirname,'..'),publicPool=B.load({root,requireComplete:true,practiceOnly:true}).materials;
const Hub=require('../assets/today-hub.js'),Player=require('../assets/course-player.js'),Year=require('../assets/year-planner.js'),A=require('../assets/assessment-core.js');
function fixture(dayNumber=2,level='A1'){
 const core=[{id:'core-read',version:'1',skill:'reading',type:'reading',level,pool:'training',estimatedMinutes:15,title:'Current core',source:{verification:'reviewed',grammarTags:['be-present','place-prepositions']},questions:[{id:'q',type:'single',options:['yes','no'],answers:['yes']}]},{id:'core-listen',version:'1',skill:'listening',level,pool:'training',estimatedMinutes:15,source:{verification:'reviewed',grammarTags:['be-present','place-prepositions']}},{id:'core-vocab',skill:'vocabulary',vocabulary:[{word:'kitchen'},{word:'room'},{word:'house'}]}],day={day:dayNumber,week:Math.ceil(dayNumber/7),tasks:[{id:'reading',minutes:15,materialIds:['core-read']},{id:'listening',minutes:15,materialIds:['core-listen']},{id:'vocabulary',minutes:10,materialIds:['core-vocab']}]};
 return{data:{materials:[...core,...publicPool],days:[day]},day,records:[],drafts:[],budget:{remainingMinutes:110},dueReviewMinutes:15,coreReserveMinutes:30,route:{skills:{reading:{verified:true,level:'A1'},listening:{verified:true,level:'A1'}}}};
}
test('ordinary practice appends only the explicit released roster without modifying any old day, task or material',()=>{
 const data={materials:[{id:'existing',version:'7',questions:[{id:'q',answers:['original-value']}]}],days:[{day:1,tasks:[{id:'reading',materialIds:['existing']}]}]},before=JSON.stringify(data),old=JSON.parse(before);B.appendToCurriculum(data,{root});
 assert.deepEqual(data.days,old.days);assert.deepEqual(data.materials[0],old.materials[0]);assert.equal(data.materials.length,1+publicPool.length);assert.ok(data.materials.slice(1).every(m=>m.week===undefined));assert.equal(data.audit.publicSupplements.coreScheduleChanged,false);assert.throws(()=>B.appendToCurriculum(data,{root}),/already exists/);
});
test('listening is selected before its paired reading and all current selections share one budget',()=>{
 const opts=fixture(),before=JSON.stringify(opts),plan=P.plan(opts);assert.equal(plan.status,'selected');assert.equal(plan.selected[0].skill,'listening');assert.equal(new Set(plan.selected.map(m=>m.sourceExposureGroup)).size,plan.selected.length);assert.ok(plan.selected.reduce((s,m)=>s+m.estimatedMinutes,0)+30+15+10<=110);assert.equal(JSON.stringify(opts),before);assert.ok(plan.selected.every(m=>m.required===false&&m.eligibleForIndependentAssessment===false));
});
test('current course range falls back to the lower bound and calendar days do not promote or exclude suitable input',()=>{
 let opts=fixture(253,'A0–A1');delete opts.route;let ctx=P.context(opts);assert.equal(ctx.skillLevels.reading,'A0');assert.equal(ctx.calendarPhaseReference,'integration');assert.equal(ctx.phaseBySkill.reading,'foundation');assert.equal(P.plan({...opts,verifiedCapabilities:['foundation:reading','foundation:listening']}).selected.length,0);
 opts=fixture(340,'A1');delete opts.route;const context=P.context({...opts,verifiedCapabilities:['foundation:reading','foundation:listening']});assert.equal(context.calendarPhaseReference,'verification');assert.equal(context.phaseBySkill.reading,'foundation');assert.ok(P.plan({...opts,verifiedCapabilities:['foundation:reading','foundation:listening']}).selected.length>0);
 opts=fixture(340,'B2');delete opts.route;opts.data.materials.find(m=>m.id==='core-read').source.grammarTags=['relative-clauses'];const high=P.plan({...opts,verifiedCapabilities:['independent:reading']});assert.equal(high.context.phaseBySkill.reading,'academic');assert.ok(high.selected.some(m=>m.skill==='reading'&&m.levelEstimate.learner==='B2'&&(m.matches.currentGrammarTags.length||m.matches.currentWordGaps.length)));
});
test('reading skill and prerequisite evidence is independent of listening ability',()=>{
 const opts=fixture();opts.route.skills.listening={verified:true,level:'A0'};const plan=P.plan(opts);assert.ok(plan.selected.some(m=>m.skill==='reading'));assert.equal(plan.selected.some(m=>m.skill==='listening'),false);assert.ok(plan.context.verifiedCapabilities.includes('foundation:reading'));
});
test('two different genuine original course works can establish an ordinary practice prerequisite; repeats and public results cannot',()=>{
 const opts=fixture();delete opts.route;opts.data.materials=opts.data.materials.filter(m=>!m.source?.publicSourceId||m.source.prerequisiteCapabilityIds?.length);const original=opts.data.materials.find(m=>m.id==='core-read');opts.data.materials.push({...original,id:'proof-a',level:'A0'},{...original,id:'proof-b',level:'A0'});opts.records=[{id:'a',materialId:'proof-a',kind:'original'},{id:'a2',materialId:'proof-a',kind:'original'}];opts.verifiedRecord=()=>true;assert.equal(P.plan(opts).selected.length,0);
 opts.records.push({id:'b',materialId:'proof-b',kind:'original'});assert.ok(P.plan(opts).selected.some(m=>m.skill==='reading'));
 opts.records.push({id:'newer-failure',materialId:'proof-b',kind:'original',submittedAt:'2026-10-26T10:00:00Z'});opts.verifiedRecord=r=>r.id!=='newer-failure';assert.equal(P.plan(opts).selected.length,0);
 opts.records=[{id:'public-a',materialId:publicPool.find(m=>m.skill==='reading').id,kind:'original'},{id:'public-b',materialId:publicPool.find(m=>m.skill==='reading'&&m.source.publicSourceId==='voa-l1-06').id,kind:'original'}];assert.equal(P.plan(opts).selected.length,0);
});
test('stable group exposure from old snapshots blocks both modalities after versions change',()=>{
 const opts=fixture(),group='public-source:voa-l1-05';opts.data.materials=opts.data.materials.filter(m=>!m.source?.publicSourceId||m.source.publicSourceId==='voa-l1-05');opts.records=[{materialId:'removed-v1-id',kind:'original',answer:JSON.stringify({materialBinding:{material:{source:{exposureGroup:group}}}})}];assert.equal(P.plan(opts).selected.length,0);
});
test('actual core, due and break budget prevents optional work; closed days never start new public units',()=>{
 const opts=fixture();assert.equal(P.plan({...opts,budget:{remainingMinutes:50}}).selected.length,0);assert.equal(P.plan({...opts,budget:{remainingMinutes:110,dayEnded:true}}).selected.length,0);assert.equal(P.plan({...opts,dueReviewMinutes:undefined}).selected.length,0);assert.equal(P.plan({...opts,courseComplete:true}).reason,'completed-course-day-is-frozen');
});
test('public materials stay out of generic adaptive, placement challenge and independent verification routes',()=>{
 const m={...publicPool.find(m=>m.skill==='reading'),week:1};assert.equal(Adaptive.eligibleMaterial(m,52),false);assert.equal(Adaptive.verifiedRecord({materialId:m.id,materialVersion:m.version,kind:'original'},m,Date.now()),false);
 assert.deepEqual(Load.placementChallenges({data:{materials:[m]},route:{level:'A0',skills:{reading:{verified:true,level:'A1'}}},day:{tasks:[{id:'reading',mode:'practice'}]}}),[]);
});
function loadOptions(extra={}){const f=fixture();return{data:f.data,records:[],drafts:[],currentDay:2,hub:Hub,player:Player,yearPlanner:Year,assessment:A,placement:{currentRoute:()=>null},summaryForDay:()=>({completionValid:false,remaining:0}),budget:{remainingMinutes:110,spentMinutes:250},publicContext:{verifiedCapabilities:['foundation:reading','foundation:listening']},...extra};}
test('daily queue reserves public sources for their assigned course tasks and does not create duplicate discovery cards',()=>{
 const opts=loadOptions(),before=JSON.stringify(opts),q=Load.build(opts);assert.equal(q.next.materialId,'core-read');assert.equal(q.currentComplete,false);assert.equal(q.entries.some(e=>e.publicSupplement&&!e.draftId),false);assert.equal(JSON.stringify(opts),before);assert.equal(q.publicPractice.discoveryRemoved,true);
 const short=Load.build(loadOptions({budget:{remainingMinutes:20,spentMinutes:340},extraPlan:(_day,budget)=>{assert.equal(budget.remainingMinutes,360);return{tasks:[],reservedMemoryMinutes:0};}}));assert.equal(short.entries.some(e=>e.publicSupplement),false);assert.equal(short.publicPractice.selected.length,0);
});
test('a saved supplemental draft resumes ahead of unstarted core and remains visible after ending the day',()=>{
 const m=publicPool.find(m=>m.id==='public-voa-l1-05-reading'),draft={id:'public-progress',materialId:m.id,taskId:'reading',courseDay:2,startedAt:'2026-10-26T01:00:00Z',answers:{[m.questions[0].id]:m.questions[0].answers[0]},materialBinding:{material:m}},opts=loadOptions({drafts:[draft]});let q=Load.build(opts);assert.equal(q.next.draftId,draft.id);assert.equal(q.entries.filter(e=>e.materialId===m.id).length,1);assert.equal(q.publicPractice.selected.some(e=>e.sourceId===m.source.publicSourceId),false);
 q=Load.build({...opts,budget:{remainingMinutes:110,spentMinutes:250,dayEnded:true}});assert.equal(q.next.kind,'day-ended');assert.equal(q.entries.some(e=>e.draftId===draft.id),true);assert.equal(q.publicPractice.selected.length,0);assert.deepEqual(draft.answers,{[m.questions[0].id]:m.questions[0].answers[0]});
});
test('completed course days never receive a new public supplemental card or mandatory requirement',()=>{
 const opts=loadOptions(),before=JSON.stringify(opts.data),hub={...Hub,taskState:()=>({done:true,missingMaterialIds:[],pending:false}),latestForMaterial:()=>new Map()},player={...Player,dayReadiness:()=>({ready:true})};
 const q=Load.build({...opts,hub,player,summaryForDay:()=>({completionValid:true,remaining:0})});assert.equal(q.currentComplete,true);assert.equal(q.entries.some(e=>e.publicSupplement),false);assert.equal(q.publicPractice.discoveryRemoved,true);assert.equal(JSON.stringify(opts.data),before);
});

test('an explicitly prerequisite-free greeting remains available as ordinary entry practice without certifying ability',()=>{const opts=fixture();delete opts.route;const plan=P.plan(opts);assert.equal(plan.context.verifiedCapabilities.length,0);assert.ok(plan.selected.length);assert.ok(plan.selected.every(s=>opts.data.materials.find(m=>m.id===s.materialId).source.prerequisiteCapabilityIds.length===0));assert.ok(plan.selected.every(s=>s.eligibleForIndependentAssessment===false));});
