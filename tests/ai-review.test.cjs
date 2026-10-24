'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const review=require('../server/review.cjs'),{createServer}=require('../server/server.cjs');
const KEY='fake-review-key-"-\\-only';
test('cancelled review cannot start a second round after a late upstream result',async t=>{
 let calls=0,release,started;const ready=new Promise(r=>started=r);
 const cacheDir=fs.mkdtempSync(path.join(os.tmpdir(),'ielts-review-cancel-'));
 const server=createServer({budgetFilePath:path.join(cacheDir,'budget-ledger.json'),fetchImpl:async(url)=>{
  if(url.endsWith('/models'))return response({data:[{id:'mock-model'}]});
  calls++;started();await new Promise(r=>release=r);
  return response({choices:[{message:{content:JSON.stringify(rawReview('I like learning. '.repeat(100)))}}]});
 }});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{release?.();await new Promise(r=>{server.close(r);server.closeAllConnections();});if(path.dirname(cacheDir)===os.tmpdir())fs.rmSync(cacheDir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 await fetch(base+'/api/ai/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseUrl:'https://example.test/v1',apiKey:KEY,preferredModel:'mock-model'})});
 const abort=new AbortController();
 const pending=fetch(base+'/api/ai/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'writing',text:'I like learning. '.repeat(100),prompt:'Discuss learning.',task:'academic_task2',level:'B2'}),signal:abort.signal});
 await ready;abort.abort();await assert.rejects(pending);
 await new Promise(r=>setTimeout(r,20));release();await new Promise(r=>setTimeout(r,30));assert.equal(calls,1);
});
function response(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});}
function rawReview(text,band=7){return {criteria:['task','coherence','lexical','grammar','fluency','pronunciation'].map(id=>({id,band,evidence:[{quote:text.slice(0,15),comment:'原稿证据'}],comment:'检查<标签> '+KEY,uncertainty:'AI估计'})),summary:'ROUND-ONE-PRIVATE-RESULT',corrections:[{original:text.slice(0,10),revised:'A correction',reason:'中文理由'},{original:'invented quotation',revised:'no',reason:'no'}],levelCheck:{meetsGoal:true,evidence:[{quote:text.slice(0,15),comment:'满足具体题目目标'}],gaps:[]}};}
async function fixture(t,fetchImpl){const budgetDir=fs.mkdtempSync(path.join(os.tmpdir(),'ielts-review-'));const server=createServer({fetchImpl,budgetFilePath:path.join(budgetDir,'budget-ledger.json')});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>{server.close(r);server.closeAllConnections();});if(path.dirname(budgetDir)===os.tmpdir())fs.rmSync(budgetDir,{recursive:true,force:true});});const base='http://127.0.0.1:'+server.address().port;return async(route,body,method)=>{const r=await fetch(base+route,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};}
test('review validates exact learner evidence, foundation goals, uncertainty and decoded credential redaction',()=>{const value=review.input({mode:'writing',text:'I like learning. '.repeat(90),task:'academic_task2',prompt:'Discuss learning.',level:'B2'});const raw=rawReview(value.text);raw.criteria.find(c=>c.id==='lexical').evidence=[{quote:'invented quotation',comment:'fake'}];const parsed=review.parse(JSON.stringify(raw),value,KEY,1);assert.equal(parsed.criteria[0].band,7);assert.equal(parsed.criteria[2].band,null);assert.equal(parsed.corrections.length,1);assert.ok(!JSON.stringify(parsed).includes(KEY));assert.ok(!parsed.criteria[0].comment.includes('<'));const foundation={...value,task:'foundation',level:'A0'};const f=review.parse(JSON.stringify(raw),foundation,KEY,1);assert.ok(f.criteria.every(c=>c.band===null));assert.equal(f.levelCheck.meetsGoal,true);raw.levelCheck.evidence=[{quote:'invented quotation'}];assert.equal(review.parse(JSON.stringify(raw),foundation,KEY,1).levelCheck.meetsGoal,null);const spoken=review.parse(JSON.stringify(raw),{...value,mode:'speaking_audio',task:'part2',audioEvidence:{kind:'pronunciation'}},KEY,1);for(const id of ['fluency','pronunciation'])assert.equal(spoken.criteria.find(c=>c.id===id).band,null);assert.throws(()=>review.parse('{}',value,KEY,1));});
test('foundation and generic goals can pass without assigning a comparable Band',()=>{
 const assessment=require('../assets/assessment-core.js'),now=Date.now(),text='I am a student. I like English.';
 for(const task of ['foundation','generic']){
  const value=review.input({mode:'writing',text,task,prompt:'Introduce yourself in two sentences.',level:'A0'});
  const rounds=[1,2].map(n=>review.parse(JSON.stringify(rawReview(text)),value,KEY,n));
  const combined=review.combine(rounds,'mock');
  assert.ok(rounds.every(r=>r.criteria.every(c=>c.band===null)));
  assert.equal(combined.requiresRetest,false);
  const material={id:'intro',version:'1',skill:'writing',pool:'gate',source:{verification:'reviewed'},estimatedMinutes:5,minWords:5};
  const record={id:'intro-record',materialId:'intro',materialVersion:'1',exposure:'unseen',assistance:{hint:false,answer:false,ai:false},startedAt:new Date(now-60000).toISOString(),submittedAt:new Date(now).toISOString(),activeSeconds:60,elapsedSeconds:60,answer:JSON.stringify({schema:1,mode:'assessment',exposureAtStart:'unseen',text}),evaluation:{feedback:JSON.stringify(combined)}};
  assert.equal(assessment.evidenceFor(record,material,{now}).pass,true);
  for(const meetsGoal of [false,null]){
   const failing=structuredClone(rounds);failing[1].levelCheck.meetsGoal=meetsGoal;
   assert.equal(review.combine(failing,'mock').requiresRetest,true);
  }
  const ungrounded=rawReview(text);ungrounded.levelCheck.evidence=[{quote:'invented quotation'}];
  assert.equal(review.combine([rounds[0],review.parse(JSON.stringify(ungrounded),value,KEY,2)],'mock').requiresRetest,true);
  assert.equal(review.combine([rounds[0],{ok:false,round:2}],'mock').requiresRetest,true);
 }
 const academic=review.input({mode:'writing',text,task:'academic_task2',prompt:'Discuss learning.',level:'B2'});
 assert.equal(review.combine([1,2].map(n=>review.parse(JSON.stringify(rawReview(text)),academic,KEY,n)),'mock').requiresRetest,true);
 const speaking=review.input({mode:'speaking_text',text:'I like learning. '.repeat(30),task:'full_test',prompt:'Discuss learning.',level:'B2'});
 assert.equal(review.combine([1,2].map(n=>review.parse(JSON.stringify(rawReview(speaking.text)),speaking,KEY,n)),'mock').requiresRetest,true);
});
test('review endpoints make two blind independent requests and keep failures pending without inventing score',async t=>{let calls=0,failSecond=false;const prompts=[];const text='I learn English every day because it helps me talk to people. '.repeat(28);const api=await fixture(t,async(url,opts)=>{if(url.endsWith('/models'))return response({data:[{id:'deepseek-flash'}]});calls++;const body=JSON.parse(opts.body);prompts.push(body);assert.equal(opts.redirect,'error');assert.equal(body.response_format.type,'json_object');assert.equal(body.thinking.type,'disabled');if(failSecond&&calls%2===0)return response({private:KEY},500);return response({choices:[{message:{content:JSON.stringify(rawReview(text,calls%2?7:6))}}]});});const input={mode:'writing',text,prompt:'Discuss language learning.',task:'academic_task2',level:'B2'};let result=await api('/api/ai/review',input);assert.equal(result.data.status,'pending');assert.equal(calls,0);assert.equal(result.data.rounds[0].error.code,'NOT_CONNECTED');await api('/api/ai/connect',{baseUrl:'https://api.deepseek.com',apiKey:KEY,preferredModel:'deepseek-flash'});result=await api('/api/ai/review',input);assert.equal(result.data.status,'complete');assert.equal(calls,2);assert.ok(result.data.comparison.every(c=>c.difference===1&&c.needsRetest));assert.equal(prompts[0].messages.length,2);assert.equal(prompts[1].messages.length,2);assert.equal(prompts[0].messages[1].content,prompts[1].messages[1].content);assert.ok(!JSON.stringify(prompts[1]).includes('ROUND-ONE-PRIVATE-RESULT'));assert.ok(!JSON.stringify(result.data).includes(KEY));failSecond=true;result=await api('/api/ai/review',input);assert.equal(result.data.status,'partial');assert.equal(result.data.rounds[1].ok,false);result=await api('/api/ai/review',{...input,mode:'speaking_audio',task:'part2',evidenceId:'client-invented',audioEvidence:{score:99}});assert.equal(result.status,409);assert.equal(result.data.error.code,'AUDIO_EVIDENCE_REQUIRED');});
