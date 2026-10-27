'use strict';
// Native archive and immutable legacy snapshot fixtures; no learner data.
const test=require('node:test'),assert=require('node:assert/strict'),F=require('./lexical-bank-step1-fixture.cjs'),I=require('./record-snapshot-index-fixture.cjs');
const owner=()=>({profileId:'legacy',profileCreatedAt:'2026-01-01T00:00:00.000Z',resetEpoch:null,generation:'initial'});
function legacyReader(records){const e=I.environment(records);e.setGeneration('initial');e.setNow(Date.parse(F.at));return F.Bank().createProofReader({mode:'legacy',records:e.store,snapshotIndex:e.env.IELTSRecordSnapshotIndex,getFreshFence:owner,getFreshEvidence:()=>({memory:'m1',source:'s1',correction:'c1',draft:'d1'})});}
test('native readSet refuses a missing parent even when it was explicitly requested, including inherited property names',async()=>{
  for(const parentId of ['missing-parent','toString','hasOwnProperty']){
    const child={...F.record('child','source-material'),kind:'correction',parentId},f=await F.archiveFixture([child]);
    try{
      await assert.rejects(f.store.readSet(['child',parentId],{includeParents:true}),error=>error.code==='HISTORY_PENDING');
      assert.equal(f.calls.post,0);assert.equal(f.idb.databases.size,0);
    }finally{f.close();}
  }
});
test('legacy proof reader cannot mistake a prototype property for a bound parent or return authoritative absence for it',async()=>{
  for(const parentId of ['missing-parent','toString','hasOwnProperty']){
    const reader=legacyReader([{...F.record('child','source-material'),kind:'correction',parentId}]);
    const proof=await reader.read({ids:['child',parentId]});
    assert.equal(proof.status,'pending');assert.ok(['BANK_PARENT_PENDING','BANK_PROOF_PENDING'].includes(proof.reason));assert.equal(proof.learningFailure,false);
  }
});
test('real parents with legal prototype-like IDs remain readable and null is a terminal parent marker',async()=>{
  for(const parentId of ['toString','null','undefined']){
    const parent=F.record(parentId),child={...F.record('child','source-material'),kind:'correction',parentId},f=await F.archiveFixture([parent,child]);
    try{
      const set=await f.store.readSet(['child',parentId],{includeParents:true});assert.equal(set.complete,true);assert.equal(Object.hasOwn(set.recordsById,parentId),true);assert.deepEqual(set.missingIds,[]);assert.equal(await f.store.verifyReadSet(set),true);
      const reader=legacyReader([parent,child]),proof=await reader.read({ids:['child',parentId]});assert.equal(proof.status,'ready');assert.equal((await reader.verify(proof)).status,'ready');
    }finally{f.close();}
  }
});
