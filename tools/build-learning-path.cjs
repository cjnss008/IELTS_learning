'use strict';
// P2 audit/proposal only. This module must not load any runtime profile or mutate
// curriculum-data.js, existing days, material bodies, answers or learner storage.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const VERSION='learning-path-p2-v2';
const FOUR_SKILLS=['listening','reading','speaking','writing'];
const INPUTS=['assets/curriculum-data.js','assets/course-data.js','materials/textbook-catalog.json','materials/textbook-training-map.json','curriculum/learning-path-policy.json'];
const PUBLIC_LEVELS=['A0','A1','A2','B1','B2','C1','A1–A2','A2–B1','B1–B2','B2–C1','unknown'];
const hash=value=>crypto.createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
const countWords=text=>(String(text||'').match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]).length;
const normalize=text=>String(text||'').toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
const unique=values=>[...new Set(values)];
const sorted=values=>values.slice().sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
const byCount=values=>values.reduce((out,key)=>(out[key]=(out[key]||0)+1,out),{});
const phaseFor=(policy,day)=>policy.phases.find(p=>day>=p.fromDay&&day<=p.toDay);
function textOf(m){return m?.skill==='listening'?m.transcript||m.passage||'':m?.passage||m?.transcript||'';}
function inputBody(text){return String(text||'').replace(/^[ \t]*(?:[A-Za-z][A-Za-z .'-]{0,28}|Speaker\s+\d+)\s*:\s*/gm,'').trim();}
function stableMaterial(m){return {id:m.id,version:m.version||null,title:m.title,skill:m.skill,pool:m.pool,type:m.type,passage:m.passage,transcript:m.transcript,prompt:m.prompt,questions:m.questions,vocabulary:m.vocabulary,grammar:m.grammar,transfer:m.transfer,reference:m.reference,audio:m.audio,source:m.source};}
function inputDigests(root){return Object.fromEntries(INPUTS.map(file=>[file,hash(fs.readFileSync(path.join(root,file)))]));}
function availableAsset(root,relative){
 if(typeof relative!=='string'||!relative||/^(?:https?:|data:|blob:|\/\/)/i.test(relative))return false;
 const clean=relative.split(/[?#]/,1)[0],target=path.resolve(root,clean),relativeTarget=path.relative(path.resolve(root),target);
 if(relativeTarget.startsWith('..')||path.isAbsolute(relativeTarget))return false;
 try{return fs.statSync(target).isFile()&&fs.statSync(target).size>100;}catch{return false;}
}
function loadAudioEvidence(root,course){
 const result={};
 for(const m of course.materials.filter(m=>m.skill==='listening')){
  const evidence={audioPath:m.audio||null,seconds:null,status:'unknown-current-file-duration',compiledSeconds:Number(m.audioDurationSeconds)>0?Number(m.audioDurationSeconds):null};
  result[m.id]=evidence;
  if(!/^[a-zA-Z0-9_-]+$/.test(m.id)||!availableAsset(root,m.audio))continue;
  const audioRoot=path.resolve(root,'audio'),audioPath=path.resolve(root,m.audio),rel=path.relative(audioRoot,audioPath);
  if(rel.startsWith('..')||path.isAbsolute(rel))continue;
  const candidates=['curriculum/audio/'+m.id+'.json','curriculum/independent-bank/audio/'+m.id+'.json'];
  const file=candidates.find(p=>fs.existsSync(path.join(root,p)));if(!file)continue;
  try{
   const meta=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
   evidence.metadataPath=file;evidence.metadataHash=hash(fs.readFileSync(path.join(root,file)));evidence.audioHash=hash(fs.readFileSync(audioPath));
   evidence.transcriptMatches=meta.transcriptHash===hash(m.transcript||'');evidence.audioMatches=meta.audioHash===evidence.audioHash;
   if(evidence.transcriptMatches&&evidence.audioMatches&&Number.isFinite(meta.durationSeconds)&&meta.durationSeconds>0){evidence.seconds=meta.durationSeconds;evidence.status='file-hash-bound-duration-metadata';evidence.locale=meta.locale||null;evidence.synthetic=meta.synthetic!==false;}
   else evidence.status='unverified-duration-hash-or-transcript-mismatch';
  }catch(error){evidence.status='unreadable-duration-metadata';}
 }
 return result;
}
function loadInputs(root){
 const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
 const course=require(path.join(root,'assets/curriculum-data.js')),audioEvidence=loadAudioEvidence(root,course),digests=inputDigests(root);digests['@public-listening-audio-evidence']=hash(audioEvidence);
 const publicPath='curriculum/public-supplement-catalog.json',hasPublic=fs.existsSync(path.join(root,publicPath)),publicSupplementPool=hasPublic?read(publicPath):null;
 if(hasPublic)digests[publicPath]=hash(fs.readFileSync(path.join(root,publicPath)));
 return {course,legacy:require(path.join(root,'assets/course-data.js')),catalog:read('materials/textbook-catalog.json'),trainingMap:read('materials/textbook-training-map.json'),policy:read('curriculum/learning-path-policy.json'),audioEvidence,publicSupplementPool,digests,assetAvailable:relative=>availableAsset(root,relative)};
}
function normalizePublicSupplementPool(raw,policy){
 const pool={schema:1,catalogPath:'curriculum/public-supplement-catalog.json',status:raw?'metadata-candidates-only':'pending-source-collection',active:false,automaticScheduling:false,includedInInputAudit:false,headwordCoverageCredit:0,sources:[]};
 if(!raw)return pool;
 if(raw.schema!==1||!Array.isArray(raw.sources))throw Error('Public supplement catalog requires schema:1 and sources:[]');
 const phases=new Set(policy.phases.map(p=>p.id)),capabilities=new Set(policy.capabilities.map(c=>c.id)),ids=new Set();
 for(const source of raw.sources){
  if(!source.sourceId||ids.has(source.sourceId))throw Error('Public sourceId missing or duplicated');ids.add(source.sourceId);
  if(!String(source.version||'').trim()||!/^[a-f0-9]{64}$/i.test(source.contentHash||''))throw Error('Public source version/contentHash required: '+source.sourceId);
  if(!['reading','listening'].includes(source.kind))throw Error('Public source kind must be reading/listening: '+source.sourceId);
  const level=typeof source.level==='string'?{label:source.level,calibrated:false}:clone(source.level||{label:'unknown',calibrated:false});
  level.label=String(level.label||'unknown').replace(/-/g,'–');
  if(!PUBLIC_LEVELS.includes(level.label)||level.calibrated!==false)throw Error('Public level must be supported uncalibrated estimate: '+source.sourceId);
  const phaseIds=source.phaseIds||[],prerequisites=source.prerequisiteCapabilityIds||[];
  if(!Array.isArray(phaseIds)||phaseIds.some(id=>!phases.has(id)))throw Error('Unknown public phaseId: '+source.sourceId);
  if(!Array.isArray(prerequisites)||prerequisites.some(id=>!capabilities.has(id)))throw Error('Unknown public prerequisite capability: '+source.sourceId);
  pool.sources.push({sourceId:source.sourceId,version:String(source.version),contentHash:source.contentHash.toLowerCase(),kind:source.kind,title:source.title||null,sourceUrl:source.sourceUrl||null,rights:clone(source.rights||{status:'unverified'}),level,phaseIds:phaseIds.slice(),prerequisiteCapabilityIds:prerequisites.slice(),grammarTags:clone(source.grammarTags||[]),targetHeadwordKeys:clone(source.targetHeadwordKeys||[]),text:clone(source.text||null),audio:clone(source.audio||null),readiness:'requires-content-rights-prerequisite-and-capacity-review',phaseMappingStatus:phaseIds.length?'explicit-candidate-mapping':'pending-explicit-mapping',countedInInputAudit:false,headwordCoverageCredit:0,completionCredit:false,bandEvidence:false});
 }
 return pool;
}
function parentIds(m,materials){
 const ids=[...(m.source?.sourceIds||[]),...(m.source?.originIds||[])].filter(id=>materials.has(id));
 for(const suffix of ['-grammar','-vocabulary','-speaking','-writing'])if(m.id.endsWith(suffix)&&materials.has(m.id.slice(0,-suffix.length)))ids.push(m.id.slice(0,-suffix.length));
 return unique(ids);
}
function contentKey(m,materials){
 const parents=parentIds(m,materials).map(id=>materials.get(id)).filter(x=>['reading','listening'].includes(x.skill));
 const source=parents.length?parents:[m];
 return source.map(s=>textOf(s)?'input:'+hash(normalize(inputBody(textOf(s)))):'material:'+s.id).sort().join('|');
}
function concepts(m,materials){
 const parents=parentIds(m,materials).map(id=>materials.get(id));
 const text=[m.grammarFocus,m.grammar?.title,...parents.map(p=>p.grammar?.title||p.grammarFocus)].filter(Boolean).join(';');
 const patterns={be:'be动词|be 动词|am / are|am/are',pronouns:'代词',countability:'可数|不可数|数量词|量词',articles:'冠词',present:'一般现在|频率副词|do/does',progressive:'进行时',past:'一般过去',perfect:'完成时',future:'将来|going to',comparison:'比较级|最高级|比较结构',modality:'情态|should|must|can ',passive:'被动',relative:'定语从句|关系从句',nominal:'名词性|宾语从句|主语从句|表语从句',participle:'分词|非谓语',conditional:'条件|虚拟',connections:'连接词|原因|结果|让步',agreement:'主谓一致',inversion:'倒装'};
 return {sourceLabel:text,estimatedTags:Object.entries(patterns).filter(([,pattern])=>new RegExp(pattern,'i').test(text)).map(([key])=>key),method:'source-label-screening-not-semantic-or-psychometric-validation'};
}
function legacyRegistry(legacy,policy){
 return policy.legacyAnalysis.annotations.map(a=>{
  const lesson=legacy.lessons.find(l=>l.day===a.lessonDay);if(!lesson)throw Error('Missing actual legacy lesson '+a.lessonDay);
  if(!lesson.text.includes(a.evidenceQuote))throw Error('Unsupported legacy quote '+a.lessonDay+': '+a.evidenceQuote);
  const sentences=lesson.text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[lesson.text];
  return {...clone(a),kind:'legacy-lesson',sourcePath:'assets/course-data.js',title:lesson.title,contentHash:hash({text:lesson.text,grammar:lesson.grammar,S:lesson.S}),metrics:{wordCount:countWords(lesson.text),sentenceCount:sentences.length,maxSentenceWords:Math.max(...sentences.map(countWords)),grammarItems:lesson.grammar?.length||0},vocabularyIds:legacy.vocab.filter(v=>v.day===a.lessonDay).map(v=>v.id),existingTransferPromptLanguage:/[\u3400-\u9fff]/.test(lesson.S||'')?'zh':'en',transferPromptStatus:'existing legacy prompt; English presentation and new independent output still require review',completionCredit:false,bandEvidence:false};
 });
}
function inputLoadAudit(plan,{course,legacy,policy,audioEvidence={}}){
 const materialMap=new Map(course.materials.map(m=>[m.id,m])),legacyMap=new Map(legacy.lessons.map(l=>[l.day,l]));
 const cleanInput=inputBody;
 const newBucket=()=>({reading:{newSourceCount:0,newWords:0,newRoutineWords:0,newCheckpointWords:0,repeatedReferences:0,repeatedWords:0,totalExposureWords:0,routineExposureWords:0,checkpointExposureWords:0,unknownTextReferences:0},listening:{newSourceCount:0,newTranscriptWords:0,newRoutineTranscriptWords:0,newCheckpointTranscriptWords:0,repeatedTranscriptWords:0,newAudioSeconds:0,newRoutineAudioSeconds:0,newCheckpointAudioSeconds:0,repeatedOnePlaySeconds:0,totalOnePlaySeconds:0,routineOnePlaySeconds:0,checkpointOnePlaySeconds:0,unknownDurationReferences:0,syntheticNewSeconds:0,humanNewSeconds:0},speaking:{newPrompts:0,repeatedPrompts:0,authoredMinimumWords:0,newPromptMinimumWords:0,repeatedPromptMinimumWords:0,explicitMinimumAudioSeconds:0,missingExplicitDurationReferences:0,unknownContractReferences:0},writing:{newPrompts:0,repeatedPrompts:0,authoredMinimumWords:0,newPromptMinimumWords:0,repeatedPromptMinimumWords:0,unknownContractReferences:0},combinedNewTextWords:0,learnerProducedOutput:'not-read-not-claimed'});
 const add=(to,from)=>{for(const skill of ['reading','listening','speaking','writing'])for(const [k,v]of Object.entries(from[skill]))to[skill][k]+=v;to.combinedNewTextWords+=from.combinedNewTextWords;};
 const auditAssignments=kind=>{
  const weeks=Array.from({length:52},(_,i)=>({week:i+1,...newBucket()})),phases=Object.fromEntries(policy.phases.map(p=>[p.id,newBucket()])),seen={reading:new Set(),listening:new Set(),speaking:new Set(),writing:new Set(),combined:new Set()};
  for(const day of plan.days){
   const daily=newBucket();
   const activities=kind==='current'?day.currentAssignment.tasks.map(t=>({skill:t.skill,references:t.materialIds.map(materialId=>({kind:'material',materialId}))})):day.proposedAssignment.activities;
   for(const activity of activities){
    const skill=activity.skill;if(!FOUR_SKILLS.includes(skill))continue;
    for(const ref of activity.references){
     const m=ref.kind==='material'?materialMap.get(ref.materialId):null;
     const l=ref.kind==='legacy-lesson'?legacyMap.get(ref.lessonDay):null;
     const checkpoint=!!m&&(m.pool!=='training'||m.fullTest);
     if(['reading','listening'].includes(skill)){
      if(ref.kind==='textbook'){if(skill==='reading')daily.reading.unknownTextReferences++;else daily.listening.unknownDurationReferences++;continue;}
      if(m&&m.skill!==skill)continue;
      const body=cleanInput(l?.text||textOf(m)),words=countWords(body),key=hash(normalize(body));
      if(!body){if(skill==='reading')daily.reading.unknownTextReferences++;else daily.listening.unknownDurationReferences++;continue;}
      // A second modality of the same normalized body is exposure/review,
      // not another independent new text in the input-capacity audit.
      const fresh=!seen.combined.has(key);seen[skill].add(key);
      if(!seen.combined.has(key)){seen.combined.add(key);daily.combinedNewTextWords+=words;}
      if(skill==='reading'){
       daily.reading.totalExposureWords+=words;
       daily.reading[checkpoint?'checkpointExposureWords':'routineExposureWords']+=words;
       if(fresh){daily.reading.newSourceCount++;daily.reading.newWords+=words;daily.reading[checkpoint?'newCheckpointWords':'newRoutineWords']+=words;}else{daily.reading.repeatedReferences++;daily.reading.repeatedWords+=words;}
      }else{
       const evidence=m&&audioEvidence[m.id],seconds=Number.isFinite(evidence?.seconds)?evidence.seconds:null;
       if(fresh){daily.listening.newSourceCount++;daily.listening.newTranscriptWords+=words;daily.listening[checkpoint?'newCheckpointTranscriptWords':'newRoutineTranscriptWords']+=words;}else daily.listening.repeatedTranscriptWords+=words;
       if(seconds===null)daily.listening.unknownDurationReferences++;
       else{daily.listening.totalOnePlaySeconds+=seconds;daily.listening[checkpoint?'checkpointOnePlaySeconds':'routineOnePlaySeconds']+=seconds;if(fresh){daily.listening.newAudioSeconds+=seconds;daily.listening[checkpoint?'newCheckpointAudioSeconds':'newRoutineAudioSeconds']+=seconds;if(evidence.synthetic)daily.listening.syntheticNewSeconds+=seconds;else daily.listening.humanNewSeconds+=seconds;}else daily.listening.repeatedOnePlaySeconds+=seconds;}
      }
     }else{
      if(!m||m.skill!==skill){daily[skill].unknownContractReferences++;continue;}
      const key=hash(normalize(m.prompt||m.title||m.id)),fresh=!seen[skill].has(key);seen[skill].add(key);
      if(fresh)daily[skill].newPrompts++;else daily[skill].repeatedPrompts++;
      if(Number.isFinite(m.minWords)){daily[skill].authoredMinimumWords+=m.minWords;daily[skill][fresh?'newPromptMinimumWords':'repeatedPromptMinimumWords']+=m.minWords;}else daily[skill].unknownContractReferences++;
      if(skill==='speaking'){
       const seconds=Number(m.minAudioSeconds||m.minimumAudioSeconds||0);
       if(seconds>0)daily.speaking.explicitMinimumAudioSeconds+=seconds;else daily.speaking.missingExplicitDurationReferences++;
      }
     }
    }
   }
   add(weeks[Math.min(day.week,52)-1],daily);add(phases[day.phaseId],daily);
  }
  const total=newBucket();for(const week of weeks)add(total,week);
  return {weeks,phases,total};
 };
 const current=auditAssignments('current'),proposed=auditAssignments('proposed');
 const metrics={newReadingWords:b=>b.reading.newRoutineWords,totalReadingExposureWords:b=>b.reading.routineExposureWords,newListeningMinutes:b=>b.listening.newRoutineAudioSeconds/60,totalOnePlayListeningMinutes:b=>b.listening.routineOnePlaySeconds/60,writingIndependentWords:b=>b.writing.newPromptMinimumWords};
 const compare=(bucket,target)=>Object.fromEntries(Object.entries(metrics).map(([key,fn])=>{const designKey=key+'PerWeek',actual=fn(bucket),design=target[designKey];return [key,{actualRoutineReferenced:actual,designTarget:design,shortfall:Math.max(0,design-actual),interpretation:key==='writingIndependentWords'?'new prompt authored minimum only; repeated prompts do not prove independent successful outputs':'routine known content only; checkpoints and unknown PDF text excluded, not zero-content claims'}];}));
 const weekly=proposed.weeks.map(w=>{
  const rows=plan.days.filter(d=>d.week===w.week&&d.day!==365),daysByPhase=byCount(rows.map(d=>d.phaseId)),target={};
  for(const [phase,n]of Object.entries(daysByPhase))for(const [key,value]of Object.entries(policy.inputLoadDesign.targetsByPhase[phase]))target[key]=(target[key]||0)+value*n/7;
  return {week:w.week,daysByPhase,designTarget:target,current:current.weeks[w.week-1],proposed:w,gaps:compare(w,target),speakingDurationGap:{actualExplicitMinimumSeconds:w.speaking.explicitMinimumAudioSeconds,missingContractReferences:w.speaking.missingExplicitDurationReferences,designMinutes:target.speakingIndependentMinutesPerWeek,canVerifyEffectiveOutput:false}};
 });
 const training=course.materials.filter(m=>m.pool==='training'&&['reading','listening'].includes(m.skill));
 const trainingBodies=new Map(training.filter(m=>cleanInput(textOf(m))).map(m=>[hash(normalize(cleanInput(textOf(m)))),cleanInput(textOf(m))]));
 const routineBodies=new Map(training.filter(m=>!m.fullTest&&cleanInput(textOf(m))).map(m=>[hash(normalize(cleanInput(textOf(m)))),cleanInput(textOf(m))]));
 const corpus={trainingInputRecords:training.length,uniqueTrainingBodies:trainingBodies.size,uniqueTrainingBodyWords:[...trainingBodies.values()].reduce((n,t)=>n+countWords(t),0),routineTrainingRecords:training.filter(m=>!m.fullTest).length,uniqueRoutineBodies:routineBodies.size,uniqueRoutineBodyWords:[...routineBodies.values()].reduce((n,t)=>n+countWords(t),0),fullTaskTrainingRecords:training.filter(m=>m.fullTest).length,reservedPoolWordsExcluded:true};
 return {status:'reference-content-and-contract-audit-not-learner-performance',design:clone(policy.inputLoadDesign),methods:{words:'English-word regex on actual passage/transcript; line speaker labels removed heuristically; aliases deduplicated by normalized body',audioSeconds:'durationSeconds from public metadata only after current audio SHA-256 and transcriptHash match; no slot minutes or TTS word-rate estimate',replay:'one scheduled reference counts one play; actual replay/listening time is unknown, never multiplied to fill a slot',outputs:'existing authored minWords/explicit audio minimum; not actual produced words, original audio duration, accuracy or successful independent output',textbooks:'only verified section page references; unread/unreviewed PDF text, answers and unknown output contracts excluded from token totals; not assumed absent',checkpoint:'non-training pools and full-task material input reported separately; never counted as ordinary input to fill a training gap'},corpus,audioEvidenceSummary:byCount(Object.values(audioEvidence).map(e=>e.status)),currentTotal:current.total,proposedTotal:proposed.total,weekly,phases:policy.phases.map(p=>({phaseId:p.id,days:p.toDay-p.fromDay+1,current:current.phases[p.id],proposed:proposed.phases[p.id],designTargetPerWeek:policy.inputLoadDesign.targetsByPhase[p.id]})),limits:['Design quantities are adjustable starting assumptions, not official IELTS or empirically validated doses.','Source counts/words alone do not establish comprehensibility or the input exposures needed for 8000 headwords.','Repeat exposure can support retrieval/fluency but is not additional independent text or a new question.','A speaking slot has no verified independent duration when the source contract only sets words.','Audio metadata is file-bound, not a fresh human listening/acoustic review; unmatched durations remain unknown.']};
}
function textbookRef(doc,test,skill,{reserved=false}={}){
 const key=skill==='reading'?'readingPage':skill==='writing'?'writingPage':null;
 const exact=key&&Number.isInteger(test[key]);
 const page=exact?test[key]:test.startPage;
 return {kind:'textbook',documentId:doc.id,testId:test.id,skill,path:doc.path,page,pageKind:exact?skill+'-start':'test-start',pageConvention:'physical-pdf-1-based',reserved,availability:skill==='listening'?'blocked-missing-authentic-audio':exact?'available-local-reference':'blocked-missing-verified-skill-page',unseenStatus:'requires-profile-exposure-check',responseWorkflow:'local-pdf-reference-not-interactive-import',completionCredit:false,bandEvidence:false};
}
function ordinarySourceLedger(plan,{course,policy}){
 const ordinary=course.materials.filter(m=>m.pool==='training'&&!m.fullTest&&['reading','listening'].includes(m.skill)),map=new Map(course.materials.map(m=>[m.id,m]));
 return ordinary.map(m=>{
  const firstCurrent=plan.days.find(d=>d.currentAssignment.tasks.some(t=>t.skill===m.skill&&t.materialIds.includes(m.id)));
  const firstProposed=plan.days.find(d=>d.proposedAssignment.activities.some(a=>a.skill===m.skill&&a.references.some(r=>r.materialId===m.id)));
  const shared=firstProposed?null:plan.days.find(d=>d.proposedAssignment.activities.some(a=>['reading','listening'].includes(a.skill)&&a.references.some(r=>r.kind==='material'&&contentKey(map.get(r.materialId),map)===contentKey(m,map))));
  let reason=null;
  if(!firstProposed){if(shared)reason='same-body-already-counted-in-other-modality';else if((m.estimatedMinutes||0)>(policy.budgets.ordinary[m.skill]||0))reason='author-estimate-exceeds-shared-slot';else if(plan.materials[m.id]?.audio?.localAvailable===false||m.source?.verification!=='reviewed')reason='source-or-audio-review-blocked';else reason='unassigned-ordinary-source-needs-review';}
  return {materialId:m.id,skill:m.skill,sourceWeek:m.week,sourceFamilyKey:contentKey(m,map),wordCount:countWords(inputBody(textOf(m))),authorEstimateMinutes:m.estimatedMinutes||null,existingLevelLabel:m.level||null,difficultyStatus:'source-label-and-focus-reviewed-for-planning-not-calibrated',grammarFocus:m.grammarFocus||m.grammar?.title||null,sourceReview:m.source?.verification||'unknown',prerequisites:'check source focus and phase capability evidence before adoption',firstCurrentDay:firstCurrent?.day||null,firstProposedDay:firstProposed?.day||null,sharedContentFirstDay:shared?.day||null,assignmentStatus:firstProposed?'assigned-proposal-only':shared?'shared-body-already-referenced':'pending',deferReason:reason,createsLearnerDebt:false};
 });
}
function cumulativeInputProtection(plan,policy){
 const metrics={readingNewWords:x=>x.reading.newRoutineWords,listeningNewTranscriptWords:x=>x.listening.newRoutineTranscriptWords,listeningNewAudioSeconds:x=>x.listening.newRoutineAudioSeconds};
 const cumulativeCurrent={readingNewWords:0,listeningNewTranscriptWords:0,listeningNewAudioSeconds:0},cumulativeProposed={...cumulativeCurrent};
 return plan.inputLoadAudit.phases.map(p=>{
  for(const [key,fn]of Object.entries(metrics)){cumulativeCurrent[key]+=fn(p.current);cumulativeProposed[key]+=fn(p.proposed);}
  const phase=policy.phases.find(x=>x.id===p.phaseId),deltas=Object.fromEntries(Object.keys(metrics).map(k=>[k,cumulativeProposed[k]-cumulativeCurrent[k]]));
  const deferred=plan.ordinarySourceLedger.filter(m=>m.firstCurrentDay&&m.firstCurrentDay<=phase.toDay&&(!m.firstProposedDay||m.firstProposedDay>phase.toDay)&&m.deferReason&&policy.cumulativeInputProtection.allowPostponementOnlyWithReason.includes(m.deferReason));
  const regression=Object.values(deltas).some(v=>v<-.01);
  return {phaseId:p.phaseId,throughDay:phase.toDay,currentBaseline:{...cumulativeCurrent},proposed:{...cumulativeProposed},deltas,status:regression?deferred.length?'justified-deferral-requires-review':'unexplained-regression':'pass',deferredSourceReasons:deferred.map(m=>({materialId:m.materialId,reason:m.deferReason})),baselineIsNotGoalSufficiency:true};
 });
}
function buildLearningPath({course,legacy,catalog,trainingMap,policy,digests={},audioEvidence={},publicSupplementPool=null,assetAvailable=()=>false}={}){
 if(!course||!legacy||!catalog||!policy)throw Error('Static course, legacy, textbook catalog and policy are required');
 if(policy.active!==false||policy.status!=='staged-review-required')throw Error('P2 policy must remain staged and inactive');
 if(course.days.length!==365)throw Error('Actual course must contain 365 days');
 const before=hash(course.days),materialMap=new Map(course.materials.map(m=>[m.id,m]));
 const books=new Map(catalog.documents.map(d=>[d.id,d]));
 const legacyList=legacyRegistry(legacy,policy),legacyMap=new Map(legacyList.map(l=>[l.lessonDay,l]));
 const usedLegacy=new Set(),seenMaterials=new Map(),seenInputs=new Map(),seenConcepts=new Map(),registry={};
 let currentPending=[];
 const weeklyReadings=new Map(),weeklyListenings=new Map();
 for(let week=1;week<=52;week++){
  weeklyReadings.set(week,sorted(course.materials.filter(m=>m.week===week&&m.skill==='reading'&&m.pool==='training'&&!m.fullTest&&!m.id.startsWith('day02-expansion-'))));
  weeklyListenings.set(week,sorted(course.materials.filter(m=>m.week===week&&m.skill==='listening'&&m.pool==='training'&&!m.fullTest&&!/^sounds-|^listening-map-|^day02-expansion-/.test(m.id))));
 }
 function materialRef(id){
  const m=materialMap.get(id);if(!m)throw Error('Missing actual material '+id);
  if(!registry[id])registry[id]={id:m.id,title:m.title,skill:m.skill,pool:m.pool,type:m.type,version:m.version||null,contentHash:hash(stableMaterial(m)),sourceContentHash:m.source?.contentHash||null,sourceKind:m.source?.kind||'unknown',rights:m.source?.rights||'unknown',verification:m.source?.verification||'unreviewed',levelLabel:m.level||null,levelStatus:'existing-project-label-not-calibrated',sourceMaterialIds:parentIds(m,materialMap),sourceFamilyKey:contentKey(m,materialMap),wordCount:countWords(textOf(m)),questionCount:m.questions?.length||0,grammar:concepts(m,materialMap),audio:m.skill==='listening'?{path:m.audio||null,localAvailable:assetAvailable(m.audio),synthetic:audioEvidence[id]?.synthetic??m.audioSynthetic!==false,durationEvidence:audioEvidence[id]||{seconds:null,status:'unknown-current-file-duration'}}:undefined};
  return {kind:'material',materialId:id};
 }
 function legacyRef(lessonDay){return {kind:'legacy-lesson',lessonDay,sourcePath:'assets/course-data.js'};}
 function linkedMaterialId(sourceId,skill){const id=/^day02-expansion-(reading|listening)$/.test(sourceId)?'day02-expansion-'+skill:sourceId+'-'+skill;return materialMap.has(id)?id:null;}
 function classify(ref,day,skill,mode){
  if(ref.kind==='textbook')return mode==='checkpoint'?'checkpoint':'first-study';
  if(ref.kind==='legacy-lesson')return usedLegacy.has(ref.lessonDay)?'review':'first-study';
  const m=materialMap.get(ref.materialId),reg=registry[m.id];
  if(mode==='checkpoint')return 'checkpoint';
  if(skill==='reflection')return 'evidence-review';
  if(seenMaterials.has(m.id))return mode==='fluency'?'fluency-review':'review';
  if(['reading','listening'].includes(skill)&&seenInputs.has(reg.sourceFamilyKey))return 'review';
  return ['speaking','writing'].includes(skill)?'transfer':'first-study';
 }
 function activity(skill,refs,day,{mode='practice',connection='current-unit',reason}={}){
  const uniqueRefs=[...new Map(refs.filter(Boolean).map(ref=>[JSON.stringify(ref),ref])).values()];
  let authorMinutes=0;
  const slot=Math.max(policy.budgets.ordinary[skill]||360,uniqueRefs.some(r=>r.kind==='textbook'&&r.skill==='reading')?60:0);
  const bounded=uniqueRefs.filter(ref=>{
   const m=ref.kind==='material'?materialMap.get(ref.materialId):null;
   const estimate=Number(ref.minuteCap||m?.estimatedMinutes||0);
   if(day!==1&&mode!=='checkpoint'&&skill!=='reflection'&&estimate>0&&authorMinutes+estimate>slot){currentPending.push({...ref,skill,role:'pending-candidate',reason:'author-estimate-exceeds-shared-slot',authorEstimateMinutes:estimate,referenceSlotMinutes:slot,createsLearnerDebt:false});return false;}
   authorMinutes+=estimate;return true;
  });
  const references=bounded.map(ref=>{
   const role=classify(ref,day,skill,mode),item={...ref,role,plannedFirstNotLearnerUnseen:true};
   if(ref.kind==='material'){
    const m=materialMap.get(ref.materialId),reg=registry[m.id];
    item.availability=m.skill==='listening'&&!reg.audio.localAvailable?'blocked-audio-unavailable':reg.verification!=='reviewed'?'blocked-source-review':'available-existing-material-not-calibrated';
    item.firstPlannedDay=seenMaterials.get(m.id)||day;
    item.sourceFirstPlannedDay=seenInputs.get(reg.sourceFamilyKey)||day;
    item.plannedDelayHours=(day-item.sourceFirstPlannedDay)*24;
    item.conceptRole=skill==='grammar'?(reg.grammar.estimatedTags.length?reg.grammar.estimatedTags.some(t=>!seenConcepts.has(t))?'possible-first-label-introduction':'new-context-or-review-of-existing-rule':'unmapped-requires-review'):undefined;
    seenMaterials.set(m.id,seenMaterials.get(m.id)||day);
    if(['reading','listening'].includes(skill))seenInputs.set(reg.sourceFamilyKey,seenInputs.get(reg.sourceFamilyKey)||day);
    if(skill==='grammar')for(const tag of reg.grammar.estimatedTags)seenConcepts.set(tag,seenConcepts.get(tag)||day);
   } else if(ref.kind==='legacy-lesson'){usedLegacy.add(ref.lessonDay);item.availability='available-supported-language-only-not-calibrated';item.requiredGrammarCapabilities=legacyMap.get(ref.lessonDay).grammarPrerequisites;}
   return item;
  });
  const phase=phaseFor(policy,day);
  return {skill,role:references.length===1?references[0].role:'mixed',capabilityId:skill==='reflection'?null:phase.id+':'+skill,objective:phase.targets[skill]||'保存真实复盘与缺口',references,connection,selectionReason:reason||null,authorEstimateMinutes:authorMinutes,estimateStatus:'author-reference-not-real-learner-capacity',realForecastExceedsBudget:'defer remaining references, never force or silently complete',estimatedMinutesShare:'shared-skill-slot-not-per-reference',evidence:skill==='speaking'?'original complete audio + transcript + scoped four-dimension feedback':skill==='writing'?'independent draft + evidence-based feedback + separate revision':skill==='vocabulary'?'actual-context initial/retrieval artifacts; due first; P3 coverage pending':skill==='grammar'?'independent answers + source rule/evidence + reviewed transfer sentence':skill==='reflection'?'unresolved errors and next delayed check, no automatic mastery':'first answers + source evidence + actual aid/replay use'};
 }
 function selectLegacy(day,week){
  const candidates=legacyList.filter(l=>l.routineUse&&!usedLegacy.has(l.lessonDay)&&l.earliestProposedDay<=day);
  return candidates.sort((a,b)=>{
   const score=x=>Math.min(...x.preferredWeeks.map(w=>Math.abs(w-week)))+(x.estimatedSupportedLevel==='B2'?1:0);
   return score(a)-score(b)||a.lessonDay-b.lessonDay;
  })[0];
 }
 const ordinarySources=course.materials.filter(m=>m.pool==='training'&&!m.fullTest&&['reading','listening'].includes(m.skill));
 function nextOrdinary(skill,week,day){
  return sorted(ordinarySources.filter(m=>m.skill===skill&&m.week<=week&&(m.availableFromDay||1)<=day&&!/^sounds-|^listening-map-|^day02-expansion-/.test(m.id)&&!seenInputs.has(contentKey(m,materialMap)))).sort((a,b)=>(a.week===week?0:1)-(b.week===week?0:1)||b.week-a.week||a.id.localeCompare(b.id,undefined,{numeric:true})).find(m=>(m.estimatedMinutes||0)<=policy.budgets.ordinary[skill]);
 }
 const recent={reading:null,listening:null,grammar:null},introducedByWeek=new Map(),days=[];
 for(const base of course.days){
  const day=base.day,week=base.week,weekday=base.weekday,phase=phaseFor(policy,day);
  if(!phase)throw Error('No phase for day '+day);
  const currentAssignment={source:'assets/curriculum-data.js',snapshotHash:hash(base),tasks:base.tasks.map(t=>({taskId:t.id,skill:t.skill,mode:t.mode,materialIds:t.materialIds.slice(),minutes:t.minutes,firstPlanned:clone(t.materialPractice||[])})),minutes:base.totalMinutes};
  const activities=[],blockedCandidates=[],alternatives=[],reviewSuggestions=[],pendingCandidates=[],gaps=[];currentPending=pendingCandidates;
  const assess=base.tasks.some(t=>t.mode==='assessment'&&t.materialIds.some(id=>{const m=materialMap.get(id);return m&&(m.pool==='gate'||m.pool==='final'||m.fullTest);}));
  let dayKind=day===365?'annual-evidence-review':assess?'checkpoint':'mixed-input-retrieval-transfer';
  if(day===365){
   activities.push(activity('reflection',base.tasks.flatMap(t=>t.materialIds).map(materialRef),day));
  } else if(assess){
   for(const t of base.tasks){
    const ids=t.materialIds.filter(id=>{const m=materialMap.get(id);return m&&(m.pool==='gate'||m.pool==='final'||m.fullTest||m.skill==='reflection');});
    if(ids.length)activities.push(activity(t.skill,ids.map(materialRef),day,{mode:t.skill==='reflection'?'practice':'checkpoint',connection:'independent-checkpoint',reason:'沿用既有独立测验日和真实题组，不把其题目提前转入普通训练'}));
   }
  } else {
   const fresh=true;
   const reads=weeklyReadings.get(week)||[],listens=weeklyListenings.get(week)||[];
   let readRef,listenRef,readMaterial,legacySelected;
   const unitHistory=introducedByWeek.get(week)||[];
   if(day===1){
    for(const t of base.tasks)activities.push(activity(t.skill,t.materialIds.map(materialRef),day,{reason:'第一课作为已有合同锚点，staged也保留原ID集合'}));
    const firstRead=base.tasks.find(t=>t.skill==='reading')?.materialIds.find(id=>materialMap.get(id)?.skill==='reading');
    const firstListen=base.tasks.find(t=>t.skill==='listening')?.materialIds.find(id=>materialMap.get(id)?.skill==='listening');
    if(firstRead){introducedByWeek.set(week,[{materialId:firstRead,day}]);recent.reading=firstRead;}if(firstListen)recent.listening=firstListen;
   } else {
    if(day===2){readMaterial=materialMap.get('day02-expansion-reading');listenRef=materialMap.has('day02-expansion-listening')?materialRef('day02-expansion-listening'):null;}
    else readMaterial=nextOrdinary('reading',week,day);
    if(!readMaterial&&day>=113&&day<=330){legacySelected=selectLegacy(day,week);if(legacySelected)readRef=legacyRef(legacySelected.lessonDay);}
    if(!readRef&&readMaterial)readRef=materialRef(readMaterial.id);
    if(!readRef){readMaterial=materialMap.get(recent.reading)||reads[0];if(readMaterial)readRef=materialRef(readMaterial.id);gaps.push({code:'no-additional-appropriate-reading-source',skill:'reading',reason:'当前先修窗口的未用普通源已排完；本次显式复习，输入规模缺口另按周核对'});}
    if(!listenRef){const lm=nextOrdinary('listening',week,day);if(lm)listenRef=materialRef(lm.id);}
    if(!listenRef){const lm=materialMap.get(recent.listening)||listens[0];if(lm)listenRef=materialRef(lm.id);gaps.push({code:'no-additional-appropriate-listening-source',skill:'listening',reason:'当前窗口没有额外未用普通听力源；不借保留卷，不按重播伪造新输入'});}
    const supplementaryListen=(base.tasks.find(t=>t.skill==='listening')?.materialIds||[]).filter(id=>/^sounds-|^listening-map-/.test(id)&&!seenInputs.has(contentKey(materialMap.get(id),materialMap))).map(materialRef);
    let selectedRead=readRef?[readRef]:[],selectedWrite;
    const recommendation=trainingMap?.recommendations?.find(r=>r.week===week);
    if(weekday===policy.weeklyPattern.textbookPracticeWeekday&&recommendation&&week<49){
     const doc=books.get(recommendation.documentId),test=doc?.tests?.find(t=>t.id===recommendation.testId);
     if(!doc||!test)throw Error('Training map has missing actual textbook test');
     for(const skill of ['reading','writing','listening']){
      const ref=textbookRef(doc,test,skill);
      if(ref.availability==='available-local-reference'){
       if(skill==='reading'){selectedRead=[ref];legacySelected=null;readRef=ref;readMaterial=materialMap.get(recent.reading)||reads[0];}if(skill==='writing')selectedWrite=[ref];
      }else blockedCandidates.push({...ref,role:'blocked-candidate',reason:skill==='listening'?'本批无核实配套原音，TTS不替代真题录音':'只有Test起始，尚无核实分科页'});
     }
     if(selectedWrite)gaps.push({code:'textbook-response-workflow-not-bound',skill:'writing',reason:'已有本地PDF真实页码，但未导入逐题响应/评分；未来集成需另行绑定原稿而非浏览完成'});
    }
    if(listenRef)activities.push(activity('listening',[listenRef,...supplementaryListen],day,{mode:seenInputs.has(registry[listenRef.materialId].sourceFamilyKey)?'fluency':'practice'}));
    if(selectedRead.length)activities.push(activity('reading',selectedRead,day,{mode:selectedRead[0].kind==='material'&&seenInputs.has(registry[selectedRead[0].materialId].sourceFamilyKey)?'fluency':'practice',reason:selectedRead[0].kind==='legacy-lesson'?'已优先排当前窗口未用普通源；以逐篇AI估级的真实52篇补充阅读，先修需诊断':selectedRead[0].kind==='textbook'?'以已核剑桥阅读分科页替换本日重复阅读，不追加预算':null}));
    if(readMaterial&&selectedRead[0]?.kind==='material'){
     if(!unitHistory.some(u=>u.materialId===readMaterial.id)){unitHistory.push({materialId:readMaterial.id,day});introducedByWeek.set(week,unitHistory);}
     recent.reading=readMaterial.id;
    }
    if(listenRef)recent.listening=listenRef.materialId;
    let grammarRefs=[];
    if(selectedRead[0]?.kind==='legacy-lesson')grammarRefs=[selectedRead[0]];
    else if(readMaterial&&linkedMaterialId(readMaterial.id,'grammar'))grammarRefs=[materialRef(linkedMaterialId(readMaterial.id,'grammar'))];
    else {const gm=(base.tasks.find(t=>t.skill==='grammar')?.materialIds||[]).find(id=>materialMap.get(id)?.pool==='training');if(gm)grammarRefs=[materialRef(gm)];}
    if(recent.grammar&&grammarRefs.every(r=>r.materialId!==recent.grammar))grammarRefs.push({...materialRef(recent.grammar),practiceScope:'selected-error-retrieval-not-full-pack',minuteCap:5});
    if(grammarRefs.length){activities.push(activity('grammar',grammarRefs.slice(0,2),day,{connection:selectedRead[0]?.kind==='legacy-lesson'?'legacy-existing-quotes':'current-unit'}));const gm=grammarRefs.find(r=>r.kind==='material');if(gm)recent.grammar=gm.materialId;}
    const vocabularyRefs=[];
    for(const ref of [readRef,listenRef]){
     if(ref?.kind==='legacy-lesson')vocabularyRefs.push(ref);
     else if(ref?.kind==='material'&&linkedMaterialId(ref.materialId,'vocabulary'))vocabularyRefs.push(materialRef(linkedMaterialId(ref.materialId,'vocabulary')));
    }
    if(!vocabularyRefs.length&&readRef)vocabularyRefs.push(readRef);
    if(vocabularyRefs.length)activities.push(activity('vocabulary',vocabularyRefs,day,{connection:'actual-source-context-only',reason:'仅引用真实输入语境候选；到期先做，具体词头/义项/容量交P3，绝无固定每日新词数'}));
    const fallbackRead=readMaterial||reads[0]||materialMap.get(recent.reading);
    for(const skill of ['speaking','writing']){
     let refs=skill==='writing'?selectedWrite:undefined;
     if(!refs&&fallbackRead&&linkedMaterialId(fallbackRead.id,skill))refs=[materialRef(linkedMaterialId(fallbackRead.id,skill))];
     if(skill==='writing'&&week>=21&&!selectedWrite){const ids=(base.tasks.find(t=>t.skill==='writing')?.materialIds||[]).filter(id=>materialMap.get(id)?.pool==='training');if(ids.length)refs=ids.map(materialRef);}
     if(!refs?.length){const ids=(base.tasks.find(t=>t.skill===skill)?.materialIds||[]).filter(id=>materialMap.get(id)?.pool==='training');refs=ids.map(materialRef);}
     if(refs.length)activities.push(activity(skill,refs,day,{mode:fresh?'practice':'fluency',connection:legacySelected?'existing-output-prompt-separate-from-legacy':'current-unit'}));
     else gaps.push({code:'no-authored-output-task',skill,reason:'没有可引用的普通池已编任务，不能把随口标题当已交付材料'});
    }
    if(legacySelected)gaps.push({code:'legacy-linked-output-not-authored-in-English',skill:'speaking-writing',reason:'原52篇有中文迁移提示，暂用明确另列的既有口写题；尚无该篇新版英文独立迁移题，不声称四技能已全联动'});
    const reflection=(base.tasks.find(t=>t.skill==='reflection')?.materialIds||[]).map(materialRef);
    if(reflection.length)activities.push(activity('reflection',reflection,day));
   }
  }
  if(assess&&week>=49){
   const rec=trainingMap?.recommendations?.find(r=>r.week===week),doc=rec&&books.get(rec.documentId),test=doc?.tests?.find(t=>t.id===rec.testId);
   if(doc&&test)alternatives.push({selection:'mutually-exclusive-replacement-after-exposure-check',kind:'reserved-textbook-read-write-only',references:['reading','writing','listening'].map(skill=>textbookRef(doc,test,skill,{reserved:true})),fullFourSkillTestAvailable:false});
  }
  const key=day===365?'annualReview':assess?'checkpoint':'ordinary',budget=clone(policy.budgets[key]);
  if(!assess&&activities.some(a=>a.skill==='reading'&&a.references.some(r=>r.kind==='textbook'))&&budget.reading<60){const extra=60-budget.reading;budget.reading=60;budget.break-=extra;}
  const textbookReading=activities.find(a=>a.skill==='reading'&&a.references.some(r=>r.kind==='textbook'));
  if(textbookReading){
   textbookReading.releaseCondition='first independent reading; hide all linked output/answer/paraphrase help before original answers submitted';
   for(const a of activities.filter(a=>['speaking','writing','vocabulary','grammar'].includes(a.skill))){a.releaseAfter={skill:'reading',documentId:textbookReading.references[0].documentId,testId:textbookReading.references[0].testId,evidence:'original-reading-answers-submitted'};a.textbookAnswerAccessBeforeReading=false;}
   gaps.push({code:'textbook-leakage-controls-not-runtime-enforced',skill:'integration',reason:'本提案要求先独立阅读再解锁口写词句/解析；runtime尚未接入，激活前必须实现并验证'});
  }
  if(!assess&&day>1&&day<365){
   const previous=[...seenMaterials.entries()].filter(([id,first])=>first<=day-2&&materialMap.get(id)?.pool==='training'&&!materialMap.get(id).fullTest&&['reading','listening'].includes(materialMap.get(id).skill)).sort((a,b)=>b[1]-a[1])[0];
   if(previous){const m=materialMap.get(previous[0]);reviewSuggestions.push({...materialRef(m.id),role:'review',availability:m.skill==='listening'&&!registry[m.id].audio.localAvailable?'blocked-audio-unavailable':'available-existing-material-not-calibrated',optional:true,practiceScope:'bounded-existing-question-retrieval-or-fluency-not-whole-source-resubmit',questionIds:(m.questions||[]).slice(0,1).map(q=>q.id),plannedDelayHours:(day-previous[1])*24,minuteCap:5,usesSharedDueReviewSlot:true,notCountedAsFullTextOrFullAudioExposure:true,...(textbookReading?{releaseAfter:{skill:'reading',testId:textbookReading.references[0].testId,evidence:'original-reading-answers-submitted'}}:{})});}
  }
  if(pendingCandidates.length)gaps.push({code:'authored-work-awaiting-shared-budget',skill:'budget',reason:'已知作者参考用时超过该技能共享槽，具体引用列pendingCandidates；不强塞、不自动生成学习欠账'});
  for(const a of activities)for(const ref of a.references)if(ref.kind==='material'&&registry[ref.materialId].skill==='listening'&&!registry[ref.materialId].audio.localAvailable)gaps.push({code:'referenced-listening-audio-unavailable',skill:'listening',materialId:ref.materialId,reason:'真实ID存在但本地音频路径未核实可用；该项不可激活'});
  if(day!==365)for(const skill of FOUR_SKILLS)if(!activities.some(a=>a.skill===skill&&a.references.length))gaps.push({code:'missing-daily-skill-reference',skill,reason:'明确缺少可执行材料，不静默补假ID'});
  const readiness=phase.prerequisites.map(capability=>({capability,status:'requires-learner-evidence-at-adoption-no-profile-read'}));
  days.push({day,week,weekday,phaseId:phase.id,kind:dayKind,currentAssignment,proposedAssignment:{status:'staged-not-activated',appliesOnlyTo:'future-unstarted-versioned-day',prerequisiteChecks:readiness,reviewRule:'due-first; bounded by shared budget, reduce new load on backlog; do not persist debt on view',budget:{availableMinutes:360,referenceSlots:budget,referenceTotal:Object.values(budget).reduce((a,b)=>a+b,0),verifiedCapacity:false},activities,reviewSuggestions,pendingCandidates,blockedCandidates,alternatives,gaps},completionOrBandCredit:false});
 }
 for(const m of course.materials.filter(m=>['independent','gate','final'].includes(m.pool)))materialRef(m.id);
 for(const m of ordinarySources)materialRef(m.id);
 const reserveCatalog={materialIds:course.materials.filter(m=>['independent','gate','final'].includes(m.pool)).map(m=>m.id),routineUse:false,independentAndBForms:'unassigned-alternatives-only',minimumParallelFormDelayHours:48,textbooks:catalog.documents.filter(d=>d.reserve||d.editions?.includes(19)).map(d=>({documentId:d.id,reserve:d.reserve||'related to reserved edition 19; do not expose before test'}))};
 const proposedRefs=days.flatMap(d=>d.proposedAssignment.activities.flatMap(a=>a.references));
 const currentCounts=byCount(days.flatMap(d=>d.currentAssignment.tasks.flatMap(t=>t.materialIds))),plannedCounts=byCount(proposedRefs.filter(r=>r.kind==='material').map(r=>r.materialId));
 const plan={schema:1,version:VERSION,status:'staged-review-required',active:false,policyId:policy.id,goal:clone(policy.goal),adoption:clone(policy.adoption),inputDigests:digests,sourceDaysHash:before,capabilityPhases:clone(policy.phases),roleDefinitions:{'first-study':'first planned source/exercise; no personal unseen or mastery claim',review:'retrieval/correction of already planned source; no new-source claim','fluency-review':'familiar source with reduced support; not independent test',transfer:'existing authored output prompt using language in personal/new information; its linked-source origin remains visible',checkpoint:'held-out A/final or existing full-task assessment; exposure check required','evidence-review':'review saved evidence, not a new ability test'},materials:registry,legacyLessons:legacyList,textbookCatalog:{pageConvention:catalog.pageConvention,audio:catalog.audio,bodyIndexStatusByEdition:clone(policy.textbookPolicy.indexStatusByEdition||{}),documents:catalog.documents.map(d=>({documentId:d.id,path:d.path,title:d.filename,type:d.type,academicStatus:d.academicStatus,tests:d.tests||[],reserve:d.reserve||null,anchors:d.anchors||[],readyForLexicalCoverage:false}))},reserveCatalog,days,summary:{days:days.length,changedProposalDays:days.filter(d=>JSON.stringify(d.currentAssignment.tasks.flatMap(t=>t.materialIds))!==JSON.stringify(d.proposedAssignment.activities.flatMap(a=>a.references.filter(r=>r.kind==='material').map(r=>r.materialId)))).length,actualMaterialReferences:Object.keys(plannedCounts).length,currentMaterialReferences:Object.keys(currentCounts).length,roles:byCount(proposedRefs.map(r=>r.role)),legacyAnalyzed:legacyList.length,legacyProposed:usedLegacy.size,legacyUnassigned:legacyList.filter(l=>!usedLegacy.has(l.lessonDay)).map(l=>({lessonDay:l.lessonDay,reason:l.routineUse?'not selected within available appropriate slots; remains alternative':'blocked: '+l.restriction})),gapCounts:byCount(days.flatMap(d=>d.proposedAssignment.gaps.map(g=>g.code))),knownGaps:clone(policy.knownGaps),status:'auditable-first-proposal-not-full-scientific-or-capacity-validation'},limitations:['No learner profiles/exposure read: actual readiness, unseen status and due amount remain unresolved.','Existing project levels and 52 text estimates are not calibrated CEFR or IELTS difficulty.','A first-study material may practise an old rule; source-family and concept-label screening remain explicit.','No 365 unique-text claim; deliberate retrieval and fluency repeats are named. Insufficient new source slots remain gaps.','Current/proposed assignments are separate; no runtime import or historical-snapshot migration.','No textbook audio/answers imported; page links and browsing never create completion or Band credit.']};
 plan.capabilityCatalog=clone(policy.capabilities);
 plan.inputLoadAudit=inputLoadAudit(plan,{course,legacy,policy,audioEvidence});
 plan.textbookLeakageControls=clone(policy.textbookPolicy.leakageControls);
 plan.ordinarySourceLedger=ordinarySourceLedger(plan,{course,policy});
 plan.cumulativeInputProtection=cumulativeInputProtection(plan,policy);
 plan.proposalRules=clone(policy.weeklyPattern);
 plan.publicSupplementPool=normalizePublicSupplementPool(publicSupplementPool,policy);
 plan.summary.ordinarySources={total:plan.ordinarySourceLedger.length,assigned:plan.ordinarySourceLedger.filter(s=>s.assignmentStatus==='assigned-proposal-only').length,shared:plan.ordinarySourceLedger.filter(s=>s.assignmentStatus==='shared-body-already-referenced').length,pending:plan.ordinarySourceLedger.filter(s=>s.assignmentStatus==='pending').length};
 plan.summary.cumulativeInputRegressions=plan.cumulativeInputProtection.filter(p=>p.status==='unexplained-regression').length;
 if(hash(course.days)!==before)throw Error('Builder mutated current day snapshots');
 const result=validatePlan(plan,{course,legacy,catalog,policy,digests,audioEvidence});if(result.errors.length)throw Error('Learning-path validation failed:\n'+result.errors.join('\n'));
 return clone(plan);
}
function validatePlan(plan,{course,legacy,catalog,policy,digests,audioEvidence={}}={}){
 const errors=[],warnings=[];
 const check=(condition,message)=>{if(!condition)errors.push(message);};
 check(plan?.active===false&&plan?.status==='staged-review-required','plan must be inactive staged proposal');
 check(plan?.days?.length===365,'plan must cover 365 rows');
 if(!plan?.days)return {errors,warnings};
 const mm=new Map((course?.materials||[]).map(m=>[m.id,m])),lm=new Map((legacy?.lessons||[]).map(l=>[l.day,l])),docs=new Map((catalog?.documents||[]).map(d=>[d.id,d]));
 const capabilities=new Set((plan.capabilityCatalog||[]).map(c=>c.id));
 check(plan.inputLoadAudit?.status==='reference-content-and-contract-audit-not-learner-performance','input-load audit must distinguish content from performance');
 check(plan.inputLoadAudit?.weekly?.length===52,'input-load audit requires all 52 weeks');
 const expectedOrdinary=course?.materials.filter(m=>m.pool==='training'&&!m.fullTest&&['reading','listening'].includes(m.skill))||[];
 check(plan.ordinarySourceLedger?.length===expectedOrdinary.length,'all ordinary input sources require suitability/assignment ledger');
 for(const m of plan.ordinarySourceLedger||[]){check(expectedOrdinary.some(x=>x.id===m.materialId),'invented ordinary source ledger ID '+m.materialId);check(!!m.firstProposedDay||!!m.deferReason,'unassigned ordinary source lacks explicit reason '+m.materialId);}
 check(plan.proposalRules?.firstStudyWeeklyLimit===null&&plan.proposalRules?.reviewReplacesWholeDay===false,'fixed weekly new-source cap or whole review day is not allowed');
 check(plan.publicSupplementPool?.active===false&&plan.publicSupplementPool?.automaticScheduling===false&&plan.publicSupplementPool?.includedInInputAudit===false&&plan.publicSupplementPool?.headwordCoverageCredit===0,'public candidates cannot silently activate or create coverage credit');
 check(plan.cumulativeInputProtection?.length===policy?.phases.length,'cumulative ordinary input floor requires all phases');
 for(const p of plan.cumulativeInputProtection||[])check(p.status==='pass'||(p.status==='justified-deferral-requires-review'&&p.deferredSourceReasons.length>0),'unexplained cumulative ordinary input regression '+p.phaseId);
 for(const phase of plan.capabilityPhases||[])for(const id of phase.prerequisites)check(capabilities.has(id),'unknown prerequisite capability '+id);
 const seen=new Map(),sourceSeen=new Map();
 function refCheck(ref,day,ordinary,blocked=false){
  if(ref.kind==='material'){
   const m=mm.get(ref.materialId);check(!!m,`day ${day}: unknown material ${ref.materialId}`);if(!m)return;
   const reg=plan.materials[ref.materialId];check(!!reg,`registry missing ${ref.materialId}`);
   if(reg)check(reg.contentHash===hash(stableMaterial(m)),`changed material contract ${m.id}`);
   if(reg)check(reg.sourceFamilyKey===contentKey(m,mm),`source-family mapping changed ${m.id}`);
   if(blocked&&ref.role==='pending-candidate'){check(!['independent','gate','final'].includes(m.pool),`day ${day}: reserved candidate cannot fill ordinary pending queue`);return;}
   check(['first-study','review','fluency-review','transfer','checkpoint','evidence-review'].includes(ref.role),`day ${day}: unknown material role`);
   if(reg?.skill==='listening'&&!reg.audio.localAvailable)check(ref.availability==='blocked-audio-unavailable',`day ${day}: missing audio must block ${m.id}`);
   if(ordinary)check(!['independent','gate','final'].includes(m.pool),`day ${day}: reserve ${m.id} used as routine fill`);
   if(ref.role==='first-study'){
    check(!seen.has(m.id),`day ${day}: repeated ${m.id} falsely first-study`);
    if(['reading','listening'].includes(m.skill)&&reg)check(!sourceSeen.has(reg.sourceFamilyKey),`day ${day}: repeated source falsely new ${m.id}`);
   }
   seen.set(m.id,day);if(['reading','listening'].includes(m.skill)&&reg)sourceSeen.set(reg.sourceFamilyKey,day);
  } else if(ref.kind==='legacy-lesson'){
   const lesson=lm.get(ref.lessonDay),annotation=plan.legacyLessons.find(l=>l.lessonDay===ref.lessonDay);
   check(!!lesson,`day ${day}: nonexistent legacy lesson ${ref.lessonDay}`);
   check(!!annotation&&annotation.routineUse,`day ${day}: blocked legacy routine use ${ref.lessonDay}`);
   if(annotation){check(day>=annotation.earliestProposedDay,`legacy ${ref.lessonDay} before its explicit prerequisite window`);check(lesson?.text.includes(annotation.evidenceQuote),`legacy ${ref.lessonDay} quote not supported`);}
  } else if(ref.kind==='textbook'){
   const doc=docs.get(ref.documentId),test=doc?.tests?.find(t=>t.id===ref.testId);
   check(!!test,`day ${day}: missing actual textbook ${ref.documentId}/${ref.testId}`);if(!test)return;
   const field=ref.pageKind==='reading-start'?'readingPage':ref.pageKind==='writing-start'?'writingPage':'startPage';
   check(ref.page===test[field],`day ${day}: unverified textbook page ${ref.testId}/${field}`);
   if(ref.availability==='available-local-reference')check(ref.skill!=='listening'&&['readingPage','writingPage'].includes(field),`day ${day}: unsupported textbook skill availability`);
   if(ref.skill==='listening')check(ref.availability==='blocked-missing-authentic-audio',`day ${day}: textbook listening falsely available`);
   if(ordinary)check(!ref.reserved&&!doc.editions?.includes(19),`day ${day}: Cambridge19 used for routine`);
   check(ref.completionCredit===false&&ref.bandEvidence===false,`textbook browse cannot create achievement`);
  } else errors.push(`day ${day}: unsupported invented reference kind ${ref.kind}`);
 }
 for(let index=0;index<plan.days.length;index++){
  const row=plan.days[index],p=row.proposedAssignment,base=course?.days?.find(d=>d.day===row.day);
  check(row.day===index+1,`missing/duplicate day at ${index+1}`);
  check(p.status==='staged-not-activated','proposed assignment activated');
  check(p.budget.referenceTotal<=360&&Object.values(p.budget.referenceSlots).every(v=>Number.isFinite(v)&&v>=0),'budget exceeds 360 or is invalid');
  check(p.budget.referenceTotal===Object.values(p.budget.referenceSlots).reduce((a,b)=>a+b,0),'budget total does not match shared slots');
  check(p.budget.verifiedCapacity===false,'capacity simulation not performed');
  if(base){
   check(row.currentAssignment.snapshotHash===hash(base),`current snapshot mismatch day ${row.day}`);
   const expected=base.tasks.map(t=>({taskId:t.id,skill:t.skill,mode:t.mode,materialIds:t.materialIds,minutes:t.minutes,firstPlanned:t.materialPractice||[]}));
   check(hash(row.currentAssignment.tasks)===hash(expected),`current assignment contents changed day ${row.day}`);
  }
  const phase=policy&&phaseFor(policy,row.day);if(phase)check(row.phaseId===phase.id,`wrong capability phase day ${row.day}`);
  const ordinary=row.kind!=='checkpoint'&&row.kind!=='annual-evidence-review';
  for(const a of p.activities){if(a.skill!=='reflection')check(capabilities.has(a.capabilityId),`day ${row.day}: unknown capability ${a.capabilityId}`);for(const ref of a.references)refCheck(ref,row.day,ordinary);}
  const textbookReading=p.activities.find(a=>a.skill==='reading'&&a.references.some(r=>r.kind==='textbook'));
  if(textbookReading)for(const a of p.activities.filter(a=>['speaking','writing','vocabulary','grammar'].includes(a.skill)))check(a.releaseAfter?.evidence==='original-reading-answers-submitted'&&a.releaseAfter.testId===textbookReading.references[0].testId&&a.textbookAnswerAccessBeforeReading===false,`day ${row.day}: textbook output may leak reading answers`);
  for(const ref of p.blockedCandidates)refCheck(ref,row.day,ordinary,true);
  for(const ref of p.pendingCandidates||[])refCheck(ref,row.day,ordinary,true);
  for(const ref of p.reviewSuggestions||[]){refCheck(ref,row.day,ordinary);check(ref.plannedDelayHours>=48,`day ${row.day}: suggested delayed retrieval too early`);const m=mm.get(ref.materialId);for(const qid of ref.questionIds||[])check(m?.questions?.some(q=>q.id===qid),`day ${row.day}: invented review question ${qid}`);}
  if(p.alternatives.length)check(row.kind==='checkpoint'&&row.week>=49,`day ${row.day}: reserved alternatives exposed before final checkpoint`);
  for(const option of p.alternatives)for(const ref of option.references)refCheck(ref,row.day,false,true);
  if(row.day!==365)for(const skill of FOUR_SKILLS)check(p.activities.some(a=>a.skill===skill)||p.gaps.some(g=>g.skill===skill),`day ${row.day} silently lacks ${skill}`);
 }
 check(plan.legacyLessons?.length===52,'all 52 actual texts require individual estimates');
 check(new Set((plan.legacyLessons||[]).map(l=>l.lessonDay)).size===52,'legacy estimates must cover distinct actual days 1-52');
 for(const annotation of plan.legacyLessons||[]){const l=lm.get(annotation.lessonDay);check(!!l&&l.text.includes(annotation.evidenceQuote),`legacy estimate quote ${annotation.lessonDay} unsupported`);check(annotation.calibrated===false,'legacy estimate falsely calibrated');}
 if(course)check(plan.sourceDaysHash===hash(course.days),'current source day contract changed');
 if(digests)for(const [file,digest]of Object.entries(digests))check(plan.inputDigests[file]===digest,'stale static input: '+file);
 if(!errors.length&&course&&legacy&&policy){
  const actualLedger=ordinarySourceLedger(plan,{course,policy}),actualAudit=inputLoadAudit(plan,{course,legacy,policy,audioEvidence});
  check(hash(actualLedger)===hash(plan.ordinarySourceLedger),'ordinary source ledger does not match actual proposed references');
  check(hash(actualAudit)===hash(plan.inputLoadAudit),'input load audit does not match actual references/content/audio evidence');
  const protection=cumulativeInputProtection({...plan,ordinarySourceLedger:actualLedger,inputLoadAudit:actualAudit},policy);
  check(hash(protection)===hash(plan.cumulativeInputProtection),'cumulative input protection does not match actual references');
 }
 warnings.push('Staged proposal only. Semantic quality, learner readiness, 8000 context capacity and scoring calibration remain unverified.');
 return {errors,warnings};
}
function main(args=process.argv.slice(2)){
 const allowed=new Set(['--root','--output','--check']);for(const arg of args.filter(a=>a.startsWith('--')))if(!allowed.has(arg))throw Error('Unsupported option; this tool cannot activate production: '+arg);
 const value=flag=>{const i=args.indexOf(flag);if(i<0)return null;if(!args[i+1]||args[i+1].startsWith('--'))throw Error(flag+' needs a path');return args[i+1];};
 const root=path.resolve(value('--root')||path.join(__dirname,'..')),output=path.resolve(value('--output')||path.join(root,'curriculum','learning-path-plan.json'));
 if(path.basename(output)!=='learning-path-plan.json')throw Error('Only staged learning-path-plan.json may be written/checked');
 const inputs=loadInputs(root);
 if(args.includes('--check')){
  const plan=JSON.parse(fs.readFileSync(output,'utf8')),result=validatePlan(plan,inputs);if(result.errors.length)throw Error(result.errors.join('\n'));
  console.log(JSON.stringify({status:plan.status,active:plan.active,days:plan.days.length,summary:plan.summary,errors:0,warnings:result.warnings}));return plan;
 }
 const plan=buildLearningPath(inputs);fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,JSON.stringify(plan,null,2)+'\n','utf8');
 console.log(JSON.stringify({output,status:plan.status,active:plan.active,summary:plan.summary}));return plan;
}
module.exports={VERSION,INPUTS,PUBLIC_LEVELS,hash,countWords,phaseFor,parentIds,contentKey,availableAsset,loadAudioEvidence,loadInputs,normalizePublicSupplementPool,inputLoadAudit,ordinarySourceLedger,cumulativeInputProtection,buildLearningPath,validatePlan,main};
if(require.main===module){try{main();}catch(error){console.error(error.message);process.exitCode=1;}}
