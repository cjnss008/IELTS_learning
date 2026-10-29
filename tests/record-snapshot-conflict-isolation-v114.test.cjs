'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),H=require('./record-snapshot-index-fixture.cjs');
const {fixture:bridgeFixture,snapshot}=require('./daily-review-fixture.cjs').helper('user-data-store.test.cjs','fixture,snapshot');
const conflictStatus=()=>({state:'conflict',operationState:'conflict',profileId:'p-other123',blockedProfileIds:['p-other123'],conflicts:[{profileId:'p-other123',currentRevision:2,conflictId:'synthetic-candidate'}],error:'尚未选择保留哪份版本。'});
const setStatus=(f,value)=>{f.env.IELTSUserData={assertReady(){},status:()=>value};};

test('the actual user-data bridge preserves another profile conflict while the current profile can read its real records snapshot',async()=>{
 const b=bridgeFixture([snapshot('legacy','current original'),snapshot('p-other123','other original')]);await b.bridge.initialise();
 const server=b.remote.values.get('p-other123');server.revision++;server.snapshot.entries['ielts52-course-player-v1']='other disk version';
 b.local.values.get('p-other123').entries['ielts52-course-player-v1']='other local version';b.bridge.markDirty('p-other123');
 await assert.rejects(b.bridge.syncNow({profileId:'p-other123'}),e=>e.code==='USER_DATA_CONFLICT');
 const before=b.bridge.status();assert.equal(before.state,'conflict');assert.equal(before.operationState,'conflict');assert.deepEqual(before.blockedProfileIds,['p-other123']);
 const f=H.environment(),raw=JSON.stringify(f.raw());f.env.IELTSUserData=b.bridge;
 const rows=await f.store.list(),receipt=f.env.IELTSRecordSnapshotIndex.receipt(rows);assert.equal(rows.length,1);assert.equal(receipt.profileId,'legacy');assert.equal(JSON.stringify(f.raw()),raw);assert.deepEqual(b.bridge.status(),before);
 // A real bridge restore can overlay loading with the other profile's conflict.
 let reached,release;const entered=new Promise(resolve=>{reached=resolve;}),gate=new Promise(resolve=>{release=resolve;}),write=b.local.writeProfile;
 b.local.writeProfile=async value=>{reached();await gate;return write(value);};
 const restoring=b.bridge.restoreFromDisk({profileId:'legacy'});await Promise.race([entered,restoring.then(()=>{throw Error('restore did not enter the synthetic write');})]);
 const during=b.bridge.status();assert.equal(during.state,'conflict');assert.equal(during.operationState,'loading');await assert.rejects(f.store.list(),e=>e.code==='RECORD_SNAPSHOT_NOT_READY');
 release();await restoring;assert.equal(b.bridge.status().state,'conflict');assert.deepEqual(b.bridge.status().blockedProfileIds,['p-other123']);assert.equal((await f.store.list()).length,1);
 f.setProfile('p-other123');await assert.rejects(f.makeStore().list(),e=>e.code==='RECORD_SNAPSHOT_NOT_READY');assert.deepEqual(b.bridge.status().conflicts,before.conflicts);
});

test('only clearly attributed foreign conflicts in a safe operation state are ignored',async()=>{
 const f=H.environment(),index=f.env.IELTSRecordSnapshotIndex;
 for(const operationState of ['conflict','ready','pending','syncing']){
  const status=conflictStatus();status.operationState=operationState;if(operationState!=='conflict')status.error=null;
  const before=JSON.stringify(status);setStatus(f,status);assert.equal(index.projectRead(()=>42),42,operationState);assert.equal(JSON.stringify(status),before);
 }
 const foreign=conflictStatus(),cases=[
  {...foreign,blockedProfileIds:undefined}, {...foreign,blockedProfileIds:[]}, {...foreign,blockedProfileIds:['']}, {...foreign,blockedProfileIds:['p-other123','p-other123']},
  {...foreign,conflicts:undefined}, {...foreign,conflicts:[]}, {...foreign,conflicts:[{}]}, {...foreign,conflicts:[{profileId:'legacy'}]}, {...foreign,profileId:'unknown'},
  {...foreign,blockedProfileIds:['legacy'],profileId:'legacy',conflicts:[{profileId:'legacy'}]},
  ...[undefined,'loading','error','offline','unknown'].map(operationState=>({...foreign,operationState})),
  {...foreign,errorCode:'USER_DATA_FAILED'}, {...foreign,operationState:'pending',error:'independent sync error'},
  {...foreign,state:'error'}, {...foreign,state:'ready',operationState:'loading'}, {...foreign,state:'ready',blockedProfileIds:['legacy']}
 ];
 for(const status of cases){setStatus(f,status);assert.throws(()=>index.projectRead(()=>42),e=>e.code==='RECORD_SNAPSHOT_NOT_READY',JSON.stringify(status));}
 setStatus(f,foreign);f.env.IELTSProfiles.current=()=>({});assert.throws(()=>index.projectRead(()=>42),e=>e.code==='RECORD_SNAPSHOT_OWNER_CHANGED');
});

test('a conflict or hidden loading that begins during a snapshot read discards the result',async()=>{
 for(const change of ['current-conflict','loading']){
  const f=H.environment(),gate=f.holdDigest(),foreign=conflictStatus();let current=foreign;f.env.IELTSUserData={assertReady(){},status:()=>current};
  const before=JSON.stringify(f.raw()),pending=f.store.list();await gate.entered;
  current=change==='loading'?{...foreign,operationState:'loading'}:{...foreign,blockedProfileIds:['p-other123','legacy'],conflicts:[...foreign.conflicts,{profileId:'legacy'}]};
  gate.release();await assert.rejects(pending,e=>e.code==='RECORD_SNAPSHOT_NOT_READY');assert.equal(JSON.stringify(f.raw()),before);
 }
 const f=H.environment();let current=conflictStatus();f.env.IELTSUserData={assertReady(){},status:()=>current};
 assert.throws(()=>f.env.IELTSRecordSnapshotIndex.projectRead(()=>{current={...current,operationState:'loading'};return 'discard';}),e=>e.code==='RECORD_SNAPSHOT_NOT_READY');
});
