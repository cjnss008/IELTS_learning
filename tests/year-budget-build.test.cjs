'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),util=require('node:util'),os=require('node:os');
const F=require('./year-budget-fixture.cjs'),P=require('../tools/year-budget-planner.cjs'),Pack=require('../tools/package-year-first-use.cjs'),Public=require('../assets/public-course-planner.js'),A=require('../assets/assessment-core.js'),Expansion=require('../assets/course-expansion.js');
const input=F.load(),modes=input.artifactModes,D=input.data,meta=input.meta,plan=input.frozenPlan,staged=input.yearMaterials,bootstrap=require(path.join(F.output,meta.firstUseManifest.path)),index=F.bound(meta.materialIndex);
function scratch(t){return require('./native-public-fixtures.cjs').tempDirectory(t,'ielts-year-budget-test-');}
// Count only material identities from the explicit, hash-bound release profile.
// The public fixture has already verified the baseline and every installed unit/ref.
function expectedMaterialCount(){
 const profiles=[
  {id:'family-linked-days04-10-v109',path:'curriculum/family-lessons-v109/release.json'},
  {id:'family-linked-days11-20-v114',path:'curriculum/family-lessons-v114/release.json'}
 ];
 const release=D.familyLessonRelease,batches=release?.active?(release.batches||[release]):[];
 if(meta.runtimeContract?.contract?.path==='curriculum/year-first-use-runtime-contract-v114-context-lexicon.json')assert.deepEqual(batches.map(batch=>batch.id),profiles.map(profile=>profile.id),'v114 requires both signed family batches in order');
 const ids=[],baseIds=new Set(modes.actual.materials.map(material=>material.id));
 for(const [i,batch] of batches.entries()){
  const profile=profiles[i];assert.ok(profile,'Unknown family release profile');assert.equal(batch.id,profile.id);
  const file=path.join(F.root,profile.path),bytes=fs.readFileSync(file),signed=JSON.parse(bytes);assert.equal(F.sha(bytes),batch.releaseSha256,'signed family release bytes');assert.equal(signed.id,batch.id);assert.equal(signed.active,true);assert.equal(signed.rootReview.sha256,batch.rootReviewSha256);
  const reviewBytes=fs.readFileSync(path.join(path.dirname(file),signed.rootReview.file));assert.equal(F.sha(reviewBytes),signed.rootReview.sha256,'family root review bytes');
  assert.deepEqual(batch.units.map(({id,day})=>({id,day})),signed.units.map(({id,day})=>({id,day})),'signed family unit order');
  for(const row of signed.materials){assert.ok(!baseIds.has(row.id),'family material must be a new identity');assert.ok(!ids.includes(row.id),'family material must be unique across batches');ids.push(row.id);}
 }
 assert.deepEqual(D.materials.slice(modes.expected.materialCount).map(material=>material.id),ids,'exact signed family additions');
 return modes.expected.materialCount+ids.length;
}
test('a normal default bundle without year metadata gets an explicitly test-only committed view without changing D',()=>{
 const data=P.clone(D);delete data.yearFirstUse;const before=JSON.stringify(data),view=F.load({data});assert.equal(view.data,data);assert.equal(view.metadataSource,'committed-sidecars-test-only');assert.equal(Object.hasOwn(data,'yearFirstUse'),false);assert.ok(view.testOnlyMetadataView.yearFirstUse);assert.equal(view.meta.active,meta.active);assert.equal(view.testOnlyMetadataView.yearFirstUse.active,meta.active);assert.equal(JSON.stringify(data),before);assert.deepEqual(view.meta.plan,meta.plan);assert.equal(P.hash(P.coreContract(view.testOnlyMetadataView)),meta.coreHash);
});
test('missing runtime metadata is not permission to accept a different core or public plan',()=>{
 const data=P.clone(D);delete data.yearFirstUse;data.materials[0].title+=' mismatched core';assert.throws(()=>F.load({data}),/committed year core contract mismatch/);
 const publicChanged=P.clone(D);delete publicChanged.yearFirstUse;publicChanged.publicCoursePlan.planHash='f'.repeat(64);assert.throws(()=>F.load({data:publicChanged}),/committed public plan mismatch/);
});
test('a bare default bundle without committed sidecar evidence is rejected, with no auto-build or output writes',t=>{
 const empty=scratch(t),data=P.clone(D);delete data.yearFirstUse;assert.throws(()=>F.load({data,outputRoot:empty}),/ENOENT/);assert.deepEqual(fs.readdirSync(empty),[]);
});
test('all source, index, bootstrap and sidecar byte contracts match; metadata exposes no material bodies',()=>{
 assert.equal(meta.active,input.active);assert.equal(bootstrap.active,meta.active);assert.equal(meta.runtimeConnected,meta.active);assert.equal(D.yearExpansion,undefined);assert.equal(meta.assignments,undefined);assert.equal(meta.materials,undefined);assert.equal(D.materials.length,expectedMaterialCount());assert.equal(modes.legacy.materials.length,1823);
 assert.equal(F.sha(fs.readFileSync(path.join(F.output,meta.firstUseManifest.path))),meta.firstUseManifest.sha256);assert.deepEqual(bootstrap.index,meta.materialIndex);
 for(const key of ['inputHash','coreHash','publicPlanHash','contextCatalogHash']){assert.match(meta[key],/^[a-f0-9]{64}$/);assert.equal(bootstrap[key],meta[key]);assert.equal(index[key],meta[key]);}
 assert.equal(meta.coreHash,P.hash(P.coreContract(D)));assert.equal(meta.publicPlanHash,D.publicCoursePlan.planHash);assert.equal(meta.contextCatalogHash,P.hash(input.catalog));assert.equal(index.jobs.length,688);
 for(const job of index.jobs){const material=F.bound(job.ref);assert.equal(material.id,job.materialId);assert.equal(P.hash(material),job.materialHash);assert.equal(job.materialHash,job.ref.sha256);assert.ok(!D.materials.some(m=>m.id===job.materialId));assert.equal(material.source.practiceOnly,true);assert.equal(material.source.independentAssessmentEligible,false);assert.equal(material.source.independentTransferEligible,false);}
});
test('public planner validates the actual final bundle and retains its complete independently reviewed75/80 roster',()=>{
 assert.deepEqual(Public.validatePlan(D.publicCoursePlan,modes.actual,{materialContentHash:A.materialContentHash,expandDay:Expansion.overlay}),{valid:true,reasons:[]});assert.equal(D.publicCoursePlan.assignments.length,modes.expected.publicVariants);assert.equal(modes.legacy.publicCoursePlan.assignments.length,75);assert.equal(D.publicCoursePlan.blocked.length,0);
 const wrong=P.clone(modes.actual);wrong.yearExpansion={active:false,schema:plan.schema};assert.ok(Public.validatePlan(D.publicCoursePlan,wrong,{materialContentHash:A.materialContentHash,expandDay:Expansion.overlay}).reasons.includes('yearExpansionHash-mismatch'));
});
test('reviewed 25 version-2 materials and entire protected first lesson survive year compilation',()=>{
 const manifest=require('../curriculum/stable-lessons-02-10/manifest.json');assert.equal(manifest.materials.length,25);
 assert.equal(A.materialContentHash(D.days[0]),manifest.protectedDay1.dayContentHash);
 for(const row of manifest.protectedDay1.materials)assert.equal(A.materialContentHash(D.materials.find(m=>m.id===row.id)),row.contentHash,row.id);
 for(const row of manifest.materials){const actual=D.materials.find(m=>m.id===row.id),expected=JSON.parse(fs.readFileSync(path.join(F.root,'curriculum/stable-lessons-02-10',row.file)));assert.equal(actual.version,'2');assert.ok(util.isDeepStrictEqual(actual,expected),row.id);}
});
test('every pending source and derivative remains accountable under the actual activation mode without fake completion',()=>{
 const pending=F.bound(meta.pending);assert.equal(plan.ledger.length,688);assert.deepEqual(plan.summary.sources,{total:272,assigned:272,pending:0});assert.equal(plan.summary.derived.total,416);assert.equal(plan.summary.derived.assigned+plan.summary.derived.pending,416);assert.equal(pending.pending.length,plan.summary.all.pending);assert.deepEqual(plan.ledger,P.build(input).ledger,'actual year ledger must match a fresh plan of this exact75/80 artifact');assert.equal(plan.summary.requiredPublicVariantsRetained,modes.expected.publicVariants);assert.equal(new Set(plan.ledger.map(m=>m.materialId)).size,688);assert.equal(plan.spacedPractice.length,688);assert.ok(plan.spacedPractice.every(x=>x.scheduledCount===0));assert.equal(plan.active,meta.active);assert.equal(plan.runtimeConnected,meta.active);assert.equal(plan.summary.actualLearningOrMasteryValidated,false);
});
test('static shared budget counts existing work, semantic activities, contingency and rest exactly once',()=>{
 for(const day of plan.days.filter(d=>d.yearMaterialIds.length)){assert.ok(day.budget.totalMinutes<=360);assert.equal(day.budget.studyMinutes,day.baseline.studyMinutes+day.semanticContextStudyMinutes+day.yearStudyMinutes+day.contingencyStudyMinutes);assert.equal(day.budget.totalMinutes,day.budget.studyMinutes+day.budget.breakMinutes);}
 assert.deepEqual(plan.summary.baselineOverBudgetDays,[2,365]);assert.equal(plan.summary.existingPublicReviewReservations,D.publicCoursePlan.reviews.length);assert.equal(plan.summary.semanticContextReservations,6);assert.equal(plan.summary.existingPublicBlockedReviewWindows,D.publicCoursePlan.reviewBlocked.length);
});
test('the explicit packager is reproducible, rejects tampering and never overwrites a content-addressed shard',t=>{
 const target=scratch(t),bundlePath=path.join(F.output,'assets/curriculum-data.js'),before=F.sha(fs.readFileSync(bundlePath));t.after(()=>assert.equal(F.sha(fs.readFileSync(bundlePath)),before,'production bundle was not changed by packager tests'));
 const options={outputRoot:target,plan,catalog:{materials:staged},planRef:meta.plan,runtimeContract:meta.active?meta.runtimeContract:null},first=Pack.packageFirstUse(options),second=Pack.packageFirstUse(options);assert.deepEqual(first,second);assert.deepEqual(first.indexRef,meta.materialIndex);assert.deepEqual(first.bootstrapRef,meta.firstUseManifest);
 const broken=P.clone(plan);broken.inputHash='x';assert.throws(()=>Pack.packageFirstUse({...options,plan:broken}),/bound input hash/);
 const changed=P.clone(staged);changed[0].title+=' changed';assert.throws(()=>Pack.packageFirstUse({...options,catalog:{materials:changed}}),/material ledger hash/);
 const shard=path.join(target,index.jobs[0].ref.path);fs.writeFileSync(shard,'tampered');assert.throws(()=>Pack.packageFirstUse(options),/immutable packaged file changed/);assert.equal(fs.readFileSync(shard,'utf8'),'tampered');
});
test('committed bundle has no old year append or accidental static selector registry in either activation mode',()=>{
 const builder=fs.readFileSync(path.join(F.root,'tools/build-curriculum.cjs'),'utf8');assert.ok(!builder.includes('YearExpansion.applySchedule('));assert.ok(!builder.includes('materials.push(...year.materials)'));for(const day of D.days){assert.ok(day.tasks.every(task=>task.materialIds.every(id=>!id.startsWith('expand-'))));assert.equal(Expansion.yearOverlay(day,D),day);}
});

test('latest unstarted new-knowledge projection remains separate from hash-bound old drafts and the committed fixture',()=>{
 const day=D.days.find(day=>day.day===2),before=P.hash(D),flow=Expansion.unstartedLessonFlow(day,D,{contextReady:true,records:[],drafts:[],protectedDays:[]});
 assert.notEqual(flow,day);assert.deepEqual(flow.tasks.find(task=>task.id==='grammar').materialIds,[Expansion.IDS.grammar]);
 for(const context of [{drafts:[{courseDay:2}]},{records:[{dayNumber:2}]},{protectedDays:[2]}])assert.equal(Expansion.unstartedLessonFlow(day,D,{contextReady:true,records:[],drafts:[],protectedDays:[],...context}),day);
 assert.equal(P.hash(D),before);assert.ok(day.tasks.find(task=>task.id==='grammar').materialIds.includes('w01-read-2-grammar'));
 assert.equal(F.load().meta.coreHash,meta.coreHash);
 const projected=P.clone(D);projected.days[1]=flow;assert.throws(()=>F.load({data:projected}),/committed year core contract mismatch/);
});

function activationFixture(t){
 const directory=scratch(t),components=[];
 const policy=require('../server/year-runtime-contract-policy.cjs');
 for(const [role,file]of Object.entries(policy.REQUIRED_COMPONENTS)){
  const source=fs.readFileSync(path.join(__dirname,'..',file)),bytes=file.endsWith('.html')?Buffer.from(source.toString('utf8').replace(/<script\b[^>]*data-src="assets\/family-lesson-expansion-v95\.js"[^>]*><\/script>\r?\n?/g,'')):source,target=path.join(directory,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);components.push({role,path:file,sha256:F.sha(bytes),bytes:bytes.length});
 }
 const contract={schema:1,kind:'year-first-use-runtime-contract',protocol:1,runtimeConnected:true,activationReviewed:true,components},file=path.join(directory,'curriculum/year-first-use-runtime-contract.json');fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,JSON.stringify(contract));return{directory,contract,file,check:()=>require('../tools/year-runtime-activation.cjs').validateRuntimeContract({root:directory,contractPath:'curriculum/year-first-use-runtime-contract.json'})};
}

test('explicit activation rejects missing expansion, partial/in-place builds and absent runtime contract before writing',t=>{
 const {build}=require('../tools/build-curriculum.cjs'),target=scratch(t);
 assert.throws(()=>build({activateYearFirstUse:true,outputRoot:target}),/requires --require-year-expansion/);
 assert.throws(()=>build({requireYearExpansion:true,activateYearFirstUse:true,partial:true,outputRoot:target}),/without --partial/);
 assert.throws(()=>build({requireYearExpansion:true,activateYearFirstUse:true,outputRoot:F.root}),/staging --output-root/);
 assert.throws(()=>build({requireYearExpansion:true,activateYearFirstUse:true,yearRuntimeContract:'work/no-such-year-runtime-contract.json',outputRoot:target}),/Unsupported exact runtime contract path/);
 assert.throws(()=>require('../tools/year-runtime-activation.cjs').validateRuntimeContract({root:target,contractPath:'curriculum/year-first-use-runtime-contract.json'}),/ENOENT/);
 assert.deepEqual(fs.readdirSync(target),[]);
});

test('versioned activation contract requires all production consumers, reviewed connection, safe paths and current component hashes',t=>{
 const f=activationFixture(t),proof=f.check();assert.equal(proof.metadata.protocol,1);assert.equal(proof.metadata.components.length,require('../server/year-runtime-contract-policy.cjs').REQUIRED_ROLES.length);assert.equal(proof.metadata.contract.sha256,F.sha(fs.readFileSync(f.file)));
 for(const mutate of [c=>{c.protocol=2;},c=>{c.activationReviewed=false;},c=>{c.runtimeConnected=false;},c=>{c.components.pop();},c=>{c.components.push(c.components[0]);},c=>{c.components[0].path='../escape.js';},c=>{c.components[0].sha256='0'.repeat(64);}]){
  const broken=P.clone(f.contract);mutate(broken);fs.writeFileSync(f.file,JSON.stringify(broken));assert.throws(f.check);
 }
 fs.writeFileSync(f.file,JSON.stringify(f.contract));fs.appendFileSync(path.join(f.directory,f.contract.components[0].path),'changed');assert.throws(f.check,/runtime component hash mismatch/);
});

test('active packaging needs matching validated contract and keeps the core/public contract separate',t=>{
 const f=activationFixture(t),runtimeContract=f.check().metadata,activePlan=P.clone(plan);activePlan.active=true;activePlan.runtimeConnected=true;activePlan.runtimeContract=runtimeContract;
 const text=JSON.stringify(activePlan,null,2)+'\n',planRef={path:meta.plan.path,sha256:F.sha(Buffer.from(text)),bytes:Buffer.byteLength(text)},target=scratch(t),coreBefore=P.hash(P.coreContract(D)),publicBefore=P.hash(D.publicCoursePlan);
 const options={outputRoot:target,plan:activePlan,catalog:{materials:staged},planRef};assert.throws(()=>Pack.packageFirstUse(options),/active package requires validated runtime contract/);
 const packaged=Pack.packageFirstUse({...options,runtimeContract}),activeBootstrap=require(path.join(target,packaged.bootstrapRef.path)),activeIndex=JSON.parse(fs.readFileSync(path.join(target,packaged.indexRef.path)));
 for(const value of [packaged,activeBootstrap,activeIndex]){assert.equal(value.active,true);assert.equal(value.runtimeConnected,true);}
 for(const value of [activeBootstrap,activeIndex])assert.deepEqual(value.runtimeContract,runtimeContract);
 assert.equal(activeBootstrap.coreHash,meta.coreHash);assert.equal(activeBootstrap.publicPlanHash,meta.publicPlanHash);assert.equal(P.hash(P.coreContract(D)),coreBefore);assert.equal(P.hash(D.publicCoursePlan),publicBefore);
});

test('the frozen default75 year ledger remains an independent regression beside the actual explicit artifact',()=>{const legacy=P.build(input.legacyInput);assert.equal(input.legacyInput.base.materials.length,1823);assert.equal(input.legacyInput.base.publicCoursePlan.planHash,modes.defaultPin.publicPlanHash);assert.equal(input.legacyInput.base.publicCoursePlan.assignments.length,75);assert.deepEqual(legacy.summary,modes.defaultPin.yearSummary);assert.deepEqual(legacy.summary.all,{total:688,assigned:461,pending:227});assert.equal(legacy.summary.existingPublicReviewReservations,137);assert.equal(legacy.summary.existingPublicBlockedReviewWindows,1);if(modes.release){assert.equal(D.materials.length,expectedMaterialCount());assert.equal(D.publicCoursePlan.assignments.length,modes.expected.publicVariants);if(modes.ordinaryReadingRelease){const base80={...input.legacyInput,base:modes.base80};base80.inputHash=P.hash({days:base80.base.days,materials:base80.base.materials,yearMaterials:base80.yearMaterials,publicPlanHash:base80.base.publicCoursePlan.planHash,catalog:base80.catalog});const retained80=P.build(base80);assert.equal(base80.base.publicCoursePlan.assignments.length,80);assert.equal(retained80.summary.existingPublicReviewReservations,151);assert.deepEqual(retained80.summary.all,{total:688,assigned:457,pending:231});assert.equal(plan.summary.existingPublicReviewReservations,D.publicCoursePlan.reviews.length);assert.ok(plan.summary.all.assigned<=retained80.summary.all.assigned);}else assert.equal(plan.summary.existingPublicReviewReservations,151);assert.equal(plan.summary.existingPublicBlockedReviewWindows,2);assert.equal(plan.summary.all.total,688);assert.deepEqual(plan.summary.sources,legacy.summary.sources);assert.ok(plan.summary.all.assigned<=legacy.summary.all.assigned);}});
