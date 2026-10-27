(function(root,factory){'use strict';const api=factory(root);root.IELTSReviewedContextV88=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const ROLE='reviewed-post-source-delay-v88',VERSION='reviewed-post-source-release-v88-1',HOUR=3600000,copy=v=>JSON.parse(JSON.stringify(v)),list=v=>Array.isArray(v)?v:[],dep=(name,file)=>root[name]||(typeof require==='function'?require(file):null),hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function data(options={}){return options.reviewedContextCatalog||dep('IELTSLexicalReviewedV88Data','./lexical-reviewed-v88-data.js');}
function policy(options={}){return options.reviewedContextPolicy||dep('IELTSLexicalReviewedV88Policy','./lexical-reviewed-v88-policy.js');}
function rule(entry,options={}){
 const p=policy(options);if(p?.schema!==1||p.version!==VERSION||p.initialMinimumDelayHours!==24||JSON.stringify(p.delayedContextMinimumHoursAfterInitialCompletion)!=='[48,168]'||!Number.isInteger(entry.availability?.earliestProposedWordCourseIndex)||!hex(entry.contentSha256))throw Error('新增语境词的调度策略待核验。');
 return{schema:1,role:ROLE,policyVersion:VERSION,canonicalTargetId:entry.canonicalTargetId,sourceEntryContentSha256:entry.contentSha256,initialMinimumDelayHours:24,notBeforeCourseDay:entry.availability.earliestProposedWordCourseIndex,delayedContextMinimumHoursAfterInitialCompletion:[48,168]};
}
function cleanRule(value){
 const keys=['schema','role','policyVersion','canonicalTargetId','sourceEntryContentSha256','initialMinimumDelayHours','notBeforeCourseDay','delayedContextMinimumHoursAfterInitialCompletion'];
 if(!value||Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k))||value.schema!==1||value.role!==ROLE||value.policyVersion!==VERSION||!/^essential:[a-z]+(?:['-][a-z]+)*$/.test(value.canonicalTargetId||'')||!hex(value.sourceEntryContentSha256)||value.initialMinimumDelayHours!==24||!Number.isInteger(value.notBeforeCourseDay)||value.notBeforeCourseDay<2||value.notBeforeCourseDay>365||JSON.stringify(value.delayedContextMinimumHoursAfterInitialCompletion)!=='[48,168]')throw Error('已冻结的新增语境词延迟策略待核验。');return copy(value);
}
function admitForDay(day,curriculum,options={}){
 const catalog=data(options),p=policy(options),legacy=options.ownedContext||dep('IELTSLexicalContextV82','./lexical-context-v82.js'),empty={words:[],sources:[],pending:[],required:false};if(!catalog||catalog.schema!==1||!p||!legacy?.admitForDay)return empty;
 // These24 are existing owned exact forms only. Licensed sources, inflections
 // and the adjective approximate remain outside this admission catalog.
 const safe=list(catalog.entries).filter(e=>e.sourceKind==='owned-original-ordinary-training'&&e.relation==='exact-headword'&&e.canonicalTargetId==='essential:'+e.headword&&e.word===e.headword&&catalog.acceptance?.bindings?.[e.id]?.entryContentSha256===e.contentSha256),value=legacy.admitForDay(day,curriculum,{...options,ownedSemanticCatalog:{...catalog,entries:safe},ownedSourceAcceptance:catalog.acceptance});
 const byId=new Map(safe.map(e=>[e.id,e]));try{return{...value,words:value.words.map(word=>({...word,source:{...word.source,releasePolicy:rule(byId.get(word.source.candidateId),options)}}))};}catch(_){return{...empty,pending:[{reason:'reviewed-context-release-policy-pending'}]};}
}
function releaseStatus(word,contract,source,status,options={}){
 const denied=reason=>({allowed:false,reason,materialId:source?.materialId||null});if(!status?.allowed)return status||denied('reviewed-source-original-pending');let frozen;try{frozen=cleanRule(word?.source?.releasePolicy);}catch(_){return denied('reviewed-source-release-policy-unverified');}
 if(frozen.canonicalTargetId!=='essential:'+String(word.word).toLowerCase()||contract?.schema!==2||!contract.words?.some(w=>w.source?.candidateId===word.source.candidateId&&w.source?.senseBindingSha256===word.source.senseBindingSha256))return denied('reviewed-source-frozen-word-binding-unverified');
 const courseDay=Number(options.trainingCourseDay??options.day),now=options.now??Date.now();if(!Number.isInteger(courseDay)||courseDay<frozen.notBeforeCourseDay)return denied('reviewed-source-next-course-day-pending');
 const record=list(options.records).filter(r=>r.id===status.recordId).sort((a,b)=>(b.version||0)-(a.version||0)||String(b.submittedAt).localeCompare(String(a.submittedAt)))[0],A=options.assessment||dep('IELTSAssessment','./assessment-core.js');if(!record)return denied('reviewed-source-completion-time-unverified');let completedAt=Date.parse(record.submittedAt);
 try{const artifact=A.decodeArtifact(record),material=artifact?.materialBinding?.material,grade=A.gradeMaterialForArtifact(material,artifact);if(!(record.evaluation?.method==='objective'&&record.evaluation.result==='pass'&&grade.allGradable&&grade.correct===grade.total&&grade.total>0)){
  const correction=(options.recordCorrectionStatus||root.IELTSMistakes?.recordCorrectionStatus)?.(record),at=Date.parse(correction?.at);if(correction?.corrected!==true||correction.recordId!==record.id||!Number.isFinite(at)||at>now)return denied('reviewed-source-correction-time-unverified');completedAt=Math.max(completedAt,at);
 }}catch(_){return denied('reviewed-source-completion-time-unverified');}
 if(!Number.isFinite(completedAt)||completedAt>now||!Number.isFinite(now))return denied('reviewed-source-completion-time-unverified');const eligibleAt=completedAt+24*HOUR;if(now<eligibleAt)return{...denied('reviewed-source-24h-delay-pending'),eligibleAt:new Date(eligibleAt).toISOString()};
 return{allowed:true,reason:'reviewed-source-24h-and-course-day-ready',materialId:source.materialId,recordId:record.id,sourceCompletedAt:new Date(completedAt).toISOString(),eligibleAt:new Date(eligibleAt).toISOString()};
}
return Object.freeze({ROLE,VERSION,admitForDay,releaseStatus,cleanRule});
});
