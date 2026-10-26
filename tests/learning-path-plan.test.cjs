'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),B=require('../tools/build-learning-path.cjs');
const Artifact=require('./public-artifact-modes-fixture.cjs'),artifactRoot=path.resolve(process.env.PUBLIC_ARTIFACT_OUTPUT_ROOT||process.env.YEAR_BUDGET_OUTPUT_ROOT||path.join(__dirname,'..')),modes=Artifact.load({data:require(path.join(artifactRoot,'assets/curriculum-data.js')),sourceContexts:require(path.join(artifactRoot,'assets/public-context-data.js')),projectRoot:path.join(__dirname,'..')});
const loaded=B.loadInputs(root),inputs={...loaded,course:modes.actual},plan=B.buildLearningPath(inputs),copy=x=>JSON.parse(JSON.stringify(x));
const refs=d=>d.proposedAssignment.activities.flatMap(a=>a.references);
test('365 separate current/proposed rows remain inactive and never mutate current day snapshots',()=>{
 const before=B.hash(inputs.course.days),again=B.buildLearningPath(inputs);
 assert.equal(B.hash(inputs.course.days),before);assert.equal(plan.sourceDaysHash,before);
 assert.equal(plan.days.length,365);assert.equal(plan.active,false);assert.equal(plan.status,'staged-review-required');
 assert.equal(plan.summary.changedProposalDays>200,true);
 assert.equal(B.validatePlan(again,inputs).errors.length,0);
 for(const row of plan.days){assert.equal(row.currentAssignment.snapshotHash,B.hash(inputs.course.days[row.day-1]));assert.equal(row.proposedAssignment.appliesOnlyTo,'future-unstarted-versioned-day');assert.equal(row.completionOrBandCredit,false);}
 assert.deepEqual(refs(plan.days[0]).map(r=>r.materialId),inputs.course.days[0].tasks.flatMap(t=>t.materialIds));
 const prior=B.hash(inputs.course.days);again.days[0].currentAssignment.tasks[0].firstPlanned.push({materialId:'local-plan-only'});assert.equal(B.hash(inputs.course.days),prior);
});
test('actual first-study, delayed review and authored transfer are distinct rather than renamed repeats',()=>{
 const roles=new Set(plan.days.flatMap(refs).map(r=>r.role));for(const role of ['first-study','review','fluency-review','transfer','checkpoint'])assert.ok(roles.has(role));
 const repeated=plan.days.flatMap(d=>refs(d).map(r=>({day:d.day,...r}))).find(r=>r.kind==='material'&&r.role==='review'&&r.firstPlannedDay<r.day);assert.ok(repeated);
 const tampered=copy(plan),row=tampered.days.find(d=>refs(d).some(r=>r.kind==='material'&&r.role==='review'&&r.firstPlannedDay<d.day));
 refs(row).find(r=>r.kind==='material'&&r.role==='review'&&r.firstPlannedDay<row.day).role='first-study';
 assert.ok(B.validatePlan(tampered,inputs).errors.some(e=>e.includes('falsely first-study')));
 const day2=refs(plan.days[1]);for(const skill of ['grammar','vocabulary','speaking','writing'])assert.ok(day2.some(r=>r.materialId==='day02-expansion-'+skill));
 assert.ok(plan.days[2].proposedAssignment.activities.some(a=>a.skill==='reading'&&a.references.some(r=>r.role==='first-study')));
 assert.ok(plan.days[2].proposedAssignment.reviewSuggestions.some(r=>r.plannedDelayHours>=48));
});
test('no ordinary activity consumes independent, gate, final or reserved Cambridge19',()=>{
 const mm=new Map(inputs.course.materials.map(m=>[m.id,m]));
 for(const day of plan.days.filter(d=>d.kind!=='checkpoint'))for(const ref of refs(day)){
  if(ref.kind==='material')assert.equal(['independent','gate','final'].includes(mm.get(ref.materialId).pool),false);
  if(ref.kind==='textbook')assert.equal(ref.reserved,false);
 }
 assert.equal(plan.reserveCatalog.independentAndBForms,'unassigned-alternatives-only');
 const bad=copy(plan),ref=refs(bad.days[1]).find(r=>r.kind==='material');ref.materialId='independent-a1-read-1';ref.role='review';
 assert.ok(B.validatePlan(bad,inputs).errors.some(e=>e.includes('reserve independent-a1-read-1')));
 const early=copy(plan);early.days[1].proposedAssignment.alternatives=copy(plan.days.find(d=>d.proposedAssignment.alternatives.length).proposedAssignment.alternatives);
 assert.ok(B.validatePlan(early,inputs).errors.some(e=>e.includes('reserved alternatives exposed')));
});
test('every recommendation resolves to an actual material, legacy day, or verified textbook page',()=>{
 assert.equal(B.validatePlan(plan,inputs).errors.length,0);
 const bad=copy(plan);refs(bad.days[1])[0].materialId='fictional-new-title';
 assert.ok(B.validatePlan(bad,inputs).errors.some(e=>e.includes('unknown material fictional-new-title')));
 for(const row of plan.days){assert.ok(row.proposedAssignment.budget.referenceTotal<=360);assert.equal(row.proposedAssignment.budget.verifiedCapacity,false);}
 const budget=copy(plan);budget.days[1].proposedAssignment.budget.referenceSlots.extra=100;budget.days[1].proposedAssignment.budget.referenceTotal+=100;
 assert.ok(B.validatePlan(budget,inputs).errors.some(e=>e.includes('budget exceeds')));
});
test('52 actual-text estimates have literal evidence, explicit prerequisites and no calibration claim',()=>{
 assert.equal(plan.legacyLessons.length,52);assert.ok(plan.summary.legacyProposed>20);
 for(const item of plan.legacyLessons){assert.equal(item.calibrated,false);assert.equal(item.estimateKind,'AI-content-analysis');assert.ok(item.grammarPrerequisites.length);assert.ok(inputs.legacy.lessons.find(l=>l.day===item.lessonDay).text.includes(item.evidenceQuote));}
 for(const id of [6,10,12,13,25])assert.equal(plan.legacyLessons.find(l=>l.lessonDay===id).routineUse,false);
 assert.equal(plan.days.slice(0,112).flatMap(refs).some(r=>r.kind==='legacy-lesson'),false);
 const bad=copy(plan);bad.legacyLessons[0].evidenceQuote='a sentence absent from the actual source';
 assert.ok(B.validatePlan(bad,inputs).errors.some(e=>e.includes('unsupported')));
 const duplicate=copy(plan);duplicate.legacyLessons[51]=copy(duplicate.legacyLessons[0]);assert.ok(B.validatePlan(duplicate,inputs).errors.some(e=>e.includes('distinct actual days')));
});
test('textbook recommendations use only physically verified section pages and never claim listening availability',()=>{
 const selected=plan.days.flatMap(refs).filter(r=>r.kind==='textbook');assert.ok(selected.length>=20);
 const first=selected.find(r=>r.testId==='cambridge-16-test-1'&&r.skill==='reading');assert.equal(first.page,16);assert.equal(first.pageKind,'reading-start');
 assert.ok(plan.days.flatMap(d=>d.proposedAssignment.blockedCandidates).some(r=>r.testId==='cambridge-4-test-1'&&r.availability==='blocked-missing-verified-skill-page'));
 for(const day of plan.days)for(const r of [...day.proposedAssignment.blockedCandidates,...day.proposedAssignment.alternatives.flatMap(a=>a.references)])if(r.skill==='listening')assert.equal(r.availability,'blocked-missing-authentic-audio');
 assert.equal(plan.textbookCatalog.bodyIndexStatusByEdition['17'].readyForLexicalCoverage,false);
 const bad=copy(plan),book=bad.days.flatMap(refs).find(r=>r.kind==='textbook');book.page++;
 assert.ok(B.validatePlan(bad,inputs).errors.some(e=>e.includes('unverified textbook page')));
 const leak=copy(plan),bookDay=leak.days.find(d=>d.proposedAssignment.activities.some(a=>a.skill==='reading'&&a.references.some(r=>r.kind==='textbook')));delete bookDay.proposedAssignment.activities.find(a=>a.skill==='writing').releaseAfter;
 assert.ok(B.validatePlan(leak,inputs).errors.some(e=>e.includes('may leak reading answers')));
});
test('missing audio is visibly unavailable, never repaired with a synthetic readiness claim',()=>{
 const noAudio=B.buildLearningPath({...inputs,assetAvailable:()=>false});
 const listenRefs=noAudio.days.flatMap(refs).filter(r=>r.kind==='material'&&noAudio.materials[r.materialId].skill==='listening');
 assert.ok(listenRefs.length);assert.ok(listenRefs.every(r=>r.availability==='blocked-audio-unavailable'));
 assert.ok(noAudio.summary.gapCounts['referenced-listening-audio-unavailable']>0);
});
test('changed source contracts and static input digests make a staged proposal stale',()=>{
 const changed={...inputs,course:copy(inputs.course)};changed.course.days[1].tasks[0].materialIds.push('old-contract-marker');
 assert.ok(B.validatePlan(plan,changed).errors.some(e=>e.includes('snapshot mismatch')));
 const material=copy(inputs.course);material.materials.find(m=>m.id==='w01-read-1').passage+=' A changed source.';
 assert.ok(B.validatePlan(plan,{...inputs,course:material}).errors.some(e=>e.includes('changed material contract')));
 const digests={...inputs.digests,'assets/course-data.js':'changed'};assert.ok(B.validatePlan(plan,{...inputs,digests}).errors.some(e=>e.includes('stale static input')));
 const bad=copy(plan);bad.days[1].currentAssignment.tasks[0].materialIds=[];assert.ok(B.validatePlan(bad,inputs).errors.some(e=>e.includes('current assignment contents changed')));
});
test('matrix names unresolved new-input and linked-output gaps without activating year expansion',()=>{
 assert.ok(plan.summary.gapCounts['no-additional-appropriate-listening-source']>0);
 assert.ok(plan.summary.gapCounts['legacy-linked-output-not-authored-in-English']>0);
 assert.equal(plan.goal.vocabularyDailyMinimum,null);assert.equal(plan.goal.eachSkillBand,7);
 assert.equal(plan.materials['expand-w01-read-1'],undefined);
 assert.throws(()=>B.main(['--activate']),/cannot activate production/);
});
test('weekly input load uses actual bodies and file-bound seconds, never slot minutes or learner-performance claims',()=>{
 const evidence=Object.fromEntries(inputs.course.materials.filter(m=>m.skill==='listening').map(m=>[m.id,{seconds:6,status:'fixture-file-seconds',synthetic:true}]));
 const timed=B.buildLearningPath({...inputs,audioEvidence:evidence});
 const listeningReferences=timed.days.flatMap(d=>d.proposedAssignment.activities.filter(a=>a.skill==='listening').flatMap(a=>a.references)).filter(r=>r.kind==='material'&&timed.materials[r.materialId].skill==='listening').length;
 assert.equal(timed.inputLoadAudit.proposedTotal.listening.totalOnePlaySeconds,listeningReferences*6);
 assert.ok(timed.inputLoadAudit.proposedTotal.listening.newAudioSeconds<=timed.inputLoadAudit.proposedTotal.listening.totalOnePlaySeconds);
 assert.ok(timed.inputLoadAudit.proposedTotal.reading.repeatedWords>0);
 assert.ok(timed.inputLoadAudit.proposedTotal.reading.newRoutineWords<timed.inputLoadAudit.proposedTotal.reading.newWords);
 assert.ok(timed.inputLoadAudit.corpus.uniqueRoutineBodyWords<timed.inputLoadAudit.corpus.uniqueTrainingBodyWords);
 assert.ok(timed.inputLoadAudit.proposedTotal.writing.newPromptMinimumWords<timed.inputLoadAudit.proposedTotal.writing.authoredMinimumWords);
 assert.equal(timed.inputLoadAudit.weekly.length,52);
 assert.ok(timed.inputLoadAudit.proposedTotal.reading.unknownTextReferences>0,'unread textbook bodies stay unknown');
 assert.ok(timed.inputLoadAudit.proposedTotal.speaking.missingExplicitDurationReferences>0);
 assert.equal(timed.inputLoadAudit.proposedTotal.learnerProducedOutput,'not-read-not-claimed');
 assert.equal(timed.inputLoadAudit.design.status,'adjustable-design-starting-values-not-official-thresholds');
});
test('all ordinary sources are checked before reuse and phase cumulative input never silently falls below the old baseline',()=>{
 const publicIds=new Set(inputs.course.materials.filter(m=>m.source?.publicSourceId).map(m=>m.id)),expected=351+publicIds.size;
 assert.equal(plan.ordinarySourceLedger.length,expected);assert.equal(new Set(plan.ordinarySourceLedger.map(s=>s.materialId)).size,expected);
 const supplemental=plan.ordinarySourceLedger.filter(s=>publicIds.has(s.materialId));
 assert.equal(modes.legacyMaterialIds.length,75);assert.equal(modes.legacyMaterialIds.length,inputs.course.audit.publicSupplements.readingMaterials+inputs.course.audit.publicSupplements.listeningMaterials);assert.equal(publicIds.size,modes.legacyMaterialIds.length+modes.newMaterialIds.length);assert.deepEqual(supplemental.filter(s=>!modes.newMaterialIds.includes(s.materialId)).map(s=>s.materialId).sort(),modes.legacyMaterialIds.slice().sort());assert.deepEqual(supplemental.filter(s=>modes.newMaterialIds.includes(s.materialId)).map(s=>s.materialId).sort(),modes.newMaterialIds.slice().sort());assert.equal(supplemental.length,publicIds.size);
 assert.ok(supplemental.every(s=>!s.firstCurrentDay&&!s.firstProposedDay&&s.deferReason&&s.createsLearnerDebt===false),'optional sources are tracked without silently assigning them to old core days');
 assert.equal(plan.summary.ordinarySources.assigned,351);assert.equal(plan.summary.ordinarySources.pending,publicIds.size);
 assert.ok(plan.ordinarySourceLedger.every(s=>s.firstProposedDay||s.deferReason));
 assert.equal(plan.proposalRules.firstStudyWeeklyLimit,null);assert.equal(plan.proposalRules.reviewReplacesWholeDay,false);
 assert.ok(plan.cumulativeInputProtection.every(p=>p.status==='pass'));
 const first=plan.inputLoadAudit.weekly[0];assert.ok(first.proposed.reading.newRoutineWords>=first.current.reading.newRoutineWords);assert.ok(first.proposed.listening.newRoutineAudioSeconds>=first.current.listening.newRoutineAudioSeconds-.01);
 const bad=copy(plan);bad.cumulativeInputProtection[0].status='unexplained-regression';assert.ok(B.validatePlan(bad,inputs).errors.some(e=>e.includes('cumulative ordinary input regression')));
 for(const row of plan.days)for(const pending of row.proposedAssignment.pendingCandidates)assert.equal(pending.createsLearnerDebt,false);
});
test('over-budget ordinary content stays explicitly pending and a shared body across listening/reading is counted once',()=>{
 const oversized=copy(inputs.course);oversized.materials.find(m=>m.id==='w01-read-2').estimatedMinutes=200;
 const deferred=B.buildLearningPath({...inputs,course:oversized});const item=deferred.ordinarySourceLedger.find(s=>s.materialId==='w01-read-2');assert.equal(item.firstProposedDay,null);assert.equal(item.deferReason,'author-estimate-exceeds-shared-slot');assert.equal(item.createsLearnerDebt,false);
 assert.ok(deferred.cumulativeInputProtection.some(p=>p.status==='justified-deferral-requires-review'));
 const body='One shared body.',miniCourse={materials:[{id:'r',pool:'training',skill:'reading',passage:body},{id:'l',pool:'training',skill:'listening',transcript:body}]};
 const mini={days:[{day:1,week:1,phaseId:'foundation',currentAssignment:{tasks:[{skill:'reading',materialIds:['r']},{skill:'listening',materialIds:['l']}]},proposedAssignment:{activities:[{skill:'reading',references:[{kind:'material',materialId:'r'}]},{skill:'listening',references:[{kind:'material',materialId:'l'}]}]}}]};
 const audit=B.inputLoadAudit(mini,{course:miniCourse,legacy:{lessons:[]},policy:inputs.policy,audioEvidence:{l:{seconds:10,synthetic:true}}});
 assert.equal(audit.proposedTotal.combinedNewTextWords,3);assert.equal(audit.proposedTotal.reading.newWords+audit.proposedTotal.listening.newTranscriptWords,3);assert.equal(audit.proposedTotal.listening.totalOnePlaySeconds,10);
});
test('public source catalog is optional and maps only explicit candidate level/prerequisites, with zero automatic coverage credit',()=>{
 const empty=B.normalizePublicSupplementPool(null,inputs.policy);assert.equal(empty.status,'pending-source-collection');assert.equal(empty.sources.length,0);
 const raw={schema:1,sources:[{sourceId:'fixture-public-source',version:'1',contentHash:'a'.repeat(64),kind:'reading',level:{label:'A1-A2',calibrated:false},phaseIds:['everyday'],prerequisiteCapabilityIds:['foundation:reading'],rights:{status:'fixture-only'},text:{path:'fixture-not-published.txt',sha256:'b'.repeat(64)}}]};
 const pool=B.normalizePublicSupplementPool(raw,inputs.policy);assert.equal(pool.sources[0].level.label,'A1–A2');assert.equal(pool.automaticScheduling,false);assert.equal(pool.sources[0].headwordCoverageCredit,0);assert.equal(pool.sources[0].countedInInputAudit,false);
 const bad=copy(raw);bad.sources[0].prerequisiteCapabilityIds=['fictional:level'];assert.throws(()=>B.normalizePublicSupplementPool(bad,inputs.policy),/Unknown public prerequisite/);
 const hashless=copy(raw);hashless.sources[0].contentHash='';assert.throws(()=>B.normalizePublicSupplementPool(hashless,inputs.policy),/version\/contentHash/);
});


test('the pinned default75 learning-path ledger stays separate from actual signed additions',()=>{
 const legacy=B.buildLearningPath({...inputs,course:modes.legacy}),publicRows=legacy.ordinarySourceLedger.filter(s=>modes.legacyMaterialIds.includes(s.materialId));assert.equal(modes.legacy.materials.length,1823);assert.equal(legacy.ordinarySourceLedger.length,351+75);assert.equal(publicRows.length,75);assert.equal(legacy.summary.ordinarySources.assigned,351);assert.equal(legacy.summary.ordinarySources.pending,75);assert.ok(publicRows.every(s=>s.deferReason&&s.createsLearnerDebt===false));assert.equal(plan.ordinarySourceLedger.length,351+modes.expected.publicVariants);for(const id of modes.newMaterialIds){const row=plan.ordinarySourceLedger.find(s=>s.materialId===id);assert.ok(row);assert.equal(row.firstCurrentDay,null);assert.equal(row.firstProposedDay,null);assert.ok(row.deferReason);assert.equal(row.createsLearnerDebt,false);}
});
