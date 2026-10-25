(function(root){
  'use strict';
  const KEYS={
    'ielts52-study-timer-v1':'番茄钟设置与每日休息时间（不计学习掌握）',
    'ielts52-listening-lab-v1':'精听帮助、片段循环与听音笔记',
    'ielts52-memory-v1':'FSRS分技能回忆、个人参数与调度',
    'ielts40-study-v1':'原课文学习记录', 'ielts40-translation-visible':'中文显示偏好', 'ielts-word-groups-v1':'原分组词卡记录',
    'ielts-diagnostic-20261003-v1':'30分钟测试文字记录', 'ielts52-daily-plan-v1':'每日计划与测评', 'ielts52-dictation-v1':'逐句听写草稿',
    'ielts52-notebook-v1':'原句生词本', 'ielts52-review-v1':'间隔复习记录', 'ielts-ai-coach-v1':'AI辅导写作草稿', 'ielts52-foundation-v1':'基础入门练习',
    'ielts52-learning-records-v1':'原稿、反馈、订正与复测作品库', 'ielts52-course-player-v1':'课程草稿、曝光与待评关联',
    'ielts52-mistake-book-v1':'全环节错题、原始尝试、整页订正轮次与每日 AI 复盘',
    'ielts52-adaptive-plan-v1':'AI 复盘策略、已开始课程日与未开始日的个性化计划',
    'ielts52-selection-practice-v1':'词句巩固与延迟回忆题', 'ielts52-selection-ai-cache-v1':'已保存词句详解',
    'ielts52-textbook-exposure-v1':'本地教材与剑雅试卷曝光记录'
  };
  function plain(v,depth=0){
    if(depth>15)throw Error('备份嵌套过深。');
    if(v===null||typeof v==='boolean')return;
    if(typeof v==='string'){if(v.length>100000)throw Error('单项文字过长。');return;}
    if(typeof v==='number'){if(!Number.isFinite(v))throw Error('数字无效。');return;}
    if(typeof v!=='object')throw Error('备份含不支持的值。');
    if(Object.keys(v).length>30000)throw Error('记录数量过多。');
    for(const k of Object.keys(v)){if(['__proto__','prototype','constructor'].includes(k))throw Error('备份含不安全的键。');plain(v[k],depth+1);}
  }
  function parseBundle(value){
    const b=typeof value==='string'?JSON.parse(value):value;
    if(!b||b.app!=='ielts52-backup'||b.schemaVersion!==1||!b.entries||typeof b.entries!=='object'||Array.isArray(b.entries))throw Error('请选择本站备份中心导出的 JSON 文件。');
    const entries={};let bytes=0;
    if(b.sourceProfile!==undefined){if(!root.IELTSProfiles)throw Error('档案模块未加载。');root.IELTSProfiles.parseProfile(b.sourceProfile);}
    for(const [key,raw] of Object.entries(b.entries)){if(!Object.hasOwn(KEYS,key)||typeof raw!=='string')throw Error('备份含未知模块，拒绝恢复。');bytes+=raw.length;if(bytes>160*1024*1024)throw Error('备份内容超过限制。');entries[key]=raw;}
    return entries;
  }
  function validate(key,raw){
    if(!Object.hasOwn(KEYS,key))throw Error('模块不在恢复白名单。');
    const v=JSON.parse(raw);
    if(key==='ielts52-study-timer-v1'){if(!root.IELTSStudyTimerCore)throw Error('番茄钟模块未加载。');return root.IELTSStudyTimerCore.parseState(v);}
    if(key==='ielts52-listening-lab-v1'){if(!root.IELTSListeningLab)throw Error('精听模块未加载。');return root.IELTSListeningLab.parseState(v);}
    if(key==='ielts52-memory-v1'){if(!root.IELTSMemory)throw Error('记忆模块未加载。');return root.IELTSMemory.parseState(v);}
    if(key==='ielts52-learning-records-v1'){if(!root.IELTSRecords)throw Error('作品模块未加载。');return root.IELTSRecords.parseState(v);}
    if(key==='ielts52-mistake-book-v1'){if(!root.IELTSMistakes)throw Error('错题模块未加载。');return root.IELTSMistakes.parseState(v);}
    if(key==='ielts52-adaptive-plan-v1'){if(!root.IELTSAdaptivePlan)throw Error('个性化计划模块未加载。');return root.IELTSAdaptivePlan.parseState(v);}
    if(key==='ielts52-textbook-exposure-v1'){if(!root.IELTSTextbookLibrary)throw Error('教材记录模块未加载。');return root.IELTSTextbookLibrary.parseState(v);}
    plain(v);
    if(key==='ielts52-course-player-v1')return root.IELTSCoursePlayer.parseState(v);
    if(key==='ielts52-selection-practice-v1')return root.IELTSSelectionAI.parsePractice(v);
    if(key==='ielts52-selection-ai-cache-v1')return root.IELTSSelectionAI.parseCache(v);
    if(key==='ielts40-translation-visible'){if(typeof v!=='boolean')throw Error('显示偏好无效。');return v;}
    if(key==='ielts52-notebook-v1')return root.IELTSNotebook.parse(v);
    if(key==='ielts52-daily-plan-v1')return root.IELTSPlanState.parseState(v);
    if(key==='ielts52-review-v1')return root.IELTSReviewCore.parseState(v,[]);
    if(key==='ielts52-foundation-v1')return root.IELTSFoundation.parseState(v);
    if(!v||typeof v!=='object'||Array.isArray(v))throw Error('此模块应为记录对象。');
    if(key==='ielts40-study-v1')for(const [day,r]of Object.entries(v)){
      if(!/^(?:[1-9]|[1-4]\d|5[0-2])$/.test(day)||!r||typeof r!=='object'||Array.isArray(r)||!r.values||typeof r.values!=='object'||Array.isArray(r.values))throw Error('课文记录结构无效。');
      if(Object.values(r.values).some(x=>!['string','number','boolean'].includes(typeof x)))throw Error('课文答案格式无效。');
      if(r.done!==undefined&&typeof r.done!=='boolean')throw Error('课文完成状态无效。');
    }
    if(key==='ielts-word-groups-v1'&&Object.entries(v).some(([k,x])=>!/^\d+$/.test(k)||Number(k)>359||typeof x!=='boolean'))throw Error('分组词卡记录无效。');
    if(key==='ielts52-dictation-v1')for(const [id,r]of Object.entries(v)){if(!/^\d{1,2}:\d+-\d+$/.test(id)||Number(id.split(':')[0])<1||Number(id.split(':')[0])>52||!r||typeof r.answer!=='string'||r.answer.length>4000||typeof r.assisted!=='boolean'||(r.exposed!==undefined&&typeof r.exposed!=='boolean')||typeof r.at!=='string'||!Number.isFinite(Date.parse(r.at)))throw Error('听写记录无效。');}
    if(key==='ielts-ai-coach-v1'){
      if(v.version!==1||!v.drafts||typeof v.drafts!=='object'||Array.isArray(v.drafts)||Object.keys(v.drafts).length>30)throw Error('辅导草稿结构无效。');
      for(const [id,r]of Object.entries(v.drafts)){
        if(!/^(grammar|speaking_text|writing:academic_task[12]:[a-z-]+)$/.test(id)||!r||typeof r!=='object'||Array.isArray(r))throw Error('辅导题目标识无效。');
        for(const[k,max]of [['text',10000],['context',3000],['beforeText',10000],['feedback',24000],['feedbackMeta',500],['disclaimer',1000]])if(typeof r[k]!=='string'||r[k].length>max)throw Error('辅导草稿内容无效。');
      }
    }
    if(key==='ielts-diagnostic-20261003-v1'){
      if(!Number.isInteger(v.stage)||v.stage< -1||v.stage>3||!v.answers||typeof v.answers!=='object'||Array.isArray(v.answers)||!Array.isArray(v.records)||!Array.isArray(v.events)||!Array.isArray(v.plays)||v.plays.length!==2||v.plays.some(n=>!Number.isInteger(n)||n<0)||typeof v.essay!=='string')throw Error('能力测试文字记录无效。');
      if(Object.values(v.answers).some(x=>typeof x!=='string')||(v.complete!==undefined&&typeof v.complete!=='boolean')||(v.complete&&v.stage!==3))throw Error('能力测试作答状态无效。');
      for(const k of ['started','stageStart','deadline'])if(v[k]!==undefined&&v[k]!==null&&(!Number.isFinite(v[k])||v[k]<0))throw Error('能力测试时间无效。');
    }
    return v;
  }
  function mergeLocal(key,old,raw){
    if(key==='ielts52-study-timer-v1')return JSON.stringify(old===null?root.IELTSStudyTimerCore.restore(validate(key,raw)):root.IELTSStudyTimerCore.mergeStates(validate(key,old),validate(key,raw)));
    if(old===null)return raw;
    if(key==='ielts52-listening-lab-v1')return JSON.stringify(root.IELTSListeningLab.mergeStates(validate(key,old),validate(key,raw)));
    if(key==='ielts52-memory-v1')return JSON.stringify(root.IELTSMemory.mergeStates(validate(key,old),validate(key,raw)));
    if(key==='ielts52-mistake-book-v1')return JSON.stringify(root.IELTSMistakes.mergeStates(validate(key,old),validate(key,raw)));
    if(key==='ielts52-adaptive-plan-v1')return JSON.stringify(root.IELTSAdaptivePlan.mergeStates(validate(key,old),validate(key,raw)));
    if(key==='ielts52-textbook-exposure-v1'){
      validate(key,old);validate(key,raw);
      let prepared=old;
      root.IELTSTextbookLibrary.createStore({getItem:()=>prepared,setItem:(name,value)=>{prepared=value;}}).restore(raw);
      return prepared;
    }
    if(key==='ielts52-course-player-v1')return JSON.stringify(root.IELTSCoursePlayer.mergeState(validate(key,old),validate(key,raw)));
    if(key==='ielts52-selection-practice-v1'){
      const a=validate(key,old),b=validate(key,raw),items=new Map(a.items.map(x=>[x.id,x]));
      for(const item of b.items){const prior=items.get(item.id);if(!prior){items.set(item.id,item);continue;}const base=x=>{const result={...x};delete result.parentId;delete result.dueAt;return JSON.stringify(result);};if(base(prior)!==base(item)||(prior.parentId&&item.parentId&&prior.parentId!==item.parentId))throw Error('同一词句巩固题存在不同版本，原记录保留。');items.set(item.id,{...prior,parentId:prior.parentId||item.parentId,dueAt:prior.dueAt>item.dueAt?prior.dueAt:item.dueAt});}
      return JSON.stringify(root.IELTSSelectionAI.parsePractice({schema:1,items:[...items.values()]}));
    }
    return raw;
  }
  function restore(storage,entries,keys){
    if(keys.includes('ielts52-learning-records-v1'))throw Error('作品库须使用异步合并恢复，不能写进文字存储。');
    const old={},prepared={};for(const key of keys){if(!Object.hasOwn(entries,key))throw Error('缺少所选模块。');validate(key,entries[key]);old[key]=storage.getItem(key);prepared[key]=mergeLocal(key,old[key],entries[key]);}
    try{for(const key of keys)storage.setItem(key,prepared[key]);}
    catch(error){let rollbackFailed=false;for(const key of keys){try{old[key]===null?storage.removeItem(key):storage.setItem(key,old[key]);}catch{rollbackFailed=true;}}throw Error(rollbackFailed?'恢复失败且无法完整回滚，请保留导出的原始备份，勿关闭页面。':'恢复未完成，已还原原记录。可能是存储空间不足。');}
    return keys.length;
  }
  async function restoreAll(storage,entries,keys,records=root.IELTSRecords){
    if(!Array.isArray(keys)||new Set(keys).size!==keys.length)throw Error('恢复模块列表无效。');
    const recordKey='ielts52-learning-records-v1',old={},prepared={},localKeys=keys.filter(k=>k!==recordKey);
    for(const key of keys){if(!Object.hasOwn(entries,key))throw Error('缺少所选模块。');validate(key,entries[key]);}
    if(keys.includes(recordKey)){if(!records)throw Error('作品库未加载。');root.IELTSRecords.mergeStates(await records.exportState(),JSON.parse(entries[recordKey]));}
    for(const key of localKeys){old[key]=storage.getItem(key);prepared[key]=mergeLocal(key,old[key],entries[key]);}
    const written=[];
    try{
      for(const key of localKeys){if(storage.getItem(key)!==old[key])throw Error('恢复期间记录已改变，请关闭其他学习页再重试。');storage.setItem(key,prepared[key]);written.push(key);}
      if(keys.includes(recordKey))await records.importState(entries[recordKey],{mode:'merge'});
    }catch(error){let rollbackFailed=false;for(const key of written){try{if(storage.getItem(key)!==prepared[key]){rollbackFailed=true;continue;}old[key]===null?storage.removeItem(key):storage.setItem(key,old[key]);}catch{rollbackFailed=true;}}throw Error(rollbackFailed?'恢复停止，部分文字模块无法回滚；请保留原始备份并检查当前档案。':error.message+' 恢复未完成，已还原文字记录，原作品库保留。');}
    return keys.length;
  }
  const api={KEYS,parseBundle,validate,mergeLocal,restore,restoreAll};root.IELTSBackup=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
