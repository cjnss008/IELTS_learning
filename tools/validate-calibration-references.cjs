'use strict';
// Read-only metadata/private-file verification. No AI, network or user configuration.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const calibration=require('../server/calibration.cjs'),importer=require('./import-calibration.cjs');
const CATALOG=require('../calibration/official-sample-index.json'),REGISTRATION=require('../calibration/reference-preregistration-v60.json');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex'),jsonHash=value=>sha(JSON.stringify(value));
function check(ok,message){if(!ok)throw Error(message);}
function hashOK(value){return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);}
function https(value,queries=false){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(queries||!u.search&&!u.hash);}catch{return false;}}
function pages(list,total){return Array.isArray(list)&&list.every(n=>Number.isInteger(n)&&n>=1&&n<=total)&&new Set(list).size===list.length;}
function validateCatalog(catalog=CATALOG,registration=REGISTRATION){
 check(catalog.sources&&typeof catalog.sources==='object'&&!Array.isArray(catalog.sources),'来源注册表须为 sourceId 对象。');
 const documents=new Map(),ids=new Set(),content=new Set();
 for(const [id,s] of Object.entries(catalog.sources)){
  check(s.id===id&&s.publicationFamily&&https(s.url)&&hashOK(s.sha256)&&Number.isInteger(s.bytes)&&s.bytes>0&&Number.isInteger(s.pageCount)&&s.pageCount>0,'来源身份、PDF哈希、大小或页数无效：'+id);
  check(s.copyright&&https(s.rightsUrl)&&s.permissionScope&&s.referenceScope&&s.transcriptionProtocol&&s.duplicatePolicy,'来源须有版权、评分依据、转录及重复身份说明：'+id);
  check(!documents.has(s.sha256)||documents.get(s.sha256)===s.publicationFamily,'同一PDF不能按不同出版家族计数。');documents.set(s.sha256,s.publicationFamily);
 }
 for(const s of catalog.samples){
  const source=catalog.sources[s.sourceId];check(source&&!ids.has(s.id),'样本来源缺失或ID重复：'+s.id);ids.add(s.id);
  check(s.text===undefined&&s.prompt===undefined&&s.answer===undefined&&s.response===undefined,'公开索引不能含完整题目或原稿。');
  check(hashOK(s.textSha256)&&hashOK(s.promptSha256)&&Number.isInteger(s.wordCount)&&s.wordCount>0,'样本转录哈希或字数无效：'+s.id);
  check(pages(s.questionPages,source.pageCount)&&pages(s.responsePages,source.pageCount)&&s.responsePages.length&&pages(s.commentPages,source.pageCount)&&s.commentPages.length,'页码缺失、重复或超出原件：'+s.id);
  check(s.questionPages.length||Array.isArray(s.questionSourceIds)&&s.questionSourceIds.length,'必须提供完整题目原页或另册/网页来源：'+s.id);
  for(const id of s.questionSourceIds||[]){const q=source.questionSources?.[id];check(q&&https(q.url,true)&&q.promptSha256===s.promptSha256,'题目另册来源或哈希未绑定：'+s.id);if(q.imageUrl)check(https(q.imageUrl,true)&&hashOK(q.imageSha256)&&q.encoding,'图表须有原图哈希及完整编码说明：'+s.id);}
  check(s.mode==='writing'&&['academic_task1','academic_task2'].includes(s.task)&&['development','holdout'].includes(s.evaluationSet)&&s.verificationVersion&&s.verifiedAt,'样本任务、版本或开发/留出标记无效：'+s.id);
  check(typeof s.reference?.overall==='number'&&s.reference.overall>=0&&s.reference.overall<=9&&Number.isInteger(s.reference.overall*2)&&s.reference.bands&&Object.keys(s.reference.bands).length===0,'本组原件仅公布任务Band，不能补造维度：'+s.id);
  const key=s.textSha256+':'+s.promptSha256;check(!content.has(key),'同稿同题改名或转载不能增加独立样本。');content.add(key);
 }
 check(registration.status==='preregistered-before-new-model-evaluation'&&Number.isFinite(Date.parse(registration.frozenAt)),'缺少有日期的评阅前预注册。');
 const expected=new Map([...registration.development,...registration.holdout].map(s=>[s.id,s]));check(expected.size===catalog.samples.length,'冻结样本集合与索引不一致。');
 for(const s of catalog.samples){const frozen=expected.get(s.id),source=catalog.sources[s.sourceId];check(frozen&&['sourceId','textSha256','promptSha256'].every(k=>frozen[k]===s[k])&&frozen.referenceOverall===s.reference.overall,'冻结身份、来源或参考分发生改变：'+s.id);if(s.evaluationSet==='holdout')check(registration.holdout.includes(frozen)&&frozen.sourceDocumentSha256===source.sha256&&frozen.publicationFamily===source.publicationFamily&&frozen.task===s.task&&frozen.promptGroup===s.promptGroup,'留出来源、任务或分组发生改变：'+s.id);else check(registration.development.includes(frozen),'开发集不能冒充留出。');}
 const legacy=catalog.samples.filter(s=>s.evaluationSet==='development').map(({sourceId,verificationVersion,verifiedAt,evaluationSet,...row})=>{check(verificationVersion==='ielts-academic-2023-local-v1'&&verifiedAt==='2026-10-25','旧样本核验版本/日期须保留，不能因目录扩充改写已存SHA。');return row;});
 check(jsonHash(catalog.source)===registration.legacySourceObjectSha256&&jsonHash(legacy)===registration.legacyRowsSha256,'旧四篇原source/row字段发生改变，可能破坏已存样本SHA身份。');
 const oldSource=catalog.sources['ielts-academic-2023'];for(const [key,value]of Object.entries(catalog.source))check(JSON.stringify(oldSource[key])===JSON.stringify(value),'旧source注册副本改变：'+key);
 const development=catalog.samples.filter(s=>s.evaluationSet==='development'),holdout=catalog.samples.filter(s=>s.evaluationSet==='holdout'),expectedCounts=registration.expected;
 const counts={developmentSamples:development.length,holdoutSamples:holdout.length,newSourceDocuments:new Set(holdout.map(s=>catalog.sources[s.sourceId].sha256)).size,newPublicationFamilies:new Set(holdout.map(s=>catalog.sources[s.sourceId].publicationFamily)).size,newPromptGroups:new Set(holdout.map(s=>s.promptGroup)).size,task1:holdout.filter(s=>s.task==='academic_task1').length,task2:holdout.filter(s=>s.task==='academic_task2').length};
 check(Object.entries(expectedCounts).every(([k,v])=>counts[k]===v),'冻结覆盖数量发生改变。');return counts;
}
function parseArgs(argv){const out={};for(let i=0;i<argv.length;i++){const k=argv[i];check(['--input','--source-pdf','--source-pdfs','--chart'].includes(k)&&out[k]===undefined,'未知或重复参数：'+k);check(argv[i+1]&&!argv[i+1].startsWith('--'),'参数缺值：'+k);out[k]=argv[++i];}check(!(out['--source-pdf']&&out['--source-pdfs']),'两种PDF参数不能同时使用。');check(out['--input']||!Object.keys(out).length,'私有文件参数须与 --input 一起提供。');return out;}
function readJson(file,max=150000){const b=fs.readFileSync(path.resolve(file));check(b.length<=max,'输入文件过大。');return JSON.parse(b.toString('utf8').replace(/^\uFEFF/,''));}
function validatePrivate(a){
 const input=readJson(a['--input']);check(input.format==='ielts-calibration-samples'&&input.version===1,'私有导入格式无效。');
 const samples=calibration.prepare(input),wanted=new Set(REGISTRATION.holdout.map(s=>s.id));check(samples.length===wanted.size&&samples.every(s=>wanted.has(s.id)),'本工具的私有验证须包含冻结的全部六份留出。');
 const pdf=importer.verifySourcePdfs(input,a);check(pdf.verified,'请显式提供每个来源的原PDF以核对真实字节。');
 const chartEntries=CATALOG.samples.filter(s=>wanted.has(s.id)).flatMap(s=>(s.questionSourceIds||[]).map(id=>CATALOG.sources[s.sourceId].questionSources[id])).filter(q=>q.imageSha256),imageHashes=new Set(chartEntries.map(q=>q.imageSha256));
 if(imageHashes.size){check(imageHashes.size===1&&a['--chart'],'须提供本组完整Task1原图 --chart（不同原图不能混用）。');const bytes=fs.readFileSync(path.resolve(a['--chart']));check(bytes.length<=1000000&&imageHashes.has(sha(bytes)),'Task1原图字节哈希不符。');}
 return {sourcePdfVerified:true,chartVerified:imageHashes.size>0,samples:samples.length,benchmarkSetHash:calibration.hash(samples.map(s=>s.sha256).sort())};
}
function main(argv){const a=parseArgs(argv),counts=validateCatalog(),out={ok:true,...counts,registrationId:REGISTRATION.id,frozenAt:REGISTRATION.frozenAt,scope:'索引/预注册规则与明确传入的私有原件哈希核验；不是教学标定或模型准确率验证。'};if(a['--input'])Object.assign(out,validatePrivate(a));console.log(JSON.stringify(out,null,2));return out;}
if(require.main===module){try{main(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={validateCatalog,validatePrivate,parseArgs,main};
