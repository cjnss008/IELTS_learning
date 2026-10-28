'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const D=require('../assets/curriculum-data.js'),A=require('../assets/assessment-core.js'),root=path.resolve(__dirname,'..');
const baseline=require('./published-public-baseline-fixture.cjs')(D),manifest=require('../curriculum/family-lessons-v109/release.json');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');

test('the actual linked release adds seven complete lessons, five small word groups per lesson, and leaves all historical course objects unchanged',()=>{
 assert.deepEqual(D.days,baseline.days);
 assert.deepEqual(D.materials.slice(0,1842),baseline.materials);
 assert.deepEqual(D.familyLessonRelease.units.map(u=>u.day),[4,5,6,7,8,9,10]);
 assert.equal(manifest.materials.length,70);
 const all=new Set(),prior=new Set(baseline.days.slice(0,4).flatMap(d=>d.tasks.filter(t=>t.id==='vocabulary').flatMap(t=>t.materialIds.flatMap(id=>baseline.materials.find(m=>m.id===id).vocabulary.map(w=>w.word.toLowerCase())))));
 for(const unit of D.familyLessonRelease.units){
  assert.equal(unit.targets.length,30);
  assert.deepEqual(unit.tasks.map(t=>t.id).sort(),['grammar','listening','reading','speaking','vocabulary','writing']);
  const refs=unit.tasks.find(t=>t.id==='vocabulary').materialRefs;
  assert.equal(refs.length,5);
  for(const ref of refs)assert.equal(D.materials.find(m=>m.id===ref.materialId).vocabulary.length,6);
  const oldCourseWords=new Set(baseline.days[unit.day-1].tasks.find(t=>t.id==='vocabulary').materialIds.flatMap(id=>baseline.materials.find(m=>m.id===id).vocabulary.map(w=>w.word.toLowerCase())));
  for(const target of unit.targets){
   assert.ok(!all.has(target.canonicalId),target.canonicalWord+' is repeated in the new batch');all.add(target.canonicalId);
   assert.ok(!prior.has(target.canonicalWord),target.canonicalWord+' was taught in lessons 1–4');
   assert.ok(!oldCourseWords.has(target.canonicalWord),target.canonicalWord+' would be reserved by the original course and block the new group');
   const source=D.materials.find(m=>m.id===target.sourceMaterialId),body=source.passage||source.transcript;
   assert.equal(body.slice(target.start,target.end),target.surface);assert.equal(body.slice(target.quoteStart,target.quoteEnd),target.quote);
   assert.equal(A.sourceTextHash(body),target.sourceTextSha256);
   assert.equal(sha(fs.readFileSync(path.join(root,target.audioRef.src))),target.audioRef.sha256);
  }
 }
 assert.equal(all.size,210);
});

test('all new objective questions accept their published answers, reject wrong answers, and match their evidence; role audio matches its actual transcript',()=>{
 for(const row of manifest.materials){
  const m=JSON.parse(fs.readFileSync(path.join(root,'curriculum/family-lessons-v109',row.file)));
  assert.equal(A.materialContentHash(m),row.materialContentHash,m.id);
  if(m.skill==='grammar')assert.ok(m.questions.length>=14,m.id);
  if(m.skill==='reading')assert.ok(m.questions.length>=12,m.id);
  if(m.skill==='listening')assert.ok(m.questions.length>=8,m.id);
  for(const q of m.questions||[]){
   assert.equal(A.gradeQuestion(q,q.answers[0]).correct,true,m.id+'/'+q.id);
   assert.equal(A.gradeQuestion(q,'unrelated incorrect response').correct,false,m.id+'/'+q.id);
   assert.ok(q.explanation.length>=10);
   if(m.skill!=='grammar'){assert.doesNotMatch(q.prompt,/[\u4e00-\u9fff]/);assert.ok((m.passage||m.transcript).includes(q.evidence));}
  }
  if(m.skill==='listening'){
   const meta=JSON.parse(fs.readFileSync(path.join(root,'curriculum/audio',m.id+'.json')));
   assert.equal(meta.transcriptHash,sha(m.transcript));assert.equal(meta.audioHash,sha(fs.readFileSync(path.join(root,m.audio))));
   assert.ok(meta.voices.length>=2);assert.ok(meta.voices.every(v=>v.startsWith('en-US-')));assert.ok(meta.segments.length>2);
  }
 }
});

test('the word page includes the real completion and course-order dependencies before its consumer',()=>{
 const policy=require('../server/year-runtime-contract-policy.cjs'),file='词汇记忆.html',contract='curriculum/year-first-use-runtime-contract-v109-linked-lessons.json',html=fs.readFileSync(path.join(root,file),'utf8');
 assert.equal(policy.pageDependencyProblem(file,html,contract),null);
 for(const name of ['daily-plan-core','daily-plan-state','essential-vocabulary-course','today-hub','daily-learning-load']){
  const broken=html.replace(new RegExp('<script[^>]+data-src="assets/'+name+'\\.js"[^>]*><\\/script>'),'');
  assert.notEqual(policy.pageDependencyProblem(file,broken,contract),null,name);
 }
});

test('the checked public view can be reused without permitting later mutations of the published materials or days',async()=>{
 const F=require('./family-lessons-v95-fixture.cjs'),f=await F.mounted({root,data:D,day:D.days[4]},{dictionary:true}),api=f.win.IELTSFamilyLessonExpansionV95.runtime();
 await api.prepareCourseRecords();const view=api.publicPlanningData(),data=f.win.IELTSCurriculumData;
 assert.equal(view.materials.length,1842);assert.equal(Object.isFrozen(data),true);
 assert.equal(Object.isFrozen(data.materials[0]),true);assert.equal(Object.isFrozen(data.days[0].tasks[0]),true);
 assert.throws(()=>{data.materials[0].title='tampered';},TypeError);
 assert.throws(()=>{data.days[0].tasks[0].materialIds.push('tampered');},error=>error.name==='TypeError');
 for(let i=0;i<8;i++)assert.equal(api.publicPlanningData(),view);
 const vm=require('node:vm');
 vm.runInContext(fs.readFileSync(path.join(root,'assets/public-course-planner.js'),'utf8'),f.context);
 const engine=f.win.IELTSPublicCoursePlanner;let checks=0;
 const store=f.win.IELTSAdaptivePlan.createStore({data,storage:f.win.IELTSProfiles.storage(),contextReady:true,synchronousPublicCourse:true,publicCoursePlanner:{...engine,validatePlan(...args){checks++;return engine.validatePlan(...args);}}});
 assert.equal(store.verifiedPublicCourseState().ready,true);
 const firstChecks=checks;assert.ok(firstChecks>0);
 for(let i=0;i<8;i++)assert.equal(store.verifiedPublicCourseState().ready,true);
 assert.equal(checks,firstChecks,'a frozen verified course is not rehashed on every navigation render');
 f.win.IELTSCurriculumData=JSON.parse(JSON.stringify(data));
 assert.throws(()=>api.publicPlanningData(),/family-private-capability-pending/);
});
