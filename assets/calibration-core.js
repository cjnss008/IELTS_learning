'use strict';
(function(root){
 function parseImport(text){
  if(typeof text!=='string'||text.length>150000)throw Error('请选择不超过150KB的参考样本JSON。');
  let data;try{data=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw Error('参考文件不是完整JSON。');}
  if(data?.format!=='ielts-calibration-samples'||data.version!==1||!Array.isArray(data.samples)||!data.samples.length||data.samples.length>8)throw Error('参考文件须为ielts-calibration-samples version 1，每批1–8份。');
  const pending=[data];let count=0;while(pending.length){const v=pending.pop();if(++count>20000)throw Error('导入结构过大。');if(v&&typeof v==='object')for(const[k,x]of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))throw Error('导入含不支持字段。');pending.push(x);}}
  return {samples:data.samples};
 }
 function identity(round,result){return {model:round.reviewer?.model||result.model||'未知模型',host:round.reviewer?.providerHost||'',promptVersion:round.reviewer?.promptVersion||result.promptVersion||'未知',promptVariant:round.reviewer?.promptVariant||(round.round===1?'initial':'adversarial')};}
 function riskSummary(summary){
  const threshold=.5,bias=Array.isArray(summary?.bias)?summary.bias:[],affected=bias.filter(b=>b.count>0&&Number.isFinite(b.meanAbsoluteError)&&b.meanAbsoluteError>threshold),comparable=bias.some(b=>b.count>0&&Number.isFinite(b.meanAbsoluteError));
  return {status:affected.length?'observed-bias':comparable?'limited-evidence':'insufficient-evidence',hasMaterialBias:affected.length>0,threshold,thresholdIsHeuristic:true,sampleCount:summary?.coverage?.uniqueContentCount??null,affected:affected.map(b=>({model:b.model||b.id,providerHost:b.providerHost||'',promptVersion:b.promptVersion||'',promptVariant:b.promptVariant||'',criterion:b.criterion||'',referenceStatus:b.referenceStatus||'user-unverified',sampleCount:b.sampleCount??b.count,meanSignedBias:b.meanSignedBias,meanAbsoluteError:b.meanAbsoluteError})),message:affected.length?'本组出现明显偏差，不能把当前模型分数直接作考试预测。这是少量、可能同源样本的描述，参考与手写转录仍有局限；不能据此给AI统一加分或减分。':comparable?'本组未触发0.5 Band误差提醒，仍不能证明评分准确。小样本、同源与缺题型／原音的范围仍未验证。':'没有完整可比参考或预测，尚不能判断评分偏差。规则通过或模型一致不代表准确。'};
 }
 function regression(current,previous){
  if(!previous)return {comparable:false,reason:'首次运行，尚无同一组样本的历史结果。',rows:[]};
  if(!current?.benchmarkSetHash||current.benchmarkSetHash!==previous.benchmarkSetHash)return {comparable:false,reason:'原稿、题目、完整范围、参考分或来源改变，不能当作同组回归。',rows:[]};
  const rows=[];
  for(const item of current.items||[]){const old=previous.items?.find(i=>i.sha256===item.sha256);if(!old)continue;for(const round of item.result?.rounds||[]){const older=old.result?.rounds?.find(r=>r.round===round.round);if(!round.ok||!older?.ok)continue;const beforeIdentity=identity(older,old.result),afterIdentity=identity(round,item.result),modelChanged=beforeIdentity.model!==afterIdentity.model||beforeIdentity.host!==afterIdentity.host,promptChanged=beforeIdentity.promptVersion!==afterIdentity.promptVersion||beforeIdentity.promptVariant!==afterIdentity.promptVariant;for(const c of round.criteria||[]){const before=older.criteria?.find(x=>x.id===c.id)?.band;if(typeof c.band==='number'&&Number.isFinite(c.band)&&typeof before==='number'&&Number.isFinite(before))rows.push({sampleId:item.id,round:round.round,criterion:c.id,before,after:c.band,delta:c.band-before,beforeModel:beforeIdentity.model,afterModel:afterIdentity.model,beforeIdentity,afterIdentity,changeType:modelChanged&&promptChanged?'model-and-prompt':modelChanged?'model':promptChanged?'prompt':'repeat',changed:Math.abs(c.band-before)>=1});}}}
  return {comparable:true,previousAt:previous.createdAt,beforePromptVersion:previous.promptVersion,afterPromptVersion:current.promptVersion,rows,reason:rows.length?'相同样本下的实际变化；同时换模型与提示时不能把差异只归因于模型。≥1分需复核，不自动修分。':'同组暂无可比Band；保留缺分，仍可核对守护规则。'};
 }
 // Large reports keep their full evidence in per-round media records. The run
 // record contains stable links, so the existing 150KB media limit is respected.
 function compact(report){return {...report,items:(report.items||[]).map(item=>{const {value,...meta}=item;return {...meta,result:{...item.result,rounds:(item.result.rounds||[]).map(round=>round.ok?{ok:true,round:round.round,...(round.reviewer?{reviewer:round.reviewer}:{}),criteria:round.criteria.map(c=>({id:c.id,label:c.label,band:c.band})),...(round.levelCheck?{levelCheck:{targetLevel:round.levelCheck.targetLevel,scope:round.levelCheck.scope,meetsGoal:round.levelCheck.meetsGoal}}:{})}:round)}};})};}
 const api={parseImport,identity,riskSummary,regression,compact};if(typeof module==='object'&&module.exports)module.exports=api;root.IELTSCalibration=api;
})(globalThis);
