'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=global.IELTSStudyTimerCore=require('../assets/study-timer-core.js'),B=require('../assets/backup-core.js'),U=require('../assets/user-data-store.js'),R=require('../assets/profile-reset.js');
const memory=data=>({getItem:k=>data[k]??null,setItem:(k,v)=>{data[k]=v;},removeItem:k=>{delete data[k];}});
test('timer is included in folder and backup allowlists; imported running clocks pause and duplicate rest never doubles',()=>{
 assert.ok(Object.hasOwn(B.KEYS,C.KEY));assert.ok(U.KEYS.includes(C.KEY));
 const start=C.start(C.newState(),Date.parse('2026-10-25T00:00:00Z')).state,rest=C.advance(start,Date.parse('2026-10-25T00:27:00Z')).state,data={},store=memory(data),input=JSON.stringify(rest);
 B.restore(store,{[C.KEY]:input},[C.KEY]);let saved=JSON.parse(data[C.KEY]);assert.equal(saved.running,false);assert.equal(saved.lastAt,null);assert.deepEqual(saved.restByDate,rest.restByDate);
 B.restore(store,{[C.KEY]:input},[C.KEY]);assert.deepEqual(JSON.parse(data[C.KEY]).restByDate,rest.restByDate);
 assert.throws(()=>B.validate(C.KEY,JSON.stringify({...rest,restByDate:{'2026-99-99':123}})));
});
test('learning reset clears timer budget but preserves service configurations; recovery returns a paused clock and original rest ledger',async()=>{
 const clock=C.start(C.newState(),Date.parse('2026-10-25T00:00:00Z')).state,data={[C.KEY]:JSON.stringify(clock),aiConfiguration:'UNCHANGED_AI',oralConfiguration:'UNCHANGED_ORAL'},saved=new Map(),archive={put:async p=>saved.set(p.id,structuredClone(p)),list:async()=>[...saved.values()],get:async id=>saved.get(id),remove:async id=>saved.delete(id)};
 const service=R.createService({storage:memory(data),keys:{[C.KEY]:B.KEYS[C.KEY]},databases:[],archive,profileId:'legacy',validateEntry:B.validate});
 const point=await service.reset();assert.equal(data[C.KEY],undefined);assert.equal(data.aiConfiguration,'UNCHANGED_AI');assert.equal(data.oralConfiguration,'UNCHANGED_ORAL');
 await service.restore(point.id);const restored=JSON.parse(data[C.KEY]);assert.equal(restored.running,false);assert.equal(restored.lastAt,null);assert.deepEqual(restored.settings,clock.settings);assert.equal(data.aiConfiguration,'UNCHANGED_AI');assert.equal(data.oralConfiguration,'UNCHANGED_ORAL');
});
test('all calendar budget callers include the same rest ledger and a repeated adapter does not double count it',()=>{
 const P=require('../assets/year-planner.js'),date='2026-10-25',state=C.newState();state.restByDate[date]=1200;const previous=global.IELTSStudyTimer;global.IELTSStudyTimer={budget:base=>C.budget(base,state)};
 try{const base=P.calendarBudget([{id:'r',activeSeconds:340*60,submittedAt:'2026-10-25T10:00:00Z'}],[],date);assert.equal(base.learningMinutes,340);assert.equal(base.breakMinutes,20);assert.equal(base.spentMinutes,360);assert.equal(base.remainingMinutes,0);assert.deepEqual(C.budget(base,state),base);assert.equal(P.calendarBudget([],[],'2026-10-26').remainingMinutes,360);}finally{global.IELTSStudyTimer=previous;}
});

test('backup restores and duplicate merges keep the explicit day end without creating new completion or losing prior timer settings',()=>{
 const at=new Date(2026,9,25,12).getTime(),closed=C.endDay(C.newState(),at).state,data={},store=memory(data);B.restore(store,{[C.KEY]:JSON.stringify(closed)},[C.KEY]);B.restore(store,{[C.KEY]:JSON.stringify(C.newState())},[C.KEY]);B.restore(store,{[C.KEY]:JSON.stringify(closed)},[C.KEY]);
 const restored=C.parseState(data[C.KEY]);assert.equal(restored.running,false);assert.equal(restored.endedByDate['2026-10-25'],at);assert.equal(Object.keys(restored.endedByDate).length,1);assert.equal(C.budget({date:'2026-10-25',spentMinutes:8},restored).spentMinutes,8);assert.equal(C.budget({date:'2026-10-25',spentMinutes:8},restored).dayEnded,true);assert.equal(C.budget({date:'2026-10-26',spentMinutes:0},restored).remainingMinutes,360);
});

test('restoring a stale ended backup cannot revoke an explicit resume or reset the actual shared budget',()=>{
 const at=new Date(2026,9,25,12).getTime(),date=C.dateKey(at),closed=C.endDay({...C.newState(),restByDate:{[date]:600}},at).state,resumed=C.resumeDay(closed,at+1000).state,data={[C.KEY]:JSON.stringify(resumed)},store=memory(data),legacy={...closed,updatedAt:at+999999};delete legacy.dayActionsByDate;
 for(const stale of [legacy,closed,legacy])B.restore(store,{[C.KEY]:JSON.stringify(stale)},[C.KEY]);const restored=C.parseState(data[C.KEY]),budget=C.budget({date,learningMinutes:350,spentMinutes:350},restored);assert.equal(C.dayStatus(restored,date).ended,false);assert.equal(restored.endedByDate[date],at);assert.equal(restored.running,false);assert.equal(restored.lastAt,null);assert.deepEqual(restored.restByDate,resumed.restByDate);assert.equal(budget.dayEnded,false);assert.equal(budget.spentMinutes,360);assert.equal(budget.exhausted,true);assert.deepEqual(C.mergeStates(restored,closed),restored);
});
