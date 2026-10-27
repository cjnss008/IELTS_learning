'use strict';
// Actual App + native Memory / synthetic DOM. No real browser or learner data.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const H=require('./lexical-retention-v88-test-fixture.cjs');
const Bank=require('../assets/lexical-bank-runtime.js');
function loadBank(win){
  win.TextEncoder=TextEncoder;win.TextDecoder=TextDecoder;win.AbortController=AbortController;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/lexical-bank-runtime.js'),'utf8'),win,{filename:'actual-lexical-bank-runtime-v91.js'});
  return win.IELTSLexicalBankRuntime;
}

test('actual App restores a bound old48h draft through immutable legacy mapping without registry/network/adoption or original rewrites',async()=>{
  const f=await H.dueFixture({},{nativeMemory:true});
  try{
    await H.openFirst(f);const input=f.dom.practice.querySelector('input');input.value='gam';await input.fire('input');
    f.app.pause();f.app.destroy();const originalMemory=f.dom.storage.getItem(H.M.KEY),originalRecords=JSON.stringify(await f.dom.records.list());
    const actual=loadBank(f.dom.win);let mapped=0,requests=0;
    f.dom.win.fetch=async()=>{requests++;throw Error('offline registry');};
    f.dom.win.IELTSLexicalBankRuntime={...actual,createRuntime(options){const runtime=actual.createRuntime(options);return{...runtime,restoreLegacyState(value){mapped++;return runtime.restoreLegacyState(value);}};}};
    f.app=f.mount({courseDay:53,now:()=>f.clock,initialRecords:await f.dom.records.list()});
    assert.equal(mapped,1);assert.equal(requests,0);
    assert.equal(f.dom.storage.getItem(H.M.KEY),originalMemory);
    assert.equal(JSON.stringify(await f.dom.records.list()),originalRecords);
    const draft=H.retentionRows(f)[0];await f.app.startRetention(draft.contractKey,draft.variant);
    assert.equal(f.dom.practice.querySelector('input').value,'gam');
    assert.equal(H.retentionRows(f)[0].id,draft.id);assert.equal(f.app.getRetentionPlan().completed.length,0);
    assert.equal(f.app.getRetentionPlan().lapses,0);assert.equal(requests,0);
  }finally{f.app?.destroy();f.close();}
});

test('an incompatible release mapper stops actual mount before changing old Memory, originals or completion',async()=>{
  const f=await H.dueFixture({},{nativeMemory:true});
  try{
    f.app.destroy();const originalMemory=f.dom.storage.getItem(H.M.KEY),originalRecords=JSON.stringify(await f.dom.records.list());
    const incompatible={createRuntime(){return{restoreLegacyState(){return{status:'pending',reason:'BANK_LEGACY_PIN'};}};}};
    assert.throws(()=>f.mount({courseDay:53,now:()=>f.clock,initialRecords:[],bankRuntime:incompatible}),/版本待核验.*原答案和原音保留/);
    assert.equal(f.dom.storage.getItem(H.M.KEY),originalMemory);
    assert.equal(JSON.stringify(await f.dom.records.list()),originalRecords);
    f.app=f.mount({courseDay:53,now:()=>f.clock,initialRecords:await f.dom.records.list(),bankRuntime:loadBank(f.dom.win)});
    assert.ok(f.app.getRetentionPlan().ready.some(row=>row.variant===1));
    assert.equal(f.app.getRetentionPlan().completed.length,0);
  }finally{f.app?.destroy();f.close();}
});

test('fresh Memory does not require a bank fetch, create a retention field or enable a future release',()=>{
  const App=require('../assets/essential-vocabulary-app.js'),memory=H.M.newState(),before=JSON.stringify(memory);
  let calls=0;const status=App.legacyReleaseMapping(memory,{bankRuntime:{createRuntime(){calls++;throw Error('must not fetch or initialize');}}});
  assert.equal(status.status,'ready');assert.equal(status.kind,'legacy-not-started');assert.equal(status.rewritten,false);
  assert.equal(calls,0);assert.equal(JSON.stringify(memory),before);assert.equal(Object.hasOwn(memory,'reviewedRetention'),false);
});

test('older standalone page delegates only to its unchanged v88 validator when Bank is absent',async()=>{
  const f=await H.dueFixture({},{nativeMemory:true});
  try{
    const App=f.dom.win.IELTSEssentialVocabularyApp,memory=f.dom.memory.read(),before=JSON.stringify(memory);
    assert.equal(f.dom.win.IELTSLexicalBankRuntime,undefined);
    const status=App.legacyReleaseMapping(memory,{retention:f.dom.win.IELTSLexicalRetentionV88});
    assert.equal(status.status,'ready');assert.equal(status.kind,'direct-legacy-delegate');assert.equal(status.rewritten,false);
    assert.equal(JSON.stringify(memory),before);assert.equal(f.app.getRetentionPlan().completed.length,0);
    const invalid=H.copy(memory);Object.values(invalid.reviewedRetention.contracts)[0].policyVersion='unsupported-future-release';
    assert.equal(App.legacyReleaseMapping(invalid,{retention:f.dom.win.IELTSLexicalRetentionV88}).status,'pending');
    assert.equal(Bank.createRuntime({legacyCodec:f.dom.win.IELTSLexicalRetentionV88}).resolveLegacyContract({releaseId:'future',role:'reviewed-context-retention-v88'}).status,'pending');
  }finally{f.app?.destroy();f.close();}
});
