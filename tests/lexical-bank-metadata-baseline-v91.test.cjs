'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),F=require('./lexical-bank-step1-fixture.cjs');
test('a terminal metadata page below the native adopted logical baseline cannot certify source absence',async()=>{
  const f=await F.archiveFixture([F.record('visible','visible-source'),F.record('hidden','hidden-source')]);
  try{
    const original=f.transport.page;
    f.transport.page=async(...args)=>{const page=await original(...args);return{...page,items:page.items.filter(row=>row.id!=='hidden'),cursor:null};};
    await assert.rejects(f.store.readMetadataPage(),error=>error.code==='HISTORY_PENDING'&&/baseline/.test(error.message));
    assert.equal(f.calls.post,0);assert.equal(f.idb.databases.size,0);
  }finally{f.close();}
});
test('missing, malformed or out-of-bound logical baselines stay pending before source metadata scanning',async()=>{
  for(const baseline of [undefined,null,-1,1.5,'2',Number.MAX_SAFE_INTEGER+1,100001]){
    const f=await F.archiveFixture();
    try{
      const status=f.transport.status;f.transport.status=async()=>{const meta=await status();return{...meta,recordsArchive:{...meta.recordsArchive,recordCount:baseline}};};
      await assert.rejects(f.store.readMetadataPage(),error=>error.code==='HISTORY_PENDING');
      assert.equal(f.calls.page.length,0);assert.equal(f.calls.post,0);assert.equal(f.idb.databases.size,0);
    }finally{f.close();}
  }
});
test('baseline is an adoption-time lower bound: later originals are fully scanned and zero-record adoption remains valid',async()=>{
  const f=await F.archiveFixture();
  try{
    await f.append(F.record('later','later-source'));assert.equal((await f.transport.status()).recordsArchive.recordCount,2);
    let index=await f.store.readMetadataPage(null,{limit:1});while(!index.complete)index=await f.store.readMetadataPage(index,{limit:1});
    assert.equal(index.rows.length,3);const set=await f.store.readSet([],{materialIds:['later-source'],metadataIndex:index});assert.equal(set.recordsById.later.id,'later');assert.equal(await f.store.verifyReadSet(set),true);
  }finally{f.close();}
  const empty=await F.archiveFixture([]);
  try{const index=await empty.store.readMetadataPage();assert.equal(index.complete,true);assert.equal(index.rows.length,0);const set=await empty.store.readSet([],{materialIds:['absent-source'],metadataIndex:index});assert.deepEqual(set.recordsById,{});assert.equal(await empty.store.verifyReadSet(set),true);}finally{empty.close();}
});
test('a changed migration baseline invalidates a completed metadata index at the same sequence',async()=>{
  const f=await F.archiveFixture();
  try{
    const index=await f.store.readMetadataPage(),status=f.transport.status;
    f.transport.status=async()=>{const meta=await status();return{...meta,recordsArchive:{...meta.recordsArchive,recordCount:1}};};
    await assert.rejects(f.store.readSet([],{materialIds:['source-material'],metadataIndex:index}),error=>error.code==='HISTORY_PENDING'&&/metadata changed/.test(error.message));
    assert.equal(f.calls.post,0);assert.equal(f.idb.databases.size,0);
  }finally{f.close();}
});
