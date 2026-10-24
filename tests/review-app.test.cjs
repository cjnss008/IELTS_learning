'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Records=require('../assets/learning-records.js'),Daily=require('../assets/daily-plan-state.js');
const source=fs.readFileSync(path.join(__dirname,'..','assets','review-app.js'),'utf8'),coreSource=fs.readFileSync(path.join(__dirname,'..','assets','review-core.js'),'utf8');
function fixture(options={}){
 const clock={now:Date.parse('2026-10-24T12:00:00.000Z')};let focused=options.focused!==false,id=0;
 class Clock extends Date{constructor(...args){super(...(args.length?args:[clock.now]));}static now(){return clock.now;}}
 class Element{
  constructor(id=''){this.id=id;this.value=id==='lesson-filter'?'all':'';this.textContent='';this.hidden=false;this.disabled=false;this.dataset={};this.children=[];this.events={};}
  get options(){return this.children;}
  addEventListener(name,fn){(this.events[name]||=[]).push(fn);}
  fire(name,detail={}){for(const fn of this.events[name]||[])fn({target:this,...detail});}
  replaceChildren(...children){this.children=children;}
  appendChild(child){this.children.push(child);return child;}
  querySelector(){return this.delay||(this.delay=new Element());}
 }
 const nodes=new Map(),events={},values=new Map();
 const element=id=>{if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id);};
 const ratings=['again','hard','good','easy'].map(rating=>{const button=new Element();button.dataset.rating=rating;return button;});
 const doc={hidden:Boolean(options.hidden),hasFocus:()=>focused,getElementById:element,createElement:()=>new Element(),querySelectorAll:selector=>selector==='[data-rating]'?ratings:[],addEventListener:(name,fn)=>(events[name]||=[]).push(fn)};
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))};
 const store=Records.createStore(Records.createMemoryStore(),{now:()=>new Date(clock.now).toISOString()});
 const root={Date:Clock,URLSearchParams,location:{search:'?preview=1'},document:doc,sessionStorage:storage,localStorage:storage,setInterval:()=>0,setTimeout:()=>0,addEventListener:(name,fn)=>(events[name]||=[]).push(fn),IELTSProfiles:{storage:()=>storage,scopeKey:key=>key},IELTSNotebook:{load:()=>[]},IELTSRecords:{makeId:()=>`vocab-test-${++id}`,record:input=>store.record({...JSON.parse(JSON.stringify(input)),dayNumber:1})}};
 root.window=root;const context=vm.createContext(root);vm.runInContext(coreSource,context);
 vm.runInContext(`IELTSCourse={lessons:[{day:1,title:'A lesson'}],vocab:[{id:'one',day:1,word:'student',meaning:'学生',context:'I am a student.',audio:''}${options.twoCards?",{id:'two',day:1,word:'teacher',meaning:'老师',context:'She is a teacher.',audio:''}":''}]};`,context);
 vm.runInContext(source,context);
 const emit=(name,event={})=>{for(const fn of events[name]||[])fn(event);};
 return{clock,store,storage,element,advance:ms=>clock.now+=ms,focus(value){focused=value;emit(value?'focus':'blur');},hidden(value){doc.hidden=value;emit('visibilitychange');},flip(){element('flip-button').fire('click');},async rate(rating='good'){ratings.find(b=>b.dataset.rating===rating).fire('click');await new Promise(resolve=>setImmediate(resolve));},switchProfile(){emit('ielts:profile-changed');}};
}

test('recall counts focused visible time before and after flipping, preserves wall time and credits vocabulary in 条',async()=>{
 const f=fixture();f.element('recall-answer').value='a person who studies';f.advance(20000);f.hidden(true);f.advance(300000);f.hidden(false);f.advance(10000);f.flip();
 f.element('recall-answer').value='changed after flipping';f.advance(5000);f.focus(false);f.advance(600000);f.focus(true);f.advance(15000);await f.rate();
 const rows=await f.store.list();assert.equal(rows.length,1);const record=rows[0];assert.equal(record.activeSeconds,50);assert.equal(record.elapsedSeconds,950);assert.equal(record.minutes,50/60);assert.equal(Date.parse(record.submittedAt)-Date.parse(record.startedAt),950000);
 assert.equal(JSON.parse(record.answer).recalledBeforeFlip,'a person who studies');assert.equal(record.evaluation.method,'self');assert.equal(record.evaluation.result,'unverified');assert.equal(record.unit,'条');
 const sum=Records.summary(rows,1,new Date(f.clock.now).toISOString()),combined=Daily.combineEvidence({tasks:[{id:'vocabulary',unit:'条'}]}, {},sum);
 assert.equal(sum.tasks.vocabulary.quantities['条'],1);assert.equal(combined.vocabulary.actualQuantity,1);assert.equal(Records.status(record,rows,new Date(f.clock.now).toISOString()).state,'self_reported');
});

test('a card initially hidden and unfocused earns time only after both conditions become active',async()=>{
 const f=fixture({hidden:true,focused:false});f.element('recall-answer').value='学生';f.advance(600000);f.hidden(false);f.advance(300000);f.focus(true);f.advance(10000);f.flip();await f.rate();
 const [record]=await f.store.list();assert.equal(record.activeSeconds,10);assert.equal(record.elapsedSeconds,910);
});

test('the next card starts its own recall clock and preserves self-reported again status',async()=>{
 const f=fixture({twoCards:true});f.element('recall-answer').value='student recall';f.advance(30000);f.flip();await f.rate();
 f.element('recall-answer').value='teacher recall';f.advance(10000);f.focus(false);f.advance(300000);f.focus(true);f.advance(5000);f.flip();await f.rate('again');
 const rows=await f.store.list();assert.equal(rows.length,2);assert.equal(rows[0].activeSeconds,30);assert.equal(rows[0].elapsedSeconds,30);assert.equal(rows[1].activeSeconds,15);assert.equal(rows[1].elapsedSeconds,315);assert.equal(rows[1].evaluation.method,'self');assert.equal(rows[1].evaluation.result,'revise');
});

test('empty recall updates its review schedule without inventing a daily work record',async()=>{
 const f=fixture();f.advance(60000);f.flip();await f.rate();assert.equal((await f.store.list()).length,0);const schedule=JSON.parse(f.storage.getItem('ielts52-review-preview-v1'));assert.equal(schedule.cards.one.lastRating,'good');
});

test('switching profiles retains the visible recall but blocks its record and review schedule',async()=>{
 const f=fixture();f.element('recall-answer').value='keep my original';f.advance(20000);f.flip();f.switchProfile();await f.rate();assert.equal((await f.store.list()).length,0);assert.equal(f.element('recall-answer').value,'keep my original');assert.equal(f.storage.getItem('ielts52-review-preview-v1'),null);assert.match(f.element('error-message').textContent,/档案已切换/);
});
