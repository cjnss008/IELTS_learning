'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server/server.cjs');
const KEY = 'fake-selection-key-for-tests-only';
const VOICE_KEY = 'FAKEVOICEKEY1234567890123456789012';
const TEXT = 'My name is Lily. I learn every day.';
function wav() {
  const b = Buffer.alloc(32044); b.write('RIFF'); b.writeUInt32LE(b.length - 8,4); b.write('WAVEfmt ',8); b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22); b.writeUInt32LE(16000,24); b.writeUInt32LE(32000,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(32000,40); return b.toString('base64');
}
async function setup(t, mode = 'normal', apiKey = KEY) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'ielts-selection-test-'));
  fs.mkdirSync(path.join(root,'private')); fs.writeFileSync(path.join(root,'private','secret.json'),'{"private":true}');
  fs.writeFileSync(path.join(root,'开始学习.html'),'<title>Mock course</title>');
  const calls = []; let release, entered, aborted;
  const fetchImpl = async (url, options) => {
    if (url.endsWith('/models')) return new Response(JSON.stringify({ data:[{id:'deepseek-flash'},{id:'unquoted-model'}] }));
    calls.push({ url, options, payload:typeof options.body === 'string' ? JSON.parse(options.body) : null });
    if (mode === 'pending') { entered?.(); await new Promise((resolve,reject) => { release = resolve; options.signal.addEventListener('abort',()=>{ aborted?.(); reject(options.signal.reason); },{once:true}); }); }
    if (mode === 'failure') throw Error(apiKey + ' must not leak');
    if (url.includes('/stt/')) return new Response(JSON.stringify({RecognitionStatus:'Success',NBest:[{Display:'Hello.',PronunciationAssessment:{AccuracyScore:80}}]}));
    return new Response(JSON.stringify({ choices:[{message:{content:'<script>alert(1)</script> 中文解释 ' + apiKey},finish_reason:mode==='truncated'?'length':'stop'}], usage:{prompt_tokens:100,completion_tokens:20} }));
  };
  const app = createServer({ rootDir:root, lessons:[{day:1,title:'Mock lesson',text:TEXT}], fetchImpl, coachTimeoutMs:1000 });
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  const base = 'http://127.0.0.1:'+app.address().port;
  t.after(async()=>{ await new Promise(resolve=>{app.close(resolve);app.closeAllConnections();}); if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('ielts-selection-test-'))fs.rmSync(root,{recursive:true,force:true}); });
  async function api(route, body, method, signal) { const response=await fetch(base+route,{method:method||(body===undefined?'GET':'POST'),headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal}); return {status:response.status,data:await response.json()}; }
  await api('/api/ai/connect',{baseUrl:'https://api.deepseek.com',apiKey,preferredModel:'deepseek-flash'});
  const lesson=(await api('/api/ai/selection/lesson/1')).data.lesson;
  const body={lessonId:1,version:lesson.version,start:0,end:15,selectedText:TEXT.slice(0,15),intent:'both',level:'A0'};
  return {root,app,base,api,body,calls,lesson,setMode(value){mode=value;},waitEntered(){return new Promise(resolve=>{entered=resolve;});},waitAborted(){return new Promise(resolve=>{aborted=resolve;});},release(){release();}};
}
test('selection HTTP returns full validated plaintext, prompt version, bounded followups and no credentials',async t=>{
  const f=await setup(t), status=(await f.api('/api/ai/status')).data;
  assert.equal(typeof status.connectionVersion,'string');
  assert.equal(status.selectionPromptVersion,f.lesson.promptVersion);
  for(const patch of [{version:'old'},{selectedText:'fabricated'},{contextEnd:TEXT.length}])assert.ok((await f.api('/api/ai/selection',{...f.body,...patch})).status>=400);
  assert.equal(f.calls.length,0);
  const first=await f.api('/api/ai/selection',f.body);
  assert.equal(first.status,200);assert.equal(first.data.promptVersion,f.lesson.promptVersion);assert.equal(first.data.feedbackFormat,'text');assert.equal(first.data.truncated,false);
  assert.ok(!JSON.stringify(first).includes(KEY));assert.ok(!first.data.feedback.includes('<'));
  assert.equal(first.data.selection.context,'My name is Lily. ');assert.equal(first.data.followupsRemaining,2);
  assert.equal(f.calls[0].payload.max_tokens,6000);assert.deepEqual(f.calls[0].payload.thinking,{type:'disabled'});
  assert.match(f.calls[0].payload.messages[0].content,/所有单词/);
  for(let i=0;i<2;i++){ const result=await f.api('/api/ai/selection',{threadId:first.data.threadId,question:'What does My mean?'});assert.equal(result.data.followupsRemaining,1-i);assert.deepEqual(result.data.selection,first.data.selection); }
  assert.equal((await f.api('/api/ai/selection',{threadId:first.data.threadId,question:'Again?'})).data.error.code,'FOLLOWUP_LIMIT');
  f.setMode('truncated');assert.equal((await f.api('/api/ai/selection',f.body)).data.truncated,true);
  const version=status.connectionVersion;await f.api('/api/ai/model',{model:'unquoted-model'});assert.notEqual((await f.api('/api/ai/status')).data.connectionVersion,version);
  assert.equal((await f.api('/api/ai/selection',{threadId:first.data.threadId,question:'Again?'})).data.error.code,'THREAD_EXPIRED');
  assert.equal((await f.api('/api/ai/selection',f.body)).status,200); // Unknown price is allowed by default.
  const ledger=fs.readFileSync(path.join(f.root,'private','budget-ledger.json'),'utf8');
  for(const value of [KEY,VOICE_KEY,TEXT,'What does My mean?','中文解释'])assert.ok(!ledger.includes(value));
});
test('shared budget covers all paid APIs, optional unknown prices and failures conservatively',async t=>{
  const f=await setup(t);
  await f.api('/api/budget/config',{enabled:true,monthlyLimitCny:0});
  assert.equal((await f.api('/api/ai/test',{})).data.error.code,'BUDGET_EXHAUSTED');
  assert.equal((await f.api('/api/ai/coach',{mode:'grammar',text:'This is a book.'})).data.error.code,'BUDGET_EXHAUSTED');
  assert.equal((await f.api('/api/ai/selection',f.body)).data.error.code,'BUDGET_EXHAUSTED');
  await f.api('/api/speech/configure',{endpoint:'https://mock.cognitiveservices.azure.com',apiKey:VOICE_KEY});
  assert.equal((await f.api('/api/speech/assess',{reference:'Hello world.',audio:wav()})).data.error.code,'PRICE_UNKNOWN');
  assert.equal(f.calls.length,0);
  assert.equal((await f.api('/api/budget/config',{textPrice:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash',inputPerMillionCny:2,outputPerMillionCny:8,source:KEY,confirmed:true}})).status,400);
  assert.equal((await f.api('/api/budget/config',{speechPrice:{endpoint:'https://mock.cognitiveservices.azure.com',perMinuteCny:.1,billingIncrementSeconds:1,source:VOICE_KEY,confirmed:true}})).status,400);
  await f.api('/api/budget/config',{enabled:false});
  assert.equal((await f.api('/api/ai/test',{})).status,200);
  assert.equal((await f.api('/api/ai/coach',{mode:'grammar',text:'This is a book.'})).status,200);
  assert.equal((await f.api('/api/ai/selection',f.body)).status,200);
  assert.equal((await f.api('/api/speech/assess',{reference:'Hello world.',audio:wav()})).status,200);
  f.setMode('failure');const failure=await f.api('/api/ai/selection',f.body);assert.equal(failure.status,502);assert.ok(!JSON.stringify(failure).includes(KEY));
  const budget=(await f.api('/api/budget/status')).data.budget;
  assert.equal(budget.enabled,false);assert.equal(budget.unpricedRequests,1);assert.ok(budget.uncertainCharges>=2);assert.equal(budget.reservedCny,0);
});
test('selection shares concurrency with AI test and coach; cancelling frees the slot',async t=>{
  const f=await setup(t,'pending'), entered=f.waitEntered(), aborted=f.waitAborted(), controller=new AbortController();
  const running=f.api('/api/ai/selection',f.body,undefined,controller.signal);await entered;
  assert.equal((await f.api('/api/ai/test',{})).data.error.code,'COACH_BUSY');
  assert.equal((await f.api('/api/ai/coach',{mode:'grammar',text:'Example.'})).data.error.code,'COACH_BUSY');
  controller.abort();await assert.rejects(running,{name:'AbortError'});await aborted;
  f.setMode('normal');assert.equal((await f.api('/api/ai/selection',f.body)).status,200);
  assert.equal((await f.api('/api/budget/status')).data.budget.reservedCny,0);
});
test('private ledger is denied by path, encoding, case and filesystem alias',async t=>{
  const f=await setup(t);
  const request=route=>new Promise((resolve,reject)=>{const req=http.get(f.base+route,res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);});
  for(const route of ['/private/secret.json','/PrIvAtE/secret.json','/%70rivate/secret.json','/private%2Fsecret.json','/%2e%2e/private/secret.json'])assert.equal(await request(route),403);
  try{fs.symlinkSync(path.join(f.root,'private'),path.join(f.root,'public-alias'),'junction');}catch(error){if(error.code==='EPERM')return t.skip('Filesystem does not allow test junctions');throw error;}
  assert.equal(await request('/public-alias/secret.json'),403);
});
test('JSON escaping cannot hide a credential in persistent budget quote fields',async t=>{
  for(const key of ['fake"quoted-test-key','fake\\backslash-test-key']){
    const f=await setup(t,'normal',key);
    const budgetBefore=(await f.api('/api/budget/status')).data;
    const ledgerPath=path.join(f.root,'private','budget-ledger.json');
    const before=fs.readFileSync(ledgerPath,'utf8');
    const textPrice={baseUrl:'https://api.deepseek.com',model:'deepseek-flash',inputPerMillionCny:2,outputPerMillionCny:8,confirmed:true,source:'Mock quote '+key};
    const speechPrice={endpoint:'https://mock.cognitiveservices.azure.com',perMinuteCny:.1,billingIncrementSeconds:1,confirmed:true,source:'Mock quote '+key};
    for(const body of [{textPrice},{speechPrice},{metadata:[{nested:key}]}]){
      const rejected=await f.api('/api/budget/config',body);
      assert.equal(rejected.status,400);assert.equal(rejected.data.error.code,'INVALID_PRICE');
      assert.ok(!JSON.stringify(rejected.data).includes(JSON.stringify(key).slice(1,-1)));
      assert.equal(fs.readFileSync(ledgerPath,'utf8'),before);
    }
    assert.deepEqual((await f.api('/api/budget/status')).data,budgetBefore);
    const feedback=(await f.api('/api/ai/selection',f.body)).data;
    assert.ok(feedback.feedback.includes('[已隐藏]'));
    for(const response of [feedback,(await f.api('/api/budget/status')).data,(await f.api('/api/ai/status')).data])assert.ok(!JSON.stringify(response).includes(JSON.stringify(key).slice(1,-1)));
    assert.ok(!fs.readFileSync(ledgerPath,'utf8').includes(JSON.stringify(key).slice(1,-1)));
  }
});
