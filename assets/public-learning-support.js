(function(root){
 'use strict';
 const norm=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/^essential:/,'').trim();
 function model(material,options={}){
  const unavailable=reason=>({available:false,reason,words:[],grammar:[],independentEvidence:false});
  const source=material?.source,id=source?.publicSourceId,data=options.data||root.IELTSPublicContextData,proof=data?.sources?.find(s=>s.sourceId===id);
  if(!id||!proof||!['reading','listening'].includes(material.skill)||source.practiceOnly!==true)return unavailable('not-a-supported-public-practice');
  if(proof.sourceTextSha256!==source.sourceTextSha256)return unavailable('source-version-does-not-match');
  const text=material.skill==='listening'?material.transcript:material.passage;
  if(typeof text!=='string'||!text.trim())return unavailable('source-text-unavailable');
  const selector=root.IELTSPublicMaterialSelector||(typeof require==='function'?require('./public-material-selector.js'):null);if(!selector?.validSourceText(material,text))return unavailable('actual-source-text-hash-mismatch');
  const lexicalText=selector.lexicalText(material,text);
  const entries=new Map((options.entries||root.IELTS_ESSENTIAL_VOCABULARY?.entries||[]).map(e=>[norm(e.word),e]));
  const targets=new Set((options.targetWords||[]).map(norm)),known=new Set((options.knownWords||[]).map(norm)),due=new Set((options.dueWords||[]).map(norm));
  const candidates=[];
  for(const candidate of proof.words||[]){
   const entry=entries.get(norm(candidate.word));if(!entry||!Number.isInteger(candidate.start)||!Number.isInteger(candidate.end)||lexicalText.slice(candidate.start,candidate.end)!==candidate.surface)continue;
   if(candidate.ambiguousLemma===true||candidate.word.length<3)continue;
   const target=targets.has(norm(entry.word)),review=due.has(norm(entry.word));
   if(!target&&!review&&(known.has(norm(entry.word))||Number(entry.rank)<150))continue;
   // The dictionary gloss is not silently declared to be this sentence's sense.
   const left=text.lastIndexOf('\n',candidate.start-1)+1,right=text.indexOf('\n',candidate.end),lineEnd=right<0?text.length:right;
   const quoteStart=Math.max(left,candidate.start-90),quoteEnd=Math.min(lineEnd,candidate.end+130);
   const ipaVariants=[...new Set([entry.ipa,...(entry.ipaVariants||[])].filter(v=>typeof v==='string'&&v.trim()))];
   candidates.push({word:entry.word,id:entry.id,ipa:ipaVariants.join(' · '),ipaVariants,meaning:entry.dictionaryMeaning||entry.meaning||'',surface:candidate.surface,relation:candidate.relation,start:candidate.start,end:candidate.end,quoteStart,quoteEnd,quote:text.slice(quoteStart,quoteEnd),target,review,rank:entry.rank||99999,meaningBasis:'dictionary-gloss-to-check-in-source-context'});
  }
  candidates.sort((a,b)=>Number(b.review)-Number(a.review)||Number(b.target)-Number(a.target)||a.rank-b.rank||a.word.localeCompare(b.word));
  const tags=new Set(options.grammarTags||[]),grammar=[];
  for(const item of proof.grammar||[]){if(!Number.isInteger(item.start)||!Number.isInteger(item.end)||typeof item.quote!=='string'||text.slice(item.start,item.end)!==item.quote||material.skill==='listening'&&lexicalText.slice(item.start,item.end)!==item.quote||!item.explanation)continue;grammar.push({...item,currentTarget:tags.has(item.tag)});}
  grammar.sort((a,b)=>Number(b.currentTarget)-Number(a.currentTarget)||a.start-b.start);
  const max=Math.max(1,Math.min(16,Number.isInteger(options.maxWords)?options.maxWords:10));
  return {available:true,sourceId:id,sourceTextSha256:proof.sourceTextSha256,words:candidates.slice(0,max),grammar,independentEvidence:false,countsAsMastery:false,optional:true};
 }
 function render(container,material,options={}){
  const result=model(material,options),doc=options.document||root.document;if(!result.available||!doc||!container)return result;
  const node=(tag,value)=>{const el=doc.createElement(tag);if(value!==undefined)el.textContent=value;return el;},section=node('details');section.className='course-public-learning-support';
  section.append(node('summary','本篇词汇与语法：答题后再巩固'));
  section.append(node('p','先核对错题，再用原文中的词和句型造一个新句子。这里的词义是词典常用义，请结合本句理解；不需要一次背完所有词。'));
  section.append(node('p',material.source.attribution||('原文来源：'+(material.source.provider||'公开资料'))));
  if(typeof material.source.publishedAt==='string'&&/^\d{4}-\d{2}-\d{2}/.test(material.source.publishedAt))section.append(node('p','原文发表于 '+material.source.publishedAt.slice(0,10)+'；文中的时间与预测按原文发表时点理解。'));
  for(const [label,url]of [['查看原文出处',material.source.url],['版权说明',material.source.rightsUrl]]){if(typeof url==='string'&&/^https:\/\//i.test(url)){const link=node('a',label);link.href=url;link.target='_blank';link.rel='noopener noreferrer';section.append(link,node('span','　'));}}
  if(result.words.length){section.append(node('h4','词汇在原文中怎么用'));for(const word of result.words){const item=node('section');item.append(node('h5',word.word+(word.review?' · 到期复习':word.target?' · 本课目标词':'')));if(word.ipa)item.append(node('p','常见读音：'+word.ipa));item.append(node('p',word.meaning),node('blockquote',word.quote));section.append(item);}}
  if(result.grammar.length){section.append(node('h4','本篇重点语法'));for(const grammar of result.grammar)section.append(node('blockquote',grammar.quote),node('p',grammar.explanation));}
  container.append(section);return result;
 }
 const api=Object.freeze({model,render});root.IELTSPublicLearningSupport=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
