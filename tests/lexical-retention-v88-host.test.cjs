'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),H=require('./lexical-retention-v88-test-fixture.cjs');
const tick=()=>new Promise(setImmediate),visible=node=>node.hidden?'':(node._text||node.nodeValue||'')+(node.children||[]).map(visible).join('');
async function actualMemoryPage(f){
 f.app.destroy();const{win,doc}=f.dom;win.window=win;win.location.search='?day=53';win.IELTSProfiles.isPreview=()=>false;win.IELTSMemorySession=require('../assets/memory-session.js');win.structuredClone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));for(const[id,tag]of [['memoryPractice','section'],['memoryDashboard','section'],['memoryRetention','input'],['saveMemoryRetention','button'],['memorySettingsStatus','p'],['memoryModelState','p']]){const node=doc.createElement(tag);node.id=id;doc.body.append(node);}vm.runInNewContext(fs.readFileSync(path.join(H.root,'assets/essential-vocabulary-core.js'),'utf8'),win);vm.runInNewContext(fs.readFileSync(path.join(H.root,'assets/year-planner.js'),'utf8'),win);const EA=win.IELTSEssentialVocabularyApp;let pageApp;win.IELTSEssentialVocabularyApp={...EA,mount(options){pageApp=EA.mount(options);return pageApp;}};const timers=[];let elapsed=0;win.setInterval=(fn,ms)=>{timers.push({fn,ms});return timers.length;};vm.runInNewContext(fs.readFileSync(path.join(H.root,'assets/memory-app.js'),'utf8'),win,{filename:'actual-memory-app.js'});for(let i=0;i<30;i++)await tick();assert.ok(pageApp);return{app:pageApp,ordinary:doc.getElementById('memoryPractice'),timers,async advance(seconds){for(let i=0;i<seconds;i++){f.clock+=1000;elapsed+=1000;for(const timer of timers)if(elapsed%timer.ms===0)await timer.fn();await tick();await tick();}}};
}
test('actual Memory-app host hides and pauses ordinary recall before retention, preserves both drafts and resumes each activity ledger once',async()=>{
 const f=await H.dueFixture({},{nativeMemory:true});let page;try{page=await actualMemoryPage(f);const{app,ordinary}=page,hint=ordinary.querySelectorAll('button').find(b=>b.textContent.startsWith('查看提示')),oldInput=ordinary.querySelector('input')||ordinary.querySelector('textarea');assert.ok(hint);assert.ok(oldInput);oldInput.value='ordinary-original';await oldInput.fire('input');const old=Object.values(f.dom.memory.read().drafts)[0],row=app.getRetentionPlan().ready.find(r=>r.variant===1);await app.startRetention(row.contractKey,1);assert.equal(ordinary.hidden,true);await hint.click();assert.equal(visible(ordinary).includes('game'),false);assert.equal(f.dom.practice.querySelectorAll('input').length,1);const target=f.dom.practice.querySelector('input');target.value='gam';await target.fire('input');await page.advance(15);target.value='gam';await target.fire('input');app.pause();let memory=f.dom.memory.read(),normal=memory.drafts[old.id],retention=H.retentionRows(f)[0];assert.equal(normal.answer,'ordinary-original');assert.equal(normal.activeSeconds,0);assert.equal(retention.phase,'retrieval');assert.equal(retention.activeSeconds,15);const E=require('../assets/essential-vocabulary-core.js'),budget=()=>f.dom.win.IELTSYearPlanner.calendarBudget([],Object.values(f.dom.memory.read().drafts).concat(E.activityDrafts(f.dom.memory.read())),E.dateKey(f.clock));assert.equal(budget().spentMinutes,.25);await H.H.DOM.button(f.dom.practice,'保存并收起保持练习').click();const review=f.dom.dashboard.querySelectorAll('button').find(b=>b.textContent.startsWith('开始本轮复习'));assert.ok(review);await review.click();assert.equal(ordinary.hidden,false);assert.equal((ordinary.querySelector('input')||ordinary.querySelector('textarea')).value,'ordinary-original');await page.advance(10);const fresh=f.dom.practice.querySelectorAll('input');assert.equal(fresh.length,0);await app.startRetention(row.contractKey,1);assert.equal(ordinary.hidden,true);assert.equal(f.dom.practice.querySelector('input').value,'gam');memory=f.dom.memory.read();normal=memory.drafts[old.id];retention=H.retentionRows(f)[0];assert.equal(normal.activeSeconds,10);assert.equal(retention.activeSeconds,15);assert.ok(Math.abs(budget().spentMinutes-25/60)<1e-8);assert.equal((await f.dom.records.list()).filter(r=>r.source==='reviewed-context-retention-v88').length,0);assert.equal(app.getRetentionPlan().completed.length,0);assert.equal(app.getRetentionPlan().lapses,0);
  // Switching directly from the active retention form must release its active
  // host lease, so a later explicit resume remains possible.
  const switchReview=f.dom.dashboard.querySelectorAll('button').find(b=>b.textContent.startsWith('开始本轮复习'));await switchReview.click();assert.equal(ordinary.hidden,false);await app.startRetention(row.contractKey,1);assert.equal(f.dom.practice.querySelector('input').value,'gam');assert.equal(ordinary.hidden,true);
 }finally{page?.app.destroy();f.close();}
});

test('a failed English-lock durable checkpoint retries the same form without changing its locked original or exposing the scene',async()=>{
 let fail=true,calls=0;const f=await H.dueFixture({durable:async()=>{calls++;if(fail)throw Error('synthetic retrieval checkpoint pending');}},{nativeMemory:true});try{await H.openFirst(f);const input=f.dom.practice.querySelector('input');input.value='gam';await input.fire('input');const form=f.dom.practice.querySelector('form');await form.fire('submit');const first=H.retentionRows(f)[0],scene=H.Data.entries.find(e=>e.word==='game').delayedTransfer[0];assert.equal(first.phase,'consolidation');assert.equal(first.answers.form,'gam');assert.equal(f.dom.practice.textContent.includes(scene.sentence),false);assert.equal(f.app.getRetentionPlan().completed.length,0);assert.equal(f.app.getRetentionPlan().lapses,0);assert.equal(input.disabled,true);const raw=f.dom.storage.getItem(H.M.KEY);fail=false;await form.fire('submit');assert.equal(calls,2);assert.equal(H.retentionRows(f)[0].answers.form,'gam');assert.equal(f.dom.storage.getItem(H.M.KEY),raw);assert.equal(f.dom.practice.querySelectorAll('select').length,2);assert.equal(f.dom.practice.textContent.includes(scene.sentence),true);assert.equal((await f.dom.records.list()).filter(r=>r.source==='reviewed-context-retention-v88').length,0);
 }finally{f.app.destroy();f.close();}
});

test('closing or reopening a locally locked English response cannot bypass a still-pending durable checkpoint',async()=>{
 let fail=true;const durable=async()=>{if(fail)throw Error('synthetic retrieval checkpoint pending');},f=await H.dueFixture({durable},{nativeMemory:true});try{await H.openFirst(f);let input=f.dom.practice.querySelector('input');input.value='gam';await input.fire('input');await f.dom.practice.querySelector('form').fire('submit');const draft=H.retentionRows(f)[0],scene=H.Data.entries.find(e=>e.word==='game').delayedTransfer[0],records=await f.dom.records.list();f.app.destroy();f.app=f.mount({courseDay:54,now:()=>f.clock,initialRecords:records,durable});await assert.rejects(f.app.startRetention(draft.contractKey,1),/checkpoint pending/);assert.equal(f.dom.practice.textContent.includes(scene.sentence),false);assert.equal(H.retentionRows(f)[0].answers.form,'gam');assert.equal(f.app.getRetentionPlan().lapses,0);fail=false;const resumed=await f.app.startRetention(draft.contractKey,1);assert.equal(resumed.id,draft.id);assert.equal(resumed.courseDay,53);assert.equal(resumed.answers.form,'gam');assert.equal(f.dom.practice.querySelectorAll('select').length,2);assert.equal(f.dom.practice.textContent.includes(scene.sentence),true);
 }finally{f.app.destroy();f.close();}
});

test('the actual page interval counts40s reading,10s ordinary recall and5s resumed retention once with periodic saves',async()=>{
 const f=await H.dueFixture({},{nativeMemory:true});let page;try{page=await actualMemoryPage(f);const{app,ordinary}=page,input=ordinary.querySelector('input');input.value='old ordinary draft input';await input.fire('input');const before=f.dom.memory.read(),old=Object.values(before.drafts)[0],cards=JSON.stringify(before.items),row=app.getRetentionPlan().ready.find(r=>r.variant===1);await app.startRetention(row.contractKey,1);const id=H.retentionRows(f)[0].id;let saves=0;const saved=()=>saves++;f.dom.win.addEventListener('ielts:memory-changed',saved);await page.advance(40);f.dom.win.removeEventListener('ielts:memory-changed',saved);let memory=f.dom.memory.read(),retention=H.retentionRows(f)[0],normal=memory.drafts[old.id];assert.equal(ordinary.hidden,true);assert.equal(normal.activeSeconds,0);assert.equal(retention.activeSeconds,40);assert.equal(retention.answers.form,'');assert.ok(saves<=8,'clock persists periodically instead of each second: '+saves);const review=f.dom.dashboard.querySelectorAll('button').find(b=>/^开始本轮复习|^查看复习安排/.test(b.textContent));await review.click();assert.equal(ordinary.hidden,false);assert.equal(ordinary.querySelector('input').value,'old ordinary draft input');await page.advance(10);await ordinary.querySelectorAll('button').find(b=>b.textContent.startsWith('查看提示')).click();memory=f.dom.memory.read();normal=memory.drafts[old.id];assert.equal(normal.activeSeconds,10);assert.equal(H.retentionRows(f)[0].activeSeconds,40);const normalBytes=JSON.stringify(normal);await app.startRetention(row.contractKey,1);assert.equal(ordinary.hidden,true);assert.equal(H.retentionRows(f)[0].id,id);await page.advance(5);memory=f.dom.memory.read();retention=H.retentionRows(f)[0];assert.equal(retention.activeSeconds,45);assert.equal(JSON.stringify(memory.drafts[old.id]),normalBytes);const E=f.dom.win.IELTSEssentialVocabulary,budget=f.dom.win.IELTSYearPlanner.calendarBudget(await f.dom.records.list(),Object.values(memory.drafts).concat(E.activityDrafts(memory)),E.dateKey(f.clock));assert.ok(Math.abs(budget.spentMinutes-55/60)<1e-8);assert.equal(JSON.stringify(memory.items),cards);assert.equal(app.getRetentionPlan().lapses,0);assert.equal(app.getRetentionPlan().completed.length,0);assert.equal((await f.dom.records.list()).filter(r=>r.source==='reviewed-context-retention-v88').length,0);await H.H.DOM.button(f.dom.practice,'保存并收起保持练习').click();assert.equal(H.retentionRows(f)[0].activeSeconds,45);
 }finally{page?.app.destroy();f.close();}
});

test('opening coalesces public repaint and finally freezes the real eligible retention contract', async () => {
  const f = H.setup({nativeMemory:true});
  const {win, storage, memory, practice, dashboard} = f.dom;
  const memoryKey = H.M.KEY;
  const previousCurriculum = win.IELTSCurriculumData;
  const previousFamily = win.IELTSFamilyLessonExpansionV95;
  let oldApp = null, app = null, opening = null, releaseOpen = () => {};
  let watchPublic = false, signalPublic = () => {};
  const bounded = (promise, label) => {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('timeout: ' + label)), 15000); })])
      .finally(() => clearTimeout(timer));
  };
  try {
    const initial = await H.initial(f);
    oldApp = initial.app;
    oldApp.getRetentionPlan();
    const complete = H.copy(memory.read());
    const original = Object.entries(complete.reviewedRetention?.contracts || {}).find(([, c]) => c.initial?.recordId === initial.record.id);
    assert.ok(original, 'real initial must yield a reviewed contract');
    const [contractKey, expectedContract] = original;
    const oldBatchId = expectedContract.initial.batchId;
    const oldBatch = H.copy(complete.essential.batches[oldBatchId]);
    assert.ok(oldBatch && oldBatch.status === 'submitted' && !oldBatch.draft);
    assert.equal(oldBatch.recordId, initial.record.id);
    assert.ok(!Object.values(complete.reviewedRetention.drafts || {}).some(d => d.contractKey === contractKey));
    assert.ok(!Object.values(complete.reviewedRetention.observations || {}).some(o => o.contractKey === contractKey));
    const originalAnswer = initial.record.answer;
    oldApp.destroy(); oldApp = null;

    delete complete.essential.batches[oldBatchId];
    delete complete.reviewedRetention.contracts[contractKey];
    storage.setItem(memoryKey, JSON.stringify(complete));
    const records = await f.dom.records.list();
    assert.ok(records.some(r => r.id === initial.record.id && r.answer === originalAnswer));

    let signalOpening;
    const reachedOpening = new Promise(resolve => { signalOpening = resolve; });
    const openGate = new Promise(resolve => { releaseOpen = resolve; });
    const publicChecked = new Promise(resolve => { signalPublic = resolve; });
    const runtime = {
      async prepareVocabularyUnit() { return {status:'ready', records:await f.dom.records.list()}; },
      isCurrentFullRecords(rows) { assert.ok(Array.isArray(rows)); if (watchPublic) signalPublic(); return true; }
    };
    win.IELTSFamilyLessonExpansionV95 = {runtime: () => runtime};
    win.IELTSCurriculumData = {...previousCurriculum, familyLessonRelease:{active:true, units:[{day:53}]}};
    app = f.mount({courseDay:53, now:() => f.clock, initialRecords:records, contextWords:f.dom.entries, courseWords:[], onActiveChange:async (active, info) => { if (active && info?.kind === 'new') { signalOpening(); await openGate; } }});
    await tick(); await tick();
    assert.equal(memory.read().reviewedRetention.contracts[contractKey], undefined);
    opening = app.start();
    await bounded(reachedOpening, 'opening gate');
    assert.equal(app.isBusy(), true);
    assert.equal(app.getState(), null);

    const during = H.copy(memory.read());
    during.essential.batches[oldBatchId] = H.copy(oldBatch);
    storage.setItem(memoryKey, JSON.stringify(during));
    const R = win.IELTSLexicalRetentionV88;
    const preview = R.freeze(during, records, {adaptive:f.adaptive, day:53, now:f.clock});
    assert.equal(preview.changed, true, 'genuine pending contract must be eligible');
    assert.deepEqual(H.copy(preview.state.reviewedRetention.contracts[contractKey]), H.copy(expectedContract));
    assert.equal(memory.read().reviewedRetention.contracts[contractKey], undefined);

    watchPublic = true;
    win.dispatchEvent(new win.CustomEvent('ielts:public-course-plan-changed', {detail:{profileId:win.IELTSProfiles.current().id}}));
    await bounded(publicChecked, 'public callback');
    await tick();
    watchPublic = false;
    assert.equal(app.isBusy(), true);
    assert.equal(memory.read().reviewedRetention.contracts[contractKey], undefined, 'public repaint is suppressed while opening');

    releaseOpen();
    await bounded(opening, 'verified opening');
    assert.ok(app.getState(), 'the real vocabulary controller opened');
    assert.ok(practice.querySelector('.vocab-answer'));
    const finalMemory = memory.read();
    assert.deepEqual(H.copy(finalMemory.reviewedRetention.contracts[contractKey]), H.copy(expectedContract), 'finally must run real retention.prepare');
    assert.deepEqual(H.copy(finalMemory.essential.batches[oldBatchId]), oldBatch);
    assert.equal((await f.dom.records.list()).find(r => r.id === initial.record.id)?.answer, originalAnswer);
    assert.equal(Object.keys(finalMemory.reviewedRetention.observations || {}).length, 0);
  } finally {
    watchPublic = false;
    try { releaseOpen(); } catch (_) {}
    if (opening) await Promise.race([opening.catch(() => {}), new Promise(resolve => setTimeout(resolve, 1000))]);
    try { app?.destroy(); } catch (_) {}
    try { oldApp?.destroy(); } catch (_) {}
    win.IELTSFamilyLessonExpansionV95 = previousFamily;
    win.IELTSCurriculumData = previousCurriculum;
    f.close();
  }
});
