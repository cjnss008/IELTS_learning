'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createUserData,DATABASES,ENTRY_KEYS}=require('../server/user-data.cjs');

function fixture(t,{start=true}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ielts-shared-lock-')),rootDir=path.join(dir,'app'),dataDir=path.join(dir,'personal');fs.mkdirSync(rootDir);
 t.after(()=>{if(!path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Unsafe fixture cleanup');fs.rmSync(dir,{recursive:true,force:true});});
 const options={rootDir,dataDir,migrateLegacy:false},disk=start?createUserData(options):null;
 return{dir,options,disk,lock:path.join(dataDir,'config','user-data.lock'),migrationLock:path.join(dataDir,'config','migration.lock')};
}
function snapshot(){return{schemaVersion:1,profile:{id:'legacy',name:'共享锁隔离测试',createdAt:'2026-01-01T00:00:00.000Z'},entries:{'ielts52-study-timer-v1':'{}'},session:{},databases:Object.entries(DATABASES).map(([name,store])=>({name,stores:[{name:store,rows:[]}]}))};}
function foreignOwner(){return{pid:2147483647,hostname:os.hostname()+'-other-computer',owner:'foreign-fixture-owner',createdAt:'2000-01-01T00:00:00.000Z'};}

test('a shared-folder save waits through empty or partial owner JSON until the other writer releases its lock',async t=>{
 for(const initial of ['', '{"owner":'])await t.test(initial?'partial JSON':'empty JSON',async t=>{
  const f=fixture(t);fs.writeFileSync(f.lock,initial);
  const initialised=setTimeout(()=>fs.writeFileSync(f.lock,JSON.stringify(foreignOwner())),25),released=setTimeout(()=>fs.unlinkSync(f.lock),80);
  t.after(()=>{clearTimeout(initialised);clearTimeout(released);});
  const saved=await f.disk.putSnapshot('legacy',{expectedRevision:0,snapshot:snapshot()});
  assert.equal(saved.revision,1);assert.equal((await f.disk.getSnapshot('legacy')).revision,1);assert.equal(fs.existsSync(f.lock),false);
 });
});

test('a lock released between EEXIST and reading its owner is retried without treating the profile as corrupt',async t=>{
 const f=fixture(t);fs.writeFileSync(f.lock,JSON.stringify(foreignOwner()));const read=fs.readFileSync;let vanished=false;
 fs.readFileSync=function(file,...args){if(file===f.lock&&!vanished){vanished=true;fs.unlinkSync(f.lock);}return read.call(this,file,...args);};
 try{assert.equal((await f.disk.putSnapshot('legacy',{expectedRevision:0,snapshot:snapshot()})).revision,1);}finally{fs.readFileSync=read;}
 assert.equal(vanished,true);assert.equal(fs.existsSync(f.lock),false);
});

test('an old foreign-computer lock is never stolen; timeout explains the shared save and preserves the indexed snapshot',async t=>{
 const f=fixture(t),first=snapshot();await f.disk.putSnapshot('legacy',{expectedRevision:0,snapshot:first});const owner=JSON.stringify(foreignOwner());fs.writeFileSync(f.lock,owner);
 const changed=snapshot();changed.entries['ielts52-course-player-v1']='pending browser draft';
 await assert.rejects(f.disk.putSnapshot('legacy',{expectedRevision:1,snapshot:changed}),error=>error.code==='USER_DATA_BUSY'&&error.status===423&&/另一台电脑.*共享用户目录.*稍后重试/.test(error.message));
 assert.equal(fs.readFileSync(f.lock,'utf8'),owner);const latest=await f.disk.getSnapshot('legacy');assert.equal(latest.revision,1);assert.deepEqual(latest.snapshot,first);
});

test('a positively identified dead local process lock can still be recovered after a stopped service',async t=>{
 const f=fixture(t),pid=2147483647;fs.writeFileSync(f.lock,JSON.stringify({...foreignOwner(),hostname:os.hostname(),pid}));const kill=process.kill;let probes=0;
 process.kill=function(target,signal){if(target===pid&&signal===0){probes++;throw Object.assign(Error('fixture process exited'),{code:'ESRCH'});}return kill.call(this,target,signal);};
 try{assert.equal((await f.disk.putSnapshot('legacy',{expectedRevision:0,snapshot:snapshot()})).revision,1);}finally{process.kill=kill;}
 assert.ok(probes>0);assert.equal(fs.existsSync(f.lock),false);
});

test('startup migration also waits for a partially initialised shared lock rather than reporting corrupt learner records',async t=>{
 const {Worker}=require('node:worker_threads'),f=fixture(t,{start:false});fs.mkdirSync(path.dirname(f.migrationLock),{recursive:true});fs.writeFileSync(f.migrationLock,'{"pid":');
 const worker=new Worker("const fs=require('node:fs'),{parentPort,workerData}=require('node:worker_threads');parentPort.postMessage('ready');setTimeout(()=>fs.writeFileSync(workerData.file,JSON.stringify(workerData.owner)),25);setTimeout(()=>fs.unlinkSync(workerData.file),80);",{eval:true,workerData:{file:f.migrationLock,owner:foreignOwner()}});
 const ended=new Promise((resolve,reject)=>{worker.once('exit',code=>code===0?resolve():reject(Error('Fixture lock owner failed')));worker.once('error',reject);});t.after(()=>worker.terminate());
 await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});
 const disk=createUserData(f.options);await ended;assert.equal(disk.status().ok,true);assert.equal(fs.existsSync(f.migrationLock),false);
});

test('status advertises the loaded persistence protocol and exact supported entry keys without removing prior fields',async t=>{
 const f=fixture(t),status=f.disk.status();assert.equal(status.persistenceProtocol,2);assert.deepEqual(status.supportedEntryKeys,[...ENTRY_KEYS]);assert.equal(new Set(status.supportedEntryKeys).size,status.supportedEntryKeys.length);assert.ok(status.supportedEntryKeys.includes('ielts52-study-timer-v1'));
 for(const field of ['ok','path','configPath','materialsPath','profiles','activeProfileId','migration','materialMigration','limits','warning','credentialScope'])assert.ok(Object.hasOwn(status,field),field);
 assert.equal((await f.disk.putSnapshot('legacy',{expectedRevision:0,snapshot:snapshot()})).revision,1);
});
