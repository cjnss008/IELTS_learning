'use strict';
const {normalize,familyKey}=require('../assets/curriculum-coverage.js');
const valid=value=>typeof value==='string'&&value.length<=100&&/^[A-Za-z][A-Za-z'’ ().-]*$/.test(value.trim());
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function sourceSentence(m,word){const text=(m.lexicalContext?m.contextPassage:m.passage||m.transcript)||'',re=new RegExp('(?:^|[^a-z])'+escape(word)+'(?:$|[^a-z])','i');if(!re.test(text))return'';return text.split(/(?<=[.!?])\s+|\n+/).find(s=>re.test(s))?.trim()||'';}
function extensions(materials){
 const known=new Set(materials.filter(m=>m.skill==='vocabulary').flatMap(m=>m.vocabulary||[]).map(v=>normalize(v.word))),out=[],audit={earlierCandidates:0,earlierAdded:0,omitted:[]};
 for(let week=1;week<=36;week++){
  const candidates=[];
  for(const source of materials.filter(m=>m.week===week&&m.skill==='listening'&&m.pool==='training'&&!m.fullTest))for(const raw of source.vocabulary||[]){const key=normalize(raw.word),example=sourceSentence(source,raw.word);if(!valid(raw.word)||!raw.meaning||!example||known.has(key)||/人名|地名|姓氏|学校名|城市名/.test(raw.meaning))continue;known.add(key);const familyId=familyKey(raw);candidates.push({...raw,example,sourceMaterialId:source.id,sourceQuote:example,lexemeKey:key,senseLabel:raw.meaning,...(familyId?{familyId}:{})});}
  audit.earlierCandidates+=candidates.length;
  const capacity=(week%4===0?6:7)*4,selected=candidates.slice(0,capacity);audit.earlierAdded+=selected.length;audit.omitted.push(...candidates.slice(capacity).map(v=>({week,word:v.word,sourceMaterialId:v.sourceMaterialId,reason:'每个常规日新增不超过4词，未在本次基础补组内安排。'})));
  for(let i=0;i<selected.length;i+=4){const vocabulary=selected.slice(i,i+4),id='lexical-w'+String(week).padStart(2,'0')+'-'+(1+i/4);out.push({id,version:'1',week,level:materials.find(m=>m.week===week)?.level||'A1',skill:'vocabulary',type:'vocabulary',pool:'training',fullTest:false,estimatedMinutes:12,title:'第'+week+'周 · 听力原句词汇补组 '+(1+i/4),instructions:'来自本周现有听力原文的4词以内补组；沿用已编写词义，例句精确取自源原文。每词仍需三写三读与三轮测试，不自动标掌握。',passage:vocabulary.map(v=>v.word+' — '+v.meaning+'\n'+v.example).join('\n\n'),vocabulary,source:{kind:'derived-lexical',rights:'词汇与例句继承所列源材料的使用条件',verification:'reviewed',method:'从已编写词义抽取；英文边界与原句校验、去除已覆盖词形；未经额外独立语义审查。',sourceIds:[...new Set(vocabulary.map(v=>v.sourceMaterialId))]}});}
 }
 return{materials:out,audit};
}
module.exports={sourceSentence,extensions};
