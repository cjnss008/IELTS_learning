'use strict';
// Source-bound public comprehension compiler. CLI output stays staged; the
// curriculum builder may append its practice-only pool after core scheduling.
// No profile, record, source-text or audio mutations.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const FIRST_BATCH_IDS=['nasa-climate-models','nasa-greenhouse-effect','nasa-water-cycle','voa-l1-05','voa-l1-06','voa-l1-07','voa-l1-16','voa-l1-18','voa-l1-20','voa-l1-24','voa-l1-28','voa-l1-34','voa-l1-42','voa-l1-48','voa-l2-01','voa-l2-03','voa-l2-06'];
const hash=value=>crypto.createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const clone=v=>JSON.parse(JSON.stringify(v));
const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
const english=s=>typeof s==='string'&&s.trim()&&!/[\u3400-\u9fff]/.test(s);
function publicFile(root,relative){
 if(typeof relative!=='string'||!relative||path.isAbsolute(relative)||/^(?:https?:|data:|blob:)/i.test(relative))throw Error('Public asset must be a local relative path');
 const target=path.resolve(root,relative),allowed=['materials/public','audio/public'].some(folder=>{const rel=path.relative(path.resolve(root,folder),target);return rel&&!rel.startsWith('..')&&!path.isAbsolute(rel);});
 if(!allowed)throw Error('Asset is outside the public-source directories');return target;
}
function blindPayload(source,text,questions){
 return {schema:1,sourceId:source.sourceId,title:source.title,kind:source.kind,text,questions:questions.map(q=>Object.fromEntries(['id','type','prompt','options','maxWords'].filter(k=>q[k]!==undefined).map(k=>[k,q[k]])))};
}
function blindInputHash(source,text,pack){return hash(JSON.stringify(blindPayload(source,text,pack.questions),null,2)+'\n');}
function questionContractHash(pack){return hash({schema:pack.schema,sourceId:pack.sourceId,sourceVersion:pack.sourceVersion,sourceTextSha256:pack.sourceTextSha256,version:pack.version,questions:pack.questions});}
function dialogueSpans(text){
 const matches=[...text.matchAll(/^([A-Za-z][A-Za-z .’'&-]{0,50}):[ \t]*/gm)];
 const turns=matches.map((m,i)=>({speaker:m[1],start:m.index+m[0].length,end:i+1<matches.length?matches[i+1].index:text.length}));
 const directions=[...text.matchAll(/\([^)]*\)/g)].map(m=>({start:m.index,end:m.index+m[0].length}));
 return {turns,directions};
}
function validateQuestionSet(source,text,pack,assessment){
 const errors=[],check=(value,message)=>{if(!value)errors.push(message);},id=source.sourceId;
 check(pack?.schema===1&&pack.sourceId===id,'question/source identity mismatch');
 check(String(pack?.sourceVersion)===String(source.version),'source version changed; review/rebind questions explicitly');
 check(pack?.sourceTextSha256===hash(text)&&source.text?.sha256===hash(text)&&source.contentHash===hash(text),'source text hash changed');
 check(pack?.sourceContentHash===source.contentHash,'source content binding changed');
 check(pack?.exposureGroup==='public-source:'+id,'source exposure group must be stable across source versions');
 check(pack?.releaseStatus==='text-evidence-reviewed','question text evidence review is not complete');
 check(Array.isArray(pack?.questions)&&pack.questions.length>=4&&pack.questions.length<=6,'each source needs 4-6 comprehension questions');
 if(!Array.isArray(pack?.questions))return errors;
 const ids=new Set(),dialogue=dialogueSpans(text);
 for(const q of pack.questions){
  const prefix=id+'/'+q.id+': ';
  check(typeof q.id==='string'&&!ids.has(q.id),prefix+'duplicate/missing question id');ids.add(q.id);
  check(['single','fill'].includes(q.type),prefix+'unsupported question type');
  check(english(q.prompt),prefix+'prompt must be English');
  check(Array.isArray(q.answers)&&q.answers.length>0&&q.answers.every(a=>typeof a==='string'&&a.trim()),prefix+'missing standard answer');
  check(typeof q.explanation==='string'&&/[\u3400-\u9fff]/.test(q.explanation),prefix+'Chinese explanation required');
  const span=q.evidenceOffsets;
  check(typeof q.evidence==='string'&&q.evidence.trim()&&Number.isInteger(span?.start)&&Number.isInteger(span?.end)&&span.start>=0&&span.end>span.start&&text.slice(span.start,span.end)===q.evidence,prefix+'evidence/offset not exact');
  if(q.type==='single'){
   check(Array.isArray(q.options)&&q.options.length>=3&&q.options.length<=4&&q.options.every(english),prefix+'3-4 English choices required');
   check(new Set((q.options||[]).map(normalize)).size===(q.options||[]).length,prefix+'duplicate choice values');
   check(q.answers?.length===1&&q.options?.includes(q.answers[0]),prefix+'standard answer must be one canonical option');
  }else{
   check(Number.isInteger(q.maxWords)&&q.maxWords>=1&&q.maxWords<=4,prefix+'fill word limit required');
   check(q.answers?.every(a=>assessment.countWords(a)<=q.maxWords),prefix+'answer exceeds word limit');
   check(q.answers?.every(a=>normalize(q.evidence).includes(normalize(a))),prefix+'fill answer must occur in the exact evidence');
  }
  for(const answer of q.answers||[])if(normalize(answer).length>=3||/^\d+$/.test(answer)){
   const escaped=normalize(answer).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   check(!new RegExp('(?:^|[^a-z0-9])'+escaped+'(?:$|[^a-z0-9])','i').test(normalize(q.prompt)),prefix+'answer is leaked literally in the prompt');
  }
  check(q.eligibleModalities?.includes('reading'),prefix+'reading eligibility missing');
  if(q.eligibleModalities?.includes('listening')){
   check(source.kind==='listening',prefix+'reading-only source cannot become authenticated listening');
   check(Array.isArray(q.spokenEvidence)&&q.spokenEvidence.length>0,prefix+'spoken evidence required');
   for(const proof of q.spokenEvidence||[]){
    check(typeof proof.quote==='string'&&text.slice(proof.start,proof.end)===proof.quote,prefix+'spoken evidence offset mismatch');
    check(dialogue.turns.some(t=>proof.start>=t.start&&proof.end<=t.end),prefix+'spoken quote crosses roles or lacks a speaking turn');
    check(!dialogue.directions.some(d=>proof.start<d.end&&proof.end>d.start),prefix+'silent stage direction used as audible evidence');
    check(!dialogue.turns.some(t=>proof.quote.startsWith(t.speaker+':')),prefix+'spoken quote includes a role label');
   }
  }
 }
 check(pack.review?.blindComparison?.status==='all-agreed'&&pack.review.blindComparison.questionCount===pack.questions.length,'separate-agent blind comparison not complete');
 check(pack.review?.blindComparison?.blindInputSha256===blindInputHash(source,text,pack),'blind review does not match current source/questions/options');
 return errors;
}
function canonicalAudioIntegrity(source,root){
 if(source.kind!=='listening')return {status:'reading-only',required:false};
 const audio=source.audio,disabled=audio?.usage?.eligibleForPractice===false&&audio?.usage?.redistributionAllowed===false;
 if(!audio?.path||!/^[a-f0-9]{64}$/i.test(audio.sha256||''))throw Error('Canonical original audio path/hash missing');
 const file=publicFile(root,audio.path);
 if(!fs.existsSync(file)){if(disabled)return{status:'blocked-audio-absent-as-required-in-public-clone',required:false,usable:false};throw Error('Required provider audio missing: '+source.sourceId);}
 const bytes=fs.readFileSync(file);if(hash(bytes)!==audio.sha256)throw Error('Canonical provider audio hash mismatch: '+source.sourceId);
 if(!Number.isFinite(audio.durationSeconds)||audio.durationSeconds<=0)throw Error('Canonical actual audio duration missing');
 return {status:disabled?'hash-verified-but-usage-blocked':'hash-verified-independent-listening-review-pending',required:!disabled,usable:false,audioSha256:audio.sha256,durationSeconds:audio.durationSeconds};
}
function listeningReadiness(source,pack,{root,audioReviews={},practiceOnly=false}){
 const reasons=[];if(source.kind!=='listening')return {eligible:false,status:'reading-only',reasons:['No authenticated corresponding narration supplied.']};
 const usage=source.audio?.usage;
 if(usage?.eligibleForPractice===false||usage?.redistributionAllowed===false||String(usage?.status||'').startsWith('blocked'))reasons.push('canonical-audio-usage-blocked: '+(usage.reason||usage.status));
 for(const issue of pack.sourceIssues||[])if(issue.blocks?.includes('listening')&&issue.status!=='resolved')reasons.push(issue.code);
 if(practiceOnly&&!reasons.length){
  const audio=source.audio,paired=audio?.usage?.eligibleForPractice===true&&audio?.usage?.redistributionAllowed===true&&/^https:\/\/voa-audio\.voanews\.eu\/.+\.mp3(?:\?|$)/.test(audio?.sourceUrl||'')&&(!source.audioDownload?.url||audio.sourceUrl===source.audioDownload.url)&&String(audio.alignmentStatus||'').startsWith('provider-linked-matching-lesson');
  if(!paired)reasons.push('provider-paired-practice-evidence-incomplete');
  else{
   try{canonicalAudioIntegrity(source,root);}catch(error){reasons.push(error.message);}
   if(!reasons.length)return {eligible:true,eligibleForPractice:true,eligibleForAssessment:false,practiceOnly:true,status:'provider-paired-practice-only',audioReviewStatus:'provider-paired-not-independently-reviewed',reasons:[],audioPath:audio.path,audioSha256:audio.sha256,durationSeconds:audio.durationSeconds,notHumanExaminerOrCalibration:true};
  }
 }
 const proof=audioReviews[source.sourceId];
 if(!proof)reasons.push('independent-spoken-evidence-and-audio-rights-review-pending');
 if(proof){
  if(proof.sourceTextSha256!==pack.sourceTextSha256||proof.questionContractHash!==questionContractHash(pack))reasons.push('audio-review-source-or-question-contract-stale');
  if(proof.allQuestionEvidenceAudible!==true||proof.rightsCleared!==true||!proof.reviewMethod||!proof.reviewedAt)reasons.push('audio-audibility-or-rights-evidence-incomplete');
  try{const file=publicFile(root,proof.audioPath),bytes=fs.readFileSync(file);if(hash(bytes)!==proof.audioSha256)reasons.push('audio-file-hash-mismatch');if(!Number.isFinite(proof.durationSeconds)||proof.durationSeconds<=0)reasons.push('actual-audio-duration-missing');}catch(error){reasons.push('audio-file-unavailable-or-outside-public-roots');}
 }
 return {eligible:reasons.length===0,eligibleForPractice:reasons.length===0,eligibleForAssessment:false,practiceOnly:true,audioReviewStatus:reasons.length?'independent-audio-review-pending':'independently-reviewed-question-evidence',status:reasons.length?'blocked-pending-audio-review':'reviewed-question-evidence-and-rights',reasons,...(!reasons.length?{audioPath:proof.audioPath,audioSha256:proof.audioSha256,durationSeconds:proof.durationSeconds,reviewMethod:proof.reviewMethod}:{}),notHumanExaminerOrCalibration:true};
}
function sourceMaterial(source,text,pack,skill,readiness){
 const questions=pack.questions.filter(q=>q.eligibleModalities.includes(skill)).map(clone),group='public-source:'+source.sourceId;
 const material={id:'public-'+source.sourceId+'-'+skill,version:'s'+source.version+'-q'+pack.version,skill,type:skill,level:source.level?.label||'unknown',title:source.title,pool:'training',fullTest:false,estimatedMinutes:skill==='reading'?25:30,questionCount:questions.length,instructions:skill==='reading'?'Read the text and answer the questions. Use only the text. Follow the word limit for each fill-in answer.':'Listen before opening the transcript. Answer from the spoken conversation. Follow each word limit.',passage:skill==='reading'?text:'',transcript:skill==='listening'?text:'',questions,source:{schemaVersion:3,kind:'public-adaptation',publicSourceId:source.sourceId,sourceVersion:String(source.version),sourceTextSha256:pack.sourceTextSha256,questionSetId:pack.questionSetId,questionSetVersion:pack.version,questionContractHash:questionContractHash(pack),url:source.sourceUrl,provider:source.provider,rights:source.rights?.license||'source rights require review',rightsUrl:source.rights?.url||'',rightsEvidence:clone(source.rights||{}),attribution:source.rights?.attribution||'',verification:skill==='reading'||readiness.eligible?'reviewed':'pending-audio-review',method:'Codex item/source evidence comparison plus separate-agent blind source-text solve. Not a human examiner, listening certification or difficulty calibration.',blindComparison:clone(pack.review.blindComparison),exposureGroup:group,linkedMaterialIds:['public-'+source.sourceId+'-reading',...(source.kind==='listening'?['public-'+source.sourceId+'-listening']:[])],independentUnseenParallel:false,independentAssessmentEligible:false,phaseCandidates:source.phaseIds||[],prerequisiteCapabilityIds:source.prerequisiteCapabilityIds||[],grammarTags:source.grammarTags||[],placement:'staged-unassigned; actual week/day must be supplied by the versioned plan',audioReadiness:clone(readiness)},rubric:{taskType:skill+' comprehension practice',calibratedIELTS:false},audio:skill==='listening'&&readiness.eligible?readiness.audioPath:'',audioSynthetic:false,audioKind:skill==='listening'?'human-original-conversation':undefined,audioProvider:skill==='listening'?source.provider:undefined,audioDurationSeconds:skill==='listening'&&readiness.eligible?readiness.durationSeconds:null};
 if(typeof source.sourcePublishedAt==='string'&&source.sourcePublishedAt)material.source.publishedAt=source.sourcePublishedAt;
 material.source.originalPrerequisiteCapabilityIds=clone(source.prerequisiteCapabilityIds||[]);
 material.source.prerequisiteCapabilityIds=(source.prerequisiteCapabilityIds||[]).map(id=>id.replace(/^(foundation|everyday|independent|academic|integration|verification):(reading|listening)$/,(_all,phase)=>phase+':'+skill));
 material.source.practiceOnly=true;material.source.independentTransferEligible=false;material.source.audioReviewStatus=readiness.audioReviewStatus||'not-authenticated-listening';
 const payload={instructions:material.instructions,passage:material.passage,transcript:material.transcript,questions:material.questions};material.source.contentHash=hash(payload);material.source.contentHashFields=Object.keys(payload);return clone(material);
}
function releaseRoster(root,catalog,explicit){
 if(explicit!==undefined){if(!Array.isArray(explicit)||!explicit.length||new Set(explicit).size!==explicit.length)throw Error('Explicit public source roster must be unique and nonempty');return {sourceIds:explicit,release:null};}
 const file=path.join(root,'curriculum/public-supplements/practice-release.json');
 if(!fs.existsSync(file))return {sourceIds:FIRST_BATCH_IDS,release:null};
 const raw=fs.readFileSync(file),release=JSON.parse(raw);
 if(release.schema!==1||release.use!=='ordinary-practice-only'||release.status!=='machine-text-reviewed'||!Array.isArray(release.sources)||!release.sources.length)throw Error('Invalid explicit public practice release');
 const ids=release.sources.map(s=>s.sourceId);if(new Set(ids).size!==ids.length||FIRST_BATCH_IDS.some(id=>!ids.includes(id)))throw Error('Public practice release duplicates or removes original sources');
 for(const contract of release.sources){const source=catalog.sources.find(s=>s.sourceId===contract.sourceId);if(!source||String(source.version)!==String(contract.sourceVersion)||source.text?.sha256!==contract.sourceTextSha256||source.contentHash!==contract.sourceTextSha256)throw Error('Public practice release source contract changed: '+contract.sourceId);if((source.audio?.sha256||null)!==(contract.audioSha256||null))throw Error('Public practice release audio contract changed: '+contract.sourceId);}
 return {sourceIds:ids,release:{id:release.id,sha256:hash(raw),contracts:release.sources}};
}
function load({root=path.join(__dirname,'..'),catalogPath=path.join(root,'curriculum','public-supplement-catalog.json'),questionsDir=path.join(root,'curriculum','public-supplements','questions'),audioReviewPath=path.join(root,'curriculum','public-supplements','audio-review.json'),requireComplete=false,practiceOnly=false,sourceIds}={}){
 const A=require(path.join(root,'assets','assessment-core.js')),catalog=JSON.parse(fs.readFileSync(catalogPath,'utf8')),roster=releaseRoster(root,catalog,sourceIds),sources=catalog.sources.filter(s=>roster.sourceIds.includes(s.sourceId)),audioReviews=fs.existsSync(audioReviewPath)?JSON.parse(fs.readFileSync(audioReviewPath,'utf8')).sources||{}:{};
 const materials=[],blockedMaterials=[],errors=[],pending=[],perSource=[];
 for(const id of roster.sourceIds){
  const source=sources.find(s=>s.sourceId===id),file=path.join(questionsDir,id+'.json');
  if(!source||!fs.existsSync(file)){pending.push({sourceId:id,reason:!source?'source-not-in-catalog':'questions-not-authored'});continue;}
  try{
   const text=fs.readFileSync(publicFile(root,source.text.path),'utf8'),pack=JSON.parse(fs.readFileSync(file,'utf8')),issues=validateQuestionSet(source,text,pack,A),canonicalAudio=canonicalAudioIntegrity(source,root);
   const contract=roster.release?.contracts.find(c=>c.sourceId===id);if(contract&&questionContractHash(pack)!==contract.questionContractHash)issues.push('released question contract changed; a new explicit release review is required');
   if(issues.length){errors.push(...issues.map(message=>({sourceId:id,message})));continue;}
   const audio=listeningReadiness(source,pack,{root,audioReviews,practiceOnly}),read=sourceMaterial(source,text,pack,'reading',audio);materials.push(read);
   if(source.kind==='listening'){
    const listen=sourceMaterial(source,text,pack,'listening',audio);
    if(audio.eligible)materials.push(listen);else blockedMaterials.push({material:listen,sourceId:id,reasons:audio.reasons});
   }
   perSource.push({sourceId:id,sourceVersion:String(source.version),sourceTextSha256:pack.sourceTextSha256,questionContractHash:questionContractHash(pack),questions:pack.questions.length,reading:'text-evidence-and-blind-review-passed',listening:audio.status,canonicalAudio,sourceExposureGroup:'public-source:'+id});
  }catch(error){errors.push({sourceId:id,message:error.message});}
 }
 const audit={schema:1,status:errors.length?'invalid':pending.length?'partial-staged':'staged-questions-complete',active:false,expectedSources:roster.sourceIds.length,release:roster.release?{id:roster.release.id,sha256:roster.release.sha256}:null,loadedSources:perSource.length,uniqueQuestions:perSource.reduce((n,s)=>n+s.questions,0),readingMaterials:materials.filter(m=>m.skill==='reading').length,listeningMaterials:materials.filter(m=>m.skill==='listening').length,blockedListening:blockedMaterials.length,errors,pending,perSource,integrationRequirements:['Assign a real versioned week/day and budget before course-player integration.','Use stable source.exposureGroup across both modalities and versions; new question/source versions never reset prior exposure.','Respect blocked listening readiness and canonical audio usage; no TTS replacement or audio redistribution without clearance.'],limits:'Staged question set only. AI source-text blind agreement does not establish actual audio alignment, human-examiner validity, difficulty calibration, learning outcomes or IELTS Band.'};
 audit.practiceOnly=practiceOnly;audit.independentAssessmentEligible=false;
 if(requireComplete&&(errors.length||pending.length))throw Error('Public supplement question set incomplete/invalid: '+JSON.stringify({errors,pending}));
 return {schema:1,status:audit.status,active:false,materials,blockedMaterials,audit};
}
function appendToCurriculum(data,options={}){
 if(!data||!Array.isArray(data.materials)||!Array.isArray(data.days))throw Error('Existing curriculum data is required before appending public practice.');
 const result=load({...options,practiceOnly:true,requireComplete:options.requireComplete!==false});
 if(result.audit.errors.length||result.audit.pending.length)throw Error('Public practice pool is not ready; retain the existing published curriculum.');
 if(result.audit.readingMaterials!==result.audit.loadedSources||result.materials.length!==result.audit.readingMaterials+result.audit.listeningMaterials||!result.blockedMaterials.some(m=>m.sourceId==='voa-l1-24')||result.materials.some(m=>m.skill==='listening'&&m.source.publicSourceId==='voa-l1-24'))throw Error('Every released source needs one reading unit; blocked VOA24 audio cannot enter.');
 const existing=new Set(data.materials.map(m=>m.id));for(const material of result.materials)if(existing.has(material.id))throw Error('Public practice ID already exists: '+material.id);
 data.materials.push(...result.materials);
 data.audit??={};data.audit.publicSupplements={...result.audit,status:'available-optional-practice',active:true,coreScheduleChanged:false,sourceCatalogActive:false,assessmentEligible:false,independentUnseenEvidence:false,selector:'IELTSPublicMaterialSelector',runtime:'IELTSPublicMaterialPractice',listeningUse:result.audit.listeningMaterials+' provider-paired original Conversation files, not independently auditioned; ordinary practice only',blockedListeningSourceIds:result.blockedMaterials.map(m=>m.sourceId)};
 result.runtimeIntegration={schema:1,version:'public-practice-runtime-v1',status:'available-optional-practice',practiceActivated:true,assessmentActivated:false,coreScheduleChanged:false,requiredDayTasksAdded:0,sourceCatalogActivationMeaning:'The source catalog remains metadata for staged candidates. Only the explicit released source-bound variants are enabled as optional ordinary practice; no entire source catalog or required course schedule is activated.',selector:'assets/public-material-selector.js',adapter:'assets/public-material-practice.js',materials:result.materials.map(m=>({materialId:m.id,version:m.version,skill:m.skill,sourceId:m.source.publicSourceId,sourceVersion:m.source.sourceVersion,sourceTextSha256:m.source.sourceTextSha256,questionContractHash:m.source.questionContractHash,sourceExposureGroup:m.source.exposureGroup,practiceOnly:true,audioReviewStatus:m.source.audioReviewStatus})),uniqueSources:result.audit.loadedSources,readingMaterials:result.audit.readingMaterials,listeningMaterials:result.audit.listeningMaterials,uniqueTextQuestions:result.audit.uniqueQuestions,release:result.audit.release,blockedListeningSourceIds:result.blockedMaterials.map(m=>m.sourceId),independentAssessmentEligible:false,unseenTransferEvidenceEligible:false};
 return result;
}
function main(args=process.argv.slice(2)){
 const allowed=['--root','--catalog','--questions','--audio-review','--output-root','--require-complete','--practice-only'];for(const arg of args.filter(s=>s.startsWith('--')))if(!allowed.includes(arg))throw Error('Unsupported option; production activation is unavailable: '+arg);
 const value=flag=>{const i=args.indexOf(flag);if(i<0)return null;if(!args[i+1]||args[i+1].startsWith('--'))throw Error(flag+' requires a path');return args[i+1];};
 const root=path.resolve(value('--root')||path.join(__dirname,'..')),out=value('--output-root');if(!out)throw Error('An explicit staging --output-root is required');
 const output=path.resolve(out),rel=path.relative(root,output);if(output===root||(!rel.startsWith('..')&&!path.isAbsolute(rel)&&!/^work(?:[\\/]|$)/i.test(rel))||!/[\\/](?:work|staging)(?:[\\/]|$)/i.test(output))throw Error('Output must remain in a work/staging directory, never production assets/curriculum');
 const result=load({root,catalogPath:value('--catalog')||undefined,questionsDir:value('--questions')||undefined,audioReviewPath:value('--audio-review')||undefined,requireComplete:args.includes('--require-complete'),practiceOnly:args.includes('--practice-only')});
 fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'public-supplement-materials.json'),JSON.stringify(result,null,2)+'\n');fs.writeFileSync(path.join(output,'public-supplement-build-audit.json'),JSON.stringify(result.audit,null,2)+'\n');console.log(JSON.stringify(result.audit));return result;
}
module.exports={FIRST_BATCH_IDS,releaseRoster,hash,normalize,publicFile,blindPayload,blindInputHash,questionContractHash,dialogueSpans,validateQuestionSet,canonicalAudioIntegrity,listeningReadiness,sourceMaterial,load,appendToCurriculum,main};
if(require.main===module){try{main();}catch(error){console.error(error.message);process.exitCode=1;}}
