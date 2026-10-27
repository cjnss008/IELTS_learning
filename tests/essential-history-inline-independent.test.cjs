'use strict';
// Independent actual-inline entry probe. Uses the existing portable EA/V and
// production Records browser/IndexedDB adapter fixture; no browser or audio claim.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const H=require('./essential-saved-history-fixture.cjs'),M=require(path.join(H.base,'assets/memory-core.js')),S=require(path.join(H.base,'assets/memory-session.js'));
async function throughActualInline(held){
 const{f,app,batch,record}=await H.committed();app.destroy();f.dashboard.replaceChildren();f.practice.replaceChildren();
 let draft;
 if(held){const state=f.memory.read(),item=Object.values(state.items).find(item=>item.skill==='spelling');assert.ok(item);draft=S.makeDraft(item,{id:'memory-independent-inline-held',courseDay:2});draft.answer='preserved-unsubmitted-recall';state.drafts[draft.id]=draft;f.memory.createStore(f.storage).save(state);}
 const raw=f.storage.getItem(M.KEY),records=JSON.stringify(await f.R.exportRawState());
 f.win.IELTSMemorySession=S;vm.runInContext(fs.readFileSync(path.join(H.base,'assets/essential-vocabulary-inline.js'),'utf8'),f.context,{filename:'actual-essential-vocabulary-inline.js'});
 const host=f.doc.createElement('section');f.doc.body.append(host);let pauses=0;
 const inline=f.win.IELTSEssentialVocabularyInline.mount(host,{courseDay:3,initialRecords:await f.R.list(),memory:f.memory,session:S,vocabulary:f.vocabulary,records:f.R,profiles:f.win.IELTSProfiles,getBudget:()=>({remainingMinutes:0,exhausted:true}),pauseCourse:async()=>{pauses++;}});
 await inline.ready;await H.settle();assert.equal(inline.getState().review,false,'The actual inline local getter is empty; the held draft belongs to another view');
 const box=host.querySelector('.essential-saved-history');assert.ok(box);const button=box.querySelectorAll('button').find(b=>b.textContent.startsWith('查看第 '));assert.ok(button);
 try{
  assert.equal(box.hidden,held);
  // Also fire an already held/stale button, so merely hiding the DOM cannot
  // satisfy the guard. The actual action must recheck the global draft.
  await button.click();await H.settle();
  if(held){assert.doesNotMatch(host.textContent,/三写三读原始证据/);assert.equal(pauses,0);assert.deepEqual(H.copy(f.memory.read().drafts[draft.id]),draft);assert.equal(f.memory.read().drafts[draft.id].assisted,false);}
  else{assert.match(host.textContent,/本组初学原稿已提交/);assert.match(host.textContent,/三写三读原始证据/);assert.match(host.textContent,/incorrect/);assert.equal(pauses,1);}
  assert.equal(f.storage.getItem(M.KEY),raw);assert.equal(JSON.stringify(await f.R.exportRawState()),records);assert.equal((await f.R.list()).find(r=>r.id===record.id).answer,record.answer);assert.ok(f.memory.read().essential.batches[batch.id]);
 }finally{inline.destroy();}
}
test('actual inline cannot reveal saved answers over a cross-page paused unsubmitted Memory draft',()=>throughActualInline(true));
test('actual inline permits read-only saved history with no unsubmitted draft even when the shared budget is zero',()=>throughActualInline(false));
