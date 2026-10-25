'use strict';
// Entire test content below is SYNTHETIC QA, never a user/examiner training result.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const c=require('../server/calibration.cjs'),importer=require('../tools/import-calibration.cjs'),validator=require('../tools/validate-calibration-references.cjs');
const registration=require('../calibration/reference-preregistration-v60.json'),catalog=require('../calibration/official-sample-index.json');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ielts-SIMULATED-reference-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function synthetic(){
 const source={title:'SIMULATED official source fixture A',url:'https://ielts.org/SIMULATED-a.pdf',sha256:digest('SIMULATED PDF A'),copyright:'SIMULATED QA',rightsUrl:'https://ielts.org/legal/ielts-copyright-and-trade-mark-statement',referenceScope:'SIMULATED task-only fixture',transcriptionProtocol:'SIMULATED QA, no copyrighted/user text'},other={...source,title:'SIMULATED official source fixture B',url:'https://www.cambridgeenglish.org/SIMULATED-b.pdf',sha256:digest('SIMULATED PDF B')};
 const a={id:'SIMULATED-old',name:'SIMULATED old',mode:'writing',task:'academic_task2',level:'B2',questionPages:[1],responsePages:[2],commentPages:[3],textSha256:c.textHash('SIMULATED QA answer A. '.repeat(90)),promptSha256:c.textHash('SIMULATED QA complete prompt A.'),reference:{overall:6.5,bands:{}}},b={...a,id:'SIMULATED-new',name:'SIMULATED new',textSha256:c.textHash('SIMULATED QA answer B. '.repeat(90)),promptSha256:c.textHash('SIMULATED QA complete prompt B.'),reference:{overall:7,bands:{}}};
 const index={id:'ielts-academic-2023-local-v1',verifiedAt:'2026-10-25',source,samples:[a]},raw=(row,src,text,prompt)=>({id:row.id,name:row.name,mode:row.mode,task:row.task,level:row.level,text,prompt,sourceKind:'official_verified',sourceUrl:src.url,sourceDocumentSha256:src.sha256,rightsConfirmed:true,completeResponse:true,completePrompt:true,reference:row.reference,note:'SIMULATED QA only'});
 return {index,other,a,b,rawA:raw(a,source,'SIMULATED QA answer A. '.repeat(90),'SIMULATED QA complete prompt A.'),rawB:raw(b,other,'SIMULATED QA answer B. '.repeat(90),'SIMULATED QA complete prompt B.')};
}
function loadWithIndex(index){const file=path.resolve(__dirname,'../server/calibration.cjs'),local=createRequire(file),module={exports:{}};new Function('require','module','exports',fs.readFileSync(file,'utf8'))(name=>name==='../calibration/official-sample-index.json'?index:local(name),module,module.exports);return module.exports;}
function multi(f){return {...f.index,id:'future-directory-revision',verifiedAt:'2030-01-01',sources:{old:{...f.index.source,id:'old',publicationFamily:'SIMULATED family A'},new:{...f.other,id:'new',publicationFamily:'SIMULATED family B'}},samples:[{...f.a,sourceId:'old',verificationVersion:f.index.id,verifiedAt:f.index.verifiedAt,evaluationSet:'development'},{...f.b,sourceId:'new',verificationVersion:'SIMULATED-new-v1',verifiedAt:'2026-10-25',evaluationSet:'holdout'}]};}

test('catalog freezes 4 development / 6 new holdout across 2 documents, 2 families, 3 prompts without publishing full text',()=>{
 assert.deepEqual(validator.validateCatalog(),registration.expected);assert.deepEqual(catalog.samples.slice(0,4).map(s=>s.reference.overall),[6.5,8.5,5.5,7.5]);
 assert.ok(catalog.samples.every(s=>s.text===undefined&&s.prompt===undefined&&Object.keys(s.reference.bands).length===0));
 assert.deepEqual(catalog.samples.filter(s=>s.evaluationSet==='holdout').map(s=>s.reference.overall),[5,7,6,4,5.5,7.5]);
});

test('metadata validator rejects source swaps, fake new families for same PDF, chart omission and post-registration score edits',()=>{
 for(const change of [i=>{i.samples[4].sourceId='missing';},i=>{i.sources['cambridge-ucles-2009-task2'].sha256=i.sources['ielts-computer-writing-samples'].sha256;},i=>{i.samples[6].questionSourceIds=[];},i=>{i.samples[4].reference.overall=7.5;},i=>{i.sources['ielts-computer-writing-samples'].questionSources.school.promptSha256='a'.repeat(64);},i=>{i.samples[0].verificationVersion='new-directory-id';}]){const copy=structuredClone(catalog);change(copy);assert.throws(()=>validator.validateCatalog(copy,registration));}
});

test('public legacy source and original row fields stay byte-identical in JSON identity when directory expands',()=>{
 const f=synthetic(),before=loadWithIndex(f.index).prepare({samples:[f.rawA]})[0],index=multi(f),after=loadWithIndex(index).prepare({samples:[f.rawA]})[0];
 assert.equal(after.sha256,before.sha256);assert.deepEqual(after.provenance,before.provenance);assert.equal(after.provenance.indexVersion,f.index.id);assert.equal(after.provenance.verifiedAt,f.index.verifiedAt);
 delete index.samples[0].verificationVersion;assert.notEqual(loadWithIndex(index).prepare({samples:[f.rawA]})[0].sha256,before.sha256,'version pin prevents otherwise observable stored-identity churn');
});

test('new official samples are bound to their own source URL/PDF/text/prompt and task-only reference, never the legacy default',()=>{
 const f=synthetic(),scoped=loadWithIndex(multi(f)),s=scoped.prepare({samples:[f.rawB]})[0];assert.equal(s.provenance.sourceDocumentSha256,f.other.sha256);assert.equal(s.provenance.attribution,'SIMULATED QA');
 for(const extra of [{sourceUrl:f.index.source.url},{sourceDocumentSha256:f.index.source.sha256},{text:f.rawB.text+' changed'},{prompt:'partial'},{reference:{overall:8,bands:{}}},{reference:{overall:7,bands:{grammar:7}}}])assert.throws(()=>scoped.prepare({samples:[{...f.rawB,...extra}]}));
 const unknown=multi(f);unknown.samples[1].sourceId='missing';assert.throws(()=>loadWithIndex(unknown).prepare({samples:[f.rawB]}),e=>e.code==='CALIBRATION_HASH');
});

test('development/holdout and publication fields are metadata, do not inflate content or alter stored sample hashes',()=>{
 const f=synthetic(),scoped=loadWithIndex(multi(f)),s=scoped.prepare({samples:[f.rawB]})[0],meta=scoped.itemMetadata(s);assert.equal(meta.referenceSet,'holdout');assert.equal(meta.sourceId,'new');assert.equal(meta.publicationFamily,'SIMULATED family B');assert.equal(meta.sha256,s.sha256);assert.equal(s.referenceSet,undefined);
 const dup=multi(f);dup.samples.push({...dup.samples[1],id:'SIMULATED-renamed'});assert.throws(()=>loadWithIndex(dup).prepare({samples:[f.rawB,{...f.rawB,id:'SIMULATED-renamed'}]}),e=>e.code==='CALIBRATION_DUPLICATE');
});

test('import arguments reject missing values, duplicate flags and ambiguous one-PDF/multi-PDF modes',()=>{
 for(const argv of [['--input'],['--input','--output','x'],['--source-pdf','a','--source-pdfs','b'],['--catalog','--catalog'],['--unknown']])assert.throws(()=>importer.args(argv));
 assert.deepEqual(importer.args(['--input','a','--source-pdfs','b','--output','c']),{'--input':'a','--source-pdfs':'b','--output':'c'});
 assert.throws(()=>validator.parseArgs(['--chart','a']));assert.throws(()=>validator.parseArgs(['--input','--chart','a']));
});

test('one PDF cannot claim a multi-source batch; per-source files resolve relative to explicit manifest and all bytes must match',t=>{
 const dir=temp(t),f=synthetic(),index=multi(f),input={samples:[f.rawA,f.rawB]},a=path.join(dir,'a.pdf'),b=path.join(dir,'b.pdf'),map=path.join(dir,'pdfs.json');fs.writeFileSync(a,'SIMULATED PDF A');fs.writeFileSync(b,'SIMULATED PDF B');
 assert.deepEqual(importer.verifySourcePdfs(input,{},index),{verified:false,sourceIds:[]});assert.throws(()=>importer.verifySourcePdfs(input,{'--source-pdf':a},index),/多个原件来源/);
 fs.writeFileSync(map,JSON.stringify({old:'a.pdf',new:'b.pdf'}));assert.deepEqual(importer.verifySourcePdfs(input,{'--source-pdfs':map},index),{verified:true,sourceIds:['old','new']});
 fs.writeFileSync(map,JSON.stringify({old:'a.pdf'}));assert.throws(()=>importer.verifySourcePdfs(input,{'--source-pdfs':map},index),/缺少来源/);
 fs.writeFileSync(map,JSON.stringify({old:'a.pdf',new:'a.pdf'}));assert.throws(()=>importer.verifySourcePdfs(input,{'--source-pdfs':map},index),/哈希与索引不符/);
 fs.writeFileSync(map,JSON.stringify({old:'a.pdf',new:'b.pdf',unselected:'never-read.txt'}));assert.throws(()=>importer.verifySourcePdfs(input,{'--source-pdfs':map},index),/只能包含本批选中来源/);
});

test('single legacy PDF remains supported and an unknown registered-source reference never falls back to it',t=>{
 const dir=temp(t),f=synthetic(),a=path.join(dir,'a.pdf');fs.writeFileSync(a,'SIMULATED PDF A');assert.equal(importer.verifySourcePdfs({samples:[f.rawA]},{'--source-pdf':a},f.index).verified,true);
 const index=multi(f);index.samples[1].sourceId='unknown';assert.throws(()=>importer.resolveSource(index.samples[1],index),/来源未在索引/);assert.throws(()=>importer.verifySourcePdfs({samples:[f.rawB]},{'--source-pdf':a},index));
});

test('CLI keeps full output private and refuses to overwrite an existing file',t=>{
 const dir=temp(t),input=path.join(dir,'input.json'),output=path.join(dir,'private.json'),sample={id:'SIMULATED-user',mode:'writing',task:'foundation',level:'A0',text:'SIMULATED QA sentence.',prompt:'Write one sentence.',sourceKind:'user_authorized',rightsConfirmed:true,reference:{meetsGoal:true}};fs.writeFileSync(input,JSON.stringify({format:'ielts-calibration-samples',version:1,samples:[sample]}));
 const original=console.log;console.log=()=>{};try{importer.main(['--input',input,'--output',output]);assert.equal(JSON.parse(fs.readFileSync(output,'utf8')).sourcePdfVerified,false);const bytes=fs.readFileSync(output);assert.throws(()=>importer.main(['--input',input,'--output',output]),/输出文件已存在/);assert.deepEqual(fs.readFileSync(output),bytes);assert.throws(()=>importer.main(['--input',input,'--output',path.resolve(__dirname,'SIMULATED-private-must-not-exist.json')]),/不能加入公开源码/);}finally{console.log=original;}
});
