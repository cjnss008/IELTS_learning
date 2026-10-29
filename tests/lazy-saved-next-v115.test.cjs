'use strict';
// Synthetic DOM, actual course-player source and record flow; no repository edits.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const testFile=path.join(__dirname,'course-player-dom.test.cjs'),playerFile=path.join(__dirname,'../assets/course-player.js');
let player=fs.readFileSync(playerFile,'utf8');
const anchor='function learningQueue(){';if(player.split(anchor).length!==2)throw Error('queue instrumentation anchor');player=player.replace(anchor,anchor+'root.__testQueueCalls=(root.__testQueueCalls||0)+1;');
const shim={...fs,readFileSync(file,...args){return typeof file==='string'&&path.resolve(file).toLowerCase()===path.resolve(playerFile).toLowerCase()?player:fs.readFileSync(file,...args);}};
let prefix=fs.readFileSync(testFile,'utf8').split('\ntest(')[0].replace("fs=require('node:fs')",'fs=__fixtureFs');
prefix=prefix.replace('setTimeout:()=>1,clearTimeout(){}','setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)');
const visibilityOld='createElementNS:(ns,tag)=>new Element(tag),addEventListener(){},querySelectorAll';
const visibilityNew='createElementNS:(ns,tag)=>new Element(tag),listeners:{},addEventListener(name,fn){(this.listeners[name]||=[]).push(fn)},dispatchEvent(event){for(const fn of this.listeners[event.type]||[])fn(event)},querySelectorAll';
if(prefix.split(visibilityOld).length!==2)throw Error('visibility listener fixture anchor');prefix=prefix.replace(visibilityOld,visibilityNew);
const fixture=new Function('require','__dirname','__fixtureFs',prefix+'\nreturn fixture;')(createRequire(testFile),path.dirname(testFile),shim);
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(setImmediate);};
const option=(f,id,value)=>f.nodes.get('courseQuestions').children.find(n=>n.dataset.questionId===id).querySelectorAll('input').find(n=>n.value===value);
async function saved(options={}){
  const f=fixture({},options);await settle();await f.win.IELTSTodayNavigation.resumeNext('reading','reading-one');
  const choice=option(f,'q1','red');choice.checked=true;await choice.fire('change');await f.nodes.get('courseSubmit').fire('click');await settle();
  assert.equal(f.records().length,1);assert.equal(f.win.IELTSTodayNavigation.current().submitted,true);return f;
}
function blockedQueue(f){f.win.IELTSDailyLearningLoad={build:()=>({entries:[],next:{kind:'blocked',reason:'模拟队列尚未核对'},budget:{remainingMinutes:360}})};f.win.__testQueueCalls=0;}
const button=f=>f.nodes.get('courseResult').querySelector('.course-continue-queue');

test('saved original and refresh update completion without building the next queue',async()=>{
  const f=await saved(),before=JSON.stringify(f.records());blockedQueue(f);
  await f.nodes.get('courseBegin').fire('click');await settle();
  f.win.dispatchEvent({type:'ielts:study-timer-changed'});await settle();
  assert.equal(f.win.__testQueueCalls,0);assert.equal(button(f).textContent,'查看下一步任务');assert.equal(f.nodes.get('courseResult').hidden,false);
  assert.match(f.nodes.get('courseResult').textContent,/原始正确数 1 \/ 1/);assert.equal(JSON.stringify(f.records()),before);
});

test('click shows busy before asynchronous checking and fresh blocked queue does not start work',async()=>{
  const f=await saved(),before=JSON.stringify(f.records()),frames=[];blockedQueue(f);f.win.requestAnimationFrame=cb=>frames.push(cb);
  const original=f.win.IELTSRecords.list;let reads=0;f.win.IELTSRecords.list=async()=>{reads++;return original();};
  const go=button(f),pending=go.fire('click');assert.equal(go.textContent,'正在核对下一步任务…');assert.equal(go.disabled,true);assert.equal(go.getAttribute('aria-busy'),'true');assert.equal(reads,0);assert.equal(f.win.__testQueueCalls,0);
  f.win.dispatchEvent({type:'ielts:study-timer-changed'});assert.equal(go.disabled,true);assert.equal(go.textContent,'正在核对下一步任务…');
  assert.equal(frames.length,1);frames.shift()();await pending;assert.ok(reads>0);assert.ok(f.win.__testQueueCalls>0);assert.match(f.nodes.get('courseNotice').textContent,/模拟队列尚未核对/);assert.equal(f.win.IELTSTodayNavigation.current().submitted,true);assert.equal(JSON.stringify(f.records()),before);
});

test('profile switch during paint cancels pending continuation without reading or writing the other profile',async()=>{
  const f=await saved(),before=JSON.stringify(f.records()),frames=[];blockedQueue(f);f.win.requestAnimationFrame=cb=>frames.push(cb);
  const original=f.win.IELTSRecords.list;let reads=0;f.win.IELTSRecords.list=async()=>{reads++;return original();};const go=button(f),pending=go.fire('click');
  f.win.IELTSProfiles.current=()=>({id:'different-synthetic-owner'});f.win.dispatchEvent({type:'ielts:profile-changed'});frames.shift()();await pending;
  assert.equal(reads,0);assert.equal(f.win.__testQueueCalls,0);assert.equal(go.disabled,true);assert.match(f.nodes.get('courseNotice').textContent,/档案已变化|档案已切换/);assert.equal(JSON.stringify(f.records()),before);
});

test('A to B to A during paint still invalidates this page',async()=>{
  const f=await saved(),before=JSON.stringify(f.records()),frames=[];blockedQueue(f);f.win.requestAnimationFrame=cb=>frames.push(cb);
  const go=button(f),pending=go.fire('click');f.win.IELTSProfiles.current=()=>({id:'B'});f.win.dispatchEvent({type:'ielts:profile-changed'});f.win.IELTSProfiles.current=()=>({id:'legacy'});f.win.dispatchEvent({type:'ielts:profile-changed'});frames.shift()();await pending;
  assert.equal(f.win.__testQueueCalls,0);assert.equal(go.disabled,true);assert.equal(JSON.stringify(f.records()),before);
});

test('generation failure before an event is delivered fails closed',async()=>{
  const f=await saved(),before=JSON.stringify(f.records()),frames=[];blockedQueue(f);f.win.requestAnimationFrame=cb=>frames.push(cb);
  const go=button(f),pending=go.fire('click');f.win.IELTSProfiles.assertFresh=()=>{throw Error('合成代次已变化，请刷新');};frames.shift()();await pending;
  assert.equal(f.win.__testQueueCalls,0);assert.equal(go.disabled,true);assert.match(f.nodes.get('courseNotice').textContent,/代次已变化/);assert.equal(JSON.stringify(f.records()),before);
});

test('pagehide cancels a queued continuation before checking records',async()=>{
  const f=await saved(),before=JSON.stringify(f.records()),frames=[];blockedQueue(f);f.win.requestAnimationFrame=cb=>frames.push(cb);
  const original=f.win.IELTSRecords.list;let reads=0;f.win.IELTSRecords.list=async()=>{reads++;return original();};const pending=button(f).fire('click');f.win.dispatchEvent({type:'pagehide'});frames.shift()();await pending;
  assert.equal(reads,0);assert.equal(f.win.__testQueueCalls,0);assert.equal(JSON.stringify(f.records()),before);
});

test('changing the displayed record during paint cancels the old action',async()=>{
  const f=await saved(),before=JSON.stringify(f.records()),frames=[];blockedQueue(f);f.win.requestAnimationFrame=cb=>frames.push(cb);const pending=button(f).fire('click');
  await f.nodes.get('courseBegin').fire('click');await settle();frames.shift()();await pending;
  assert.equal(f.win.__testQueueCalls,0);assert.equal(JSON.stringify(f.records()),before);assert.equal(f.win.IELTSTodayNavigation.current().submitted,true);
  const retry=button(f),retryPending=retry.fire('click');frames.shift()();await retryPending;assert.ok(f.win.__testQueueCalls>0);assert.match(f.nodes.get('courseNotice').textContent,/模拟队列尚未核对/);
});

test('switching course cancels the old action but does not disable the current profile',async()=>{
  const f=await saved(),before=JSON.stringify(f.records()),frames=[];blockedQueue(f);f.win.requestAnimationFrame=cb=>frames.push(cb);const pending=button(f).fire('click');
  await f.nodes.get('courseNext').fire('click');frames.shift()();await pending;assert.equal(f.win.__testQueueCalls,0);assert.equal(f.win.IELTSTodayNavigation.current().day,2);
  await f.nodes.get('courseBegin').fire('click');assert.equal(f.win.IELTSTodayNavigation.current().active,true);assert.equal(f.win.IELTSTodayNavigation.current().submitted,false);assert.equal(JSON.stringify(f.records()),before);
});

test('hiding the page before the bounded fallback cancels continuation',async()=>{
  const f=await saved(),before=JSON.stringify(f.records());blockedQueue(f);f.win.requestAnimationFrame=()=>{};const original=f.win.IELTSRecords.list;let reads=0;f.win.IELTSRecords.list=async()=>{reads++;return original();};
  const pending=button(f).fire('click');f.win.document.hidden=true;f.win.document.dispatchEvent({type:'visibilitychange'});await pending;
  assert.equal(reads,0);assert.equal(f.win.__testQueueCalls,0);assert.equal(JSON.stringify(f.records()),before);
});

test('hide then show before fallback cancels the old action but permits manual retry',async()=>{
  const f=await saved(),before=JSON.stringify(f.records());blockedQueue(f);f.win.requestAnimationFrame=()=>{};const original=f.win.IELTSRecords.list;let reads=0;f.win.IELTSRecords.list=async()=>{reads++;return original();};
  const go=button(f),pending=go.fire('click');f.win.document.hidden=true;f.win.document.dispatchEvent({type:'visibilitychange'});f.win.document.hidden=false;f.win.document.dispatchEvent({type:'visibilitychange'});await pending;
  assert.equal(reads,0);assert.equal(f.win.__testQueueCalls,0);assert.equal(go.disabled,false);assert.match(f.nodes.get('courseNotice').textContent,/页面刚切换，请手动重试/);
  f.win.requestAnimationFrame=cb=>cb();await go.fire('click');assert.ok(reads>0);assert.ok(f.win.__testQueueCalls>0);assert.match(f.nodes.get('courseNotice').textContent,/模拟队列尚未核对/);assert.equal(JSON.stringify(f.records()),before);
});

test('an unavailable animation frame falls back to a bounded timer',async()=>{
  const f=await saved(),before=JSON.stringify(f.records());blockedQueue(f);f.win.requestAnimationFrame=()=>{};
  const go=button(f),pending=go.fire('click');assert.equal(go.disabled,true);await pending;assert.ok(f.win.__testQueueCalls>0);assert.match(f.nodes.get('courseNotice').textContent,/模拟队列尚未核对/);assert.equal(JSON.stringify(f.records()),before);
});

test('ended day, rest and stale timer disable checking without altering the saved original',async()=>{
  let timerState={running:false,phase:'focus'},ended=false,stale=false;const timer={snapshot:()=>timerState,budget:base=>({...base,dayEnded:ended,exhausted:ended||stale,remainingMinutes:ended||stale?0:360,...(stale?{budgetError:'学习档案已重置，请刷新。'}:{})})};
  const f=await saved({window:{IELTSStudyTimer:timer}}),before=JSON.stringify(f.records());blockedQueue(f);const go=button(f);
  timerState={running:true,phase:'short-break'};f.win.dispatchEvent({type:'ielts:study-timer-changed'});assert.equal(go.disabled,true);assert.match(go.textContent,/休息后/);
  timerState={running:false,phase:'focus'};ended=true;f.win.dispatchEvent({type:'ielts:study-timer-changed'});assert.equal(go.disabled,true);assert.match(go.textContent,/今日已结束/);
  ended=false;stale=true;f.win.dispatchEvent({type:'ielts:study-timer-changed'});assert.equal(go.disabled,true);assert.match(go.title,/档案已重置/);
  assert.equal(f.win.__testQueueCalls,0);assert.equal(JSON.stringify(f.records()),before);
});
