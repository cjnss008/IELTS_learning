'use strict';
// Shared course-order query: identical courseDay/currentComplete as the full build,
// fail-closed budget/placement/summary gates, and no calendar work on the narrow path.
const test=require('node:test'),assert=require('node:assert/strict');
const Load=require('../assets/daily-learning-load.js'),Hub=require('../assets/today-hub.js'),Player=require('../assets/course-player.js'),Year=require('../assets/year-planner.js'),A=require('../assets/assessment-core.js');
const at='2026-10-25T10:00:00.000Z',today=Year.dateKey(Date.parse(at));
function material(id,extra={}){return{id,skill:'reading',type:'practice',level:'A0',pool:'training',week:1,estimatedMinutes:30,title:id,source:{verification:'reviewed'},questions:[{id:'q',type:'single',options:['a','b'],answers:['a']}],...extra};}
function record(id,extra={}){return{id:'work-'+id,version:1,materialId:id,taskId:'reading',skill:'reading',kind:'original',dayNumber:Number(id.slice(1)),submittedAt:at,startedAt:'2026-10-25T09:50:00.000Z',activeSeconds:600,activityByDate:{[today]:600},answer:JSON.stringify({schema:1,answers:{q:'a'}}),evaluation:{method:'objective',result:'pass'},...extra};}
function fixture(extra={}){const data={weeks:[{week:1,level:'A0'}],materials:['r1','r2','r3'].map(id=>material(id)),days:[1,2,3].map(day=>({day,week:1,tasks:[{id:'reading',minutes:60,materialIds:['r'+day]},{id:'reflection',minutes:30,materialIds:['reflection-'+day]}]}))};return{data,records:[],drafts:[],currentDay:1,today,now:Date.parse(at),hub:Hub,player:Player,yearPlanner:Year,assessment:A,summaryForDay:n=>({completionValid:n===1,remaining:0}),...extra};}
function query(opts){return Load.build({...opts,courseDayOnly:true});}
function equalToFull(opts){const full=Load.build(opts),q=query(opts);assert.equal(q.courseDay,full.courseDay);assert.equal(q.currentComplete,full.currentComplete);assert.deepEqual(q.budget,full.budget);assert.deepEqual(q.placement,full.placement);assert.equal(q.entries,undefined);assert.equal(q.schedule,undefined);assert.equal(q.historical,undefined);assert.equal(q.unreadable,false);return{courseDay:q.courseDay,q};}

test('query returns the same courseDay as the full build for fresh, started, completed, placement-floored and selected states',()=>{
 const fresh=fixture();assert.deepEqual(equalToFull(fresh).courseDay,1);
 const dayOneDone=fixture({records:[record('r1')],summaryForDay:n=>({completionValid:n===1,remaining:0})});assert.deepEqual(equalToFull(dayOneDone).courseDay,2);
 const started=fixture({records:[record('r1'),record('r2')],drafts:[{id:'d3',courseDay:3,taskId:'reading',materialId:'r3',startedAt:at,text:'keep'}],summaryForDay:n=>n<=2?({completionValid:true,remaining:0}):({completionValid:false,remaining:0})});assert.deepEqual(equalToFull(started).courseDay,3);
 const allDone=fixture({records:[record('r1'),record('r2'),record('r3')],summaryForDay:()=>({completionValid:true,remaining:0})});const all=equalToFull(allDone);assert.equal(all.courseDay,null);assert.equal(all.q.currentComplete,true);assert.equal('courseDay' in all.q,true);
 const floor=fixture({placement:{currentRoute:()=>({startDay:2,startWeek:1,level:'A0',skills:{},sessionId:'s',adoptedAt:at})}});assert.deepEqual(equalToFull(floor).courseDay,2);
 const selected=fixture({selectedDay:2,records:[record('r1')]});assert.deepEqual(equalToFull(selected).courseDay,2);
});

test('budget errors and unverified placement return no courseDay instead of inventing a start',()=>{
 const budget=query(fixture({budget:{budgetError:'BUDGET_REFRESH_REQUIRED',remainingMinutes:0,spentMinutes:0}}));assert.equal('courseDay' in budget,false);assert.equal(budget.reason,'BUDGET_REFRESH_REQUIRED');
 const placement=query(fixture({placement:{currentRoute(){throw Error('PLACEMENT_UNVERIFIED');}}}));assert.equal('courseDay' in placement,false);assert.match(placement.reason,/PLACEMENT_UNVERIFIED/);
});

test('the query rejects a missing or malformed summary instead of treating it as incomplete-and-safe',()=>{
 for(const bad of [undefined,null,{},'ready',{completionValid:true},{remaining:0},{completionValid:true,remaining:NaN},{completionValid:true,remaining:-1},{completionValid:true,remaining:0,unreadable:true}]){
  const q=query(fixture({summaryForDay:()=>bad}));assert.equal(q.unreadable,true,'summary '+JSON.stringify(bad));assert.equal(q.courseDay,1);
 }
 const known=query(fixture({summaryForDay:()=>({completionValid:false,remaining:2})}));assert.equal(known.unreadable,false);assert.equal(known.courseDay,1);
});

test('an unreadable scanned day or current day is aggregated as unknown for the query',()=>{
 const scanned=query(fixture({records:[record('r1')],summaryForDay:n=>{if(n===2)throw Error('SUMMARY_UNAVAILABLE');return{completionValid:n===1,remaining:0};}}));assert.equal(scanned.courseDay,2);assert.equal(scanned.unreadable,true);
 const current=query(fixture({placement:{currentRoute:()=>({startDay:2,startWeek:1,level:'A0',skills:{},sessionId:'s',adoptedAt:at})},summaryForDay:n=>n===1?undefined:({completionValid:false,remaining:0})}));assert.equal(current.courseDay,2);assert.equal(current.unreadable,true);
});

test('the narrow query skips calendar scheduling only without a selected day; the full build keeps it',()=>{
 const throwing={...Year,dateNumber(){throw Error('CALENDAR_MUST_NOT_RUN');}},opts=fixture({yearPlanner:throwing,startDate:'2026-10-20'});
 assert.doesNotThrow(()=>Load.build({...opts,courseDayOnly:true}));
 assert.throws(()=>Load.build({...opts}),/CALENDAR_MUST_NOT_RUN/);
 assert.throws(()=>Load.build({...opts,selectedDay:1,courseDayOnly:true}),/CALENDAR_MUST_NOT_RUN/);
 const normal=Load.build(fixture({startDate:'2026-10-20'}));assert.ok(normal.schedule);assert.equal(normal.schedule.scheduledDay,6);
});

test('the full build keeps its display fallback for a missing summary while the query stays strict',()=>{
 const opts=fixture({summaryForDay:()=>undefined});
 assert.doesNotThrow(()=>Load.build(opts));
 assert.doesNotThrow(()=>Load.build({...opts,courseDayOnly:true}));
 assert.equal(query(opts).unreadable,true);
});

test('only the native hub shares one task/latest pair; an adapter with overridden methods keeps its own',()=>{
 const realPair=Hub.taskStateAndLatest;let pairs=0;
 Hub.taskStateAndLatest=(task,records,options)=>{pairs++;return realPair(task,records,options);};
 try{const q=query(fixture({summaryForDay:()=>({completionValid:false,remaining:0})}));assert.equal(q.courseDay,1);assert.ok(pairs>0);}
 finally{Hub.taskStateAndLatest=realPair;}
 const realState=Hub.taskState;let custom=0;
 const adapter={...Hub,taskState(task,records,options){custom++;if(task.id==='reading')return{done:true,pending:false,count:1,total:1,missingMaterialIds:[],pendingMaterialIds:[],nextMaterialId:null,legacyTraining:false};return realState(task,records,options);}};
 const q=Load.build(fixture({hub:adapter,summaryForDay:()=>({completionValid:false,remaining:0})}));
 assert.ok(custom>0);assert.equal(q.next.kind,'reflection');
 const native=Load.build(fixture({summaryForDay:()=>({completionValid:false,remaining:0})}));assert.equal(native.next.kind,'material');
 const delegated=Load.build(fixture({hub:{...Hub,taskState:realState,latestForMaterial:Hub.latestForMaterial},summaryForDay:()=>({completionValid:false,remaining:0})}));
 assert.equal(delegated.next.kind,native.next.kind);assert.equal(delegated.courseDay,native.courseDay);
});

test('a callback-free query without the mistakes API is unknown; the full build keeps its display fallback',()=>{
 const saved=global.IELTSMistakes;delete global.IELTSMistakes;
 try{
  const opts=fixture({summaryForDay:undefined});
  assert.equal(query(opts).unreadable,true);assert.equal(query(opts).courseDay,1);
  assert.doesNotThrow(()=>Load.build(opts));assert.ok(Array.isArray(Load.build(opts).entries));
 }finally{if(saved!==undefined)global.IELTSMistakes=saved;}
});
