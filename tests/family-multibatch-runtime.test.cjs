'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const F=require('./family-lessons-v95-fixture.cjs'),Catalog=require('../tools/family-release-catalog.cjs'),A=F.A,clone=F.copy,root=path.resolve(__dirname,'..');

function nextRelease(pack,day,excluded=new Set(),{grammarFrom=null}={}){
 const folder='batch-next',dir=path.join(pack.root,folder);fs.mkdirSync(dir);
 const release=clone(pack.release),unit=release.units[0];release.id='synthetic-next-release-'+day;unit.id='synthetic-next-unit-'+day;unit.day=day;
 const entries=require('../assets/essential-vocabulary-data.js').entries.filter(e=>/^[a-z]{5,}$/.test(e.word)&&!excluded.has(e.id)).slice(0,30);assert.equal(entries.length,30);
 const text=entries.map(e=>e.word).join(' ')+'. A red bag is on the table.',ids=new Map(release.materials.map(row=>[row.id,row.id+'-next-'+day]));
 for(const row of release.materials){const material=JSON.parse(fs.readFileSync(path.join(pack.root,'fixtures',row.file)));const old=row.id;material.id=ids.get(old);for(const q of material.questions)q.id+='-next-'+day;if(material.passage)material.passage=text;if(material.transcript)material.transcript=text;if(material.vocabulary)material.vocabulary=entries.map(e=>({...material.vocabulary[0],word:e.word,example:text}));row.id=material.id;row.file=material.id+'.json';const bytes=Buffer.from(JSON.stringify(material)+'\n');fs.writeFileSync(path.join(dir,row.file),bytes);row.fileSha256=F.sha(bytes);row.materialContentHash=A.materialContentHash(material);row.questionsSha256=F.sha(Buffer.from(JSON.stringify(material.questions)));for(const task of unit.tasks){for(const ref of task.materialRefs)if(ref.materialId===old){ref.materialId=row.id;ref.contentHash=row.materialContentHash;}task.requires=task.requires.map(id=>id===old?row.id:id);}}
 unit.targets=entries.map((entry,index)=>{const start=entries.slice(0,index).reduce((n,e)=>n+e.word.length+1,0);return{...unit.targets[0],canonicalId:entry.id,sourceMaterialId:ids.get('new-reading'),sourceTextSha256:A.sourceTextHash(text),surface:entry.word,start,end:start+entry.word.length,quote:text,quoteStart:0,quoteEnd:text.length};});
 if(grammarFrom){const ref=unit.tasks.find(task=>task.id==='grammar').materialRefs[0],removed=ref.materialId;ref.materialId=grammarFrom.id;ref.contentHash=A.materialContentHash(grammarFrom);release.materials=release.materials.filter(row=>row.id!==removed);}
 const review={schema:1,releaseId:release.id,decision:'approved-ordinary-six-module-content',reviewStatus:'root-ai-content-and-binding-reviewed-not-human',independentAssessmentEligible:false,targetBindingsReviewed:true,releasePayloadSha256:F.sha(Buffer.from(JSON.stringify({id:release.id,policy:release.policy,materials:release.materials,units:release.units}))),materials:clone(release.materials),units:[{id:unit.id,unitPayloadSha256:F.sha(Buffer.from(JSON.stringify(unit)))}]};
 const bytes=Buffer.from(JSON.stringify(review)+'\n');fs.writeFileSync(path.join(dir,'review.json'),bytes);release.rootReview={file:'review.json',sha256:F.sha(bytes)};fs.writeFileSync(path.join(dir,'release.json'),JSON.stringify(release)+'\n');return{root:pack.root,releasePath:folder+'/release.json'};
}
function aggregate(base,legacy,catalog,year){
 const data=clone(base),batches=catalog.releases.map(({release})=>({id:release.id,releaseSha256:release.releaseSha256,rootReviewSha256:release.rootReviewSha256,units:release.units.map(({day,id,unitSha256})=>({day,id,unitSha256}))}));
 data.materials=[...data.materials,...catalog.releases.flatMap(({materials})=>clone(materials))];data.familyLessonRelease={...clone(legacy),units:catalog.releases.flatMap(({release})=>clone(release.units)),batches};data.yearFirstUse=clone(year);
 const keys=['version','status','createdDate','scope','weeks','materials','days','gates','lessonExpansions','familyLessonRelease'],core=Object.fromEntries(keys.filter(k=>data[k]!==undefined).map(k=>[k,data[k]]));data.yearFirstUse.coreHash=A.sourceTextHash(JSON.stringify(core));return data;
}
function binding(unit,data){
 const task=unit.tasks.find(t=>t.id==='vocabulary'),owners=new Map(unit.tasks.flatMap(t=>t.materialRefs.map(ref=>[ref.materialId,{task:t,ref}]))),todo=[...unit.targets.map(t=>t.sourceMaterialId),...task.requires],ids=new Set();while(todo.length){const id=todo.pop();if(ids.has(id))continue;ids.add(id);todo.push(...owners.get(id).task.requires);}
 const sources=[...ids].sort().map(id=>{const ref=owners.get(id).ref,m=data.materials.find(m=>m.id===id);return{materialId:id,materialVersion:String(m.version||'1'),materialContentHash:ref.contentHash,...(ref.audioRef?{audioRef:clone(ref.audioRef)}:{})};}),batch=data.familyLessonRelease.batches?.find(b=>b.id===unit.releaseId)||data.familyLessonRelease;
 return{schema:1,originCourseDay:unit.day,releaseId:unit.releaseId,releaseSha256:unit.releaseSha256,rootReviewSha256:batch.rootReviewSha256,unitId:unit.id,unitSha256:unit.unitSha256,targetSetSha256:A.materialContentHash(unit.targets),sourceContractSha256:A.materialContentHash({schema:1,sources,requires:[...task.requires]})};
}
function syntheticPack(simple=false){
 const pack=F.packageData({simple}),base=clone(pack.data);delete base.familyLessonRelease;delete base.yearFirstUse;base.materials=base.materials.filter(m=>m.id.startsWith('base-'));base.days.push({...clone(base.days[0]),day:3});
 if(simple){const tasks=F.skills.map(id=>({id,skill:id,minutes:id==='vocabulary'?85:55,quantity:1,unit:'题',materialIds:['base-'+id],mode:'practice',instructions:'Original instruction.',deliverable:'Original work'}));base.days.forEach(day=>{day.tasks=clone(tasks);});}
 const first={root:pack.root,releasePath:'fixtures/release.json'},excluded=new Set(pack.data.familyLessonRelease.units.flatMap(u=>u.targets.map(t=>t.canonicalId))),next=nextRelease(pack,3,excluded),catalog=Catalog.compile({baseData:base,releases:[first,next]});
 const data=aggregate(base,pack.data.familyLessonRelease,catalog,pack.data.yearFirstUse);if(simple)data.days=[clone(pack.data.days[0]),{...clone(pack.data.days[0]),day:3}];return{pack,catalog,combined:{...pack,data}};
}

// Verify all installed batch owners and hashes before reducing to the immutable
// public baseline, then rebuild v109 from its actual signed release.
function historicalViews(current){
 const base=require('./published-public-baseline-fixture.cjs')(current);delete base.yearFirstUse;
 const legacy=clone(base),first=Catalog.append(legacy,{releases:[{root,releasePath:'curriculum/family-lessons-v109/release.json'}]});
 legacy.yearFirstUse=clone(current.yearFirstUse);legacy.yearFirstUse.coreHash=first.combinedCoreHash;legacy.yearFirstUse.runtimeContract=require('../tools/year-runtime-activation.cjs').validateRuntimeContract({root,contractPath:'curriculum/year-first-use-runtime-contract-v117-vocabulary-response.json'}).metadata;
 return{base,legacy};
}

test('v109 bindings and receipt survive a reviewed appended batch and the public projection admits its own signed unit',async()=>{
 const D=require('../assets/curriculum-data.js'),{base,legacy}=historicalViews(D),pack=F.packageData(),excluded=new Set(legacy.familyLessonRelease.units.flatMap(u=>u.targets.map(t=>t.canonicalId))),next=nextRelease(pack,11,excluded),helper=require('../assets/family-lesson-expansion-v95.js');
 const combined=clone(base),appended=Catalog.append(combined,{releases:[{root,releasePath:'curriculum/family-lessons-v109/release.json'},next]}),catalog=appended.catalog;
 combined.yearFirstUse=clone(D.yearFirstUse);combined.yearFirstUse.coreHash=appended.combinedCoreHash;combined.yearFirstUse.runtimeContract=require('../tools/year-runtime-activation.cjs').validateRuntimeContract({root,contractPath:'curriculum/year-first-use-runtime-contract-v117-vocabulary-response.json'}).metadata;
 assert.deepEqual(combined.familyLessonRelease.publicAppendReceipt,legacy.familyLessonRelease.publicAppendReceipt);assert.deepEqual(combined.familyLessonRelease.units.slice(0,7),legacy.familyLessonRelease.units);assert.equal(JSON.stringify(combined.familyLessonRelease.units.slice(0,7)),JSON.stringify(legacy.familyLessonRelease.units));assert.deepEqual(combined.materials.slice(0,legacy.materials.length),legacy.materials);
 for(const unit of legacy.familyLessonRelease.units){const old=binding(unit,legacy);assert.deepEqual(helper.cleanVocabularyBinding(old,{currentRelease:true,data:legacy,assessment:A}),helper.cleanVocabularyBinding(old,{currentRelease:true,data:combined,assessment:A}));}
 const newer=combined.familyLessonRelease.units.find(u=>u.day===11),expected=binding(newer,combined);assert.equal(expected.rootReviewSha256,catalog.releases[1].release.rootReviewSha256);assert.notEqual(expected.rootReviewSha256,legacy.familyLessonRelease.rootReviewSha256);
 const f=await F.mounted({root:pack.root,data:combined,day:combined.days[10]},{dictionary:true}),fallback=f.win.fetch;f.win.fetch=async url=>{if(String(url).startsWith('/audio/')){const file=String(url)==='/audio/synthetic.wav'?path.join(pack.root,'audio/synthetic.wav'):path.join(root,String(url).slice(1)),bytes=fs.readFileSync(file);return{ok:true,headers:{get:()=>String(bytes.length)},arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}return fallback(url);};
 const api=f.win.IELTSFamilyLessonExpansionV95.runtime();await api.ensureReady();const publicData=api.publicPlanningData();assert.equal(publicData.materials.length,1842);assert.equal(publicData.publicCoursePlan.planHash,D.publicCoursePlan.planHash);
 for(const file of ['public-course-planner.js','public-course-worker.js'])vm.runInContext(fs.readFileSync(path.join(root,'assets',file),'utf8'),f.context,{filename:file});
 const adaptive=f.win.IELTSAdaptivePlan.createStore({data:f.win.IELTSCurriculumData,storage:f.win.IELTSProfiles.storage(),profileId:'legacy',getProfile:()=>f.win.IELTSProfiles.current().id,automaticAdjustments:false,preparePublicCourse:async request=>{let response;await f.win.IELTSPublicCourseWorkerProtocol.createHandler({planner:f.win.IELTSPublicCoursePlanner,postMessage:value=>{response=value;}})(request);return response;}});f.win.IELTSAdaptivePlan={...f.win.IELTSAdaptivePlan,...adaptive};adaptive.adoptStarted({records:await api.prepareCourseRecords(),drafts:[]});await adaptive.preparePublicCourse();assert.equal(adaptive.verifiedPublicCourseState().ready,true);
 f.context.__binding=JSON.stringify(expected);const bound=vm.runInContext('JSON.parse(__binding)',f.context),prepared=await api.prepareVocabularyUnit({courseDay:11}),read=api.readVocabularyContext({courseDay:11,records:prepared.records,drafts:[],binding:bound});assert.equal(read.status,'ready',read.reason);assert.deepEqual(JSON.parse(JSON.stringify(read.binding)),expected);
 const bad=clone(combined);bad.familyLessonRelease.batches[1].rootReviewSha256='f'.repeat(64);assert.throws(()=>helper.cleanVocabularyBinding(expected,{currentRelease:true,data:bad,assessment:A}),/current-release-pending/);
});

test('installed v109 and v114 releases preserve old bindings and pin all 300 new source and audio targets',()=>{
 const D=require('../assets/curriculum-data.js'),{base,legacy}=historicalViews(D),helper=require('../assets/family-lesson-expansion-v95.js'),Oral=require('../assets/oral-practice.js'),essential=require('../assets/essential-vocabulary-data.js');
 const compiled=clone(base),result=Catalog.append(compiled,{releases:[{root,releasePath:'curriculum/family-lessons-v109/release.json'},{root,releasePath:'curriculum/family-lessons-v114/release.json'}]});
 assert.equal(base.materials.length,1842);assert.equal(legacy.materials.length,1912);assert.equal(compiled.materials.length,2012);assert.equal(compiled.familyLessonRelease.units.length,17);assert.equal(compiled.familyLessonRelease.batches.length,2);
 assert.deepEqual(compiled.familyLessonRelease.units.map(unit=>unit.day),Array.from({length:17},(_,i)=>i+4));assert.equal(result.catalog.counts.days,17);assert.equal(result.catalog.counts.newWords,510);assert.equal(result.catalog.counts.materials,170);
 assert.equal(JSON.stringify(D.familyLessonRelease.units.slice(0,7)),JSON.stringify(legacy.familyLessonRelease.units));assert.deepEqual(D.familyLessonRelease.units.slice(0,7),legacy.familyLessonRelease.units);
 assert.deepEqual(D.familyLessonRelease.publicAppendReceipt,legacy.familyLessonRelease.publicAppendReceipt);assert.deepEqual(D.materials.slice(0,legacy.materials.length),legacy.materials);assert.deepEqual(D.materials.slice(0,compiled.materials.length),compiled.materials);assert.deepEqual(D.familyLessonRelease.units.slice(0,17),compiled.familyLessonRelease.units);assert.deepEqual(D.familyLessonRelease.batches.slice(0,2),compiled.familyLessonRelease.batches);
 for(const unit of legacy.familyLessonRelease.units){const before=binding(unit,legacy),after=helper.cleanVocabularyBinding(before,{currentRelease:true,data:D,assessment:A});assert.deepEqual(after,helper.cleanVocabularyBinding(before,{currentRelease:true,data:legacy,assessment:A}));}
 const raw=JSON.parse(fs.readFileSync(path.join(root,'curriculum/family-lessons-v114/release.json'),'utf8')),newUnits=D.familyLessonRelease.units.filter(unit=>unit.releaseId===raw.id),byMaterial=new Map(D.materials.map(m=>[m.id,m])),resolve=helper.createLexemeResolver(essential.entries),identities=new Set();let audioPins=0,speechParts=0;
 assert.equal(newUnits.length,10);
 function assertAudio(pin){assert.ok(pin&&/^audio\/[A-Za-z0-9._/-]+$/.test(pin.src)&&!pin.src.split('/').some(part=>!part||part==='.'||part==='..'));const file=path.resolve(root,pin.src);assert.ok(file.startsWith(root+path.sep));const bytes=fs.readFileSync(file);assert.equal(bytes.length,pin.bytes,pin.src);assert.equal(F.sha(bytes),pin.sha256,pin.src);audioPins++;}
 for(const unit of newUnits){
  const approved=raw.units.find(row=>row.id===unit.id);assert.ok(approved);assert.equal(unit.targets.length,30);assert.deepEqual(unit.targets,approved.targets);assert.equal(unit.releaseId,raw.id);
  const words=unit.tasks.find(task=>task.id==='vocabulary').materialRefs.flatMap(ref=>byMaterial.get(ref.materialId).vocabulary);
  assert.equal(words.length,30);
  for(const target of unit.targets){
   assert.ok(!identities.has(target.canonicalId),target.canonicalId);identities.add(target.canonicalId);
   const source=byMaterial.get(target.sourceMaterialId),text=source.skill==='listening'?source.transcript:source.passage,identity=resolve(target),word=words.find(row=>row.word===identity.word);
   assert.ok(word,target.canonicalId);assert.equal(A.sourceTextHash(text),target.sourceTextSha256);assert.equal(text.slice(target.start,target.end),target.surface);assert.equal(text.slice(target.quoteStart,target.quoteEnd),target.quote);
   assert.equal(word.example,target.quote);assert.equal(word.meaning,target.meaning);assert.equal(word.pos,target.partOfSpeech);assert.equal(word.audio,target.audioRef.src);assertAudio(target.audioRef);
  }
  for(const ref of unit.tasks.find(task=>task.id==='listening').materialRefs)assertAudio(ref.audioRef);
  for(const ref of unit.tasks.find(task=>task.id==='speaking').materialRefs){const material=byMaterial.get(ref.materialId),parts=Oral.spokenReferenceParts(material.reference,65);assert.deepEqual(material.oralModelAudio.map(row=>row.text),parts);for(const clip of material.oralModelAudio){assertAudio(clip);speechParts++;}}
 }
 assert.equal(identities.size,300);assert.equal([...identities].filter(id=>id.startsWith('extension:')).length,24);assert.equal(audioPins,330);assert.equal(speechParts,20);
 const liter=newUnits.flatMap(unit=>unit.targets).find(target=>target.canonicalId==='essential:litre'),celsius=newUnits.flatMap(unit=>unit.targets).find(target=>target.canonicalId==='extension:celsius');assert.equal(liter.trainingWord,'liter');assert.equal(liter.canonicalWord,'litre');assert.equal(celsius.canonicalWord,'Celsius');
});

test('old saved record and unfinished family draft restore unchanged after a later batch is appended',async()=>{
 const {pack,combined}=syntheticPack(true),old=await F.mounted(pack,{protectedDay:true,complete:true,completeFamilyPrerequisites:true}),nav=old.win.IELTSTodayNavigation,entry=nav.learningQueue().entries.find(e=>e.materialId==='new-reading');assert.ok(entry);assert.equal(await nav.openQueued(entry),true);await F.answer(old,{wrong:true});await old.nodes.get('coursePause').fire('click');await F.settle();
 const draft=nav.allDrafts().find(d=>d.materialId==='new-reading'),original=(await old.R.list()).find(r=>r.source==='family-lesson-supplement-v95'&&r.materialId==='new-grammar'),oldUnit=pack.data.familyLessonRelease.units[0],oldBinding=binding(oldUnit,pack.data);assert.ok(draft&&original);const saved=JSON.stringify(draft),savedRecord=JSON.stringify(original),entries=await old.entries();
 const restored=await F.mounted(combined,{entries}),api=restored.win.IELTSFamilyLessonExpansionV95.runtime();await restored.win.IELTSTodayNavigation.showLatestRecord('grammar','new-grammar');assert.match(restored.nodes.get('courseSubmitStatus').textContent,/只读查看/);assert.equal(JSON.stringify((await restored.R.list()).find(r=>r.id===original.id)),savedRecord);await restored.win.IELTSTodayNavigation.resumeDraft(draft.id);assert.equal(JSON.stringify(restored.win.IELTSTodayNavigation.allDrafts().find(d=>d.id===draft.id)),saved);
 restored.context.__binding=JSON.stringify(oldBinding);const bound=vm.runInContext('JSON.parse(__binding)',restored.context),prepared=await api.prepareVocabularyUnit({courseDay:2}),context=api.readVocabularyContext({courseDay:2,records:prepared.records,drafts:[],binding:bound});assert.equal(context.status,'ready',context.reason);assert.deepEqual(JSON.parse(JSON.stringify(context.binding)),oldBinding);
});

test('a new-batch group receives a real owner-bound receipt and commits through the native record guard',async()=>{
 const {combined}=syntheticPack(),f=await F.mounted(combined,{dictionary:true}),win=f.win,api=win.IELTSFamilyLessonExpansionV95.runtime();for(const file of ['contextual-vocabulary-exposure.js','contextual-vocabulary-course.js','essential-vocabulary-app.js'])vm.runInContext(fs.readFileSync(path.join(root,'assets',file),'utf8'),f.context,{filename:file});win.IELTSMediaLibrary={list:async()=>[]};win.IELTSPlacement={currentRoute:()=>({startDay:3,skills:{}})};
 const prepared=await api.prepareVocabularyUnit({courseDay:3}),context=api.readVocabularyContext({courseDay:3,records:prepared.records,drafts:[]});assert.equal(context.status,'ready',context.reason);const expected=binding(win.IELTSCurriculumData.familyLessonRelease.units.find(u=>u.day===3),win.IELTSCurriculumData);assert.deepEqual(JSON.parse(JSON.stringify(context.binding)),expected);
 const E=win.IELTSEssentialVocabulary,M=win.IELTSMemory,V=win.IELTSVocabularyPractice,id='essential-batch-new-release',now=f.context.Date.now(),marker={type:'family-lesson-v95-context',binding:context.binding};let state=E.startBatch(M.newState(),{id,words:context.targets.slice(0,6),courseDay:3,now,contextSource:marker});let batch=state.essential.batches[id];const session=V.createSession({material:{id:batch.materialId,version:'1',vocabulary:batch.words},courseDay:3});
 session.words.forEach((word,i)=>{for(let n=0;n<3;n++)session.recordSpelling(i,word.word);for(let n=0;n<3;n++){const hash=String(i*3+n+1).padStart(64,'0'),workId='work-'+hash.slice(-40);session.registerStudyWork(i,workId);session.recordSpeaking(i,{workId,hash,evidenceId:hash,provider:'Alibaba oral assessment',verified:true,nonSilent:true,reference:word.word,recordedAt:new Date(now).toISOString(),durationSeconds:1,result:{accuracy:90,fluency:90,completeness:95}});}});
 session.begin();for(let round=0;round<3;round++){session.words.forEach((word,i)=>{session.setAnswer(i,word.word);if(round===2)session.markPlayed(i,{kind:'local-audio',started:true,completed:true,completedAt:new Date(now).toISOString()});});session.submitRound();session.next();}
 const payload=session.getSubmission();state=E.saveBatchDraft(state,id,{draft:session.getDraft(),activeSeconds:0,activityByDate:{}},now,{expectedDraft:null});const store=M.createStore(win.IELTSProfiles.storage());store.read();store.save(state);batch=M.read().essential.batches[id];const memoryRaw=win.IELTSProfiles.storage().getItem(M.KEY),input=win.IELTSEssentialVocabularyApp.recordForBatch(batch,payload,{now});
 await assert.rejects(f.R.record(input),/家人课程词组/);const receipt=await api.prepareVocabularyBatch(context.binding,{courseDay:3,draftId:payload.id,words:batch.words,wordKeys:batch.wordKeys,expectedMemoryRaw:memoryRaw});const result=await f.R.record(input,{familyVocabularyReceipt:receipt});assert.equal(result.record.id,payload.id);assert.deepEqual(JSON.parse(result.record.answer).contextSource.binding,expected);
});

test('multi-batch runtime rejects reordering, missing units and repeated day, word or material identities',()=>{
 const {combined}=syntheticPack(),data=combined.data,helper=require('../assets/family-lesson-expansion-v95.js'),old=binding(data.familyLessonRelease.units[0],data),check=bad=>helper.cleanVocabularyBinding(old,{currentRelease:true,data:bad,assessment:A});
 function changed(mutator){const bad=clone(data);mutator(bad.familyLessonRelease);return bad;}
 function rehash(release){const unit=release.units[1],body={...unit};delete body.unitSha256;unit.unitSha256=A.materialContentHash(body);release.batches[1].units[0].unitSha256=unit.unitSha256;}
 assert.throws(()=>check(changed(r=>r.batches.reverse())),/family-release-catalog/);
 assert.throws(()=>check(changed(r=>r.units.pop())),/family-release-catalog/);
 assert.throws(()=>check(changed(r=>{r.units[1].day=r.units[0].day;r.batches[1].units[0].day=r.units[0].day;rehash(r);})),/family-release-catalog/);
 assert.throws(()=>check(changed(r=>{r.units[1].targets[0].canonicalId=r.units[0].targets[0].canonicalId;rehash(r);})),/family-release-catalog-target-reused/);
 assert.throws(()=>check(changed(r=>{r.units[1].tasks[0].materialRefs[0].materialId=r.units[0].tasks[0].materialRefs[0].materialId;rehash(r);})),/family-release-catalog-material-reused/);
});

test('reviewed batches can share a pinned ordinary baseline material while changed and new-material duplicates stay blocked',async()=>{
 const D=require('../assets/curriculum-data.js'),{base,legacy}=historicalViews(D);
 const original=base.materials.find(m=>m.skill==='grammar'&&m.pool==='training'&&!m.fullTest&&!m.independentBank&&!m.assessmentGroup&&!m.form&&!m.source?.holdout&&m.source?.verification==='reviewed');assert.ok(original);
 const used=new Set(legacy.familyLessonRelease.units.flatMap(unit=>unit.targets.map(target=>target.canonicalId))),pack11=F.packageData(),next11=nextRelease(pack11,11,used,{grammarFrom:original});
 const nextSource=JSON.parse(fs.readFileSync(path.join(next11.root,next11.releasePath)));for(const target of nextSource.units[0].targets)used.add(target.canonicalId);
 const pack12=F.packageData(),next12=nextRelease(pack12,12,used,{grammarFrom:original}),combined=clone(base),appended=Catalog.append(combined,{releases:[{root,releasePath:'curriculum/family-lessons-v109/release.json'},next11,next12]});
 combined.yearFirstUse=clone(D.yearFirstUse);combined.yearFirstUse.coreHash=appended.combinedCoreHash;combined.yearFirstUse.runtimeContract=legacy.yearFirstUse.runtimeContract;
 for(const day of [11,12]){const unit=combined.familyLessonRelease.units.find(u=>u.day===day);assert.equal(unit.tasks.find(t=>t.id==='grammar').materialRefs[0].materialId,original.id);}
 const f=await F.mounted({root:pack11.root,data:combined,day:combined.days[10]},{dictionary:true}),api=f.win.IELTSFamilyLessonExpansionV95.runtime();await api.ensureReady();assert.equal(api.publicPlanningData().materials.length,1842);
 const helper=require('../assets/family-lesson-expansion-v95.js'),old=binding(combined.familyLessonRelease.units[0],combined),reject=mutate=>{const bad=clone(combined),release=bad.familyLessonRelease,u11=release.units.find(u=>u.day===11),u12=release.units.find(u=>u.day===12);mutate(u11,u12);const body={...u12};delete body.unitSha256;u12.unitSha256=A.materialContentHash(body);release.batches.find(b=>b.id===u12.releaseId).units.find(u=>u.day===12).unitSha256=u12.unitSha256;assert.throws(()=>helper.cleanVocabularyBinding(old,{currentRelease:true,data:bad,assessment:A}),/family-release-catalog-material-reused/);};
 reject((_,u12)=>{u12.tasks.find(t=>t.id==='grammar').materialRefs[0].contentHash='f'.repeat(64);});
 reject((u11,u12)=>{u12.tasks.find(t=>t.id==='listening').materialRefs[0].materialId=u11.tasks.find(t=>t.id==='listening').materialRefs[0].materialId;});
 reject((_,u12)=>{u12.tasks.find(t=>t.id==='writing').materialRefs.push(clone(u12.tasks.find(t=>t.id==='grammar').materialRefs[0]));});
});
