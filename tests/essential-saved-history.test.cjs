'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const H=require('./essential-saved-history-fixture.cjs'),M=require(path.join(H.base,'assets/memory-core.js')),E=require(path.join(H.base,'assets/essential-vocabulary-core.js'));
const history=f=>f.dashboard.querySelector('.essential-saved-history'),links=f=>history(f)?.querySelectorAll('button').filter(b=>b.textContent.startsWith('查看第 '))||[];
test('actual EA/V -> native Records IndexedDB -> next course/day history returns original wrong answer and oral references without writes',async()=>{
 const{f,app,batch,record,now}=await H.committed();assert.equal(record.source,'essential-vocabulary');assert.equal(batch.status,'submitted');assert.equal(batch.draft,null);app.destroy();f.practice.replaceChildren();
 const reopened=f.nativeMount({inline:true,courseDay:3,now:()=>now()+86400000,initialRecords:await f.R.list()}),raw=f.storage.getItem(M.KEY),records=JSON.stringify(await f.R.exportRawState());
 assert.match(f.dashboard.textContent,/已保存词汇组/);assert.equal(links(f).length,1);await links(f)[0].click();
 assert.match(f.practice.textContent,/本组初学原稿已提交/);assert.match(f.practice.textContent,/incorrect/);assert.match(f.practice.textContent,/work-essential-test-/);assert.match(f.practice.textContent,/SHA-256/);assert.equal(f.practice.querySelectorAll('input,textarea').length,0);assert.equal(f.storage.getItem(M.KEY),raw);assert.equal(JSON.stringify(await f.R.exportRawState()),records);assert.equal((await f.R.list())[0].answer,record.answer);assert.equal(reopened.getDrafts().length,0);reopened.destroy();
});
test('R committed before Memory completion stays readable while the exact original draft ticket remains recoverable',async()=>{
 const f=H.nativeFixture(),app=f.nativeMount();await app.start();await H.train(f);const pending=Object.values(f.memory.read().essential.batches)[0],payload=f.controller.getSubmission();
 const saved=await f.R.record(f.API.recordForBatch(pending,payload));app.setRecords(await f.R.list());assert.equal(f.memory.read().essential.batches[pending.id].status,'learning');
 const before=f.storage.getItem(M.KEY),original=saved.record.answer;await links(f)[0].click();assert.match(f.practice.textContent,/incorrect/);assert.equal(f.storage.getItem(M.KEY),before);assert.equal((await f.R.list()).length,1);
 await app.openBatch(pending.id);assert.equal(f.controller.getDraft().id,payload.id);assert.deepEqual(H.copy(f.controller.getDraft().answers),H.copy(pending.draft.answers));await H.button(f.practice,'提交三轮原稿').click();await H.settle();assert.equal((await f.R.list()).length,1);assert.equal((await f.R.list())[0].answer,original);assert.equal(f.memory.read().essential.batches[pending.id].draft,null);app.destroy();
});
test('history protects active tests, stale controls, media busy and a failed current draft save',async()=>{
 const{f,app,setNow}=await H.committed();await app.refreshSavedBatches();const stale=links(f)[0];const state=f.memory.read(),batch=Object.values(state.essential.batches)[0];
 // A genuine second learning session is independent of the saved original.
 const next=E.startBatch(state,{id:'essential-batch-other-current',words:[{id:'essential:apple',word:'apple',meaning:'苹果',ipa:'/ˈæpəl/',example:'An apple.'}],courseDay:3,now:Date.now()});f.memory.createStore(f.storage).save(next);setNow(Date.now());await app.openBatch('essential-batch-other-current');
 const input=f.practice.querySelector('input');input.value='app';await input.fire('input');const before=f.memory.read().essential.batches['essential-batch-other-current'].draft;
 // Source uses the real controller's media state, and refuses before destroying it.
 for(let trial=0;trial<3;trial++){const card=f.practice.querySelector('.vocab-word-card');card.querySelector('input').value='apple';await card.querySelector('input').fire('input');await H.button(card,'核对本遍输入').click();}
 await H.button(f.practice,'开始第 1 次跟读录音').click();assert.equal(f.controller.getMediaState().busy,true);await assert.rejects(app.openSavedBatch(batch.id),/录音或评测/);f.controller.pause();
 const kept=f.practice.querySelector('input');kept.value='app';await kept.fire('input');
 const write=f.storage.setItem;f.storage.setItem=()=>{throw Error('synthetic quota failure');};await assert.rejects(app.openSavedBatch(batch.id),/quota failure/);assert.equal(f.practice.querySelector('input').value,'app');f.storage.setItem=write;app.save();
 assert.equal(f.memory.read().essential.batches['essential-batch-other-current'].draft.id,before.id);
 // Complete all learning before entering the real closed-answer test phase.
 await app.openBatch('essential-batch-other-current');await H.learn(f);assert.equal(f.controller.getState().testing,true);assert.equal(history(f).hidden,true);const activeRaw=f.storage.getItem(M.KEY);await stale.click();assert.equal(await app.openSavedBatch(batch.id),false);assert.equal(f.storage.getItem(M.KEY),activeRaw);assert.doesNotMatch(f.practice.textContent,/三写三读原始证据/);
 app.destroy();
 const g=H.nativeFixture(),a=g.nativeMount({isReviewActive:()=>true,initialRecords:await f.R.list()});assert.equal(history(g).hidden,true);assert.equal(await a.openSavedBatch(batch.id),false);assert.equal(g.practice.textContent,'');a.destroy();
 assert.ok(stale);
});
test('history course filters and expansion reach every saved group after the twentieth without adding a key',async()=>{
 const{f,app,batch,record}=await H.committed();app.destroy();const state=f.memory.read(),rows=[];
 for(let i=0;i<27;i++){const copy=H.copy(batch),r=H.copy(record),id='essential-batch-history-'+i;copy.id=id;copy.materialId='essential-vocabulary-history-'+i;copy.courseDay=i%2?2:3;copy.recordId='vocab-history-record-'+String(i).padStart(4,'0');r.id=copy.recordId;r.materialId=copy.materialId;r.dayNumber=copy.courseDay;const a=JSON.parse(r.answer);a.essentialBatchId=id;a.courseDay=copy.courseDay;r.answer=JSON.stringify(a);state.essential.batches[id]=copy;rows.push(r);}
 f.memory.createStore(f.storage).save(state);await f.R.importState({schemaVersion:1,records:rows});const next=f.nativeMount({inline:true,courseDay:3,initialRecords:await f.R.list()}),raw=f.storage.getItem(M.KEY);
 assert.equal(links(f).length,10);while(history(f).querySelectorAll('button').some(b=>b.textContent.startsWith('展开更多')))await history(f).querySelectorAll('button').find(b=>b.textContent.startsWith('展开更多')).click();assert.equal(links(f).length,28);
 const filter=history(f).querySelector('select');filter.value='current';await filter.fire('change');assert.ok(links(f).every(b=>b.textContent.includes('第 3 课')));const previous=history(f).querySelector('select');previous.value='previous';await previous.fire('change');assert.ok(links(f).every(b=>b.textContent.includes('第 2 课')));assert.equal(f.storage.getItem(M.KEY),raw);next.destroy();
});
test('missing R and unknown old artifact remain pending without replacing input or the saved original',async()=>{
 const{f,app,batch,record}=await H.committed(),rows=[...f.cache.databases.values()][0].stores.get('records').rows,bad=H.copy(record);bad.answer=JSON.stringify({...JSON.parse(record.answer),trainingVersion:1});rows.set(record.id,vm.runInContext('JSON.parse('+JSON.stringify(JSON.stringify(bad))+')',f.context));app.setRecords(await f.R.list());const before=f.storage.getItem(M.KEY),stored=JSON.stringify(await f.R.exportRawState());await assert.rejects(app.openSavedBatch(batch.id),/原版本|证据待核对/);assert.equal(f.storage.getItem(M.KEY),before);assert.equal(JSON.stringify(await f.R.exportRawState()),stored);rows.delete(record.id);app.setRecords(await f.R.list());await assert.rejects(app.openSavedBatch(batch.id),/编号或课次待核对/);assert.equal(f.storage.getItem(M.KEY),before);assert.doesNotMatch(f.practice.textContent,/三写三读原始证据/);app.destroy();
});
test('real MemoryApp passes a guard for paused/global-budget-zero drafts before historical answers can be opened',async()=>{
 const{f,app}=await H.committed();app.destroy();for(const id of ['memoryDashboard','memoryPractice','memoryRetention','saveMemoryRetention','memoryModelState','memorySettingsStatus']){const el=f.doc.createElement(id==='memoryRetention'?'input':'section');el.id=id;f.doc.body.append(el);}
 const state=f.memory.read(),item=Object.values(state.items).find(x=>x.skill==='spelling');assert.ok(item);const S=require(path.join(H.base,'assets/memory-session.js')),draft=S.makeDraft(item,{id:'memory-paused-history-test',courseDay:2});draft.answer='kept-original-input';state.drafts[draft.id]=draft;f.memory.createStore(f.storage).save(state);
 f.win.IELTSYearPlanner={dateKey:at=>new Date(at).toISOString().slice(0,10),calendarBudget:()=>({remainingMinutes:0,exhausted:true})};let captured;const original=f.win.IELTSEssentialVocabularyApp;f.win.IELTSEssentialVocabularyApp={...original,mount(options){const result=original.mount(options);captured={options,result};return result;}};
 f.loadMemoryApp();await H.settle();assert.equal(typeof captured.options.isReviewActive,'function');assert.equal(captured.options.isReviewActive(),true);assert.ok(history(f),f.dashboard.textContent);assert.equal(history(f).hidden,true);assert.equal(await captured.result.openSavedBatch(Object.keys(f.memory.read().essential.batches)[0]),false);assert.equal(f.memory.read().drafts[draft.id].answer,'kept-original-input');assert.doesNotMatch(f.practice.textContent,/三写三读原始证据/);captured.result.destroy();
});
for(const seam of ['R.list','onNewWordsOpened','onActiveChange'])for(const change of ['review','owner'])test('saved history rechecks '+change+' after '+seam,async()=>{
 const{f,app,batch}=await H.committed();app.destroy();let review=false,armed=false;const mutate=()=>{if(!armed)return;if(change==='review')review=true;else f.switchProfile();};
 const R=seam==='R.list'?{...f.R,async list(){const rows=await f.R.list();mutate();return rows;}}:f.R;
 const next=f.nativeMount({records:R,initialRecords:await f.R.list(),isReviewActive:()=>review,onNewWordsOpened:async()=>{if(seam==='onNewWordsOpened'){await Promise.resolve();mutate();}},onActiveChange:async()=>{if(seam==='onActiveChange'){await Promise.resolve();mutate();}}});
 const before=f.storage.getItem(M.KEY);armed=true;await assert.rejects(next.openSavedBatch(batch.id),change==='review'?/复习|测试/:/档案/);assert.equal(f.storage.getItem(M.KEY),before);assert.doesNotMatch(f.practice.textContent,/三写三读原始证据/);next.destroy();
});
for(const mode of ['unsubmitted','no-draft','committed-residual'])test('actual Inline global review guard / zero-budget readonly: '+mode,async()=>{
 const{f,app,batch,record}=await H.committed();app.destroy();f.dashboard.replaceChildren();f.practice.replaceChildren();const S=require(path.join(H.base,'assets/memory-session.js'));f.win.IELTSMemorySession=S;
 if(mode!=='no-draft'){
  const state=f.memory.read(),item=Object.values(state.items).find(item=>item.skill==='spelling'),draft=S.makeDraft(item,{id:'memory-inline-history-'+mode,courseDay:2});draft.answer=mode==='committed-residual'?item.word:'kept-unsubmitted-input';state.drafts[draft.id]=draft;f.memory.createStore(f.storage).save(state);
  if(mode==='committed-residual')await f.R.record(S.recordFor(draft,item,{correct:true},{now:Date.now()}));
 }
 vm.runInContext(fs.readFileSync(path.join(H.base,'assets/essential-vocabulary-inline.js'),'utf8'),f.context);const host=f.doc.createElement('section');f.doc.body.append(host);
 const inline=f.win.IELTSEssentialVocabularyInline.mount(host,{courseDay:3,initialRecords:await f.R.list(),memory:f.memory,session:S,vocabulary:f.vocabulary,records:f.R,profiles:f.win.IELTSProfiles,getBudget:()=>({remainingMinutes:0,exhausted:true}),pauseCourse:async()=>{}});await inline.ready;
 const raw=f.storage.getItem(M.KEY),saved=JSON.stringify(await f.R.exportRawState()),panel=host.querySelector('.essential-saved-history'),open=panel.querySelectorAll('button').find(button=>button.textContent.startsWith('查看第 '));assert.equal(inline.getState().review,false);assert.equal(panel.hidden,mode==='unsubmitted');await open.click();assert.equal(host.textContent.includes('三写三读原始证据'),mode!=='unsubmitted');assert.equal(f.storage.getItem(M.KEY),raw);assert.equal(JSON.stringify(await f.R.exportRawState()),saved);assert.equal((await f.R.list()).find(value=>value.id===record.id).answer,record.answer);
 if(mode==='unsubmitted')assert.match(host.textContent,/仍保留/);if(mode==='committed-residual'){const state=f.memory.read(),draft=Object.values(state.drafts)[0];assert.ok(draft);assert.equal(f.API.hasUnsubmittedReviews(state,await f.R.list(),S),false);draft.answer='changed-after-the-original';assert.equal(f.API.hasUnsubmittedReviews(state,await f.R.list(),S),true);}
 inline.destroy();
});
