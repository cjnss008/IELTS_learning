'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),H=require('./record-snapshot-index-fixture.cjs'),M=require(path.join(H.original,'assets/mistake-book.js'));
async function setup(){
 const f=H.environment(),rows=await f.store.list(),mistakes=M.createStore(f.storage,{now:()=>new Date(H.NOW).toISOString()}),options={data:{...H.D,yearFirstUse:{...H.D.yearFirstUse,active:false,runtimeConnected:false}},currentDay:2,current:{day:2,taskId:'reading',materialId:H.material.id,active:false,submitted:false},records:rows,drafts:[],recordCorrectionStatus:record=>mistakes.recordCorrectionStatus(record)},queue={budget:{remainingMinutes:300,spentMinutes:60,budgetMinutes:360},entries:[{kind:'material',day:2,taskId:'reading',materialId:H.material.id,required:true,estimate:{studyMinutes:10}}],currentComplete:false,reservedDueStudyMinutes:0,next:{kind:'material',day:2,taskId:'reading',materialId:H.material.id}};
 let identity=null,calls=0;f.env.__identity=value=>{identity=value;calls++;};const course=f.env.IELTSYearFirstUseCourse.create({root:f.env,storage:f.storage,getSnapshot:()=>options,now:()=>H.NOW});
 return{...f,rows,mistakes,options,queue,course,revision(){course.observe(queue,options);assert.ok(identity);return identity;},identityCalls:()=>calls};
}
test('Course uses a small content fence only after full validated immutable ingress',async t=>{
 const f=await setup();t.after(()=>f.course.dispose());const first=f.revision();f.reset();for(let i=0;i<20;i++)assert.equal(f.revision(),first);assert.ok(f.stats.hashBytes<30000,'warm Course hashing does not copy the frozen original answers');assert.equal(f.stats.answerParses,0);
 f.options.records=H.copy(f.rows);const mutable=f.revision(),a=JSON.parse(f.options.records[0].answer);a.answers[H.material.questions[0].id]='other input';f.options.records[0].answer=JSON.stringify(a);assert.notEqual(f.revision(),mutable,'unknown mutable arrays retain a full content fence');
});
test('same id and version with changed answer invalidates Course identity after real Records validation',async t=>{
 const f=await setup();t.after(()=>f.course.dispose());const before=f.revision(),raw=H.copy(f.raw()),a=JSON.parse(raw.records[0].answer);a.answers[H.material.questions[0].id]='synthetic wrong';raw.records[0].answer=JSON.stringify(a);f.setRaw(raw);f.options.records=await f.store.list();assert.equal(f.options.records[0].id,f.rows[0].id);assert.equal(f.options.records[0].version,f.rows[0].version);assert.notEqual(f.revision(),before);
});
test('same id and version with changed valid review and history invalidates Course identity',async t=>{
 const f=await setup();t.after(()=>f.course.dispose());const before=f.revision(),raw=H.copy(f.raw());raw.records[0].evaluation.feedback+=' New synthetic assessment receipt.';raw.records[0].history.at(-1).evaluation=H.copy(raw.records[0].evaluation);f.setRaw(raw);f.options.records=await f.store.list();assert.equal(f.options.records[0].version,f.rows[0].version);assert.notEqual(f.revision(),before);
});
test('real Mistakes correction changes identity while the same immutable original remains',async t=>{
 const f=await setup();t.after(()=>f.course.dispose());const raw=H.copy(f.raw()),a=JSON.parse(raw.records[0].answer);a.answers[H.material.questions[0].id]='synthetic wrong';raw.records[0].answer=JSON.stringify(a);f.setRaw(raw);f.options.records=await f.store.list();const original=f.options.records[0];f.mistakes.captureRecord(H.copy(original),{material:H.material,materials:H.D.materials});const summary=f.mistakes.summary(2);assert.ok(summary.remaining>0);const before=f.revision();f.mistakes.submitRound(2,Object.fromEntries(summary.remainingItems.map(item=>[item.id,{answer:item.question.type==='multi'?item.question.answers:item.question.answers[0],media:[]}])),{token:summary.token});assert.equal(f.mistakes.recordCorrectionStatus(H.copy(original)).corrected,true);assert.equal(f.options.records[0],original);assert.notEqual(f.revision(),before);
});
test('current draft answer changes invalidate the fence without changing stored records',async t=>{
 const f=await setup();t.after(()=>f.course.dispose());const artifact=JSON.parse(f.rows[0].answer),draft={id:'cache-live-draft',courseDay:2,materialId:H.material.id,materialBinding:artifact.materialBinding,answers:{},text:'',media:[]};f.options.drafts=[draft];const before=f.revision();draft.answers[H.material.questions[0].id]='new input';assert.notEqual(f.revision(),before);const after=f.revision();draft.text='a newly written draft';assert.notEqual(f.revision(),after);
});
test('busy generation closes Course identity and preserves the original core next task',async t=>{
 const f=await setup();t.after(()=>f.course.dispose());f.revision();const count=f.identityCalls();f.setGeneration('busy:synthetic-restore');const held=f.course.observe(f.queue,f.options);assert.equal(f.identityCalls(),count);assert.equal(held.next,f.queue.next);assert.equal(f.storageMap.has('ielts52-year-first-use-v1'),false);
});
