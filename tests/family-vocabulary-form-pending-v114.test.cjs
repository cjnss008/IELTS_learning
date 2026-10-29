'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {helper}=require('./daily-review-fixture.cjs'),{mounted,unitContext,batchOptions}=helper('family-vocabulary-signed-audio-v114.test.cjs','mounted,unitContext,batchOptions');
const root=path.resolve(__dirname,'..');

for(const pending of ['zzunrelatedold','kilogram','litre','liter'])test('saved signed family group handles pending form '+pending+' without changing its original',async()=>{
 const f=await mounted(),win=f.win,{ready,context}=await unitContext(f,13),selected=['kilogram','liter'].map(value=>context.targets.find(word=>word.word===value)),{state,batch}=batchOptions(f,context,ready.records,13,selected,'essential-batch-pending-'+pending),M=win.IELTSMemory;
 const store=M.createStore(win.IELTSProfiles.storage());store.read();store.save(state);const original=JSON.stringify(M.read().essential.batches[batch.id]);
 for(const name of ['contextual-vocabulary-exposure.js','essential-vocabulary-app.js'])vm.runInContext(fs.readFileSync(path.join(root,'assets',name),'utf8'),f.context,{filename:name});win.IELTSMediaLibrary={list:async()=>[]};win.IELTSPlacement={currentRoute:()=>({startDay:13,skills:{}})};win.document.createTextNode=value=>{const node=win.document.createElement('span');node.textContent=String(value);return node;};
 const dashboard=win.document.createElement('section'),practice=win.document.createElement('section'),pendingDraft={id:'unrelated-synthetic-draft',taskId:'vocabulary',text:JSON.stringify({kind:'vocabulary-practice-draft',wordKeys:[pending]})};
 const app=win.IELTSEssentialVocabularyApp.mount({document:win.document,dashboard,practice,initialRecords:ready.records,courseDay:13,getBudget:()=>({remainingMinutes:360,exhausted:false}),getVocabularyDrafts:()=>[pendingDraft]});
 const opened=await app.openBatch(batch.id),plan=app.getPlan();assert.equal(plan.formSafety.hasPendingForms,true);assert.equal(plan.formSafety.unindexedPending,false);
 if(pending==='zzunrelatedold'){assert.notEqual(opened,false);assert.match(practice.textContent,/本组必学 2 词/);assert.match(practice.textContent,/kilogram/);assert.match(practice.textContent,/liter/);const saved=M.read().essential.batches[batch.id],prior=JSON.parse(original);for(const key of ['words','wordKeys','contextSource','startedAt'])assert.equal(JSON.stringify(saved[key]),JSON.stringify(prior[key]));}
 else{assert.equal(opened,false);assert.match(dashboard.textContent,/词形关系或已有原稿待核验/);assert.equal(JSON.stringify(M.read().essential.batches[batch.id]),original);}
 app.destroy();
});
