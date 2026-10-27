'use strict';
// Explicit authoring admission; this module is not loaded by learner pages.
// The original source, labelled teaching adaptation, questions and reviews have
// separate exact references. No audio, new word lesson or learner score is made.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PREFIX='curriculum/ordinary-reading-v92/';
const SOURCE_IDS=Object.freeze(['bls-athletes','bls-musicians','nimh-psychotherapies','nhgri-dna','nist-atomic-television','cbo-budget-2025']);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),copy=v=>JSON.parse(JSON.stringify(v));
function check(v,message){if(!v)throw Error('Ordinary reading release: '+message);}
function safeFile(root,relative){
 check(typeof relative==='string'&&relative.startsWith(PREFIX)&&relative.length<400&&!relative.includes('\\')&&!relative.includes('\0')&&!/[:?#]/.test(relative)&&!path.posix.isAbsolute(relative)&&!relative.split('/').some(p=>!p||p==='.'||p==='..'),'unsafe package path');
 const base=fs.realpathSync(root),file=fs.realpathSync(path.resolve(base,relative)),rel=path.relative(base,file).replace(/\\/g,'/');
 check(rel.startsWith(PREFIX)&&!path.isAbsolute(rel),'package symlink escaped its dedicated directory');
 check(fs.statSync(file).isFile(),'reference is not a file');return file;
}
function readRef(root,ref){
 check(ref&&typeof ref.path==='string'&&/^[a-f0-9]{64}$/.test(ref.sha256),'missing pinned reference');
 const relative=ref.path.startsWith(PREFIX)?ref.path:PREFIX+ref.path,file=safeFile(root,relative),size=fs.statSync(file).size;
 check(size>0&&size<=2*1024*1024,'oversized or empty source reference');const b=fs.readFileSync(file);
 check(sha(b)===ref.sha256,'reference hash mismatch: '+relative);if(ref.bytes!==undefined)check(ref.bytes===b.length,'reference length mismatch');return b;
}
function jsonRef(root,ref){return JSON.parse(readRef(root,ref));}
function spanMatches(text,start,end,quote){return Number.isInteger(start)&&Number.isInteger(end)&&start>=0&&end>start&&end<=text.length&&text.slice(start,end)===quote;}
function replayEdits(original,adaptation){
 check(adaptation&&adaptation.inputSha256===sha(original)&&Array.isArray(adaptation.edits),'adaptation input changed');
 let previous=0,out='';for(const edit of adaptation.edits){
  check(Number.isInteger(edit.startUtf16)&&Number.isInteger(edit.endUtf16)&&edit.startUtf16>=previous&&edit.endUtf16>=edit.startUtf16&&edit.endUtf16<=original.length&&typeof edit.after==='string'&&typeof edit.reason==='string'&&edit.reason,'overlapping or invalid adaptation edit');
  check(original.slice(edit.startUtf16,edit.endUtf16)===edit.before,'adaptation original span changed');
  out+=original.slice(previous,edit.startUtf16)+edit.after;previous=edit.endUtf16;
 }out+=original.slice(previous);check(sha(out)===adaptation.outputSha256,'adaptation output changed');return out;
}
function deriveAuthorMaterial(author){
 const material=copy(author),id=material.source?.publicSourceId;check(SOURCE_IDS.includes(id),'unknown author source');let revised=false;
 if(id==='bls-athletes'){
  const q=material.questions.find(q=>q.id==='q4');check(q?.prompt==='Choose TRUE, FALSE or NOT GIVEN: Some professional athletes may have to travel internationally for competitions.','travel-question author wording changed');
  q.prompt='Choose TRUE, FALSE or NOT GIVEN: Some athletes may have to travel internationally for competitions.';revised=true;
 }
 if(id==='cbo-budget-2025'){
  const q=material.questions.find(q=>q.id==='q3'),before='These的先行内容',after='Those increases的先行内容';
  check(q?.explanation?.includes(before)&&q.distractorReasons?.[1]?.includes(before),'demonstrative-question author explanation changed');
  q.explanation=q.explanation.replace(before,after);q.distractorReasons[1]=q.distractorReasons[1].replace(before,after);revised=true;
 }
 material.source.verification='reviewed';material.source.normalization.officialVerbatim=false;
 if(revised){check(material.version==='t1-q1'&&material.source.questionSetVersion==='1'&&material.source.questionSetId.endsWith('-q1'),'unexpected author question version');material.version='t1-q2';material.source.questionSetVersion='2';material.source.questionSetId=material.source.questionSetId.replace(/-q1$/,'-q2');}
 material.source.questionContractHash=sha(JSON.stringify(material.questions));material.source.contentHash=require('./build-public-supplement-materials.cjs').hash({instructions:material.instructions,passage:material.passage,transcript:material.transcript,questions:material.questions});
 return material;
}
function load({root=path.resolve(__dirname,'..'),releasePath}={}){
 check(typeof releasePath==='string'&&releasePath.startsWith(PREFIX),'an explicit root-relative reviewed release is required');
 const releaseBytes=fs.readFileSync(safeFile(root,releasePath)),release=JSON.parse(releaseBytes);
 check(release.schema===1&&release.id==='ordinary-reading-v92'&&release.status==='reviewed-ordinary-reading-only'&&release.readingApproved===true&&release.use==='ordinary-required-reading-only','release is not approved');
 check(release.independentAssessmentEligible===false&&release.independentTransferEligible===false&&release.lexicalActivation===false&&release.audioActivation===false,'release exceeds reading-practice scope');
 check(JSON.stringify(release.sourceIds)===JSON.stringify(SOURCE_IDS)&&release.sources?.length===6,'source roster changed');
 const review=jsonRef(root,release.rootReview),contexts=jsonRef(root,release.contexts),A=require(path.join(root,'assets/assessment-core.js')),Planner=require(path.join(root,'assets/public-course-planner.js'));
 check(review.schema===1&&review.decision==='approved-ordinary-reading-only'&&review.reviewer==='root-ai-not-human'&&review.independentQuestionsReviewed===true&&review.textAndAdaptationsReviewed===true&&review.explanationsReviewed===true&&review.rightsReviewed===true,'incomplete root review');
 check(review.contextsSha256===release.contexts.sha256&&review.approvedSources?.length===6,'reviewed context/source roster changed');
 readRef(root,review.independentReview);readRef(root,review.blindReadingNotes);readRef(root,review.sourceReview);
 check(contexts.schema===1&&contexts.masteryEvidence===false&&contexts.sources?.length===6,'invalid exact context catalog');
 const materials=[],catalog=[],seen=new Set();let questionCount=0;
 for(const id of SOURCE_IDS){
  const contract=release.sources.find(s=>s.sourceId===id),approved=review.approvedSources.find(s=>s.sourceId===id);check(contract&&approved&&!seen.has(id),'missing or duplicate source');seen.add(id);
  const source=jsonRef(root,contract.source),material=jsonRef(root,contract.material),authorMaterial=jsonRef(root,contract.authorMaterial),ctx=contexts.sources.find(s=>s.sourceId===id);
  const expected=deriveAuthorMaterial(authorMaterial);
  check(Planner.hash(expected)===Planner.hash(material)&&approved.authorMaterialSha256===contract.authorMaterial.sha256,'material changed beyond the separately reviewed version-two fixes and admission/excerpt-scope flags');
  check(source.id===id&&approved.sourceMetadataSha256===contract.source.sha256&&approved.materialSha256===contract.material.sha256,'source/material bytes not independently approved');
  const original=readRef(root,source.original).toString('utf8'),selected=readRef(root,source.selected).toString('utf8'),text=readRef(root,source.teaching).toString('utf8');readRef(root,source.raw);
  check(source.priorSourceSegments?.length>0,'original extraction segments missing');let reconstructed='';
  for(const s of source.priorSourceSegments){check(Number.isInteger(s.sourceStartUtf16)&&Number.isInteger(s.sourceEndUtf16)&&s.sourceStartUtf16>=0&&s.sourceEndUtf16>=s.sourceStartUtf16&&s.sourceEndUtf16<=original.length,'invalid source selection');const part=original.slice(s.sourceStartUtf16,s.sourceEndUtf16);check(sha(part)===s.sha256,'original extraction hash changed');reconstructed+=(reconstructed?'\n\n':'')+part;}
  check(selected===reconstructed+'\n','selection is not exact original segments');
  check(replayEdits(selected,source.adaptation)===text,'unlabelled or altered teaching adaptation');
  check(source.levelCalibrated===false&&source.estimatedMinutes>=20&&source.estimatedMinutes<=35&&typeof source.attribution==='string'&&source.attribution.includes(source.sourceUrl)&&/^https:\/\//.test(source.sourceUrl),'level, duration or attribution contract changed');
  check(Array.isArray(source.rights)&&source.rights.length>0,'source reuse evidence missing');for(const ref of source.rights)readRef(root,ref);
  check(material.skill==='reading'&&material.type==='reading'&&material.pool==='training'&&material.passage===text&&material.level===source.level&&material.estimatedMinutes===source.estimatedMinutes&&Planner.validPublic(material)===null,'material is not the reviewed complete reading');
  check(material.source.publicSourceId===id&&material.source.exposureGroup==='public-source:'+id&&material.source.coursePolicy?.appendOnly===true&&material.source.sourceTextSha256===source.teaching.sha256,'source identity or ordinary exposure changed');
  check(JSON.stringify(material.source.contentHashFields)===JSON.stringify(['instructions','passage','transcript','questions'])&&material.source.contentHash===sha(JSON.stringify(Object.fromEntries(material.source.contentHashFields.map(k=>[k,material[k]]))))&&material.source.questionContractHash===sha(JSON.stringify(material.questions)),'declared source content/question hash closure changed');
  check(!material.audio&&!material.transcript&&material.fullTest!==true&&material.independentBank!==true&&!material.form&&!material.assessmentGroup,'reading imports audio or assessment scope');
  check(Array.isArray(material.questions)&&material.questions.length===8&&new Set(material.questions.map(q=>q.id)).size===8,'exact eight-question roster required');
  check(sha(JSON.stringify(material.questions))===approved.questionsSha256&&A.materialContentHash(material)===approved.materialContentHash,'approved teaching/question contract changed');
  for(const q of material.questions){
   check(['single','short'].includes(q.type)&&typeof q.prompt==='string'&&/[A-Za-z]/.test(q.prompt)&&!/[\u3400-\u9fff]/.test(q.prompt)&&Array.isArray(q.answers)&&q.answers.length>0&&q.answers.every(a=>typeof a==='string'&&A.gradeQuestion(q,a).correct),'invalid English question or accepted answer');
   check(q.explanation&&q.evidence&&q.evidenceOffsets?.unit==='UTF-16-code-unit','explanation/source evidence missing');
   if(q.type==='single')check(Array.isArray(q.options)&&q.options.length>=3&&q.options.every(o=>typeof o==='string'&&!/[\u3400-\u9fff]/.test(o))&&q.answers.every(a=>q.options.includes(a)),'single-choice options changed');
   else check(Number.isInteger(q.maxWords)&&q.maxWords>=1&&q.maxWords<=3&&q.answers.every(a=>A.countWords(a)<=q.maxWords&&text.toLowerCase().includes(a.toLowerCase())),'short answer not located or over word limit');
   const span=q.evidenceSpan;check(span&&span.unit==='utf16'&&span.start===q.evidenceOffsets.start&&span.end===q.evidenceOffsets.end&&spanMatches(text,span.start,span.end,q.evidence)&&sha(q.evidence)===span.textSha256,'question evidence span changed');questionCount++;
  }
  check(ctx&&ctx.sourceTextSha256===source.teaching.sha256&&ctx.grammar?.length===2&&ctx.words?.length>=3&&ctx.words.length<=5,'context contract missing');
  check(sha(JSON.stringify(ctx))===approved.contextSha256,'reviewed grammar/word contexts changed');
  for(const g of ctx.grammar)check(spanMatches(text,g.start,g.end,g.quote)&&g.explanation&&g.tag&&g.evidenceOffsets?.start===g.start&&g.evidenceOffsets?.end===g.end&&g.evidenceSha256===sha(g.quote),'grammar source span changed');
  for(const w of ctx.words)check(spanMatches(text,w.start,w.end,w.surface)&&typeof w.word==='string'&&w.word&&spanMatches(text,w.quoteStartUtf16,w.quoteEndUtf16,w.quote)&&w.quoteStartUtf16<=w.start&&w.quoteEndUtf16>=w.end&&sha(w.quote)===w.quoteSha256,'word location changed');
  catalog.push(source);materials.push(material);
 }
 check(questionCount===48,'reviewed answer count changed');
 return{release,releaseSha256:sha(releaseBytes),sourceContexts:contexts,catalog,materials,audit:{schema:1,status:'reviewed-ordinary-reading-only',sources:6,materials:6,questions:48,readingWords:catalog.reduce((n,s)=>n+s.teaching.wordCount,0),estimatedStudyMinutes:materials.reduce((n,m)=>n+m.estimatedMinutes,0),rootReviewSha256:release.rootReview.sha256,releaseSha256:sha(releaseBytes),lexicalActivation:false,audioActivation:false,independentAssessmentEligible:false,independentTransferEligible:false,learnerOutcomeEvidenceCreated:0}};
}
function appendToCurriculum(data,{root,releasePath,sourceContexts}={}){
 const result=load({root,releasePath}),ids=new Set(data.materials.map(m=>m.id)),sources=new Set(sourceContexts.sources.map(s=>s.sourceId));
 check(result.materials.every(m=>!ids.has(m.id))&&result.sourceContexts.sources.every(s=>!sources.has(s.sourceId)),'duplicate prior source or material');
 const merged={...copy(sourceContexts),sources:[...copy(sourceContexts.sources),...copy(result.sourceContexts.sources)],supplementalReleases:[...(sourceContexts.supplementalReleases||[]),{id:result.release.id,sha256:result.releaseSha256,sourceIds:[...SOURCE_IDS],lexicalActivation:false,audioActivation:false}]};
 data.materials.push(...result.materials);data.audit??={};data.audit.ordinaryReading=result.audit;return{...result,baseSourceContexts:sourceContexts,sourceContexts:merged};
}
function planReceipt(result,plan){
 const ids=new Set(result.materials.map(m=>m.id)),assignments=plan.assignments.filter(a=>ids.has(a.materialId));
 check(assignments.length===6&&new Set(assignments.map(a=>a.materialId)).size===6&&assignments.every(a=>a.required&&a.mode==='practice'&&a.strategy==='append-within-task-budget'&&a.replaceMaterialIds.length===0&&a.day>=169&&a.day<365&&a.dayBudget.after.totalMinutes<=360),'all six readings require complete safe future slots');
 for(const a of assignments){const s=result.catalog.find(s=>s.id===a.sourceId);check(s&&Array.isArray(s.suggestedWindow)&&a.day>=s.suggestedWindow[0]&&a.day<=s.suggestedWindow[1],'static assignment outside the reviewed suggested course window');}
 return{...result.audit,publicPlanHash:plan.planHash,status:'required-reading-blueprint-with-profile-and-level-guards',assignments:copy(assignments),plannedContextReviews:copy(plan.reviews.filter(r=>SOURCE_IDS.includes(r.sourceId))),pendingContextReviews:copy(plan.reviewBlocked.filter(r=>SOURCE_IDS.includes(r.sourceId))),courseIndexWindows:'Static authoring search references only; not runtime prerequisites or calendar evidence of ability. Existing profile guards may move suitable unstarted work earlier or later according to actual verified level, prerequisites, history and capacity.',meaning:'Author levels and minutes are uncalibrated planning references. Actual history, entry level, due reviews, current Pomodoro state and remaining total time decide admission; incomplete work remains pending.'};
}
module.exports={SOURCE_IDS,PREFIX,sha,safeFile,readRef,spanMatches,replayEdits,deriveAuthorMaterial,load,appendToCurriculum,planReceipt};
