(function(root,factory){const api=factory(root);root.IELTSEssentialCourse=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
function requiredContextWork(context,plan){
 if(context?.required!==true)return false;const contexts=context.contexts||(context.contract?[context]:[]);if(!contexts.some(c=>c.contract?.schema===2)||contexts.some(c=>c.contract?.schema===1))return true;
 const publicWords=contexts.flatMap(c=>c.contract.words.filter(w=>w.source?.role!=='owned-source-context-v82')),matches=word=>publicWords.some(w=>String(w.word).toLowerCase()===String(word.word).toLowerCase()&&w.meaning===word.meaning&&w.example===word.example);
 return(plan.pendingContextWords||[]).some(matches)||(plan.due||[]).some(matches)||(plan.activeBatches||[]).some(batch=>batch.words.some(matches));
}
function state(options={}){
 const day=Number(options.day),data=options.data||root.IELTSCurriculumData,E=options.engine||root.IELTSEssentialVocabulary,M=options.memoryEngine||root.IELTSMemory,records=options.records||[],now=options.now??Date.now();
 if(day<2||day>365||!data?.days?.find(d=>d.day===day)?.tasks.some(t=>t.id==='vocabulary')||!E||!M)return{applicable:false,done:true};
 const today=E.dateKey(now),completedEarlier=options.completionValid===true&&records.some(r=>r.dayNumber===day&&r.source==='mistake-review'&&r.submittedAt&&E.dateKey(r.submittedAt)<today);
 const Y=options.year||root.IELTSYearPlanner,drafts=options.drafts||[],own=records.filter(r=>r.skill==='vocabulary'),ownDrafts=drafts.filter(d=>d.skill==='vocabulary'||d.taskId==='vocabulary');
 const spent=Y?.calendarBudget?.(own,ownDrafts,today)?.learningMinutes||0,budget=options.budget||Y?.calendarBudget?.(records,drafts,today)||{remainingMinutes:360};
 const requestedAvailable=Math.max(0,budget.remainingMinutes??360);
 const planDay=options.dayPlan||data.days.find(d=>d.day===day),ids=new Set(planDay.tasks.find(t=>t.id==='vocabulary')?.materialIds||[]),courseWords=data.materials.filter(m=>ids.has(m.id)).flatMap(m=>m.vocabulary||[]);
 const memory=options.memory||M.read(),contextual=options.contextual||root.IELTSContextualVocabulary||(typeof require==='function'?require('./contextual-vocabulary-course.js'):null),context=(contextual?.daily||contextual?.resolve)?.({...options,day,data,dayPlan:planDay,memory,records,drafts,budget,vocabularyData:options.vocabularyData||root.IELTS_ESSENTIAL_VOCABULARY});
 const plan=E.plan(memory,{data:options.vocabularyData||root.IELTS_ESSENTIAL_VOCABULARY,now,remainingMinutes:requestedAvailable,courseDay:day,courseWords:context?.currentCoreWords??courseWords,records,vocabularyDrafts:ownDrafts,...(context?.available?{contextWords:context.words,...context.budget}:{})});
 if(context?.words?.some(w=>w.source?.role==='owned-source-context-v82')&&plan.due.length)plan.newWords=[];
 if(completedEarlier){if(!plan.due.length&&!plan.activeBatches.length)return{applicable:false,done:true,historical:true};plan.newWords=[];}
 const heldSenses=(context?.pending||[]).filter(p=>p.reason==='owned-source-existing-word-snapshot-preserved');
 const available=plan.reviewBudget.availableMinutes;
 const carry=(plan.pendingContextWords||[]).filter(w=>w.originCourseDay<day),held=(plan.pendingContextWords||[]).filter(w=>w.heldForVerification===true),active=plan.activeBatches.length>0,availableWork=plan.due.length>0||plan.newWords.length>0||active,done=!availableWork||available<.3;
 const estimate=active?Math.min(15,available):plan.due.length?Math.min(10,plan.reviewBudget.estimatedMinutes):Math.min(6,plan.newWords.length)*plan.quota.newWordMinutes;
 const label=done?'今日8000词训练份额已完成或已转入后续安排':active?'继续8000词未提交词组':plan.due.length?'先做到期词汇回忆':'学习下一组必学新词';
 return{applicable:true,historical:completedEarlier,required:!completedEarlier&&(planDay.requirements?.essential===true||requiredContextWork(context,plan)),context,done,plan,remainingMinutes:available,spentMinutes:spent,estimatedMinutes:Math.max(.3,estimate),href:completedEarlier?'今日学习.html?reviewFrom='+day+(root.IELTSProfiles?.isPreview?.()?'&preview=1':''):'词汇记忆.html?day='+day+(root.IELTSProfiles?.isPreview?.()?'&preview=1':''),label,message:(completedEarlier?'原课已完成；今天的到期复习独立保留，不重开原课程。':'')+'8000必学词：本日已初学提交 '+plan.dayProgress.initialCompleted+' 词、已复习 '+plan.dayProgress.reviewed+' 次；当前安排 '+plan.due.length+' 项回忆、'+plan.newWords.length+' 个新词。'+(held.length?'有 '+held.length+' 个已安排语境词等待核验原文版本，原词义和来源合同保留。':'')+((context?.heldContexts||[]).length?'有旧语境合同待核对，原任务保留。':'')+(carry.length?'前课还有 '+carry.length+' 个语境词待补；按原来源内容继续，今天的新原稿归本课。':'')+(heldSenses.length?'有 '+heldSenses.length+' 个新语境义项与旧词卡不同，旧义与原稿保留；新义项待单独安排。':'')+(context?.available?'本课听读中的目标词已接入原句训练，词义与本句用法逐项对应。':'')+(available<=0?'词汇参考预算已用完，未完成部分保留，继续其他科目。':'先复习再学新词；每组最多6词，与课内词去重，计入今日总预算。')};
}
function mount(box,options={}){if(!box)return;box.replaceChildren();try{const value=state(options);box.hidden=!value.applicable;if(!value.applicable)return;const doc=box.ownerDocument||root.document,title=doc.createElement('strong'),text=doc.createElement('p'),link=doc.createElement('a');title.textContent='今日词汇 · 课内语境词＋8000词循环';text.textContent=value.message;link.textContent=value.label;link.href=value.href;link.className='button';box.append(title,text,link);}catch(error){box.hidden=false;box.textContent='词汇日任务暂未读取：'+error.message+'。已有原稿保留。';}}
return{state,mount};});
