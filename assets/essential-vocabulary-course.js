(function(root,factory){const api=factory(root);root.IELTSEssentialCourse=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
function state(options={}){
 const day=Number(options.day),data=options.data||root.IELTSCurriculumData,E=options.engine||root.IELTSEssentialVocabulary,M=options.memoryEngine||root.IELTSMemory,records=options.records||[],now=options.now??Date.now();
 if(day<2||day>365||!data?.days?.find(d=>d.day===day)?.tasks.some(t=>t.id==='vocabulary')||!E||!M)return{applicable:false,done:true};
 const today=E.dateKey(now),completedEarlier=options.completionValid===true&&records.some(r=>r.dayNumber===day&&r.source==='mistake-review'&&r.submittedAt&&E.dateKey(r.submittedAt)<today);
 if(completedEarlier)return{applicable:false,done:true,historical:true};
 const Y=options.year||root.IELTSYearPlanner,drafts=options.drafts||[],own=records.filter(r=>r.skill==='vocabulary'),ownDrafts=drafts.filter(d=>d.skill==='vocabulary'||d.taskId==='vocabulary');
 const spent=Y?.calendarBudget?.(own,ownDrafts,today)?.learningMinutes||0,budget=options.budget||Y?.calendarBudget?.(records,drafts,today)||{remainingMinutes:360};
 const requestedAvailable=Math.max(0,budget.remainingMinutes??360);
 const planDay=options.dayPlan||data.days.find(d=>d.day===day),ids=new Set(planDay.tasks.find(t=>t.id==='vocabulary')?.materialIds||[]),courseWords=data.materials.filter(m=>ids.has(m.id)).flatMap(m=>m.vocabulary||[]);
 const plan=E.plan(options.memory||M.read(),{data:options.vocabularyData||root.IELTS_ESSENTIAL_VOCABULARY,now,remainingMinutes:requestedAvailable,courseDay:day,courseWords,records,vocabularyDrafts:ownDrafts});
 const available=plan.reviewBudget.availableMinutes;
 const active=plan.activeBatches.length>0,availableWork=plan.due.length>0||plan.newWords.length>0||active,done=!availableWork||available<.3;
 const estimate=active?Math.min(15,available):plan.due.length?Math.min(10,plan.reviewBudget.estimatedMinutes):Math.min(6,plan.newWords.length)*plan.quota.newWordMinutes;
 const label=done?'今日8000词训练份额已完成或已转入后续安排':active?'继续8000词未提交词组':plan.due.length?'先做到期词汇回忆':'学习下一组必学新词';
 return{applicable:true,required:planDay.requirements?.essential===true,done,plan,remainingMinutes:available,spentMinutes:spent,estimatedMinutes:Math.max(.3,estimate),href:'词汇记忆.html?day='+day+(root.IELTSProfiles?.isPreview?.()?'&preview=1':''),label,message:'8000必学词：本日已初学提交 '+plan.dayProgress.initialCompleted+' 词、已复习 '+plan.dayProgress.reviewed+' 次；当前安排 '+plan.due.length+' 项回忆、'+plan.newWords.length+' 个新词。'+(available<=0?'词汇参考预算已用完，未完成部分保留，继续其他科目。':'先复习再学新词；每组最多6词，与课内词去重，计入今日总预算。')};
}
function mount(box,options={}){if(!box)return;box.replaceChildren();try{const value=state(options);box.hidden=!value.applicable;if(!value.applicable)return;const doc=box.ownerDocument||root.document,title=doc.createElement('strong'),text=doc.createElement('p'),link=doc.createElement('a');title.textContent='今日词汇 · 课内语境词＋8000词循环';text.textContent=value.message;link.textContent=value.label;link.href=value.href;link.className='button';box.append(title,text,link);}catch(error){box.hidden=false;box.textContent='词汇日任务暂未读取：'+error.message+'。已有原稿保留。';}}
return{state,mount};});
