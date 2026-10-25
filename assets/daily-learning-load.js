(function(root,factory){'use strict';const api=factory(root);root.IELTSDailyLearningLoad=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
const NAMES={vocabulary:'词汇',grammar:'语法',listening:'听力',reading:'阅读',speaking:'口语',writing:'写作',reflection:'错题订正与每日复盘'};
const dependency=(name,file)=>root[name]||(typeof require==='function'?require(file):null);
function prediction(material,task,records,options={}){
 const year=options.yearPlanner||dependency('IELTSYearPlanner','./year-planner.js'),kind=m=>m?.rubric?.taskType||m?.type||m?.skill,materials=new Map((options.materials||[]).map(m=>[m.id,m])),seen=new Set(),times=[];
 const estimate=Number(material?.estimatedMinutes)||Number(task?.minutes)||15;
 for(const record of [...(records||[])].sort((a,b)=>String(b.submittedAt).localeCompare(String(a.submittedAt)))){
  const m=materials.get(record.materialId),seconds=record.activeSeconds;
  if(!m||m.skill!==material?.skill||m.level!==material.level||kind(m)!==kind(material)||Boolean(m.fullTest)!==Boolean(material.fullTest)||m.pool!==material.pool||record.kind!=='original'||record.evaluation?.result!=='pass'||seen.has(m.id)||!Number.isFinite(seconds)||seconds<=0||!year?.submissionSatisfied(record,m))continue;
  if(Number.isFinite(m.estimatedMinutes)&&(m.estimatedMinutes<estimate*.5||m.estimatedMinutes>estimate*2))continue;
  if(material.questions?.length&&Math.max(m.questions?.length||0,material.questions.length)>2*Math.min(m.questions?.length||0,material.questions.length))continue;
  seen.add(m.id);times.push(seconds/60);if(times.length>=30)break;
 }
 times.sort((a,b)=>a-b);const q=part=>{const at=(times.length-1)*part,low=Math.floor(at);return times[low]+(times[Math.ceil(at)]-times[low])*(at-low);};
 const empirical=times.length>=3,median=empirical?q(.5):null,studyMinutes=empirical?Math.max(.5,Math.ceil(q(.75)*1.15*10)/10):Math.max(.5,estimate),range=empirical?[q(.25),q(1)]:[Math.max(.5,estimate*.6),estimate*1.5];
 const timer=options.timerCore||dependency('IELTSStudyTimerCore','./study-timer-core.js'),schedule=timer?.forecast(studyMinutes,options.timerState)||{studyMinutes,breakMinutes:0,totalMinutes:studyMinutes};
 return{...schedule,source:empirical?'同类真实完成记录的保守用时':'课程预计（同类真实样本不足）',sampleCount:times.length,medianMinutes:median,rangeMinutes:range,uncertainty:!empirical||times.length<6||range[1]>Math.max(.5,range[0])*2?'高':'中',explanation:empirical?'仅同技能、级别和任务类型的不同材料；取第75百分位并留15%余量。速度不表示掌握。':'不足3份同类独立完整通过原稿，保留课程预计；不能把一课10分钟外推到其他题型。'};
}
function build(options={}){
 const data=options.data||root.IELTSCurriculumData,records=Array.isArray(options.records)?options.records:[],drafts=Array.isArray(options.drafts)?options.drafts:[],days=[...(data?.days||[])].sort((a,b)=>a.day-b.day);
 const hub=options.hub||dependency('IELTSTodayHub','./today-hub.js'),player=options.player||dependency('IELTSCoursePlayer','./course-player.js'),year=options.yearPlanner||dependency('IELTSYearPlanner','./year-planner.js'),assessment=options.assessment||dependency('IELTSAssessment','./assessment-core.js');
 const currentDay=Number(options.currentDay)||days[0]?.day||1,today=options.today||year?.dateKey(options.now??Date.now()),budget=options.budget||year?.calendarBudget(records,drafts,today)||{remainingMinutes:360,spentMinutes:0,exhausted:false};
 if(budget.budgetError)return{budget,entries:[],next:{kind:'blocked',label:'档案已更新，请刷新继续',reason:budget.budgetError},reason:budget.budgetError};
 if(!data||!hub||!player)return{budget,entries:[],next:null,reason:'课程状态组件未准备好。'};
 const summaryForDay=options.summaryForDay||((n)=>root.IELTSMistakes?.forDay(n)||{completionValid:false,remaining:0}),corrected=record=>{try{return options.recordCorrectionStatus?.(record)?.corrected===true;}catch(_){return false;}},cache=new Map();
 function inspect(day){
  if(cache.has(day.day))return cache.get(day.day);day=options.getDay?.(day)||day;
  let summary;try{summary=summaryForDay(day.day)||{};}catch(_){summary={completionValid:false,remaining:0,unreadable:true};}
  const own=records.filter(r=>r?.dayNumber===day.day),readiness=player.dayReadiness({...data,days:[day]},day.day,own,{hub,recordCorrectionStatus:options.recordCorrectionStatus}),states=day.tasks.map(task=>({task,...hub.taskState(task,own,{data,dayNumber:day.day,materials:data.materials,completionValid:summary.completionValid===true,recordCorrectionStatus:options.recordCorrectionStatus})}));
  // Reuse the normal objective grader while mistake capture is still updating.
  // A cached result or an old recap token must not turn an incorrect answer into completion.
  const errors=[];
  for(const state of states.filter(s=>s.task.id!=='reflection'))for(const record of hub.latestForMaterial(state.task,own,day.day,data.materials,data).values()){
   if(corrected(record))continue;const material=data.materials.find(m=>m.id===record.materialId);
   if(['reading','listening','grammar'].includes(material?.skill)){try{const artifact=hub.artifact(record.answer),grade=assessment.gradeMaterial(material,artifact?.answers||{});if(grade.allGradable&&grade.answered===grade.total&&grade.correct<grade.total)errors.push(record);}catch(_){}}
   else if(material?.skill==='vocabulary'){try{const vocabulary=options.vocabulary||dependency('IELTSVocabularyPractice','./vocabulary-practice.js'),verified=vocabulary?.verifyTrainingArtifact(hub.artifact(record.answer),material);if(verified?.submitted&&!verified.mastered)errors.push(record);}catch(_){}}
  }
  const reflection=states.find(s=>s.task.id==='reflection'),done=readiness.ready&&errors.length===0&&!summary.remaining&&!summary.unreadable&&(reflection?reflection.done:summary.completionValid===true);
  const result={day,own,states,summary,errors,readiness,done};cache.set(day.day,result);return result;
 }
 const current=days.find(d=>d.day===currentDay)||days[0],currentState=current?inspect(current):null;
 const first=days.find(day=>!inspect(day).done),state=first?inspect(first):null,target=state?.day;
 const entries=[],add=entry=>{if(entry)entries.push(entry);},started=day=>records.some(r=>r.dayNumber===day.day)||drafts.some(d=>d.courseDay===day.day),materialMap=new Map(data.materials.map(m=>[m.id,m]));
 const base=(day,taskId,materialId)=>({day:day.day,taskId,materialId});
 function materialAction(day,task,id){
  const draft=drafts.find(d=>d.courseDay===day.day&&d.taskId===task.id&&d.materialId===id&&!records.some(r=>r.id===d.id)),material=materialMap.get(id);
  let access;try{access=options.materialAccess?.(material)||player.protectedMaterialAccess(material,records,data.materials,{assessment,exposures:options.exposures,now:options.now});}catch(_){access={allowed:false,reason:'材料解锁状态暂不可核对。'};}
  return{...base(day,task.id,id),kind:access.allowed?'material':'blocked',draftId:draft?.id,label:access.allowed?(draft?'继续未提交草稿：':day.day===currentDay?'继续学习：':'继续第 '+day.day+' 课：')+NAMES[task.id]:'等待材料解锁',reason:access.allowed?'按真实作答继续；建议分钟不设最低用时。':access.reason,title:material?.title||NAMES[task.id]};
 }
 let blockedReason='',extraDay=currentState?.day||current;
 if(state){
  if(target.week>1&&!started(target)){
   const previous=days.filter(d=>d.day<target.day).at(-1);if(previous&&previous.week<target.week){
    let access;try{access=options.weekAccess?.(target,previous)||year?.progression(data,records,{now:options.now,currentWeek:previous.week,verifiedRecord:options.verifiedRecord});}catch(_){access={unlockedWeek:previous.week};}
    if(!access||access.allowed===false||Number.isFinite(access.unlockedWeek)&&access.unlockedWeek<target.week){blockedReason=access?.reason||access?.next?.reasons?.join('；')||'前置关卡或延迟保持证据尚未齐全，先继续同级补强。';extraDay=previous;}
   }
  }
  if(blockedReason)add({...base(target,'reflection',null),kind:'blocked',label:'前置证据待补齐',reason:blockedReason});
  else{
   const reflection=state.states.find(s=>s.task.id==='reflection');
   if((state.errors.length||state.summary.remaining>0)&&reflection)add({...base(target,'reflection',reflection.nextMaterialId),kind:'reflection',label:'先完成错题订正',reason:'真实错误须订正通过，原始尝试和待评状态保留。'});
   const active=options.current;
   const activeState=active?.active&&!active.submitted&&active.day===target.day?state.states.find(s=>s.task.id===active.taskId&&s.missingMaterialIds.includes(active.materialId)):null;
   if(activeState)add(materialAction(target,activeState.task,active.materialId));
   const pendingDrafts=drafts.filter(d=>d.courseDay===target.day&&!records.some(r=>r.id===d.id)).sort((a,b)=>String(a.startedAt).localeCompare(String(b.startedAt)));
   for(const draft of pendingDrafts){const item=state.states.find(s=>s.task.id===draft.taskId&&s.missingMaterialIds.includes(draft.materialId));if(item&&!entries.some(e=>e.materialId===draft.materialId&&e.taskId===draft.taskId))add(materialAction(target,item.task,draft.materialId));}
   const currentTask=options.current?.day===target.day?state.states.find(s=>s.task.id===options.current.taskId&&s.task.id!=='reflection'):null;
   for(const id of currentTask?.missingMaterialIds||[])if(!entries.some(e=>e.materialId===id&&e.taskId===currentTask.task.id))add(materialAction(target,currentTask.task,id));
   for(const item of state.states.filter(s=>s.task.id!=='reflection')){
    for(const id of item.missingMaterialIds)if(!entries.some(e=>e.taskId===item.task.id&&e.materialId===id))add(materialAction(target,item.task,id));
    if(item.pending)add({...base(target,item.task.id,item.pendingMaterialIds?.[0]||item.nextMaterialId),kind:'view',waiting:true,label:'查看待评作品：'+NAMES[item.task.id],reason:'评阅或订正尚未完成，不会当作通过。'});
   }
   if(reflection&&!state.done&&!entries.some(e=>e.kind==='reflection'))add({...base(target,'reflection',reflection.nextMaterialId),kind:state.readiness.ready?'reflection':'blocked',label:state.readiness.ready?'完成本课每日复盘':'复盘等待核心任务与评阅',reason:state.readiness.reason});
  }
 }
 // Extra work remains separate from core completion. Reuse planner eligibility,
 // then admit each actual learning unit with its own completion-time prediction.
 let plan;try{plan=options.extraPlan?.(extraDay,{...budget,remainingMinutes:360,spentMinutes:0});}catch(_){}
 for(const entry of plan?.retained||[]){const draft=drafts.find(d=>d.materialId===entry.materialId);if(!draft||entries.some(e=>e.materialId===entry.materialId))continue;add({...base(days.find(d=>d.day===draft.courseDay)||extraDay,entry.skill,entry.materialId),kind:'extra',entry,draftId:draft.id,label:'继续已有补强草稿：'+NAMES[entry.skill],reason:'原始输入与课程归属保留。'});}
 for(const entry of plan?.tasks||[]){const material=materialMap.get(entry.materialId);if(!['new-practice','reinforcement','progression'].includes(entry.kind)||material?.pool!=='training'||entries.some(e=>e.materialId===entry.materialId)||entry.kind==='progression'&&blockedReason)continue;add({...base(extraDay,entry.skill,entry.materialId),kind:'extra',entry,label:'继续同级新材料：'+NAMES[entry.skill],reason:entry.reason||'根据真实表现补充独立练习，不替代核心课程。'});}
 for(const entry of entries){if(['blocked','view'].includes(entry.kind))continue;const day=days.find(d=>d.day===entry.day),task=day?.tasks.find(t=>t.id===entry.taskId),material=materialMap.get(entry.materialId);entry.estimate=prediction(material,task,records,{...options,yearPlanner:year,materials:data.materials});const nextCourse=currentState?.done&&entry.day>currentDay&&!started(day)&&!entry.draftId,focusMinutes=options.timerState?.settings?.focusMinutes||25,windowStudy=nextCourse?Math.max(entry.estimate.studyMinutes,focusMinutes):entry.estimate.studyMinutes,timer=options.timerCore||dependency('IELTSStudyTimerCore','./study-timer-core.js'),window=timer?.forecast(windowStudy,options.timerState);entry.startWindowMinutes=nextCourse?(window?.totalMinutes||windowStudy):entry.estimate.totalMinutes;entry.nextCourseWindow=nextCourse;entry.fitsBudget=entry.startWindowMinutes<=budget.remainingMinutes+.001;}
 const actionable=entries.find(e=>!['blocked','view'].includes(e.kind)),admitted=actionable?.fitsBudget?actionable:null,next=admitted||(!actionable?entries.find(e=>e.kind==='view')||entries[0]:null)||null;
 const deferred=actionable&&!admitted?{kind:'rest',label:'今天到此，休息后下一日继续',reason:'下一学习单元预计需要 '+actionable.startWindowMinutes.toFixed(1)+' 分钟'+(actionable.nextCourseWindow?'（新课至少预留一轮完整专注及必要休息）':'（含计划休息）')+'，今天剩余 '+Math.max(0,budget.remainingMinutes).toFixed(1)+' 分钟不足。队列和未完成草稿已保留；下一日继续。',estimate:actionable.estimate}:null;
 return{budget,entries,next:budget.exhausted?{kind:'budget',label:'今日预算已用完，下一日继续',reason:'队列、草稿和作品保留；下一日恢复360分钟总预算。'}:next||deferred,currentComplete:currentState?.done===true,courseDay:target?.day||null,continuing:!!next&&next.day!==currentDay,pending:state?.states.some(s=>s.pending)||false,reason:blockedReason||(!target?'全部课程已提交，继续核对年度准备度与长期保持证据。':state?.done?'':state?.readiness.reason||'')};
}
return Object.freeze({build,prediction,NAMES});
});
