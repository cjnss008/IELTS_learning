(function(root){
  'use strict';
  const KEYS={
    'ielts40-study-v1':'原课文学习记录', 'ielts40-translation-visible':'中文显示偏好', 'ielts-word-groups-v1':'原分组词卡记录',
    'ielts-diagnostic-20261003-v1':'30分钟测试文字记录', 'ielts52-daily-plan-v1':'每日计划与测评', 'ielts52-dictation-v1':'逐句听写草稿',
    'ielts52-notebook-v1':'原句生词本', 'ielts52-review-v1':'间隔复习记录', 'ielts-ai-coach-v1':'AI辅导写作草稿', 'ielts52-foundation-v1':'基础入门练习'
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
    for(const [key,raw] of Object.entries(b.entries)){if(!Object.hasOwn(KEYS,key)||typeof raw!=='string')throw Error('备份含未知模块，拒绝恢复。');bytes+=raw.length;if(bytes>32*1024*1024)throw Error('备份内容超过限制。');entries[key]=raw;}
    return entries;
  }
  function validate(key,raw){
    if(!Object.hasOwn(KEYS,key))throw Error('模块不在恢复白名单。');
    const v=JSON.parse(raw);plain(v);
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
  function restore(storage,entries,keys){
    const old={};for(const key of keys){if(!Object.hasOwn(entries,key))throw Error('缺少所选模块。');validate(key,entries[key]);old[key]=storage.getItem(key);}
    try{for(const key of keys)storage.setItem(key,entries[key]);}
    catch(error){let rollbackFailed=false;for(const key of keys){try{old[key]===null?storage.removeItem(key):storage.setItem(key,old[key]);}catch{rollbackFailed=true;}}throw Error(rollbackFailed?'恢复失败且无法完整回滚，请保留导出的原始备份，勿关闭页面。':'恢复未完成，已还原原记录。可能是存储空间不足。');}
    return keys.length;
  }
  const api={KEYS,parseBundle,validate,restore};root.IELTSBackup=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
