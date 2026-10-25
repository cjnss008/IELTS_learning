'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners={};this.attributes={};this.hidden=false;this.value='';this.textContent='';this.disabled=false;this.classes=new Set();this.classList={add:(...items)=>items.forEach(i=>this.classes.add(i)),remove:(...items)=>items.forEach(i=>this.classes.delete(i)),toggle:(name,value)=>value?this.classes.add(name):this.classes.delete(name)};}
 append(...nodes){this.children.push(...nodes);}setAttribute(k,v){this.attributes[k]=v;}getAttribute(k){return this.attributes[k];}addEventListener(k,fn){(this.listeners[k]||=[]).push(fn);}async fire(k){for(const fn of this.listeners[k]||[])await fn({preventDefault(){}});}contains(n){return this.all().includes(n);}all(){return[this,...this.children.flatMap(n=>n.all())];}scrollIntoView(){}
}
function fixture(shared=new Map(),options={}){
 let now=new Date(2026,9,25,12).getTime(),profile='preview',fresh=true;class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const events={},timers=[],body=new Element('body'),doc={body,activeElement:null,getElementById:id=>body.all().find(n=>n.id===id),createElement:tag=>new Element(tag),addEventListener:(k,fn)=>(events['doc:'+k]||=[]).push(fn)};
 const storage={getItem:k=>shared.get(k)||null,setItem:(k,v)=>shared.set(k,v)},win={document:doc,matchMedia:()=>({matches:options.wide!==false}),IELTSProfiles:{assertFresh:()=>{if(!fresh)throw Error('同档案代次已变化，请刷新页面。');},current:()=>({id:profile}),storage:()=>storage},CustomEvent:class{constructor(type,{detail}={}){this.type=type;this.detail=detail;}},addEventListener:(k,fn)=>(events[k]||=[]).push(fn),dispatchEvent:e=>(events[e.type]||[]).forEach(fn=>fn(e)),setInterval:fn=>(timers.push(fn),timers.length),clearInterval(){}};
 const context={window:win,Date:Clock,console};for(const file of ['study-timer-core.js','study-timer.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/'+file),'utf8'),context);
 return{win,body,shared,events,storage,now:()=>now,setNow:value=>{now=value;},advance:ms=>{now+=ms;timers.forEach(fn=>fn());},button:text=>body.all().find(n=>n.tagName==='button'&&n.textContent===text),expire:()=>{fresh=false;},switchProfile:()=>{profile='other';win.dispatchEvent({type:'ielts:profile-changed'});},form:()=>body.all().find(n=>n.tagName==='form')};
}
test('widget is initially folded, offers user-start, supports settings and never starts media or creates learner evidence',async()=>{
 const f=fixture();assert.equal(f.win.document.getElementById('studyTimerContent').hidden,true);assert.equal(f.shared.size,0);f.win.IELTSStudyTimer.studyStarted();assert.equal(f.win.document.getElementById('studyTimerContent').hidden,false);assert.equal(f.win.IELTSStudyTimer.snapshot().running,false);await f.button('开启／继续专注').fire('click');assert.equal(f.win.IELTSStudyTimer.snapshot().running,true);
 f.advance(60000);assert.equal(f.win.IELTSStudyTimer.snapshot().remainingSeconds,1440);assert.equal(f.shared.size,1);assert.deepEqual([...f.shared.keys()],['ielts52-study-timer-v1']);assert.equal(f.win.IELTSStudyTimer.budget({date:'2026-10-25',spentMinutes:8,budgetMinutes:360}).spentMinutes,8);
 const form=f.form(),inputs=form.children.filter(n=>n.tagName==='label').map(n=>n.children[0]);inputs[0].value='40';await form.fire('submit');assert.equal(f.win.IELTSStudyTimer.snapshot().settings.focusMinutes,40);assert.equal(f.win.IELTSStudyTimer.snapshot().running,false);assert.equal(f.win.IELTSStudyTimer.snapshot().remainingSeconds,2400);
});
test('two pages derive the same actual rest interval, storage changes notify both and reload cannot count it twice',async()=>{
 const shared=new Map(),a=fixture(shared),b=fixture(shared);let aRest=0,bRest=0;a.win.addEventListener('ielts:study-rest-started',()=>aRest++);b.win.addEventListener('ielts:study-rest-started',()=>bRest++);await a.button('开启／继续专注').fire('click');a.advance(26*60000);b.setNow(a.now());b.win.dispatchEvent({type:'storage',key:'ielts52-study-timer-v1'});b.advance(0);assert.equal(aRest,1);assert.equal(bRest,1);
 for(const f of [a,b]){const budget=f.win.IELTSStudyTimer.budget({date:'2026-10-25',spentMinutes:10,budgetMinutes:360});assert.equal(budget.breakMinutes,1);assert.equal(budget.spentMinutes,11);}
 a.advance(60000);b.setNow(a.now());b.advance(0);assert.equal(b.win.IELTSStudyTimer.budget({date:'2026-10-25',spentMinutes:10}).breakMinutes,2);const stored=JSON.parse(shared.get('ielts52-study-timer-v1'));assert.equal(stored.restByDate['2026-10-25'],120);
});
test('profile switch stops writes, preview storage stays isolated and corrupt timer data blocks budget instead of silently resetting it',async()=>{
 const f=fixture();await f.button('开启／继续专注').fire('click');const before=f.shared.get('ielts52-study-timer-v1');f.switchProfile();f.advance(30*60000);assert.equal(f.shared.get('ielts52-study-timer-v1'),before);assert.equal(f.win.document.getElementById('ieltsStudyTimer').hidden,true);
 const official=new Map(),preview=fixture(new Map());await preview.button('开启／继续专注').fire('click');assert.equal(official.size,0);preview.shared.set('ielts52-study-timer-v1','{broken');preview.win.dispatchEvent({type:'storage',key:'ielts52-study-timer-v1'});const budget=preview.win.IELTSStudyTimer.budget({date:'2026-10-25',spentMinutes:5});assert.equal(budget.exhausted,true);assert.equal(budget.remainingMinutes,0);assert.equal(preview.shared.get('ielts52-study-timer-v1'),'{broken');
});

test('narrow screens keep a compact bar while studying and fold an expanded layout panel when an answer receives focus',async()=>{
 const f=fixture(new Map(),{wide:false});f.win.IELTSStudyTimer.studyStarted();const panel=f.win.document.getElementById('ieltsStudyTimer'),content=f.win.document.getElementById('studyTimerContent');assert.equal(content.hidden,true);assert.equal(f.body.classes.has('study-timer-present'),true);
 await panel.children[0].fire('click');assert.equal(content.hidden,false);assert.match(panel.className,/study-timer-expanded/);assert.equal(f.body.classes.has('study-timer-open'),true);
 const answer=new Element('textarea');for(const fn of f.events['doc:focusin'])fn({target:answer});assert.equal(content.hidden,true);assert.match(panel.className,/study-timer-collapsed/);assert.equal(f.body.classes.has('study-timer-open'),false);assert.equal(f.win.IELTSStudyTimer.snapshot().running,false);
 const css=fs.readFileSync(path.join(__dirname,'../assets/study-timer.css'),'utf8');assert.match(css,/body\.study-timer-present\{padding-right:210px\}/);assert.match(css,/body\.study-timer-open\{padding-right:310px\}/);assert.match(css,/body\.study-timer-present\{padding-bottom:76px\}/);assert.match(css,/\.study-timer-expanded\{position:relative/);
});

test('same-profile reset event disposes an old clock, rejects stale budget and cannot overwrite the newly cleared state',async()=>{
 const f=fixture();await f.button('开启／继续专注').fire('click');f.shared.set('ielts52-data-generation-v1','busy:reset-current');f.shared.delete('ielts52-study-timer-v1');f.win.dispatchEvent({type:'ielts:profile-reset',detail:{profileId:'preview',value:'busy:reset-current'}});assert.equal(f.win.IELTSStudyTimer.snapshot(),null);assert.equal(f.win.document.getElementById('ieltsStudyTimer').hidden,true);assert.equal(f.body.classes.has('study-timer-present'),false);
 const budget=f.win.IELTSStudyTimer.budget({date:'2026-10-25',spentMinutes:0,budgetMinutes:360});assert.equal(budget.exhausted,true);assert.equal(budget.remainingMinutes,0);assert.match(budget.budgetError,/重置|恢复/);assert.match(budget.budgetError,/刷新/);f.advance(30*60000);f.win.IELTSStudyTimer.pause();assert.equal(f.shared.has('ielts52-study-timer-v1'),false);
});

test('same-profile restored generation is fenced by storage event and only a freshly loaded widget reads restored budget',async()=>{
 const f=fixture();await f.button('开启／继续专注').fire('click');const restored=f.win.IELTSStudyTimerCore.newState();restored.restByDate['2026-10-25']=180;f.shared.set('ielts52-study-timer-v1',JSON.stringify(restored));f.shared.set('ielts52-data-generation-v1','restored-generation');f.win.dispatchEvent({type:'storage',key:'ielts52-profile:preview:ielts52-data-generation-v1'});assert.equal(f.win.IELTSStudyTimer.snapshot(),null);assert.equal(f.win.IELTSStudyTimer.budget({date:'2026-10-25',spentMinutes:0}).remainingMinutes,0);f.advance(3600000);assert.equal(f.shared.get('ielts52-study-timer-v1'),JSON.stringify(restored));
 const next=fixture(f.shared);assert.equal(next.win.IELTSStudyTimer.snapshot().running,false);assert.equal(next.win.IELTSStudyTimer.budget({date:'2026-10-25',spentMinutes:10,budgetMinutes:360}).remainingMinutes,347);
});

test('assertFresh rejects a stale same-profile clock even before any reset event arrives',async()=>{
 const f=fixture();await f.button('开启／继续专注').fire('click');const before=f.shared.get('ielts52-study-timer-v1');f.expire();const budget=f.win.IELTSStudyTimer.budget({date:'2026-10-25',spentMinutes:10,budgetMinutes:360});assert.equal(budget.exhausted,true);assert.equal(budget.remainingMinutes,0);assert.match(budget.budgetError,/刷新/);assert.equal(f.win.IELTSStudyTimer.snapshot(),null);f.advance(30*60000);assert.equal(f.shared.get('ielts52-study-timer-v1'),before);
});
