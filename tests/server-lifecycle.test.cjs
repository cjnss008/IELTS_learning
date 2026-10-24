'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter,once}=require('node:events');
const {createServer,closeOnSignals}=require('../server/server.cjs');
const {createBudget}=require('../server/budget.cjs');
async function fixture(t,options={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ielts-server-lifecycle-')),rootDir=path.join(dir,'project');fs.mkdirSync(rootDir);
 const budgetDir=path.join(dir,'isolated'),budgetFilePath=options.explicit?path.join(dir,'preferred','custom-ledger.json'):undefined;
 const server=createServer({rootDir,budgetDir,...(budgetFilePath?{budgetFilePath}:{}),fetchImpl:async()=>{throw Error('External network forbidden in lifecycle test');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{if(server.listening)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});const resolved=path.resolve(dir);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('ielts-server-lifecycle-'));fs.rmSync(resolved,{recursive:true,force:true});});
 return{dir,rootDir,budgetDir,filePath:budgetFilePath||path.join(budgetDir,'budget-ledger.json'),server,base:'http://127.0.0.1:'+server.address().port};
}
test('budgetDir isolates old test callers and explicit budgetFilePath takes precedence',async t=>{
 for(const explicit of [false,true]){
  const f=await fixture(t,{explicit}),response=await fetch(f.base+'/api/budget/status');assert.equal(response.status,200);assert.equal((await response.json()).budget.state,'ok');
  assert.ok(fs.existsSync(f.filePath));assert.equal(fs.existsSync(path.join(f.rootDir,'private')),false);
  if(explicit)assert.equal(fs.existsSync(f.budgetDir),false);
 }
});
test('SIGINT and SIGTERM close the service once and release its owned budget lock',async t=>{
 const f=await fixture(t);await (await fetch(f.base+'/api/budget/status')).json();const lock=path.join(path.dirname(f.filePath),'budget.lock');assert.ok(fs.existsSync(lock));
 const runtime=new EventEmitter();closeOnSignals(f.server,runtime);const closed=once(f.server,'close');runtime.emit('SIGINT');runtime.emit('SIGTERM');await closed;
 assert.equal(fs.existsSync(lock),false);assert.equal(runtime.listenerCount('SIGINT'),0);assert.equal(runtime.listenerCount('SIGTERM'),0);
 const reopened=createBudget({filePath:f.filePath});assert.equal(reopened.status().state,'ok');reopened.close();
});
