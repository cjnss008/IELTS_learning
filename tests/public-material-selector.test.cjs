'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const S=require('../assets/public-material-selector.js'),B=require('../tools/build-public-supplement-materials.cjs');
const root=path.join(__dirname,'..'),compiled=B.load({root,requireComplete:true,practiceOnly:true,sourceIds:B.FIRST_BATCH_IDS});
const base={skill:'reading',mode:'practice',phaseId:'foundation',skillLevels:{reading:'A1',listening:'A0'},verifiedCapabilities:['foundation:reading'],currentGrammarTags:['be-present','place-prepositions'],remainingMinutes:90,dueReviewMinutes:15,breakReserveMinutes:10};
const clone=v=>JSON.parse(JSON.stringify(v));
test('practice-only compilation provides 17 reading and 13 provider-paired listening units without independent scoring credit',()=>{
 assert.equal(compiled.materials.length,30);assert.equal(compiled.audit.readingMaterials,17);assert.equal(compiled.audit.listeningMaterials,13);assert.equal(compiled.blockedMaterials.length,1);assert.equal(compiled.blockedMaterials[0].sourceId,'voa-l1-24');
 for(const m of compiled.materials){assert.equal(m.source.practiceOnly,true);assert.equal(m.source.independentAssessmentEligible,false);assert.equal(m.source.independentTransferEligible,false);if(m.skill==='listening'){assert.equal(m.source.audioReadiness.eligibleForPractice,true);assert.equal(m.source.audioReviewStatus,'provider-paired-not-independently-reviewed');assert.ok(m.audio);}}
 assert.equal(B.load({root,requireComplete:true,sourceIds:B.FIRST_BATCH_IDS}).materials.length,17);
});
test('derived reading and listening use their own modality prerequisites and retain the canonical source requirement',()=>{
 const reading=compiled.materials.find(m=>m.id==='public-voa-l1-05-reading'),listening=compiled.materials.find(m=>m.id==='public-voa-l1-05-listening');
 assert.deepEqual(reading.source.prerequisiteCapabilityIds,['foundation:reading']);assert.deepEqual(reading.source.originalPrerequisiteCapabilityIds,['foundation:listening']);assert.deepEqual(listening.source.prerequisiteCapabilityIds,['foundation:listening']);
 assert.equal(S.plan([reading,listening],base).selected[0].materialId,reading.id);
 assert.equal(S.plan([reading,listening],{...base,skill:'listening'}).selected.length,0);
 const ready={...base,skill:'listening',skillLevels:{listening:'A1'},verifiedCapabilities:['foundation:listening']};assert.equal(S.plan([reading,listening],ready).selected[0].materialId,listening.id);
 const catalog={sourceId:'fixture',version:'1',level:{label:'A1'},prerequisiteCapabilityIds:['foundation:listening','grammar:be-present','phonics:listening']},pack={version:'1',questions:[],review:{blindComparison:{}}};
 assert.deepEqual(B.sourceMaterial(catalog,'Text.',pack,'reading',{eligible:false}).source.prerequisiteCapabilityIds,['foundation:reading','grammar:be-present','phonics:listening']);
});
test('hard level and phase checks beat target-word scores; absent evidence selects nothing',()=>{
 const result=S.plan(compiled,base);assert.ok(result.selected.length);assert.ok(result.selected.every(m=>m.levelEstimate.source==='A1'));
 const advanced=compiled.materials.find(m=>m.id==='public-nasa-climate-models-reading'),biased=S.plan([advanced],{...base,currentWordGaps:['climate','model','data','earth','temperature'],targetHeadwordGaps:['scientists','complex','changes'],phaseId:'academic'});assert.equal(biased.selected.length,0);assert.ok(biased.rejected.some(r=>r.reason==='above-current-skill-level'));
 assert.equal(S.plan(compiled,{...base,skillLevels:{}}).selected.length,0);assert.equal(S.plan(compiled,{...base,verifiedCapabilities:[]}).selected.length,0);assert.equal(S.plan(compiled,{...base,phaseId:null}).selected.length,0);
 assert.equal(S.plan(compiled,{...base,currentGrammarTags:[]}).selected.length,0);
});
test('due review and breaks reserve real remaining budget and reference estimates keep uncertainty',()=>{
 const enough=S.plan(compiled,base);assert.equal(enough.budget.availableForNewMaterialMinutes,65);assert.equal(enough.selected[0].estimatedMinutes,31.3);assert.equal(enough.selected[0].durationEstimate.verifiedCapacity,false);
 assert.equal(S.plan(compiled,{...base,remainingMinutes:40}).selected.length,0);assert.ok(S.plan(compiled,{...base,remainingMinutes:40}).deferred.length);
 assert.equal(S.plan(compiled,{...base,dueReviewMinutes:90}).reason,'due-review-and-break-use-remaining-budget');
 assert.equal(S.plan(compiled,{...base,dueReviewMinutes:undefined}).reason,'review-or-break-budget-unavailable');
 const estimates={[enough.selected[0].materialId]:{minutes:12,samples:3}},measured=S.plan(compiled,{...base,remainingMinutes:40,durationEstimates:estimates});assert.equal(measured.selected[0].estimatedMinutes,12);assert.equal(measured.selected[0].durationEstimate.samples,3);
});
test('reading exposure prevents using its paired listening as unseen; explicit familiar review still has no transfer credit',()=>{
 const id='voa-l1-05',pool=compiled.materials.filter(m=>m.source.publicSourceId===id),opts={...base,skill:'listening',skillLevels:{listening:'A1'},verifiedCapabilities:['foundation:listening'],seenSourceGroups:['public-source:'+id]};
 assert.equal(S.plan(pool,opts).selected.length,0);assert.equal(S.plan(pool,{...opts,allowSeenPractice:true}).selected[0].role,'familiar-fluency-review');assert.equal(S.plan(pool,{...opts,allowSeenPractice:true}).selected[0].eligibleForUnseenTransferEvidence,false);
 assert.equal(S.plan(compiled,{...base,mode:'assessment'}).selected.length,0);
 const blocked=compiled.blockedMaterials[0].material;assert.equal(S.plan([blocked],{...base,skill:'listening',phaseId:'everyday',skillLevels:{listening:'A2'},verifiedCapabilities:['foundation:listening'],currentGrammarTags:['past-simple']}).selected.length,0);
});
test('memory evidence is required for an unknown-form estimate, and short segments never substitute for complete question sets',()=>{
 const pool=compiled.materials.filter(m=>m.id==='public-voa-l1-05-reading');
 assert.equal(S.plan(pool,{...base,knownHeadwords:['i','you','the']}).selected[0].estimatedUnknownRatio,null);
 const estimate=S.plan(pool,{...base,knownHeadwords:['i','you','the'],knownHeadwordsEvidence:'memory-artifacts'}).selected[0];assert.ok(estimate.estimatedUnknownRatio>0);assert.match(estimate.unknownRatioBasis,/not a 95%/);if(estimate.shortSegmentSuggestion)assert.equal(estimate.shortSegmentSuggestion.cannotAnswerWholeQuestionSet,true);
});
test('mislabelled assessmentGroup or form cannot enter the ordinary public practice pool',()=>{
 const material=compiled.materials.find(m=>m.id==='public-voa-l1-05-reading');
 for(const field of ['assessmentGroup','form']){const result=S.plan([{...material,[field]:'reserved'}],base);assert.equal(result.selected.length,0);assert.equal(result.rejected[0].reason,'reserved-or-full-assessment-material');}
});
test('selection is immutable, deterministic and available as a browser UMD with cross-realm Sets',()=>{
 const pool=clone(compiled.materials),opts=clone(base),before=JSON.stringify({pool,opts}),one=S.plan(pool,opts);assert.deepEqual(S.plan(pool,opts),one);assert.equal(JSON.stringify({pool,opts}),before);assert.equal(one.persistentChanges,false);
 const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'assets','assessment-core.js'),'utf8'),context);vm.runInContext(fs.readFileSync(path.join(root,'assets','contextual-vocabulary-exposure.js'),'utf8'),context);vm.runInContext(fs.readFileSync(path.join(root,'assets','public-material-selector.js'),'utf8'),context);const browser=context.IELTSPublicMaterialSelector;assert.equal(browser.plan(pool,{...base,verifiedCapabilities:new Set(['foundation:reading'])}).selected.length,1);
});
