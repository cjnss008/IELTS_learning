(function(root){
 'use strict';
 const LEVELS=['A0','A1','A2','B1','B2','C1'];
 const SKILLS=['reading','listening'];
 const norm=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/^essential:/,'').trim().replace(/\s+/g,' ');
 function values(value){if(Object.prototype.toString.call(value)==='[object Set]')return Array.from(value);if(Array.isArray(value))return value;return [];}
 function set(value){return new Set(values(value).map(norm).filter(Boolean));}
 function levelRange(value){
  const label=typeof value==='object'?value?.label:value;if(typeof label!=='string')return null;
  const parts=label.replace(/-/g,'–').split('–').map(v=>LEVELS.indexOf(v.trim()));
  return parts.length<=2&&parts.every(v=>v>=0)?{label,low:Math.min(...parts),high:Math.max(...parts)}:null;
 }
 function tokenSet(text){return new Set((String(text||'').toLowerCase().replace(/[’‘]/g,"'").match(/[a-z]+(?:'[a-z]+)*/g)||[]));}
 function containsTerm(body,term,tokens){const pieces=norm(term).match(/[a-z]+(?:'[a-z]+)*/g);if(!pieces?.length)return false;if(pieces.length===1)return (tokens||tokenSet(body)).has(pieces[0]);return (' '+norm(body).replace(/[^a-z' ]/g,' ').replace(/\s+/g,' ')+' ').includes(' '+pieces.join(' ')+' ');}
 function grammarTags(value){
  const aliases={'prepositions-place':'place-prepositions','yes-no-questions':'question-formation','present-simple-questions':'question-formation','present-continuous-questions':'question-formation','questions':'question-formation'};
  return new Set(values(value).map(v=>aliases[norm(v)]||norm(v)).filter(Boolean));
 }
 function validSourceText(material,body){
  const expected=material.source?.sourceTextSha256;if(typeof body!=='string'||!/^[a-f0-9]{64}$/.test(expected||''))return false;
  const A=root.IELTSAssessment||(typeof require==='function'?require('./assessment-core.js'):null);
  try{return typeof A?.sourceTextHash==='function'&&A.sourceTextHash(body)===expected;}catch(_){return false;}
 }
 function lexicalText(material,body){
  if(material.skill!=='listening')return body;
  const chars=body.replace(/^([A-Za-z][A-Za-z .’'&-]{0,50}):[ \t]*/gm,m=>' '.repeat(m.length)).split('');let depth=0;
  for(let i=0;i<chars.length;i++){const char=chars[i];if(char==='(')depth++;if(depth>0){if(char!=='\n'&&char!=='\r')chars[i]=' ';if(char===')')depth--;}}
  return chars.join('');
 }
 function evidencedWords(material,body,options){
  if(!validSourceText(material,body))return new Map();
  const candidateText=lexicalText(material,body);
  const dataset=options.sourceContexts||root.IELTSPublicContextData,source=dataset?.sources?.find(s=>s.sourceId===material.source?.publicSourceId);
  if(!source||source.sourceTextSha256!==material.source?.sourceTextSha256)return new Map();
  const found=new Map();for(const item of source.words||[]){if(item.ambiguousLemma===true||!Number.isInteger(item.start)||!Number.isInteger(item.end)||candidateText.slice(item.start,item.end)!==item.surface)continue;found.set(norm(item.word),{surface:item.surface,start:item.start,end:item.end,relation:item.relation});}return found;
 }
 function budgetFor(options){
  const remaining=Number(options.remainingMinutes),due=Number(options.dueReviewMinutes??NaN),rest=Number(options.breakReserveMinutes??10);
  if(!Number.isFinite(remaining)||remaining<0||remaining>360)return {valid:false,reason:'remaining-total-budget-unavailable'};
  if(!Number.isFinite(due)||due<0||!Number.isFinite(rest)||rest<0)return {valid:false,reason:'review-or-break-budget-unavailable'};
  const dueReserved=Math.min(remaining,due),breakReserved=Math.min(Math.max(0,remaining-dueReserved),rest);
  return {valid:true,remainingMinutes:remaining,dueReviewMinutesReserved:dueReserved,unreservedDueMinutes:Math.max(0,due-dueReserved),breakMinutesReserved:breakReserved,availableForNewMaterialMinutes:Math.max(0,remaining-dueReserved-breakReserved),spentBySelectionMinutes:0};
 }
 function estimate(material,options){
  const supplied=options.durationEstimates?.[material.id],minutes=typeof supplied==='number'?supplied:supplied?.minutes;
  const provided=Number.isFinite(minutes)&&minutes>0,observed=provided&&typeof supplied==='object'&&Number(supplied.samples)>=3;
  const base=provided?minutes:Number(material.estimatedMinutes),multiplier=observed?1:Number(options.referenceUncertaintyMultiplier??1.25);
  if(!Number.isFinite(base)||base<=0||!Number.isFinite(multiplier)||multiplier<1)return null;
  const audioFloor=material.skill==='listening'&&Number.isFinite(material.audioDurationSeconds)?material.audioDurationSeconds/60:0;
  return {minutes:Math.ceil(Math.max(audioFloor,base*multiplier)*10)/10,source:observed?'provided-learner-duration-estimate':provided?'provided-reference-with-uncertainty':'author-reference-with-uncertainty',samples:observed?supplied.samples:null,verifiedCapacity:false};
 }
 function plan(pool,options={}){
  const materials=Array.isArray(pool)?pool:pool?.materials||[],skill=options.skill,mode=options.mode||'practice',budget=budgetFor(options),selected=[],rejected=[],deferred=[];
  const finish=(status,reason)=>({status,reason,skill,mode,selected,rejected,deferred,budget,persistentChanges:false,independentAssessmentEvidence:false});
  if(!SKILLS.includes(skill))return finish('no-match','unsupported-skill');
  if(mode!=='practice')return finish('no-match','public-materials-are-not-independent-assessment');
  if(!budget.valid)return finish('no-match',budget.reason);
  if(budget.availableForNewMaterialMinutes<=0)return finish('no-match','due-review-and-break-use-remaining-budget');
  const learner=levelRange(options.skillLevels?.[skill]);if(!learner)return finish('no-match','verified-skill-level-unavailable');
  const capabilities=set(options.verifiedCapabilities),weak=grammarTags(options.weakGrammarTags),currentGrammar=grammarTags(options.currentGrammarTags),wordGaps=set(options.currentWordGaps),annualGaps=set(options.targetHeadwordGaps),seen=set(options.seenSourceGroups);
  if(options.currentSourceGroup)seen.add(norm(options.currentSourceGroup));
  const vocabulary=options.vocabularyExposure||root.IELTSContextualVocabularyExposure||(typeof require==='function'?require('./contextual-vocabulary-exposure.js'):null),possible=vocabulary?.read?.({...options,materials})||{unavailable:true};for(const group of possible?.unavailable?materials.map(m=>m.source?.exposureGroup).filter(Boolean):possible?.sourceGroups||[])seen.add(norm(group));
  const ranked=[];
  for(const material of materials){
   const source=material.source||{},id=material.id,group=source.exposureGroup,sourceId=source.publicSourceId;
   const reject=reason=>rejected.push({materialId:id||null,sourceId:sourceId||null,reason});
   if(material.skill!==skill)continue;
   if(!sourceId||group!=='public-source:'+sourceId){reject('source-identity-or-stable-exposure-group-missing');continue;}
   if(material.pool!=='training'||material.fullTest||material.independentBank||material.assessmentGroup||material.form){reject('reserved-or-full-assessment-material');continue;}
   if(source.verification!=='reviewed'||!Array.isArray(material.questions)||!material.questions.length){reject('questions-or-source-review-unavailable');continue;}
   if(source.audioReadiness?.reasons?.some(r=>/usage-blocked|festival-independent/.test(r))&&skill==='listening'){reject('source-audio-usage-blocked');continue;}
   if(skill==='listening'&&(!material.audio||source.audioReadiness?.eligibleForPractice!==true)){reject('provider-paired-practice-audio-unavailable');continue;}
   const range=levelRange(material.level);if(!range){reject('source-level-not-reviewed');continue;}
   if(range.high>learner.high){reject('above-current-skill-level');continue;}
   const tags=grammarTags(source.grammarTags),weakMatches=[...weak].filter(t=>tags.has(t)),currentGrammarMatches=[...currentGrammar].filter(t=>tags.has(t));
   const remediation=options.intent==='targeted-remediation'&&weakMatches.length>0;
   if(range.low<learner.low-Number(options.maxBelowLevel??1)&&!(options.allowLowerLevelRemediation===true&&remediation)){reject('below-current-level-without-remediation-purpose');continue;}
   const phases=source.phaseCandidates||[];
   if(!options.phaseId||!phases.includes(options.phaseId)&&!remediation){reject('phase-not-matched');continue;}
   const required=(source.prerequisiteCapabilityIds||[]).map(norm),missing=required.filter(id=>!capabilities.has(id));if(missing.length){rejected.push({materialId:id,sourceId,reason:'prerequisite-evidence-missing',missingCapabilities:missing});continue;}
   const alreadySeen=seen.has(norm(group));if(alreadySeen&&options.allowSeenPractice!==true){reject('same-source-already-seen');continue;}
   const body=skill==='listening'?material.transcript:material.passage;
   if(typeof body!=='string'||!body.trim()){reject('actual-source-text-unavailable');continue;}
   if(!validSourceText(material,body)){reject('actual-source-text-hash-mismatch');continue;}
   const targetText=lexicalText(material,body),tokens=tokenSet(targetText),wordProofs=evidencedWords(material,body,options),hasWord=word=>containsTerm(targetText,word,tokens)||wordProofs.has(norm(word)),currentWordMatches=[...wordGaps].filter(hasWord),annualWordMatches=[...annualGaps].filter(hasWord);
   if(!weakMatches.length&&!currentGrammarMatches.length&&!currentWordMatches.length&&!annualWordMatches.length&&options.allowBroadInput!==true){reject('no-current-learning-target-match');continue;}
   const duration=estimate(material,options);if(!duration){reject('duration-estimate-unavailable');continue;}
   if(duration.minutes>budget.availableForNewMaterialMinutes){deferred.push({materialId:id,sourceId,reason:'insufficient-total-budget-after-due-review',estimatedMinutes:duration.minutes,availableMinutes:budget.availableForNewMaterialMinutes});continue;}
   const score=weakMatches.length*6+currentGrammarMatches.length*3+Math.min(8,currentWordMatches.length)*4+Math.min(8,annualWordMatches.length)+(range.high===learner.high?3:1)+(alreadySeen?0:4);
   const known=options.knownHeadwordsEvidence==='memory-artifacts'?set(options.knownHeadwords):new Set(),estimatedUnknownRatio=known.size?[...tokens].filter(word=>!known.has(word)).length/Math.max(1,tokens.size):null;
   const paragraph=estimatedUnknownRatio!==null&&estimatedUnknownRatio>.2?String(body).split(/\n\s*\n/).find(part=>(part.match(/[a-z]+/gi)||[]).length<=120&&part.trim()):null;
   ranked.push({materialId:id,sourceId,sourceExposureGroup:group,skill,mode:'practice',role:alreadySeen?'familiar-fluency-review':'new-source-practice',isNewSource:!alreadySeen,score,estimatedMinutes:duration.minutes,durationEstimate:duration,levelEstimate:{source:range.label,learner:learner.label,calibrated:false},matches:{weakGrammarTags:weakMatches,currentGrammarTags:currentGrammarMatches,currentWordGaps:currentWordMatches,targetHeadwordGaps:annualWordMatches},estimatedUnknownRatio,unknownRatioBasis:estimatedUnknownRatio===null?'memory-evidence-unavailable':'exact forms not covered by supplied memory-backed keys; unrecorded words may already be known; not a 95% comprehension claim',shortSegmentSuggestion:paragraph?{start:body.indexOf(paragraph),end:body.indexOf(paragraph)+paragraph.length,wordCount:(paragraph.match(/[a-z]+/gi)||[]).length,advisoryOnly:true,cannotAnswerWholeQuestionSet:true}:null,audioReviewStatus:skill==='listening'?source.audioReviewStatus:'not-applicable',eligibleForIndependentAssessment:false,eligibleForUnseenTransferEvidence:false,selectionRequiresVersionedPlacement:true});
  }
  ranked.sort((a,b)=>b.score-a.score||a.estimatedMinutes-b.estimatedMinutes||a.materialId.localeCompare(b.materialId));
  const limit=Math.max(1,Math.min(3,Number.isInteger(options.limit)?options.limit:1)),groups=new Set();
  for(const candidate of ranked){
   if(selected.length>=limit)break;if(groups.has(candidate.sourceExposureGroup)){rejected.push({materialId:candidate.materialId,sourceId:candidate.sourceId,reason:'same-source-already-selected'});continue;}
   const left=budget.availableForNewMaterialMinutes-budget.spentBySelectionMinutes;
   if(candidate.estimatedMinutes>left){deferred.push({materialId:candidate.materialId,sourceId:candidate.sourceId,reason:'remaining-selection-budget-insufficient',estimatedMinutes:candidate.estimatedMinutes,availableMinutes:left});continue;}
   selected.push(candidate);groups.add(candidate.sourceExposureGroup);budget.spentBySelectionMinutes+=candidate.estimatedMinutes;
  }
  return finish(selected.length?'selected':'no-match',selected.length?'appropriate-source-with-current-targets-and-budget':'no-appropriate-source-with-evidence-and-budget');
 }
 const api={LEVELS,levelRange,containsTerm,grammarTags,validSourceText,lexicalText,evidencedWords,budgetFor,estimate,plan};root.IELTSPublicMaterialSelector=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
