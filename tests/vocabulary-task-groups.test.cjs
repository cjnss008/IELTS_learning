'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const root=path.resolve(process.env.IELTS_GROUP_TEST_ROOT||path.join(__dirname,'..')),load=createRequire(path.join(root,'tests/vocabulary-task-groups.test.cjs')),playerFile=process.env.IELTS_GROUP_PLAYER||path.join(root,'assets/course-player.js');
const P=require(playerFile),Current=load('../assets/curriculum-data.js'),D=load('./published-public-baseline-fixture.cjs')(Current),X=load('../assets/course-expansion.js'),V=load('../assets/vocabulary-practice.js');
function plan(day){return X.overlay(D.days[day-1],D);}
test('the frozen pre-family second lesson reports all three groups and 19 word items rather than only the first eight',()=>{const day=plan(2),before=JSON.stringify(day),value=P.vocabularyTaskSummary(day.tasks.find(t=>t.id==='vocabulary'),D,{vocabulary:V});assert.equal(value.groupCount,3);assert.equal(value.wordCount,19);assert.deepEqual(value.groups.map(g=>g.wordCount),[8,4,7]);assert.equal(JSON.stringify(day),before);});
test('an older two-group lesson contract stays at twelve items and cannot silently acquire the new seven',()=>{const old={...D.days[1].tasks.find(t=>t.id==='vocabulary'),materialIds:['w01-read-2-vocabulary','lexical-w01-2']},before=JSON.stringify(old),value=P.vocabularyTaskSummary(old,D,{vocabulary:V});assert.equal(value.groupCount,2);assert.equal(value.wordCount,12);assert.deepEqual(value.groups.map(g=>g.wordCount),[8,4]);assert.equal(JSON.stringify(old),before);});
test('frozen public lessons 2–10 derive group totals from their material lists without changing course data',()=>{const before=JSON.stringify(D);for(let day=2;day<=10;day++){const task=plan(day).tasks.find(t=>t.id==='vocabulary'),summary=P.vocabularyTaskSummary(task,D,{vocabulary:V}),words=new Set();for(const id of task.materialIds)for(const word of V.wordsFor(D.materials.find(m=>m.id===id),{curriculumData:D}))words.add(word.word.trim().toLowerCase());assert.equal(summary.groupCount,task.materialIds.length);assert.equal(summary.wordCount,words.size);}assert.equal(JSON.stringify(D),before);});
test('current bound vocabulary overrides its newer registry copy and unknown materials do not invent totals',()=>{const material=D.materials.find(m=>m.skill==='vocabulary'),bound={...material,vocabulary:material.vocabulary.slice(0,1)},task={id:'vocabulary',materialIds:[material.id]};assert.equal(P.vocabularyTaskSummary(task,D,{vocabulary:V,currentMaterial:bound}).wordCount,1);assert.equal(P.vocabularyTaskSummary({...task,materialIds:['missing']},D,{vocabulary:V}),null);assert.equal(P.vocabularyTaskSummary({id:'reading'},D),null);});
function domFixture(){const filename=path.join(root,'tests/course-player-dom.test.cjs'),prefix=fs.readFileSync(filename,'utf8').split('\ntest(')[0],module={exports:{}},custom=id=>id==='node:fs'?{...fs,readFileSync(file,...args){return fs.readFileSync(path.resolve(file)===path.join(root,'assets/course-player.js')?playerFile:file,...args);}}:createRequire(filename)(id);new Function('require','__dirname','module',prefix+'\nmodule.exports={fixture};')(custom,path.dirname(filename),module);return module.exports.fixture;}
test('actual course material view displays the course total and the current vocabulary group together',async()=>{const day=plan(2),material=D.materials.find(m=>m.id===day.tasks.find(t=>t.id==='vocabulary').materialIds[0]),fixture=domFixture(),f=fixture(material,{search:'?day=2',window:{IELTSVocabularyPractice:V,IELTSCourseExpansion:X},setup:data=>{Object.assign(data,D);data.days=D.days.map(item=>item.day===2?day:item);}});await new Promise(setImmediate);assert.match(f.nodes.get('courseMaterialIntro').textContent,/本课词汇共 19 个词项，分 3 组/);assert.match(f.nodes.get('courseMaterialIntro').textContent,/当前第 1 组：7 个词项/);assert.equal(f.nodes.get('courseMaterials').querySelectorAll('button').length,3);const next=f.nodes.get('courseMaterials').querySelectorAll('button')[1];await next.fire('click');assert.match(f.nodes.get('courseMaterialIntro').textContent,/当前第 2 组：8 个词项/);assert.equal(f.records().length,0);});

// Current signed curriculum is checked separately from the historical group UI.
test('the unstarted current second lesson displays its 30 reviewed targets in the actual player DOM',async()=>{
 const unit=Current.familyLessonRelease?.units.find(item=>item.day===2);assert.ok(unit);assert.equal(unit.targets.length,30);
 const refs=unit.tasks.find(task=>task.id==='vocabulary').materialRefs;assert.equal(refs.length,5);
 for(const ref of refs)assert.equal(Current.materials.find(m=>m.id===ref.materialId).vocabulary.length,6);
 const F=load('./family-lessons-v95-fixture.cjs'),f=await F.mounted({root,data:Current,day:Current.days.find(item=>item.day===2)},{dictionary:true}),nav=f.win.IELTSTodayNavigation;
 nav.showDay(2);await F.settle();const intro=f.nodes.get('courseMaterialIntro'),words=unit.targets.map(target=>target.canonicalWord||target.word||target.surface);
 assert.match(intro.textContent,/第 2 课 · 30 个主题词/);assert.ok(intro.textContent.includes(words.join(' · ')));
 assert.match(intro.textContent,/分五组六词/);assert.ok(intro.querySelectorAll('button').some(button=>button.textContent==='继续本课词汇'));
 assert.equal(f.nodes.get('courseStart').hidden,true);assert.equal((await f.R.list()).length,0);assert.equal(nav.allDrafts().length,0);
});

// Real compiled data with a synthetic archive of the pre-family lesson.
async function oldVocabularyFixture({draftGroup=null,submittedGroup=null,completeOld=false}={}){
 const F=load('./family-lessons-v95-fixture.cjs'),Actual=load('./actual-lessons-fixture.cjs'),Adaptive=load('../assets/adaptive-plan.js'),oldDay=plan(2),oldTask=oldDay.tasks.find(t=>t.id==='vocabulary'),ids=X.orderedMaterialIds(oldTask,2),inputs=[];
 function add(day,task,material){const input=Actual.original(day,task,material,Date.parse('2026-10-24T10:00:00.000Z'),false),artifact=JSON.parse(input.answer);
  artifact.materialBinding=P.freezeMaterialBinding(material,{assessment:F.A,data:D,task,courseDay:day,attemptId:input.id});input.answer=JSON.stringify(artifact);delete input.version;delete input.history;inputs.push(input);}
 if(completeOld){for(const n of [1,2]){const day=X.overlay(D.days.find(d=>d.day===n),D);for(const task of day.tasks.filter(t=>t.id!=='reflection'))for(const id of task.materialIds)add(n,task,D.materials.find(m=>m.id===id));}}
 else if(submittedGroup!==null)add(2,oldTask,D.materials.find(m=>m.id===ids[submittedGroup]));
 let state=F.R.newState();for(const input of inputs)state=F.R.put(state,input,'2026-10-24T12:00:00.000Z').state;
 const adaptive=Adaptive.newState();adaptive.startedDays=[2];adaptive.frozenDays[2]=F.copy(oldDay);
 const entries={[F.R.KEY]:JSON.stringify(state),[Adaptive.KEY]:JSON.stringify(adaptive)};
 if(completeOld)entries[Actual.M.KEY]=JSON.stringify(Actual.ledgerFor(inputs));
 let draft=null;
 if(draftGroup!==null){const material=D.materials.find(m=>m.id===ids[draftGroup]),session=V.createSession({material,courseDay:2});session.recordSpelling(0,session.words[0].word);const id='old-second-group-retained';
  draft={id,materialId:material.id,materialBinding:P.freezeMaterialBinding(material,{assessment:F.A,data:D,task:oldTask,courseDay:2,attemptId:id}),taskId:'vocabulary',courseDay:2,mode:'practice',kind:'original',parentId:null,startedAt:'2026-10-24T11:30:00.000Z',activeSeconds:10,exposureAtStart:'seen',answers:{},userEvidence:{},text:JSON.stringify(session.getDraft()),transcript:'',audioAvailable:false,audioCompleted:false,transcriptViewed:false,interrupted:false,assistance:{hint:false,answer:false,ai:false},media:[]};
  const player=P.newState();player.drafts[id]=draft;entries[P.KEY]=JSON.stringify(player);}
 const f=await F.mounted({root,data:Current,day:oldDay},{entries,dictionary:true,now:Date.now()+60000});
 const fallback=f.win.fetch;f.win.fetch=async(url,options)=>{if(String(url).startsWith('/audio/')){const bytes=fs.readFileSync(path.join(root,String(url).slice(1)));return{ok:true,headers:{get:()=>String(bytes.length)},arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}return fallback(url,options);};
 f.win.IELTSMediaLibrary={list:async()=>[]};return{f,nav:f.win.IELTSTodayNavigation,ids,draft,inputs,oldTask};
}
test('a frozen old second-group draft keeps the three-group overview and restores the original input',async()=>{
 const {f,nav,draft,ids}=await oldVocabularyFixture({draftGroup:1});nav.showDay(2);await load('./family-lessons-v95-fixture.cjs').settle();
 assert.match(f.nodes.get('courseMaterialIntro').textContent,/本课词汇共 19 个词项，分 3 组/);assert.doesNotMatch(f.nodes.get('courseMaterialIntro').textContent,/30 个主题词/);
 assert.equal(f.nodes.get('courseMaterials').querySelectorAll('.course-material-button').length,3);assert.equal(nav.allDrafts().find(d=>d.id===draft.id).materialId,ids[1]);
 await nav.resumeDraft(draft.id);assert.equal(JSON.stringify(nav.allDrafts().find(d=>d.id===draft.id)),JSON.stringify(draft));assert.equal((await f.R.list()).length,0);
});
test('hydrating only an old second-group submission restores the old overview and read-only original',async()=>{
 const {f,nav,ids}=await oldVocabularyFixture({submittedGroup:1});const rows=await f.R.list(),saved=rows.find(r=>r.materialId===ids[1]);assert.ok(saved);assert.equal(rows.some(r=>r.materialId===ids[0]),false);
 assert.match(f.nodes.get('courseMaterialIntro').textContent,/本课词汇共 19 个词项，分 3 组/);assert.doesNotMatch(f.nodes.get('courseMaterialIntro').textContent,/30 个主题词/);
 assert.equal(f.nodes.get('courseMaterials').querySelectorAll('.course-material-button').length,3);await nav.showLatestRecord('vocabulary',ids[1]);
 assert.match(f.nodes.get('courseSubmitStatus').textContent,/只读查看/);assert.equal(JSON.stringify((await f.R.list()).find(r=>r.id===saved.id)),JSON.stringify(saved));
});
test('a genuinely started signed family group still displays the new 30 targets alongside old submitted work',async()=>{
 const {f,nav,ids}=await oldVocabularyFixture({completeOld:true}),win=f.win,api=win.IELTSFamilyLessonExpansionV95.runtime();assert.equal(f.M.forDay(1).completionValid,true);assert.equal(f.M.forDay(2).completionValid,true);
 for(const name of ['public-course-planner.js','public-course-worker.js'])require('node:vm').runInContext(fs.readFileSync(path.join(root,'assets',name),'utf8'),f.context,{filename:name});
 const adaptive=win.IELTSAdaptivePlan.createStore({data:win.IELTSCurriculumData,storage:win.IELTSProfiles.storage(),profileId:'legacy',getProfile:()=>win.IELTSProfiles.current().id,automaticAdjustments:false,preparePublicCourse:async request=>{let response;await win.IELTSPublicCourseWorkerProtocol.createHandler({planner:win.IELTSPublicCoursePlanner,postMessage:value=>{response=value;}})(request);return response;}});
 win.IELTSAdaptivePlan={...win.IELTSAdaptivePlan,...adaptive};const rows=await api.prepareCourseRecords();adaptive.adoptStarted({records:rows,drafts:nav.allDrafts()});await adaptive.preparePublicCourse();assert.equal(adaptive.verifiedPublicCourseState().ready,true);
 const prepared=await api.prepareVocabularyUnit({courseDay:2}),context=api.readVocabularyContext({courseDay:2,records:prepared.records,drafts:[]});assert.equal(context.status,'ready',context.reason);
 const E=win.IELTSEssentialVocabulary,M=win.IELTSMemory,now=f.context.Date.now(),id='essential-batch-signed-second-lesson';let memory=E.startBatch(M.read(),{id,words:context.targets.slice(0,6),courseDay:2,now,contextSource:{type:'family-lesson-v95-context',binding:context.binding}});
 const batch=memory.essential.batches[id],session=win.IELTSVocabularyPractice.createSession({material:{id:batch.materialId,version:'1',vocabulary:batch.words},courseDay:2});
 memory=E.saveBatchDraft(memory,id,{draft:session.getDraft(),activeSeconds:0,activityByDate:{}},now,{expectedDraft:null});const store=M.createStore(win.IELTSProfiles.storage());store.read();store.save(memory);
 const before=JSON.stringify(await f.R.list());nav.showDay(2);await load('./family-lessons-v95-fixture.cjs').settle();
 assert.match(f.nodes.get('courseMaterialIntro').textContent,/第 2 课 · 30 个主题词/);assert.equal(JSON.stringify(await f.R.list()),before);
 await nav.showLatestRecord('vocabulary',ids[1]);assert.match(f.nodes.get('courseSubmitStatus').textContent,/只读查看/);assert.equal(JSON.stringify(await f.R.list()),before);
});
