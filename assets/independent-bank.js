(function(root,factory){'use strict';const api=factory(root);root.IELTSIndependentBank=api;if(typeof module==='object'&&module.exports)module.exports=api;if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',()=>api.mount(root));else api.mount(root);}})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const NAMES={reading:'阅读',listening:'听力',writing:'Academic Task 1'},FIGURES={table:'表格',line:'折线图',bar:'柱状图',pie:'饼图',map:'地图',process:'流程图',mixed:'组合图'};
 const LOCALES={'en-GB':'英国英语','en-US':'美国英语','en-AU':'澳大利亚英语','en-IN':'印度英语','en-NZ':'新西兰英语'};
 function catalog(data,exposures={},records=[]){
  return(data?.materials||[]).filter(m=>m.independentBank===true&&m.pool==='independent').map(m=>{
   const own=records.filter(r=>r.materialId===m.id),e=exposures[m.id],seen=Boolean(e)||own.length>0;
   // Deliberate metadata allowlist: no passage, transcript, prompt, figure, question or audio URL.
   return{id:m.id,title:m.title,level:m.level,skill:m.skill,figureType:m.figureType||'',questionCount:m.questions?.length||0,estimatedMinutes:m.estimatedMinutes||20,audioLocale:m.audioLocale||'',audioAccent:m.audioAccent||'',voiceKind:m.audioKind==='human'&&m.audioSynthetic===false?'human':m.audioSynthetic===true?'synthetic':'',synthetic:m.audioSynthetic===true,reader:m.audioKind==='human'?m.audioVoice||'':'',genre:m.audioKind==='human'?m.source?.genre||'':'',exposure:seen?'seen':'unseen',assisted:e?.assisted===true||own.some(r=>Object.values(r.assistance||{}).some(Boolean)),submitted:own.length};
  });
 }
 function filter(items,criteria={}){return items.filter(m=>(!criteria.level||m.level===criteria.level)&&(!criteria.skill||m.skill===criteria.skill)&&(!criteria.locale||m.audioLocale===criteria.locale)&&(!criteria.voiceKind||m.voiceKind===criteria.voiceKind)&&(!criteria.exposure||m.exposure===criteria.exposure));}
 function summary(items){const human=items.filter(m=>m.voiceKind==='human');return{materials:items.length,sourceCount:items.filter(m=>['reading','listening'].includes(m.skill)).length,reading:items.filter(m=>m.skill==='reading').length,synthetic:items.filter(m=>m.voiceKind==='synthetic').length,human:human.length,humanReaders:new Set(human.map(m=>m.reader).filter(Boolean)).size,humanLocales:new Set(human.map(m=>m.audioLocale)).size,figures:items.filter(m=>m.skill==='writing').length};}
 function href(item,preview=false){if(!item||!/^independent-[a-z0-9-]+$/.test(item.id))throw Error('独立材料编号无效。');return'今日学习.html?bank=1&material='+encodeURIComponent(item.id)+(preview?'&preview=1':'');}
 function previewHref(value){if(!value||/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(value))return value;const [baseAndQuery,fragment]=value.split('#'),position=baseAndQuery.indexOf('?'),base=position<0?baseAndQuery:baseAndQuery.slice(0,position),params=new URLSearchParams(position<0?'':baseAndQuery.slice(position+1));params.set('preview','1');return base+'?'+params.toString()+(fragment?'#'+fragment:'');}
 function preservePreviewLinks(doc,preview){if(!preview)return;for(const a of doc.querySelectorAll?.('a[href]')||[]){const value=a.getAttribute('href');a.href=previewHref(value);}}
 async function mount(host=root){
  const doc=host.document,$=id=>doc.getElementById(id);if(!$('independentBankApp'))return null;
  const status=$('bankStatus'),list=$('bankMaterials'),preview=new URLSearchParams(host.location.search).get('preview')==='1';let items=[],stale=false;preservePreviewLinks(doc,preview);
  const node=(tag,text,cls)=>{const n=doc.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  const criteria=()=>({level:$('bankLevel').value,skill:$('bankSkill').value,locale:$('bankLocale').value,voiceKind:$('bankVoiceKind')?.value||'',exposure:$('bankExposure').value});
  function render(){
   if(stale)return;list.replaceChildren();const selected=filter(items,criteria());
   const counts=summary(items);if($('bankInventory'))$('bankInventory').textContent=counts.reading+'篇原创阅读、'+counts.synthetic+'段原创合成听力、'+counts.human+'段真人历史作品朗读，以及'+counts.figures+'类原创图表；共'+counts.sourceCount+'份不同听读正文。真人源由'+counts.humanReaders+'位读者朗读，覆盖'+counts.humanLocales+'种有明确来源标签的地域英语。';
   $('bankCount').textContent='显示 '+selected.length+' / '+items.length+' 份；本档案尚未登记曝光 '+items.filter(m=>m.exposure==='unseen').length+' 份。';
   for(const m of selected){const card=node('article',null,'bank-card'),meta=node('p',m.level+' · '+NAMES[m.skill]+(m.figureType?' · '+FIGURES[m.figureType]:''),'bank-meta'),title=node('h2',m.title),detail=node('p',m.skill==='writing'?'20分钟 · 至少150词 · 原创模拟图表':m.questionCount+'题 · 参考'+m.estimatedMinutes+'分钟 · 独立分科短测');card.append(meta,title,detail);
    if(m.audioLocale)card.append(node('p',m.voiceKind==='human'?'真人历史朗读 · '+m.audioAccent+' · '+m.reader+'；地域标签来自读者自述或同读者目录，非声学认证。':(LOCALES[m.audioLocale]||m.audioLocale)+'（合成） · 官方声音地域元数据核实；非真人录音','bank-small'));
    card.append(node('p',(m.exposure==='seen'?'已登记曝光；再次使用按已见材料记录':'本档案未登记曝光；开始后保留曝光记录')+(m.assisted?' · 既有辅助记录':'')+(m.submitted?' · 已提交'+m.submitted+'份作品':''),'bank-exposure'));
    const a=node('a',m.exposure==='seen'?'查看说明与继续练习':'打开独立测评说明','bank-open');a.href=href(m,preview);card.append(a);list.append(card);
   }
   if(!selected.length)list.append(node('p','当前筛选下没有材料。可以调整级别、技能、地域或曝光状态。'));
  }
  async function refresh(){
   try{if(stale)return;host.IELTSProfiles?.assertFresh?.();const storage=host.IELTSProfiles?.storage?.()||(preview?host.sessionStorage:host.localStorage),raw=storage.getItem('ielts52-course-player-v1'),state=raw?host.IELTSCoursePlayer.parseState(raw):host.IELTSCoursePlayer.newState(),records=await host.IELTSRecords.list();if(stale)return;host.IELTSProfiles?.assertFresh?.();items=catalog(host.IELTSCurriculumData,state.exposures,records);status.textContent='目录只显示简介。点击打开说明后，按“开始这份材料”才展示正文或图表并登记曝光。辅助、中断和原始答案沿用统一学习记录；独立短测不等于正式考试成绩。';render();}
   catch(error){status.textContent='材料库暂未打开：'+error.message+'；原记录保留，请先解决档案读取问题。';list.replaceChildren();}
  }
  for(const id of ['bankLevel','bankSkill','bankLocale','bankVoiceKind','bankExposure'])$(id)?.addEventListener('change',render);
  host.addEventListener('ielts:records-changed',refresh);host.addEventListener('storage',refresh);host.addEventListener('ielts:profile-changed',()=>{stale=true;list.replaceChildren();status.textContent='学习档案已切换，请刷新后查看新档案的曝光记录。';});
  await refresh();return{refresh,render,items:()=>items.map(item=>({...item}))};
 }
 return{catalog,filter,summary,href,previewHref,preservePreviewLinks,mount,NAMES,FIGURES,LOCALES};
});
