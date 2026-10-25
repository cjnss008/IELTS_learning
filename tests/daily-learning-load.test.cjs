'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Load=require('../assets/daily-learning-load.js'),Hub=require('../assets/today-hub.js'),Player=require('../assets/course-player.js'),Year=require('../assets/year-planner.js'),A=require('../assets/assessment-core.js'),Timer=require('../assets/study-timer-core.js');
const at='2026-10-25T10:00:00.000Z',today=Year.dateKey(Date.parse(at));
function material(id,extra={}){return{id,skill:'reading',type:'practice',level:'A0',pool:'training',week:1,estimatedMinutes:30,title:id,source:{verification:'reviewed'},questions:[{id:'q',type:'single',options:['a','b'],answers:['a']}],...extra};}
function record(id,extra={}){return{id:'work-'+id,version:1,materialId:id,taskId:'reading',skill:'reading',kind:'original',dayNumber:1,submittedAt:at,startedAt:'2026-10-25T09:50:00.000Z',activeSeconds:600,activityByDate:{[today]:600},answer:JSON.stringify({schema:1,answers:{q:'a'}}),evaluation:{method:'objective',result:'pass'},...extra};}
function fixture(extra={}){const data={weeks:[{week:1,level:'A0'},{week:2,level:'A1'}],materials:[material('r1'),material('r2')],days:[1,2].map(day=>({day,week:1,tasks:[{id:'reading',minutes:60,materialIds:['r'+day]},{id:'reflection',minutes:30,materialIds:['reflection-'+day]}]}))};return{data,records:[],drafts:[],currentDay:1,today,now:Date.parse(at),hub:Hub,player:Player,yearPlanner:Year,assessment:A,summaryForDay:n=>({completionValid:n===1,remaining:0}),...extra};}
test('ten-minute completed core plus real recap automatically queues the earliest unfinished lesson without mutating history',()=>{
 const opts=fixture({records:[record('r1')]}),before=JSON.stringify(opts),queue=Load.build(opts);assert.equal(queue.currentComplete,true);assert.equal(queue.next.day,2);assert.equal(queue.next.materialId,'r2');assert.match(queue.next.label,/第 2 课/);assert.equal(queue.budget.spentMinutes,10);assert.equal(JSON.stringify(opts),before);
 const noRecap=Load.build({...opts,summaryForDay:()=>({completionValid:false,remaining:0})});assert.equal(noRecap.next.kind,'reflection');assert.equal(noRecap.next.day,1);assert.equal(noRecap.currentComplete,false);
});
test('objective wrong answers cannot use a cached pass or stale recap token to advance; genuine correction releases only that record',()=>{
 const wrong=record('r1',{answer:JSON.stringify({schema:1,answers:{q:'b'}})}),opts=fixture({records:[wrong]});let queue=Load.build(opts);assert.equal(queue.currentComplete,false);assert.equal(queue.next.kind,'reflection');assert.equal(queue.next.day,1);
 queue=Load.build({...opts,recordCorrectionStatus:r=>({corrected:r.id===wrong.id}),summaryForDay:()=>({completionValid:false,remaining:0})});assert.equal(queue.next.kind,'reflection');assert.equal(queue.currentComplete,false);
 queue=Load.build({...opts,recordCorrectionStatus:r=>({corrected:r.id===wrong.id})});assert.equal(queue.next.day,2);assert.equal(JSON.parse(wrong.answer).answers.q,'b');
});
test('pending subjective work does not pass or block an independent core task; independent extras never fill a missing core',()=>{
 const opts=fixture();opts.data.materials.push(material('w1',{skill:'writing'}),material('extra'));opts.data.days[0].tasks.unshift({id:'writing',minutes:45,materialIds:['w1']});opts.records=[record('w1',{taskId:'writing',skill:'writing',answer:'{"schema":1,"text":"My own answer."}',evaluation:{method:'none',result:'pending'}})];
 let queue=Load.build(opts);assert.equal(queue.pending,true);assert.equal(queue.next.materialId,'r1');assert.equal(queue.currentComplete,false);
 opts.records.push(record('r1'));queue=Load.build({...opts,extraPlan:()=>({tasks:[{kind:'new-practice',materialId:'extra',skill:'reading'}]})});assert.equal(queue.next.kind,'extra');assert.equal(queue.currentComplete,false);assert.equal(queue.entries.some(e=>e.waiting&&e.materialId==='w1'),true);
 opts.records.push(record('extra',{taskId:'reading',dayNumber:1}));queue=Load.build(opts);assert.equal(queue.next.kind,'view');assert.equal(queue.next.materialId,'w1');assert.equal(queue.currentComplete,false);
});
test('active inputs and started drafts retain priority and are never overwritten by queue derivation',()=>{
 const opts=fixture({drafts:[{id:'draft-two',courseDay:1,taskId:'reading',materialId:'another',text:'preserve',startedAt:at}]});opts.data.materials.push(material('another'));opts.data.days[0].tasks[0].materialIds.push('another');let queue=Load.build(opts);assert.equal(queue.next.draftId,'draft-two');
 queue=Load.build({...opts,current:{day:1,taskId:'reading',materialId:'r1',active:true,submitted:false}});assert.equal(queue.next.materialId,'r1');assert.equal(opts.drafts[0].text,'preserve');
});
test('unmet weekly prerequisites stop automatic advancement while a historical started draft keeps its course mapping',()=>{
 const opts=fixture({records:[record('r1')],weekAccess:()=>({allowed:false,reason:'A/B gate not passed'})});opts.data.days[1].week=2;opts.data.materials[1].week=2;let queue=Load.build(opts);assert.equal(queue.next.kind,'blocked');assert.match(queue.reason,/gate/);
 const draft={id:'started-later',courseDay:2,taskId:'reading',materialId:'r2',startedAt:at,text:'historic'};queue=Load.build({...opts,drafts:[draft]});assert.equal(queue.next.kind,'material');assert.equal(queue.next.draftId,draft.id);assert.equal(queue.next.day,2);assert.equal(draft.text,'historic');
});
test('340 used minutes and conservative thirty-minute next unit ends today; no forced whole lesson, no artificial minimum duration',()=>{
 const opts=fixture({records:[record('r1',{activeSeconds:340*60,activityByDate:{[today]:340*60}})]}),queue=Load.build(opts);assert.equal(queue.next.kind,'rest');assert.equal(queue.budget.remainingMinutes,20);assert.equal(queue.entries[0].materialId,'r2');assert.equal(queue.entries[0].fitsBudget,false);assert.equal(queue.entries[0].estimate.sampleCount,1);assert.match(queue.entries[0].estimate.source,/课程预计/);
 opts.data.materials[1].estimatedMinutes=15;const shorter=Load.build(opts);assert.equal(shorter.next.kind,'rest');assert.equal(shorter.entries[0].estimate.totalMinutes,15);assert.equal(shorter.entries[0].startWindowMinutes,25);
 const tail=fixture({records:[record('r1',{activeSeconds:340*60,activityByDate:{[today]:340*60}})],summaryForDay:()=>({completionValid:false,remaining:0})});tail.data.days[0].tasks[1].minutes=15;const finish=Load.build(tail);assert.equal(finish.next.kind,'reflection');assert.equal(finish.next.day,1);assert.equal(finish.next.startWindowMinutes,15);
});
test('360-minute calendar budget includes all course days and drafts; next calendar day resets time without completing unfinished work',()=>{
 const old=record('r1',{activeSeconds:350*60,activityByDate:{[today]:350*60}}),draft={id:'draft-next',courseDay:2,taskId:'reading',materialId:'r2',startedAt:at,activeSeconds:600,activityByDate:{[today]:600},text:'cross-date'},opts=fixture({records:[old],drafts:[draft]});let queue=Load.build(opts);assert.equal(queue.budget.spentMinutes,360);assert.equal(queue.next.kind,'budget');
 queue=Load.build({...opts,today:Year.dateKey(Date.parse(at)+86400000)});assert.equal(queue.budget.spentMinutes,0);assert.equal(queue.next.draftId,draft.id);assert.equal(queue.next.day,2);assert.equal(queue.currentComplete,true);assert.equal(draft.text,'cross-date');
});
test('prediction uses distinct grounded complete tasks of matching type/level, ignores pending/repeats and includes planned breaks',()=>{
 const target=material('target'),others=['a','b','c','d'].map(id=>material(id)),records=others.map((m,i)=>record(m.id,{activeSeconds:[600,660,720,780][i]}));records.push(record('a',{id:'repeated',activeSeconds:60}),record('pending',{evaluation:{result:'pending'},activeSeconds:60}));const timer=Timer.newState();timer.enabled=true;timer.settings.focusMinutes=10;timer.settings.shortBreakMinutes=5;
 const predicted=Load.prediction(target,{minutes:60},records,{materials:[target,...others,material('pending')],yearPlanner:Year,timerState:timer,timerCore:Timer});assert.equal(predicted.sampleCount,4);assert.equal(predicted.source,'同类真实完成记录的保守用时');assert.ok(predicted.studyMinutes>12);assert.equal(predicted.breakMinutes,0); // current 25-minute focus balance is retained until the next round
 timer.remainingSeconds=600;const schedule=Load.prediction(target,{},records,{materials:[target,...others],yearPlanner:Year,timerState:timer,timerCore:Timer});assert.equal(schedule.breakMinutes,5);assert.equal(schedule.totalMinutes,schedule.studyMinutes+5);
 const different=Load.prediction({...target,level:'B2'}, {},records,{materials:others,yearPlanner:Year});assert.equal(different.sampleCount,0);assert.equal(different.studyMinutes,30);assert.equal(different.uncertainty,'高');
});

test('a stale same-profile timer budget requires refresh rather than inventing a fresh day or saying to wait until tomorrow',()=>{
 const queue=Load.build(fixture({budget:{date:today,remainingMinutes:0,exhausted:true,budgetError:'学习档案已恢复，请刷新页面。'}}));assert.equal(queue.next.kind,'blocked');assert.match(queue.next.label,/刷新/);assert.match(queue.next.reason,/刷新/);assert.deepEqual(queue.entries,[]);
});

test('an explicitly ended day retains the same unfinished queue and exact drafts across refreshes and resumes them next day once',()=>{
 const draft={id:'unfinished-original',courseDay:1,taskId:'reading',materialId:'r1',startedAt:at,activeSeconds:120,activityByDate:{[today]:120},text:'unchanged original',answers:{q:'b'},media:[{id:'saved-audio',durationSeconds:12}]},opts=fixture({drafts:[draft]}),before=JSON.stringify(opts),timer=Timer.endDay(Timer.newState(),Date.parse(at)).state;
 const budget=date=>Timer.budget(Year.calendarBudget(opts.records,opts.drafts,date),timer),first=Load.build({...opts,budget:budget(today)});assert.equal(first.next.kind,'day-ended');assert.equal(first.currentComplete,false);assert.equal(first.budget.spentMinutes,2);assert.equal(first.entries[0].draftId,draft.id);assert.equal(first.entries.filter(e=>e.materialId==='r1').length,1);
 const reload=Load.build({...opts,budget:budget(today)});assert.deepEqual(reload,first);const tomorrow=Year.dateKey(Date.parse(at)+86400000),continued=Load.build({...opts,today:tomorrow,budget:budget(tomorrow)});assert.equal(continued.next.kind,'material');assert.equal(continued.next.day,1);assert.equal(continued.next.draftId,draft.id);assert.equal(continued.entries.filter(e=>e.materialId==='r1').length,1);assert.equal(continued.budget.remainingMinutes,360);assert.equal(JSON.stringify(opts),before);
});

test('resuming an ended day releases the original queue without completing or changing drafts and cannot reset spent minutes',()=>{
 const draft={id:'same-day-original',courseDay:1,taskId:'reading',materialId:'r1',startedAt:at,activeSeconds:120,activityByDate:{[today]:120},text:'unchanged original',answers:{q:'b'},media:[{id:'saved-audio',durationSeconds:12}]},opts=fixture({drafts:[draft]}),before=JSON.stringify(opts),closed=Timer.endDay(Timer.newState(),Date.parse(at)).state,resumed=Timer.resumeDay(closed,Date.parse(at)+1000).state,budget=Timer.budget(Year.calendarBudget(opts.records,opts.drafts,today),resumed),queue=Load.build({...opts,budget});assert.equal(queue.next.kind,'material');assert.equal(queue.next.draftId,draft.id);assert.equal(queue.entries.filter(e=>e.materialId==='r1').length,1);assert.equal(queue.currentComplete,false);assert.equal(queue.budget.spentMinutes,2);assert.equal(queue.budget.remainingMinutes,358);assert.equal(JSON.stringify(opts),before);
 const exhausted=Load.build({...opts,budget:Timer.budget({...budget,learningMinutes:360,spentMinutes:360},resumed)});assert.equal(exhausted.next.kind,'budget');assert.equal(exhausted.budget.spentMinutes,360);assert.equal(exhausted.budget.remainingMinutes,0);assert.equal(exhausted.entries[0].draftId,draft.id);assert.equal(exhausted.currentComplete,false);assert.equal(JSON.stringify(opts),before);
});
