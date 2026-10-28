'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {createServer}=require('../server/server.cjs'),launcher=require('../tools/start-learning.cjs'),runtime=require('../server/runtime-version.cjs');
const secret='private-test-diagnostic-never-returned';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(read,accept,{timeout=3000}={}){const end=Date.now()+timeout;while(Date.now()<end){const value=await read();if(accept(value))return value;await wait(10);}throw Error('Timed out waiting for the synthetic fixture');}
async function fixture(t,vault,options={}){
 const tempRoot=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(tempRoot,'ielts-startup-test-'));
 fs.mkdirSync(path.join(root,'assets'));fs.mkdirSync(path.join(root,'server'));fs.writeFileSync(path.join(root,'VERSION'),'0.0.111\n');fs.writeFileSync(path.join(root,'今日学习.html'),'synthetic');
 const server=createServer({rootDir:root,dataDir:path.join(root,'isolated-user-data'),materialMigration:false,migrateLegacy:false,credentialVault:vault,fetchImpl:async()=>{throw Error('No real provider');},startupRetryBaseMs:80,startupRetryMaxMs:80,startupRequestWaitMs:30,...options});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 t.after(async()=>{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});const resolved=fs.realpathSync(root);assert.equal(path.dirname(resolved).toLowerCase(),tempRoot.toLowerCase());fs.rmSync(resolved,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 const api=async(endpoint,init)=>{const response=await fetch(base+endpoint,init),text=await response.text();return{status:response.status,text,json:JSON.parse(text)};};
 return{server,base,api};
}
function fakeVault(restore){let writes=0;return{restore,status:()=>({storage:'memory'}),handle:async(req,res,pathname)=>{if(pathname!=='/api/synthetic-write')return false;writes++;res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true}');return true;},get writes(){return writes;}};}
function requestWithHost(port,host){return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:'/api/health',headers:{host}},res=>{res.resume();res.once('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});}

test('startup restore is single-flight, health is safe, and blocked writes are never replayed',async t=>{
 const first=deferred(),second=deferred();let calls=0;
 const vault=fakeVault(()=>{calls++;return calls===1?first.promise:second.promise;});
 const f=await fixture(t,vault),health=await f.api('/api/health');
 assert.equal(health.status,200);assert.equal(health.json.ok,true);assert.equal(health.json.service,'ielts-learning-local');assert.equal(health.json.home,'/');assert.match(health.json.buildSignature,/^sha256:[a-f0-9]{64}$/);assert.equal(health.json.ready,false);assert.equal(health.json.startup.phase,'restoring');assert.equal(calls,1);
 assert.equal((await f.api('/api/health',{headers:{Origin:'https://foreign.example'}})).status,403);
 assert.equal(await requestWithHost(f.server.address().port,'foreign.example:'+f.server.address().port),403);
 const initial=await Promise.all(Array.from({length:12},()=>f.api('/api/synthetic-write',{method:'POST',body:'synthetic input'})));assert.ok(initial.every(v=>v.status===503&&v.json.error.code==='STARTUP_NOT_READY'));assert.equal(calls,1);assert.equal(vault.writes,0);
 first.reject(Object.assign(Error(secret),{code:'EPERM'}));
 const failed=await until(()=>f.api('/api/health'),v=>v.json.startup.phase==='retry-wait');
 assert.equal(failed.json.ready,false);assert.equal(failed.json.startup.retryable,true);assert.equal(failed.json.startup.code,'EPERM');assert.ok(!failed.text.includes(secret));
 await until(()=>Promise.resolve(calls),n=>n===2);
 const pending=await Promise.all(Array.from({length:12},()=>f.api('/api/synthetic-write',{method:'POST',body:'synthetic input'})));assert.ok(pending.every(v=>v.status===503));assert.equal(calls,2);assert.equal(vault.writes,0);
 second.resolve();const ready=await until(()=>f.api('/api/health'),v=>v.json.ready===true);assert.equal(ready.json.startup.phase,'ready');assert.equal(ready.json.startup.code,null);
 assert.equal(vault.writes,0,'recovery must not replay rejected requests');assert.equal((await f.api('/api/synthetic-write',{method:'POST',body:'new explicit request'})).status,200);assert.equal(vault.writes,1);
});

test('a request can restart a delayed transient restore after automatic retries are exhausted',async t=>{
 for(const code of ['USER_DATA_BUSY','USER_DATA_MIGRATION_BUSY','ETIMEDOUT']){
  let calls=0;const vault=fakeVault(()=>{calls++;if(calls===1)throw Object.assign(Error(secret),{code});});
  const f=await fixture(t,vault,{startupRetryBaseMs:20,startupRetryMaxMs:20,startupMaxAutomaticRetries:0});
  const failed=await until(()=>f.api('/api/health'),v=>v.json.startup.code===code);assert.equal(failed.json.startup.retryable,true);
  await wait(50);assert.equal(calls,1,'no background retry after the configured automatic limit');
  await Promise.all(Array.from({length:12},()=>f.api('/api/health')));const ready=await until(()=>f.api('/api/health'),v=>v.json.ready);assert.equal(ready.json.ready,true);assert.equal(calls,2);
 }
});

test('a business request may wait briefly for the current restore but executes only after success',async t=>{
 const pending=deferred();let calls=0;const vault=fakeVault(()=>{calls++;return pending.promise;});
 const f=await fixture(t,vault,{startupRequestWaitMs:500});const request=f.api('/api/synthetic-write',{method:'POST',body:'one original request'});
 await wait(30);assert.equal(calls,1);assert.equal(vault.writes,0);pending.resolve();
 assert.equal((await request).status,200);assert.equal(vault.writes,1,'the original request executes once, after restoration');
});

test('frequent health and business requests cannot accelerate a transient retry',async t=>{
 let calls=0;const vault=fakeVault(()=>{calls++;throw Object.assign(Error(secret),{code:'EACCES'});});
 const f=await fixture(t,vault,{startupRetryBaseMs:5000,startupRetryMaxMs:5000,startupMaxAutomaticRetries:0});
 const failed=await until(()=>f.api('/api/health'),v=>v.json.startup.phase==='retry-wait');assert.equal(failed.json.startup.code,'EACCES');
 const results=await Promise.all(Array.from({length:20},(_,i)=>i%2?f.api('/api/health'):f.api('/api/synthetic-write',{method:'POST'})));
 assert.ok(results.every(v=>v.status===200||v.status===503));assert.equal(calls,1);assert.equal(vault.writes,0);
});

test('unknown restore errors stay failed without retries or leaking diagnostics',async t=>{
 let calls=0;const vault=fakeVault(()=>{calls++;throw Object.assign(Error(secret),{code:'SECRET_INTERNAL_FAILURE'});});
 const f=await fixture(t,vault,{startupRetryBaseMs:20,startupRetryMaxMs:20});
 const health=await until(()=>f.api('/api/health'),v=>v.json.startup.phase==='failed');assert.equal(health.status,200);assert.equal(health.json.ready,false);assert.deepEqual(health.json.startup,{phase:'failed',retryable:false,code:'STARTUP_RESTORE_FAILED'});assert.ok(!health.text.includes(secret));assert.ok(!health.text.includes('SECRET_INTERNAL_FAILURE'));
 for(let n=0;n<5;n++){const blocked=await f.api('/api/synthetic-write',{method:'POST',body:'keep this original'});assert.equal(blocked.status,503);assert.equal(blocked.json.error.code,'STARTUP_RESTORE_FAILED');assert.ok(!blocked.text.includes(secret));await f.api('/api/health');}
 await wait(60);assert.equal(calls,1);assert.equal(vault.writes,0);
});

test('launcher recognizes verified starting instances while preserving older health responses',()=>{
 const expected=runtime.readProjectRuntime(),identity={ok:true,service:launcher.SERVICE,home:'/',...expected,instanceId:'11111111-1111-4111-a111-111111111111',startedAt:'2026-10-25T00:00:00.000Z',pid:123};
 assert.equal(launcher.classifyHealth(identity,expected).state,'ready');
 const status=launcher.classifyHealth({...identity,ready:false,startup:{phase:'retry-wait',retryable:true,code:'EPERM',message:secret}},expected);assert.equal(status.state,'starting');assert.deepEqual(status.startup,{phase:'retry-wait',retryable:true,code:'EPERM'});assert.ok(!JSON.stringify(status).includes(secret));
 assert.equal(launcher.classifyHealth({...identity,ready:false,buildSignature:'sha256:'+'0'.repeat(64)},expected).state,'stale');
 assert.equal(launcher.classifyHealth({...identity,ready:false,projectId:'sha256:'+'0'.repeat(64)},expected).state,'occupied');
 assert.equal(launcher.classifyHealth({...identity,ready:'false'},expected).state,'occupied');
});

test('launcher waits for the owning service, starts at most once and opens only after ready',async()=>{
 const starting={state:'starting',startup:{phase:'retry-wait',retryable:true,code:'EPERM'}},ready={state:'ready',version:'0.0.111'};
 let starts=0,opens=0,results=[starting,starting,ready];
 const reused=await launcher.launch({port:8765,probe:async()=>results.shift(),start:()=>{starts++;return{};},sleep:async()=>{},open:async()=>{opens++;}});assert.equal(reused.reused,true);assert.equal(starts,0);assert.equal(opens,1);
 starts=0;opens=0;results=[{state:'absent'},starting,ready];
 await launcher.launch({port:8765,probe:async()=>results.shift(),start:()=>{starts++;return{exited:true};},sleep:async()=>{},open:async()=>{opens++;}});assert.equal(starts,1);assert.equal(opens,1);
 starts=0;opens=0;const failed={state:'starting',startup:{phase:'failed',retryable:false,code:'STARTUP_RESTORE_FAILED'}};
 await assert.rejects(launcher.launch({port:8765,probe:async()=>failed,start:()=>{starts++;return{};},sleep:async()=>{},open:async()=>{opens++;}}),{code:'STARTUP_RESTORE_FAILED'});assert.equal(starts,0);assert.equal(opens,0);
 starts=0;opens=0;results=[{state:'absent'},starting,starting];
 await assert.rejects(launcher.launch({port:8765,maxPolls:2,probe:async()=>results.shift(),start:()=>{starts++;return{exited:false};},sleep:async()=>{},open:async()=>{opens++;}}),{code:'START_TIMEOUT'});assert.equal(starts,1);assert.equal(opens,0);
});
