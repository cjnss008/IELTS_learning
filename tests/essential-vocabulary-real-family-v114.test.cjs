'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const F=require('./family-lessons-v95-fixture.cjs'),Data=require('../assets/essential-vocabulary-data.js');
const {binding}=require('./daily-review-fixture.cjs').helper('family-multibatch-runtime.test.cjs','binding');
const BASE=Date.parse('2026-01-01T04:00:00Z'),DAY=86400000;
const EXT=['kilogram','rent','heating','cloudy','snowy','freezing','Celsius','volleyball','aerobics','yoga','website','email','password','username','login','logout','download','upload','browser','online','offline','tutorial','algebra','reuse'];
function signedFixture(day=2){
 const pack=F.packageData(),dir=path.join(pack.root,'fixtures'),releaseFile=path.join(dir,'release.json'),release=JSON.parse(fs.readFileSync(releaseFile,'utf8')),unit=release.units[0];
 unit.day=day;
 const core=unit.targets.slice(0,5).map(t=>Data.entries.find(e=>e.id===t.canonicalId)),litre=Data.entries.find(e=>e.id==='essential:litre');assert.equal(core.length,5);assert.ok(litre.spellingVariants.includes('liter'));
 const identities=[...EXT.map(word=>({id:'extension:'+word.toLowerCase(),canonicalWord:word,word,extension:true})),...core.map(e=>({id:e.id,canonicalWord:e.word,word:e.word})),{id:litre.id,canonicalWord:litre.word,word:'liter'}];
 const body=identities.map(e=>e.word).join(' ')+'. A red bag is on the table.',wordAudio='audio/curriculum/synthetic-family-word.mp3',voice=fs.readFileSync(path.join(__dirname,'../audio/curriculum/family-linked-d13-v114-word-kilogram.mp3'));fs.mkdirSync(path.join(pack.root,'audio/curriculum'),{recursive:true});fs.writeFileSync(path.join(pack.root,wordAudio),voice);
 const writeMaterial=(id,mutate)=>{const row=release.materials.find(r=>r.id===id),file=path.join(dir,row.file),material=JSON.parse(fs.readFileSync(file,'utf8'));mutate(material);const bytes=Buffer.from(JSON.stringify(material)+'\n');fs.writeFileSync(file,bytes);row.fileSha256=F.sha(bytes);row.materialContentHash=F.A.materialContentHash(material);row.questionsSha256=F.sha(Buffer.from(JSON.stringify(material.questions)));unit.tasks.flatMap(t=>t.materialRefs).filter(ref=>ref.materialId===id).forEach(ref=>{ref.contentHash=row.materialContentHash;});};
 writeMaterial('new-reading',m=>{m.passage=body;});
 writeMaterial('new-vocabulary',m=>{m.vocabulary=identities.map(e=>({word:e.word,meaning:'Synthetic meaning only',pos:'n.',ipa:'/tɛst/',audio:wordAudio,example:body}));});
 let start=0;unit.targets=identities.map(e=>{const target={canonicalId:e.id,sourceMaterialId:'new-reading',sourceTextSha256:F.A.sourceTextHash(body),surface:e.word,start,end:start+e.word.length,meaning:'Synthetic meaning only',partOfSpeech:'n.',quote:body,quoteStart:0,quoteEnd:body.length,audioRef:{src:wordAudio,sha256:F.sha(voice),bytes:voice.length}};start+=e.word.length+1;if(e.extension){target.canonicalWord=e.canonicalWord;target.dictionaryReview={status:'dictionary-reference-checked',partOfSpeech:'n.',sourceUrl:'https://example.org/dictionary/synthetic',checkedOn:'2026-10-29'};}else if(e.word!==e.canonicalWord){target.trainingWord=e.word;}return target;});
 const review={schema:1,releaseId:release.id,decision:'approved-ordinary-six-module-content',reviewStatus:'root-ai-content-and-binding-reviewed-not-human',independentAssessmentEligible:false,targetBindingsReviewed:true,releasePayloadSha256:F.sha(Buffer.from(JSON.stringify({id:release.id,policy:release.policy,materials:release.materials,units:release.units}))),materials:F.copy(release.materials),units:[{id:unit.id,unitPayloadSha256:F.sha(Buffer.from(JSON.stringify(unit)))}]},reviewBytes=Buffer.from(JSON.stringify(review)+'\n');
 fs.writeFileSync(path.join(dir,'review.json'),reviewBytes);release.rootReview={file:'review.json',sha256:F.sha(reviewBytes)};fs.writeFileSync(releaseFile,JSON.stringify(release)+'\n');
 const data=F.copy(pack.data);data.materials=data.materials.filter(m=>!m.source?.familyLessonV95);delete data.familyLessonRelease;if(day!==2)data.days.push({...F.copy(data.days[0]),day});
 F.Loader.apply(data,{root:pack.root,releasePath:'fixtures/release.json',player:F.P,essential:Data});return{...pack,data,day:data.days[0]};
}
async function mountedFixture(pack,options){
 const f=await F.mounted(pack,options),win=f.win,previous=win.fetch;
 win.fetch=async(url,...args)=>{if(String(url)==='/audio/curriculum/synthetic-family-word.mp3'){const bytes=fs.readFileSync(path.join(pack.root,String(url).slice(1)));return{ok:true,headers:{get:()=>String(bytes.length)},arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}return previous(url,...args);};
 for(const name of ['american-pronunciations.js','word-dictionary.js','vocabulary-practice.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets',name),'utf8'),f.context,{filename:name});
 return f;
}

test('real signed family loader, runtime and vocabulary core accept extensions and retain them on a later day',async()=>{
 const pack=signedFixture(),f=await mountedFixture(pack,{now:BASE+600001,dictionary:true}),win=f.win;
 for(const name of ['contextual-vocabulary-exposure.js','contextual-vocabulary-course.js','essential-vocabulary-app.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets',name),'utf8'),f.context,{filename:name});
 win.IELTSMediaLibrary={list:async()=>[]};win.IELTSPlacement={currentRoute:()=>({startDay:2,skills:{}})};
 const runtime=win.IELTSFamilyLessonExpansionV95.runtime(),ready=await runtime.prepareVocabularyUnit({courseDay:2});assert.equal(ready.status,'ready',JSON.stringify(ready));
 const lexicon=runtime.readVocabularyLexicon({records:ready.records});assert.equal(lexicon.status,'ready',JSON.stringify(lexicon));assert.equal(lexicon.entries.filter(e=>e.kind==='extension').length,24);assert.equal(lexicon.entries.find(e=>e.id==='essential:litre').word,'litre');assert.notEqual(runtime.readVocabularyLexicon({records:[...ready.records]}).status,'ready');
 const context=win.IELTSContextualVocabulary.familyVocabularyContext({courseDay:2,records:ready.records,vocabularyData:Data});assert.equal(context.status,'ready',JSON.stringify(context));assert.equal(context.targets.find(e=>e.word==='liter').familyCanonicalId,'essential:litre');
 const E=win.IELTSEssentialVocabulary,M=win.IELTSMemory,opts=(records,more={})=>({data:Data,courseDay:2,now:BASE,records,familyRecords:records,familyDrafts:[],remainingMinutes:360,vocabularyMinutes:180,newWordMinutes:.5,...more});
 let state=M.newState(),planned=E.plan(state,opts(ready.records));assert.equal(planned.newWords.length,30);assert.equal(planned.stats.total,8000);assert.equal(planned.newWords.filter(e=>e.lexicalKind==='extension').length,24);
 const chosen=['kilogram','Celsius','liter'].map(w=>planned.newWords.find(e=>e.word===w)),id='essential-batch-real-family',now=f.context.Date.now(),V=win.IELTSVocabularyPractice;
 state=E.startBatch(state,{id,words:chosen,courseDay:2,now,contextSource:planned.familyContext.contextSource});let batch=state.essential.batches[id];const session=V.createSession({material:{id:batch.materialId,version:'1',vocabulary:batch.words},courseDay:2,familyBatch:batch,familyRecords:ready.records,vocabularyData:Data});
 session.words.forEach((word,i)=>{for(let n=0;n<3;n++)session.recordSpelling(i,word.word);for(let n=0;n<3;n++){const hash=String(i*3+n+1).padStart(64,'0'),workId='work-'+hash.slice(-40);session.registerStudyWork(i,workId);session.recordSpeaking(i,{workId,hash,evidenceId:hash,provider:'Alibaba oral assessment',verified:true,nonSilent:true,reference:word.word,recordedAt:new Date(now).toISOString(),durationSeconds:1,result:{accuracy:90,fluency:90,completeness:95}});}});
 session.begin();for(let round=0;round<3;round++){session.words.forEach((word,i)=>{session.setAnswer(i,word.word);if(round===2)session.markPlayed(i,{kind:'local-audio',started:true,completed:true,completedAt:new Date(now).toISOString()});});session.submitRound();session.next();}
 const payload=session.getSubmission();state=E.saveBatchDraft(state,id,{draft:session.getDraft(),activeSeconds:0,activityByDate:{}},now,{expectedDraft:null});const store=M.createStore(win.IELTSProfiles.storage());store.read();store.save(state);batch=M.read().essential.batches[id];const memoryRaw=win.IELTSProfiles.storage().getItem(M.KEY),input=win.IELTSEssentialVocabularyApp.recordForBatch(batch,payload,{now});
 await assert.rejects(f.R.record(input),/家人课程词组/);const receipt=await runtime.prepareVocabularyBatch(context.binding,{courseDay:2,draftId:payload.id,words:batch.words,wordKeys:batch.wordKeys,expectedMemoryRaw:memoryRaw});const result=await f.R.record(input,{familyVocabularyReceipt:receipt});assert.equal(result.record.id,payload.id);
 state=E.completeBatch(state,id,payload,result.record);store.save(state);const refreshed=await runtime.prepareVocabularyUnit({courseDay:2});assert.equal(refreshed.status,'ready',JSON.stringify(refreshed));
 planned=E.plan(state,opts(refreshed.records,{now:BASE+600001}));assert.equal(planned.quota.completedToday,3);assert.equal(planned.stats.initialCompleted,1);assert.equal(planned.stats.extensionInitialCompleted,2);assert.equal(planned.familyUnit.completed,3);
 const later=await runtime.prepareVocabularyUnit({courseDay:3});assert.equal(later.status,'inactive');assert.ok(Array.isArray(later.records));assert.equal(runtime.readVocabularyLexicon({records:later.records}).status,'ready');
 const future=E.plan(state,opts(later.records,{courseDay:3,now:BASE+4*DAY}));assert.equal(future.stats.initialCompleted,1);assert.equal(future.stats.extensionInitialCompleted,2);assert.ok(future.allDue.some(w=>w.word==='kilogram'));assert.ok(future.allDue.some(w=>w.word==='Celsius'));assert.ok(future.allDue.some(w=>w.word==='liter'));
});


test('an older submitted core litre is recognized by the real family helper as already learned',async()=>{
 const pack=signedFixture(3),f=await mountedFixture(pack,{now:BASE+600001,dictionary:true}),win=f.win;
 for(const name of ['contextual-vocabulary-exposure.js','contextual-vocabulary-course.js','essential-vocabulary-app.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets',name),'utf8'),f.context,{filename:name});
 const E=win.IELTSEssentialVocabulary,M=win.IELTSMemory,V=win.IELTSVocabularyPractice,id='essential-batch-old-british',now=f.context.Date.now(),word=Data.entries.find(e=>e.id==='essential:litre');
 let state=E.startBatch(M.newState(),{id,words:[word],courseDay:2,now});let batch=state.essential.batches[id];const session=V.createSession({material:{id:batch.materialId,version:'1',vocabulary:batch.words},courseDay:2});
 session.words.forEach((item,i)=>{for(let n=0;n<3;n++)session.recordSpelling(i,item.word);for(let n=0;n<3;n++){const hash=String(i*3+n+1).padStart(64,'0'),workId='work-'+hash.slice(-40);session.registerStudyWork(i,workId);session.recordSpeaking(i,{workId,hash,evidenceId:hash,provider:'Alibaba oral assessment',verified:true,nonSilent:true,reference:item.word,recordedAt:new Date(now).toISOString(),durationSeconds:1,result:{accuracy:90,fluency:90,completeness:95}});}});
 session.begin();for(let round=0;round<3;round++){session.words.forEach((item,i)=>{session.setAnswer(i,item.word);if(round===2)session.markPlayed(i,{kind:'local-audio',started:true,completed:true,completedAt:new Date(now).toISOString()});});session.submitRound();session.next();}
 const payload=session.getSubmission();state=E.saveBatchDraft(state,id,{draft:session.getDraft(),activeSeconds:0,activityByDate:{}},now,{expectedDraft:null});const store=M.createStore(win.IELTSProfiles.storage());store.read();store.save(state);batch=M.read().essential.batches[id];const input=win.IELTSEssentialVocabularyApp.recordForBatch(batch,payload,{now}),result=await f.R.record(input);
 state=E.completeBatch(state,id,payload,result.record);store.save(state);const runtime=win.IELTSFamilyLessonExpansionV95.runtime(),ready=await runtime.prepareVocabularyUnit({courseDay:3});assert.equal(ready.status,'ready');
 const progress=runtime.vocabularyUnitProgress(3,ready.records,[]);assert.equal(progress.status,'ready',JSON.stringify(progress));
 const p=E.plan(state,{data:Data,courseDay:3,now:now+1,records:ready.records,familyRecords:ready.records,familyDrafts:[],remainingMinutes:360,vocabularyMinutes:180,newWordMinutes:.5});assert.equal(p.stats.initialCompleted,1);assert.ok(!p.newWords.some(e=>e.word==='liter'));
 // Simulate a stale already-open family group. The last receipt check must
 // reject the existing canonical headword even though the display differs.
 win.IELTSMediaLibrary={list:async()=>[]};win.IELTSPlacement={currentRoute:()=>({startDay:3,skills:{}})};
 const rawBinding=binding(win.IELTSCurriculumData.familyLessonRelease.units[0],win.IELTSCurriculumData);f.context.__binding=JSON.stringify(rawBinding);const bound=vm.runInContext('JSON.parse(__binding)',f.context),ctx=runtime.readVocabularyContext({courseDay:3,records:ready.records,drafts:[],binding:bound});assert.equal(ctx.status,'ready',JSON.stringify(ctx));
 const candidate=ctx.targets.find(item=>item.word==='liter'),nextId='essential-batch-stale-us';state=E.startBatch(state,{id:nextId,words:[candidate],courseDay:3,now,contextSource:{type:'family-lesson-v95-context',binding:bound}});batch=state.essential.batches[nextId];const next=V.createSession({material:{id:batch.materialId,version:'1',vocabulary:batch.words},courseDay:3,familyBatch:batch,familyRecords:ready.records,vocabularyData:Data});
 next.words.forEach((item,i)=>{for(let n=0;n<3;n++)next.recordSpelling(i,item.word);for(let n=0;n<3;n++){const hash=String(i*3+n+11).padStart(64,'0'),workId='work-'+hash.slice(-40);next.registerStudyWork(i,workId);next.recordSpeaking(i,{workId,hash,evidenceId:hash,provider:'Alibaba oral assessment',verified:true,nonSilent:true,reference:item.word,recordedAt:new Date(now).toISOString(),durationSeconds:1,result:{accuracy:90,fluency:90,completeness:95}});}});
 next.begin();for(let round=0;round<3;round++){next.words.forEach((item,i)=>{next.setAnswer(i,item.word);if(round===2)next.markPlayed(i,{kind:'local-audio',started:true,completed:true,completedAt:new Date(now).toISOString()});});next.submitRound();next.next();}
 const nextPayload=next.getSubmission();state=E.saveBatchDraft(state,nextId,{draft:next.getDraft(),activeSeconds:0,activityByDate:{}},now,{expectedDraft:null});store.save(state);batch=M.read().essential.batches[nextId];const currentRaw=win.IELTSProfiles.storage().getItem(M.KEY);
 await assert.rejects(runtime.prepareVocabularyBatch(bound,{courseDay:3,draftId:nextPayload.id,words:batch.words,wordKeys:batch.wordKeys,expectedMemoryRaw:currentRaw}),/already|prior|learned|known|重复|已有|已学/);
 assert.equal(progress.previouslyLearned,1,JSON.stringify(progress));
});


test('a signed lexicon alone cannot authorize a family new-word context when audio bytes changed',async()=>{
 const pack=signedFixture(),file=path.join(pack.root,'audio/curriculum/synthetic-family-word.mp3'),bytes=fs.readFileSync(file);bytes[bytes.length-1]^=1;fs.writeFileSync(file,bytes);
 const f=await mountedFixture(pack,{now:BASE+600001,dictionary:true}),win=f.win;vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/contextual-vocabulary-course.js'),'utf8'),f.context,{filename:'contextual-vocabulary-course.js'});
 const runtime=win.IELTSFamilyLessonExpansionV95.runtime(),records=await runtime.prepareCourseRecords();assert.equal(runtime.readVocabularyLexicon({records}).status,'ready');
 await assert.rejects(runtime.prepareVocabularyUnit({courseDay:2}),/audio/);const context=win.IELTSContextualVocabulary.familyVocabularyContext({courseDay:2,records,vocabularyData:Data});assert.equal(context.status,'pending');assert.match(context.reason,/audio/);
 const p=win.IELTSEssentialVocabulary.plan(win.IELTSMemory.newState(),{data:Data,courseDay:2,now:BASE+600001,records,familyRecords:records,familyDrafts:[],remainingMinutes:360,vocabularyMinutes:180,newWordMinutes:.5,contextWords:[{id:'extension:kilogram',word:'kilogram',meaning:'unit',example:'one kilogram'}]});assert.equal(p.newWords.length,0);
});
