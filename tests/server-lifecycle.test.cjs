'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),{EventEmitter,once}=require('node:events');
const {createServer,closeOnSignals}=require('../server/server.cjs');
const {createBudget}=require('../server/budget.cjs');
function statusRequest(base,agent=false){
 return new Promise((resolve,reject)=>{
  const request=http.get(base+'/api/budget/status',{agent,headers:{Accept:'application/json'}},response=>{
   let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);
   response.once('error',reject);response.once('aborted',()=>reject(Error('Local budget status response was aborted')));
   response.once('end',()=>{try{resolve({status:response.statusCode,data:JSON.parse(body)});}catch(error){reject(error);}});
  });
  request.once('error',error=>reject(new Error('Local budget status request failed: '+(error.code||error.message),{cause:error})));
  request.setTimeout(5000,()=>request.destroy(Error('Local budget status request timed out')));
 });
}
async function fixture(t,options={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ielts-server-lifecycle-')),rootDir=path.join(dir,'project');fs.mkdirSync(rootDir);
 const budgetDir=path.join(dir,'isolated'),budgetFilePath=options.explicit?path.join(dir,'preferred','custom-ledger.json'):undefined;
 const server=createServer({materialMigration:false,dataDir:path.join(rootDir,'user-data'),rootDir,budgetDir,...(budgetFilePath?{budgetFilePath}:{}),fetchImpl:async()=>{throw Error('External network forbidden in lifecycle test');}});
 const ready=once(server,'listening');server.listen(0,'127.0.0.1');await ready;
 async function close(){if(server.listening)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
 t.after(async()=>{await close();const resolved=path.resolve(dir);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('ielts-server-lifecycle-'));fs.rmSync(resolved,{recursive:true,force:true});});
 return{dir,rootDir,budgetDir,filePath:budgetFilePath||path.join(budgetDir,'budget-ledger.json'),server,base:'http://127.0.0.1:'+server.address().port,close};
}
test('budgetDir isolates old test callers and explicit budgetFilePath takes precedence',async t=>{
 for(const explicit of [false,true]){
  const f=await fixture(t,{explicit}),response=await statusRequest(f.base);assert.equal(response.status,200);assert.equal(response.data.budget.state,'ok');
  assert.ok(fs.existsSync(f.filePath));assert.equal(fs.existsSync(path.join(f.rootDir,'private')),false);
  if(explicit)assert.equal(fs.existsSync(f.budgetDir),false);
  await f.close();
 }
});
test('SIGINT and SIGTERM close the service once and release its owned budget lock',async t=>{
 const f=await fixture(t),agent=new http.Agent({keepAlive:true,maxSockets:1});t.after(()=>agent.destroy());const idle=once(agent,'free');await statusRequest(f.base,agent);await idle;const lock=path.join(path.dirname(f.filePath),'budget.lock');assert.ok(fs.existsSync(lock));assert.ok(Object.values(agent.freeSockets).some(sockets=>sockets.length));
 const runtime=new EventEmitter();closeOnSignals(f.server,runtime);const closed=once(f.server,'close');runtime.emit('SIGINT');runtime.emit('SIGTERM');await closed;
 assert.equal(fs.existsSync(lock),false);assert.equal(runtime.listenerCount('SIGINT'),0);assert.equal(runtime.listenerCount('SIGTERM'),0);
 const reopened=createBudget({filePath:f.filePath});assert.equal(reopened.status().state,'ok');reopened.close();
});
