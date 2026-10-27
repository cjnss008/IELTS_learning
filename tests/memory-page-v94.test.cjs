'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const H=require('./daily-review-fixture.cjs'),{M,S,R,Timer,base}=H,tick=()=>new Promise(resolve=>setImmediate(resolve));
async function page({state,spentMinutes=0,timerState}={}){
 const dom=H.helper('essential-vocabulary-app-dom.test.cjs','fixture,button').fixture({words:['student','teacher','apple']}),{win,doc}=dom,now=Date.now();
 const seed=typeof state==='function'?state(dom.entries,now):state;if(seed)dom.storage.setItem(M.KEY,JSON.stringify(seed));
 // Match the real local-day ledger, including Hong Kong midnight while UTC is
 // still the previous date. Seeding UTC dates can incorrectly grant a new budget.
 if(spentMinutes){const item={...dom.entries[2],skill:'spelling'},draft={...S.makeDraft(item,{id:'memory-page-earlier-spent',courseDay:2,now:now-spentMinutes*60000-1000}),answer:item.word,activeSeconds:spentMinutes*60,activityByDate:{[H.load('year-planner.js').dateKey(now)]:spentMinutes*60}};await dom.records.record(S.recordFor(draft,item,{correct:true},{now}));}
 win.window=win;win.location.search='?day=2';win.IELTSProfiles.isPreview=()=>false;win.IELTSMemorySession=S;win.IELTSStudyTimerCore=Timer;win.structuredClone=structuredClone;
 if(timerState)win.IELTSStudyTimer={snapshot:()=>timerState,budget:base=>Timer.budget(base,timerState)};
 for(const[id,tag]of [['memoryPractice','section'],['memoryDashboard','section'],['memoryRetention','input'],['saveMemoryRetention','button'],['memorySettingsStatus','p'],['memoryModelState','p']]){const node=doc.createElement(tag);node.id=id;doc.body.append(node);}
 vm.runInNewContext(fs.readFileSync(path.join(base,'assets/year-planner.js'),'utf8'),win);
 const API=win.IELTSEssentialVocabularyApp;let app;win.IELTSEssentialVocabularyApp={...API,mount(options){app=API.mount(options);return app;}};
 vm.runInNewContext(fs.readFileSync(path.join(base,'assets/memory-app.js'),'utf8'),win,{filename:'actual-memory-app-v94.js'});
 for(let i=0;i<25;i++)await tick();assert(app,'actual MemoryApp must mount the actual Essential App');return{dom,win,app,host:doc.getElementById('memoryPractice'),before:seed&&JSON.stringify(seed),close:()=>app.destroy()};
}

test('actual MemoryApp renders only one of 600 required due words and preserves every other obligation',async()=>{
 const f=await page({state:H.dueState()});try{assert.equal(f.app.getPlan().due.length,600);assert.equal(f.host.querySelectorAll('form').length,1);assert(f.host.querySelectorAll('input').length<=4);assert(f.dom.dashboard.all().length<120,'full required queue must not be copied into a huge DOM');assert.match(f.dom.dashboard.textContent,/全部 600 项到期/);assert.equal(f.app.getPlan().newWords.length,0);}finally{f.close();}
});

test('actual wrong submission creates an immutable R original, keeps its ten minute retry and does not unlock new words',async()=>{
 const f=await page({state:(entries,now)=>M.observe(M.newState(),entries[0],'spelling',{id:'older-real-exposure',at:new Date(now-3*86400000).toISOString(),correct:true,assisted:true,answer:entries[0].word})});
 try{const input=f.host.querySelector('input');assert(input);input.value='incorrect';await input.fire('input');await f.host.querySelector('form').fire('submit');for(let i=0;i<5;i++)await tick();const works=await f.dom.records.list();assert.equal(works.length,1);assert.equal(works[0].source,'memory-review');assert.equal(JSON.parse(works[0].answer).text,'incorrect');assert.equal(works[0].evaluation.result,'revise');
 const next=f.host.querySelectorAll('button').find(b=>b.textContent==='继续本轮复习');assert(next);await next.click();assert.match(f.host.textContent,/必做复习尚未完成/);assert.doesNotMatch(f.host.textContent,/本轮复习已完成/);const plan=f.app.getPlan();assert.equal(plan.reviewDebt.waitingRetries,1);assert.equal(plan.newWords.length,0);assert(Date.parse(plan.nextRetryAt)>Date.now());const bytes=JSON.stringify(works[0]);await f.app.start();assert.equal(Object.keys(f.dom.memory.read().essential.batches).length,0);assert.equal(JSON.stringify((await f.dom.records.list())[0]),bytes);
 }finally{f.close();}
});

test('actual zero shared budget keeps due work and does not create a new empty Memory draft or claim completion',async()=>{
 const f=await page({state:(entries,now)=>M.observe(M.newState(),entries[0],'spelling',{id:'due-before-exhaustion',at:new Date(now-3*86400000).toISOString(),correct:true,assisted:true,answer:entries[0].word}),spentMinutes:360});
 try{assert(f.app.getPlan().due.length>0);assert.equal(f.app.getPlan().reviewBudget.sessionCount,0);assert.match(f.host.textContent,/积压未完成/);assert.equal(Object.keys(f.dom.memory.read().drafts).length,0);assert.equal(f.host.querySelectorAll('form').length,0);}finally{f.close();}
});

test('restored production draft uses its own 1.5 minute unit and stays read-only with one minute left',async()=>{
 const f=await page({state:(entries,now)=>{const memory=M.observe(M.newState(),entries[0],'production',{id:'old-production',at:new Date(now-3*86400000).toISOString(),correct:true,assisted:true,answer:'I am a student.'}),draft={...S.makeDraft({...entries[0],skill:'production'},{id:'memory-production-partial',courseDay:2,now:now-60000}),answer:'my original partial sentence'};memory.drafts[draft.id]=draft;return M.parseState(memory);},spentMinutes:359});
 try{const original=f.before,field=f.host.querySelector('textarea');assert(field);assert.equal(field.value,'my original partial sentence');assert.equal(field.disabled,true);assert.match(f.host.textContent,/等待预算恢复/);assert.equal(JSON.stringify(f.dom.memory.read()),original);assert.equal((await f.dom.records.list()).length,1,'only the earlier real spent record is stored');}finally{f.close();}
});

test('Course forwards a remaining break into actual E admission instead of admitting a short unit inside that break',()=>{
 const E=H.load('essential-vocabulary-core.js'),C=H.load('essential-vocabulary-course.js'),D=require(path.join(base,'assets/curriculum-data.js')),A=require(path.join(base,'assets/assessment-core.js')),Adaptive=require(path.join(base,'assets/adaptive-plan.js')),values=new Map(),adaptive=Adaptive.createStore({data:D,storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},profileId:'break-probe',contextReady:true,synchronousPublicCourse:true,now:()=>H.NOW}),timerState={...Timer.newState(),enabled:true,phase:'short-break',remainingSeconds:180};
 const result=C.state({day:2,data:D,dayPlan:D.days[1],adaptive,assessment:A,memory:H.dueState(1),memoryEngine:M,engine:E,now:H.NOW,budget:{remainingMinutes:1},timerCore:Timer,timerState});assert.equal(result.done,false);assert.equal(result.plan.due.length,1);assert.equal(result.plan.reviewBudget.canStartNext,false);assert.equal(result.deferred,true);assert(result.plan.reviewBudget.nextUnitMinutes>3);assert.equal(values.size,0);
});
