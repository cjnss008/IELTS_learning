(function(root,factory){'use strict';const api=factory(root);root.IELTSDailyLearningLoad=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
const NAMES={vocabulary:'词汇',grammar:'语法',listening:'听力',reading:'阅读',speaking:'口语',writing:'写作',reflection:'错题订正与每日复盘'};
const dependency=(name,file)=>root[name]||(typeof require==='function'?require(file):null);
function calendarSchedule(options={}){
 const year=options.yearPlanner||dependency('IELTSYearPlanner','./year-planner.js'),today=options.today||year?.dateKey(options.now??Date.now());let startDate=options.startDate;
 if(!startDate)try{startDate=JSON.parse(root.IELTSProfiles?.storage?.().getItem('ielts52-daily-plan-v1')||'null')?.startDate;}catch(_){}
 if(!startDate||!year?.dateNumber)return null;const calendarDay=Math.floor((year.dateNumber(today)-year.dateNumber(startDate))/86400000)+1,placement=options.route??year.placementRoute(options.data||root.IELTSCurriculumData,options),scheduled=placement?placement.startDay+Math.max(0,Math.floor((year.dateNumber(today)-year.dateNumber(year.dateKey(placement.adoptedAt)))/86400000)):calendarDay;
 return{today,startDate,calendarDay,scheduledDay:Math.min(365,Math.max(1,scheduled))};
}
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
function placementChallenges(options={}){
 const {data,route,day}=options;if(!route||!data?.materials||!day?.tasks)return[];const rank=value=>Math.max(-1,...(String(value||'').match(/A[012]|B[12]|C[12]/g)||[]).map(v=>['A0','A1','A2','B1','B2','C1','C2'].indexOf(v))),common=rank(route.level),used=new Set([...(options.records||[]).map(r=>r.materialId),...(options.drafts||[]).map(d=>d.materialId),...Object.keys(options.exposures||{}),...(options.excludedMaterialIds||[])]),entries=[];
 for(const skill of ['listening','reading','speaking','writing']){
  const result=route.skills?.[skill],level=rank(result?.level),task=day.tasks.find(t=>t.id===skill);if(result?.verified!==true||level<=common||!task||task.mode==='assessment')continue;
  const candidates=data.materials.filter(m=>m.skill===skill&&!m.source?.publicSourceId&&m.pool==='training'&&!m.independentBank&&!m.assessmentGroup&&!m.form&&!m.fullTest&&m.source?.verification==='reviewed'&&rank(m.level)===level&&!used.has(m.id)&&Number.isFinite(m.estimatedMinutes)&&m.estimatedMinutes>0).sort((a,b)=>(a.week||0)-(b.week||0)||a.id.localeCompare(b.id)),material=candidates[0];if(!material)continue;used.add(material.id);
  entries.push({kind:'placement-challenge',materialId:material.id,skill,level:result.level,sessionId:route.sessionId,estimatedMinutes:material.estimatedMinutes,unseen:true,reason:'入学测评的'+NAMES[skill]+'为 '+result.level+'，高于共同起点 '+route.level+'；提供适级常规新材料，保留弱项核心课程与关卡要求。',strategy:'按入学测评的'+result.level+'分项程度独立练习；完成后保留原稿与真实核对，挑战不替代共同核心任务。'});
 }
 return entries;
}
function build(options={}){
 const data=options.data||root.IELTSCurriculumData,records=Array.isArray(options.records)?options.records:[],drafts=Array.isArray(options.drafts)?options.drafts:[],days=[...(data?.days||[])].sort((a,b)=>a.day-b.day);
 const hub=options.hub||dependency('IELTSTodayHub','./today-hub.js'),player=options.player||dependency('IELTSCoursePlayer','./course-player.js'),year=options.yearPlanner||dependency('IELTSYearPlanner','./year-planner.js'),assessment=options.assessment||dependency('IELTSAssessment','./assessment-core.js');
 // Pure planners inject a store explicitly; requiring an adapter must not
 // initialize browser storage. Live browser storage failures still propagate.
 const adaptivePlan=Object.prototype.hasOwnProperty.call(options,'adaptivePlan')?options.adaptivePlan:root.document?root.IELTSAdaptivePlan:null;
 const contextPractice=options.contextPractice||(root.document?root.IELTSPublicContextPractice:null),resolveMaterial=id=>data?.materials.find(m=>m.id===id)||contextPractice?.resolveMaterial?.(id,{data})||null;
 let publicStateRead=false,publicStateValue;const publicState=()=>{if(!publicStateRead){publicStateValue=adaptivePlan?.publicCourseState?.();publicStateRead=true;}return publicStateValue;};
 const currentDay=Number(options.currentDay)||days[0]?.day||1,today=options.today||year?.dateKey(options.now??Date.now()),budget=options.budget||year?.calendarBudget(records,drafts,today)||{remainingMinutes:360,spentMinutes:0,exhausted:false};
 if(budget.budgetError)return{budget,entries:[],next:{kind:'blocked',label:'档案已更新，请刷新继续',reason:budget.budgetError},reason:budget.budgetError};
 if(!data||!hub||!player)return{budget,entries:[],next:null,reason:'课程状态组件未准备好。'};
 let placement;try{placement=year?.placementRoute?.(data,options)||(options.placement||root.IELTSPlacement)?.currentRoute?.(data)||null;}catch(error){return{budget,entries:[],next:{kind:'blocked',label:'入学测评起点尚未核实',reason:error.message},reason:error.message};}
 const summaryForDay=options.summaryForDay||(options.courseDayOnly===true?((n)=>{const read=root.IELTSMistakes?.forDay;return typeof read==='function'?read(n):undefined;}):((n)=>root.IELTSMistakes?.forDay(n)||{completionValid:false,remaining:0})),corrected=record=>{try{return options.recordCorrectionStatus?.(record)?.corrected===true;}catch(_){return false;}},nativeHub=dependency('IELTSTodayHub','./today-hub.js'),sharedHub=!!hub&&(hub===nativeHub||!!nativeHub&&hub.taskState===nativeHub.taskState&&hub.latestForMaterial===nativeHub.latestForMaterial&&hub.taskStateAndLatest===nativeHub.taskStateAndLatest),cache=new Map();
 function inspect(day){
  if(cache.has(day.day))return cache.get(day.day);day=options.getDay?.(day)||day;
  let summary;try{summary=summaryForDay(day.day)||{};}catch(_){summary={completionValid:false,remaining:0,unreadable:true};}
  // The narrow query treats an unreadable or malformed recap/mistake summary as unknown.
  // The full build keeps its display-compatibility fallback.
  if(options.courseDayOnly===true&&!(summary&&typeof summary==='object'&&typeof summary.completionValid==='boolean'&&Number.isFinite(summary.remaining)&&summary.remaining>=0&&summary.unreadable!==true))summary={completionValid:false,remaining:0,unreadable:true};
  const own=records.filter(r=>r?.dayNumber===day.day),readiness=player.dayReadiness({...data,days:[day]},day.day,own,{hub,recordCorrectionStatus:options.recordCorrectionStatus}),latestByTask=new Map(),taskOptions={data,dayNumber:day.day,materials:data.materials,completionValid:summary.completionValid===true,recordCorrectionStatus:options.recordCorrectionStatus},states=day.tasks.map(task=>{let state,latest;if(sharedHub&&typeof hub.taskStateAndLatest==='function'){const pair=hub.taskStateAndLatest(task,own,taskOptions);state=pair.state;latest=pair.latest;}else{state=hub.taskState(task,own,taskOptions);latest=hub.latestForMaterial(task,own,day.day,data.materials,data);}latestByTask.set(task.id,latest);return{task,...state}});
  // Reuse the normal objective grader while mistake capture is still updating.
  // A cached result or an old recap token must not turn an incorrect answer into completion.
  const errors=[];
  for(const state of states.filter(s=>s.task.id!=='reflection'))for(const record of (latestByTask.get(state.task.id)||new Map()).values()){
   if(corrected(record))continue;const material=resolveMaterial(record.materialId);
   if(['reading','listening','grammar'].includes(material?.skill)){try{const artifact=hub.artifact(record.answer),grade=assessment.gradeMaterialForArtifact?assessment.gradeMaterialForArtifact(material,artifact):assessment.gradeMaterial(material,artifact?.answers||{});if(grade.allGradable&&grade.answered===grade.total&&grade.correct<grade.total)errors.push(record);}catch(_){}}
   else if(material?.skill==='vocabulary'){try{const vocabulary=options.vocabulary||dependency('IELTSVocabularyPractice','./vocabulary-practice.js'),verified=vocabulary?.verifyTrainingArtifact(hub.artifact(record.answer),material);if(verified?.submitted&&!verified.mastered)errors.push(record);}catch(_){}}
  }
  const essential=day.day===currentDay?root.IELTSEssentialCourse?.state?.({day:day.day,data,records,drafts,budget,now:options.now,dayPlan:day,completionValid:summary.completionValid}):null;
  const essentialRequired=essential?.historical?false:day.requirements?.essential===true||essential?.required===true;
  if(essentialRequired&&essential?.applicable&&!essential.done){readiness.ready=false;readiness.reason='请先完成今天安排的8000词训练份额；原稿保留，未完成部分按预算顺延。';const vocabulary=states.find(s=>s.task.id==='vocabulary');if(vocabulary){vocabulary.done=false;vocabulary.essential=essential;}}
  const reflection=states.find(s=>s.task.id==='reflection'),done=readiness.ready&&errors.length===0&&!summary.remaining&&!summary.unreadable&&(reflection?reflection.done:summary.completionValid===true);
  const result={day,own,states,summary,errors,readiness,done,essential,essentialRequired};cache.set(day.day,result);return result;
 }
 const current=days.find(d=>d.day===currentDay)||days[0],currentState=current?inspect(current):null;
 const requested=Number(options.selectedDay),selected=days.find(day=>day.day===requested&&currentDay>=day.day),schedule=options.courseDayOnly&&!selected?null:calendarSchedule({...options,data,yearPlanner:year,route:placement}),selection=selected&&player.courseSelectionAccess?.(data,records,selected.day,{...options,scheduledDay:schedule?.scheduledDay,yearPlanner:year,assessment,placement:options.placement||{currentRoute:()=>placement}}),selectedFloor=selection?.allowed?selected.day:null,first=days.find(day=>(!placement||day.day>=placement.startDay)&&(!selectedFloor||day.day>=selectedFloor)&&!inspect(day).done),state=first?inspect(first):null,target=state?.day;
 if(options.courseDayOnly)return{budget,placement,courseDay:target?.day||null,currentComplete:currentState?.done===true,unreadable:[...cache.values()].some(item=>item.summary?.unreadable===true),reason:''};
 const historical=days.filter(day=>day.day<(target?.day||currentDay)&&(!placement||day.day>=placement.startDay||records.some(record=>record.dayNumber===day.day)||drafts.some(draft=>draft.courseDay===day.day))&&!inspect(day).done).map(day=>({day:day.day,week:day.week,remainingMistakes:inspect(day).summary.remaining||0,missingMaterials:inspect(day).states.filter(item=>item.task.id!=='reflection').reduce((sum,item)=>sum+item.missingMaterialIds.length,0)}));
 const entries=[],add=entry=>{if(entry)entries.push(entry);},started=day=>records.some(r=>r.dayNumber===day.day)||drafts.some(d=>d.courseDay===day.day),materialMap=new Map(data.materials.map(m=>[m.id,m]));
 const canonicalMaterialGet=materialMap.get.bind(materialMap);materialMap.get=id=>canonicalMaterialGet(id)||contextPractice?.resolveMaterial?.(id,{data})||null;materialMap.has=id=>!!materialMap.get(id);
 const base=(day,taskId,materialId)=>({day:day.day,taskId,materialId});
 const flow=dependency('IELTSCourseExpansion','./course-expansion.js'),orderedMissing=(task,ids,number)=>(flow?.orderedMaterialIds?.(task,number)||task.materialIds||[]).filter(id=>ids.includes(id));
 function materialAction(day,task,id){
  const material=materialMap.get(id),draft=typeof player.preferredDraft==='function'?player.preferredDraft(drafts,{courseDay:day.day,taskId:task.id,materialId:id,material,records}):drafts.find(d=>d.courseDay===day.day&&d.taskId===task.id&&d.materialId===id&&!records.some(r=>r.id===d.id));
  let access;try{access=options.materialAccess?.(material)||player.protectedMaterialAccess(material,records,data.materials,{assessment,exposures:options.exposures,now:options.now,data,placement:options.placement});}catch(_){access={allowed:false,reason:'材料解锁状态暂不可核对。'};}
  const assignment=task.publicCourseAssignments?.find(a=>a.materialId===id);
  if(assignment&&!draft){const contract=adaptivePlan?.publicMaterialStatus?.(material,assignment,day.day);if(contract?.allowed===false)access=contract;else{const ownerAssignment=day.publicCourse?.assignments.find(a=>a.materialId===id)||assignment,admitted=player.publicPracticeAccess(material,day,data,records,{...options,route:placement,assignment:ownerAssignment,ownerDayFrozen:started(day),assessment});if(!admitted.allowed)access=admitted;}}
  const grammarAssignment=task.contextPracticeAssignments?.find(a=>a.materialId===id);if(grammarAssignment&&!draft){const ready=contextPractice?.beginAccess?.(material,grammarAssignment,{...options,data,records,assessment});if(!ready?.allowed)access={allowed:false,reason:ready?.reason||'语境语法组件或关联原稿尚未就绪，原任务保留。'};}
  if(day.day>=2&&!started(day)&&!draft){const state=publicState();if(state?.available&&!state.ready)access={allowed:false,reason:state.pending[0]?.reason||'正在更新后续听读课程，请稍后重试。'};}
  return{...base(day,task.id,id),kind:access.allowed?'material':'blocked',draftId:draft?.id,...(assignment?{publicCourseRequired:true,required:true,courseAssignment:assignment}:{}),...(grammarAssignment?{contextPracticeRequired:true,required:true,contextPracticeAssignment:grammarAssignment}:{}),label:access.allowed?(draft?'继续未提交草稿：':day.day===currentDay?'继续学习：':'继续第 '+day.day+' 课：')+NAMES[task.id]:'等待材料核对',reason:access.allowed?'按真实作答继续；建议分钟不设最低用时。':access.reason,title:material?.title||NAMES[task.id]};
 }
 // Preserve optional public-source drafts outside frozen core materialIds.
 // Resuming a real draft takes priority over opening a new supplemental item.
 for(const draft of drafts.filter(d=>materialMap.get(d.materialId)?.source?.publicSourceId&&!contextPractice?.isContextMaterial?.(materialMap.get(d.materialId))&&!records.some(r=>r.id===d.id)).sort((a,b)=>(a.materialId===options.current?.materialId?-1:0)-(b.materialId===options.current?.materialId?-1:0)||String(a.startedAt).localeCompare(String(b.startedAt)))){
  const rawOwner=days.find(d=>d.day===draft.courseDay),owner=rawOwner&&inspect(rawOwner).day;if(!owner||!owner.tasks.some(t=>t.id===draft.taskId))continue;const m=materialMap.get(draft.materialId),core=owner.tasks.some(t=>t.id===draft.taskId&&(t.coreMaterialIds||t.materialIds).includes(draft.materialId));if(core&&owner.day===target?.day)continue;
  add({...base(owner,draft.taskId,draft.materialId),kind:core?'material':'extra',entry:{kind:'public-practice',materialId:m.id,skill:m.skill,mode:'practice'},draftId:draft.id,publicSupplement:true,retained:true,optional:!core,required:core,title:m.title,label:'继续公开素材草稿：'+NAMES[m.skill],reason:'原始答案、音频进度与课程归属保留；旧草稿不会增加原课程完成门槛。'});
 }
 let blockedReason='',extraDay=placement?state?.day||currentState?.day||current:currentState?.day||current;
 if(placement&&!selectedFloor){
  const active=options.current,offCore=active?.day!==target?.day||!state?.states.some(s=>s.task.id===active?.taskId&&s.missingMaterialIds.includes(active?.materialId)),activeDay=active?.active&&!active.submitted&&offCore?days.find(d=>d.day===active.day):null,activeTask=activeDay&&inspect(activeDay).day.tasks.find(t=>t.id===active.taskId);
  if(activeTask&&(active.taskId!=='reflection'||inspect(activeDay).summary.remaining>0))add(materialAction(inspect(activeDay).day,activeTask,active.materialId));
  for(const day of days.filter(d=>d.day<placement.startDay)){
   const old=inspect(day),reflection=old.day.tasks.find(t=>t.id==='reflection');if(old.summary.remaining>0&&reflection&&!entries.some(e=>e.day===day.day&&e.taskId==='reflection'))add({...base(old.day,'reflection',reflection.materialIds?.[0]),kind:'reflection',label:'先订正保留的第 '+day.day+' 课错题',reason:'入学起点不会清除历史错误；订正后继续匹配程度的课程，不要求补做未开始的基础材料。'});
  }
  for(const draft of drafts.filter(d=>d.courseDay<placement.startDay&&!records.some(r=>r.id===d.id)).sort((a,b)=>String(a.startedAt).localeCompare(String(b.startedAt)))){
   const day=days.find(d=>d.day===draft.courseDay),task=day&&inspect(day).day.tasks.find(t=>t.id===draft.taskId);if(!task||!materialMap.has(draft.materialId)||draft.taskId==='reflection'&&!(inspect(day).summary.remaining>0)||entries.some(e=>e.day===day.day&&e.taskId===draft.taskId&&e.materialId===draft.materialId))continue;add({...materialAction(inspect(day).day,task,draft.materialId),retained:true,reason:'继续入学测评前已开始的这份草稿；其余未开始的基础课仍可回看，不纳入新起点必做量。'});
  }
 }
 if(state){
  if(target.week>1&&!started(target)){
   const previous=days.filter(d=>d.day<target.day).at(-1);if(previous&&previous.week<target.week){
    let access;try{access=options.weekAccess?.(target,previous)||year?.progression(data,records,{...options,now:options.now,currentWeek:previous.week,verifiedRecord:options.verifiedRecord,placement:options.placement});}catch(_){access={unlockedWeek:previous.week};}
    if(!access||access.allowed===false||Number.isFinite(access.unlockedWeek)&&access.unlockedWeek<target.week){blockedReason=access?.reason||access?.next?.reasons?.join('；')||'前置关卡或延迟保持证据尚未齐全，先继续同级补强。';extraDay=previous;}
   }
  }
  if(blockedReason)add({...base(target,'reflection',null),kind:'blocked',label:'前置证据待补齐',reason:blockedReason});
  else{
   const essential=state.essential;
   if(state.essentialRequired&&essential?.applicable&&!essential.done)add({...base(target,'vocabulary','essential-daily'),kind:'essential-vocabulary',required:true,label:essential.label,reason:essential.message,href:essential.href,estimatedMinutes:essential.estimatedMinutes});
   const reflection=state.states.find(s=>s.task.id==='reflection');
   const needsCorrection=state.errors.length||state.summary.remaining>0,missingCore=state.states.some(item=>item.task.id!=='reflection'&&item.missingMaterialIds.length),correction=needsCorrection&&reflection?{...base(target,'reflection',reflection.nextMaterialId),kind:'reflection',label:'先完成错题订正',reason:'真实错误须订正通过，原始尝试和待评状态保留。'}:null;
   if(correction&&!missingCore)add(correction);
   const active=options.current;
   const activeState=active?.active&&!active.submitted&&active.day===target.day?state.states.find(s=>s.task.id===active.taskId&&s.missingMaterialIds.includes(active.materialId)):null;
   if(activeState)add(materialAction(target,activeState.task,active.materialId));
   const pendingDrafts=drafts.filter(d=>d.courseDay===target.day&&!records.some(r=>r.id===d.id)).sort((a,b)=>String(a.startedAt).localeCompare(String(b.startedAt)));
   for(const draft of pendingDrafts){const item=state.states.find(s=>s.task.id===draft.taskId&&s.missingMaterialIds.includes(draft.materialId));if(item&&!entries.some(e=>e.materialId===draft.materialId&&e.taskId===draft.taskId))add(materialAction(target,item.task,draft.materialId));}
   const currentTask=options.current?.day===target.day?state.states.find(s=>s.task.id===options.current.taskId&&s.task.id!=='reflection'):null;
   for(const id of currentTask?orderedMissing(currentTask.task,currentTask.missingMaterialIds,target.day):[])if(!entries.some(e=>e.materialId===id&&e.taskId===currentTask.task.id))add(materialAction(target,currentTask.task,id));
   for(const item of state.states.filter(s=>s.task.id!=='reflection')){
    for(const id of orderedMissing(item.task,item.missingMaterialIds,target.day))if(!entries.some(e=>e.taskId===item.task.id&&e.materialId===id))add(materialAction(target,item.task,id));
    if(item.pending)add({...base(target,item.task.id,item.pendingMaterialIds?.[0]||item.nextMaterialId),kind:'view',waiting:true,label:'查看待评作品：'+NAMES[item.task.id],reason:'评阅或订正尚未完成，不会当作通过。'});
   }
   if(correction&&missingCore)add({...correction,label:'最后完成本课错题订正',reason:'先继续本课学习与原稿，错题保留在最后一步统一订正；不会自动清除或记为通过。'});
   if(reflection&&!state.done&&!entries.some(e=>e.kind==='reflection'))add({...base(target,'reflection',reflection.nextMaterialId),kind:state.readiness.ready?'reflection':'blocked',label:state.readiness.ready?'完成本课每日复盘':'复盘等待核心任务与评阅',reason:state.readiness.reason});
  }
 }
 const optionalEssential=currentState?.essential;
 if(optionalEssential?.applicable&&!optionalEssential.done&&!currentState.essentialRequired){
  const review=optionalEssential.plan?.due?.length>0,entry={dueReview:review,...base(currentState.day,'vocabulary','essential-daily'),kind:'essential-vocabulary',optional:true,required:false,label:'可选：'+optionalEssential.label,reason:'本日保留原计划完成状态。'+optionalEssential.message,href:optionalEssential.historical&&target?'词汇记忆.html?day='+target.day+'&reviewFrom='+currentState.day.day+(root.IELTSProfiles?.isPreview?.()?'&preview=1':''):optionalEssential.href,estimatedMinutes:optionalEssential.estimatedMinutes};
  if(review)entries.unshift(entry);else add(entry);
 }
 // Daily memory debt is mandatory even while an earlier core lesson is still
 // open, or the displayed historical lesson has already been completed. It
 // does not change that lesson's saved contract or score. Waiting retries keep
 // their interval; other core input may proceed while the retry is not due.
 if(optionalEssential?.dailyReviewRequired){
  const reviewOwner=optionalEssential.historical&&target?target:currentState.day,reviewHref=optionalEssential.historical&&target?'词汇记忆.html?day='+target.day+'&reviewFrom='+currentState.day.day+(root.IELTSProfiles?.isPreview?.()?'&preview=1':''):optionalEssential.href;
  for(let i=entries.length-1;i>=0;i--)if(entries[i].materialId==='essential-daily')entries.splice(i,1);
  entries.unshift({...base(reviewOwner,'vocabulary','essential-daily'),kind:optionalEssential.reviewWaiting?'blocked':'essential-vocabulary',dueReview:true,dailyRequirement:true,optional:false,required:true,waiting:optionalEssential.reviewWaiting===true,label:optionalEssential.label,reason:optionalEssential.message,href:reviewHref,estimatedMinutes:optionalEssential.estimatedMinutes,nextRetryAt:optionalEssential.plan?.nextRetryAt||null});
 }
 // An already-active core draft and due review retain priority. Saved public
 // drafts precede only unstarted units, never an active core or due review.
 const activeCore=options.current?.active&&!options.current.submitted?entries.find(e=>!e.publicSupplement&&e.materialId===options.current.materialId):null;
 if(activeCore&&entries.some(e=>e.publicSupplement&&e.draftId)){entries.splice(entries.indexOf(activeCore),1);entries.unshift(activeCore);}
 const dueEssential=entries.find(e=>e.kind==='essential-vocabulary'&&currentState?.essential?.plan?.due?.length);
 if(dueEssential&&entries.some(e=>e.publicSupplement&&e.draftId)){entries.splice(entries.indexOf(dueEssential),1);entries.unshift(dueEssential);}
 const supplement=options.lessonVocabularySupplement||(root.document?root.IELTSLessonVocabularySupplement:null),supplementDay=target||currentState?.day;
 if(supplement&&supplementDay){
  let offered;try{offered=supplement.plan({...options,data,day:supplementDay,ownerComplete:!!blockedReason||!target||state?.done,adaptive:adaptivePlan,records,drafts,budget});}catch(_){offered={pending:true,reason:'补充词汇状态待核验，原课程保留。'};}
  if(offered?.available){const owner=offered.day||supplementDay.day;add({day:owner,taskId:'vocabulary',materialId:offered.material.id,kind:'extra',entry:{kind:'lesson-vocabulary-supplement',skill:'vocabulary',materialId:offered.material.id,lessonSupplement:offered.contract,strategy:'第2课新增7个原句词；三写三读与三轮测试按完整7词进行，原稿归当前课次。'},lessonSupplement:true,optional:true,required:false,draftId:offered.draftId,title:'第2课新增7词',label:offered.draftId?'继续第2课新增词草稿':'可选：补学第2课新增7词',reason:'使用已审核原句；本次原稿、错题与用时归第 '+owner+' 课，不改变旧课完成状态。'});}
  else if(offered?.pending)add({day:supplementDay.day,taskId:'vocabulary',materialId:supplement.ID,kind:'blocked',lessonSupplement:true,optional:true,required:false,title:'第2课新增7词待补',label:'第2课新增7词待补',reason:offered.reason});
 }
 // A reviewed family unit joins this same required queue; no optional homepage.
 const family=options.familyLessons===false?null:root.IELTSFamilyLessonExpansionV95?.runtime?.();
 // A selected or calendar day must not put a future unit ahead of unfinished
 // learning. A verified placement route remains the floor; old drafts stay above.
 const familyDay=days.find(item=>(!placement||item.day>=placement.startDay)&&!inspect(item).done)?.day||currentDay;
 for(const entry of family?.queueEntries({...options,data,records,drafts,budget,currentDay:familyDay,getDay:options.getDay})||[]){
  if(entries.some(e=>e.materialId===entry.materialId))continue;
  if(entry.familyVocabularyContinuation)for(let i=entries.length-1;i>=0;i--)if(entries[i].kind==='essential-vocabulary'&&!entries[i].dueReview&&entries[i].materialId==='essential-daily')entries.splice(i,1);
  let vocabularyMinutes,estimatePending=false;
  if(entry.familyVocabularyContinuation){try{const E=root.IELTSEssentialVocabulary,M=root.IELTSMemory,catalog=root.IELTS_ESSENTIAL_VOCABULARY;if(!E?.plan||!M?.read||!catalog)throw Error('vocabulary budget pending');const plan=E.plan(M.read(),{data:catalog,records,courseDay:entry.day,now:options.now??Date.now(),remainingMinutes:budget.remainingMinutes,timerState:options.timerState,timerCore:options.timerCore});vocabularyMinutes=plan?.quota?.newWordMinutes;if(!Number.isFinite(vocabularyMinutes)||vocabularyMinutes<=0)throw Error('vocabulary budget pending');}catch(_){estimatePending=true;}}
  const blocked=Boolean(entry.kind!=='view'&&(entry.waiting||estimatePending||entry.taskId==='vocabulary'&&currentState?.essential?.dailyReviewRequired));
  // The entry opens EA, which sizes the next group against the current budget.
  // Its minimum start window is one actually estimated word, not the old
  // whole-module allocation; due debt and EA's own admission remain binding.
  add({...entry,...(entry.familyVocabularyContinuation&&!estimatePending?{estimatedMinutes:vocabularyMinutes}:{}),kind:blocked?'blocked':entry.kind,waiting:blocked,label:blocked?'新增任务等待来源、预算或到期复习':entry.label,reason:blocked?'保留原课与新原稿；先核对真实来源、预算、订正和到期复习。':entry.familyVocabularyContinuation?'先复习到期词；已学词不重复初学，实际小组按剩余预算确定，来源不足的差额待补。':'已审核的普通补充任务；原课合同和成绩保留。'});
 }
 const retainedDraft=entries.find(e=>e.draftId&&!e.familyLessonSupplement&&!e.familyVocabularyContinuation);
 const familyFirst=entries.find(e=>e.familyVocabularyContinuation&&e.kind==='essential-vocabulary')||entries.find(e=>e.partialOriginal&&e.familyLessonSupplement&&e.kind==='family-lesson-supplement'&&!e.waiting);
 if(familyFirst&&!activeCore&&!retainedDraft&&!entries.some(e=>e.dueReview)){entries.splice(entries.indexOf(familyFirst),1);entries.unshift(familyFirst);}
 // Extra work remains separate from core completion. Reuse planner eligibility,
 // then admit each actual learning unit with its own completion-time prediction.
 let plan;try{plan=options.extraPlan?.(extraDay,{...budget,remainingMinutes:360,spentMinutes:0});}catch(_){}
 for(const entry of plan?.retained||[]){const draft=drafts.find(d=>d.materialId===entry.materialId);if(!draft||entries.some(e=>e.materialId===entry.materialId))continue;add({...base(days.find(d=>d.day===draft.courseDay)||extraDay,entry.skill,entry.materialId),kind:'extra',entry,draftId:draft.id,label:'继续已有补强草稿：'+NAMES[entry.skill],reason:'原始输入与课程归属保留。'});}
 for(const entry of plan?.tasks||[]){const material=materialMap.get(entry.materialId);if(!['new-practice','reinforcement','progression'].includes(entry.kind)||material?.pool!=='training'||material.source?.publicSourceId||material.source?.familyLessonV95||family?.claimsMaterial?.(material.id,data,extraDay.day)||entries.some(e=>e.materialId===entry.materialId)||entry.kind==='progression'&&blockedReason)continue;add({...base(extraDay,entry.skill,entry.materialId),kind:'extra',entry,label:'继续同级新材料：'+NAMES[entry.skill],reason:entry.reason||'根据真实表现补充独立练习，不替代核心课程。'});}
 for(const entry of placementChallenges({data,route:placement,day:extraDay,records,drafts,exposures:options.exposures,excludedMaterialIds:entries.map(e=>e.materialId)})){const material=materialMap.get(entry.materialId);if(material?.source?.familyLessonV95||family?.claimsMaterial?.(entry.materialId,data,extraDay.day))continue;let access;try{access=options.materialAccess?.(material)||player.protectedMaterialAccess(material,records,data.materials,{assessment,exposures:options.exposures,now:options.now,data,placement:options.placement});}catch(_){access={allowed:false};}if(!access.allowed)continue;add({...base(extraDay,entry.skill,entry.materialId),kind:'extra',entry,placementChallenge:true,optional:true,title:material.title,label:'可选：'+entry.level+' '+NAMES[entry.skill]+'适级挑战',reason:entry.reason});}
 if(optionalEssential?.reviewWaiting)for(const entry of entries){if(entry.taskId==='vocabulary'&&!entry.draftId&&!entry.dailyRequirement&&['material','extra','essential-vocabulary'].includes(entry.kind)){entry.kind='blocked';entry.waiting=true;entry.label='词汇新稿等待必做复习';entry.reason='错词仍在规定回忆间隔内，任务保留。先继续语法、听读或输出练习，待间隔结束再复习；不创建新的词汇原稿。';}}
 for(const entry of entries){if(['blocked','view'].includes(entry.kind))continue;const day=days.find(d=>d.day===entry.day),task=day?.tasks.find(t=>t.id===entry.taskId),material=materialMap.get(entry.materialId);entry.estimate=prediction(entry.kind==='essential-vocabulary'?{skill:'vocabulary',estimatedMinutes:entry.estimatedMinutes}:material,task,records,{...options,yearPlanner:year,materials:data.materials});const nextCourse=currentState?.done&&entry.day>currentDay&&!started(day)&&!entry.draftId,focusMinutes=options.timerState?.settings?.focusMinutes||25,windowStudy=nextCourse?Math.max(entry.estimate.studyMinutes,focusMinutes):entry.estimate.studyMinutes,timer=options.timerCore||dependency('IELTSStudyTimerCore','./study-timer-core.js'),window=timer?.forecast(windowStudy,options.timerState);entry.startWindowMinutes=nextCourse?(window?.totalMinutes||windowStudy):entry.estimate.totalMinutes;entry.nextCourseWindow=nextCourse;entry.fitsBudget=entry.startWindowMinutes+(entry.familyLessonSupplement?15:0)<=budget.remainingMinutes+.001;}
 // Fresh public materials enter only through their required day task.
 // Previously saved drafts above remain recoverable with their owner contract.
 const publicPractice={status:'scheduled-course-tasks-only',selected:[],optional:false,discoveryRemoved:true};
 let challengeRoom=Math.max(0,budget.remainingMinutes-entries.filter(e=>!e.placementChallenge).reduce((sum,e)=>sum+(e.estimate?.totalMinutes||(['view','blocked'].includes(e.kind)?Number(days.find(d=>d.day===e.day)?.tasks.find(t=>t.id===e.taskId)?.minutes)||15:0)),0)-(plan?.reservedMemoryMinutes||0));
 for(let i=0;i<entries.length;i++){const entry=entries[i];if(!entry.placementChallenge)continue;if(entry.startWindowMinutes>challengeRoom+.001){entries.splice(i--,1);continue;}entry.availableOptionalMinutes=challengeRoom;entry.fitsBudget=true;challengeRoom-=entry.startWindowMinutes;}
 const actionable=entries.find(e=>!['blocked','view'].includes(e.kind)),admitted=actionable?.fitsBudget?actionable:null,next=admitted||(!actionable?entries.find(e=>e.kind==='view')||entries[0]:null)||null;
 const deferred=actionable&&!admitted?{kind:'rest',label:'今天到此，休息后下一日继续',reason:'下一学习单元预计需要 '+actionable.startWindowMinutes.toFixed(1)+' 分钟'+(actionable.nextCourseWindow?'（新课至少预留一轮完整专注及必要休息）':'（含计划休息）')+'，今天剩余 '+Math.max(0,budget.remainingMinutes).toFixed(1)+' 分钟不足。队列和未完成草稿已保留；下一日继续。',estimate:actionable.estimate}:null;
 const result={budget,entries,placement,schedule,historical,publicPractice,reservedDueStudyMinutes:Math.max(0,Number(plan?.reservedMemoryMinutes)||0),next:budget.dayEnded?{kind:'day-ended',label:'今日学习已结束，可恢复今日任务',reason:'未完成任务、草稿和原音按原课程归属保留。误结束时可在番茄钟点击“恢复今日任务”后手动继续，实际已用预算不变；也可下一日续做，不会重复添加任务或记为已完成。'}:budget.exhausted?{kind:'budget',label:'今日预算已用完，下一日继续',reason:'队列、草稿和作品保留；下一日恢复360分钟总预算。'}:next||deferred,currentComplete:currentState?.done===true,courseDay:target?.day||null,continuing:!budget.exhausted&&!!next&&next.day!==currentDay,pending:state?.states.some(s=>s.pending)||false,reason:blockedReason||(!target?'全部课程已提交，继续核对年度准备度与长期保持证据。':state?.done?'':state?.readiness.reason||'')};
 const yearCourse=options.yearCourse||(root.document?root.IELTSYearFirstUseCourse:null);return options.yearFirstUse===false||!yearCourse?.appendToLoad?result:yearCourse.appendToLoad(result,options);
}
return Object.freeze({build,prediction,placementChallenges,calendarSchedule,NAMES});
});
