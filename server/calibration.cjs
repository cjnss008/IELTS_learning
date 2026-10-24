'use strict';
const crypto=require('node:crypto'),review=require('./review.cjs'),calibrationCore=require('../assets/calibration-core.js');
const INDEX=require('../calibration/official-sample-index.json');
const SCHEMA_VERSION=2;
const SOURCES=Object.freeze([
 {id:'writing',title:'IELTS 官方 Writing Band Descriptors',url:'https://ielts.org/cdn/Guides/ielts-writing-band-descriptors.pdf',note:'Academic Task 1/2 四维公开标准；本应用未获官方认证。'},
 {id:'speaking',title:'IELTS 官方 Speaking Band Descriptors',url:'https://ielts.org/cdn/ielts-guides/ielts-speaking-band-descriptors.pdf',note:'文字样本不能校准流利或发音。'},
 {id:'samples',title:INDEX.source.title,url:INDEX.source.url,note:INDEX.source.referenceScope},
 {id:'scoring',title:'IELTS 官方详细计分说明',url:'https://ielts.org/take-a-test/your-results/ielts-scoring-in-detail',note:'写作单篇四维等权平均；保留未舍入均值，与公布的单篇任务Band对照，不是整个Writing考试分。'},
 {id:'rights',title:'IELTS 官方版权及使用条款',url:INDEX.source.rightsUrl,note:INDEX.source.permissionScope},
]);
const CATALOG=Object.freeze(INDEX);
const BENCHMARKS=Object.freeze([
 {id:'guardrail-a0-complete',name:'原创守护样例：A0双句目标',mode:'writing',text:'My name is Lin. I live in a small town.',prompt:'Introduce your name and where you live in two simple sentences.',task:'foundation',level:'A0',rightsConfirmed:true,sourceKind:'original_guardrail',sourceUrl:'',reference:{meetsGoal:true},note:'原创功能基准，不是官方Band标定。'},
 {id:'guardrail-a0-gap',name:'原创守护样例：缺少任务信息',mode:'writing',text:'My name is Lin.',prompt:'Introduce your name and where you live in two simple sentences.',task:'foundation',level:'A0',rightsConfirmed:true,sourceKind:'original_guardrail',sourceUrl:'',reference:{meetsGoal:false},note:'检查模型是否发现缺少住处。'},
 {id:'guardrail-text-audio',name:'原创守护样例：无原音不能评音频',mode:'speaking_text',text:'I enjoy walking by the river because the air is fresh and I can meet my friends. We usually go there on Saturday morning and talk about our plans. I like the quiet path near the bridge because it helps me relax after a busy week.',prompt:'What do you enjoy doing in your free time?',task:'part1',level:'B1',rightsConfirmed:true,sourceKind:'original_guardrail',sourceUrl:'',reference:{forbiddenBands:['fluency','pronunciation']},note:'只验证无音频时不伪造语音评分，不校准全部口语能力。'},
]);
class CalibrationError extends Error{constructor(status,code,message){super(message);Object.assign(this,{status,code});}}
function fail(code,message){throw new CalibrationError(400,code,message);}
function hash(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function canonicalText(value){return value.normalize('NFKC').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/\s+/g,' ').trim();}
function textHash(value){return crypto.createHash('sha256').update(canonicalText(value)).digest('hex');}
function plain(value){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;}
function band(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=9&&Number.isInteger(value*2);}
function sourceUrl(value){if(!value)return '';let u;try{u=new URL(value);}catch{fail('CALIBRATION_SOURCE','来源网址无效。');}if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)fail('CALIBRATION_SOURCE','来源须为不含凭据、查询参数或片段的HTTPS具体网页。');return u.href;}
function prepare(body){
 if(!plain(body))fail('CALIBRATION_SAMPLES','请提供样本对象。');
 const items=body.useGuardrails?BENCHMARKS:body.samples;
 if(!Array.isArray(items)||!items.length||items.length>8)fail('CALIBRATION_SAMPLES','每次选择1–8个有权使用的样本。');
 const seen=new Set(),seenContent=new Set();
 return items.map((s,i)=>{
  if(!plain(s)||s.rightsConfirmed!==true||!['user_authorized','official_excerpt','official_verified','original_guardrail'].includes(s.sourceKind))fail('CALIBRATION_RIGHTS','请确认有权使用原稿并发送给所配置服务，标明来源。');
  const value=review.input(s),ids=value.mode==='writing'?review.WRITING:review.SPEAKING;
  if(value.mode==='speaking_audio')fail('CALIBRATION_AUDIO','本页仅接受写作或口语文字；完整口语须使用完整原音证据流程。');
  const id=typeof s.id==='string'&&/^[a-zA-Z0-9._:-]{1,100}$/.test(s.id)?s.id:'sample-'+(i+1);
  if(seen.has(id))fail('CALIBRATION_DUPLICATE','同批样本ID不能重复；重复运行不能增加独立样本数。');seen.add(id);
  if(s.sourceKind==='original_guardrail'&&!BENCHMARKS.some(b=>b.id===id&&b.text===s.text&&b.prompt===s.prompt&&b.reference.meetsGoal===s.reference?.meetsGoal&&JSON.stringify(b.reference.forbiddenBands||[])===JSON.stringify(s.reference?.forbiddenBands||[])&&!Object.keys(s.reference?.bands||{}).length&&s.reference?.overall===undefined))fail('CALIBRATION_SOURCE','原创守护样例及参考规则必须与内置版本相同。');
  const contentIdentity=hash([value.mode,value.task,textHash(value.text),textHash(value.prompt)]);if(seenContent.has(contentIdentity))fail('CALIBRATION_DUPLICATE','同一原稿与题目不能用不同ID重复计为独立样本。');seenContent.add(contentIdentity);
  const url=sourceUrl(s.sourceUrl),wordCount=(value.text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)||[]).length;
  if(s.sourceKind==='official_excerpt'&&wordCount>25)fail('CALIBRATION_EXCERPT','官方短摘最多25词；短摘不能校准整篇任务Band。');
  if(s.sourceKind==='official_excerpt'&&(!url||new URL(url).hostname!=='ielts.org'))fail('CALIBRATION_SOURCE','官方短摘须链接ielts.org具体原始出处。');
  if(s.reference!==undefined&&!plain(s.reference))fail('CALIBRATION_REFERENCE','参考分须为对象。');
  const raw=s.reference||{};
  if(Object.keys(raw).some(k=>!['bands','overall','meetsGoal','forbiddenBands'].includes(k)))fail('CALIBRATION_REFERENCE','参考分含未知字段。');
  if(raw.bands!==undefined&&!plain(raw.bands))fail('CALIBRATION_REFERENCE','维度参考分须为对象。');
  if(Object.keys(raw.bands||{}).some(k=>!ids.includes(k)))fail('CALIBRATION_REFERENCE','参考分含未知或不属于此任务的维度，不能忽略后假校准。');
  const reference={bands:{},forbiddenBands:[]};
  for(const [key,n]of Object.entries(raw.bands||{})){if(!band(n))fail('CALIBRATION_REFERENCE','参考Band须为0–9的0.5步长。');if(value.mode==='speaking_text'&&['fluency','pronunciation'].includes(key))fail('CALIBRATION_AUDIO_REFERENCE','仅文字不能对照流利与发音Band；不能用文字冒充原音。');reference.bands[key]=n;}
  if(raw.overall!==undefined){if(!band(raw.overall)||value.mode!=='writing'||!['academic_task1','academic_task2'].includes(value.task))fail('CALIBRATION_REFERENCE','任务总分只用于完整Academic写作，不用于基础目标或口语文字。');reference.overall=raw.overall;}
  if(raw.meetsGoal!==undefined){if(typeof raw.meetsGoal!=='boolean')fail('CALIBRATION_REFERENCE','基础目标参考必须为布尔值。');reference.meetsGoal=raw.meetsGoal;}
  if(raw.forbiddenBands!==undefined){if(!Array.isArray(raw.forbiddenBands)||raw.forbiddenBands.some(k=>!ids.includes(k)))fail('CALIBRATION_REFERENCE','守护规则包含未知维度。');reference.forbiddenBands=[...new Set(raw.forbiddenBands)];}
  let verified=null,provenance={status:s.sourceKind==='original_guardrail'?'original-guardrail':'user-unverified',verified:false};
  if(s.sourceKind==='official_verified'){
   verified=INDEX.samples.find(x=>x.id===id);
   if(!verified||url!==INDEX.source.url||s.sourceDocumentSha256!==INDEX.source.sha256||value.mode!==verified.mode||value.task!==verified.task||textHash(value.text)!==verified.textSha256||textHash(value.prompt)!==verified.promptSha256)fail('CALIBRATION_HASH','官方样本未通过完整原稿、原题及来源文件哈希核验；请对照原页和转录规则，不能用改写、摘录或缺页冒充已核实样本。');
   if(Object.keys(reference.bands).length||reference.overall!==undefined&&reference.overall!==verified.reference.overall||reference.meetsGoal!==undefined||reference.forbiddenBands.length)fail('CALIBRATION_REFERENCE','该官方来源只给出索引中的任务Band，没有四维数字；不能补造维度参考分。');
   reference.overall=verified.reference.overall;review.markVerifiedCalibration(value);
   provenance={status:'official-verified',verified:true,indexVersion:INDEX.id,verifiedAt:INDEX.verifiedAt,sourceDocumentSha256:INDEX.source.sha256,textSha256:verified.textSha256,promptSha256:verified.promptSha256,questionPages:verified.questionPages,responsePages:verified.responsePages,commentPages:verified.commentPages,attribution:INDEX.source.copyright,rightsUrl:INDEX.source.rightsUrl,referenceScope:INDEX.source.referenceScope,transcriptionNote:INDEX.source.transcriptionProtocol};
  }
  const completeResponse=Boolean(verified||s.completeResponse===true),completePrompt=Boolean(verified||s.completePrompt===true),reasons=[];
  if(s.sourceKind==='official_excerpt')reasons.push('短摘不是完整回答。');
  if(!completeResponse)reasons.push('尚未确认完整原始回答，不能校准整篇表现。');
  if(!completePrompt)reasons.push('尚未确认完整题目／Task 1全部数据。');
  if(['foundation','generic'].includes(value.task)||s.sourceKind==='original_guardrail')reasons.push('基础／原创守护只核对目标，不校准IELTS Band。');
  const minimum=value.mode==='writing'?(value.task==='academic_task1'?150:250):40;
  if(!verified&&wordCount<minimum)reasons.push('未核实为完整的短原稿，证据不足以校准任务Band。');
  const note=review.clean(s.note,1600);
  if(!verified&&s.sourceKind!=='original_guardrail'&&(Object.keys(reference.bands).length||reference.overall!==undefined)&&!note)reasons.push('缺少可回查的参考分依据说明。');
  const sample={id,name:verified?verified.name:review.clean(s.name,160)||'样本 '+(i+1),value,reference,sourceKind:s.sourceKind,sourceUrl:url,sourceDocumentSha256:verified?INDEX.source.sha256:'',note,provenance,eligibility:{bandComparison:reasons.length===0,reasons,wordCount,completeResponse,completePrompt,referenceDimensions:Object.keys(reference.bands)}};
  sample.contentSha256=textHash(value.text);sample.promptSha256=textHash(value.prompt);sample.contentIdentity=contentIdentity;
  // Reference/source identify a reproducible set; neither enters model messages.
  sample.sha256=hash({value,reference,sourceKind:sample.sourceKind,sourceUrl:url,provenance,eligibility:sample.eligibility});return sample;
 });
}
function exportSample(s){return {id:s.id,name:s.name,...s.value,reference:s.reference,sourceKind:s.sourceKind,sourceUrl:s.sourceUrl,...(s.sourceDocumentSha256?{sourceDocumentSha256:s.sourceDocumentSha256}:{}),rightsConfirmed:true,completeResponse:s.eligibility.completeResponse,completePrompt:s.eligibility.completePrompt,note:s.note};}
function itemMetadata(s){return {...s};}
function predicted(item,round,id){
 if(!round?.ok||item.eligibility?.bandComparison!==true)return null;
 if(id==='overall'){const ids=item.value?.mode==='writing'?review.WRITING:[];if(ids.length!==4)return null;const n=ids.map(key=>round.criteria?.find(c=>c.id===key)?.band);return n.every(band)?n.reduce((a,b)=>a+b,0)/4:null;}
 const n=round.criteria?.find(c=>c.id===id)?.band;return band(n)?n:null;
}
function identity(round,result,index){const requested=result.requestedReviewers?.[index];return {model:round?.reviewer?.model||requested?.model||result.requestedModels?.[index]||result.model||'未返回模型',providerHost:round?.reviewer?.providerHost||requested?.providerHost||'',promptVersion:round?.reviewer?.promptVersion||requested?.promptVersion||result.promptVersion||'未知提示版本',promptVariant:round?.reviewer?.promptVariant||requested?.promptVariant||(index===0?'initial':'adversarial')};}
function withRisk(summary){return {...summary,risk:calibrationCore.riskSummary(summary)};}
function summarize(items){
 const rows=[],guardrails=[],disagreement=[];
 for(const item of items){
  const rounds=[0,1].map(i=>item.result.rounds?.find(r=>r.round===i+1)),trust=item.provenance?.status||'user-unverified';
  for(let i=0;i<2;i++){
   const round=rounds[i],who=identity(round,item.result,i),references={...(item.reference.bands||{}),...(item.reference.overall!==undefined?{overall:item.reference.overall}:{})};
   for(const [criterion,reference]of Object.entries(references)){
    const n=predicted(item,round,criterion),reason=item.eligibility?.bandComparison!==true?item.eligibility?.reasons?.join(' ')||'完整性与来源依据尚未核验。':!round?.ok?round?.error?.message||'本轮未完成；未补造预测。':n===null?'模型缺少可核对的完整维度证据。':'';
    rows.push({sampleId:item.id,sampleHash:item.sha256,contentIdentity:item.contentIdentity||item.contentSha256||item.sha256,round:i+1,criterion,...who,referenceStatus:trust,predicted:n,reference,error:n===null?null:n-reference,reason});
   }
   if(typeof item.reference.meetsGoal==='boolean')guardrails.push({sampleId:item.id,round:i+1,...who,check:'stageGoal',pass:round?.ok?round.levelCheck?.meetsGoal===item.reference.meetsGoal:null});
   for(const id of item.reference.forbiddenBands||[])guardrails.push({sampleId:item.id,round:i+1,...who,check:'no-invented-'+id,pass:round?.ok?round.criteria?.find(c=>c.id===id)?.band===null:null});
  }
  const ids=[...(item.value?.mode==='speaking_text'?review.SPEAKING:review.WRITING),...(item.value?.mode==='writing'?['overall']:[])];
  for(const criterion of ids){const a=predicted(item,rounds[0],criterion),b=predicted(item,rounds[1],criterion),first=identity(rounds[0],item.result,0),second=identity(rounds[1],item.result,1),both=a!==null&&b!==null;disagreement.push({sampleId:item.id,criterion,first,second,firstBand:a,secondBand:b,difference:both?Math.abs(a-b):null,needsRetest:!both||Math.abs(a-b)>=1,distinctModels:Boolean(rounds[0]?.ok&&rounds[1]?.ok&&(first.model!==second.model||first.providerHost!==second.providerHost))});}
 }
 const groups=new Map();for(const row of rows){const key=JSON.stringify([row.providerHost,row.model,row.promptVersion,row.promptVariant,row.referenceStatus,row.criterion]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 const bias=[...groups.values()].map(values=>{const usable=values.filter(v=>v.error!==null),r=values[0];return {id:r.model+' / '+r.criterion,model:r.model,providerHost:r.providerHost,promptVersion:r.promptVersion,promptVariant:r.promptVariant,referenceStatus:r.referenceStatus,criterion:r.criterion,count:usable.length,sampleCount:new Set(usable.map(v=>v.contentIdentity||v.sampleHash||v.sampleId)).size,expectedCount:values.length,missing:values.length-usable.length,meanSignedBias:usable.length?usable.reduce((n,v)=>n+v.error,0)/usable.length:null,meanAbsoluteError:usable.length?usable.reduce((n,v)=>n+Math.abs(v.error),0)/usable.length:null};});
 const dimensionCoverage=['overall',...new Set([...review.WRITING,...review.SPEAKING])].map(criterion=>{const relevant=items.filter(s=>criterion==='overall'?s.value?.mode==='writing'&&['academic_task1','academic_task2'].includes(s.value.task):(s.value?.mode==='speaking_text'?review.SPEAKING:review.WRITING).includes(criterion));const refs=relevant.filter(s=>criterion==='overall'?s.reference.overall!==undefined:s.reference.bands?.[criterion]!==undefined),eligible=refs.filter(s=>s.eligibility?.bandComparison===true);return {criterion,sampleCount:relevant.length,referenceSamples:refs.length,eligibleReferenceSamples:eligible.length,missingReferenceSamples:relevant.length-refs.length,comparedSamples:new Set(rows.filter(r=>r.criterion===criterion&&r.error!==null).map(r=>r.sampleHash||r.sampleId)).size,missingPredictionSamples:eligible.filter(s=>![1,2].every(i=>predicted(s,s.result.rounds?.find(r=>r.round===i),criterion)!==null)).length};});
 const bands=[...new Set(items.filter(i=>i.reference.overall!==undefined).map(i=>i.reference.overall))].sort((a,b)=>a-b),official=items.filter(i=>i.provenance?.verified===true);
 return withRisk({rows,bias,guardrails,disagreement,dimensionCoverage,comparedCount:rows.filter(r=>r.error!==null).length,missingCount:rows.filter(r=>r.error===null).length,coverage:{sampleCount:items.length,uniqueContentCount:new Set(items.map(i=>i.contentSha256||i.sha256||i.id)).size,officialVerifiedSamples:official.length,eligibleSamples:items.filter(i=>i.eligibility?.bandComparison===true).length,tasks:[...new Set(items.map(i=>i.value?.task).filter(Boolean))],overallReferenceBands:bands,officialDimensionReferenceSamples:official.filter(i=>Object.keys(i.reference.bands||{}).length).length,distinctModelSamples:new Set(disagreement.filter(r=>r.distinctModels).map(r=>r.sampleId)).size},status:rows.length?(official.length===items.length?'official-reference-comparison':official.length?'mixed-reference-comparison':'user-reference-comparison'):'guardrails-only',disclaimer:'偏差仅描述这组样本。官方已核实参考与用户未核实参考分开统计；任务分不能填成四维分。任务估计为四维均值（不舍入），缺任一维就缺分，不是完整Writing考试分。手写转录存在局限，少量/单题型/同源样本不能证明评分准确或覆盖全部能力；不同模型仍可能共同出错。同模型双轮和不同提示角色不冒充独立考官，分歧不取高分，不自动加减AI评分。'});
}
function buildReport(samples,items,metadata={}){
 const all=samples.map(s=>{const actual=items.find(i=>i.sha256===s.sha256||!i.sha256&&i.id===s.id);return {...itemMetadata(s),result:actual?.result||{ok:true,status:'pending',model:null,promptVersion:metadata.promptVersion||review.PROMPT_VERSION,requestedModels:metadata.modelPair||[],rounds:[],comparison:[],requiresRetest:true,disclaimer:'前序服务失败或取消，未尝试此样本。'}};});
 return {ok:true,schemaVersion:SCHEMA_VERSION,createdAt:new Date().toISOString(),promptVersion:metadata.promptVersion||review.PROMPT_VERSION,indexVersion:INDEX.id,sources:SOURCES,items:all,summary:summarize(all),requestedCount:samples.length,completedCount:all.filter(i=>i.result.status==='complete').length,selectedModels:metadata.modelPair||[],benchmarkSetHash:hash(samples.map(s=>s.sha256).sort())};
}
module.exports={SOURCES,BENCHMARKS,CATALOG,SCHEMA_VERSION,CalibrationError,prepare,exportSample,itemMetadata,summarize,buildReport,hash,textHash,canonicalText};
