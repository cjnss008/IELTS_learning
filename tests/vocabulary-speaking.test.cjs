 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const Speaking=require('../assets/vocabulary-speaking.js');
function environment(){
 const env={entries:new Map(),events:{},attempts:[],saved:[],mistakes:[],requests:[],timers:new Map(),clearedTimers:[],pendingStops:[],nextTimer:0,sample:'voice-one',silent:false,network:false,incomplete:false,low:false,profile:'legacy',next:0};
 const library={async create(meta,blob){const work={...meta,id:'work-recording-'+String(++env.next).padStart(8,'0'),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),blob,version:1};env.entries.set(work.id,work);return work;},async get(id){return env.entries.get(id);},async update(id,patch){Object.assign(env.entries.get(id),patch);return env.entries.get(id);}};
 class Recorder{static isTypeSupported(){return true;}constructor(){env.recorder=this;this.state='inactive';this.mimeType='audio/webm';}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:new Blob([env.sample],{type:'audio/webm'})});if(env.deferStops)env.pendingStops.push(()=>this.onstop());else Promise.resolve().then(()=>this.onstop());}}
 const host={navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){env.stopped=true;}}]})}},MediaRecorder:Recorder,IELTSProfiles:{current:()=>({id:env.profile})},IELTSMistakes:{captureOral:async(items,context)=>env.mistakes.push({items,context}),recordOralEvidence:async()=>{}},addEventListener:(key,fn)=>(env.events[key]||=[]).push(fn),removeEventListener(){},setTimeout:fn=>{const id=++env.nextTimer;env.timers.set(id,fn);return id;},clearTimeout:id=>{env.clearedTimers.push(id);env.timers.delete(id);}};
 const prepare=async blob=>{const text=await blob.text();return{audio:Buffer.from(text).toString('base64'),durationSeconds:1,rms:.05,peak:.4,voicedSeconds:.5,nonSilent:!env.silent,hash:crypto.createHash('sha256').update(text).digest('hex')};};
 const fetch=async(url,options)=>{env.requests.push({url,body:JSON.parse(options.body)});if(env.network)throw Error('network unavailable');const reference=JSON.parse(options.body).reference;return{ok:true,json:async()=>({ok:true,provider:'Alibaba oral assessment',evidenceId:'evidence-'+env.requests.length,result:{text:reference,accuracy:env.low?20:90,fluency:env.incomplete?null:90,completeness:95,words:[]}})};};
 const make=(overrides={})=>Speaking.create({root:host,library,prepareAudio:prepare,fetch,onSaved:async work=>env.saved.push(work.id),onAttempt:async proof=>env.attempts.push(proof),...overrides});
 env.host=host;env.make=make;env.prepare=prepare;env.fetch=fetch;env.controller=make();env.context={materialId:'w01-read-1-vocabulary',dayNumber:1,wordIndex:0,trial:1,level:'A0',returnUrl:'学习课程.html?day=1'};return env;
}

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
const settle=async()=>{for(let i=0;i<6;i++)await new Promise(setImmediate);};
test('non-silence analysis rejects silence, tiny clips and weak signal without treating playback as a spoken attempt',()=>{
 assert.equal(Speaking.activity(new Float32Array(16000)).nonSilent,false);assert.equal(Speaking.activity(new Float32Array(16000).fill(.0001)).nonSilent,false);assert.equal(Speaking.activity(new Float32Array(1600).fill(.1)).nonSilent,false);
 const speech=Float32Array.from({length:16000},(_,i)=>Math.sin(i*.13)*.08);assert.equal(Speaking.activity(speech).nonSilent,true);
});
test('mic start alone does not count; stopping saves original audio then submits only the professional endpoint',async()=>{
 const env=environment();await env.controller.start('hello',env.context);assert.equal(env.attempts.length,0);assert.equal(env.saved.length,0);assert.equal(env.requests.length,0);
 const proof=await env.controller.stop();assert.equal(env.saved.length,1);assert.equal(env.attempts.length,1);assert.equal(proof.reference,'hello');assert.equal(proof.nonSilent,true);assert.equal(proof.verified,true);assert.equal(proof.passed,true);assert.equal(env.requests[0].url,'/api/oral/assess');assert.equal(env.requests[0].body.audio,Buffer.from('voice-one').toString('base64'));assert.equal(env.requests.length,1);
 const work=env.entries.get(proof.workId);assert.equal(await work.blob.text(),'voice-one');assert.equal(work.diagnosis.pcmHash,proof.hash);assert.equal(work.evidenceId,proof.evidenceId);env.controller.destroy();
});
test('low professional scores count the real attempt and capture the correct word in the unified mistake book',async()=>{
 const env=environment();env.low=true;await env.controller.start('hello',env.context);const proof=await env.controller.stop();assert.equal(proof.passed,false);assert.equal(env.attempts.length,1);assert.equal(env.mistakes.length,1);assert.equal(env.mistakes[0].context.reference,'hello');assert.equal(env.mistakes[0].context.source,'vocabulary-speaking');assert.equal(env.mistakes[0].context.workId,proof.workId);assert.equal(env.mistakes[0].context.media.length,1);env.controller.destroy();
});
test('silence, incomplete professional evidence and network failure cannot advance the three recordings',async()=>{
 const silent=environment();silent.silent=true;await silent.controller.start('hello',silent.context);assert.equal(await silent.controller.stop(),null);assert.equal(silent.attempts.length,0);assert.equal(silent.saved.length,0);assert.equal(silent.requests.length,0);silent.controller.destroy();
 const bad=environment();bad.incomplete=true;await bad.controller.start('hello',bad.context);assert.equal(await bad.controller.stop(),null);assert.equal(bad.attempts.length,0);assert.equal(bad.saved.length,1);bad.controller.destroy();
 const network=environment();network.network=true;await network.controller.start('hello',network.context);assert.equal(await network.controller.stop(),null);assert.equal(network.attempts.length,0);assert.equal(network.saved.length,1);assert.match(network.controller.getState().message,/network/);network.network=false;const proof=await network.controller.retry(network.saved[0],{...network.context,word:'hello'});assert.equal(proof.workId,network.saved[0]);assert.equal(network.saved.length,1);assert.equal(network.attempts.length,1);network.controller.destroy();
});
test('the same decoded audio cannot masquerade as a second recording and three captures have independent work/evidence IDs',async()=>{
 const env=environment();await env.controller.start('hello',env.context);await env.controller.stop();await env.controller.start('hello',{...env.context,trial:2});assert.equal(await env.controller.stop(),null);assert.equal(env.attempts.length,1);assert.equal(env.saved.length,1);
 for(let trial=2;trial<=3;trial++){env.sample='fresh-voice-'+trial;await env.controller.start('hello',{...env.context,trial});await env.controller.stop();}
 assert.equal(env.attempts.length,3);for(const key of ['workId','hash','evidenceId'])assert.equal(new Set(env.attempts.map(proof=>proof[key])).size,3);env.controller.destroy();
});
test('archive restoration rechecks the actual blob, word/material/profile and persisted professional hash without making a new request',async()=>{
 const env=environment();await env.controller.start('hello',env.context);const original=await env.controller.stop();const next=env.make(),calls=env.requests.length;const restored=await next.restore(original.workId,{...env.context,word:'hello'});assert.equal(restored.workId,original.workId);assert.equal(env.requests.length,calls);await assert.rejects(next.restore(original.workId,{...env.context,word:'student'}),/不匹配/);
 env.entries.get(original.workId).blob=new Blob(['tampered audio'],{type:'audio/webm'});await assert.rejects(next.restore(original.workId,{...env.context,word:'hello'}),/尚无可核对/);next.destroy();env.controller.destroy();
});
test('profile switching during microphone acquisition cannot create a work in another profile',async()=>{
 const env=environment();await env.controller.start('hello',env.context);env.profile='p-another-profile';for(const fn of env.events['ielts:profile-changed'])fn();await Promise.resolve();await Promise.resolve();assert.equal(env.saved.length,0);assert.equal(env.attempts.length,0);assert.equal(env.stopped,true);
});


test('a profile change while the microphone prompt is pending stops the received stream and never saves it',async()=>{
 const env=environment();let release,stopped=false;env.host.navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{release=resolve;});const starting=env.controller.start('hello',env.context);env.profile='p-another-profile';for(const fn of env.events['ielts:profile-changed'])fn();release({getTracks:()=>[{stop(){stopped=true;}}]});await assert.rejects(starting,/档案已切换/);assert.equal(stopped,true);assert.equal(env.saved.length,0);assert.equal(env.attempts.length,0);
});
test('a failed mistake-book write cannot become counted merely by restoring the saved professional result',async()=>{
 const env=environment();env.low=true;env.host.IELTSMistakes.captureOral=async()=>{throw Error('mistake write failed');};await env.controller.start('hello',env.context);assert.equal(await env.controller.stop(),null);assert.equal(env.attempts.length,0);assert.equal(env.saved.length,1);const other=env.make();await assert.rejects(other.restore(env.saved[0],{...env.context,word:'hello'}),/尚无可核对/);other.destroy();env.controller.destroy();
});


test('pagehide cancels the microphone and pending reading without producing an assessment or count',async()=>{
 const env=environment();await env.controller.start('hello',env.context);for(const fn of env.events.pagehide)fn();await Promise.resolve();await Promise.resolve();assert.equal(env.stopped,true);assert.equal(env.requests.length,0);assert.equal(env.attempts.length,0);
});


test('the app refuses replaying an old recording into an active microphone capture',async()=>{
 const env=environment();await env.controller.start('hello',env.context);await assert.rejects(env.controller.play('work-any-old-recording'),/先结束当前麦克风录音/);env.controller.cancel();await Promise.resolve();assert.equal(env.attempts.length,0);assert.equal(env.requests.length,0);env.controller.destroy();
});

test('cancelled audio preparation cannot replace a new capture phase or resolve its completion',async()=>{
 const env=environment(),waiting=deferred();env.controller.destroy();
 const controller=env.make({prepareAudio:async blob=>{await waiting.promise;return env.prepare(blob);}});
 await controller.start('hello',env.context);const oldCompletion=controller.stop();await settle();assert.equal(controller.getState().phase,'saving');
 controller.cancel('练习已暂停');assert.equal(await oldCompletion,null);env.sample='fresh-student';await controller.start('student',{...env.context,wordIndex:1});
 const activeRecorder=env.recorder,activeTimer=env.nextTimer;waiting.resolve();await settle();
 assert.equal(controller.getState().phase,'recording');assert.equal(controller.getState().busy,true);assert.equal(controller.getState().context.word,'student');assert.equal(activeRecorder.state,'recording');assert.ok(env.timers.has(activeTimer));assert.ok(!env.clearedTimers.includes(activeTimer));assert.equal(env.attempts.length,0);assert.equal(env.requests.length,0);
 const proof=await controller.stop();assert.equal(proof.reference,'student');assert.equal(proof.wordIndex,1);assert.equal(env.attempts.length,1);assert.equal(env.requests.length,1);controller.destroy();
});

test('a delayed old recorder stop and error cannot clear the new recorder or its timer',async()=>{
 const env=environment();env.deferStops=true;await env.controller.start('hello',env.context);const oldRecorder=env.recorder;env.controller.cancel('练习已暂停');assert.equal(env.pendingStops.length,1);
 env.sample='fresh-student';await env.controller.start('student',{...env.context,wordIndex:1});const activeRecorder=env.recorder,activeTimer=env.nextTimer;
 oldRecorder.onerror();await env.pendingStops.shift()();await settle();
 assert.equal(env.controller.getState().phase,'recording');assert.equal(activeRecorder.state,'recording');assert.ok(env.timers.has(activeTimer));assert.ok(!env.clearedTimers.includes(activeTimer));assert.equal(env.attempts.length,0);
 const completion=env.controller.stop();assert.equal(activeRecorder.state,'inactive');assert.equal(env.pendingStops.length,1);await env.pendingStops.shift()();const proof=await completion;assert.equal(proof.reference,'student');assert.equal(env.attempts.length,1);env.controller.destroy();
});

test('late cancelled professional assessment and its cleanup leave the new capture active',async()=>{
 const env=environment(),waiting=deferred();env.controller.destroy();
 const controller=env.make({fetch:async(url,options)=>{const response=await env.fetch(url,options);await waiting.promise;return response;}});
 await controller.start('hello',env.context);controller.stop();await settle();assert.equal(controller.getState().phase,'assessing');assert.equal(env.saved.length,1);
 controller.cancel('练习已暂停');env.sample='fresh-student';await controller.start('student',{...env.context,wordIndex:1});const activeTimer=env.nextTimer;
 waiting.resolve();await settle();assert.equal(controller.getState().phase,'recording');assert.equal(controller.getState().busy,true);assert.equal(env.recorder.state,'recording');assert.ok(env.timers.has(activeTimer));assert.ok(!env.clearedTimers.includes(activeTimer));assert.equal(env.attempts.length,0);
 const proof=await controller.stop();assert.equal(proof.reference,'student');assert.equal(env.attempts.length,1);controller.destroy();
});

test('a late cancelled microphone permission stops only its own stream after a new recording starts',async()=>{
 const env=environment(),waiting=deferred();let calls=0;const oldTrack={stopped:false,stop(){this.stopped=true;}},activeTrack={stopped:false,stop(){this.stopped=true;}};
 env.host.navigator.mediaDevices.getUserMedia=()=>++calls===1?waiting.promise:Promise.resolve({getTracks:()=>[activeTrack]});
 const starting=env.controller.start('hello',env.context);env.controller.cancel('练习已暂停');await env.controller.start('student',{...env.context,wordIndex:1});
 waiting.resolve({getTracks:()=>[oldTrack]});await assert.rejects(starting,/录音练习或学习档案已切换/);assert.equal(oldTrack.stopped,true);assert.equal(activeTrack.stopped,false);assert.equal(env.controller.getState().phase,'recording');assert.equal(env.recorder.state,'recording');env.controller.destroy();
});
