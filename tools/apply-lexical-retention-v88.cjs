'use strict';
const fs=require('node:fs'),path=require('node:path');
function replace(source,from,to,label){const applied=source.split(to).length-1;if(applied){if(applied!==1)throw Error('Ambiguous applied retention anchor: '+label);return source;}const count=source.split(from).length-1;if(count!==1)throw Error((count?'Ambiguous':'Missing')+' retention anchor: '+label);return source.replace(from,to);}
function memory(source){
 source=replace(source," function essentialState(){"," function retention(){const api=root.IELTSLexicalRetentionV88||(typeof require==='function'?require('./lexical-retention-v88.js'):null);if(!api?.parseState)throw Error('新语境保持组件未加载或版本待核验，原输入保留。');return api;}\n function essentialState(){",'Memory provider');
 source=replace(source,"'items','drafts','essential','personalization'].includes(k)","'items','drafts','essential','personalization','reviewedRetention'].includes(k)",'Memory optional field');
 source=replace(source,"s.essential=parseEssential(s.essential);","if(s.reviewedRetention!==undefined)s.reviewedRetention=retention().parseState(s.reviewedRetention);s.essential=parseEssential(s.essential);",'Memory parse');
 source=replace(source,"left.essential=mergeEssential(left.essential,right.essential);","left.essential=mergeEssential(left.essential,right.essential);if(left.reviewedRetention!==undefined||right.reviewedRetention!==undefined)left.reviewedRetention=left.reviewedRetention!==undefined&&right.reviewedRetention!==undefined?retention().mergeStates(left.reviewedRetention,right.reviewedRetention):clone(left.reviewedRetention??right.reviewedRetention);",'Memory merge');return source;
}
function contextual(source){
 source=replace(source,"function sourceDebt(word,day,reason){return{word:word.word,materialId:word.source?.materialId||null,originCourseDay:day,reason};}","function sourceDebt(word,day,reason,status={}){return{word:word.word,materialId:word.source?.materialId||null,originCourseDay:day,reason,...(status.eligibleAt?{eligibleAt:status.eligibleAt}:{}),...(word.source?.releasePolicy?.notBeforeCourseDay?{notBeforeCourseDay:word.source.releasePolicy.notBeforeCourseDay}:{})};}\nfunction waitingMessage(rows){const api=root.IELTSLexicalRetentionV88||(typeof require==='function'?require('./lexical-retention-v88.js'):null);return api?.waitingMessage?.(rows)||(array(rows).some(row=>row.reason==='owned-source-first-original-pending')?'先完成对应听读原稿，原句与新场景暂不展示。':'对应来源资格或组件待核验，原输入保留。');}",'C safe debt');
 source=replace(source,"sourceDebt(word,contract.day,status.reason)","sourceDebt(word,contract.day,status.reason,status)",'C release timestamp');
 source=replace(source,"timerSnapshot,projectedRest,remainingCore,budgetFor,","timerSnapshot,projectedRest,remainingCore,budgetFor,waitingMessage,",'C message export');return source;
}
function course(source){
 source=replace(source,"(awaitingSources?'有 '+awaitingSources+' 个语境词已保留来源，先完成对应听读原稿、完整听音和订正，再展示原句并开启训练。':context?.available?","(awaitingSources?(contextual?.waitingMessage?.(context.awaitingSourceWords)||'对应来源资格待核验，原输入保留。'):context?.available?",'EC source waiting');return source;
}
function core(source){
 source=replace(source,"    return Object.values(state.essential.batches).filter(batch => batch.draft || batch.status === 'learning').map(batch => ({id: batch.draft?.id || batch.id, materialId: batch.materialId, courseDay: batch.courseDay, taskId: 'vocabulary', skill: 'vocabulary', startedAt: batch.draft?.startedAt || batch.startedAt, activeSeconds: batch.activeSeconds, activityByDate: {...batch.activityByDate}}));","    let retentionDrafts=[];if(state.reviewedRetention!==undefined){const api=root.IELTSLexicalRetentionV88||(typeof require==='function'?require('./lexical-retention-v88.js'):null);if(!api?.activityDrafts)throw Error('新语境保持活动组件未加载，预算核验暂停，原输入保留。');retentionDrafts=api.activityDrafts(state);}\n    return [...Object.values(state.essential.batches).filter(batch => batch.draft || batch.status === 'learning').map(batch => ({id: batch.draft?.id || batch.id, materialId: batch.materialId, courseDay: batch.courseDay, taskId: 'vocabulary', skill: 'vocabulary', startedAt: batch.draft?.startedAt || batch.startedAt, activeSeconds: batch.activeSeconds, activityByDate: {...batch.activityByDate}})),...retentionDrafts];",'E shared optional activity');
 source=replace(source,"const batches = Object.values(state.essential.batches).filter(batch => batch.draft || batch.status === 'learning').map(batch => ({...batch, id: batch.draft?.id || batch.id, startedAt: batch.draft?.startedAt || batch.startedAt}));","const batches = activityDrafts(state);",'E vocabulary spent ledger');return source;
}
function year(source){return replace(source,"local.push(...Object.values(value?.[section]||{}));if(key==='ielts52-memory-v1')","local.push(...Object.values(value?.[section]||{}));if(key==='ielts52-memory-v1'&&value?.reviewedRetention!==undefined){const retention=root.IELTSLexicalRetentionV88||(typeof require==='function'?require('./lexical-retention-v88.js'):null);if(!retention?.activityDrafts)throw Error('新语境保持活动组件未加载，预算核验暂停，原输入保留。');local.push(...retention.activityDrafts(value));}if(key==='ielts52-memory-v1')",'Year raw optional activity');}
function app(source){
 // Preserve the exact later Bank mapping while still verifying every original v88 anchor.
 const bankHook="    const releaseMapping=legacyReleaseMapping(M.read(),{retention:retentionAPI,bankRuntime:options.bankRuntime});\n    if(releaseMapping.status!=='ready')throw Error('已保存词汇的版本待核验，原答案和原音保留，请重试加载完整学习包。');\n";
 if(source.includes('    const releaseMapping=legacyReleaseMapping(')){
  if(source.split(bankHook).length!==2||source.split(bankHook.split('\n')[1]+'\n').length!==2)throw Error('Missing or ambiguous exact Bank mapping anchor');
  const withoutBank=source.replace(bankHook,'');
  if(app(withoutBank)!==withoutBank)throw Error('Bank mapping requires an already complete legacy retention consumer');
  return source;
 }
 // The family consumer refreshes source evidence after records change.  Check
 // both exact variants together, then run the whole legacy validator against a
 // temporary normalized string.  The returned source is never rewritten.
 const familyMarker='const familySnapshots=new Map(),familyEpoch=new Map();';
 if(source.includes('familySnapshots')){
  if(source.split(familyMarker).length!==2)throw Error('Missing or ambiguous exact family retention marker');
  const pairs=[
   ["const recordsChanged = () => { R?.list?.().then(async values => { if (!disposed) { records = values; retention?.setRecords?.(values);if(!saving&&root.IELTSFamilyLessonExpansionV95?.runtime)await refreshFamily(day);if(!retention?.isBusy?.()&&!disposed)render(); } }).catch(error => notice(error.message)); };","const recordsChanged = () => { R?.list?.().then(values => { if (!disposed) { records = values; retention?.setRecords?.(values);if(!retention?.isBusy?.())render(); } }).catch(error => notice(error.message)); };",'records = values; render();','App record events'],
   ["setRecords(values){records=values;retention?.setRecords?.(values);familySnapshots.clear();render();if(root.IELTSFamilyLessonExpansionV95?.runtime)refreshFamily(day).then(()=>{if(!disposed)render();}).catch(error=>{if(!disposed)notice(error.message);});}","setRecords(values){records=values;retention?.setRecords?.(values);render();}","setRecords(values){records=values;render();}",'App public records']
  ];
  let legacy=source;
  for(const [later,prior,unapplied,label] of pairs){const count=legacy.split(later).length-1;if(count!==1||legacy.includes(prior)||legacy.includes(unapplied))throw Error((count>1||legacy.includes(prior)||legacy.includes(unapplied)?'Ambiguous':'Missing')+' exact family retention anchor: '+label);legacy=legacy.replace(later,prior);}
  legacy=legacy.replaceAll('familySnapshots','normalizedFamilySnapshots');
  if(app(legacy)!==legacy)throw Error('Family mapping requires an already complete legacy retention consumer');
  return source;
 }
 // v95 inserts a read-only saved-batch branch ahead of the existing v88 guard.
 // Verify this exact later shape through the complete legacy validator; never
 // install an incomplete old consumer or skip an absent/duplicate guard.
 const active="async function openBatch(value) {\n      check();if(retention?.isActive?.()){notice('先保存并收起新语境保持练习，原输入保留。');return false;}",
  savedActive="async function openBatch(value) {\n      const saved = allBatches().find(item => item.id === (typeof value === 'string' ? value : value.id));\n      if (saved?.status === 'submitted' && !saved.draft) return openSavedBatch(saved.id);\n      check();if(retention?.isActive?.()){notice('先保存并收起新语境保持练习，原输入保留。');return false;}",
  api="return {render,openBatch,start,getPlan:currentPlan,getRetentionPlan:()=>retention?.getPlan?.()||{required:false,ready:[],waiting:[],completed:[],lapses:0},startRetention:(key,index)=>retention?.start?.(key,index),submitRetention:()=>retention?.submit?.(),getDrafts:()=>{const rows=E.activityDrafts(M.read());",
  savedApi=api.replace('render,openBatch,start','render,openBatch,openSavedBatch,refreshSavedBatches,start'),
  busy="isBusy:()=>!!saving || !!retention?.isBusy?.() || !!controller?.getMediaState?.()?.busy",
  savedBusy="isBusy:()=>!!saving || historyReading || !!retention?.isBusy?.() || !!controller?.getMediaState?.()?.busy";
 if([savedActive,savedApi,savedBusy].some(anchor=>source.includes(anchor))){
  let legacy=source;
  for(const [later,prior,label]of [[savedActive,active,'App one active draft'],[savedApi,api,'App public retention consumer API'],[savedBusy,busy,'App busy']]){
   const count=legacy.split(later).length-1;
   if(count!==1||legacy.includes(prior))throw Error((count>1||legacy.includes(prior)?'Ambiguous':'Missing')+' exact saved-history retention anchor: '+label);
   legacy=legacy.replace(later,prior);
  }
  if(app(legacy)!==legacy)throw Error('Saved-history mapping requires an already complete legacy retention consumer');
  return source;
 }
 source=replace(source,"let currentContext = null, contextSignature = null;","let currentContext = null, contextSignature = null, retention = null;",'App retention owner');
 source=replace(source,"async function openBatch(value) {\n      check();","async function openBatch(value) {\n      check();if(retention?.isActive?.()){notice('先保存并收起新语境保持练习，原输入保留。');return false;}",'App one active draft');
 source=replace(source,"async function start(requestedOrigin) {","async function start(requestedOrigin) {\n      if(retention?.isActive?.()){notice('先保存并收起新语境保持练习，原输入保留。');return;}",'App start guard');
 source=replace(source,"if(sourceWaiting)fresh.append(node('p','有 '+sourceWaiting+' 个语境词已保留来源，先完成对应听读原稿、完整听音和订正，再展示原句并开启训练。','memory-subtle'));","if(sourceWaiting)fresh.append(node('p',contextual?.waitingMessage?.(currentContext.awaitingSourceWords)||'对应来源资格待核验，原输入保留。','memory-subtle'));",'App initial waiting');
 source=replace(source,"list.hidden=!!options.isReviewActive?.()||current?.testing===true","list.hidden=retention?.isActive?.()===true||!!options.isReviewActive?.()||current?.testing===true",'App no inline target leak');
 source=replace(source,"        dashboard.append(next);\n      }\n    }\n    const interact", "        dashboard.append(next);\n      }\n      retention?.render?.(dashboard);\n    }\n    const retentionAPI=root.IELTSLexicalRetentionV88;\n    retention=retentionAPI?.mount?.({document:doc,practice,memory:M,store,records:R,profiles:P,storage:P.storage(),day,now,check,durable,initialRecords:records,sourceOptions,getRecords:()=>records,getNormalPlan:currentPlan,getContext:()=>currentContext,getBudget:options.getBudget,refreshBudget:options.refreshBudget,setRecords:values=>{records=values;},render,canStart:()=>!controller?.getMediaState?.()?.busy&&(!batch||finished),onActiveChange:async(active,detail)=>{if(active){await options.onNewWordsOpened?.();check();controller?.destroy?.();controller=null;batch=null;finished=false;}await options.onActiveChange?.(active,detail);}})||null;\n    const interact",'App mount and render');
 source=replace(source,"if (!savingDraft && !saving) render();","if (!savingDraft && !saving && !retention?.isBusy?.()) render();",'App no recursive memory render');
 source=replace(source,"records = values; render();","records = values; retention?.setRecords?.(values);if(!retention?.isBusy?.())render();",'App record events');
 source=replace(source,"disposed = true; controller?.destroy?.();practice.querySelectorAll", "disposed = true; retention?.destroy?.();controller?.destroy?.();practice.querySelectorAll",'App profile fence');
 source=replace(source,"try { activity(); saveDraft(); } catch (_) {} controller?.pause?.();","try { retention?.save?.();activity(); saveDraft(); } catch (_) {} controller?.pause?.();",'App pagehide');
 source=replace(source,"return {render,openBatch,start,getPlan:currentPlan,getDrafts:()=>{const rows=E.activityDrafts(M.read());","return {render,openBatch,start,getPlan:currentPlan,getRetentionPlan:()=>retention?.getPlan?.()||{required:false,ready:[],waiting:[],completed:[],lapses:0},startRetention:(key,index)=>retention?.start?.(key,index),submitRetention:()=>retention?.submit?.(),getDrafts:()=>{const rows=E.activityDrafts(M.read());",'App public retention consumer API');
 source=replace(source,"pause(){activity();saveDraft();controller?.pause?.();}","pause(){retention?.pause?.();activity();saveDraft();controller?.pause?.();}",'App pause');
 source=replace(source,"setRecords(values){records=values;render();}","setRecords(values){records=values;retention?.setRecords?.(values);render();}",'App public records');
 source=replace(source,"isBusy:()=>!!saving || !!controller?.getMediaState?.()?.busy","isBusy:()=>!!saving || !!retention?.isBusy?.() || !!controller?.getMediaState?.()?.busy",'App busy');
 source=replace(source,"destroy(){pagehide();disposed=true;controller?.destroy?.();","destroy(){pagehide();disposed=true;retention?.destroy?.();controller?.destroy?.();",'App destroy');
 source=replace(source,"    function activity() {\n      const time = now()","    function activity() {\n      if(retention?.isActive?.()){retention.tick?.();return;}\n      const time = now()",'App one active clock');
 source=replace(source,"const interact = () => { lastInteraction = now(); };","const interact = () => { lastInteraction = now();retention?.interact?.(); };",'App shared interaction window');
 source=replace(source,"if (batch && !finished) { activity(); saveDraft(); }\n        controller?.destroy?.();","if (batch && !finished) { activity(); saveDraft(); }\n        if(retention?.isActive?.())await retention.close();\n        controller?.destroy?.();",'App reverse review handoff');return source;
}
function records(source){
 // Context is passed into the real transaction for both family guards; their
 // presence does not replace the retention owner check.  Validate all three
 // exact hooks together, without producing a downgraded consumer.
 if(source.includes('validateFamilyVocabulary(')||source.includes('validateFamilyLessonRecord(')){
  for(const marker of ['function validateFamilyVocabulary(input,records,context){','function validateFamilyLessonRecord(input,records){']){const count=source.split(marker).length-1;if(count!==1)throw Error((count?'Ambiguous applied retention anchor: ':'Missing exact ')+'family records marker');}
  const pairs=[
   ['async record(input,context){const result=await adapter.transaction(state=>{options.validateRecordInput?.(input,state.records,context);const r=put(state,input,clock());','async record(input){const result=await adapter.transaction(state=>{options.validateRecordInput?.(input,state.records);const r=put(state,input,clock());','async record(input){const result=await adapter.transaction(state=>{const r=put(state,input,clock());','Records transaction validation hook'],
   ["store=createStore(adapter,{notify,validateRecordInput(input,records,context){if(input.source==='reviewed-context-retention-v88'&&placedCourseDay(input,{records})!==input.dayNumber)throw Error('保持练习的来源、档案或恢复代际在保存前发生变化，原输入保留。');validateFamilyLessonRecord(input,records);validateFamilyVocabulary(input,records,context);}});return store;","store=createStore(adapter,{notify,validateRecordInput(input,records){if(input.source==='reviewed-context-retention-v88'&&placedCourseDay(input,{records})!==input.dayNumber)throw Error('保持练习的来源、档案或恢复代际在保存前发生变化，原输入保留。');}});return store;","store=createStore(adapter,{notify});return store;",'Records retention owner inside actual transaction'],
   ['result=await target.record(autoLink(input,{records}),context);','result=await target.record(autoLink(input,{records}));',null,'Records context reaches transaction']
  ];
  let legacy=source;
  for(const [later,prior,unapplied,label] of pairs){const count=legacy.split(later).length-1;if(count!==1||legacy.includes(prior)||(unapplied&&legacy.includes(unapplied)))throw Error((count>1||legacy.includes(prior)||(unapplied&&legacy.includes(unapplied))?'Ambiguous':'Missing')+' exact family retention anchor: '+label);legacy=legacy.replace(later,prior);}
  // Remove the family markers only in the temporary validation copy; this
  // prevents recursive detection while leaving every old retention check on.
  legacy=legacy.replace('function validateFamilyVocabulary(input,records,context){','function normalizedFamilyVocabulary(input,records,context){').replace('function validateFamilyLessonRecord(input,records){','function normalizedFamilyLessonRecord(input,records){');
  if(records(legacy)!==legacy)throw Error('Family records mapping requires an already complete legacy retention consumer');
  return source;
 }
 source=replace(source,"async record(input){const result=await adapter.transaction(state=>{const r=put(state,input,clock());","async record(input){const result=await adapter.transaction(state=>{options.validateRecordInput?.(input,state.records);const r=put(state,input,clock());",'Records transaction validation hook');
 source=replace(source,"store=createStore(adapter,{notify});return store;","store=createStore(adapter,{notify,validateRecordInput(input,records){if(input.source==='reviewed-context-retention-v88'&&placedCourseDay(input,{records})!==input.dayNumber)throw Error('保持练习的来源、档案或恢复代际在保存前发生变化，原输入保留。');}});return store;",'Records retention owner inside actual transaction');
 source=replace(source,"const data=options.data||root.IELTSCurriculumData;if(!data)return null;","if(input.source==='reviewed-context-retention-v88'){const api=root.IELTSLexicalRetentionV88||(typeof require==='function'?require('./lexical-retention-v88.js'):null);return api?.queueCourseDay?.(input,options)??null;}const data=options.data||root.IELTSCurriculumData;if(!data)return null;",'Records source-specific owner');
 source=replace(source,"courseDay=placedCourseDay(input,options);if(courseDay!==null)","courseDay=placedCourseDay(input,options);if(input.source==='reviewed-context-retention-v88'&&courseDay===null)throw Error('保持练习的档案、代际或完整冻结草稿尚未核验，原输入保留。');if(courseDay!==null)",'Records no generic fallback');
 source=replace(source,"const target=browserStore(),records=['course-player'","const target=browserStore(),records=input.source==='reviewed-context-retention-v88'||['course-player'",'Records fresh source evidence list');return source;
}
const RUNTIME_ROLES=Object.freeze({'context-vocabulary-course':'assets/contextual-vocabulary-course.js','essential-vocabulary-course':'assets/essential-vocabulary-course.js','essential-vocabulary-app':'assets/essential-vocabulary-app.js','memory-core':'assets/memory-core.js','memory-session':'assets/memory-session.js','essential-vocabulary-core':'assets/essential-vocabulary-core.js','vocabulary-practice':'assets/vocabulary-practice.js','lexical-reviewed-context-helper':'assets/lexical-reviewed-context-v88.js','lexical-reviewed-context-data':'assets/lexical-reviewed-v88-data.js','lexical-reviewed-context-policy':'assets/lexical-reviewed-v88-policy.js','lexical-retention-helper':'assets/lexical-retention-v88.js','lexical-retention-feedback':'assets/lexical-retention-v88-feedback.js'});
function applyConsumers(directory){const transforms={'assets/memory-core.js':memory,'assets/contextual-vocabulary-course.js':contextual,'assets/essential-vocabulary-course.js':course,'assets/essential-vocabulary-core.js':core,'assets/year-planner.js':year,'assets/essential-vocabulary-app.js':app,'assets/learning-records.js':records},changes=[];for(const[file,transform]of Object.entries(transforms)){const full=path.join(directory,file),raw=fs.readFileSync(full,'utf8'),crlf=raw.includes('\r\n'),value=transform(raw.replace(/\r\n/g,'\n')),after=crlf?value.replace(/\n/g,'\r\n'):value;if(after!==raw)changes.push({file,full,after});}for(const entry of changes)fs.writeFileSync(entry.full,entry.after);return changes.map(entry=>entry.file);}
module.exports={RUNTIME_ROLES,memory,contextual,course,core,year,app,records,applyConsumers,apply:applyConsumers};if(require.main===module){if(!process.argv[2])throw Error('Usage: node apply-retention-transform.cjs <independent-candidate>');console.log(JSON.stringify(applyConsumers(path.resolve(process.argv[2]))));}
