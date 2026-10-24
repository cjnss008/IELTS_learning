'use strict';
const crypto=require('node:crypto'),review=require('./review.cjs');
const SOURCES=Object.freeze([
 {id:'writing',title:'IELTS 官方 Writing Band Descriptors（2023年5月更新）',url:'https://ielts.org/cdn/Guides/ielts-writing-band-descriptors.pdf',note:'Academic Task 1/2 四维公开标准；本应用提供训练反馈，未获官方认证。'},
 {id:'speaking',title:'IELTS 官方 Speaking Band Descriptors',url:'https://ielts.org/cdn/ielts-guides/ielts-speaking-band-descriptors.pdf',note:'流利与连贯、词汇、语法、发音。文字样本不能校准语音维度。'},
 {id:'samples',title:'IELTS 官方样例、分数与考官评语',url:'https://ielts.org/organisations/ielts-for-organisations/understanding-ielts-scoring/resources-for-setting-your-ielts-scores',note:'请在原站查阅。未在项目中打包完整第三方回答或视频；可输入有权使用的样本。'},
]);
const BENCHMARKS=Object.freeze([
 {id:'guardrail-a0-complete',name:'原创守护样例：A0双句目标',mode:'writing',text:'My name is Lin. I live in a small town.',prompt:'Introduce your name and where you live in two simple sentences.',task:'foundation',level:'A0',rightsConfirmed:true,sourceKind:'original_guardrail',sourceUrl:'',reference:{meetsGoal:true},note:'原创功能基准，不是官方Band标定。'},
 {id:'guardrail-a0-gap',name:'原创守护样例：缺少任务信息',mode:'writing',text:'My name is Lin.',prompt:'Introduce your name and where you live in two simple sentences.',task:'foundation',level:'A0',rightsConfirmed:true,sourceKind:'original_guardrail',sourceUrl:'',reference:{meetsGoal:false},note:'检查模型是否发现缺少住处。'},
 {id:'guardrail-text-audio',name:'原创守护样例：无原音不能评音频',mode:'speaking_text',text:'I enjoy walking by the river because the air is fresh and I can meet my friends. We usually go there on Saturday morning and talk about our plans. I like the quiet path near the bridge because it helps me relax after a busy week.',prompt:'What do you enjoy doing in your free time?',task:'part1',level:'B1',rightsConfirmed:true,sourceKind:'original_guardrail',sourceUrl:'',reference:{forbiddenBands:['fluency','pronunciation']},note:'只验证无音频时不伪造语音评分，不代表校准全部口语能力。'},
]);
class CalibrationError extends Error{constructor(status,code,message){super(message);Object.assign(this,{status,code});}}
function hash(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function prepare(body){
 const items=body.useGuardrails?BENCHMARKS:body.samples;
 if(!Array.isArray(items)||!items.length||items.length>8)throw new CalibrationError(400,'CALIBRATION_SAMPLES','每次选择1–8个合法样本。');
 return items.map((s,i)=>{
  if(!s||s.rightsConfirmed!==true||!['user_authorized','official_excerpt','original_guardrail'].includes(s.sourceKind))throw new CalibrationError(400,'CALIBRATION_RIGHTS','请先确认有权使用样本，并标明来源。');
  const value=review.input(s),ids=value.mode==='writing'?review.WRITING:review.SPEAKING;
  if(value.mode==='speaking_audio')throw new CalibrationError(400,'CALIBRATION_AUDIO','此基准页只接受写作或口语文字。完整语音须由原音证据流程评阅。');
  if(s.sourceKind==='original_guardrail'&&!BENCHMARKS.some(b=>b.id===s.id&&b.text===s.text&&b.prompt===s.prompt))throw new CalibrationError(400,'CALIBRATION_SOURCE','原创基准内容必须与内置版本一致。');
  if(s.sourceKind==='official_excerpt'&&(value.text.match(/\S+/g)||[]).length>25)throw new CalibrationError(400,'CALIBRATION_EXCERPT','官方短摘最多25词；完整合法样本请使用「本人有权使用」并保留出处，短摘不代表完整评分表现。');
  let sourceUrl='';if(s.sourceUrl){let u;try{u=new URL(s.sourceUrl);}catch{throw new CalibrationError(400,'CALIBRATION_SOURCE','来源网址无效。');}if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw new CalibrationError(400,'CALIBRATION_SOURCE','请填写不含凭据或查询参数的HTTPS来源。');sourceUrl=u.href;}
  if(s.sourceKind==='official_excerpt'&&(!sourceUrl||new URL(sourceUrl).hostname!=='ielts.org'))throw new CalibrationError(400,'CALIBRATION_SOURCE','官方短摘须链接ielts.org具体来源页。');
  const reference={bands:{}};for(const id of ids){const b=s.reference?.bands?.[id];if(b!==undefined){if(typeof b!=='number'||b<0||b>9||!Number.isInteger(b*2))throw new CalibrationError(400,'CALIBRATION_REFERENCE','参考维度分数须为0–9的0.5步长。');reference.bands[id]=b;}}
  if(typeof s.reference?.meetsGoal==='boolean')reference.meetsGoal=s.reference.meetsGoal;
  reference.forbiddenBands=Array.isArray(s.reference?.forbiddenBands)?s.reference.forbiddenBands.filter(id=>ids.includes(id)):[];
  const sample={id:typeof s.id==='string'&&/^[a-zA-Z0-9._:-]{1,100}$/.test(s.id)?s.id:'sample-'+(i+1),name:review.clean(s.name,160)||'样本 '+(i+1),value,reference,sourceKind:s.sourceKind,sourceUrl,note:review.clean(s.note,600)};
  // Include the reference in the identity for reproducible comparisons, but never put it in a model prompt.
  sample.sha256=hash({value,reference,sourceKind:sample.sourceKind,sourceUrl});return sample;
 });
}
function summarize(items){
 const rows=[],guardrails=[];for(const item of items){for(const round of item.result.rounds||[]){if(!round.ok)continue;for(const id of Object.keys(item.reference.bands)){const predicted=round.criteria.find(c=>c.id===id)?.band,reference=item.reference.bands[id];rows.push({sampleId:item.id,round:round.round,criterion:id,model:round.reviewer?.model||item.result.model,predicted:typeof predicted==='number'?predicted:null,reference,error:typeof predicted==='number'?predicted-reference:null});}
  if(typeof item.reference.meetsGoal==='boolean')guardrails.push({sampleId:item.id,round:round.round,check:'stageGoal',pass:round.levelCheck?.meetsGoal===item.reference.meetsGoal});
  for(const id of item.reference.forbiddenBands)guardrails.push({sampleId:item.id,round:round.round,check:'no-invented-'+id,pass:round.criteria.find(c=>c.id===id)?.band===null});
 }}
 const groups=new Map();for(const row of rows){const id=row.model+' / '+row.criterion;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(row);}
 const bias=[...groups].map(([id,values])=>{const usable=values.filter(v=>v.error!==null);return {id,count:usable.length,missing:values.length-usable.length,meanSignedBias:usable.length?usable.reduce((n,v)=>n+v.error,0)/usable.length:null,meanAbsoluteError:usable.length?usable.reduce((n,v)=>n+Math.abs(v.error),0)/usable.length:null};});
 return {rows,bias,guardrails,comparedCount:rows.filter(r=>r.error!==null).length,missingCount:rows.filter(r=>r.error===null).length,status:rows.length?'user-reference-comparison':'guardrails-only',disclaimer:'参考分由用户提供，尚未经本应用核实；偏差只描述这组样本，样本少、短摘或同一模型共同误差均不能证明正式评分准确。内置原创守护样例只检查规则，不能称考官校准或认证。'};
}
module.exports={SOURCES,BENCHMARKS,CalibrationError,prepare,summarize,hash};
