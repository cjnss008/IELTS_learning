'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createUserData,DATABASES}=require('../server/user-data.cjs');

function fixture(t,{start=true}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ielts-nas-lock-retry-')),rootDir=path.join(dir,'app'),dataDir=path.join(dir,'synthetic-data');fs.mkdirSync(rootDir);
 t.after(()=>{if(!path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Unsafe fixture cleanup');fs.rmSync(dir,{recursive:true,force:true});});
 const options={rootDir,dataDir,migrateLegacy:false};return{options,disk:start?createUserData(options):null,lock:path.join(dataDir,'config','user-data.lock'),migrationLock:path.join(dataDir,'config','migration.lock')};
}
const unavailable=code=>Object.assign(Error('Synthetic NAS lock access failure'),{code});
const snapshot=value=>({schemaVersion:1,profile:{id:'legacy',name:'Synthetic profile',createdAt:'2026-01-01T00:00:00.000Z'},entries:{'ielts52-study-timer-v1':value},session:{},databases:Object.entries(DATABASES).map(([name,store])=>({name,stores:[{name:store,rows:[]}]}))});

test('transient NAS errors in the shared lock check or exclusive open retry before one action runs',async t=>{
 for(const stage of ['check','open'])for(const code of ['EPERM','EACCES','EBUSY'])await t.test(stage+' '+code,async t=>{
  const f=fixture(t),lstat=fs.lstatSync,open=fs.openSync;let faults=0,runs=0;
  fs.lstatSync=function(file,...args){if(stage==='check'&&file===f.lock&&faults<2){faults++;throw unavailable(code);}return lstat.call(this,file,...args);};
  fs.openSync=function(file,flags,...args){if(stage==='open'&&file===f.lock&&flags==='wx'&&faults<2){faults++;throw unavailable(code);}return open.call(this,file,flags,...args);};
  try{
   assert.equal(await f.disk.withLock(async()=>{runs++;const owner=JSON.parse(fs.readFileSync(f.lock,'utf8'));assert.equal(owner.pid,process.pid);assert.equal(typeof owner.owner,'string');return 'saved once';}),'saved once');
   assert.equal(faults,2);assert.equal(runs,1);assert.equal(fs.existsSync(f.lock),false);
  }finally{fs.lstatSync=lstat;fs.openSync=open;}
 });
});

test('persistent denial reports a bounded busy error without opening or changing an existing foreign lock, then a new call can retry',async t=>{
 const f=fixture(t),foreign=JSON.stringify({pid:2147483647,hostname:'synthetic-other-host',owner:'foreign-owner'});fs.writeFileSync(f.lock,foreign);
 const lstat=fs.lstatSync,open=fs.openSync;let attempts=0,opens=0,runs=0;
 fs.lstatSync=function(file,...args){if(file===f.lock){attempts++;throw unavailable('EPERM');}return lstat.call(this,file,...args);};
 fs.openSync=function(file,flags,...args){if(file===f.lock&&flags==='wx')opens++;return open.call(this,file,flags,...args);};
 try{await assert.rejects(f.disk.withLock(()=>{runs++;}),error=>error.code==='USER_DATA_BUSY'&&error.status===423&&/稍后重试/.test(error.message));}
 finally{fs.lstatSync=lstat;fs.openSync=open;}
 assert.equal(attempts,100);assert.equal(opens,0);assert.equal(runs,0);assert.equal(fs.readFileSync(f.lock,'utf8'),foreign);
 fs.unlinkSync(f.lock);assert.equal(await f.disk.withLock(()=>{runs++;return 'retry completed';}),'retry completed');assert.equal(runs,1);
});

test('permission errors in the protected action propagate unchanged and never replay that action',async t=>{
 for(const code of ['EPERM','EACCES','EBUSY'])await t.test(code,async t=>{
  const f=fixture(t),error=unavailable(code);let runs=0;
  await assert.rejects(f.disk.withLock(()=>{runs++;throw error;}),actual=>actual===error);
  assert.equal(runs,1);assert.equal(fs.existsSync(f.lock),false);
  assert.equal(await f.disk.withLock(()=>{runs++;return 'next action';}),'next action');assert.equal(runs,2);
 });
});

test('a close failure does not replace a permission error from the protected action',async t=>{
 const f=fixture(t),open=fs.openSync,close=fs.closeSync,error=unavailable('EPERM');let fd,runs=0;
 fs.openSync=function(file,flags,...args){const result=open.call(this,file,flags,...args);if(file===f.lock&&flags==='wx')fd=result;return result;};
 fs.closeSync=function(value){const result=close.call(this,value);if(value===fd)throw unavailable('EIO');return result;};
 try{await assert.rejects(f.disk.withLock(()=>{runs++;throw error;}),actual=>actual===error);}
 finally{fs.openSync=open;fs.closeSync=close;}
 assert.equal(runs,1);assert.equal(fs.existsSync(f.lock),true,'an uncertain close must not unlink the lock');
});

test('two independent stores retain mutual exclusion after transient lock access failures',async t=>{
 const f=fixture(t),other=createUserData(f.options),lstat=fs.lstatSync;let faults=0,active=0,maximum=0,runs=0;
 fs.lstatSync=function(file,...args){if(file===f.lock&&faults<2){faults++;throw unavailable('EBUSY');}return lstat.call(this,file,...args);};
 const action=async()=>{runs++;active++;maximum=Math.max(maximum,active);try{await new Promise(resolve=>setTimeout(resolve,50));}finally{active--;}};
 try{await Promise.all([f.disk.withLock(action),other.withLock(action)]);}finally{fs.lstatSync=lstat;}
 assert.equal(faults,2);assert.equal(runs,2);assert.equal(maximum,1);assert.equal(fs.existsSync(f.lock),false);
});

test('concurrent synthetic snapshots still enforce revision CAS after a transient lock failure',async t=>{
 const f=fixture(t),other=createUserData(f.options),initial=snapshot('initial');await f.disk.putSnapshot('legacy',{expectedRevision:0,snapshot:initial});
 const lstat=fs.lstatSync;let faults=0;
 fs.lstatSync=function(file,...args){if(file===f.lock&&faults++===0)throw unavailable('EPERM');return lstat.call(this,file,...args);};
 let outcomes;try{outcomes=await Promise.allSettled([f.disk.putSnapshot('legacy',{expectedRevision:1,snapshot:snapshot('candidate-a')}),other.putSnapshot('legacy',{expectedRevision:1,snapshot:snapshot('candidate-b')})]);}finally{fs.lstatSync=lstat;}
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(outcomes.filter(x=>x.status==='rejected'&&x.reason.code==='USER_DATA_CONFLICT').length,1);
 const latest=await f.disk.getSnapshot('legacy');assert.equal(latest.revision,2);assert.ok(['candidate-a','candidate-b'].includes(latest.snapshot.entries['ielts52-study-timer-v1']));assert.deepEqual((await f.disk.getSnapshot('legacy',1)).snapshot,initial);
});

test('non-transient lock path errors propagate without retrying or executing the action',async t=>{
 const f=fixture(t),lstat=fs.lstatSync,error=unavailable('EIO');let attempts=0,runs=0;
 fs.lstatSync=function(file,...args){if(file===f.lock){attempts++;throw error;}return lstat.call(this,file,...args);};
 try{await assert.rejects(f.disk.withLock(()=>{runs++;}),actual=>actual===error);}finally{fs.lstatSync=lstat;}
 assert.equal(attempts,1);assert.equal(runs,0);
});

test('a lock owner initialization error is not retried and closes its descriptor without claiming an incomplete lock',async t=>{
 const f=fixture(t),open=fs.openSync,write=fs.writeFileSync,error=unavailable('EBUSY');let fd,opens=0,runs=0;
 fs.openSync=function(file,flags,...args){const result=open.call(this,file,flags,...args);if(file===f.lock&&flags==='wx'){fd=result;opens++;}return result;};
 fs.writeFileSync=function(file,...args){if(file===fd)throw error;return write.call(this,file,...args);};
 try{await assert.rejects(f.disk.withLock(()=>{runs++;}),actual=>actual===error);}
 finally{fs.openSync=open;fs.writeFileSync=write;}
 assert.equal(opens,1);assert.equal(runs,0);assert.throws(()=>fs.fstatSync(fd),e=>e.code==='EBADF');assert.equal(fs.readFileSync(f.lock,'utf8'),'');
});

test('startup migration retries the same transient lock path errors while preserving exclusive ownership',async t=>{
 for(const stage of ['check','open'])for(const code of ['EPERM','EACCES','EBUSY'])await t.test(stage+' '+code,t=>{
  const f=fixture(t,{start:false}),lstat=fs.lstatSync,open=fs.openSync;let faults=0,successfulOpens=0;
  fs.lstatSync=function(file,...args){if(stage==='check'&&file===f.migrationLock&&faults<2){faults++;throw unavailable(code);}return lstat.call(this,file,...args);};
  fs.openSync=function(file,flags,...args){if(file===f.migrationLock&&flags==='wx'){if(stage==='open'&&faults<2){faults++;throw unavailable(code);}successfulOpens++;}return open.call(this,file,flags,...args);};
  try{const disk=createUserData(f.options);assert.equal(disk.status().ok,true);assert.equal(faults,2);assert.equal(successfulOpens,1);assert.equal(fs.existsSync(f.migrationLock),false);}
  finally{fs.lstatSync=lstat;fs.openSync=open;}
 });
});

test('persistent migration lock denial is bounded, reports a retryable error and permits a later startup',t=>{
 const f=fixture(t,{start:false}),lstat=fs.lstatSync,open=fs.openSync;let attempts=0,opens=0;
 fs.lstatSync=function(file,...args){if(file===f.migrationLock){attempts++;throw unavailable('EACCES');}return lstat.call(this,file,...args);};
 fs.openSync=function(file,flags,...args){if(file===f.migrationLock&&flags==='wx')opens++;return open.call(this,file,flags,...args);};
 try{assert.throws(()=>createUserData(f.options),error=>error.code==='USER_DATA_MIGRATION_BUSY'&&error.status===423&&/稍后/.test(error.message));}
 finally{fs.lstatSync=lstat;fs.openSync=open;}
 assert.equal(attempts,100);assert.equal(opens,0);assert.equal(fs.existsSync(f.migrationLock),false);
 assert.equal(createUserData(f.options).status().ok,true);
});
