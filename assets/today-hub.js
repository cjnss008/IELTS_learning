(function(root,factory){'use strict';const api=factory(root);root.IELTSTodayHub=api;if(typeof module==='object'&&module.exports)module.exports=api;if(root.document?.getElementById('todayOverview'))api.mount();})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
const vocabulary=root.IELTSVocabularyPractice||(typeof require==='function'?require('./vocabulary-practice.js'):null);
const NAMES={vocabulary:'词汇',grammar:'语法',listening:'听力',reading:'阅读',speaking:'口语',writing:'写作',reflection:'错题复盘'};
function lessonTheme(day,data){const materials=new Map((data.materials||[]).map(item=>[item.id,item])),reading=day.tasks.find(task=>task.id==='reading'),listening=day.tasks.find(task=>task.id==='listening'),source=(reading?.materialIds||day.tasks[0]?.materialIds||[]).map(id=>materials.get(id)).find(item=>item?.title),listenIds=listening?.materialIds||[],fresh=listenIds.find(id=>listening.materialPractice?.find(entry=>entry.materialId===id)?.cycle!=='scheduled-reuse'),audio=materials.get(fresh||listenIds[0]);return{title:source?.title||day.title,listening:audio?.title||'',newMaterials:day.tasks.flatMap(task=>(task.materialPractice||[]).filter(entry=>entry.cycle==='first-planned').map(entry=>entry.materialId)).length,reusedMaterials:day.tasks.flatMap(task=>(task.materialPractice||[]).filter(entry=>entry.cycle==='scheduled-reuse').map(entry=>entry.materialId)).length};}
function artifact(answer){if(typeof answer!=='string'||answer.length>1048576)return null;try{const value=JSON.parse(answer);return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}catch(_){return null;}}
function recordTime(record){const value=Date.parse(record.submittedAt||record.createdAt);return Number.isFinite(value)?value:null;}
function latestForMaterial(task,records,dayNumber,materials=[],data){
 const player=root.IELTSCoursePlayer||(typeof require==='function'?require('./course-player.js'):null),context=data||root.IELTSCurriculumData||{materials,days:[]};
 const required=new Set(task.materialIds||[]),byMaterial=new Map();
 for(const record of Array.isArray(records)?records:[]){
  if(!record||record.taskId!==task.id||record.kind==='retest'||!required.has(record.materialId)||dayNumber!==undefined&&record.dayNumber!==dayNumber||record.skill&&record.skill!==task.id)continue;
  if(!['pass','revise','pending','unverified'].includes(record.evaluation?.result)||recordTime(record)===null)continue;
  if(!(typeof record.answer==='string'&&record.answer.trim())&&!record.media?.length)continue;
  const contextPractice=root.IELTSPublicContextPractice||(typeof require==='function'?require('./public-context-practice.js'):null),material=materials.find(item=>item.id===record.materialId)||contextPractice?.resolveMaterial?.(record.materialId,{data:context})||root.IELTSYearFirstUseCourse?.resolveMaterial?.(record.materialId);
  const assignment=task.publicCourseAssignments?.find(a=>a.materialId===record.materialId);if(assignment&&!player?.submissionSatisfied?.(record,material,{assignment}))continue;
  const grammarAssignment=task.contextPracticeAssignments?.find(a=>a.materialId===record.materialId);if(grammarAssignment&&!contextPractice?.submissionSatisfied?.(record,grammarAssignment))continue;
  if(['reading','listening','grammar'].includes(task.id)&&!player?.objectiveSubmissionComplete?.(record,material))continue;
  if(task.id==='listening'&&artifact(record.answer)?.audioCompleted!==true)continue;
  if(task.id==='speaking'&&!player?.verifySpeakingStage?.(record,material,task,context,dayNumber??record.dayNumber)?.submitted)continue;
  if(task.id==='vocabulary'&&!vocabulary?.verifyTrainingArtifact?.(artifact(record.answer),materials.find(item=>item.id===record.materialId))?.submitted)continue;
  const previous=byMaterial.get(record.materialId);
  const rank=value=>[recordTime(value),Number(value.version)||0,String(value.id||'')];
  const a=rank(record),b=previous?rank(previous):null;
  if(!b||a[0]>b[0]||a[0]===b[0]&&(a[1]>b[1]||a[1]===b[1]&&a[2]>b[2]))byMaterial.set(record.materialId,record);
 }
 return byMaterial;
}
function taskState(task,records,options={}){
 const flow=root.IELTSCourseExpansion||(typeof require==='function'?require('./course-expansion.js'):null),required=[...new Set(flow?.orderedMaterialIds?.(task,options.dayNumber)||task.materialIds||[])],latest=latestForMaterial(task,records,options.dayNumber,options.materials||options.data?.materials||root.IELTSCurriculumData?.materials||[],options.data);
 if(task.id==='reflection'){
  const annual=options.dayNumber===365&&(Array.isArray(records)?records:[]).some(r=>r.source==='year-review'&&r.materialId==='reflection-365'&&artifact(r.answer)?.yearSummary?.text?.trim().length>=20);const done=annual||options.completionValid===true;return{done,pending:false,count:done?1:0,total:1,missingMaterialIds:done?[]:required,nextMaterialId:required[0]||null};
 }
 const plan=root.IELTSPlanState||(typeof require==='function'?require('./daily-plan-state.js'):null);
 const missingMaterialIds=required.filter(id=>!latest.has(id)),pendingIds=required.filter(id=>{const record=latest.get(id);if(!record)return false;let corrected=false;try{corrected=options.recordCorrectionStatus?.(record)?.corrected===true;}catch(_){}if(corrected)return false;if(['writing','speaking'].includes(task.id)){try{return !plan?.validLinkedReview?.(record);}catch(_){return true;}}return record.evaluation?.result==='pending';});
 const legacyTraining=task.id==='vocabulary'&&missingMaterialIds.some(id=>(Array.isArray(records)?records:[]).some(record=>record?.materialId===id&&record.taskId===task.id&&(options.dayNumber===undefined||record.dayNumber===options.dayNumber)&&((artifact(record.answer)?.trainingVersion??artifact(record.answer)?.trainingSchema??artifact(record.answer)?.schema)===1)));
 return{legacyTraining,done:required.length>0&&!missingMaterialIds.length&&!pendingIds.length,pending:pendingIds.length>0,pendingMaterialIds:pendingIds,count:required.length-missingMaterialIds.length,total:required.length,missingMaterialIds,nextMaterialId:missingMaterialIds[0]||pendingIds[0]||required[0]||null};
}
function chooseNext(states){return states.find(state=>!state.done&&state.missingMaterialIds.length)||states.find(state=>!state.done)||states.at(-1)||null;}
function hasDraft(taskId,materialId,drafts,current={}){
 if(current.active&&!current.submitted&&current.taskId===taskId&&current.materialId===materialId)return true;
 return(Array.isArray(drafts)?drafts:[]).some(draft=>draft.taskId===taskId&&draft.materialId===materialId&&draft.submitted!==true);
}
function mount(){
 const doc=root.document,$=id=>doc.getElementById(id),R=root.IELTSRecords,data=root.IELTSCurriculumData,navigation=root.IELTSTodayNavigation;
 if(!$('todayOverview')||!R||!data||!navigation)return null;
 let current={...navigation.current()},dailyRecords=[],next=null,loading=0,starting=false,allDone=false,states=[],openingExtra=false,openingCourse=false,learningQueue=null;
 function summary(){try{return root.IELTSMistakes?.forDay(current.day)||{completionValid:false,remaining:0};}catch(error){$('todayAdvice').textContent='错题状态未读取：'+error.message;return{completionValid:false,remaining:0};}}
 function drafts(){try{return navigation.drafts?.()||[];}catch(_){return[];}}
 function node(tag,text,className){const element=doc.createElement(tag);if(text!==undefined)element.textContent=String(text);if(className)element.className=className;return element;}
 function planDay(base){try{return root.IELTSAdaptivePlan?.getDay?.(base)||base;}catch(_){return base;}}
 function renderAdaptive(day,own){
  const box=$('todayAdaptiveContent');if(!box)return;box.replaceChildren();
  if(navigation.budget?.()?.dayEnded){box.append(node('p','今天的学习已结束。当前任务、原稿和已有进度均保留；可在番茄钟点击“恢复今日任务”后手动继续，或下一日先续做未完成内容。实际已用预算不会重置。'));return;}
  const adaptive=root.IELTSAdaptivePlan;if(!adaptive?.planRemaining){box.append(node('p','提交真实练习后，再根据核对结果安排同级补强；时间仅供安排。'));return;}
  if(day.adaptation){box.append(node('h3','本日学习策略'),node('p',day.adaptation.reason));const strategies=(day.adaptation.strategies||[]).filter(strategy=>typeof strategy.action==='string');for(const strategy of strategies.slice(0,2))box.append(node('p',(NAMES[strategy.skill]||strategy.skill)+'：'+strategy.action));if(strategies.length>2){const details=node('details'),title=node('summary','查看其余学习策略');details.append(title);for(const strategy of strategies.slice(2))details.append(node('p',(NAMES[strategy.skill]||strategy.skill)+'：'+strategy.action));box.append(details);}}
  let plan;try{plan=adaptive.planRemaining(day,dailyRecords,undefined,{data,budgetMinutes:360,calendarBudget:navigation.budget?.(),exposures:navigation.exposures?.()||{},startedMaterialIds:drafts().map(draft=>draft.materialId)});}catch(error){box.append(node('p','个性化建议暂未更新：'+error.message+'。已有任务与草稿保留。'));return;}
  const amount=value=>Number.isFinite(value)?Math.max(0,value).toFixed(1).replace(/\.0$/,''):'0';
  box.append(node('p','剩余可用预算 '+amount(plan.remainingBudget)+' 分钟；为核心任务保留约 '+amount(plan.reservedCoreMinutes)+' 分钟。均为参考预算，可按掌握速度提前进入下一步。'));
  if(plan.reservedMemoryMinutes>0){box.append(node('p','另为已学词独立到期回忆保留参考 '+amount(plan.reservedMemoryMinutes)+' 分钟，计入同一360分钟预算；它不替代新词三写三读。'));const a=node('a','打开到期词汇记忆');a.href='词汇记忆.html'+(root.IELTSProfiles?.isPreview?.()?'?preview=1':'');box.append(a);}
  const coreIds=new Set(day.tasks.flatMap(task=>task.coreMaterialIds||task.materialIds||[]));
  const retained=(Array.isArray(plan.retained)?plan.retained:[]).filter(entry=>!coreIds.has(entry.materialId)).slice(0,1);
  const entries=(Array.isArray(plan.tasks)?plan.tasks:[]).filter(entry=>!(entry.kind==='verification'&&coreIds.has(entry.materialId))).slice(0,Math.max(0,2-retained.length));
  const quietFirstDay=day.day===1&&!day.adaptation&&!entries.length&&!retained.length;
  const target=chooseNext(states),unfinished=quietFirstDay?[]:target&&!target.done?[target]:[];
  if(unfinished.length){box.append(node('h3','下一份核心任务'));const core=node('div');for(const state of unfinished){const card=node('article',undefined,'course-record-row');card.append(node('strong',NAMES[state.task.id]),node('p',state.pending&&!state.missingMaterialIds.length?'最新作品待评阅，先查看结果。':state.legacyTraining?'旧版词汇原稿已保留，请完成新版三写三读与三轮测试。':'先完成本任务尚未提交的材料。'));const go=node('button',state.pending&&!state.missingMaterialIds.length?'查看待评作品':'继续核心任务');go.type='button';go.addEventListener('click',async()=>{go.disabled=true;try{if(state.pending&&!state.missingMaterialIds.length)await navigation.showLatestRecord?.(state.task.id,state.nextMaterialId);else await navigation.resumeNext(state.task.id,state.nextMaterialId);$('courseSession')?.scrollIntoView?.({behavior:'smooth',block:'start'});}catch(error){$('todayAdvice').textContent=error.message;}finally{go.disabled=false;}});card.append(go);core.append(card);}box.append(core);}
  if(retained.length)box.append(node('h3','保留的未提交练习'));
  for(const entry of retained){const material=data.materials?.find(item=>item.id===entry.materialId),card=node('article',undefined,'course-record-row');card.append(node('strong',material?.title||'未提交练习'),node('p','继续已有草稿，原始输入和曝光记录保留。'));const go=node('button','继续这份草稿');go.type='button';go.addEventListener('click',async()=>{try{const saved=(navigation.allDrafts?.()||drafts()).filter(d=>d.materialId===entry.materialId&&d.taskId===entry.skill&&d.submitted!==true).sort((a,b)=>String(b.startedAt||'').localeCompare(String(a.startedAt||'')))[0];if(!saved?.id)throw Error('未找到这份未提交草稿，请刷新后从草稿列表继续；不会新建练习。');if(typeof navigation.resumeDraft!=='function')throw Error('草稿恢复组件尚未就绪，请刷新页面后继续。');await navigation.resumeDraft(saved.id);$('courseSession')?.scrollIntoView?.({behavior:'smooth',block:'start'});}catch(error){$('todayAdvice').textContent=error.message;}});card.append(go);box.append(card);}
  if(entries.length)box.append(node('h3','剩余预算内的适级练习'));
  for(const entry of entries){const material=data.materials?.find(item=>item.id===entry.materialId);if(!material)continue;const card=node('article',undefined,'course-record-row');card.append(node('strong',material.title),node('p',entry.reason||plan.reason),node('p',entry.kind==='verification'?'参考首轮检查 '+amount(entry.estimatedMinutes)+' 分钟；打开原完整材料，须按完整任务实际作答后核对，估时以实际练习为准。':(NAMES[entry.skill]||entry.skill)+' · 参考估时 '+amount(entry.estimatedMinutes)+' 分钟；完成后按真实作答核对，不靠用时升级。'));
   const open=node('button',entry.kind==='verification'?'先验证／补练（打开原任务）':entry.kind==='reinforcement'?'开始同级补强':entry.kind==='progression'?'按先修继续下一周':'开始同级新练习');open.type='button';open.addEventListener('click',async()=>{if(openingExtra)return;openingExtra=true;open.disabled=true;try{if(typeof navigation.openExtra!=='function')throw Error('追加练习组件尚未就绪，请刷新后继续。');await navigation.openExtra({...entry});$('courseSession')?.scrollIntoView?.({behavior:'smooth',block:'start'});}catch(error){$('todayAdvice').textContent=error.message;}finally{openingExtra=false;open.disabled=false;}});card.append(open);box.append(card);
  }
  if(!entries.length)box.append(node('p',quietFirstDay?'先从上方主按钮继续，完成真实练习核对后再安排同级新材料。':plan.reason||'先完成核心任务与错题核对，再按剩余预算安排新练习。'));
 }
 function queueState(){
  if(navigation.learningQueue)return navigation.learningQueue();const load=root.IELTSDailyLearningLoad;if(!load)return null;
  return load.build({data,placement:root.IELTSPlacement,startDate:courseCalendar()?.startDate,today:courseCalendar()?.today,getDay:planDay,records:dailyRecords,drafts:navigation.allDrafts?.()||drafts().map(d=>({...d,courseDay:d.courseDay||current.day})),currentDay:current.day,selectedDay:navigation.selectedCourseDay?.(),current,budget:navigation.budget?.(),hub:root.IELTSTodayHub,player:root.IELTSCoursePlayer,yearPlanner:root.IELTSYearPlanner,timerState:root.IELTSStudyTimer?.snapshot?.(),assessment:root.IELTSAssessment,summaryForDay:n=>root.IELTSMistakes?.forDay(n),recordCorrectionStatus:r=>root.IELTSMistakes?.recordCorrectionStatus?.(r),exposures:navigation.exposures?.(),verifiedRecord:root.IELTSAdaptivePlan?.verifiedRecord,extraPlan:(day,budget)=>day&&root.IELTSAdaptivePlan?.planRemaining?.(day,dailyRecords,undefined,{data,budgetMinutes:360,calendarBudget:budget,exposures:navigation.exposures?.()||{},startedMaterialIds:drafts().map(d=>d.materialId)})});
 }
 function courseCalendar(){const startDate=JSON.parse(root.IELTSProfiles?.storage?.().getItem('ielts52-daily-plan-v1')||'null')?.startDate;return root.IELTSDailyLearningLoad?.calendarSchedule({data,startDate,today:root.IELTSYearPlanner?.dateKey(),placement:root.IELTSPlacement,yearPlanner:root.IELTSYearPlanner});}
 function renderCourseCalendar(){
  const box=$('todayCourseCalendar');if(!box)return;box.replaceChildren();let calendar;try{calendar=courseCalendar();}catch(error){box.append(node('p','课程日历暂未核实：'+error.message));return;}if(!calendar)return;
  const target=calendar.scheduledDay,budget=navigation.budget?.()||learningQueue?.budget||{},access=root.IELTSCoursePlayer?.courseSelectionAccess?.(data,dailyRecords,target,{scheduledDay:target,placement:root.IELTSPlacement,yearPlanner:root.IELTSYearPlanner,assessment:root.IELTSAssessment,verifiedRecord:root.IELTSAdaptivePlan?.verifiedRecord});
  if(target!==current.day){
   box.append(node('p','今天是日历第 '+Math.max(1,calendar.calendarDay)+' 天，可选择第 '+target+' 课。此前课程的历史状态待核对，已有原稿、草稿、录音和错题全部保留。'));
   const go=node('button',openingCourse?'正在保存原稿并进入课程…':'进入第 '+target+' 课','button primary today-calendar-start');go.id='todayEnterScheduledCourse';go.type='button';go.disabled=openingCourse||budget.exhausted===true||access?.allowed!==true;go.addEventListener('click',async()=>{if(openingCourse)return;openingCourse=true;go.disabled=true;let failure='';try{if(typeof navigation.selectCourseDay!=='function')throw Error('课程选择组件尚未就绪，请刷新页面后继续。');await navigation.selectCourseDay(target);current={...navigation.current()};await refreshRecords();await start();}catch(error){failure='暂未进入新课：'+error.message+'。已有原稿与草稿保留。';}finally{openingCourse=false;render();if(failure)$('todayAdvice').textContent=failure;}});box.append(go);
   if(budget.dayEnded)box.append(node('p','今日已结束，请先在番茄钟点击“恢复今日任务”；实际已用预算不变。'));else if(budget.exhausted)box.append(node('p','今天360分钟预算已用完，课程选择不会重置预算。'));else if(access?.allowed!==true)box.append(node('p',access?.reason||'前置课程或关卡状态尚未核实。'));
  }else box.append(node('p','日历第 '+Math.max(1,calendar.calendarDay)+' 天 · 当前学习第 '+current.day+' 课。课程选择已保留，历史状态不会改写为通过。'));
  const historical=learningQueue?.historical||[];if(historical.length){const details=node('details'),summary=node('summary','历史状态待核对（'+historical.length+' 课）');details.append(summary,node('p','这些原稿、草稿与错题继续保留；不会因进入新课而清空，也不会阻止当前已选课程。'));for(const item of historical.slice(0,7)){const go=node('button','查看第 '+item.day+' 课的历史作品与草稿','button');go.type='button';go.addEventListener('click',()=>navigation.showDay(item.day));details.append(go);}box.append(details);}
 }
 async function openQueueEntry(entry){
  if(!entry||['blocked','budget','rest','day-ended'].includes(entry.kind)||entry.fitsBudget===false)return;
  if(navigation.openQueued)return navigation.openQueued(entry);
  if(entry.day!==current.day){if(!navigation.showDay)throw Error('续课组件尚未准备好。');navigation.showDay(entry.day,entry.materialId);}
  if(entry.kind==='view')await navigation.showLatestRecord?.(entry.taskId,entry.materialId);
  else if(entry.kind==='extra'&&!entry.draftId)await navigation.openExtra?.(entry.entry);
  else await navigation.resumeNext(entry.taskId,entry.materialId);
 }
 function renderQueue(){
  const box=$('todayLearningQueue'),summary=$('todayQueueSummary');if(!box||!summary||!learningQueue)return;box.replaceChildren();
  const budget=learningQueue.budget,remaining=Math.max(0,Number(budget.remainingMinutes)||0).toFixed(1).replace(/\.0$/,'');
  summary.textContent=learningQueue.budget?.dayEnded?'今日学习已主动结束。已完成内容与实际用时保留；可在番茄钟恢复今日任务，或下一日续做未完成内容。':'今天还可用 '+remaining+' 分钟，学习与番茄休息共用六小时预算。';
  const primary=learningQueue.next;
  function explanation(entry){
   if(!entry.estimate)return null;const e=entry.estimate,details=node('details'),title=node('summary','为什么这样安排');details.append(title,node('p',e.source+'，同类完整样本 '+e.sampleCount+' 份；历史／参考范围 '+e.rangeMinutes.map(n=>n.toFixed(1)).join('–')+' 分钟，不确定性'+e.uncertainty+'。'),node('p',e.explanation));
   if(entry.nextCourseWindow)details.append(node('p','新开下一课先预留一轮完整专注及必要休息，本次启动窗口 '+entry.startWindowMinutes.toFixed(1)+' 分钟。'));return details;
  }
  if(primary){
   const row=node('article',undefined,'course-record-row'),waiting=['rest','budget','blocked','day-ended'].includes(primary.kind);
   row.append(node('strong',waiting?primary.label:'现在：第 '+primary.day+' 课 · '+(primary.title||NAMES[primary.taskId]||'继续学习')));
   if(primary.estimate){const e=primary.estimate;row.append(node('p','预计学习 '+e.studyMinutes.toFixed(1).replace(/\.0$/,'')+' 分钟'+(e.breakMinutes?'，建议休息 '+e.breakMinutes.toFixed(1).replace(/\.0$/,'')+' 分钟。':'；按右下角番茄钟安排休息。')));}
   if(waiting||primary.kind==='view')row.append(node('p',primary.reason));
   if(!waiting){const go=node('button',primary.label);go.type='button';go.addEventListener('click',async()=>{go.disabled=true;try{await openQueueEntry(primary);$('courseSession')?.scrollIntoView?.({behavior:'smooth',block:'start'});}catch(error){$('todayAdvice').textContent=error.message;}finally{render();}});row.append(go);}
   const why=explanation(primary);if(why)row.append(why);box.append(row);
  }
  // Year entries use the same primary queue action after actual core completion.
  const yearEntries=learningQueue.entries.filter(entry=>entry.yearFirstUse);
  const challenges=learningQueue.entries.filter(entry=>entry.placementChallenge&&entry!==primary);
  for(const entry of challenges){const row=node('article',undefined,'course-record-row');row.append(node('strong',entry.label),node('p',entry.reason),node('p','先为未完核心与已有补强留出预算，本次可选练习参考 '+entry.estimate.totalMinutes.toFixed(1).replace(/\.0$/,'')+' 分钟。'));const go=node('button',entry.publicSupplement?(entry.draftId?'继续公开素材草稿':'开始这份补充练习'):'开始这份适级挑战');go.type='button';go.disabled=entry.fitsBudget!==true;go.addEventListener('click',async()=>{go.disabled=true;try{await openQueueEntry(entry);$('courseSession')?.scrollIntoView?.({behavior:'smooth',block:'start'});}catch(error){$('todayAdvice').textContent=error.message;}finally{render();}});row.append(go);box.append(row);}
  const remainingEntries=learningQueue.entries.filter(entry=>entry!==primary&&!entry.placementChallenge&&!entry.yearFirstUse),previews=remainingEntries.slice(0,2);
  for(const entry of previews)box.append(node('p','随后：第 '+entry.day+' 课 · '+(entry.title||NAMES[entry.taskId]||'后续学习')+(entry.waiting?'（待评作品）':entry.kind==='blocked'?'（等待前置任务）':'（完成当前单元后继续）')));
  if(remainingEntries.length>2){const details=node('details'),title=node('summary','查看后续队列（'+(remainingEntries.length-2)+'项）');details.append(title);for(const entry of remainingEntries.slice(2))details.append(node('p','第 '+entry.day+' 课 · '+(entry.title||NAMES[entry.taskId]||'后续学习')+'：'+entry.label));box.append(details);}
  if(!primary)box.append(node('p',learningQueue.reason||'正在核对下一步课程。'));
 }
 function render(){
  const base=data.days.find(item=>item.day===current.day);if(!base)return;const day=planDay(base);
  const mistakes=summary(),own=dailyRecords.filter(record=>record?.dayNumber===current.day);
  states=day.tasks.map(task=>({task,...taskState(task,own,{data,dayNumber:current.day,completionValid:mistakes.completionValid,materials:data.materials,recordCorrectionStatus:record=>root.IELTSMistakes?.recordCorrectionStatus?.(record)})}));const essential=root.IELTSEssentialCourse?.state?.({day:current.day,data,records:dailyRecords,drafts:navigation.allDrafts?.()||[],budget:navigation.budget?.(),dayPlan:day,completionValid:mistakes.completionValid});if(essential?.required&&essential.applicable&&!essential.done){const vocabulary=states.find(s=>s.task.id==='vocabulary');if(vocabulary)vocabulary.done=false;}next=chooseNext(states);allDone=states.length>0&&states.every(state=>state.done);
  let calendar;try{calendar=courseCalendar();}catch(_){}const theme=lessonTheme(day,data);$('todayEyebrow').textContent=(calendar?'日历第 '+Math.max(1,calendar.calendarDay)+' 天 · ':'')+'第 '+day.week+' 周 · 课程第 '+day.day+' / 365 课';$('todayTitle').textContent='第 '+day.day+' 课：'+theme.title;
  $('todayGoal').textContent=(theme.listening?'本课听力：'+theme.listening+'。':'')+'阶段主题：'+day.title+'。'+(theme.reusedMaterials?'本课含 '+theme.newMaterials+' 份首次安排材料、'+theme.reusedMaterials+' 份计划巩固；旧原稿与成绩保留。':'')+'完成各模块后，最后统一订正错题与复盘。';
  $('todayDone').textContent=states.filter(state=>state.done).length+' / '+states.length;
  $('todayMinutes').textContent=(navigation.budget?.()?.spentMinutes??own.reduce((sum,record)=>sum+(Number.isFinite(record.minutes)&&record.minutes>0?record.minutes:0),0)).toFixed(1)+' / 360 分钟';$('todayMistakes').textContent=(Number.isFinite(mistakes.remaining)?mistakes.remaining:0)+' 道';
  const waiting=next?.pending&&!next.missingMaterialIds.length,continued=next&&hasDraft(next.task.id,next.nextMaterialId,drafts(),current);
  $('todayStart').textContent=allDone?'查看今日复盘':waiting?'查看待评作品':next?.legacyTraining&&!continued?'开始新版词汇训练':continued?'继续未提交草稿：'+NAMES[next.task.id]:'继续第 '+(states.indexOf(next)+1)+' 步：'+NAMES[next?.task.id];
  $('todayNext').textContent=waiting?'本任务所需材料已提交，最新作品等待评阅；不会重复创建原稿。':continued?'继续已有输入，不会重新创建一次练习。':next?'参考预算 '+next.task.minutes+' 分钟，可按掌握速度提前进入下一步。':'';
  $('todayAdvice').textContent=allDone?'今天的学习产出与复盘已提交。请检查实际学习时间和阶段关卡；提交齐全不等于能力已达标。':next?.task.id==='reflection'?'今天最后一步：完成整页错题重做，直到全部正确，再查看 AI 每日复盘。':waiting?'最新作品等待服务评阅，可从下面选择其他任务。':'现在从「'+NAMES[next?.task.id]+'」继续。每项按“学习 → 作答 → 看反馈”完成，然后进入下一项。';
  const vocabularySummary=root.IELTSCoursePlayer?.vocabularyTaskSummary?.(day.tasks.find(task=>task.id==='vocabulary'),data);if(vocabularySummary&&next?.task.id==='vocabulary'&&!waiting)$('todayNext').textContent='本课词汇 '+vocabularySummary.wordCount+' 个词项，分 '+vocabularySummary.groupCount+' 组；每组完成三写、三读与三轮测试，再继续下一组。';
  $('todayRoute').replaceChildren();states.forEach((state,index)=>{
   const button=doc.createElement('button');button.type='button';button.className='today-step'+(state.done?' is-done':'');button.setAttribute('aria-current',String(state.task.id===current.taskId));
   const draft=hasDraft(state.task.id,state.nextMaterialId,drafts(),current),status=state.done?'已提交':state.pending&&!state.missingMaterialIds.length?'待评阅':state.legacyTraining?'旧稿保留，可重做新版':draft?'有未提交草稿':state.count?'已提交 '+state.count+'/'+state.total:'待学习';
   for(const [tag,value]of[['b',String(index+1).padStart(2,'0')+' / '+state.task.minutes+' MIN'],['strong',NAMES[state.task.id]],['small',state.task.id==='vocabulary'&&vocabularySummary?status+' · '+vocabularySummary.groupCount+'组 / '+vocabularySummary.wordCount+'个词项':status]]){const el=doc.createElement(tag);el.textContent=value;button.append(el);}
   button.addEventListener('click',async()=>{if(state.pending&&!state.missingMaterialIds.length){await navigation.showLatestRecord?.(state.task.id,state.nextMaterialId);$('courseSession')?.scrollIntoView?.({behavior:'smooth',block:'start'});}else{navigation.showTask(state.task.id,state.nextMaterialId);$('courseMaterialIntro')?.scrollIntoView?.({behavior:'smooth',block:'start'});}});$('todayRoute').append(button);
  });
  learningQueue=queueState();
  if(learningQueue?.currentComplete===true)root.IELTSDailyBackups?.observeCompletion?.({currentComplete:true,courseDay:current.day,completion:mistakes.completion,token:mistakes.token,records:own})?.catch?.(()=>{});
  const queued=learningQueue?.next;if(queued){$('todayStart').textContent=queued.label;$('todayStart').disabled=['blocked','budget','rest','day-ended'].includes(queued.kind);$('todayNext').textContent=queued.reason||'';$('todayAdvice').textContent=['budget','rest','day-ended'].includes(queued.kind)?queued.reason:queued.publicSupplement?'这是适级的可选公开素材练习；到期复习与核心任务优先，结果不作为独立测评或成绩证明。':queued.optional?'这是依据入学测评分项安排的可选挑战；共同核心任务、待评与错题仍分别保留。':learningQueue.currentComplete&&queued.day!==current.day?'本课核心任务与复盘已通过。下一课已自动加入今天的必学队列，点击主按钮继续；本课结果仍在下方。':queued.kind==='view'?'作品仍待真实评阅；其他可用任务会列入队列，待评不算通过。':queued.kind==='blocked'?queued.reason:'下一步已列入今日必学队列；按真实作答继续，完成速度不用于跳关。';}else $('todayStart').disabled=false;if(vocabularySummary&&queued?.taskId==='vocabulary'&&queued.day===current.day&&queued.kind!=='essential-vocabulary')$('todayNext').textContent+=' 本课共 '+vocabularySummary.groupCount+' 组 / '+vocabularySummary.wordCount+' 个词项。';
  root.IELTSEssentialCourse?.mount($('todayEssentialVocabulary'),{day:current.day,data,records:dailyRecords,drafts:navigation.allDrafts?.()||[],budget:navigation.budget?.(),dayPlan:day});
  renderQueue();
  renderCourseCalendar();
  renderAdaptive(day,own);
  const independent=data.materials.find(m=>m.id===current.materialId&&m.independentBank===true);
  if(independent){$('todayEyebrow').textContent='独立材料库 · '+independent.level+' · '+NAMES[independent.skill];$('todayTitle').textContent=independent.title;$('todayGoal').textContent='这是单独的未见材料短测。先独立作答，再核对原稿和错因；不会替代今日核心任务。';$('todayStart').textContent=current.submitted&&queued?queued.label:current.submitted?'查看本次短测结果':current.active||hasDraft(independent.skill,independent.id,drafts(),current)?'继续这份独立短测':'开始这份独立短测';$('todayNext').textContent='参考 '+independent.estimatedMinutes+' 分钟，计入今天六小时总预算。';$('todayAdvice').textContent=current.submitted?'本次原稿已保存。查看下方结果、反馈与订正入口；今日核心课程仍按原顺序进行。':'本次将直接打开上方所选材料。开始后登记曝光，独立测评关闭提示；下方今日路线可随时返回常规学习。';}
 }
 function ensureStart(){const storage=root.IELTSProfiles.storage(),key='ielts52-daily-plan-v1';if(storage.getItem(key)!==null)return;const now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');storage.setItem(key,JSON.stringify(root.IELTSPlanState.newState(today)));}
 async function start(){
  if(starting||!next)return;starting=true;$('todayStart').disabled=true;
  try{if(learningQueue?.next&&(!data.materials.some(m=>m.id===current.materialId&&m.independentBank===true)||current.submitted)){ensureStart();await openQueueEntry(learningQueue.next);$('courseSession')?.scrollIntoView?.({behavior:'smooth',block:'start'});return;}const independent=data.materials.find(m=>m.id===current.materialId&&m.independentBank===true);if(independent){if(current.submitted)$('courseResult')?.scrollIntoView?.({behavior:'smooth',block:'start'});else{await navigation.resumeNext(independent.skill,independent.id);$('courseSession')?.scrollIntoView?.({behavior:'smooth',block:'start'});}return;}ensureStart();if(allDone)navigation.showTask(next.task.id,next.nextMaterialId);else if(next.pending&&!next.missingMaterialIds.length)await navigation.showLatestRecord?.(next.task.id,next.nextMaterialId);else{if(typeof navigation.resumeNext!=='function')throw Error('课程续学组件尚未准备，请刷新页面后继续；已有草稿保留。');await navigation.resumeNext(next.task.id,next.nextMaterialId);}$('courseSession')?.scrollIntoView?.({behavior:'smooth',block:'start'});}
  catch(error){$('todayAdvice').textContent=error.message;}finally{starting=false;render();}
 }
 async function refreshRecords(){const ticket=++loading,day=current.day;try{const records=await R.list();if(ticket!==loading||current.day!==day)return;dailyRecords=Array.isArray(records)?records:[];render();}catch(error){if(ticket===loading)$('todayAdvice').textContent=error.message;}}
 $('todayStart').addEventListener('click',start);
 root.addEventListener('ielts:course-view',event=>{const changed=current.day!==event.detail.day;current={...event.detail};if(changed){dailyRecords=[];refreshRecords();}render();});
 root.addEventListener('ielts:memory-changed',render);root.addEventListener('ielts:study-timer-changed',render);root.addEventListener('ielts:course-budget-paused',render);root.addEventListener('focus',refreshRecords);doc.addEventListener?.('visibilitychange',()=>{if(!doc.hidden)refreshRecords();});
 root.addEventListener('ielts:public-course-plan-changed',render);root.addEventListener('ielts:year-first-use-changed',render);
 root.addEventListener('ielts:budget-changed',event=>{if(Array.isArray(event.detail?.records))dailyRecords=event.detail.records;render();});
 root.addEventListener('ielts:course-progress',event=>{if(event.detail.day!==current.day)return;loading++;dailyRecords=Array.isArray(event.detail.allRecords)?event.detail.allRecords:Array.isArray(event.detail.records)?event.detail.records:[];render();});
 if(root.IELTSMistakes?.EVENT)root.addEventListener(root.IELTSMistakes.EVENT,render);
 refreshRecords();
 if(new URLSearchParams(root.location.search).get('preview')==='1')doc.querySelectorAll('a[href]').forEach(link=>{const href=link.getAttribute('href');if(href&&!/^(https?:|#)/.test(href)&&/\.html(?:[?#]|$)/.test(href)){const url=new URL(href,root.location.href);url.searchParams.set('preview','1');link.href=url.href;}});
 return{render,start,refreshRecords};
}
return{artifact,latestForMaterial,taskState,chooseNext,hasDraft,lessonTheme,mount};
});
