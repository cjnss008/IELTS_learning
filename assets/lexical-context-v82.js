(function(root,factory){'use strict';const api=factory(root);root.IELTSLexicalContextV82=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const LEVELS=['A0','A1','A2','B1','B2','C1','C2'],norm=w=>String(w||'').normalize('NFKC').toLowerCase().trim(),copy=v=>JSON.parse(JSON.stringify(v)),list=v=>Array.isArray(v)?v:[];
function level(value){const levels=String(value||'').match(/A[012]|B[12]|C[12]/g)||[];return levels.length?Math.max(...levels.map(l=>LEVELS.indexOf(l))):-1;}
function materialSnapshotHash(material,options={}){
 const A=options.assessment||root.IELTSAssessment,P=options.player||root.IELTSCoursePlayer;
 try{const snapshot=copy(P.freezeMaterialBinding(material,{assessment:A}).material);delete snapshot.taskContract;for(const question of list(snapshot.questions))delete question.displayOrder;return A.materialContentHash(snapshot);}catch(_){return null;}
}
function verifiedSourceLevels(data,options,route){
 const read=(name,file)=>root[name]||(typeof require==='function'?require(file):null),explicit=options.verifiedSkillLevels||{},unresolved=new Set(list(options.unresolvedMaterialIds));let mastery={};
 try{
  const mistakes=options.mistakeState??root.IELTSMistakes?.store?.()?.read?.(),state=typeof mistakes==='string'?JSON.parse(mistakes):mistakes;
  for(const item of list(state?.items))if(item.status!=='passed'&&typeof item.materialId==='string')unresolved.add(item.materialId);
  const year=options.yearPlanner||read('IELTSYearPlanner','./year-planner.js'),adaptive=options.adaptive||read('IELTSAdaptivePlan','./adaptive-plan.js'),verifiedRecord=options.verifiedRecord||adaptive?.verifiedRecord;
  if(typeof verifiedRecord==='function')mastery=year?.mastery?.(data,options.records||[],{now:options.now??Date.now(),verifiedRecord,unresolvedMaterialIds:[...unresolved]})||{};
 }catch(_){mastery={};}
 const result={};for(const skill of ['reading','listening']){
  if(Object.hasOwn(explicit,skill)){result[skill]=explicit[skill];continue;}
  const placed=route?.skills?.[skill],matches=placed?.verified===true?(String(placed.level||'').match(/A[012]|B[12]|C[12]/g)||[]):[],placementRank=matches.length?Math.min(...matches.map(value=>LEVELS.indexOf(value))):-1,retainedRank=Number.isInteger(mastery[skill]?.levelRank)?mastery[skill].levelRank:-1,rank=Math.max(placementRank,retainedRank);result[skill]=LEVELS[rank]||null;
 }return result;
}
function checkEntry(entry,material,options={}){
 const A=options.assessment||root.IELTSAssessment;if(!A||!entry||entry.status!=='reviewed-candidate'||entry.semanticUnit!=='single-word'||entry.sourceKind!=='owned-original-ordinary-training'||entry.relation!=='exact-headword'||norm(entry.word)!==entry.headword||!entry.meaning?.trim()||!entry.partOfSpeech?.trim())return false;
 if(!material||material.id!==entry.materialId||String(material.version)!==entry.materialVersion||material.pool!=='training'||material.fullTest||material.independentBank||material.form||material.source?.publicSourceId||material.source?.verification!=='reviewed'||!['reading','listening'].includes(material.skill)||A.materialContentHash(material)!==entry.materialContentHash)return false;
 if(![entry.start,entry.end,entry.quoteStart,entry.quoteEnd,entry.excerptStart,entry.excerptEnd].every(Number.isInteger)||entry.start<0||entry.end<=entry.start||entry.availability?.sourceSkill!==material.skill||entry.availability.sourceCEFR!==material.level||level(entry.availability.minimumVerifiedCEFR)!==level(material.level))return false;
 const text=material.skill==='listening'?material.transcript:material.passage;if(typeof text!=='string'||A.sourceTextHash(text)!==entry.sourceTextSha256||text.slice(entry.start,entry.end)!==entry.surface||text.slice(entry.quoteStart,entry.quoteEnd)!==entry.quote||text.slice(entry.excerptStart,entry.excerptEnd)!==entry.excerpt||norm(entry.surface)!==entry.headword||!entry.quote.includes(entry.excerpt))return false;
 if(!entry.supportingEvidence||text.slice(entry.supportingEvidence.start,entry.supportingEvidence.end)!==entry.supportingEvidence.text||!entry.supportingEvidence.text.includes(entry.quote))return false;
 if(entry.exercise?.answer!==entry.meaning||entry.exercise.context!==entry.excerpt||!Array.isArray(entry.exercise.options)||entry.exercise.options.length!==3||new Set(entry.exercise.options).size!==3||entry.exercise.options.filter(s=>s===entry.meaning).length!==1||entry.formRecall?.answer!==entry.surface)return false;
 if(A.sourceTextHash(JSON.stringify({sourceId:entry.sourceId,sourceTextSha256:entry.sourceTextSha256,word:entry.word,surface:entry.surface,start:entry.start,end:entry.end,quote:entry.quote,meaning:entry.meaning,partOfSpeech:entry.partOfSpeech}))!==entry.bindingSha256)return false;
 return true;
}
function planAssignedDay(options={}){
 const catalog=options.catalog||root.IELTSLexicalContextV82Data,data=options.data||root.IELTSCurriculumData,number=Number(options.day),day=options.dayPlan||data?.days?.find(d=>d.day===number),pending=[],empty=reason=>({available:false,words:[],pending,reason,required:false,countsAsMastery:false,independentEvidence:false,integrationStatus:'local-adapter-candidate-not-installed'});
 if(!catalog||catalog.schema!==1||!data||!day||day.day!==number||number<2||number>364)return empty('invalid-or-protected-course-day');
 const accepted=new Set(list(options.acceptedEntryIds));if(!accepted.size)return empty('root-semantic-review-not-accepted');
 if(list(options.protectedCourseDays).includes(number)||day.contextualVocabulary||list(options.drafts).some(d=>d.courseDay===number)||list(options.records).some(r=>r.dayNumber===number))return empty('existing-day-contract-preserved');
 if(list(options.activeVocabularyDrafts).length)return empty('continue-existing-vocabulary-draft');
 if(Number(options.remainingDueWords)>0)return empty('complete-due-recall-before-new-context-words');
 const available=Math.max(0,Number(options.remainingMinutes)||0),minutesPerWord=Math.max(.5,Number(options.newWordMinutes)||4),maxWords=Math.min(6,Math.max(0,Number.isInteger(options.maxWords)?options.maxWords:6),Math.floor(available/minutesPerWord));if(!maxWords)return empty('insufficient-shared-study-budget');
 const dictionary=options.vocabularyData?.entries||root.IELTS_ESSENTIAL_VOCABULARY?.entries||[],wordCatalog=new Map(dictionary.map(w=>[norm(w.word),w])),materials=new Map(data.materials.map(m=>[m.id,m])),skip=new Set([...list(options.knownWords),...list(options.reservedWords)].map(w=>norm(typeof w==='string'?w:w.word))),seen=new Set(),words=[];
 for(const entry of list(catalog.entries)){
  if(!accepted.has(entry.id)||skip.has(entry.headword)||seen.has(entry.headword))continue;const material=materials.get(entry.materialId),task=day.tasks.find(t=>t.id===entry.availability.sourceSkill&&t.mode==='practice'&&list(t.materialIds).includes(entry.materialId));if(!task)continue;
  if(!entry.availability.scheduledPracticeDays.includes(number)||!checkEntry(entry,material,options)){pending.push({entryId:entry.id,word:entry.word,reason:'assigned-source-contract-or-example-changed'});continue;}
  if(level(options.verifiedSkillLevels?.[material.skill])<level(material.level)){pending.push({entryId:entry.id,word:entry.word,reason:'verified-source-skill-stage-required'});continue;}
  if(entry.headword==='live'&&!list(options.senseAudioVerifiedEntryIds).includes(entry.id)){pending.push({entryId:entry.id,word:entry.word,reason:'homograph-sense-audio-awaits-check'});continue;}
  const base=wordCatalog.get(entry.headword);if(!base){pending.push({entryId:entry.id,reason:'headword-not-in-current-8000-catalog'});continue;}seen.add(entry.headword);
  words.push({word:base.word,meaning:entry.meaning,partOfSpeech:entry.partOfSpeech,ipa:base.ipa||'',audio:base.audio||'',example:entry.quote,sourceProof:{candidateId:entry.id,role:'owned-source-context-v82',materialId:entry.materialId,materialVersion:entry.materialVersion,materialContentHash:entry.materialContentHash,sourceTextSha256:entry.sourceTextSha256,surface:entry.surface,start:entry.start,end:entry.end,bindingSha256:entry.bindingSha256,meaningBasis:'individually-reviewed-owned-source-candidate'},countsAsMastery:false,independentEvidence:false});if(words.length===maxWords)break;
 }
 if(!words.length)return empty('no-accepted-current-assigned-source-words');
 return{available:true,words:copy(words),pending,required:false,role:'owned-source-context-v82',originContext:{schema:1,role:'owned-source-context-v82',courseDay:number,entryIds:words.map(w=>w.sourceProof.candidateId)},estimatedStudyMinutes:words.length*minutesPerWord,countsAsMastery:false,independentEvidence:false,integrationStatus:'local-adapter-candidate-not-installed',note:'Pass words to the existing budget-aware contextWords planner after root acceptance. The originContext is a new candidate role; it must not be passed as the old public-only contextSource without a schema-compatible runtime integration.'};
}
function admitForDay(day,data,options={}){
 const catalog=options.ownedSemanticCatalog||root.IELTSLexicalContextV82Data,acceptance=options.ownedSourceAcceptance||root.IELTSOwnedContextAcceptance,pending=[],words=[],sources=[];
 const finish=()=>({words,sources,pending,role:'owned-source-context-v82',required:false});
 if(!catalog||catalog.schema!==1||!acceptance||acceptance.schema!==1||acceptance.status!=='root-ai-reviewed-not-human'||!acceptance.bindings||Array.isArray(acceptance.bindings)||acceptance.catalogVersion!==catalog.version||!Array.isArray(acceptance.acceptedEntryIds)||!acceptance.acceptedEntryIds.length)return finish();
 const A=options.assessment||root.IELTSAssessment,P=options.player||root.IELTSCoursePlayer,placement=options.placement||root.IELTSPlacement,accepted=new Set(acceptance.acceptedEntryIds),byId=new Map(data.materials.map(m=>[m.id,m])),entries=options.entries||options.vocabularyData?.entries||root.IELTS_ESSENTIAL_VOCABULARY?.entries||[],dictionary=new Map(entries.map(e=>[norm(e.word),e])),seen=new Set();
 if(!A||!P?.prerequisiteStatus||day.day<2||day.day>364||day.tasks.some(t=>t.mode!=='practice'))return finish();
 let route;try{route=placement?.currentRoute?.(data)||null;}catch(_){return finish();}
 const verifiedLevels=verifiedSourceLevels(data,options,route);
 for(const e of list(catalog.entries)){
  if(!accepted.has(e.id)||seen.has(e.headword))continue;const m=byId.get(e.materialId),task=m&&day.tasks.find(t=>t.id===m.skill&&t.mode==='practice'&&list(t.materialIds).includes(m.id));if(!task)continue;
  const receipt=acceptance.bindings[e.id];if(!receipt||receipt.bindingSha256!==e.bindingSha256||receipt.materialContentHash!==e.materialContentHash||receipt.sourceTextSha256!==e.sourceTextSha256){pending.push({word:e.word,materialId:e.materialId,reason:'owned-source-root-receipt-mismatch'});continue;}
  if(!checkEntry(e,m,{assessment:A})||m.availableFromDay>day.day||m.skill==='listening'&&!m.audio){pending.push({word:e.word,materialId:e.materialId,reason:'owned-source-not-currently-teachable'});continue;}
  const verified=verifiedLevels[m.skill];if(level(verified)<level(m.level)){pending.push({word:e.word,materialId:m.id,reason:'owned-source-verified-skill-level-required'});continue;}
  let gates;try{gates=P.prerequisiteStatus(data.materials,options.records||[],m.week,A,{data,placement});}catch(_){gates=null;}if(!Array.isArray(gates)||gates.some(g=>g.pass!==true&&g.placementCovered!==true)){pending.push({word:e.word,materialId:m.id,reason:'owned-source-prerequisite-gate-required'});continue;}
  if(e.headword==='live'&&!list(acceptance.senseAudioVerifiedEntryIds).includes(e.id)){pending.push({word:e.word,materialId:m.id,reason:'owned-source-homograph-audio-awaits-check'});continue;}
  if(Object.values(options.memory?.items||{}).some(item=>norm(item.word)===e.headword&&(item.meaning!==e.meaning||item.example!==e.quote))){pending.push({word:e.word,materialId:m.id,reason:'owned-source-existing-word-snapshot-preserved'});continue;}
  const item=dictionary.get(e.headword),snapshotHash=materialSnapshotHash(m,{assessment:A,player:P});if(!item||!snapshotHash)continue;
  let source=sources.find(s=>s.materialId===m.id);if(!source){source={role:'owned-source-context-v82',sourceId:e.sourceId,taskId:m.skill,materialId:m.id,materialVersion:String(m.version),materialContentHash:e.materialContentHash,materialSnapshotHash:snapshotHash,sourceTextSha256:e.sourceTextSha256,sourceLevel:m.level,admission:{verifiedSkillLevel:verified,prerequisites:gates.map(g=>({id:g.id,pass:g.pass===true,placementCovered:g.placementCovered===true}))},acceptedEntries:[]};sources.push(source);}source.acceptedEntries.push({id:e.id,bindingSha256:e.bindingSha256});
  words.push({word:item.word,meaning:e.meaning,partOfSpeech:e.partOfSpeech,ipa:item.ipa||'',audio:item.audio||'',example:e.quote,source:{role:'owned-source-context-v82',candidateId:e.id,catalogVersion:catalog.version,senseBindingSha256:e.bindingSha256,materialId:m.id,materialVersion:String(m.version),materialContentHash:e.materialContentHash,sourceId:e.sourceId,sourceTextSha256:e.sourceTextSha256,surface:e.surface,start:e.start,end:e.end,relation:e.relation,meaningBasis:'reviewed-owned-source-sense',partOfSpeech:e.partOfSpeech},countsAsMastery:false,independentEvidence:false});seen.add(e.headword);if(words.length===6)break;
 }
 return finish();
}
return Object.freeze({LEVELS,level,checkEntry,planAssignedDay,admitForDay,materialSnapshotHash});
});
