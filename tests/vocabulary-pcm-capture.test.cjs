'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const Audio=require('../assets/speaking-audio.js'),Speaking=require('../assets/vocabulary-speaking.js'),tone=(n=16000)=>Float32Array.from({length:n},(_,i)=>.14*Math.sin(i*.13));
const settle=async()=>{for(let i=0;i<4;i++)await new Promise(setImmediate);};
function environment({worklet=true,rate=16000}={}){
 const env={nodes:[],contexts:[],timers:new Map(),nextTimer:0,stops:0,errors:[],blobs:[],stopEvents:0};
 class Context{constructor(){env.contexts.push(this);this.sampleRate=rate;this.state='suspended';this.destination={};if(worklet)this.audioWorklet={addModule:async url=>{env.moduleURL=url;}};}async resume(){this.state='running';}async close(){this.state='closed';}createMediaStreamSource(){return{connect(){},disconnect(){}};}createGain(){return{gain:{value:1},connect(){},disconnect(){}};}createScriptProcessor(){const node={connect(){},disconnect(){}};env.nodes.push(node);return node;}}
 class Offline{constructor(channels,length,rate){this.length=length;this.sampleRate=rate;}createBuffer(channels,n,rate){const data=new Float32Array(n);return{sampleRate:rate,getChannelData:()=>data};}createBufferSource(){const source={connect(){},start:()=>{this.source=source;}};return source;}async startRendering(){const original=this.source.buffer.getChannelData(0),output=new Float32Array(this.length);for(let i=0;i<output.length;i++)output[i]=original[Math.min(original.length-1,Math.floor(i*original.length/output.length))];return{getChannelData:()=>output};}}
 class Worklet{constructor(){env.nodes.push(this);this.port={onmessage:null,postMessage:msg=>{env.messages??=[];env.messages.push(msg);}};}connect(){}disconnect(){}}
 const host={AudioContext:Context,OfflineAudioContext:Offline,AudioWorkletNode:worklet?Worklet:undefined,Blob,setTimeout:fn=>{const id=++env.nextTimer;env.timers.set(id,fn);return id;},clearTimeout:id=>env.timers.delete(id)},stream={getTracks:()=>[{stop(){env.stops++;}}]};
 const attach=r=>{r.ondataavailable=e=>env.blobs.push(e.data);r.onerror=e=>env.errors.push(e.error);r.onstop=()=>{env.stopEvents++;};return r;};
 return Object.assign(env,{host,stream,async make(){env.recorder=attach(await Audio.createPCMRecorder(stream,{root:host}));return env.recorder;},samples(data){env.nodes.at(-1).port.onmessage?.({data:{type:'samples',samples:data}});},stopped(){env.nodes.at(-1).port.onmessage?.({data:{type:'stopped'}});}});
}
test('PCM recordings prepare without invoking a browser container decoder and restore to the same proof hash',async()=>{
 const wav=Audio.encodeWav(tone()),blob=new Blob([wav],{type:'audio/wav'}),host={IELTSSpeakingAudio:Audio,IELTSMediaLibrary:{base64:b=>Buffer.from(b).toString('base64')},crypto:crypto.webcrypto,AudioContext:class{constructor(){throw Error('Container decoding must not be called');}}};
 const first=await Speaking.prepareAudio(blob,{root:host}),again=await Speaking.prepareAudio(blob,{root:host});assert.equal(first.hash,again.hash);assert.equal(first.durationSeconds,1);assert.equal(first.nonSilent,true);const bytes=Buffer.from(first.audio,'base64');assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.readUInt32LE(24),16000);assert.equal(bytes.length,32044);
});
test('an undecodable old recording receives an actionable Chinese error and closes its decoder',async()=>{
 let closed=false;class Context{async decodeAudioData(){throw Error('Unable to decode audio data');}async close(){closed=true;}}
 await assert.rejects(Speaking.prepareAudio(new Blob(['broken webm']),{AudioContext:Context,OfflineAudioContext:class{},encodeWav:Audio.encodeWav,base64:()=>'',crypto:crypto.webcrypto}),e=>e.code==='VOCAB_AUDIO_DECODE_FAILED'&&/尚未提交阿里云/.test(e.message)&&/已完成/.test(e.message));assert.ok(closed);
});
test('silent and too-short PCM remain uncountable, with no dependency on codec support',async()=>{
 const opt={root:{IELTSSpeakingAudio:Audio},encodeWav:Audio.encodeWav,base64:b=>Buffer.from(b).toString('base64'),crypto:crypto.webcrypto};
 await assert.rejects(Speaking.prepareAudio(new Blob([Audio.encodeWav(tone(100))]),opt),/0.25至15秒/);await assert.rejects(Speaking.prepareAudio(new Blob([Audio.encodeWav(new Float32Array(16000))]),opt),/没有检测到足够清晰/);
});
test('malformed WAV length and wrong sample-rate headers are not accepted as canonical microphone PCM',()=>{
 const b=Audio.encodeWav(tone());assert.equal(Audio.decodePcmWav(b).samples.length,16000);assert.equal(Audio.decodePcmWav(b.slice(0,-2)),null);const wrong=b.slice();new DataView(wrong.buffer).setUint32(24,48000,true);assert.equal(Audio.decodePcmWav(wrong),null);
});
test('worklet recorder waits for the final flushed samples before producing one complete WAV',async()=>{
 const e=environment(),r=await e.make();r.start();e.samples(tone(4096));r.stop();assert.equal(r.state,'stopping');assert.equal(e.blobs.length,0);e.samples(tone(2048));e.stopped();await settle();assert.equal(e.blobs.length,1);assert.equal(e.stopEvents,1);assert.equal(Audio.decodePcmWav(await e.blobs[0].arrayBuffer()).samples.length,6144);assert.equal(e.contexts[0].state,'closed');assert.equal(e.timers.size,0);assert.ok(e.stops>0);
});
test('cancel discards audio and late worklet messages do not emit a recording',async()=>{
 const e=environment(),r=await e.make();r.start();e.samples(tone(4096));const late=e.nodes[0].port.onmessage;r.abort();late({data:{type:'stopped'}});await settle();assert.equal(e.blobs.length,0);assert.equal(e.stopEvents,0);assert.equal(e.contexts[0].state,'closed');
});
test('a missing final worklet response produces a bounded error instead of hanging',async()=>{
 const e=environment(),r=await e.make();r.start();r.stop();assert.equal(e.timers.size,1);[...e.timers.values()][0]();assert.equal(e.errors.length,1);assert.match(e.errors[0].message,/未能及时收齐/);assert.equal(e.blobs.length,0);assert.equal(e.contexts[0].state,'closed');
});
test('worklet startup failure cleans up its microphone before surfacing the failure',async()=>{
 const e=environment();e.host.AudioWorkletNode=class{constructor(){throw Error('Worklet unavailable');}};await assert.rejects(e.make(),/Worklet unavailable/);assert.equal(e.contexts[0].state,'closed');assert.ok(e.stops>0);
});
test('raw capture on a non-worklet browser creates WAV and never starts MediaRecorder',async()=>{
 const e=environment({worklet:false}),r=await e.make();r.start();e.nodes[0].onaudioprocess({inputBuffer:{getChannelData:()=>tone(16000)}});r.stop();assert.equal(e.blobs.length,0);e.nodes[0].onaudioprocess({inputBuffer:{getChannelData:()=>tone(2048)}});await settle();assert.equal(e.blobs.length,1);assert.equal(e.blobs[0].type,'audio/wav');assert.equal(Audio.decodePcmWav(await e.blobs[0].arrayBuffer()).samples.length,18048);
});
test('a hardware sample rate other than 16k is explicitly rendered to the service WAV rate',async()=>{
 const e=environment({worklet:false,rate:48000}),r=await e.make();r.start();e.nodes[0].onaudioprocess({inputBuffer:{getChannelData:()=>tone(48000)}});r.stop();e.nodes[0].onaudioprocess({inputBuffer:{getChannelData:()=>tone(2048)}});await settle();const pcm=Audio.decodePcmWav(await e.blobs[0].arrayBuffer());assert.equal(pcm.sampleRate,16000);assert.equal(pcm.samples.length,Math.round(50048/3));
});

test('abort closes a real pending factory context immediately, without waiting for its worklet module',async()=>{
 const e=environment(),Controller=e.host.AudioContext;let release;e.host.AudioContext=class extends Controller{constructor(...args){super(...args);this.audioWorklet.addModule=()=>new Promise(resolve=>{release=resolve;});}};const aborter=new AbortController(),promise=Audio.createPCMRecorder(e.stream,{root:e.host,signal:aborter.signal});await settle();assert.equal(e.contexts[0].state,'running');aborter.abort();assert.equal(e.contexts[0].state,'closed');assert.ok(e.stops>0);await assert.rejects(promise,/取消/);release();await settle();assert.equal(e.nodes.length,0);
});
test('startup is bounded when the audio context never resumes',async()=>{
 const e=environment(),Controller=e.host.AudioContext;e.host.AudioContext=class extends Controller{resume(){return new Promise(()=>{});}};const promise=Audio.createPCMRecorder(e.stream,{root:e.host});await settle();assert.equal(e.timers.size,1);[...e.timers.values()][0]();await assert.rejects(promise,/初始化超时/);assert.equal(e.contexts[0].state,'closed');assert.ok(e.stops>0);
});
test('abort during resampling suppresses both late PCM callbacks',async()=>{
 const e=environment({worklet:false,rate:48000}),Offline=e.host.OfflineAudioContext;let release;e.host.OfflineAudioContext=class extends Offline{async startRendering(){await new Promise(resolve=>{release=resolve;});return super.startRendering();}};const r=await e.make();r.start();e.nodes[0].onaudioprocess({inputBuffer:{getChannelData:()=>tone(48000)}});r.stop();e.nodes[0].onaudioprocess({inputBuffer:{getChannelData:()=>tone(2048)}});await settle();r.abort();release();await settle();assert.equal(e.blobs.length,0);assert.equal(e.stopEvents,0);
});
test('empty microphone capture fails rather than emitting a fake silent successful recording',async()=>{
 const e=environment(),r=await e.make();r.start();r.stop();e.stopped();await settle();assert.equal(e.blobs.length,0);assert.equal(e.errors.length,1);assert.match(e.errors[0].message,/没有收到声音数据/);
});
test('the real worklet implementation flushes its last partial block, averages channels, and emits no speaker sound',()=>{
 let Processor;const messages=[],port={postMessage:m=>messages.push(m)};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/pcm-capture-worklet.js'),'utf8'),{AudioWorkletProcessor:class{constructor(){this.port=port;}},sampleRate:16000,registerProcessor:(name,p)=>{assert.equal(name,'ielts-pcm-capture');Processor=p;},Float32Array,Number,Math});
 const p=new Processor();p.port.onmessage({data:{type:'start',maximumFrames:16000}});const outputs=[[new Float32Array(128)]];p.process([[new Float32Array(128).fill(.3),new Float32Array(128).fill(.1)]],outputs);p.port.onmessage({data:{type:'stop'}});assert.equal(messages.length,2);assert.equal(messages[0].samples.length,128);assert.ok(Math.abs(messages[0].samples[0]-.2)<1e-6);assert.equal(messages[1].type,'stopped');assert.ok(outputs[0][0].every(x=>x===0));assert.equal(p.process([]),false);
});
test('the real worklet enforces a finite capture length and stops exactly once',()=>{
 let Processor;const messages=[],port={postMessage:m=>messages.push(m)};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/pcm-capture-worklet.js'),'utf8'),{AudioWorkletProcessor:class{constructor(){this.port=port;}},sampleRate:16000,registerProcessor:(_,p)=>Processor=p,Float32Array,Number,Math});const p=new Processor();p.port.onmessage({data:{type:'start',maximumFrames:5000}});for(let i=0;i<100;i++)p.process([[new Float32Array(128).fill(.2)]]);p.port.onmessage({data:{type:'stop'}});assert.equal(messages.filter(x=>x.type==='stopped').length,1);assert.equal(messages.filter(x=>x.type==='samples').reduce((n,x)=>n+x.samples.length,0),5000);
});
