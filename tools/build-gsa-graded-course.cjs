'use strict';
// Explicit, independently reviewed ordinary-reading composition. Default builds
// never import this module or read its catalog. It creates no learner evidence.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Compiler=require('./build-public-supplement-materials.cjs');
const SOURCE_IDS=Object.freeze(['gsa-plain-language-02','gsa-plain-language-03','gsa-plain-language-08','gsa-plain-language-07','gsa-plain-language-06']);
const PREFIX='curriculum/gsa-graded-course/',TEXT_PREFIX='materials/public/gsa-graded-course/';
const sha=value=>crypto.createHash('sha256').update(value).digest('hex'),copy=value=>JSON.parse(JSON.stringify(value));
function check(value,message){if(!value)throw Error('GSA graded course: '+message);}
function safeFile(root,relative){
 check(typeof relative==='string'&&relative.length<300&&!relative.includes('\\')&&!relative.includes('\0')&&!path.posix.isAbsolute(relative)&&!relative.split('/').some(p=>!p||p==='.'||p==='..')&&!/[:?#]/.test(relative),'unsafe path');
 check(relative.startsWith(PREFIX)||relative.startsWith(TEXT_PREFIX),'file outside the dedicated source package');
 const base=fs.realpathSync(root),target=path.resolve(base,relative),rel=path.relative(base,target);check(rel&&!rel.startsWith('..')&&!path.isAbsolute(rel),'path escaped root');
 const real=fs.realpathSync(target),realRel=path.relative(base,real);check(realRel&&!realRel.startsWith('..')&&!path.isAbsolute(realRel),'symlink escaped root');check(realRel.replace(/\\/g,'/').startsWith(relative.startsWith(PREFIX)?PREFIX:TEXT_PREFIX),'symlink escaped dedicated package');return real;
}
function readRef(root,ref,maxBytes=1024*1024){
 check(ref&&/^[a-f0-9]{64}$/.test(ref.sha256),'missing SHA256 reference');const target=safeFile(root,ref.path),size=fs.statSync(target).size;check(size>0&&size<=maxBytes,'source file exceeds size limit');
 const bytes=fs.readFileSync(target);check(sha(bytes)===ref.sha256,'file hash mismatch: '+ref.path);if(ref.bytes!==undefined)check(ref.bytes===bytes.length,'file byte count mismatch');return bytes;
}
function jsonRef(root,ref,maxBytes){return JSON.parse(readRef(root,ref,maxBytes));}
function normalizeDisplay(original){return original.replace(/\s*\{:\s*\.[A-Za-z0-9_-]+\s*\}/g,'').replace(/ - (?=[A-Z])/g,'\n- ');}
function questionValidationView(pack){
 const view=copy(pack);for(const q of view.questions||[])if(q.answerAliases!==undefined||q.sourceCanonicalAnswers!==undefined){
  check(pack.sourceId==='gsa-plain-language-03'&&q.id==='q4'&&q.type==='fill'&&q.answerAliasPolicy==='punctuation-only-reviewed','unexpected answer alias policy');
  check(JSON.stringify(q.sourceCanonicalAnswers)===JSON.stringify(['The U.S. Courts','U.S. Courts'])&&JSON.stringify(q.answerAliases)===JSON.stringify(['The US Courts','US Courts']),'unreviewed punctuation alias');
  check(JSON.stringify(q.answers)===JSON.stringify([...q.sourceCanonicalAnswers,...q.answerAliases]),'answer alias roster changed');
  for(const alias of q.answerAliases)check(q.sourceCanonicalAnswers.some(answer=>answer.replace(/\./g,'')===alias),'alias changes more than abbreviation punctuation');
  q.answers=[...q.sourceCanonicalAnswers];
 }return view;
}
function validatePack(source,text,pack,A){
 const issues=Compiler.validateQuestionSet(source,text,questionValidationView(pack),A);check(issues.length===0,source.sourceId+': '+issues.join('; '));
 check(pack.questions.length===6&&pack.questions.every(q=>q.eligibleModalities.length===1&&q.eligibleModalities[0]==='reading'),'exactly six reading-only questions required');
 check(pack.questions.every(q=>q.answers.every(a=>!q.maxWords||A.countWords(a)<=q.maxWords)),'answer alias exceeds word limit');
 check(pack.questions.every(q=>q.explanation&&(!q.options||q.options.every(option=>q.explanation.includes(option)))),'student explanation omits option-specific feedback');
}
function validateContexts(contexts,catalog,texts,originals,semanticReceipt,semanticHash){
 check(contexts.schema===1&&contexts.masteryEvidence===false&&contexts.sources.length===5,'invalid source context contract');
 const approvals=new Map((semanticReceipt.entries||[]).map(e=>[e.id,e]));let words=0;
 for(const source of catalog.sources){const ctx=contexts.sources.find(c=>c.sourceId===source.sourceId),text=texts.get(source.sourceId);check(ctx&&ctx.sourceTextSha256===source.text.sha256,'context source hash changed');
  check(ctx.grammar.length===2&&ctx.grammar.every(g=>Number.isInteger(g.start)&&Number.isInteger(g.end)&&text.slice(g.start,g.end)===g.quote&&g.explanation),'grammar span is not exact');
  for(const word of ctx.words){const proof=word.semanticApprovalReference,accepted=approvals.get(proof?.entryId),originalStart=Number(/:(\d+)$/.exec(proof?.entryId||'')?.[1]),original=originals.get(source.sourceId);check(Number.isInteger(word.start)&&Number.isInteger(word.end)&&text.slice(word.start,word.end)===word.surface,'word surface span is not exact');
   check(accepted&&accepted.decision==='semantic-accept'&&accepted.word===word.word&&accepted.bindingSha256===proof.bindingSha256&&proof.rootReceiptSha256===semanticHash&&accepted.sourceTextSha256===source.originalFrozenText.sha256&&proof.originalSourceTextSha256===source.originalFrozenText.sha256&&proof.displaySourceTextSha256===source.text.sha256,'word loses the signed semantic/source binding');words++;
   check(Number.isInteger(originalStart)&&original.slice(originalStart,originalStart+word.surface.length)===word.surface&&normalizeDisplay(original.slice(0,originalStart)).length===word.start,'word moved away from its approved source occurrence');
  }
 }
 check(words===18,'the reviewed eighteen lexical anchors must be preserved');
}
function load({root=path.join(__dirname,'..'),releasePath}={}){
 check(typeof releasePath==='string'&&releasePath.startsWith(PREFIX),'an explicit root-relative reviewed release is required');
 const releaseFile=safeFile(root,releasePath),releaseBytes=fs.readFileSync(releaseFile);check(releaseBytes.length<=1024*1024,'oversized release');const release=JSON.parse(releaseBytes);
 check(release.schema===1&&release.id==='gsa-graded-reading-v87'&&release.status==='independently-reviewed-reading-practice'&&release.use==='ordinary-required-reading-only'&&release.readingApproved===true,'reading release not independently approved');
 check(JSON.stringify(release.sourceIds)===JSON.stringify(SOURCE_IDS)&&release.independentAssessmentEligible===false&&release.independentTransferEligible===false&&release.lexicalActivation===false,'release widens its approved scope');
 const catalog=jsonRef(root,release.catalog),contexts=jsonRef(root,release.contexts),blind=jsonRef(root,release.blindPacket),answers=jsonRef(root,release.blindAnswers),approval=jsonRef(root,release.rootReview),semantic=jsonRef(root,release.semanticReceipt),A=require(path.join(root,'assets/assessment-core.js'));
 check(catalog.sources.length===5&&JSON.stringify(catalog.sources.map(s=>s.sourceId))===JSON.stringify(SOURCE_IDS),'source roster changed');
 check(approval.readingApproved===true&&approval.decision==='approved-reading-only-practice'&&approval.reviewer==='root-independent'&&approval.reviewStatus==='root-ai-blind-and-explanation-reviewed-not-human'&&approval.blindPacketSha256===release.blindPacket.sha256&&approval.authorAnswersOpenedAfterBlind===true&&approval.sourceContextRuntimeActivationApproved===false,'independent final approval missing');
 check(answers.inputSha256===release.blindPacket.sha256&&semantic.packetSha256===release.semanticPacketSha256&&semantic.summary.acceptedSemanticPairs===42,'upstream review binding changed');
 check(approval.finalQuestionPacks&&approval.normalizationApproved===true&&approval.explanationsApproved===true&&approval.grammarApproved===true&&approval.licenseApproved===true&&approval.catalogSha256===release.catalog.sha256&&approval.sourceContextsSha256===release.contexts.sha256,'final text/explanation/license review incomplete');
 check(release.sources.length===5&&new Set(release.sources.map(s=>s.sourceId)).size===5,'released source contracts changed');
 const texts=new Map(),originals=new Map(),materials=[];let answerCount=0;
 for(const source of catalog.sources){
  const id=source.sourceId,contract=release.sources.find(s=>s.sourceId===id),blindSource=blind.sources.find(s=>s.sourceId===id),approvedSource=approval.sources.find(s=>s.sourceId===id);check(contract&&blindSource&&approvedSource,'missing reviewed source');
  const text=readRef(root,source.text).toString('utf8'),original=readRef(root,source.originalFrozenText).toString('utf8');
  check(text===normalizeDisplay(original)&&source.normalization.originalFrozenSha256===source.originalFrozenText.sha256&&source.normalization.displaySha256===source.text.sha256&&source.contentHash===source.text.sha256,'unapproved source normalization');
  check(blindSource.text===text&&blindSource.sourceTextSha256===source.text.sha256&&blindSource.originalFrozenSourceTextSha256===source.originalFrozenText.sha256&&JSON.stringify(blindSource.normalization)===JSON.stringify(source.normalization),'blind passage or normalization changed');
  check(source.kind==='reading'&&source.level.label==='B1–B2'&&source.level.calibrated===false&&source.usage.practiceOnly===true&&source.coursePolicy.appendOnly===true&&source.coursePolicy.requiredDailyOnly===true,'source must remain ordinary appended reading');
  check(Number.isFinite(source.estimatedStudyMinutes)&&source.estimatedStudyMinutes>=20&&source.estimatedStudyMinutes<=30,'invalid complete-unit reference duration');
  check(source.rights.license==='CC0-1.0'&&source.rights.thirdPartyImagesIncluded===false&&source.rights.externalAudioIncluded===false,'unapproved source media or license');
  readRef(root,{path:source.rights.licenseEvidencePath,sha256:source.rights.licenseSha256});
  const pack=jsonRef(root,contract.questions),authorHash=pack.review?.blindComparison?.authorQuestionPackSha256;check(authorHash===approval.finalQuestionPacks[id]&&contract.authorQuestionPackSha256===authorHash&&pack.review?.blindComparison?.rootReviewSha256===release.rootReview.sha256,'final author pack is not approved');
  check(approvedSource.decision==='approved-reading-only-practice'&&approvedSource.normalizationVerified===true&&approvedSource.sourceTextSha256===source.text.sha256&&approvedSource.originalFrozenSourceTextSha256===source.originalFrozenText.sha256&&approvedSource.authorQuestionPackSha256===authorHash&&approvedSource.approvedQuestionsSha256===sha(JSON.stringify(pack.questions))&&approvedSource.approvedGrammarEvidenceSha256===sha(JSON.stringify(source.grammarEvidence)),'signed source/question/grammar arrays changed');
  const pending=copy(pack);pending.releaseStatus='author-text-evidence-checked-blind-review-pending';pending.review.blindComparison={status:'pending-independent-review',questionCount:6,blindInputSha256:Compiler.blindInputHash(source,text,pack)};
  check(sha(JSON.stringify(pending,null,2)+'\n')===authorHash,'author pack bytes changed after independent review');
  validatePack(source,text,pack,A);check(Compiler.questionContractHash(pack)===contract.questionContractHash,'released question contract changed');
  check(Compiler.blindInputHash(source,text,pack)===blindSource.blindInputSha256&&JSON.stringify(Compiler.blindPayload(source,text,pack.questions).questions)===JSON.stringify(blindSource.questions),'blind questions changed');
  for(const q of pack.questions){check(A.gradeQuestion(q,answers.answers?.[id]?.[q.id]).correct&&answers.answers?.[id]?.[q.id]===approvedSource.answers[q.id],'independent answer disagrees: '+id+'/'+q.id);answerCount++;}
  const material=Compiler.sourceMaterial(source,text,pack,'reading',{eligible:false,eligibleForPractice:false,status:'reading-only-no-audio',audioReviewStatus:'not-applicable-reading-only',reasons:['No listening material or audio is released.']});
  material.estimatedMinutes=source.estimatedStudyMinutes;material.source.coursePolicy=copy(source.coursePolicy);material.source.originalFrozenTextSha256=source.originalFrozenText.sha256;material.source.normalization=copy(source.normalization);material.source.gradedCourseRelease={id:release.id,sha256:sha(releaseBytes)};
  material.source.contentHash=Compiler.hash({instructions:material.instructions,passage:material.passage,transcript:material.transcript,questions:material.questions});
  texts.set(id,text);originals.set(id,original);materials.push(material);
 }
 check(answerCount===30,'independent answers incomplete');validateContexts(contexts,catalog,texts,originals,semantic,release.semanticReceipt.sha256);
 return{schema:1,release,releaseSha256:sha(releaseBytes),catalog,sourceContexts:contexts,materials,audit:{schema:1,status:'independently-reviewed-ordinary-reading-only',sources:5,materials:5,questions:30,estimatedStudyMinutes:materials.reduce((n,m)=>n+m.estimatedMinutes,0),readingOnly:true,appendOnly:true,lexicalActivation:false,independentAssessmentEligible:false,independentTransferEligible:false,meaning:'Source anchors retain signed semantics, including listed inflections; no word lesson, sense audio, completion, memory or mastery is created by composition.',blindPacketSha256:release.blindPacket.sha256,rootReviewSha256:release.rootReview.sha256,releaseSha256:sha(releaseBytes)}};
}
function appendToCurriculum(data,{root,releasePath,sourceContexts}={}){
 check(data&&Array.isArray(data.days)&&Array.isArray(data.materials)&&Array.isArray(sourceContexts?.sources),'existing curriculum and public context catalog required');
 const result=load({root,releasePath}),ids=new Set(data.materials.map(m=>m.id)),sourceIds=new Set(sourceContexts.sources.map(s=>s.sourceId));
 check(result.materials.every(m=>!ids.has(m.id))&&result.sourceContexts.sources.every(s=>!sourceIds.has(s.sourceId)),'duplicate existing source/material');
 // All validation and merging precede the single append. Existing days, material
 // contracts, context records, drafts and learner state are never rewritten.
 const merged={...copy(sourceContexts),sources:[...copy(sourceContexts.sources),...copy(result.sourceContexts.sources)],supplementalReleases:[...(sourceContexts.supplementalReleases||[]),{id:result.release.id,sha256:result.releaseSha256,sourceIds:[...SOURCE_IDS],semanticReceiptSha256:result.release.semanticReceipt.sha256,lexicalActivation:false}]};
 data.materials.push(...result.materials);data.audit??={};data.audit.gsaGradedCourse=result.audit;
 return{...result,baseSourceContexts:sourceContexts,sourceContexts:merged};
}
function addCoverageReference(base,result){return{...base,supplementalSourceAudit:{releaseId:result.release.id,releaseSha256:result.releaseSha256,sourceCount:5,signedSemanticAnchors:18,newlyTaught:0,masteryCredit:0,scope:'New GSA anchors are not added to the older orthographic audit counts. Signed sense approval is not enrollment or learner evidence.'}};}
function planReceipt(result,plan){
 const ids=new Set(result.materials.map(m=>m.id)),assignments=plan.assignments.filter(a=>ids.has(a.materialId));
 check(assignments.length===5&&new Set(assignments.map(a=>a.materialId)).size===5&&assignments.every(a=>a.required===true&&a.mode==='practice'&&a.strategy==='append-within-task-budget'&&a.replaceMaterialIds.length===0&&a.levelEligibility.minimumPracticeLevel==='B2'&&a.day>=169&&a.day<365&&a.dayBudget.after.totalMinutes<=360),'all five readings need safe required appended future-day assignments');
 const sources=new Set(SOURCE_IDS);return{...result.audit,publicPlanHash:plan.planHash,status:'required-reading-blueprint-with-runtime-readiness-guards',assignments:copy(assignments),plannedContextReviews:copy(plan.reviews.filter(r=>sources.has(r.sourceId))),pendingContextReviews:copy(plan.reviewBlocked.filter(r=>sources.has(r.sourceId))),lexicalRuntimeStatus:'not-activated; approved mappings only',grammarRuntimeStatus:'context examples planned; separate real submissions still required',independentAssessmentEligible:false,independentTransferEligible:false,learnerOutcomeEvidenceCreated:0};
}
module.exports={SOURCE_IDS,sha,safeFile,readRef,normalizeDisplay,questionValidationView,validatePack,validateContexts,load,appendToCurriculum,addCoverageReference,planReceipt};
