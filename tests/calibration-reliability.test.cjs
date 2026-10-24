'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const c=require('../server/calibration.cjs'),review=require('../server/review.cjs'),core=require('../assets/calibration-core.js'),{createServer}=require('../server/server.cjs');
const answer='I study English to understand different people and explain my ideas more clearly in everyday conversations. '.repeat(20);
function sample(id='a',extra={}){return {id,name:'private reference '+id,mode:'writing',task:'academic_task2',level:'B2',text:answer+(id==='a'?'':' I also read books.'),prompt:'Discuss how learning a language helps people communicate.',sourceKind:'user_authorized',rightsConfirmed:true,completeResponse:true,completePrompt:true,note:'用户持有原始评阅单；此单未由本应用核实。',reference:{overall:6.5,bands:{task:6,grammar:7}},...extra};}
function raw(value,bands=[6,6.5,7,7.5]){return {criteria:review.WRITING.map((id,i)=>({id,band:bands[i],evidence:[{quote:value.text.slice(0,25),comment:'可回查原文'}],comment:'训练观察',uncertainty:'模型估计'})),summary:'反馈',levelCheck:{meetsGoal:true,evidence:[{quote:value.text.slice(0,25),comment:'任务证据'}],gaps:[]}};}
function round(value,index,model,bands){return {...review.parse(JSON.stringify(raw(value,bands)),value,'',index),reviewer:{model,providerHost:'mock.example',promptVersion:review.PROMPT_VERSION,promptVariant:index===1?'initial':'adversarial'}};}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
async function fixture(t,upstream){const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ielts-calibration-reliability-')),server=createServer({dataDir:path.join(temp,'private-data'),materialMigration:false,budgetFilePath:path.join(temp,'budget.json'),fetchImpl:upstream});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>{server.close(r);server.closeAllConnections();});fs.rmSync(temp,{recursive:true,force:true});});return async(route,body,method)=>{const r=await fetch('http://127.0.0.1:'+server.address().port+route,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};}

test('official catalog contains factual scores, pages and hashes without redistributing answers or inventing dimensions',()=>{
 assert.deepEqual(c.CATALOG.samples.map(s=>s.reference.overall),[6.5,8.5,5.5,7.5]);assert.equal(c.CATALOG.source.sha256.length,64);
 for(const s of c.CATALOG.samples){assert.equal(s.text,undefined);assert.equal(s.prompt,undefined);assert.equal(s.textSha256.length,64);assert.equal(s.promptSha256.length,64);assert.deepEqual(s.reference.bands,{});assert.ok(s.responsePages.length&&s.commentPages.length);}
 assert.equal(c.textHash(' One\n “test” ’s '),c.textHash('One "test" \'s'));
 const forged=sample(c.CATALOG.samples[0].id,{sourceKind:'official_verified',sourceUrl:c.CATALOG.source.url,sourceDocumentSha256:c.CATALOG.source.sha256});assert.throws(()=>c.prepare({samples:[forged]}),e=>e.code==='CALIBRATION_HASH');
});
test('unknown dimensions, textual audio scores, duplicate content and fabricated reference fields are rejected',()=>{
 for(const reference of [{bands:{unknown:7}},{bands:{grammar:7.1}},{bands:{grammar:'7'}},{expectedBands:{task:7}}])assert.throws(()=>c.prepare({samples:[sample('a',{reference})]}),e=>e.code==='CALIBRATION_REFERENCE');
 assert.throws(()=>c.prepare({samples:[sample('a',{mode:'speaking_text',task:'part1',reference:{bands:{pronunciation:7}}})]}),e=>e.code==='CALIBRATION_AUDIO_REFERENCE');
 assert.throws(()=>c.prepare({samples:[sample(),sample('b',{text:answer})]}),e=>e.code==='CALIBRATION_DUPLICATE');
 const guard=c.prepare({useGuardrails:true});assert.equal(c.prepare({samples:guard.map(c.exportSample)}).length,3);
});
test('incomplete and legacy-unknown samples never contribute false calibration, even if a model returns numbers',()=>{
 for(const extra of [{completePrompt:false},{completeResponse:false},{note:''}]){const s=c.prepare({samples:[sample('a',extra)]})[0],result=review.combine([round(s.value,1,'a'),round(s.value,2,'b')],'a'),summary=c.summarize([{...s,result}]);assert.equal(summary.comparedCount,0);assert.equal(summary.missingCount,6);assert.ok(summary.rows.every(r=>r.predicted===null&&r.reason));}
 const s=c.prepare({samples:[sample()]})[0],item={...s,result:review.combine([round(s.value,1,'a'),round(s.value,2,'b')],'a')};delete item.eligibility;assert.equal(c.summarize([item]).comparedCount,0);
});
test('private Symbol permits verified complete short-response review; JSON flags and round-tripping cannot bypass ordinary limits',()=>{
 const short={mode:'writing',task:'academic_task2',level:'B2',prompt:'Discuss a useful daily habit.',text:'I read useful books every morning.',calibrationFullResponse:true},v=review.input(short);
 assert.ok(review.parse(JSON.stringify(raw(v)),v,'',1).criteria.every(x=>x.band===null));
 review.markVerifiedCalibration(v);assert.ok(review.parse(JSON.stringify(raw(v)),v,'',1).criteria.every(x=>typeof x.band==='number'));assert.match(review.messages(v,1)[0].content,/字数不足/);
 assert.ok(review.parse(JSON.stringify(raw(v)),review.input(JSON.parse(JSON.stringify(v))),'',1).criteria.every(x=>x.band===null));
 assert.ok(!JSON.stringify(v).includes('verified-calibration'));assert.equal(review.input({...short,VERIFIED_CALIBRATION:true}).calibrationFullResponse,undefined);
});
test('bias separates model, host, prompt role and reference trust; task means require every grounded dimension',()=>{
 const s=c.prepare({samples:[sample()]})[0],result=review.combine([round(s.value,1,'model-a',[6,6.5,7,7.5]),round(s.value,2,'model-b',[5,6,6,7])],'model-a'),summary=c.summarize([{...s,result}]);
 const a=summary.bias.find(b=>b.model==='model-a'&&b.criterion==='overall'),b=summary.bias.find(b=>b.model==='model-b'&&b.criterion==='overall');assert.equal(a.meanSignedBias,.25);assert.equal(a.meanAbsoluteError,.25);assert.equal(a.sampleCount,1);assert.equal(b.meanSignedBias,-.5);assert.equal(b.meanAbsoluteError,.5);
 assert.equal(summary.dimensionCoverage.find(r=>r.criterion==='lexical').referenceSamples,0);assert.equal(summary.dimensionCoverage.find(r=>r.criterion==='lexical').missingReferenceSamples,1);assert.ok(!summary.rows.some(r=>r.criterion==='lexical'));assert.equal(summary.disagreement.find(r=>r.criterion==='task').needsRetest,true);
 result.rounds[1].criteria.find(r=>r.id==='grammar').band=null;const missing=c.summarize([{...s,result}]);assert.equal(missing.rows.find(r=>r.round===2&&r.criterion==='overall').predicted,null);
});
test('failed and unattempted samples remain in denominators; sample order does not change the comparison set',()=>{
 const samples=c.prepare({samples:[sample(),sample('b')]}),first={...samples[0],result:review.combine([round(samples[0].value,1,'model-a'),{ok:false,round:2,error:{code:'OFFLINE',message:'网络失败'}}],'model-a')},report=c.buildReport(samples,[first],{modelPair:['model-a','model-b']});
 assert.equal(report.requestedCount,2);assert.equal(report.completedCount,0);assert.equal(report.items.length,2);assert.equal(report.items[1].result.status,'pending');assert.equal(report.summary.comparedCount,3);assert.equal(report.summary.missingCount,9);assert.equal(report.summary.dimensionCoverage.find(x=>x.criterion==='overall').missingPredictionSamples,2);assert.equal(c.buildReport([...samples].reverse(),[first]).benchmarkSetHash,report.benchmarkSetHash);
});
test('risk summary flags measured reference errors above 0.5 without inventing calibration offsets or accuracy from a small sample',()=>{
 const s=c.prepare({samples:[sample()]})[0],report=c.buildReport([s],[{...s,result:review.combine([round(s.value,1,'a',[4,4,4,4]),round(s.value,2,'b',[5,5,5,5])],'a')}]);assert.equal(report.summary.risk.hasMaterialBias,true);assert.match(report.summary.risk.message,/不能把当前模型分数直接作考试预测/);assert.match(report.summary.risk.message,/不能据此给AI统一加分或减分/);assert.equal(report.summary.risk.sampleCount,1);assert.equal(report.summary.risk.thresholdIsHeuristic,true);assert.equal(core.riskSummary({bias:[{count:1,meanAbsoluteError:.5}]}).hasMaterialBias,false);assert.equal(core.riskSummary({bias:[]}).status,'insufficient-evidence');assert.match(core.riskSummary({bias:[{count:1,meanAbsoluteError:0}]}).message,/仍不能证明评分准确/);
});
test('import parser rejects foreign formats and dangerous structures; compact reports preserve evidence links and comparison identity',()=>{
 assert.throws(()=>core.parseImport('{"format":"other","samples":[]}'));
 assert.throws(()=>core.parseImport('{"format":"ielts-calibration-samples","version":1,"samples":[{"__proto__":{}}]}'));
 assert.equal(core.parseImport(JSON.stringify({format:'ielts-calibration-samples',version:1,samples:[sample()]})).samples.length,1);
 const s=c.prepare({samples:[sample()]})[0],report=c.buildReport([s],[{...s,result:review.combine([round(s.value,1,'a'),round(s.value,2,'b')],'a')}]);report.items[0].sampleWorkId='work-sample-001';report.items[0].roundWorkIds=[{round:1,workId:'work-round-001'}];const compact=core.compact(report);assert.equal(compact.items[0].sampleWorkId,'work-sample-001');assert.equal(compact.items[0].roundWorkIds[0].workId,'work-round-001');assert.equal(compact.items[0].value,undefined);assert.equal(compact.items[0].result.rounds[0].criteria[0].evidence,undefined);assert.equal(compact.benchmarkSetHash,report.benchmarkSetHash);assert.equal(core.regression(compact,report).rows.length,8);
});
test('temporary model pair and reversed pair are blind, validated against current models, and never alter saved reviewer configuration',async t=>{
 const sent=[],api=await fixture(t,async(url,opts)=>{if(url.endsWith('/models'))return json({data:[{id:'model-a'},{id:'model-b'}]});const p=JSON.parse(opts.body);sent.push(p);const data=JSON.parse(p.messages[1].content);assert.equal(data.reference,undefined);assert.ok(!JSON.stringify(p.messages).includes('private reference'));return json({choices:[{message:{content:JSON.stringify(raw({text:data.learnerText}))}}]});});
 await api('/api/ai/connect',{baseUrl:'https://mock.example/v1',apiKey:'fake-private-key',preferredModel:'model-a'});await api('/api/ai/reviewer/configure',{usePrimaryConnection:true,model:'model-a'});const before=(await api('/api/ai/reviewer/status')).data;
 const validated=await api('/api/calibration/validate',{samples:[sample()]});assert.equal(validated.status,200);assert.equal(validated.data.metadata[0].eligibility.bandComparison,true);assert.equal(sent.length,0);const catalog=(await api('/api/calibration/benchmarks')).data;assert.equal(catalog.catalog.samples.length,4);assert.equal(catalog.schemaVersion,2);
 for(const pair of [['model-a','model-b'],['model-b','model-a']]){const r=await api('/api/calibration/run',{samples:[sample()],modelPair:pair});assert.equal(r.status,200);assert.equal(r.data.completedCount,1);assert.deepEqual(r.data.items[0].result.rounds.map(r=>r.reviewer.model),pair);assert.deepEqual(r.data.items[0].result.rounds.map(r=>r.reviewer.promptVariant),['initial','adversarial']);}
 assert.deepEqual(sent.map(p=>p.model),['model-a','model-b','model-b','model-a']);const callCount=sent.length;
 for(const pair of [[],['model-a'],['model-a','unknown'],['model-a','model-b','model-a'],'model-b'])assert.equal((await api('/api/calibration/run',{samples:[sample()],modelPair:pair})).status,400);
 assert.equal(sent.length,callCount);const after=(await api('/api/ai/reviewer/status')).data;assert.equal(after.model,before.model);assert.equal(after.distinctFromPrimary,before.distinctFromPrimary);assert.equal((await api('/api/ai/status')).data.model,'model-a');assert.ok(!JSON.stringify(after).includes('fake-private-key'));
 const short=sample('short',{text:'I read books.',calibrationFullResponse:true});const r=await api('/api/ai/review',short);assert.ok(r.data.rounds.every(round=>round.criteria.every(c=>c.band===null)));
});
test('a connection change during a batch stops later samples and attributes the failed round to the requested model',async t=>{
 let release,started,call=0;const blocked=new Promise(r=>release=r),begin=new Promise(r=>started=r);
 const api=await fixture(t,async(url,opts)=>{if(url.endsWith('/models'))return json({data:[{id:'model-a'},{id:'model-b'}]});const p=JSON.parse(opts.body),data=JSON.parse(p.messages[1].content);call++;if(call===2){started();await blocked;}return json({choices:[{message:{content:JSON.stringify(raw({text:data.learnerText}))}}]});});
 await api('/api/ai/connect',{baseUrl:'https://mock.example/v1',apiKey:'fake-batch-key',preferredModel:'model-a'});
 const pending=api('/api/calibration/run',{samples:[sample(),sample('b')],modelPair:['model-a','model-b']});await begin;await api('/api/ai/model',{model:'model-b'});release();const report=(await pending).data;
 assert.equal(call,2);assert.equal(report.items.length,2);assert.equal(report.items[0].result.status,'partial');assert.equal(report.items[1].result.status,'pending');assert.equal(report.completedCount,0);assert.equal(report.summary.rows.find(r=>r.sampleId==='a'&&r.round===2).model,'model-b');assert.ok(report.summary.rows.filter(r=>r.sampleId==='b').every(r=>r.predicted===null&&r.error===null));
});
