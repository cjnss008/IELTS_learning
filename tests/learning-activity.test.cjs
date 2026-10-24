'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createClock,dateKey}=require('../assets/learning-activity.js');
test('supplementary activity excludes AI waiting, background, lost focus and stale idle gaps, and survives a paused restore',()=>{
 let time=Date.parse('2026-10-24T10:00:00Z'),visible=true;const c=createClock({now:()=>time,active:()=>visible});c.resume();time+=1000;c.tick();time+=2000;c.touch();assert.equal(c.snapshot().activeSeconds,3);c.pause();time+=60000;c.tick();assert.equal(c.snapshot().activeSeconds,3);c.resume();visible=false;time+=3000;c.tick();assert.equal(c.snapshot().activeSeconds,3);visible=true;time+=1000;c.tick();assert.equal(c.snapshot().activeSeconds,4);time+=121000;c.tick();assert.equal(c.snapshot().activeSeconds,4);c.touch();time+=2000;c.tick();const saved=c.take();assert.equal(saved.activeSeconds,6);assert.equal(saved.activityByDate[dateKey(time)],6);assert.equal(c.snapshot().activeSeconds,0);time+=86400000;c.reset(saved);c.resume();time+=1000;c.tick();const restored=c.snapshot();assert.equal(restored.activeSeconds,7);assert.equal(Object.values(restored.activityByDate).reduce((a,b)=>a+b,0),7);
});

test('a shared remaining budget caps both writing clocks exactly, preserves activity identity and resumes on a new allowance',()=>{
 let time=Date.parse('2026-10-24T10:00:00Z'),left=2.5,stops=0;const options={now:()=>time,remaining:()=>left,onUse:n=>{left-=n;},onExhausted:()=>{stops++;}},one=createClock(options),two=createClock(options);one.resume();time+=2000;one.tick();assert.equal(one.snapshot().activeSeconds,2);one.pause();two.resume();time+=1000;two.tick();assert.equal(two.snapshot().activeSeconds,.5);assert.equal(left,0);assert.equal(stops,1);time+=5000;two.tick();assert.equal(two.snapshot().activeSeconds,.5);const saved=two.snapshot(),id=saved.id;two.reset(saved);assert.equal(two.snapshot().id,id);const taken=two.take();assert.equal(taken.id,id);assert.notEqual(two.snapshot().id,id);left=60;two.resume();time+=1000;two.tick();assert.equal(two.snapshot().activeSeconds,1);
});

test('periodic budget polling does not turn an idle tab into fresh user interaction',()=>{
 let time=Date.parse('2026-10-24T10:00:00Z');const c=createClock({now:()=>time});c.resume();for(let i=0;i<40;i++){time+=5000;c.pause();c.resume();}assert.equal(c.snapshot().activeSeconds,115);c.touch();time+=1000;c.tick();assert.equal(c.snapshot().activeSeconds,116);
});
