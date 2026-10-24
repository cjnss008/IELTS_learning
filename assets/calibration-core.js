'use strict';
(function(root){
 function regression(current,previous){
  if(!previous)return {comparable:false,reason:'首次运行，尚无同一组样本的历史结果。',rows:[]};
  if(!current?.benchmarkSetHash||current.benchmarkSetHash!==previous.benchmarkSetHash)return {comparable:false,reason:'样本内容、任务或参考分发生改变，不能把本次与旧结果当作同组回归。',rows:[]};
  const rows=[];for(const item of current.items||[]){const old=previous.items?.find(i=>i.sha256===item.sha256);if(!old)continue;for(const round of item.result?.rounds||[]){const older=old.result?.rounds?.find(r=>r.round===round.round);if(!round.ok||!older?.ok)continue;for(const c of round.criteria||[]){const before=older.criteria?.find(x=>x.id===c.id)?.band;if(typeof c.band==='number'&&typeof before==='number')rows.push({sampleId:item.id,round:round.round,criterion:c.id,before,after:c.band,delta:c.band-before,beforeModel:older.reviewer?.model||old.result.model,afterModel:round.reviewer?.model||item.result.model,changed:Math.abs(c.band-before)>=1});}}}
  return {comparable:true,previousAt:previous.createdAt,beforePromptVersion:previous.promptVersion,afterPromptVersion:current.promptVersion,rows,reason:rows.length?'相同样本下的实际输出变化；≥1分标记复核，不自动修正分数。':'同组样本暂无可比Band，可核对适级目标和守护规则。'};
 }
 function compact(report){return {...report,items:(report.items||[]).map(item=>({...item,result:{...item.result,rounds:(item.result.rounds||[]).map(round=>round.ok?{ok:true,round:round.round,reviewer:round.reviewer,criteria:round.criteria.map(c=>({id:c.id,label:c.label,band:c.band})),levelCheck:round.levelCheck}:round)}}))};}
 const api={regression,compact};if(typeof module==='object'&&module.exports)module.exports=api;root.IELTSCalibration=api;
})(globalThis);
