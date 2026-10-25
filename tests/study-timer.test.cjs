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
