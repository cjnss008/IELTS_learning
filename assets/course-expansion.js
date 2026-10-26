(function(root,factory){'use strict';const api=factory();root.IELTSCourseExpansion=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const ID='day02-expansion-69';
 const IDS={vocabulary:'day02-expansion-vocabulary',grammar:'day02-expansion-grammar',listening:'day02-expansion-listening',reading:'day02-expansion-reading',speaking:'day02-expansion-speaking',writing:'day02-expansion-writing'};
 const RECOMMENDED_MINUTES={vocabulary:90,grammar:35,listening:55,reading:50,speaking:50,writing:60,reflection:20};
 const GUIDES={vocabulary:'新增7个读听原句词：先完成三写三读和三轮测试；这些本课词计入8000词当日安排，同词不再重复初学。',grammar:'新增问句、not否定、we/they和规则复数：先理解新规则，再做10题；原课I am/you are练习保留为基础巩固。',listening:'新增三人新场景：先看英文题目，完整听音后作答；注意房间与时间的纠正，之后再核对原文。',reading:'新增124词的新英语班情境与8题；用不同人物、班级和物品练习新结构，不沿用旧题答案。',speaking:'新增我们与他们的信息交换：完成新示范分段跟读后，用自己的信息另录6—8句，包含否定和be问句。',writing:'新增欢迎新同学留言：独立写6—8句、至少40词，包含we/they、否定和be问句；原稿与反馈分别保留。'};
 const clone=value=>JSON.parse(JSON.stringify(value));
 function yearOverlay(baseDay,data){
  const year=data?.yearExpansion,plan=year?.assignments?.[baseDay?.day];if(baseDay?.day<2||baseDay?.day>364||year?.active!==true||!plan)return baseDay;
  const day=clone(baseDay),map=new Map((data.materials||[]).map(material=>[material.id,material]));
  const taskMaterialIds=Object.fromEntries(Object.entries(plan.taskMaterialIds||{}).map(([skill,ids])=>[skill,ids.filter(id=>map.has(id))]));
  if(plan.afterCore){day.afterCoreExpansion={version:year.version,taskMaterialIds,materialPractice:plan.materialPractice,mode:'practice',instructions:'先完整完成本日保留测验；扩展材料在核心之后、剩余预算内单独进行，不进入保留卷与测评分数。'};return day;}
  for(const task of day.tasks||[]){const ids=taskMaterialIds[task.id]||[];if(!ids.length)continue;const original=task.yearExpansion?.version===year.version?task.yearExpansion.originalMaterialIds:(task.materialIds||[]).slice();task.materialIds=[...new Set([...(task.materialIds||[]),...ids])];if(Array.isArray(task.coreMaterialIds))task.coreMaterialIds=[...new Set([...task.coreMaterialIds,...ids])];
   const practice=new Map((task.materialPractice||[]).map(item=>[item.materialId,item]));for(const id of ids)practice.set(id,plan.materialPractice?.[id]||{materialId:id,cycle:'first-planned',firstPlannedDay:day.day});task.materialPractice=[...practice.values()].filter(item=>task.materialIds.includes(item.materialId));task.practiceCycle=task.materialPractice.every(item=>item.cycle==='first-planned')?'first-planned':task.materialPractice.every(item=>item.cycle==='scheduled-reuse')?'scheduled-reuse':'mixed';
   const newCount=ids.filter(id=>practice.get(id)?.cycle==='first-planned').length;if(task.yearExpansion?.version!==year.version)task.instructions=(task.instructions||'')+'\n\n全年扩展：'+(newCount?'完成本日首次安排的新材料，再核对原文或反馈。':'本日沿用同一扩展材料进行巩固、订正或复述，保留原ID；不当作新的未见任务。');task.yearExpansion={version:year.version,originalMaterialIds:original,addedMaterialIds:ids,newMaterials:newCount,scope:'每周2份新阅读与2份新听力；首学和巩固分别标记，实际曝光另核对。'};
   const materials=task.materialIds.map(id=>map.get(id)).filter(Boolean);if(['grammar','reading','listening'].includes(task.id))task.quantity=materials.reduce((sum,material)=>sum+(material.questions?.length||0),0);if(task.id==='vocabulary')task.quantity=materials.reduce((sum,material)=>sum+(material.vocabulary?.length||0),0);if(['speaking','writing'].includes(task.id))task.quantity=materials.reduce((sum,material)=>sum+(material.minWords||12),0);
  }
  day.totalMinutes=(day.tasks||[]).reduce((sum,task)=>sum+task.minutes,0);day.yearExpansion={version:year.version,week:plan.week,variant:plan.variant,afterCore:false};return day;
 }
 function overlay(baseDay,data){
  if(baseDay?.day!==2)return yearOverlay(baseDay,data);
  const map=new Map((data?.materials||[]).map(material=>[material.id,material]));
  if(Object.values(IDS).some(id=>!map.has(id)))return yearOverlay(baseDay,data);
  const day=clone(baseDay),added=[];
  for(const task of day.tasks||[]){
   const id=IDS[task.id];if(!id)continue;
   const original=task.contentExpansion?.id===ID?task.contentExpansion.originalMaterialIds:(task.materialIds||[]).slice();
   task.materialIds=[...new Set([...(task.materialIds||[]),id])];
   if(Array.isArray(task.coreMaterialIds))task.coreMaterialIds=[...new Set([...task.coreMaterialIds,id])];
   if(task.contentExpansion?.id!==ID)task.instructions=(task.instructions||'')+'\n\n第2课新增：'+GUIDES[task.id];
   task.contentExpansion={id:ID,originalMaterialIds:original,addedMaterialIds:[id],scope:'新增知识与新情境；原课材料、已有原稿和历史评估保留。'};
   const materials=task.materialIds.map(key=>map.get(key)).filter(Boolean);
   if(['grammar','listening','reading'].includes(task.id))task.quantity=materials.reduce((sum,material)=>sum+(material.questions?.length||0),0);
   if(['speaking','writing'].includes(task.id))task.quantity=materials.reduce((sum,material)=>sum+(material.minWords||12),0);
   if(task.id==='vocabulary')task.quantity=materials.reduce((sum,material)=>sum+(material.vocabulary?.length||0),0);
   added.push(id);
  }
  day.totalMinutes=(day.tasks||[]).reduce((sum,task)=>sum+task.minutes,0);
  day.contentExpansion={id:ID,fromCourseDay:2,addedMaterialIds:added,method:'append-only',note:'保留原课材料与分钟；新开课程可采用构建后的参考分配，已开始课程继续原预算。'};
  return yearOverlay(day,data);
 }
 // Display order is deliberately separate from the saved task contract. It is
 // safe for old, frozen lessons too: no material, answer or requirement changes.
 function orderedMaterialIds(task,number){
  const ids=[...(task?.materialIds||[])];if(!Number.isInteger(number)||number<2||number>10||task?.mode!=='practice')return ids;
  const expansion=IDS[task.id],rank=id=>id===expansion?0:task.materialPractice?.find(row=>row.materialId===id)?.cycle==='scheduled-reuse'?2:1;
  return ids.map((id,index)=>({id,index,rank:rank(id)})).sort((a,b)=>a.rank-b.rank||a.index-b.index).map(row=>row.id);
 }
 function taskMaterialLabel(task,id,number){
  if(!Number.isInteger(number)||number<2||number>10||task?.mode!=='practice')return'';
  if(id===IDS[task.id])return number===2?'本课新知识':'新知识复习';
  if(task.id==='grammar'&&/^w01-read-\d-grammar$/.test(id))return'基础复习';
  if(task.id==='grammar'&&number===8)return'本课新知识';
  if(task.id==='grammar'&&number>=9)return'语法应用';
  if(task.materialPractice?.find(row=>row.materialId===id)?.cycle==='scheduled-reuse')return'复习';
  return'本课练习';
 }
 // Only the runtime projection calls this, after all saved work has been loaded.
 // The source curriculum and the append-only historical expansion stay intact.
 function unstartedLessonFlow(baseDay,data,options={}){
  const number=baseDay?.day;
  if(!Number.isInteger(number)||number<2||number>10||options.contextReady!==true||baseDay.tasks?.some(task=>task.mode==='assessment')||options.protectedDays?.includes(number)||(options.records||[]).some(row=>row.dayNumber===number||row.courseDay===number)||(options.drafts||[]).some(row=>row.courseDay===number))return baseDay;
  if(!(baseDay.tasks||[]).some(task=>(task.materialIds||[]).some(id=>id===IDS[task.id]||/^w0[12]-(?:read|listen)-[1-6](?:-|$)/.test(id))))return baseDay;
  const day=clone(baseDay),map=new Map((data?.materials||[]).map(material=>[material.id,material])),removed=baseDay.lessonFlow?.version==='lessons-02-10-new-first-v1'?clone(baseDay.lessonFlow.removed):[];
  function masteredRepeat(id){
   const latest=(options.records||[]).filter(row=>row.materialId===id&&row.dayNumber<number).sort((a,b)=>String(b.submittedAt).localeCompare(String(a.submittedAt))||(Number(b.version)||0)-(Number(a.version)||0))[0];
   if(!latest||latest.evaluation?.result!=='pass'||!Number.isFinite(Date.parse(latest.submittedAt))||Date.parse(latest.submittedAt)>(options.now??Date.now()))return false;
   try{return options.verifiedRecord?.(latest,map.get(id))===true;}catch(_){return false;}
  }
  for(const task of day.tasks||[]){
   if(task.mode!=='practice')continue;
   const original=[...new Set(task.materialIds||[])];let ids=original.slice();
   // The ten-question new pack already includes I am / you are / named is.
   // Avoid making three near-identical foundation packs its prerequisites.
   if(task.id==='grammar'&&number===2&&ids.includes(IDS.grammar))ids=ids.filter(id=>!['w01-read-2-grammar','w01-read-3-grammar','w01-read-4-grammar'].includes(id));
   if(task.id==='grammar'&&number===3&&ids.includes(IDS.grammar))ids=ids.filter(id=>id!=='w01-read-5-grammar');
   if(task.id==='grammar'&&number===4&&ids.includes('w01-read-4-grammar'))ids=ids.filter(id=>id!=='w01-read-6-grammar');
   // Repeating the exact alphabet/number exercise is useful when evidence is
   // missing. A verified complete pass lets a fresh day focus on its main audio.
   if(task.id==='listening'&&!task.publicCourseAssignments?.length&&ids.some(id=>!/^sounds-\d+$/.test(id)))ids=ids.filter(id=>!/^sounds-\d+$/.test(id)||!masteredRepeat(id));
   task.materialIds=orderedMaterialIds({...task,materialIds:ids},number);
   if(Array.isArray(task.coreMaterialIds))task.coreMaterialIds=task.materialIds.filter(id=>task.coreMaterialIds.includes(id));
   const dropped=original.filter(id=>!ids.includes(id));if(dropped.length)removed.push({taskId:task.id,materialIds:dropped});
   if(Array.isArray(task.materialPractice))task.materialPractice=task.materialPractice.filter(row=>ids.includes(row.materialId));
   if(task.materialPractice?.length)task.practiceCycle=task.materialPractice.every(row=>row.cycle==='first-planned')?'first-planned':task.materialPractice.every(row=>row.cycle==='scheduled-reuse')?'scheduled-reuse':'mixed';
   if(task.grammarLearningPlan){task.grammarLearningPlan.newMaterialIds=task.grammarLearningPlan.newMaterialIds.filter(id=>ids.includes(id));task.grammarLearningPlan.reviewMaterialIds=task.grammarLearningPlan.reviewMaterialIds.filter(id=>ids.includes(id));}
   const materials=task.materialIds.map(id=>map.get(id)).filter(Boolean);
   if(['grammar','listening','reading'].includes(task.id))task.quantity=materials.reduce((sum,material)=>sum+(material.questions?.length||0),0);
   if(number===2&&task.id==='grammar')task.instructions='先理解本课新知识：be 提问、not 否定、we / they 和规则复数，再独立完成10题并订正。I am / you are 与姓名搭配 is 的基础例句已包含在本课讲解中。';
   if(number===3&&task.id==='grammar')task.instructions='复习上一课的提问、否定与 we / they，用新人物口头改写后独立作答，再核对需要订正的地方。';
   if(number===4&&task.id==='grammar')task.instructions='本课只做一组基础应用：区分 I am、you are 与 he / she / it is，再用自己的信息改写句子。';
  }
  if(JSON.stringify(day)===JSON.stringify(baseDay))return baseDay;
  day.lessonFlow={version:'lessons-02-10-new-first-v1',removed,scope:'仅未开始课程；保留原材料、历史课表、原稿与评估。'};
  return day;
 }
 return{ID,IDS,RECOMMENDED_MINUTES,GUIDES,overlay,yearOverlay,orderedMaterialIds,taskMaterialLabel,unstartedLessonFlow};
});
