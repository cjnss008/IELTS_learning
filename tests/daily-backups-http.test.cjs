'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createServer}=require('../server/server.cjs');
const {DATABASES}=require('../server/user-data.cjs');
function snap(value){return {schemaVersion:1,profile:{id:'legacy',name:'隔离备份测试',createdAt:'2026-10-24T00:00:00.000Z'},entries:{'ielts40-translation-visible':value},session:{},databases:Object.entries(DATABASES).map(([name,store])=>({name,stores:[{name:store,rows:[]}]}))};}
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ielts-backup-http-')),rootDir=path.join(dir,'app'),dataDir=path.join(dir,'data');fs.mkdirSync(rootDir);fs.writeFileSync(path.join(rootDir,'VERSION'),'0.0.0');fs.writeFileSync(path.join(rootDir,'今日学习.html'),'<!doctype html><h1>Test</h1>');
 const server=createServer({rootDir,dataDir,materialMigration:false,migrateLegacy:false,restartOnRestore:true,fetchImpl:async()=>{throw Error('isolated upstream');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{let active=server;while(active.successor)active=active.successor;await new Promise(r=>{active.close(r);active.closeAllConnections();});fs.rmSync(dir,{recursive:true,force:true});});
 async function api(route,body,method=body?'POST':'GET',headers={}){const response=await fetch(base+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};}
 return {dir,rootDir,dataDir,server,base,api};
}
test('complete backup HTTP flow restarts services and fences stale browser revisions',async t=>{
 const {api}=await fixture(t);let r=await api('/api/user-data/profiles/legacy/snapshot',{expectedRevision:0,snapshot:snap('true'),activate:true},'PUT');assert.equal(r.status,200);
 const before=(await api('/api/health')).data;
 const list=(await api('/api/backups/daily')).data;
 r=await api('/api/backups/daily',{dayKey:list.serverDayKey,profileId:'legacy',completionId:'http-check'});assert.equal(r.status,200);const backup=r.data.backup;
 assert.ok(backup.sha256);assert.equal((await api('/api/backups/daily')).data.backups.length,1);
 r=await api('/api/user-data/profiles/legacy/snapshot',{expectedRevision:1,snapshot:snap('false'),activate:true},'PUT');assert.equal(r.status,200);
 r=await api('/api/backups/daily/restore',{dayKey:backup.dayKey,expectedManifestSha256:backup.sha256});assert.equal(r.status,200);assert.equal(r.data.automaticRestart,true);assert.equal(r.data.serviceInstanceId,before.serviceInstanceId);
 let health;
 for(let i=0;i<80;i++){try{health=(await api('/api/health')).data;if(health.serviceInstanceId!==before.serviceInstanceId&&!health.restoringBackup)break;}catch{}await new Promise(r=>setTimeout(r,25));}
 assert.ok(health?.serviceInstanceId);assert.notEqual(health.serviceInstanceId,before.serviceInstanceId);
 r=await api('/api/user-data/profiles/legacy/snapshot');assert.equal(r.status,200);assert.equal(r.data.snapshot.entries['ielts40-translation-visible'],'true');assert.ok(r.data.resetEpoch);
 const stale=await api('/api/user-data/profiles/legacy/snapshot',{expectedRevision:r.data.revision,snapshot:snap('false')},'PUT');assert.equal(stale.status,409);assert.equal(stale.data.error.code,'USER_DATA_RESET_REQUIRED');
});
test('backup routes reject cross-origin writes and keep secret archive paths private',async t=>{
 const {api,base,dataDir}=await fixture(t);assert.equal((await api('/api/backups/daily',{},'POST',{Origin:'https://unrelated.example'})).status,403);
 assert.equal((await api('/api/backups/daily/restore',{dayKey:'../../config',expectedManifestSha256:'0'.repeat(64)})).status,400);
 fs.mkdirSync(path.join(dataDir,'backups'),{recursive:true});fs.writeFileSync(path.join(dataDir,'backups','private.json'),'{"test-secret":"must stay private"}');
 assert.equal((await fetch(base+'/'+encodeURIComponent('用户数据')+'/backups/private.json')).status,403);
 assert.equal((await api('/api/health')).data.restoringBackup,false);
});
