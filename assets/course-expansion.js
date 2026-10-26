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
 return{ID,IDS,RECOMMENDED_MINUTES,GUIDES,overlay,yearOverlay};
});
