'use strict';
// Release audit: no network or learner data is accessed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),{jobs}=require('./curriculum-manifest.cjs'),{validate}=require('./author-curriculum.cjs'),A=require('../assets/assessment-core.js');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function ordinaryPublicVariant(material,source,text){
 const binding=material.source||{};
 return Boolean(source&&binding.publicSourceId===source.sourceId&&binding.kind==='public-adaptation'&&String(binding.sourceVersion)===String(source.version)&&binding.sourceTextSha256===source.text?.sha256&&source.contentHash===source.text.sha256&&hash(text)===source.text.sha256&&binding.exposureGroup==='public-source:'+source.sourceId&&binding.practiceOnly===true&&binding.independentAssessmentEligible===false&&binding.independentTransferEligible===false&&binding.independentUnseenParallel===false&&material.pool==='training'&&!material.fullTest&&!material.independentBank&&!material.assessmentGroup&&!material.form);
}
function auditSourceInputs(materials,{catalog}={}){
 const registered=new Map((catalog?.sources||[]).map(s=>[s.sourceId,s])),bodies=new Map(),pairedReuse=[];let bodyVariants=0,uniqueTextWords=0,excludedReuseWords=0,reusedQuestionInstances=0;
 for(const material of materials.filter(m=>['reading','listening'].includes(m.skill))){
  const text=material.skill==='reading'?material.passage:material.transcript;assert.ok(text?.trim(),material.id+' source');bodyVariants++;
  const digest=hash(text.trim().replace(/\s+/g,' ')),existing=bodies.get(digest);
  if(!existing){bodies.set(digest,{material,text,paired:false});uniqueTextWords+=A.countWords(text);continue;}
  const prior=existing.material,source=registered.get(material.source?.publicSourceId),opposite=prior.skill!==material.skill&&['reading','listening'].includes(prior.skill);
  const allowed=!existing.paired&&opposite&&ordinaryPublicVariant(prior,source,existing.text)&&ordinaryPublicVariant(material,source,text)&&prior.source.publicSourceId===material.source.publicSourceId&&prior.source.sourceTextSha256===material.source.sourceTextSha256&&prior.source.exposureGroup===material.source.exposureGroup;
  assert.ok(allowed,material.id+' duplicates '+prior.id+' without a registered ordinary public reading/listening pair');
  existing.paired=true;const reading=prior.skill==='reading'?prior:material,listening=prior.skill==='listening'?prior:material,priorQuestions=new Set((reading.questions||[]).map(q=>JSON.stringify(q))),reused=(listening.questions||[]).filter(q=>priorQuestions.has(JSON.stringify(q))).length;
  const words=A.countWords(text);excludedReuseWords+=words;reusedQuestionInstances+=reused;
  pairedReuse.push({sourceId:source.sourceId,sourceVersion:String(source.version),sourceTextSha256:source.text.sha256,exposureGroup:material.source.exposureGroup,readingMaterialId:reading.id,listeningMaterialId:listening.id,textWordsCountedOnce:words,reusedQuestionInstances:reused,independentUnseenSourcesAdded:0});
 }
 return {bodyVariants,uniqueSourceCount:bodies.size,pairedReuseCount:pairedReuse.length,uniqueTextWords,excludedReuseWords,reusedQuestionInstances,pairedReuse,wordCountBasis:'Assessment.countWords of each distinct normalized source body; role labels retained. Surface words are not headword coverage or learner unseen evidence.',unseenLearnerInputsClaimed:false};
}
function auditPublicAudio(material,{catalog,projectRoot=root}={}){
 const source=catalog?.sources?.find(s=>s.sourceId===material.source?.publicSourceId),audio=source?.audio,proof=material.source?.audioReadiness;
 assert.ok(material.skill==='listening'&&source?.kind==='listening'&&ordinaryPublicVariant(material,source,material.transcript),material.id+' public audio source/ordinary-practice binding');
 assert.ok(audio?.usage?.eligibleForPractice===true&&audio.usage.redistributionAllowed===true&&!String(audio.usage.status||'').startsWith('blocked'),material.id+' public audio usage is blocked');
 assert.ok(audio.path?.startsWith('audio/public/')&&material.audio===audio.path,material.id+' canonical public audio path');
 assert.ok(material.audioSynthetic===false&&material.audioKind==='human-original-conversation'&&material.audioProvider===source.provider,material.id+' original provider audio metadata');
 assert.ok(proof?.eligibleForPractice===true&&proof.eligibleForAssessment===false&&proof.audioPath===audio.path&&proof.audioSha256===audio.sha256&&material.source.audioReviewStatus==='provider-paired-not-independently-reviewed',material.id+' ordinary provider-paired audio proof');
 assert.equal(material.audioDurationSeconds,audio.durationSeconds,material.id+' canonical public audio duration');
 const integrity=require('./build-public-supplement-materials.cjs').canonicalAudioIntegrity(source,projectRoot);assert.ok(integrity.required&&fs.statSync(path.join(projectRoot,audio.path)).size>1000,material.id+' required public audio bytes');
 return{sourceId:source.sourceId,audioPath:audio.path,audioSha256:audio.sha256,durationSeconds:audio.durationSeconds,downloadHashVerified:true,independentListeningReview:false,practiceOnly:true};
}
function audit(data){
 assert.equal(data.status,'complete-material-set','Do not release a partial curriculum');
 assert.equal(data.days.length,365);assert.equal(data.weeks.length,52);
 const map=new Map(data.materials.map(m=>[m.id,m]));assert.equal(map.size,data.materials.length,'Duplicate material ID');
 const catalog=JSON.parse(fs.readFileSync(path.join(root,'curriculum','public-supplement-catalog.json'),'utf8')),sourceInputs=auditSourceInputs(data.materials,{catalog});
 let questions=0,listening=0,writing=0,fullReading=0,fullListening=0;const publicAudio=[];
 for(const job of jobs){const m=map.get(job.id);assert.ok(m,'Missing '+job.id);assert.deepEqual(validate(job,m),[],job.id);assert.equal(m.source.verification,'reviewed',job.id);if(job.skill==='writing'){writing++;assert.ok(m.prompt);}}
 for(const m of data.materials){
  for(const q of m.questions||[]){const answer=q.type==='multi'?q.answers:q.answers?.[0];assert.ok(A.gradeQuestion(q,answer).correct,m.id+'/'+q.id+': canonical answer is not accepted');questions++;}
  if(['reading','listening'].includes(m.skill)){
   const text=m.skill==='reading'?m.passage:m.transcript;assert.ok(text?.trim(),m.id+' source');
   if(m.fullTest){assert.equal(m.questions.length,40,m.id);if(m.skill==='reading')fullReading++;else fullListening++;}
  }
  if(m.skill==='listening'){
   if(m.source?.publicSourceId){listening++;publicAudio.push(auditPublicAudio(m,{catalog}));continue;}
   const independent=m.independentBank===true&&m.pool==='independent',human=m.audioKind==='human';listening++;assert.ok(m.audio&&m.audio.startsWith(human?'audio/human-listening/':independent?'audio/independent-bank/':'audio/curriculum/'),m.id+' audio');assert.ok(fs.statSync(path.join(root,m.audio)).size>1000,m.id+' audio bytes');
   const meta=JSON.parse(fs.readFileSync(path.join(root,'curriculum',...(human?['human-listening','sources']:independent?['independent-bank','audio']:['audio']),m.id+'.json'),'utf8'));assert.equal(meta.transcriptHash,crypto.createHash('sha256').update(m.transcript).digest('hex'),m.id+' stale audio');assert.ok(meta.durationSeconds>1&&meta.voices.length,m.id+' audio metadata');
  }
 }
 const firstWriting=new Set();let totalMinutes=0;
 for(let i=0;i<365;i++){const d=data.days[i];assert.equal(d.day,i+1);assert.equal(d.totalMinutes,360);assert.equal(d.tasks.reduce((n,t)=>n+t.minutes,0),360);totalMinutes+=d.totalMinutes;
  for(const t of d.tasks){assert.ok(t.materialIds.length,d.day+'/'+t.id+' has no material');for(const id of t.materialIds){const m=map.get(id);assert.ok(m,d.day+' missing '+id);assert.equal(m.skill,t.skill,d.day+'/'+t.id);if(t.id==='writing'&&m.type?.startsWith('academic_'))firstWriting.add(id);}assert.ok(t.quantity>0);}
 }
 const annual=data.days[364];assert.equal(annual.week,52);assert.equal(annual.weekday,8);assert.ok(annual.readinessReview);assert.ok(annual.tasks.every(t=>t.id==='reflection'),'Day365 reviews existing evidence and must not expose reserved exams');
 assert.equal(firstWriting.size,96,'48 first-draft Task1/2 pairs; checkpoints replace regular new pairs');
 assert.equal(totalMinutes,131400);assert.equal(fullReading,30);assert.equal(fullListening,30);assert.equal(writing,124);
 assert.equal(data.gates.length,12,'Weeks 4–48 use A/B; four final batteries use separate readiness evidence');
 for(const gate of data.gates){assert.notEqual(gate.A,gate.B);assert.equal(gate.minimumDelayHours,48);assert.equal(map.get(gate.A+'-reading')?.pool,'gate');assert.equal(map.get(gate.B+'-reading')?.pool,'gate');}
 const independent=require('./audit-independent-bank.cjs').audit(data.materials.filter(m=>m.independentBank),{courseData:data,lexical:require('./lexical-contexts.cjs').build()});assert.deepEqual(independent.errors,[],independent.errors.join('; '));
 return {status:'passed',days:365,hours:totalMinutes/60,sourceJobs:jobs.length,materials:data.materials.length,questions,questionCountBasis:'material variant instances; paired same-source questions are not additional unseen coverage',uniqueQuestionInstancesAfterPublicPairReuse:questions-sourceInputs.reusedQuestionInstances,sourceInputs,publicAudio:{providerPairedPracticeFiles:publicAudio.length,independentListeningCertification:false,sources:publicAudio},listening,writing,fullReading,fullListening,firstDraftWritingPairs:firstWriting.size/2,independentBank:{materials:independent.materials,sourceCount:independent.sourceCount,questions:independent.questions,syntheticLocales:independent.syntheticLocales,humanLocales:independent.humanLocales,humanReaders:independent.humanReaders,voiceKinds:independent.voiceKinds,figureTypes:independent.figureTypes},lexicalContexts:independent.lexical};
}
module.exports={audit,auditSourceInputs,ordinaryPublicVariant,auditPublicAudio};
if(require.main===module){const result=audit(require('../assets/curriculum-data.js'));fs.writeFileSync(path.join(root,'curriculum','release-audit.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
