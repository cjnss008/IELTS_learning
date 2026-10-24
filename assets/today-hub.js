(function(root,factory){'use strict';const api=factory(root);root.IELTSTodayHub=api;if(typeof module==='object'&&module.exports)module.exports=api;if(root.document?.getElementById('todayOverview'))api.mount();})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
const vocabulary=root.IELTSVocabularyPractice||(typeof require==='function'?require('./vocabulary-practice.js'):null);
const NAMES={vocabulary:'词汇',grammar:'语法',listening:'听力',reading:'阅读',speaking:'口语',writing:'写作',reflection:'错题复盘'};
function artifact(answer){if(typeof answer!=='string'||answer.length>50000)return null;try{const value=JSON.parse(answer);return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}catch(_){return null;}}
function recordTime(record){const value=Date.parse(record.submittedAt||record.createdAt);return Number.isFinite(value)?value:null;}
function latestForMaterial(task,records,dayNumber,materials=[],data){
 const player=root.IELTSCoursePlayer||(typeof require==='function'?require('./course-player.js'):null),context=data||root.IELTSCurriculumData||{materials,days:[]};
 const required=new Set(task.materialIds||[]),byMaterial=new Map();
 for(const record of Array.isArray(records)?records:[]){
  if(!record||record.taskId!==task.id||record.kind==='retest'||!required.has(record.materialId)||dayNumber!==undefined&&record.dayNumber!==dayNumber||record.skill&&record.skill!==task.id)continue;
  if(!['pass','revise','pending','unverified'].includes(record.evaluation?.result)||recordTime(record)===null)continue;
  if(!(typeof record.answer==='string'&&record.answer.trim())&&!record.media?.length)continue;
  const material=materials.find(item=>item.id===record.materialId);
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
 const required=[...new Set(task.materialIds||[])],latest=latestForMaterial(task,records,options.dayNumber,options.materials||options.data?.materials||root.IELTSCurriculumData?.materials||[],options.data);
 if(task.id==='reflection'){
  const annual=options.dayNumber===365&&(Array.isArray(records)?records:[]).some(r=>r.source==='year-review'&&r.materialId==='reflection-365'&&artifact(r.answer)?.yearSummary?.text?.trim().length>=20);const done=annual||options.completionValid===true;return{done,pending:false,count:done?1:0,total:1,missingMaterialIds:done?[]:required,nextMaterialId:required[0]||null};
 }
 const plan=root.IELTSPlanState||(typeof require==='function'?require('./daily-plan-state.js'):null);
 const missingMaterialIds=required.filter(id=>!latest.has(id)),pendingIds=required.filter(id=>{const record=latest.get(id);if(!record)return false;let corrected=false;try{corrected=options.recordCorrectionStatus?.(record)?.corrected===true;}catch(_){}if(corrected)return false;if(['writing','speaking'].includes(task.id)){try{return !plan?.validLinkedReview?.(record);}catch(_){return true;}}return record.evaluation?.result==='pending';});
 const legacyTraining=task.id==='vocabulary'&&missingMaterialIds.some(id=>(Array.isArray(records)?records:[]).some(record=>record?.materialId===id&&record.taskId===task.id&&(options.dayNumber===undefined||record.dayNumber===options.dayNumber)&&((artifact(record.answer)?.trainingVersion??artifact(record.answer)?.trainingSchema??artifact(record.answer)?.schema)===1)));
 return{legacyTraining,done:required.length>0&&!missingMaterialIds.length&&!pendingIds.length,pending:pendingIds.length>0,count:required.length-missingMaterialIds.length,total:required.length,missingMaterialIds,nextMaterialId:missingMaterialIds[0]||pendingIds[0]||required[0]||null};
}
function chooseNext(states){return states.find(state=>!state.done&&state.missingMaterialIds.length)||states.find(state=>!state.done)||states.at(-1)||null;}
function hasDraft(taskId,materialId,drafts,current={}){
 if(current.active&&!current.submitted&&current.taskId===taskId&&current.materialId===materialId)return true;
 return(Array.isArray(drafts)?drafts:[]).some(draft=>draft.taskId===taskId&&draft.materialId===materialId&&draft.submitted!==true);
}
function mount(){
 const doc=root.document,$=id=>doc.getElementById(id),R=root.IELTSRecords,data=root.IELTSCurriculumData,navigation=root.IELTSTodayNavigation;
 if(!$('todayOverview')||!R||!data||!navigation)return null;
 let current={...navigation.current()},dailyRecords=[],next=null,loading=0,starting=false,allDone=false,states=[],openingExtra=false;
 function summary(){try{return root.IELTSMistakes?.forDay(current.day)||{completionValid:false,remaining:0};}catch(error){$('todayAdvice').textContent='错题状态未读取：'+error.message;return{completionValid:false,remaining:0};}}
 function drafts(){try{return navigation.drafts?.()||[];}catch(_){return[];}}
 function node(tag,text,className){const element=doc.createElement(tag);if(text!==undefined)element.textContent=String(text);if(className)element.className=className;return element;}
 function planDay(base){try{return root.IELTSAdaptivePlan?.getDay?.(base)||base;}catch(_){return base;}}
 function renderAdaptive(day,own){
  const box=$('todayAdaptiveContent');if(!box)return;box.replaceChildren();
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
  for(const entry of retained){const material=data.materials?.find(item=>item.id===entry.materialId),card=node('article',undefined,'course-record-row');card.append(node('strong',material?.title||'未提交练习'),node('p','继续已有草稿，原始输入和曝光记录保留。'));const go=node('button','继续这份草稿');go.type='button';go.addEventListener('click',async()=>{try{await navigation.resumeNext(entry.skill,entry.materialId);$('courseSession')?.scrollIntoView?.({behavior:'smooth',block:'start'});}catch(error){$('todayAdvice').textContent=error.message;}});card.append(go);box.append(card);}
  if(entries.length)box.append(node('h3','剩余预算内的适级练习'));
  for(const entry of entries){const material=data.materials?.find(item=>item.id===entry.materialId);if(!material)continue;const card=node('article',undefined,'course-record-row');card.append(node('strong',material.title),node('p',entry.reason||plan.reason),node('p',entry.kind==='verification'?'参考首轮检查 '+amount(entry.estimatedMinutes)+' 分钟；打开原完整材料，须按完整任务实际作答后核对，估时以实际练习为准。':(NAMES[entry.skill]||entry.skill)+' · 参考估时 '+amount(entry.estimatedMinutes)+' 分钟；完成后按真实作答核对，不靠用时升级。'));
   const open=node('button',entry.kind==='verification'?'先验证／补练（打开原任务）':entry.kind==='reinforcement'?'开始同级补强':entry.kind==='progression'?'按先修继续下一周':'开始同级新练习');open.type='button';open.addEventListener('click',async()=>{if(openingExtra)return;openingExtra=true;open.disabled=true;try{if(typeof navigation.openExtra!=='function')throw Error('追加练习组件尚未就绪，请刷新后继续。');await navigation.openExtra({...entry});$('courseSession')?.scrollIntoView?.({behavior:'smooth',block:'start'});}catch(error){$('todayAdvice').textContent=error.message;}finally{openingExtra=false;open.disabled=false;}});card.append(open);box.append(card);
  }
  if(!entries.length)box.append(node('p',quietFirstDay?'先从上方主按钮继续，完成真实练习核对后再安排同级新材料。':plan.reason||'先完成核心任务与错题核对，再按剩余预算安排新练习。'));
 }
 function render(){
  const base=data.days.find(item=>item.day===current.day);if(!base)return;const day=planDay(base);
  const mistakes=summary(),own=dailyRecords.filter(record=>record?.dayNumber===current.day);
  states=day.tasks.map(task=>({task,...taskState(task,own,{data,dayNumber:current.day,completionValid:mistakes.completionValid,materials:data.materials,recordCorrectionStatus:record=>root.IELTSMistakes?.recordCorrectionStatus?.(record)})}));next=chooseNext(states);allDone=states.length>0&&states.every(state=>state.done);
  $('todayEyebrow').textContent='第 '+day.week+' 周 · 第 '+day.day+' / 365 天';$('todayTitle').textContent='今天，学习'+day.title+'。';
  $('todayGoal').textContent=day.tasks.length===7&&day.day<=7?'从认识声音和简单句开始。按照下面 7 步学习，不需要先读长篇文章。':'按今天的材料，完成听说读写训练；最后把当天错题全部重做。';
  $('todayDone').textContent=states.filter(state=>state.done).length+' / '+states.length;
  $('todayMinutes').textContent=(navigation.budget?.()?.spentMinutes??own.reduce((sum,record)=>sum+(Number.isFinite(record.minutes)&&record.minutes>0?record.minutes:0),0)).toFixed(1)+' / 360 分钟';$('todayMistakes').textContent=(Number.isFinite(mistakes.remaining)?mistakes.remaining:0)+' 道';
  const waiting=next?.pending&&!next.missingMaterialIds.length,continued=next&&hasDraft(next.task.id,next.nextMaterialId,drafts(),current);
  $('todayStart').textContent=allDone?'查看今日复盘':waiting?'查看待评作品':next?.legacyTraining&&!continued?'开始新版词汇训练':continued?'继续未提交草稿：'+NAMES[next.task.id]:'继续第 '+(states.indexOf(next)+1)+' 步：'+NAMES[next?.task.id];
  $('todayNext').textContent=waiting?'本任务所需材料已提交，最新作品等待评阅；不会重复创建原稿。':continued?'继续已有输入，不会重新创建一次练习。':next?'参考预算 '+next.task.minutes+' 分钟，可按掌握速度提前进入下一步。':'';
  $('todayAdvice').textContent=allDone?'今天的学习产出与复盘已提交。请检查实际学习时间和阶段关卡；提交齐全不等于能力已达标。':next?.task.id==='reflection'?'今天最后一步：完成整页错题重做，直到全部正确，再查看 AI 每日复盘。':waiting?'最新作品等待服务评阅，可从下面选择其他任务。':'现在从「'+NAMES[next?.task.id]+'」继续。每项按“学习 → 作答 → 看反馈”完成，然后进入下一项。';
  $('todayRoute').replaceChildren();states.forEach((state,index)=>{
   const button=doc.createElement('button');button.type='button';button.className='today-step'+(state.done?' is-done':'');button.setAttribute('aria-current',String(state.task.id===current.taskId));
   const draft=hasDraft(state.task.id,state.nextMaterialId,drafts(),current),status=state.done?'已提交':state.pending&&!state.missingMaterialIds.length?'待评阅':state.legacyTraining?'旧稿保留，可重做新版':draft?'有未提交草稿':state.count?'已提交 '+state.count+'/'+state.total:'待学习';
   for(const [tag,value]of[['b',String(index+1).padStart(2,'0')+' / '+state.task.minutes+' MIN'],['strong',NAMES[state.task.id]],['small',status]]){const el=doc.createElement(tag);el.textContent=value;button.append(el);}
   button.addEventListener('click',async()=>{if(state.pending&&!state.missingMaterialIds.length){await navigation.showLatestRecord?.(state.task.id,state.nextMaterialId);$('courseSession')?.scrollIntoView?.({behavior:'smooth',block:'start'});}else{navigation.showTask(state.task.id,state.nextMaterialId);$('courseMaterialIntro')?.scrollIntoView?.({behavior:'smooth',block:'start'});}});$('todayRoute').append(button);
  });
  renderAdaptive(day,own);
 }
 function ensureStart(){const storage=root.IELTSProfiles.storage(),key='ielts52-daily-plan-v1';if(storage.getItem(key)!==null)return;const now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');storage.setItem(key,JSON.stringify(root.IELTSPlanState.newState(today)));}
 async function start(){
  if(starting||!next)return;starting=true;$('todayStart').disabled=true;
  try{ensureStart();if(allDone)navigation.showTask(next.task.id,next.nextMaterialId);else if(next.pending&&!next.missingMaterialIds.length)await navigation.showLatestRecord?.(next.task.id,next.nextMaterialId);else{if(typeof navigation.resumeNext!=='function')throw Error('课程续学组件尚未准备，请刷新页面后继续；已有草稿保留。');await navigation.resumeNext(next.task.id,next.nextMaterialId);}$('courseSession')?.scrollIntoView?.({behavior:'smooth',block:'start'});}
  catch(error){$('todayAdvice').textContent=error.message;}finally{starting=false;$('todayStart').disabled=false;}
 }
 async function refreshRecords(){const ticket=++loading,day=current.day;try{const records=await R.list();if(ticket!==loading||current.day!==day)return;dailyRecords=Array.isArray(records)?records:[];render();}catch(error){if(ticket===loading)$('todayAdvice').textContent=error.message;}}
 $('todayStart').addEventListener('click',start);
 root.addEventListener('ielts:course-view',event=>{const changed=current.day!==event.detail.day;current={...event.detail};if(changed){dailyRecords=[];refreshRecords();}render();});
 root.addEventListener('ielts:budget-changed',event=>{if(Array.isArray(event.detail?.records))dailyRecords=event.detail.records;render();});
 root.addEventListener('ielts:course-progress',event=>{if(event.detail.day!==current.day)return;loading++;dailyRecords=Array.isArray(event.detail.allRecords)?event.detail.allRecords:Array.isArray(event.detail.records)?event.detail.records:[];render();});
 if(root.IELTSMistakes?.EVENT)root.addEventListener(root.IELTSMistakes.EVENT,render);
 refreshRecords();
 if(new URLSearchParams(root.location.search).get('preview')==='1')doc.querySelectorAll('a[href]').forEach(link=>{const href=link.getAttribute('href');if(href&&!/^(https?:|#)/.test(href)&&/\.html(?:[?#]|$)/.test(href)){const url=new URL(href,root.location.href);url.searchParams.set('preview','1');link.href=url.href;}});
 return{render,start,refreshRecords};
}
return{artifact,latestForMaterial,taskState,chooseNext,hasDraft,mount};
});
