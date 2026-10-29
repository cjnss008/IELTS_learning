'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(process.env.IELTS_HUB_TEST_SOURCE||path.join(__dirname,'../assets/today-hub.js'),'utf8');
class Element{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this.attributes={};this.dataset={};this.textContent='';this.disabled=false;this.hidden=false;this.className='';}
 replaceChildren(...children){this.children=children;}append(...children){this.children.push(...children);}setAttribute(key,value){this.attributes[key]=String(value);}getAttribute(key){return this.attributes[key];}
 addEventListener(name,fn){(this.listeners[name]||=[]).push(fn);}async fire(name){for(const fn of this.listeners[name]||[])await fn({target:this});}
 querySelectorAll(selector){return this.children.flatMap(child=>[child,...(child.querySelectorAll?.(selector)||[])]).filter(child=>child.tagName===selector.toUpperCase());}scrollIntoView(){}
}
async function fixture(){
 const ids=['todayOverview','todayEyebrow','todayTitle','todayGoal','todayDone','todayMinutes','todayMistakes','todayStart','todayNext','todayAdvice','todayRoute','todayLearningQueue','todayQueueSummary','courseMaterialIntro','courseSession'];
 const nodes=new Map(ids.map(id=>[id,new Element()])),events={},timers=new Map(),frames=[],writes=[],opened=[];let clock=0,serial=0,queueCalls=0,fence={profileId:'p-synthetic1',generation:'g1'},broken=false;
 const storage={getItem:()=>'{"startDate":"2026-10-28"}',setItem:(...args)=>writes.push(args)};
 const task={id:'reading',skill:'reading',minutes:10,materialIds:['material-one'],mode:'practice',instructions:'Read',deliverable:'Answer'},data={days:[{day:3,week:1,title:'Synthetic',tasks:[task]}],materials:[{id:'material-one',title:'Synthetic text',skill:'reading',questions:[],estimatedMinutes:10,source:{kind:'original',rights:'synthetic',verification:'reviewed'}}]};
 const navigation={current:()=>({day:3,taskId:'reading',materialId:'material-one',active:false,submitted:false}),drafts:()=>[],allDrafts:()=>[],budget:()=>({spentMinutes:0,remainingMinutes:360}),exposures:()=>({}),learningQueue(){queueCalls++;return {entries:[],next:{kind:'material',day:3,taskId:'reading',materialId:'material-one',label:'继续学习',reason:'按原稿继续',fitsBudget:true},budget:{remainingMinutes:360}};},async openQueued(entry){opened.push(entry);}};
 const root={document:{getElementById:id=>nodes.get(id)||null,createElement:tag=>new Element(tag),querySelectorAll:()=>[],addEventListener(){}},
  IELTSRecords:{list:async()=>[]},IELTSCurriculumData:data,IELTSTodayNavigation:navigation,
  IELTSProfiles:{assertFresh(){if(broken)throw Error('档案已切换');return {...fence};},current:()=>({id:fence.profileId}),storage:()=>storage},
  IELTSMistakes:{EVENT:'mistakes',forDay:()=>({completionValid:false,remaining:0,remainingItems:[]})},
  IELTSRecordSnapshotIndex:{projectRead:run=>run()},IELTSAdaptivePlan:{getDay:day=>day},
  location:{search:'?day=3',href:'http://example.invalid/今日学习.html?day=3'},
  addEventListener:(name,fn)=>(events[name]||=[]).push(fn),
  requestAnimationFrame:fn=>(frames.push(fn),frames.length),
  setTimeout:(fn,delay)=>{const id=++serial;timers.set(id,{fn,due:clock+delay});return id;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(source,{window:root,globalThis:root,URL,URLSearchParams,setTimeout,clearTimeout},{filename:'today-hub-candidate.js'});
 await new Promise(resolve=>setImmediate(resolve));
 function frame(){while(frames.length)frames.shift()();}
 function tick(ms){clock+=ms;while(true){const row=[...timers].filter(([,v])=>v.due<=clock).sort((a,b)=>a[1].due-b[1].due)[0];if(!row)break;timers.delete(row[0]);row[1].fn();}}
 function dispatch(name,detail={}){for(const fn of events[name]||[])fn({type:name,detail});}
 frame();queueCalls=0;
 return{nodes,writes,opened,dispatch,frame,tick,timers,frames,get calls(){return queueCalls;},setFence(value){fence=value;},breakFence(){broken=true;}};
}

test('public plan and near progress coalesce once, with no cached queue',async()=>{
 const f=await fixture();f.dispatch('ielts:public-course-plan-changed',{profileId:'p-synthetic1'});assert.equal(f.timers.size,1);f.tick(100);assert.equal(f.calls,0);
 f.dispatch('ielts:course-progress',{day:3,allRecords:[]});assert.equal(f.timers.size,0);f.frame();assert.equal(f.calls,1);f.tick(300);f.frame();assert.equal(f.calls,1);assert.equal(f.writes.length,0);
});
test('missing or failed history refresh falls back after 250 ms without granting credit',async()=>{
 const f=await fixture();f.dispatch('ielts:public-course-plan-changed',{profileId:'p-synthetic1'});f.tick(249);f.frame();assert.equal(f.calls,0);f.tick(1);f.frame();assert.equal(f.calls,1);assert.equal(f.writes.length,0);
});
test('every unrelated evidence or budget event cancels the timer and renders normally',async()=>{
 for(const name of ['ielts:budget-changed','ielts:memory-changed','ielts:study-timer-changed','ielts:year-first-use-changed','mistakes']){
  const f=await fixture();f.dispatch('ielts:public-course-plan-changed',{profileId:'p-synthetic1'});f.dispatch(name,{});assert.equal(f.timers.size,0,name);f.frame();assert.equal(f.calls,1,name);f.tick(300);f.frame();assert.equal(f.calls,1,name);
 }
});
test('repeated public events cannot postpone the first 250 ms deadline',async()=>{
 const f=await fixture();f.dispatch('ielts:public-course-plan-changed',{profileId:'p-synthetic1'});f.tick(249);f.dispatch('ielts:public-course-plan-changed',{profileId:'p-synthetic1'});assert.equal(f.timers.size,1);f.tick(1);f.frame();assert.equal(f.calls,1);
});
test('a profile or generation change rejects the delayed render and preserves original data',async()=>{
 for(const next of [{profileId:'p-synthetic2',generation:'g1'},{profileId:'p-synthetic1',generation:'g2'}]){
  const f=await fixture();f.dispatch('ielts:public-course-plan-changed',{profileId:'p-synthetic1'});f.setFence(next);f.tick(250);f.frame();assert.equal(f.calls,0);assert.match(f.nodes.get('todayQueueSummary').textContent,/档案已变化.*原稿保留/);assert.equal(f.writes.length,0);
 }
});
test('an unreadable owner is held, while a foreign event preserves the original path',async()=>{
 const f=await fixture();f.dispatch('ielts:public-course-plan-changed',{profileId:'p-synthetic1'});f.breakFence();f.tick(250);f.frame();assert.equal(f.calls,0);assert.match(f.nodes.get('todayQueueSummary').textContent,/刷新/);
 const g=await fixture();g.breakFence();g.dispatch('ielts:public-course-plan-changed',{profileId:'p-synthetic1'});g.frame();assert.equal(g.calls,0);assert.match(g.nodes.get('todayQueueSummary').textContent,/刷新/);
 const h=await fixture();h.dispatch('ielts:public-course-plan-changed',{profileId:'p-other'});h.frame();assert.equal(h.calls,1);
});
test('a pending animation frame already represents the public notification',async()=>{
 const f=await fixture();f.dispatch('ielts:memory-changed');f.dispatch('ielts:public-course-plan-changed',{profileId:'p-synthetic1'});assert.equal(f.timers.size,0);f.frame();assert.equal(f.calls,1);
});
test('an existing user action remains available and still enters through normal openQueued',async()=>{
 const f=await fixture();f.dispatch('ielts:public-course-plan-changed',{profileId:'p-synthetic1'});await f.nodes.get('todayStart').fire('click');assert.equal(f.opened.length,1);assert.equal(f.opened[0].materialId,'material-one');assert.equal(f.writes.length,0);f.frame();assert.equal(f.calls,1);assert.equal(f.timers.size,0);
});
test('the profile and generation are rechecked after a delayed timer schedules its animation frame',async()=>{
 for(const next of [{profileId:'p-synthetic2',generation:'g1'},{profileId:'p-synthetic1',generation:'g2'}]){
  const f=await fixture();f.dispatch('ielts:public-course-plan-changed',{profileId:'p-synthetic1'});f.tick(250);assert.equal(f.frames.length,1);f.setFence(next);f.frame();assert.equal(f.calls,0);assert.match(f.nodes.get('todayQueueSummary').textContent,/档案已变化.*原稿保留/);
 }
});
test('switching away and back or resetting the same profile permanently invalidates the old delayed view',async()=>{
 for(const name of ['ielts:profile-changed','ielts:profile-reset','ielts:user-data-reset']){
  const f=await fixture();f.dispatch('ielts:public-course-plan-changed',{profileId:'p-synthetic1'});f.tick(250);f.setFence({profileId:'p-synthetic2',generation:'g1'});f.dispatch(name,{profileId:name==='ielts:profile-changed'?undefined:'p-synthetic2'});f.setFence({profileId:'p-synthetic1',generation:'g1'});f.frame();assert.equal(f.calls,0,name);assert.match(f.nodes.get('todayQueueSummary').textContent,/刷新/,name);
  f.dispatch('ielts:public-course-plan-changed',{profileId:'p-synthetic1'});f.tick(250);f.frame();assert.equal(f.calls,0,name);
 }
});
test('unrelated profile reset does not cancel the current profile pending event',async()=>{
 const f=await fixture();f.dispatch('ielts:public-course-plan-changed',{profileId:'p-synthetic1'});f.dispatch('ielts:profile-reset',{profileId:'p-other'});f.tick(250);f.frame();assert.equal(f.calls,1);
});
test('an unrelated fresh render arriving before the delayed frame is not lost',async()=>{
 const f=await fixture();f.dispatch('ielts:public-course-plan-changed',{profileId:'p-synthetic1'});f.tick(250);assert.equal(f.frames.length,1);f.dispatch('ielts:budget-changed',{});f.frame();assert.equal(f.calls,1);
});
test('a normal event cannot remove a pending frame fence before an unannounced owner or generation change',async()=>{
 for(const next of [{profileId:'p-synthetic2',generation:'g1'},{profileId:'p-synthetic1',generation:'g2'}])for(const name of ['ielts:memory-changed','ielts:budget-changed','ielts:course-progress']){
  const f=await fixture();f.dispatch('ielts:public-course-plan-changed',{profileId:'p-synthetic1'});f.tick(250);f.setFence(next);f.dispatch(name,name==='ielts:course-progress'?{day:3,allRecords:[]}:{ });f.frame();assert.equal(f.calls,0,name);assert.match(f.nodes.get('todayQueueSummary').textContent,/刷新.*原稿保留/,name);
 }
});
test('an event absorbing the pending timer retains its owner and generation fence',async()=>{
 for(const next of [{profileId:'p-synthetic2',generation:'g1'},{profileId:'p-synthetic1',generation:'g2'}])for(const name of ['ielts:memory-changed','ielts:budget-changed','ielts:course-progress']){
  const f=await fixture();f.dispatch('ielts:public-course-plan-changed',{profileId:'p-synthetic1'});f.setFence(next);f.dispatch(name,name==='ielts:course-progress'?{day:3,allRecords:[]}:{ });assert.equal(f.timers.size,0,name);f.frame();assert.equal(f.calls,0,name);assert.match(f.nodes.get('todayQueueSummary').textContent,/刷新.*原稿保留/,name);
 }
});
test('a public event adds its fence to an already queued ordinary animation frame',async()=>{
 for(const next of [{profileId:'p-synthetic2',generation:'g1'},{profileId:'p-synthetic1',generation:'g2'}]){
  const f=await fixture();f.dispatch('ielts:memory-changed');f.dispatch('ielts:public-course-plan-changed',{profileId:'p-synthetic1'});f.setFence(next);f.frame();assert.equal(f.calls,0);assert.match(f.nodes.get('todayQueueSummary').textContent,/刷新.*原稿保留/);
 }
});
test('a timer invalidation cancels the pending public update and asks for refresh',async()=>{
 const f=await fixture();f.dispatch('ielts:public-course-plan-changed',{profileId:'p-synthetic1'});f.dispatch('ielts:study-timer-changed',{invalidated:true});assert.equal(f.timers.size,0);f.tick(250);f.frame();assert.equal(f.calls,0);assert.match(f.nodes.get('todayQueueSummary').textContent,/刷新/);
});
test('later memory, budget or progress events cannot revive an invalidated page or replace its warning',async()=>{
 for(const trigger of ['ielts:profile-changed','ielts:study-timer-changed'])for(const other of ['ielts:memory-changed','ielts:budget-changed','ielts:course-progress']){
  const f=await fixture();f.dispatch('ielts:public-course-plan-changed',{profileId:'p-synthetic1'});f.tick(250);assert.equal(f.frames.length,1);f.dispatch(trigger,trigger==='ielts:study-timer-changed'?{invalidated:true}:{});f.dispatch(other,other==='ielts:course-progress'?{day:3,allRecords:[]}:{ });f.frame();assert.equal(f.calls,0,trigger+' '+other);assert.match(f.nodes.get('todayQueueSummary').textContent,/刷新.*原稿保留/,trigger+' '+other);
 }
});
test('an unreadable owner invalidates an already queued ordinary frame and future refreshes',async()=>{
 const f=await fixture();f.dispatch('ielts:memory-changed');assert.equal(f.frames.length,1);f.breakFence();f.dispatch('ielts:public-course-plan-changed',{profileId:'p-synthetic1'});f.frame();assert.equal(f.calls,0);assert.match(f.nodes.get('todayQueueSummary').textContent,/刷新.*原稿保留/);f.dispatch('ielts:budget-changed',{});f.frame();assert.equal(f.calls,0);
});
test('a failed timer or animation-frame owner check remains invalid despite later ordinary events',async()=>{
 for(const stage of ['timer','frame']){
  const f=await fixture();f.dispatch('ielts:public-course-plan-changed',{profileId:'p-synthetic1'});if(stage==='frame')f.tick(250);f.setFence({profileId:'p-synthetic1',generation:'g2'});if(stage==='timer')f.tick(250);else f.frame();f.dispatch('ielts:memory-changed');f.frame();assert.equal(f.calls,0,stage);assert.match(f.nodes.get('todayQueueSummary').textContent,/刷新.*原稿保留/,stage);
 }
});
