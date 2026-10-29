'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Catalog=require('../tools/family-release-catalog.cjs'),F=require('./family-lessons-v95-fixture.cjs');
const A=F.A,clone=F.copy,sha=F.sha,root=path.resolve(__dirname,'..');

function base(pack){const value=clone(pack.data);delete value.familyLessonRelease;delete value.yearFirstUse;value.materials=value.materials.filter(m=>m.id.startsWith('base-'));value.days.push({...clone(value.days[0]),day:3});return value;}
function second(pack,{repeatWords=false,exclude=new Set(),unitId='synthetic-family-lesson3'}={}){
 const directory='next',dir=path.join(pack.root,directory);fs.mkdirSync(dir);
 const release=clone(pack.release);release.id='synthetic-reviewed-batch3';
 const unit=release.units[0];unit.id=unitId;unit.day=3;
 const entries=require('../assets/essential-vocabulary-data.js').entries.filter(e=>/^[a-z]{5,}$/.test(e.word)&&!exclude.has(e.id)).slice(repeatWords?0:30,repeatWords?30:60);
 const text=entries.map(e=>e.word).join(' ')+'. A red bag is on the table.';
 const newIds=new Map(release.materials.map(row=>[row.id,row.id+'-batch3']));
 for(const row of release.materials){
  const material=JSON.parse(fs.readFileSync(path.join(pack.root,'fixtures',row.file)));
  material.id=newIds.get(row.id);for(const q of material.questions)q.id+='-batch3';
  if(material.passage)material.passage=text;if(material.transcript)material.transcript=text;
  if(material.vocabulary)material.vocabulary=entries.map(e=>({...material.vocabulary[0],word:e.word,example:text}));
  const oldId=row.id;row.id=material.id;row.file=material.id+'.json';
  const bytes=Buffer.from(JSON.stringify(material)+'\n');fs.writeFileSync(path.join(dir,row.file),bytes);
  row.fileSha256=sha(bytes);row.materialContentHash=A.materialContentHash(material);row.questionsSha256=sha(Buffer.from(JSON.stringify(material.questions)));
  for(const task of unit.tasks){for(const ref of task.materialRefs)if(ref.materialId===oldId){ref.materialId=row.id;ref.contentHash=row.materialContentHash;}task.requires=task.requires.map(id=>id===oldId?row.id:id);}
 }
 unit.targets=entries.map((entry,index)=>{const start=entries.slice(0,index).reduce((n,e)=>n+e.word.length+1,0);return {...unit.targets[0],canonicalId:entry.id,sourceMaterialId:'new-reading-batch3',sourceTextSha256:A.sourceTextHash(text),surface:entry.word,start,end:start+entry.word.length,quote:text,quoteStart:0,quoteEnd:text.length};});
 const review={schema:1,releaseId:release.id,decision:'approved-ordinary-six-module-content',reviewStatus:'root-ai-content-and-binding-reviewed-not-human',independentAssessmentEligible:false,targetBindingsReviewed:true,releasePayloadSha256:sha(Buffer.from(JSON.stringify({id:release.id,policy:release.policy,materials:release.materials,units:release.units}))),materials:clone(release.materials),units:[{id:unit.id,unitPayloadSha256:sha(Buffer.from(JSON.stringify(unit)))}]};
 const bytes=Buffer.from(JSON.stringify(review)+'\n');fs.writeFileSync(path.join(dir,'review.json'),bytes);release.rootReview={file:'review.json',sha256:sha(bytes)};fs.writeFileSync(path.join(dir,'release.json'),JSON.stringify(release)+'\n');return {root:pack.root,releasePath:directory+'/release.json'};
}

test('published v109 words retain their exact source binding in the independently compiled catalog',()=>{
 const D=require('../assets/curriculum-data.js'),baseline=require('./published-public-baseline-fixture.cjs')(D),before=JSON.stringify(baseline);
 const catalog=Catalog.compile({baseData:baseline,releases:[{root,releasePath:'curriculum/family-lessons-v109/release.json'}]});
 assert.equal(catalog.active,false);assert.deepEqual(catalog.counts,{batches:1,days:7,newWords:210,materials:70});
 assert.equal(JSON.stringify(baseline),before);const compiled=catalog.releases[0].release,Helper=require('../assets/family-lesson-expansion-v95.js');
 const installedOld=D.familyLessonRelease.units.slice(0,compiled.units.length),installedMaterials=D.materials.slice(baseline.materials.length,baseline.materials.length+catalog.releases[0].materials.length);
 assert.equal(compiled.releaseSha256,D.familyLessonRelease.releaseSha256);assert.equal(compiled.rootReviewSha256,D.familyLessonRelease.rootReviewSha256);
 assert.deepEqual(compiled.units,installedOld);assert.equal(JSON.stringify(compiled.units),JSON.stringify(installedOld));
 assert.deepEqual(catalog.releases[0].materials,installedMaterials);assert.equal(JSON.stringify(catalog.releases[0].materials),JSON.stringify(installedMaterials));
 // The real 114 appended batch is verified independently by family-multibatch-runtime.test.cjs.
 for(const unit of compiled.units){
  const task=unit.tasks.find(t=>t.id==='vocabulary'),owners=new Map(unit.tasks.flatMap(t=>t.materialRefs.map(ref=>[ref.materialId,{task:t,ref}]))),todo=[...unit.targets.map(t=>t.sourceMaterialId),...task.requires],ids=new Set();
  while(todo.length){const id=todo.pop();if(ids.has(id))continue;ids.add(id);todo.push(...owners.get(id).task.requires);}
  const sources=[...ids].sort().map(id=>{const ref=owners.get(id).ref,m=D.materials.find(m=>m.id===id);return {materialId:id,materialVersion:String(m.version||'1'),materialContentHash:ref.contentHash,...(ref.audioRef?{audioRef:clone(ref.audioRef)}:{})};});
  const binding={schema:1,originCourseDay:unit.day,releaseId:unit.releaseId,releaseSha256:unit.releaseSha256,rootReviewSha256:compiled.rootReviewSha256,unitId:unit.id,unitSha256:unit.unitSha256,targetSetSha256:A.materialContentHash(unit.targets),sourceContractSha256:A.materialContentHash({schema:1,sources,requires:[...task.requires]})};
  assert.deepEqual(Helper.cleanVocabularyBinding(binding,{currentRelease:true,data:D,assessment:A}),binding);
  assert.deepEqual(Helper.cleanVocabularyBinding(binding,{currentRelease:true,data:{...baseline,materials:[...baseline.materials,...catalog.releases[0].materials],familyLessonRelease:compiled},assessment:A}),binding);
 }
});

test('adding a separately reviewed batch preserves the old catalog prefix and source identities',()=>{
 const pack=F.packageData(),source=base(pack),original=JSON.stringify(source),first={root:pack.root,releasePath:'fixtures/release.json'},next=second(pack);
 const previous=Catalog.compile({baseData:source,releases:[first]}),before=JSON.stringify(previous),combined=Catalog.compile({baseData:source,releases:[first,next],previous});
 assert.deepEqual(combined.releases[0],previous.releases[0]);assert.deepEqual(combined.assignments[0],previous.assignments[0]);
 assert.deepEqual(combined.counts,{batches:2,days:2,newWords:60,materials:12});
 assert.notEqual(combined.catalogSha256,previous.catalogSha256);assert.equal(JSON.stringify(previous),before);assert.equal(JSON.stringify(source),original);
 assert.throws(()=>Catalog.compile({baseData:source,releases:[next,first],previous}),/Historical batch changed or reordered/);
 assert.throws(()=>Catalog.compile({baseData:source,releases:[first],previous:combined}),/Cannot remove/);
 const altered=clone(source);altered.days[0].title='changed';assert.throws(()=>Catalog.compile({baseData:altered,releases:[first,next],previous}),/Historical base source changed/);
});

test('repeated targets cannot silently count as another thirty new words',()=>{
 const pack=F.packageData(),source=base(pack),first={root:pack.root,releasePath:'fixtures/release.json'},next=second(pack,{repeatWords:true});
 assert.throws(()=>Catalog.compile({baseData:source,releases:[first,next]}),/repeated target/);
});

test('different course days cannot reuse a historical unit identity',()=>{
 const pack=F.packageData(),source=base(pack),first={root:pack.root,releasePath:'fixtures/release.json'},next=second(pack,{unitId:pack.release.units[0].id});
 assert.throws(()=>Catalog.compile({baseData:source,releases:[first,next]}),/Unit identity reused/);
});

test('changed reviewed source or audio rejects the whole catalog without mutating the base',()=>{
 const pack=F.packageData(),source=base(pack),before=JSON.stringify(source),first={root:pack.root,releasePath:'fixtures/release.json'};
 const file=path.join(pack.root,'fixtures/new-reading.json'),original=fs.readFileSync(file);fs.appendFileSync(file,' ');
 assert.throws(()=>Catalog.compile({baseData:source,releases:[first]}));fs.writeFileSync(file,original);
 fs.appendFileSync(path.join(pack.root,'audio/synthetic.wav'),'changed');assert.throws(()=>Catalog.compile({baseData:source,releases:[first]}));
 assert.equal(JSON.stringify(source),before);
});

test('runtime append keeps the published single batch byte shape and adds a separately bound second batch',()=>{
 const D=require('../assets/curriculum-data.js'),baseline=require('./published-public-baseline-fixture.cjs')(D),first={root,releasePath:'curriculum/family-lessons-v109/release.json'};
 delete baseline.yearFirstUse; // Production appends before packaging the new runtime manifest.
 const legacy=clone(baseline);require('../tools/family-public-append-v1.cjs').append(legacy,first);
 const single=clone(baseline);Catalog.append(single,{releases:[first]});assert.deepEqual(single,legacy);
 const pack=F.packageData(),next=second(pack,{exclude:new Set(legacy.familyLessonRelease.units.flatMap(u=>u.targets.map(t=>t.canonicalId)))}),data=clone(baseline),result=Catalog.append(data,{releases:[first,next]});
 assert.equal(data.familyLessonRelease.batches.length,2);assert.equal(result.result.added,76);assert.equal(result.result.units,8);
 assert.deepEqual(data.familyLessonRelease.units.slice(0,7),legacy.familyLessonRelease.units);
 assert.deepEqual(data.familyLessonRelease.publicAppendReceipt,legacy.familyLessonRelease.publicAppendReceipt);
 assert.deepEqual(data.materials.slice(0,legacy.materials.length),legacy.materials);assert.deepEqual(data.days,baseline.days);assert.deepEqual(data.publicCoursePlan,baseline.publicCoursePlan);
 const unit=data.familyLessonRelease.units.at(-1);
 assert.equal(unit.releaseId,result.catalog.releases[1].release.id);assert.notEqual(unit.releaseSha256,legacy.familyLessonRelease.releaseSha256);
 const originalHistory=Catalog.history(legacy.familyLessonRelease),installedHistory=Catalog.history(data.familyLessonRelease);
 assert.equal(originalHistory.length,1);assert.equal(installedHistory.length,2);
 assert.throws(()=>Catalog.append(clone(baseline),{releases:[next],requiredHistory:originalHistory}),/Installed family batch/);
 assert.throws(()=>Catalog.append(clone(baseline),{releases:[first],requiredHistory:installedHistory}),/Cannot remove an installed/);
 assert.throws(()=>Catalog.append(clone(baseline),{releases:[next,first],requiredHistory:installedHistory}),/Installed family batch/);
 const alteredHistory=clone(originalHistory);alteredHistory[0].units[0].unitSha256='a'.repeat(64);
 assert.throws(()=>Catalog.append(clone(baseline),{releases:[first,next],requiredHistory:alteredHistory}),/Installed family batch/);
 const before=JSON.stringify(baseline),bad=clone(baseline);fs.appendFileSync(path.join(pack.root,'next/release.json'),'bad');assert.throws(()=>Catalog.append(bad,{releases:[first,next]}));assert.equal(JSON.stringify(bad),before,'failed later batch cannot partially append the first one');
});

test('the multi-batch production build cannot omit all installed lessons',()=>{
 const outputRoot=path.join(require('node:os').tmpdir(),'ielts-family-missing-release-test');
 assert.throws(()=>require('../tools/build-curriculum.cjs').build({requireYearExpansion:true,activateYearFirstUse:true,gsaGradedRelease:'curriculum/gsa-graded-course/release.json',ordinaryReadingRelease:'curriculum/ordinary-reading-v92/release.json',yearRuntimeContract:'curriculum/year-first-use-runtime-contract-v115-completed-history.json',outputRoot}),/cannot omit historical lessons/);
});
