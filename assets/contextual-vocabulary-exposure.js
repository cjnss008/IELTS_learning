(function(root,factory){'use strict';const api=factory(root);root.IELTSContextualVocabularyExposure=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const EMPTY=Object.freeze([]),array=v=>Array.isArray(v)?v:EMPTY,norm=v=>String(v||'').normalize('NFKC').toLowerCase().trim(),clone=v=>JSON.parse(JSON.stringify(v)),dependency=(name,file)=>root[name]||(typeof require==='function'?require(file):null);
let cache=null;
function historicalContract(day,assessment){
 const contract=day?.contextualVocabulary;if(!contract)return null;const content=clone(contract),expected=content.contentHash;delete content.contentHash;const base=clone(day);delete base.contextualVocabulary;
 if(contract.schema!==1||contract.role!=='scheduled-context-vocabulary'||contract.day!==day.day||assessment.materialContentHash(content)!==expected||assessment.materialContentHash(base)!==contract.baseDayContentHash||!array(contract.words).length)return null;
 if(contract.coreWordKeys!==undefined&&(!Array.isArray(contract.coreWordKeys)||contract.coreWordKeys.length>8000||new Set(contract.coreWordKeys).size!==contract.coreWordKeys.length||contract.coreWordKeys.some(key=>typeof key!=='string'||!key||key!==norm(key))))return null;
 for(const word of contract.words){const source=word.source,assignment=array(day.publicCourse?.assignments).find(a=>a.assignmentId===source?.assignmentId),task=array(day.tasks).find(t=>t.id===assignment?.taskId);if(!source||!assignment||assignment.role!=='contextual-public-course'||assignment.mode!=='practice'||assignment.required!==true||!['reading','listening'].includes(assignment.skill)||!task?.materialIds?.includes(source.materialId)||!task.publicCourseAssignments?.some(a=>a.assignmentId===assignment.assignmentId&&a.materialContentHash===source.materialContentHash)||source.meaningBasis!=='reviewed-source-sense'||assignment.materialId!==source.materialId||assignment.sourceId!==source.sourceId||assignment.materialContentHash!==source.materialContentHash||assignment.sourceTextSha256!==source.sourceTextSha256||!/^[a-f0-9]{64}$/.test(source.sourceTextSha256||'')||!/^[-a-z0-9]+$/.test(source.sourceId||'')||!Number.isInteger(source.start)||!Number.isInteger(source.end)||source.start<0||source.end<=source.start||typeof source.surface!=='string'||!source.surface||typeof word.word!=='string'||!word.word||typeof word.meaning!=='string'||!word.meaning||typeof word.example!=='string'||!word.example.includes(source.surface))return null;}
 return clone(contract);
}
function bindings(state,materials,assessment){
 const out=new Map();let invalid=false;for(const day of Object.values(state.frozenDays||{})){if(!day.contextualVocabulary)continue;const contract=historicalContract(day,assessment);if(!contract){invalid=true;continue;}out.set(day.day,contract.words.map(word=>({word:norm(word.word),meaning:word.meaning,example:word.example,contractHash:contract.contentHash,group:'public-source:'+word.source.sourceId})));}return{contracts:out,invalid};
}
function match(words,day,contracts,groups,contextSource){
 const explicit=contextSource!==undefined;let unresolved=explicit&&!array(words).length;
 if(explicit){if(!contextSource||!Number.isInteger(contextSource.originCourseDay)||contextSource.originCourseDay<2||contextSource.originCourseDay>day||!/^[a-f0-9]{64}$/.test(contextSource.contractHash||''))return true;day=contextSource.originCourseDay;}
 for(const word of array(words)){const exact=contracts.get(day)?.find(w=>w.word===norm(word.word)&&w.meaning===word.meaning&&w.example===word.example&&(!contextSource||w.contractHash===contextSource.contractHash));if(exact)groups.add(exact.group);else if(explicit)unresolved=true;}
 // A selected-module restore can retain the word task without its original course contract.
 // An unresolved explicit reference cannot prove freshness, completion, or mastery.
 return unresolved;
}
function derive(options={}){
 const A=options.assessment||dependency('IELTSAssessment','./assessment-core.js'),M=options.memoryCore||dependency('IELTSMemory','./memory-core.js'),P=options.adaptiveCore||dependency('IELTSAdaptivePlan','./adaptive-plan.js');
 const memory=M.parseState(options.memory||M.newState()),state=P.parseState(options.adaptiveState||P.newState()),bound=bindings(state,options.materials,A),contracts=bound.contracts,groups=new Set();
 let unavailable=bound.invalid;for(const batch of Object.values(memory.essential.batches))if(match(batch.words,batch.courseDay,contracts,groups,batch.contextSource))unavailable=true;
 for(const record of array(options.records)){if(record.source!=='essential-vocabulary'||record.skill!=='vocabulary')continue;let artifact;try{const raw=record.answer;artifact=typeof raw==='string'?JSON.parse(raw):null;}catch(_){continue;}if(artifact?.kind!=='vocabulary-three-modes'||typeof artifact.essentialBatchId!=='string'||!artifact.essentialBatchId.startsWith('essential-batch-'))continue;if(match(artifact.words,record.dayNumber||record.courseDay,contracts,groups,artifact.contextSource))unavailable=true;}
 return{sourceGroups:[...groups].sort(),unavailable,basis:'started-word-snapshot-may-have-shown-source',actualDisplayConfirmed:false,completionCredit:0,masteryCredit:0};
}
function read(options={}){
 try{
  if(options.memory!==undefined||options.adaptiveState!==undefined)return derive(options);
  const profiles=options.profiles||root.IELTSProfiles,storage=options.storage||(root.document?profiles?.storage?.():null);if(!storage)return{sourceGroups:[],unavailable:!!root.document,completionCredit:0,masteryCredit:0};
  profiles?.assertFresh?.();const memoryRaw=storage.getItem('ielts52-memory-v1'),adaptiveRaw=storage.getItem('ielts52-adaptive-plan-v1'),owner=profiles?.current?.(),generation=storage.getItem('ielts52-data-generation-v1'),records=array(options.records),cacheableRecords=records.every(r=>r.source!=='essential-vocabulary'||Number.isInteger(r.version)&&r.version>=1),sameRecords=cache?.records===records&&cache.recordVersions.length===records.length&&records.every((r,i)=>{const v=cache.recordVersions[i];return v.id===r.id&&v.version===r.version&&v.source===r.source&&v.skill===r.skill&&v.dayNumber===r.dayNumber&&v.courseDay===r.courseDay;});
  if(String(generation||'').startsWith('busy:'))throw Error('记录正在恢复');
  if(cache&&cacheableRecords&&cache.profiles===profiles&&cache.memoryRaw===memoryRaw&&cache.adaptiveRaw===adaptiveRaw&&cache.materials===options.materials&&sameRecords&&cache.owner===JSON.stringify(owner)&&cache.generation===generation)return clone(cache.result);
  const result=derive({...options,memory:memoryRaw||undefined,adaptiveState:adaptiveRaw||undefined});profiles?.assertFresh?.();if(storage.getItem('ielts52-memory-v1')!==memoryRaw||storage.getItem('ielts52-adaptive-plan-v1')!==adaptiveRaw||storage.getItem('ielts52-data-generation-v1')!==generation||JSON.stringify(profiles?.current?.())!==JSON.stringify(owner))throw Error('来源记录刚更新');
  // Records.list returns fresh snapshots and record updates increment version; cache never serializes original answers.
  cache={profiles,memoryRaw,adaptiveRaw,materials:options.materials,records,recordVersions:records.map(r=>({id:r.id,version:r.version,source:r.source,skill:r.skill,dayNumber:r.dayNumber,courseDay:r.courseDay})),owner:JSON.stringify(owner),generation,result};return clone(result);
 }catch(_){return{sourceGroups:[],unavailable:true,basis:'source-freshness-unverified',actualDisplayConfirmed:false,completionCredit:0,masteryCredit:0};}
}
return Object.freeze({historicalContract,derive,read});
});
