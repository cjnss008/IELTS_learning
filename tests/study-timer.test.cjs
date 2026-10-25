'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../assets/study-timer-core.js');
test('default 25/5 timer starts, pauses and resumes without generating learning evidence',()=>{
 const initial=C.newState(),start=C.start(initial,100000).state,tick=C.advance(start,160000).state;assert.equal(tick.remainingSeconds,1440);assert.deepEqual(tick.restByDate,{});const paused=C.pause(tick,160000).state;assert.equal(C.advance(paused,9999999).state.remainingSeconds,1440);assert.equal(C.start(paused,200000).state.lastAt,200000);assert.equal(initial.enabled,false);assert.equal(Object.hasOwn(tick,'learningRecords'),false);
});
test('focus ends in a real break and then pauses; background overnight never invents a chain of rest cycles',()=>{
 const start=C.start(C.newState(),100000).state,result=C.advance(start,100000+26*60000);assert.equal(result.state.phase,'short-break');assert.equal(result.state.remainingSeconds,240);assert.equal(Object.values(result.state.restByDate)[0],60);assert.deepEqual(result.events,['rest-started']);
 const overnight=C.advance(start,100000+24*3600000);assert.equal(overnight.state.phase,'focus');assert.equal(overnight.state.running,false);assert.equal(Object.values(overnight.state.restByDate).reduce((a,b)=>a+b,0),300);assert.equal(overnight.state.completedFocus,1);
});
test('fourth completed focus chooses fifteen-minute long break, settings are validated and edits preserve already spent rest',()=>{
 let state={...C.newState(),completedFocus:3};state=C.advance(C.start(state,100000).state,1600000).state;assert.equal(state.phase,'long-break');assert.equal(state.remainingSeconds,900);state=C.advance(state,1660000).state;const changed=C.configure(state,{focusMinutes:40,shortBreakMinutes:8,longBreakMinutes:20,cycles:3},1660000).state;assert.equal(changed.running,false);assert.equal(changed.remainingSeconds,2400);assert.equal(Object.values(changed.restByDate)[0],60);assert.throws(()=>C.configure(state,{focusMinutes:0},1660000));
});
test('cross-midnight rest splits by calendar date; absolute timestamps and max-merge do not double count across pages/restores',()=>{
 const midnight=new Date(2026,9,26,0,0,0).getTime(),initial={...C.newState(),phase:'short-break',remainingSeconds:300};const start=C.start(initial,midnight-120000).state,first=C.advance(start,midnight+60000).state;assert.equal(first.restByDate['2026-10-25'],120);assert.equal(first.restByDate['2026-10-26'],60);const second=C.advance(start,midnight+120000).state,merged=C.mergeStates(first,second);assert.equal(merged.restByDate['2026-10-25'],120);assert.equal(merged.restByDate['2026-10-26'],120);assert.equal(merged.running,false);assert.equal(merged.lastAt,null);assert.equal(C.advance(merged,midnight+86400000).state.restByDate['2026-10-26'],120);assert.deepEqual(C.mergeStates(merged,merged),merged);
});
test('rest occupies shared budget once, focus clock is not counted again, forecasts reserve breaks between study blocks',()=>{
 const state=C.newState();state.restByDate['2026-10-25']=300;let budget=C.budget({date:'2026-10-25',budgetMinutes:360,spentMinutes:340},state);assert.equal(budget.learningMinutes,340);assert.equal(budget.breakMinutes,5);assert.equal(budget.remainingMinutes,15);assert.deepEqual(C.budget(budget,state),budget);assert.equal(C.budget({...budget,learningMinutes:355},state).exhausted,true);state.enabled=true;const forecast=C.forecast(55,state);assert.equal(forecast.breakMinutes,10);assert.equal(forecast.totalMinutes,65);state.completedFocus=3;assert.equal(C.forecast(30,state).breakMinutes,15);
});
test('malformed history and backwards clock do not silently reset or manufacture rest',()=>{
 for(const patch of [{restByDate:{'2026-02-30':10}},{restByDate:{'2026-10-25':-1}},{unknown:true},{running:true,lastAt:null}])assert.throws(()=>C.parseState({...C.newState(),...patch}));const state=C.start({...C.newState(),phase:'short-break'},100000).state,result=C.advance(state,90000);assert.equal(result.state.running,false);assert.deepEqual(result.state.restByDate,{});assert.deepEqual(result.events,['clock-changed']);assert.equal(C.restore(state).running,false);
});

test('ending today settles only actual rest, pauses the clock and remains idempotent without manufacturing study time',()=>{
 const at=new Date(2026,9,25,12).getTime(),initial={...C.newState(),phase:'short-break',remainingSeconds:300},started=C.start(initial,at).state;
 const result=C.endDay(started,at+120000),saved=JSON.stringify(result.state);assert.equal(result.state.running,false);assert.equal(result.state.lastAt,null);assert.equal(result.state.restByDate['2026-10-25'],120);assert.equal(result.state.completedFocus,0);assert.equal(C.dayStatus(result.state,'2026-10-25').ended,true);assert.deepEqual(result.events,['day-ended']);
 assert.equal(JSON.stringify(C.endDay(result.state,at+600000).state),saved);assert.deepEqual(C.endDay(result.state,at+600000).events,[]);assert.equal(C.start(result.state,at+600000).state.running,false);assert.equal(C.advance(result.state,at+86400000).state.restByDate['2026-10-25'],120);
 const budget=C.budget({date:'2026-10-25',spentMinutes:10,budgetMinutes:360},result.state);assert.equal(budget.spentMinutes,12);assert.equal(budget.learningMinutes,10);assert.equal(budget.breakMinutes,2);assert.equal(budget.remainingMinutes,0);assert.equal(budget.dayEnded,true);assert.equal(budget.exhausted,true);assert.deepEqual(C.budget(budget,result.state),budget);
 const tomorrow=C.budget({date:'2026-10-26',spentMinutes:0,budgetMinutes:360},result.state);assert.equal(tomorrow.dayEnded,false);assert.equal(tomorrow.remainingMinutes,360);assert.equal(C.start(result.state,at+86400000).state.running,true);
});

test('legacy states acquire an empty end ledger while merged or restored newer settings cannot reopen an ended day',()=>{
 const at=new Date(2026,9,25,12).getTime(),legacy=C.newState();delete legacy.endedByDate;assert.deepEqual(C.parseState(JSON.stringify(legacy)).endedByDate,{});
 const ended=C.endDay(legacy,at).state,newer=C.configure(legacy,{focusMinutes:40},at+10000).state,merged=C.mergeStates(ended,newer);assert.equal(merged.settings.focusMinutes,40);assert.equal(C.dayStatus(merged,at).ended,true);assert.equal(C.start(merged,at+20000).state.running,false);assert.deepEqual(C.mergeStates(merged,merged),merged);assert.equal(C.dayStatus(C.restore(merged),at).ended,true);
 const another=C.endDay(legacy,at+30000).state;assert.equal(C.mergeStates(another,ended).endedByDate['2026-10-25'],at);
 for(const endedByDate of [null,[],{'2026-02-30':at},{'2026-10-25':-1},{'2026-10-25':'2026-10-25'},{'2026-10-25':Infinity}])assert.throws(()=>C.parseState({...C.newState(),endedByDate}));
});

test('resuming today preserves first end, exact clock balance and actual rest without automatically starting anything',()=>{
 const at=new Date(2026,9,25,12).getTime(),date=C.dateKey(at),started=C.start({...C.newState(),phase:'short-break',remainingSeconds:300,completedFocus:3},at).state,closed=C.endDay(started,at+120000).state,before=JSON.stringify(closed),result=C.resumeDay(closed,at+600000),resumed=result.state;
 assert.equal(JSON.stringify(closed),before);assert.deepEqual(result.events,['day-resumed']);assert.equal(resumed.running,false);assert.equal(resumed.lastAt,null);assert.equal(resumed.phase,closed.phase);assert.equal(resumed.remainingSeconds,180);assert.equal(resumed.completedFocus,3);assert.deepEqual(resumed.restByDate,closed.restByDate);assert.deepEqual(resumed.endedByDate,closed.endedByDate);assert.deepEqual(C.dayStatus(resumed,date),{date,ended:false,endedAt:null,firstEndedAt:at+120000,resumedAt:at+600000,revision:2});
 assert.equal(JSON.stringify(C.resumeDay(resumed,at+900000).state),JSON.stringify(resumed));assert.deepEqual(C.resumeDay(resumed,at+900000).events,[]);assert.equal(C.advance(resumed,at+3600000).state.remainingSeconds,180);assert.equal(C.budget({date,spentMinutes:10},resumed).spentMinutes,12);assert.equal(C.budget({date,spentMinutes:10},resumed).remainingMinutes,348);assert.equal(C.dayStatus(resumed,at+86400000).ended,false);assert.deepEqual(C.resumeDay(closed,at+86400000).state,closed);assert.equal(C.start(resumed,at+900000).state.running,true);
});

test('monotonic day actions survive stale end backups and later re-ending while spent budget never resets',()=>{
 const at=new Date(2026,9,25,12).getTime(),date=C.dateKey(at),base={...C.newState(),restByDate:{[date]:600}},closed=C.endDay(base,at).state,resumed=C.resumeDay(closed,at+1000).state,legacy={...closed,updatedAt:at+9999999};delete legacy.dayActionsByDate;
 for(const stale of [closed,legacy])for(const pair of [[resumed,stale],[stale,resumed]]){const merged=C.mergeStates(...pair),budget=C.budget({date,learningMinutes:350,spentMinutes:350},merged);assert.equal(C.dayStatus(merged,date).ended,false);assert.equal(merged.endedByDate[date],at);assert.equal(merged.running,false);assert.equal(budget.spentMinutes,360);assert.equal(budget.remainingMinutes,0);assert.equal(budget.exhausted,true);assert.deepEqual(C.mergeStates(merged,stale),merged);}
 const reclosed=C.endDay(resumed,at+2000).state;assert.equal(C.dayStatus(reclosed,date).revision,3);assert.equal(C.dayStatus(reclosed,date).endedAt,at+2000);assert.equal(reclosed.endedByDate[date],at);for(const pair of [[resumed,reclosed],[reclosed,resumed]])assert.equal(C.dayStatus(C.mergeStates(...pair),date).ended,true);assert.equal(C.budget({date:'2026-10-26',spentMinutes:0},reclosed).remainingMinutes,360);
});

test('resume metadata remains optional for old backups but malformed or unbounded action records fail closed',()=>{
 const at=new Date(2026,9,25,12).getTime(),date=C.dateKey(at),closed=C.endDay(C.newState(),at).state,legacy={...closed};delete legacy.dayActionsByDate;assert.equal(C.dayStatus(C.parseState(JSON.stringify(legacy)),date).revision,1);
 for(const dayActionsByDate of [null,[],{[date]:{version:2,action:'resumed',at:at+1,extra:true}},{[date]:{version:0,action:'resumed',at}},{[date]:{version:2,action:'resume',at}},{[date]:{version:2,action:'resumed',at:Infinity}},{'2026-10-26':{version:2,action:'resumed',at}}])assert.throws(()=>C.parseState({...closed,dayActionsByDate}));
 let yearly=C.newState();for(let i=0;i<367;i++){const day=at+i*86400000;yearly=C.resumeDay(C.endDay(yearly,day).state,day+1).state;}assert.equal(Object.keys(yearly.endedByDate).length,366);assert.equal(Object.keys(yearly.dayActionsByDate).length,366);assert.ok(JSON.stringify(yearly).length<80000);assert.deepEqual(C.parseState(JSON.stringify(yearly)),yearly);
});
