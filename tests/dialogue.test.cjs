'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const core=require('../assets/dialogue-core.js'),{createDialogueStore}=require('../server/dialogue.cjs'),{createServer}=require('../server/server.cjs');
function wav(frequency=220){const b=Buffer.alloc(44+32000);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(32000,40);for(let i=0;i<16000;i++)b.writeInt16LE(Math.round(4000*Math.sin(2*Math.PI*frequency*i/16000)),44+i*2);return b;}
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
const sse=v=>new Response('data: '+JSON.stringify({choices:[{delta:{content:JSON.stringify(v)},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
function localJSON(port,route,body,method){
 // Ephemeral test listeners can reuse a closed fixture's port. Each request
 // gets its own TCP connection: a global fetch pool must not carry a socket
 // across fixture shutdown. A transport failure is rejected, never retried.
 return new Promise((resolve,reject)=>{
  const payload=body?JSON.stringify(body):undefined,req=http.request({hostname:'127.0.0.1',port,path:route,method:method||(body?'POST':'GET'),agent:false,headers:{Connection:'close',...(payload?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}:{})}},res=>{
   const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.once('error',reject);res.once('aborted',()=>reject(Error('Local dialogue response aborted: '+route)));
   res.once('end',()=>{try{resolve({status:res.statusCode,data:JSON.parse(Buffer.concat(chunks).toString('utf8'))});}catch(error){reject(error);}});
  });
  req.once('error',error=>reject(Object.assign(Error('Local dialogue request failed: '+route+' ('+(error.code||'HTTP_ERROR')+')'),{cause:error})));req.end(payload);
 });
}
async function fixture(t,fetchImpl){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ielts-dialogue-')),server=createServer({materialMigration:false,dataDir:path.join(dir,'user-data'),fetchImpl,budgetFilePath:path.join(dir,'budget.json')});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>{server.close(r);server.closeAllConnections();});fs.rmSync(dir,{recursive:true,force:true});});const port=server.address().port;return(route,body,method)=>localJSON(port,route,body,method);}

test('dialogue HTTP fixtures use fresh sockets when a listener port is immediately reused, without retrying requests',async()=>{
 let port=0;
 for(let generation=1;generation<=8;generation++){
  const sockets=new Set();let requests=0;
  const server=http.createServer((req,res)=>{requests++;assert.equal(req.headers.connection,'close');req.resume();req.once('end',()=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({generation,request:requests}));});});server.on('connection',socket=>sockets.add(socket));
  await new Promise(r=>server.listen(port,'127.0.0.1',r));port=server.address().port;
  try{for(let request=1;request<=3;request++){const result=await localJSON(port,'/api/dialogue/start',{taskId:'intro'});assert.equal(result.status,200);assert.equal(result.data.generation,generation);assert.equal(result.data.request,request);}assert.equal(requests,3);assert.equal(sockets.size,3);}
  finally{await new Promise(r=>{server.close(r);server.closeAllConnections();});}
 }
});
test('unscripted task hints fade, actual latency is labelled and silence/reused audio cannot advance',()=>{
 const store=createDialogueStore(),s=store.start({taskId:'intro'});assert.equal(core.hintsFor(s.task,0).length,3);assert.equal(core.hintsFor(s.task,1).length,1);assert.equal(core.hintsFor(s.task,2).length,0);assert.equal(core.responseLatency('2026-01-01T00:00:00Z','2026-01-01T00:00:03Z'),3000);assert.equal(core.responseLatency('bad','bad'),null);
 const body={sessionId:s.id,sequence:0,mediaId:'work-12345678',audio:wav().toString('base64'),questionShownAt:'2026-01-01T00:00:00Z',recordingStartedAt:'2026-01-01T00:00:03Z'};
 const silent=wav();silent.fill(0,44);assert.throws(()=>store.prepare({...body,audio:silent.toString('base64')}),e=>e.code==='DIALOGUE_SILENCE');
 const p=store.prepare(body),next=store.complete(p,{transcript:'My name is Lin.',nextQuestion:'Where do you live?',focus:'地点',summary:''},{provider:'test',model:'one'});assert.equal(next.turns[0].responseLatencyMs,3000);assert.match(next.turns[0].latencySource,/not acoustic/);assert.equal(next.turns[0].source.verified,true);assert.equal(store.prepare(body).cached.turns.length,1);assert.throws(()=>store.prepare({...body,sequence:1,mediaId:'work-98765432'}),e=>e.code==='DIALOGUE_REUSED_AUDIO');assert.throws(()=>store.prepare({...body,sequence:2}),e=>e.code==='DIALOGUE_SEQUENCE');
 const restored=store.start({taskId:'intro',resume:{turns:next.turns,question:next.question}});assert.equal(restored.turns[0].source.verified,false);assert.equal(core.finishEligible({...restored,status:'complete'}),false);
});
test('Omni recorded-turn loop sends real audio, carries verified history, generates follow-ups and preserves completion without fake realtime',async t=>{
 const requests=[];const api=await fixture(t,async(url,opts)=>{assert.match(url,/\/chat\/completions$/);const body=JSON.parse(opts.body);requests.push(body);const user=JSON.parse(body.messages.at(-1).content[0].text);assert.ok(body.messages.at(-1).content.some(c=>c.type==='input_audio'));assert.equal(body.stream,true);return sse({transcript:['My name is Lin.','I live in a town.','I like tea.','Yes, I do.'][requests.length-1],nextQuestion:user.lastTurn?'':'Follow-up question '+requests.length+'?',summary:user.lastTurn?'用新情境再练一次自我介绍。':'',focus:'先直接回答问题'});});
 const config=await api('/api/omni/configure',{baseUrl:'https://omni.example/v1',apiKey:'fake-omni-key-only',model:'omni-model'});assert.equal(config.status,200);let state=(await api('/api/dialogue/start',{taskId:'intro'})).data;assert.equal(requests.length,0);
 for(let i=0;i<4;i++){const result=await api('/api/dialogue/turn',{sessionId:state.id,sequence:i,mediaId:'work-turn000'+i,audio:wav(220+i*50).toString('base64'),transport:'omni',hintsShown:i===0});assert.equal(result.status,200);state=result.data;assert.equal(state.turns.length,i+1);assert.equal(state.turns[i].source.mode,'audio-to-next-question');if(i){const context=JSON.parse(requests[i].messages.at(-1).content[0].text);assert.equal(context.previousTurns.length,i);assert.equal(context.previousTurns[0].answer,'My name is Lin.');}}
 assert.equal(state.status,'complete');assert.equal(state.question,'');assert.equal(core.finishEligible(state),true);const status=(await api('/api/dialogue/status')).data;assert.equal(status.realtimeAudio,false);assert.equal(status.mode,'recorded-turns');assert.ok(!JSON.stringify(state).includes('fake-omni-key-only'));
});
test('missing service keeps a recorded dialogue pending and ASR cannot be replaced with fabricated text or another recording',async t=>{
 let asrCalls=0,textCalls=0;const api=await fixture(t,async(url,opts)=>{if(url.endsWith('/models'))return json({data:[{id:'text-model'}]});const payload=JSON.parse(opts.body);if(payload.model==='asr-model'){asrCalls++;return json({choices:[{message:{content:'I live in a small town.'}}]});}textCalls++;const data=JSON.parse(payload.messages.at(-1).content);assert.equal(data.verifiedASRTranscript,'I live in a small town.');return json({choices:[{message:{content:JSON.stringify({transcript:'invented overwritten words',nextQuestion:'What do you like about your town?',summary:'',focus:'说明一个细节'})}}]});});
 const s=(await api('/api/dialogue/start',{taskId:'intro'})).data,body={sessionId:s.id,sequence:0,mediaId:'work-asr00000',audio:wav().toString('base64'),transport:'omni'};let r=await api('/api/dialogue/turn',body);assert.equal(r.status,409);assert.equal(r.data.error.code,'OMNI_NOT_CONFIGURED');r=await api('/api/dialogue/turn',{...body,transport:'asr-text',transcriptionEvidenceId:'fabricated',transcript:'fake'});assert.equal(r.status,409);assert.equal(textCalls,0);
 await api('/api/ai/connect',{baseUrl:'https://text.example/v1',apiKey:'fake-primary-key',preferredModel:'text-model'});await api('/api/transcription/configure',{provider:'qwen-asr',baseUrl:'https://asr.example/v1',apiKey:'fake-asr-key-only',model:'asr-model'});const asr=(await api('/api/transcription/transcribe',{audio:body.audio})).data;assert.equal(asrCalls,1);r=await api('/api/dialogue/turn',{...body,audio:wav(440).toString('base64'),transport:'asr-text',transcriptionEvidenceId:asr.evidenceId});assert.equal(r.status,409);assert.equal(textCalls,0);r=await api('/api/dialogue/turn',{...body,transport:'asr-text',transcriptionEvidenceId:asr.evidenceId});assert.equal(r.status,200);assert.equal(r.data.turns[0].transcript,'I live in a small town.');assert.equal(textCalls,1);
});
module.exports={wav};
