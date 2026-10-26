'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const F=require('./year-budget-fixture.cjs'),P=require('../tools/year-budget-planner.cjs'),input=F.load();
const Native=require('./native-public-fixtures.cjs');
function scratch(t){return Native.tempDirectory(t,'ielts-year-artifact-mode-');}
function artifactCopy(t){
 const directory=scratch(t),meta=input.meta,index=F.bound(meta.materialIndex),refs=new Map();
 const add=ref=>{if(refs.has(ref.path)){assert.equal(refs.get(ref.path).sha256,ref.sha256);return;}refs.set(ref.path,ref);};
 for(const ref of [meta.plan,meta.stagedMaterials,meta.pending,meta.firstUseManifest,meta.materialIndex,...index.jobs.map(j=>j.ref)])add(ref);
 const componentPaths=new Set();if(meta.runtimeContract){add(meta.runtimeContract.contract);for(const ref of meta.runtimeContract.components){add(ref);componentPaths.add(ref.path);}}
 for(const dependency of ['assets/curriculum-data.js','assets/public-context-data.js']){const bytes=fs.readFileSync(path.join(F.output,dependency));add({path:dependency,sha256:F.sha(bytes),bytes:bytes.length});}
 for(const ref of refs.values()){
  assert.equal(path.isAbsolute(ref.path),false);assert.ok(!ref.path.split(/[\\/]/).some(part=>part==='..'));
  let from=path.join(F.output,ref.path);if(!fs.existsSync(from)&&componentPaths.has(ref.path))from=path.join(F.root,ref.path);
  const bytes=fs.readFileSync(from);assert.equal(F.sha(bytes),ref.sha256,ref.path);assert.equal(bytes.length,ref.bytes,ref.path);const target=path.resolve(directory,ref.path);assert.ok(target.startsWith(path.resolve(directory)+path.sep));Native.copyTree(from,target,{sourceRoot:from.startsWith(path.resolve(F.output)+path.sep)?F.output:F.root,destinationRoot:directory});assert.equal(F.sha(fs.readFileSync(target)),ref.sha256,ref.path);
 }
 if(input.artifactModes.release){for(const relative of ['curriculum/gsa-graded-course','materials/public/gsa-graded-course','assets/assessment-core.js']){const target=path.join(directory,relative);if(fs.existsSync(target)){assert.equal(F.sha(fs.readFileSync(target)),F.sha(fs.readFileSync(path.join(F.root,relative))));continue;}Native.copyTree(path.join(F.root,relative),target,{sourceRoot:F.root,destinationRoot:directory});}}
 return directory;
}
test('a byte-exact committed artifact copy retains its real active or inactive mode and all 688 material bindings',t=>{
 const directory=artifactCopy(t),value=F.load({outputRoot:directory,projectRoot:directory,expectedActive:input.active});assert.equal(typeof value.active,'boolean');assert.equal(value.meta.active,input.meta.active);assert.equal(value.frozenPlan.active,input.active);assert.equal(value.yearMaterials.length,688);assert.deepEqual(value.meta,input.meta);assert.equal(value.inputHash,input.inputHash);assert.equal(value.meta.coreHash,input.meta.coreHash);assert.equal(value.meta.publicPlanHash,input.meta.publicPlanHash);if(input.active)assert.deepEqual(value.meta.runtimeContract,input.meta.runtimeContract);
});
test('expectedActive is optional but an explicit wrong mode or non-boolean expectation is rejected',()=>{
 assert.equal(F.load().active,input.active);assert.equal(F.load({expectedActive:input.active}).active,input.active);assert.throws(()=>F.load({expectedActive:!input.active}),/committed activation expectation/);for(const expectedActive of [undefined,null,0,1,'true','false'])assert.throws(()=>F.load({expectedActive}),/expectedActive must be an explicit boolean/);
});
test('a no-metadata test-only view uses the copied bound sidecars without downgrading their activation mode',t=>{
 const directory=artifactCopy(t),data=P.clone(input.data);delete data.yearFirstUse;const before=JSON.stringify(data),view=F.load({data,outputRoot:directory,projectRoot:directory,expectedActive:input.active});assert.equal(view.metadataSource,'committed-sidecars-test-only');assert.equal(view.data,data);assert.equal(Object.hasOwn(data,'yearFirstUse'),false);assert.equal(view.active,input.active);assert.equal(view.meta.active,input.active);assert.equal(view.testOnlyMetadataView.yearFirstUse.active,input.active);assert.deepEqual(view.meta.plan,input.meta.plan);assert.equal(JSON.stringify(data),before);if(input.active)assert.deepEqual(view.testOnlyMetadataView.yearFirstUse.runtimeContract,input.meta.runtimeContract);
});
test('a copied no-metadata view still refuses a different core and public-plan hash',t=>{
 const directory=artifactCopy(t),changed=P.clone(input.data);delete changed.yearFirstUse;changed.materials[0].title+=' mismatched copied core';assert.throws(()=>F.load({data:changed,outputRoot:directory,projectRoot:directory}),/committed year core contract mismatch/);const publicChanged=P.clone(input.data);delete publicChanged.yearFirstUse;publicChanged.publicCoursePlan.planHash='f'.repeat(64);assert.throws(()=>F.load({data:publicChanged,outputRoot:directory,projectRoot:directory}),/committed public plan mismatch/);
});
test('require cache cannot hide changed bootstrap activation bytes in a no-metadata copy',t=>{
 const directory=artifactCopy(t),file=path.join(directory,input.meta.firstUseManifest.path),cached=require(file);assert.equal(cached.active,input.active);const raw=fs.readFileSync(file,'utf8'),changed=raw.replace('"active":'+input.active,'"active":'+!input.active);assert.notEqual(changed,raw);fs.writeFileSync(file,changed);const data=P.clone(input.data);delete data.yearFirstUse;assert.throws(()=>F.load({data,outputRoot:directory,projectRoot:directory}),/bootstrap activation consistency/);assert.equal(require(file).active,input.active,'the test deliberately retains the old require cache');
});
test('runtime bundle activation must agree with the actual committed bootstrap and sidecars',()=>{
 const data=P.clone(input.data);data.yearFirstUse=P.clone(input.meta);data.yearFirstUse.active=!input.active;assert.throws(()=>F.load({data}),/runtime year metadata active/);
});
test('default planner recomputation stays inactive even when the committed runtime artifact is active',()=>{
 const before=P.hash(input),plan=P.build(input);assert.equal(plan.active,false);assert.equal(plan.runtimeConnected,false);assert.equal(plan.runtimeContract,undefined);assert.equal(plan.summary.actualLearningOrMasteryValidated,false);assert.equal(plan.ledger.length,688);assert.equal(P.hash(input),before);assert.equal(input.frozenPlan.active,input.active);
});


test('a copied artifact cannot borrow missing or changed contexts and signed source bytes from the repository',t=>{
 const directory=artifactCopy(t),contextFile=path.join(directory,'assets/public-context-data.js'),original=fs.readFileSync(contextFile);fs.unlinkSync(contextFile);assert.throws(()=>F.load({outputRoot:directory,projectRoot:directory}),/Cannot find module|ENOENT/);fs.writeFileSync(contextFile,original);if(input.artifactModes.release){const body=path.join(directory,'materials/public/gsa-graded-course/gsa-plain-language-02.txt');fs.appendFileSync(body,' changed copy');assert.throws(()=>F.load({outputRoot:directory,projectRoot:directory}),/hash mismatch/);}else assert.equal(F.load({outputRoot:directory,projectRoot:directory}).artifactModes.mode,'default75');
});
