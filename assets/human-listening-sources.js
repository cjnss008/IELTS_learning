(function(root,factory){'use strict';const api=factory();root.IELTSHumanListeningSources=api;if(typeof module==='object'&&module.exports)module.exports=api;if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',()=>api.mount(root));else api.mount(root);}})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function model(data,id){const m=data?.materials?.find(m=>m.id===id&&m.audioKind==='human'&&m.independentBank===true&&m.pool==='independent');if(!m)return null;return{id:m.id,title:m.title,level:m.level,region:m.audioAccent,reader:m.audioVoice,genre:m.source.genre,source:m.source,transcriptScope:m.transcriptScope};}
 function externalUrl(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:null;}catch(_){return null;}}
 function seen(id,state,records){return Boolean(state?.exposures?.[id])||(records||[]).some(r=>r.materialId===id);}
 function localHref(value,preview){return value+(preview?(value.includes('?')?'&':'?')+'preview=1':'');}
 async function mount(host){const doc=host.document,$=id=>doc.getElementById(id);if(!$('humanSourceApp'))return null;const params=new URLSearchParams(host.location.search),preview=params.get('preview')==='1',item=model(host.IELTSCurriculumData,params.get('id')),status=$('humanSourceStatus'),links=$('humanSourceLinks');let stale=false;
  const node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
  for(const a of doc.querySelectorAll?.('nav a[href]')||[])a.href=localHref(a.getAttribute('href'),preview);
  if(!item){status.textContent='没有找到该真人听力来源，请返回独立材料库选择材料。';return null;}
  $('humanSourceTitle').textContent=item.title;const source=item.source,r=source.recording||{},section=$('humanSourceDetails');section.replaceChildren();
  const genre={fable:'寓言','poetry-reading':'诗歌朗读','historical-humorous-prose':'历史幽默散文','historical-travel-prose':'历史游记','historical-children-story':'历史儿童故事','literary-first-person-narration':'文学第一人称叙述','literary-adventure-narration':'文学冒险叙述'}[item.genre]||item.genre;
  const accentBasis=source.accentBasis?.kind?.startsWith('reader-self')?'读者自述'+(source.accentBasis.kind.includes('qualification')?'（表述带保留）':''):'同一读者在 LibriVox 口音示例目录中的明确标签';
  const paragraphs=[
   item.region+' · 真人朗读：'+item.reader+' · 目标 '+item.level,
   '体裁：'+genre,
   '口音依据：'+accentBasis+'。不是按国籍推断，也不代表声学认证。',
   '作者：'+r.author+(r.translator?'；英译：'+r.translator:''),
   '所选文本版本：'+(r.textEdition?.title||String(r.published))+'；版本/出版年份：'+(r.textEdition?.year||r.published),
   '原音选择：'+(r.selection?.mode==='complete'?'完整作品（保留原录制署名）':'完整句界连续节选')+'；原文件 '+Number(r.selection?.startSeconds||0).toFixed(2)+'–'+Number(r.selection?.endSeconds||0).toFixed(2)+' 秒；课程音轨 '+Number(r.durationSeconds||0).toFixed(2)+' 秒。',
   '变动：选择上述连续范围，统一转为 24 kHz 单声道 MP3；没有变速、变调或合成补字。正文标点、大小写与必要拼写按印刷来源规范；录制署名不在正文转录内。',
   '录音授权：LibriVox 志愿者捐赠至公有领域。官方政策允许再利用（含商业用途），明确确认美国公有领域状态，并提醒其他地区的版权状态可能不同。',
   '文本与录音权利分别核对。古典文本作者、英译者、版本与年份单列，未把“古老故事”视为任何现代译本的通用许可。',
   '转录核对：按印刷原文逐句检查，并与本地真实、无参考提示的 Whisper 转录对照；正文转录省略录制署名。未声称真人听审、考生难度标定或真人评分可靠性。',
   '原始 MP3 SHA-256：'+r.originalAudioHash,
   '课程 MP3 SHA-256：'+r.audioHash
  ];
  for(const text of paragraphs)section.append(node('p',text));
  function disable(reason){links.replaceChildren();status.textContent=reason;const a=node('a','打开材料说明并开始');a.href=localHref('今日学习.html?bank=1&material='+encodeURIComponent(item.id),preview);links.append(a);}
  function notes(){if(!source.transcriptNotes?.length)return;const details=node('details'),summary=node('summary','转录与版本核对说明');details.append(summary);for(const note of source.transcriptNotes)details.append(node('p',note));links.append(details);}
  async function refresh(){try{if(stale)return;host.IELTSProfiles?.assertFresh?.();const storage=host.IELTSProfiles?.storage?.()||(preview?host.sessionStorage:host.localStorage),raw=storage.getItem('ielts52-course-player-v1'),state=raw?host.IELTSCoursePlayer.parseState(raw):host.IELTSCoursePlayer.newState(),records=await host.IELTSRecords.list();if(stale)return;host.IELTSProfiles?.assertFresh?.();if(!seen(item.id,state,records)){disable('本档案尚未开始这份材料。先开始以登记曝光，再打开含原音或全文的来源链接。');return;}links.replaceChildren();status.textContent='本档案已登记这份材料的曝光。以下外部来源可能包含全文与完整原音；后续继续按已见材料使用。';for(const [label,value] of [['LibriVox 作品目录与读者署名',source.catalogue],['读者主页',source.readerUrl],['明确口音标签依据',source.accentBasis?.url],['原始完整录音',r.originalUrl],['印刷文本来源',source.textUrl],['LibriVox 公有领域与再利用政策',source.rightsUrl]]){const href=externalUrl(value);if(!href)continue;const p=node('p'),a=node('a',label);a.href=href;a.target='_blank';a.rel='noopener noreferrer';p.append(a);links.append(p);}notes();}
   catch(error){disable('来源链接暂未打开：'+error.message+'。原记录保留，请先恢复档案读取。');}}
  host.addEventListener('ielts:profile-changed',()=>{stale=true;links.replaceChildren();status.textContent='学习档案已切换，请刷新后重新核对曝光记录。';});host.addEventListener('ielts:records-changed',refresh);host.addEventListener('storage',refresh);await refresh();return{refresh,item};
 }
 return{model,seen,externalUrl,localHref,mount};
});
