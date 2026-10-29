'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const F=require('./family-lessons-v95-fixture.cjs');

// Expose only inside the VM so the production API and signed-release fixture
// remain unchanged. The runtime still uses its real owner and records proofs.
async function fixture(){
 const f=await F.mounted(F.packageData(),{dictionary:true});
 const listeners=new Map();
 f.win.addEventListener=(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);};
 f.win.removeEventListener=(name,fn)=>listeners.get(name)?.delete(fn);
 f.win.dispatchEvent=event=>{for(const fn of [...(listeners.get(event.type)||[])])fn(event);};
 const file=path.join(__dirname,'../assets/family-lesson-expansion-v95.js');
 const original=fs.readFileSync(file,'utf8'),marker='return Object.freeze({dispose,ensureReady,publicPlanningData';
 assert.equal(original.split(marker).length,2);
 vm.runInContext(original.replace(marker,'return Object.freeze({testVerifyAudio:verifyUnitAudio,testHasAudioProof:(records,key)=>!!fullSnapshots.get(records)?.audioUnits?.has(key),dispose,ensureReady,publicPlanningData'),f.context,{filename:'family-lesson-expansion-v95.js'});
 const api=f.win.IELTSFamilyLessonExpansionV95.runtime(),records=await api.prepareCourseRecords();
 const bytes=new Map(),audio=Array.from({length:30},(_,i)=>{const value=Buffer.from('synthetic-word-audio-'+i),src='audio/synthetic-'+i+'.wav';bytes.set('/'+src,value);return{src,bytes:value.length,sha256:crypto.createHash('sha256').update(value).digest('hex')};});
 return{...f,api,records,bytes,signed:{unit:{unitSha256:'b'.repeat(64)},audio},listeners};
}
function fakeAudio(f,{delay=25,hang=false,corrupt=false}={}){
 const prior=f.win.fetch;let active=0,peak=0,calls=0,aborted=0,totalWait=0;
 f.win.fetch=(url,options={})=>{
  if(!String(url).startsWith('/audio/'))return prior(url,options);
  assert.ok(options.signal,'every request has an abort signal');calls++;active++;peak=Math.max(peak,active);const started=performance.now();
  return new Promise((resolve,reject)=>{
   let timer,finished=false;
   const end=()=>{if(finished)return false;finished=true;active--;totalWait+=performance.now()-started;options.signal.removeEventListener('abort',onAbort);clearTimeout(timer);return true;};
   const onAbort=()=>{if(end()){aborted++;reject(Object.assign(Error('aborted'),{name:'AbortError'}));}};
   options.signal.addEventListener('abort',onAbort,{once:true});if(options.signal.aborted)return onAbort();
   if(!hang)timer=setTimeout(()=>{if(!end())return;let data=f.bytes.get(String(url));assert.ok(data);if(corrupt&&String(url)==='/audio/synthetic-0.wav')data=Buffer.alloc(data.length,88);resolve({ok:true,headers:{get:()=>String(data.length)},arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)});},corrupt&&String(url)==='/audio/synthetic-0.wav'?1:delay);
  });
 };
 return{get active(){return active;},get peak(){return peak;},get calls(){return calls;},get aborted(){return aborted;},get totalWait(){return totalWait;}};
}
const until=async predicate=>{for(let n=0;n<100&&!predicate();n++)await new Promise(resolve=>setImmediate(resolve));assert.ok(predicate(),'expected synthetic state was not reached');};

test('thirty slow audio reads use at most four concurrent requests and are all repeated on a new verification',async t=>{
 const f=await fixture(),meter=fakeAudio(f,{delay:30});f.context.setTimeout=setTimeout;f.context.clearTimeout=clearTimeout;
 const started=performance.now(),pending=f.api.testVerifyAudio(f.signed,f.records);await until(()=>meter.active===4);assert.equal(f.api.testHasAudioProof(f.records,f.signed.unit.unitSha256),false);await pending;const elapsed=performance.now()-started;
 assert.equal(meter.calls,30);assert.equal(meter.peak,4);assert.equal(meter.active,0);assert.equal(f.api.testHasAudioProof(f.records,f.signed.unit.unitSha256),true);
 assert.ok(elapsed<meter.totalWait*.7,`30 delayed reads took ${elapsed.toFixed(0)}ms; their observed individual waits totalled ${meter.totalWait.toFixed(0)}ms`);
 t.diagnostic(`30 synthetic 30ms audio responses: ${elapsed.toFixed(0)}ms elapsed; ${meter.totalWait.toFixed(0)}ms summed request waits; maximum 4 in flight`);
 await f.api.testVerifyAudio(f.signed,f.records);assert.equal(meter.calls,60,'a previously verified unit is not used to skip rechecking');
 assert.equal([...f.listeners.values()].reduce((sum,rows)=>sum+rows.size,0),1,'only the runtime pagehide listener remains');
});

test('a corrupt byte cancels other requests and revokes prior audio proof',async()=>{
 const f=await fixture();let meter=fakeAudio(f,{delay:1});await f.api.testVerifyAudio(f.signed,f.records);assert.equal(f.api.testHasAudioProof(f.records,f.signed.unit.unitSha256),true);
 meter=fakeAudio(f,{delay:30,corrupt:true});
 await assert.rejects(f.api.testVerifyAudio(f.signed,f.records),e=>e.reason==='family-vocabulary-audio-or-owner-changed');
 assert.equal(f.api.testHasAudioProof(f.records,f.signed.unit.unitSha256),false);assert.ok(meter.aborted>0);assert.equal(meter.active,0);
});

for(const event of ['ielts:profile-changed','pagehide','ielts:user-data-reset'])test(event+' cancels all hanging audio requests without granting a proof',async()=>{
 const f=await fixture(),meter=fakeAudio(f,{hang:true}),pending=f.api.testVerifyAudio(f.signed,f.records);await until(()=>meter.active===4);
 if(event==='ielts:profile-changed')f.win.IELTSProfiles.current=()=>({id:'another-synthetic-profile'});
 f.win.dispatchEvent({type:event});
 await assert.rejects(pending,e=>e.reason===(event==='pagehide'?'family-vocabulary-audio-cancelled':'family-vocabulary-audio-owner-changed'));
 assert.equal(meter.aborted,4);assert.equal(meter.active,0);assert.equal(f.api.testHasAudioProof(f.records,f.signed.unit.unitSha256),false);
});

test('late fetch responses after cancellation are not read',async()=>{
 const f=await fixture(),pendingResponses=[];let bodyReads=0;
 f.win.fetch=()=>new Promise(resolve=>pendingResponses.push(resolve));
 const pending=f.api.testVerifyAudio(f.signed,f.records);await until(()=>pendingResponses.length===4);f.win.dispatchEvent({type:'pagehide'});
 await assert.rejects(pending,e=>e.reason==='family-vocabulary-audio-cancelled');
 pendingResponses.forEach(resolve=>resolve({ok:true,headers:{get:()=>null},arrayBuffer:async()=>{bodyReads++;return new ArrayBuffer(1);}}));
 await new Promise(resolve=>setImmediate(resolve));assert.equal(bodyReads,0);
});

test('late response bodies after cancellation are not hashed',async()=>{
 const f=await fixture(),pendingBodies=[];let digests=0;const crypto=f.win.crypto;
 f.win.crypto={subtle:{digest:(...args)=>{digests++;return crypto.subtle.digest(...args);}}};
 f.win.fetch=url=>{const bytes=f.bytes.get(String(url));return Promise.resolve({ok:true,headers:{get:()=>String(bytes.length)},arrayBuffer:()=>new Promise(resolve=>pendingBodies.push(()=>resolve(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))))});};
 const pending=f.api.testVerifyAudio(f.signed,f.records);await until(()=>pendingBodies.length===4);f.win.dispatchEvent({type:'pagehide'});
 await assert.rejects(pending,e=>e.reason==='family-vocabulary-audio-cancelled');
 pendingBodies.forEach(resolve=>resolve());await new Promise(resolve=>setImmediate(resolve));assert.equal(digests,0);
});

test('a hung request times out, aborts its peers and can be retried with the same original records',async()=>{
 const f=await fixture(),timers=new Map();let id=0;
 f.context.setTimeout=(fn,ms)=>{assert.equal(ms,45000);const key=++id;timers.set(key,fn);return key;};f.context.clearTimeout=key=>timers.delete(key);
 const meter=fakeAudio(f,{hang:true}),pending=f.api.testVerifyAudio(f.signed,f.records);await until(()=>meter.active===4);assert.equal(timers.size,4);
 [...timers.values()][0]();await assert.rejects(pending,e=>e.reason==='family-vocabulary-audio-timeout'&&e.retryable===true&&/原稿保留/.test(e.message));
 await until(()=>timers.size===0);assert.equal(meter.aborted,4);assert.equal(meter.active,0);assert.equal(f.api.testHasAudioProof(f.records,f.signed.unit.unitSha256),false);
 fakeAudio(f,{delay:0});await f.api.testVerifyAudio(f.signed,f.records);assert.equal(f.api.testHasAudioProof(f.records,f.signed.unit.unitSha256),true);
});

test('the timeout also covers a response whose body stalls after its headers',async()=>{
 const f=await fixture(),timers=new Map();let id=0,bodies=0,aborted=0;
 f.context.setTimeout=(fn,ms)=>{assert.equal(ms,45000);const key=++id;timers.set(key,fn);return key;};f.context.clearTimeout=key=>timers.delete(key);
 f.win.fetch=(url,{signal})=>Promise.resolve({ok:true,headers:{get:()=>null},arrayBuffer:()=>new Promise((_,reject)=>{bodies++;signal.addEventListener('abort',()=>{aborted++;reject(Object.assign(Error('aborted'),{name:'AbortError'}));},{once:true});})});
 const pending=f.api.testVerifyAudio(f.signed,f.records);await until(()=>bodies===4);[...timers.values()][0]();
 await assert.rejects(pending,e=>e.reason==='family-vocabulary-audio-timeout'&&e.retryable===true);await until(()=>timers.size===0);
 assert.equal(aborted,4);assert.equal(f.api.testHasAudioProof(f.records,f.signed.unit.unitSha256),false);
});
