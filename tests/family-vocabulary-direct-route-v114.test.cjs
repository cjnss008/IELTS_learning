'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const F=require('./family-lessons-v95-fixture.cjs'),D=require('../assets/curriculum-data.js'),V=require('../assets/vocabulary-practice.js');
const root=path.resolve(__dirname,'..'),day=13,unit=D.familyLessonRelease.units.find(value=>value.day===day),task=unit.tasks.find(value=>value.id==='vocabulary'),ref=task.materialRefs[0],material=D.materials.find(value=>value.id===ref.materialId);
async function mounted(options={}){
 const f=await F.mounted({root,data:D,day:D.days[day-1]},{dictionary:true,...options}),win=f.win,prior=win.fetch;
 win.fetch=async(url,...args)=>{if(String(url).startsWith('/audio/')){const bytes=fs.readFileSync(path.join(root,String(url).slice(1)));return{ok:true,headers:{get:()=>String(bytes.length)},arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}return prior(url,...args);};
 win.IELTSMediaLibrary={list:async()=>[]};win.IELTSPlacement={currentRoute:()=>({startDay:day,skills:{}})};const runtime=win.IELTSFamilyLessonExpansionV95.runtime();await runtime.ensureReady();runtime.publicPlanningData();
 vm.runInContext(fs.readFileSync(path.join(root,'assets/public-course-planner.js'),'utf8'),f.context,{filename:'public-course-planner.js'});
 const adaptive=win.IELTSAdaptivePlan.createStore({data:win.IELTSCurriculumData,storage:win.IELTSProfiles.storage(),contextReady:true,synchronousPublicCourse:true,publicCoursePlanner:win.IELTSPublicCoursePlanner,automaticAdjustments:false});win.IELTSAdaptivePlan={...win.IELTSAdaptivePlan,...adaptive};adaptive.adoptStarted({records:await runtime.prepareCourseRecords(),drafts:[]});assert.equal(adaptive.verifiedPublicCourseState().ready,true);return f;
}

test('real family vocabulary sidebar starts the same day signed word-group page without freezing a second original',async()=>{
 const f=await mounted(),win=f.win,nav=win.IELTSTodayNavigation,storage=win.IELTSProfiles.storage();nav.showDay(day);await F.settle();const before=storage.getItem(F.P.KEY),records=JSON.stringify(await f.R.list());
 await nav.resumeNext('vocabulary',material.id);assert.equal(win.location.href,'词汇记忆.html?day=13');assert.equal(nav.current().active,false);assert.equal(storage.getItem(F.P.KEY),before);assert.equal(JSON.stringify(await f.R.list()),records);
});

test('an existing direct family draft keeps its exact frozen material, input and original ID',async()=>{
 const frozen=F.P.freezeMaterialBinding(material,{assessment:F.A,task:{id:'vocabulary',mode:'practice'},data:D,courseDay:day}),session=V.createSession({material:frozen.material,courseDay:day});session.recordSpelling(0,session.words[0].word);
 const started=session.getDraft().startedAt,id='course-old-family-vocabulary',saved={id,materialId:material.id,taskId:'vocabulary',courseDay:day,mode:'practice',kind:'original',parentId:null,startedAt:started,activeSeconds:0,exposureAtStart:'seen',answers:{},userEvidence:{},text:JSON.stringify(session.getDraft()),transcript:'',audioAvailable:false,audioCompleted:false,transcriptViewed:false,interrupted:false,assistance:{hint:false,answer:false,ai:false},media:[],materialBinding:frozen,familyLessonAssignment:{schema:1,releaseId:unit.releaseId,releaseSha256:unit.releaseSha256,unitId:unit.id,unitSha256:unit.unitSha256,originCourseDay:day,materialId:material.id,materialContentHash:ref.contentHash,bindingContentHash:frozen.contentHash}};
 const state=F.P.newState();state.day=day;state.drafts[id]=saved;const raw=JSON.stringify(state),f=await mounted({entries:{[F.P.KEY]:raw},now:Date.now()+1000}),win=f.win,nav=win.IELTSTodayNavigation,storage=win.IELTSProfiles.storage(),url=win.location.href;let mountedOptions;
 const real=win.IELTSVocabularyPractice;win.IELTSVocabularyPractice={...real,mount(host,options){mountedOptions=options;return real.mount(host,options);}};
 nav.showDay(day,material.id);await F.settle();await f.nodes.get('courseBegin').fire('click');assert.equal(win.location.href,url);assert.equal(nav.current().active,true);assert.equal(storage.getItem(F.P.KEY),raw);assert.equal(JSON.stringify(mountedOptions.material),JSON.stringify(frozen.material));assert.equal(JSON.stringify(mountedOptions.draft),saved.text);assert.equal(mountedOptions.familyBatch,undefined);
});


test('a saved family original and explicit relearning retain their old bound word snapshot',async()=>{
 const Actual=require('./actual-lessons-fixture.cjs'),at=Date.now()-60000,raw=Actual.original(day,{id:'vocabulary',mode:'practice'},material,at,false),frozen=F.P.freezeMaterialBinding(material,{assessment:F.A,task:{id:'vocabulary',mode:'practice'},data:D,courseDay:day,attemptId:raw.id}),artifact=JSON.parse(raw.answer);
 artifact.materialBinding=frozen;artifact.familyLessonAssignment={schema:1,releaseId:unit.releaseId,releaseSha256:unit.releaseSha256,unitId:unit.id,unitSha256:unit.unitSha256,originCourseDay:day,materialId:material.id,materialContentHash:ref.contentHash,bindingContentHash:frozen.contentHash};raw.answer=JSON.stringify(artifact);raw.source='family-lesson-supplement-v95';delete raw.version;delete raw.history;
 const recordState=F.R.put(F.R.newState(),raw,raw.submittedAt).state,f=await mounted({entries:{[F.R.KEY]:JSON.stringify(recordState)},now:Date.now()+1000}),win=f.win,nav=win.IELTSTodayNavigation,original=JSON.stringify(await f.R.list()),url=win.location.href;
 nav.showDay(day,material.id);await F.settle();await nav.showLatestRecord('vocabulary',material.id);assert.equal(win.location.href,url);assert.match(f.nodes.get('courseSubmitStatus').textContent,/只读查看/);assert.equal(JSON.stringify(await f.R.list()),original);
 const again=f.nodes.get('courseResult').querySelector('.course-relearn');assert.ok(again);await again.fire('click');assert.equal(win.location.href,url);assert.equal(nav.current().active,true);assert.equal(nav.current().submitted,false);assert.equal(JSON.stringify(await f.R.list()),original);
 const drafts=JSON.parse(win.IELTSProfiles.storage().getItem(F.P.KEY)).drafts,draft=Object.values(drafts).find(value=>value.parentId===raw.id);assert.ok(draft);assert.deepEqual(draft.materialBinding.material.vocabulary,frozen.material.vocabulary);
});


test('family sidebar does not redirect past due review or an exhausted budget',async()=>{
 const f=await mounted(),win=f.win,nav=win.IELTSTodayNavigation,url=win.location.href;win.IELTSEssentialCourse={state:()=>({dailyReviewRequired:true})};nav.showDay(day);await F.settle();
 await nav.resumeNext('vocabulary',material.id);assert.equal(win.location.href,url);assert.equal(nav.current().active,false);assert.match(f.nodes.get('courseNotice').textContent,/先完成今日必做词汇复习/);
 win.IELTSEssentialCourse={state:()=>({dailyReviewRequired:false})};win.IELTSStudyTimer={snapshot:()=>({running:false}),budget:()=>({remainingMinutes:0,exhausted:true,dayEnded:false})};
 await nav.resumeNext('vocabulary',material.id);assert.equal(win.location.href,url);assert.equal(nav.current().active,false);assert.match(f.nodes.get('courseNotice').textContent,/预算已用完/);
});
