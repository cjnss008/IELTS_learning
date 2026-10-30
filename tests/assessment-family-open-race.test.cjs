'use strict';
// Synthetic clock, data, records, capability and user profile; no human audio.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const F=require('./family-lessons-v95-fixture.cjs'),root=path.join(__dirname,'../assets');
async function familyFixture(){
 const p=F.packageData({simple:true});p.data.days[0].tasks[0].mode='assessment';const f=await F.mounted(p,{dictionary:true}),w=f.win;
 await w.IELTSTodayNavigation.resumeNext('reading','base-reading');await F.answer(f);f.advance(1000);await f.nodes.get('courseSubmit').fire('click');await F.settle();
 const recap=f.M.forDay(2);f.context.__recap=JSON.stringify({token:recap.token,recap:{ok:true,status:'complete',text:'SYNTHETIC'}});vm.runInContext('window.IELTSMistakes.finishRecap(2,JSON.parse(__recap))',f.context);await F.settle();
 w.CustomEvent=f.context.CustomEvent;w.document.createTextNode=value=>{const n=w.document.createElement('span');n.textContent=value;return n;};
 for(const name of ['contextual-vocabulary-exposure.js','contextual-vocabulary-course.js','essential-vocabulary-app.js'])vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),f.context,{filename:name});
 return f;
}
async function gatedFamily(){
 const f=await familyFixture(),w=f.win,V=w.IELTSVocabularyPractice,Y=w.IELTSYearPlanner,tickers=[];w.setInterval=fn=>(tickers.push(fn),tickers.length);w.clearInterval=()=>{};let mounted=false,release,signal;const reached=new Promise(resolve=>signal=resolve),gate=new Promise(resolve=>release=resolve);
 w.IELTSMediaLibrary={list:async()=>[]};w.IELTSYearPlanner={...Y,readBudget:async options=>{const result=await Y.readBudget({...options,mediaEntries:[]});if(mounted){signal();await gate;}return result;}};
 let practiceHost,reviewCalls=0,destroyed=0;const vocabulary={...V,mount(host,options){mounted=true;practiceHost=host;const {familyBatch,familyRecords,vocabularyData,...local}=options,session=V.createSession(local);options.onChange(session.getState());const card=w.document.createElement('div');card.className='vocab-word-card';card.textContent='Synthetic card';host.append(card);return{ready:Promise.resolve(),pause(){},destroy(){destroyed++;},getState:session.getState,getDraft:session.getDraft};}};
 const dashboard=w.document.createElement('div'),practice=w.document.createElement('div');let budget={remainingMinutes:360};const app=w.IELTSEssentialVocabularyApp.mount({document:w.document,dashboard,practice,vocabulary,courseDay:2,getBudget:()=>budget,durable:async()=>{},openReview:async()=>{reviewCalls++;}});await F.settle();const staleReview=dashboard.querySelectorAll('button').find(button=>button.textContent.includes('复习'));
 const start=app.start();await reached;const before=Object.values(w.IELTSMemory.read().essential.batches)[0];assert.ok(before?.draft);return{f,w,app,dashboard,practice,tickers,start,release,before,host:practiceHost,staleReview,setBudget:value=>{budget={...value};},counts:()=>({reviewCalls,destroyed})};
}
test('family batch opens when slow verification crosses the activity autosave boundary',async()=>{
 const {f,w,app,practice,tickers,start,release,before,host}=await gatedFamily();assert.equal(host.inert,true);assert.equal(app.isBusy(),true);assert.equal(await app.openBatch(before.id),false);
 const offset=(15-Math.floor(f.context.Date.now()/1000)%15)%15||15;f.advance(offset*1000);tickers.forEach(fn=>fn());app.save();const during=Object.values(w.IELTSMemory.read().essential.batches)[0];assert.deepEqual(during,before,'opening must not count time or write an unchanged lifecycle checkpoint');
 release();await start;await F.settle();assert.ok(app.getState(),'the current batch should be open');assert.equal(host.inert,false);assert.match(practice.textContent,/Synthetic card/);assert.doesNotMatch(practice.textContent,/这份词组草稿已变化/);assert.equal(Object.keys(w.IELTSMemory.read().essential.batches).length,1);
 f.advance(15000);tickers.forEach(fn=>fn());const after=Object.values(w.IELTSMemory.read().essential.batches)[0];assert.ok(after.activeSeconds>before.activeSeconds,'actual learning time resumes only after the verified open');
});
for(const kind of ['draft','timing'])test('family opening rejects a concurrent external '+kind+' change',async()=>{
 const {f,w,app,practice,start,release,before,host}=await gatedFamily(),store=w.IELTSMemory.createStore(w.IELTSProfiles.storage()),state=store.read(),external=state.essential.batches[before.id];
 if(kind==='draft')external.draft.study.input[0]='OTHER SYNTHETIC INPUT';else{external.activeSeconds+=1;external.activityByDate['2026-10-24']=(external.activityByDate['2026-10-24']||0)+1;}
 store.save(state);release();await start;await F.settle();assert.equal(app.getState(),null);assert.match(practice.textContent,/草稿已变化|原输入保留/);assert.equal(host.inert,true);const saved=w.IELTSMemory.read().essential.batches[before.id];if(kind==='draft')assert.equal(saved.draft.study.input[0],'OTHER SYNTHETIC INPUT');else assert.equal(saved.activeSeconds,before.activeSeconds+1);assert.equal(Object.keys(w.IELTSMemory.read().essential.batches).length,1);
});
test('switching profile while family opening is pending never enables the old controls or writes to another owner',async()=>{
 const {f,w,app,start,release,host}=await gatedFamily(),before=f.map.get(w.IELTSMemory.KEY);w.IELTSProfiles.current=()=>({id:'other'});release();await start;await F.settle();assert.equal(f.map.get(w.IELTSMemory.KEY),before);assert.equal(host.inert,true);assert.equal(app.getState(),null);
});
test('a review action cannot destroy a batch while its final verification is pending',async()=>{
 const {app,dashboard,practice,start,release,host,staleReview,counts}=await gatedFamily();assert.ok(staleReview);const current=dashboard.querySelectorAll('button').find(button=>button.textContent.includes('复习'));assert.ok(current);assert.equal(current.disabled,true);await current.fire('click');await staleReview.fire('click');assert.deepEqual(counts(),{reviewCalls:0,destroyed:0});assert.ok(app.getState());assert.equal(host.inert,true);release();await start;assert.ok(app.getState());assert.equal(host.inert,false);assert.match(practice.textContent,/Synthetic card/);assert.deepEqual(counts(),{reviewCalls:0,destroyed:0});
});
test('family opening rejects timing changes from another page before the first controller mount',async()=>{
 const f=await familyFixture(),w=f.win,V=w.IELTSVocabularyPractice,Y=w.IELTSYearPlanner;w.IELTSMediaLibrary={list:async()=>[]};w.IELTSYearPlanner={...Y,readBudget:options=>Y.readBudget({...options,mediaEntries:[]})};let mounted=false,release,signal;const reached=new Promise(resolve=>signal=resolve),gate=new Promise(resolve=>release=resolve);
 const vocabulary={...V,mount(host,options){mounted=true;const {familyBatch,familyRecords,vocabularyData,...local}=options,session=V.createSession(local);options.onChange(session.getState());return{ready:Promise.resolve(),pause(){},destroy(){},getState:session.getState,getDraft:session.getDraft};}};
 const dashboard=w.document.createElement('div'),practice=w.document.createElement('div'),app=w.IELTSEssentialVocabularyApp.mount({document:w.document,dashboard,practice,vocabulary,courseDay:2,getBudget:()=>({remainingMinutes:360}),durable:async()=>{},onActiveChange:async active=>{if(active){signal();await gate;}}});await F.settle();const start=app.start();await reached;
 const store=w.IELTSMemory.createStore(w.IELTSProfiles.storage()),state=store.read(),entry=Object.values(state.essential.batches)[0];entry.activeSeconds+=1;entry.activityByDate['2026-10-24']=1;store.save(state);release();await start;await F.settle();
 assert.equal(mounted,false,'a changed timing snapshot must be rejected before a controller can checkpoint stale values');assert.equal(w.IELTSMemory.read().essential.batches[entry.id].activeSeconds,1);assert.match(practice.textContent,/原输入保留/);assert.equal(app.getState(),null);
});

function bounded(promise,label,ms=15000){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('timeout waiting for '+label)),ms);promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});}
function oneShotRuntime(api,controls){
 const real=api.runtime();let probed=false,gated=false,prepareResult=null;
 const value={...real,
  isCurrentFullRecords(rows){
   if(controls.active&&!probed){probed=true;controls.targetRows=rows;controls.targetWasCurrent=real.isCurrentFullRecords(rows);return false;}
   return real.isCurrentFullRecords(rows);
  },
  async prepareVocabularyUnit(options){
   const result=await real.prepareVocabularyUnit(options);
   if(controls.active&&!gated&&options?.courseDay===2&&result?.status==='ready'&&Array.isArray(result.records)){gated=true;prepareResult=result;controls.entered();await controls.gate;controls.returned(result);}
   return result;
  }
 };
 return{api:{...api,runtime:()=>value},result:()=>prepareResult};
}
test('a public course-plan refresh completing during opening is deferred until the final open render',async()=>{
 const {f,w,app,dashboard,practice,start,release,host,before,setBudget}=await gatedFamily();
 const realApi=w.IELTSFamilyLessonExpansionV95;
 let renderCount=0,enteredResolve,returnedResolve,releasePublic,prepareResult=null;
 const entered=new Promise(resolve=>enteredResolve=resolve),returned=new Promise(resolve=>returnedResolve=resolve),publicGate=new Promise(resolve=>releasePublic=resolve);
 const controls={active:false,entered:enteredResolve,returned:resolve=>{prepareResult=resolve;returnedResolve();},gate:publicGate,targetRows:null,targetWasCurrent:null};
 const wrapped=oneShotRuntime(realApi,controls);w.IELTSFamilyLessonExpansionV95=wrapped.api;
 const original=dashboard.replaceChildren.bind(dashboard);let counting=false;dashboard.replaceChildren=(...args)=>{if(counting)renderCount++;return original(...args);};
 try{
  await F.settle();counting=true;renderCount=0;controls.active=true;
  w.dispatchEvent({type:'ielts:public-course-plan-changed',detail:{profileId:w.IELTSProfiles.current().id}});
  await bounded(entered,'real prepareVocabularyUnit');await F.settle();
  assert.equal(renderCount,0,'the public callback must not repaint while opening is active');
  assert.equal(host.inert,true);assert.equal(app.isBusy(),true);assert.ok(controls.targetRows,'the target snapshot must be checked once');assert.equal(controls.targetWasCurrent,true,'the forced-stale snapshot was current in the real runtime');
  releasePublic();await bounded(returned,'public gate release');await F.settle();assert.equal(renderCount,0,'a completed public refresh before finally must still not repaint');
  assert.equal(prepareResult?.status,'ready');assert.ok(Array.isArray(prepareResult.records)&&prepareResult.records.length>0);
  controls.active=false;release();await bounded(start,'opening start');await F.settle();
  assert.ok(renderCount>0,'the opening finally must paint the final state');assert.equal(host.inert,false);assert.ok(app.getState());
  assert.equal(w.IELTSMemory.read().essential.batches[before.id].id,before.id);assert.deepEqual(w.IELTSMemory.read().essential.batches[before.id].draft,before.draft);
  counting=true;renderCount=0;w.dispatchEvent({type:'ielts:public-course-plan-changed',detail:{profileId:w.IELTSProfiles.current().id}});
  for(let i=0;i<40&&renderCount===0;i++)await F.settle();
  assert.ok(renderCount>0,'a public event after opening must still repaint');
 }finally{controls.active=false;try{releasePublic?.()}catch(_){}try{release?.()}catch(_){}try{app.destroy?.()}catch(_){}w.IELTSFamilyLessonExpansionV95=realApi;}
});
test('a public refresh that finishes after opening repaints without reviving the old page',async()=>{
 const {f,w,app,dashboard,practice,start,release,host,before,setBudget}=await gatedFamily();
 const realApi=w.IELTSFamilyLessonExpansionV95;
 let renderCount=0,enteredResolve,returnedResolve,releasePublic,prepareResult=null;
 const entered=new Promise(resolve=>enteredResolve=resolve),returned=new Promise(resolve=>returnedResolve=resolve),publicGate=new Promise(resolve=>releasePublic=resolve);
 const controls={active:true,entered:enteredResolve,returned:resolve=>{prepareResult=resolve;returnedResolve();},gate:publicGate,targetRows:null};
 const wrapped=oneShotRuntime(realApi,controls);w.IELTSFamilyLessonExpansionV95=wrapped.api;
 const original=dashboard.replaceChildren.bind(dashboard);let counting=false;dashboard.replaceChildren=(...args)=>{if(counting)renderCount++;return original(...args);};
 try{
  await F.settle();counting=true;renderCount=0;
  w.dispatchEvent({type:'ielts:public-course-plan-changed',detail:{profileId:w.IELTSProfiles.current().id}});
  await bounded(entered,'real prepareVocabularyUnit');await F.settle();assert.equal(renderCount,0);assert.equal(app.isBusy(),true);
  controls.active=false;release();await bounded(start,'opening start');await F.settle();
  assert.ok(renderCount>0,'opening finally must paint the current page');assert.equal(host.inert,false);
  const afterOpening=renderCount;setBudget({remainingMinutes:0,spentMinutes:360,exhausted:true});releasePublic();await bounded(returned,'public gate release');await F.settle();
  for(let i=0;i<40&&renderCount===afterOpening;i++)await F.settle();
  assert.ok(renderCount>afterOpening,'the late public refresh must repaint');assert.equal(host.inert,false);assert.equal(app.getPlan().reviewBudget.availableMinutes,0,'the repaint must use the exhausted budget');
  assert.equal(prepareResult?.status,'ready');assert.equal(w.IELTSMemory.read().essential.batches[before.id].activeSeconds,before.activeSeconds);
 }finally{controls.active=false;try{releasePublic?.()}catch(_){}try{release?.()}catch(_){}try{app.destroy?.()}catch(_){}w.IELTSFamilyLessonExpansionV95=realApi;}
});

test('a budget change during the opening await blocks the open and leaves the original draft intact',async()=>{
 const {f,w,app,practice,start,release,host,before,setBudget}=await gatedFamily();
 try{
  assert.equal(host.inert,true);assert.equal(app.isBusy(),true);
  setBudget({remainingMinutes:0,spentMinutes:360,exhausted:true});
  release();let finished;try{finished=await bounded(start,'opening budget change',20000);}catch(error){finished='threw';}
  await F.settle();
  assert.equal(finished,false,'exhausted budget must refuse the open, not silently succeed');
  assert.equal(app.getState(),null);assert.equal(host.inert,true);
  assert.match(practice.textContent,/预算|原输入保留/);
  const saved=w.IELTSMemory.read().essential.batches[before.id];assert.equal(saved.id,before.id);assert.deepEqual(saved.draft,before.draft);assert.equal(saved.activeSeconds,before.activeSeconds);
 }finally{try{release?.()}catch(_){}try{app.destroy?.()}catch(_){}}
});
