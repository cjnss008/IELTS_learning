'use strict';
// Public course sources + isolated synthetic Records/Mistakes/storage only.
// No browser, user directory, credentials, audio execution or NAS access.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const A=require('../assets/assessment-core.js'),P=require('../assets/course-player.js'),R=require('../assets/learning-records.js'),M=require('../assets/mistake-book.js'),Flow=require('../assets/course-expansion.js'),Adaptive=require('../assets/adaptive-plan.js'),Hub=require('../assets/today-hub.js');
global.IELTSProfiles=require('../assets/profile-store.js');global.IELTSRecords=R;global.IELTSCoursePlayer=P;global.IELTSMistakes=M;
const Backup=require('../assets/backup-core.js'),D=require('../assets/curriculum-data.js'),copy=v=>JSON.parse(JSON.stringify(v)),NOW='2026-10-27T00:00:00.000Z';
const family=D.materials.filter(m=>/^family-v89-day(?:0[3-9]|10)-grammar$/.test(m.id)),gsa=D.materials.filter(m=>/^public-gsa-plain-language-(02|03|06|07|08)-reading$/.test(m.id));
function memory(){const map=new Map();return{map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};}
function makeInput(material,tag='ordinary',allWrong=true){
 const assignment=material.source?.publicSourceId?D.publicCoursePlan.assignments.find(a=>a.materialId===material.id):null,day=assignment?.day||material.availableFromDay,base=copy(D.days.find(d=>d.day===day));assert.ok(base);
 let plan=base,contract;
 if(material.skill==='grammar')plan=Flow.familyGrammarProjection(base,D,{contextReady:true,assessment:A,player:P,hub:Hub,records:[],drafts:[]});
 else{contract=Adaptive.publicContract(assignment);const task=plan.tasks.find(t=>t.id===material.skill);task.materialIds=[...new Set([...task.materialIds,material.id])];task.coreMaterialIds=task.materialIds.slice();task.publicCourseAssignments=[contract];plan.publicCourse={schema:1,planHash:D.publicCoursePlan.planHash,assignments:[contract]};}
 const task=plan.tasks.find(t=>t.id===material.skill);assert.ok(task.materialIds.includes(material.id));const id='develop-merge-'+tag+'-'+material.id,binding=P.freezeMaterialBinding(material,{assessment:A,data:D,task,courseDay:day,attemptId:id}),dayBinding=P.freezeDayPlanBinding(plan,A);
 const answers=Object.fromEntries(binding.material.questions.map(q=>[q.id,allWrong?(q.options?.find(o=>!q.answers.includes(o))||'unrelated response'):q.answers[0]]));
 return P.toRecord({id,materialId:material.id,taskId:material.skill,courseDay:day,mode:'practice',kind:'original',parentId:null,startedAt:'2026-10-26T23:59:00.000Z',submittedAt:NOW,activeSeconds:60,exposureAtStart:'seen',answers,userEvidence:{},text:'',transcript:'',audioAvailable:false,audioCompleted:false,transcriptViewed:false,interrupted:false,assistance:{hint:false,answer:false,ai:false},media:[],materialBinding:binding,dayPlanBinding:dayBinding,...(contract?{courseAssignment:{...contract,bindingContentHash:binding.contentHash}}:{})},material,day,A);
}
function saved(material,tag){return R.put(R.newState(),makeInput(material,tag),NOW).record;}
function book(){return M.createStore(memory(),{now:()=>NOW});}
function capture(records,b=book()){for(const row of records)b.captureRecord(row,{materials:D.materials});return b;}
function wrongMaterial(m,edit){const changed=copy(m);edit(changed);return changed;}

test('all 80 new grammar originals capture strictly normalized notes while immutable task/source bindings stay exact',()=>{
 assert.equal(family.length,8);let count=0;
 for(const material of family){const record=saved(material,'family'),bytes=JSON.stringify(record),original=A.decodeArtifact(record),bindingBytes=JSON.stringify(original.materialBinding),dayBytes=JSON.stringify(original.dayPlanBinding),b=capture([record]),items=b.summary(record.dayNumber).items;assert.equal(items.length,10);count+=items.length;
  assert.deepEqual(P.materialForRecord(record,material,A).questions,original.materialBinding.material.questions);assert.ok(original.materialBinding.material.taskContract);assert.ok(Flow.validFamilyGrammarProjection(original.dayPlanBinding.day,D,{assessment:A}));
  for(const q of material.questions){const item=items.find(x=>x.questionId===q.id);assert.ok(item);assert.equal(item.originalAnswer,original.answers[q.id]);assert.equal(item.question.explanation,q.explanation);assert.equal(item.question.evidence,q.evidence);assert.deepEqual(item.question.answers,q.answers);assert.equal(item.question.type,q.type==='fill'?'short':q.type);
   if(q.wordLimit!==undefined)assert.equal(item.question.maxWords,q.wordLimit);
   if(q.distractorReasons&&!Array.isArray(q.distractorReasons)){assert.equal(item.question.distractorReasons.length,q.options.length);q.options.forEach((option,i)=>assert.equal(item.question.distractorReasons[i],q.distractorReasons[option]||q.correctExpression));}
   for(const key of ['correctExpression','evidenceSpan','commonErrorReasons','wordLimit','instructions'])assert.equal(Object.hasOwn(item.question,key),false,'new annotation cannot widen persisted Mistakes schema');
  }
  const round=Object.fromEntries(b.summary(record.dayNumber).remainingItems.map(item=>[item.id,item.question.answers[0]]));b.submitRound(record.dayNumber,round,{id:'correct-'+material.id});assert.equal(b.summary(record.dayNumber).remaining,0);assert.equal(b.recordCorrectionStatus(record).corrected,true);assert.equal(JSON.stringify(record),bytes);assert.equal(JSON.stringify(A.decodeArtifact(record).materialBinding),bindingBytes);assert.equal(JSON.stringify(A.decodeArtifact(record).dayPlanBinding),dayBytes);
 }
 assert.equal(count,80);
});

test('all 30 GSA originals retain reviewed offsets, answer scope and ordinary task contracts through capture and correction',()=>{
 assert.equal(gsa.length,5);let count=0;
 for(const material of gsa){const record=saved(material,'gsa'),bytes=JSON.stringify(record),artifact=A.decodeArtifact(record),b=capture([record]),items=b.summary(record.dayNumber).items;assert.equal(items.length,6);count+=items.length;assert.equal(artifact.courseAssignment.materialContentHash,A.materialContentHash(material));assert.equal(artifact.courseAssignment.bindingContentHash,artifact.materialBinding.contentHash);assert.ok(artifact.dayPlanBinding.day.publicCourse.assignments.some(a=>a.assignmentId===artifact.courseAssignment.assignmentId));assert.ok(artifact.materialBinding.material.taskContract);
  for(const q of material.questions){const item=items.find(x=>x.questionId===q.id);assert.deepEqual(item.question.answers,q.answers);assert.equal(item.question.explanation,q.explanation);assert.equal(item.question.evidence,q.evidence);if(q.maxWords!==undefined)assert.equal(item.question.maxWords,q.maxWords);assert.equal(material.passage.slice(q.evidenceOffsets.start,q.evidenceOffsets.end),q.evidence);if(q.type==='short'&&q.distractorReasons?.length){assert.equal(Object.hasOwn(item.question,'distractorReasons'),false);for(const reason of q.distractorReasons)assert.ok(item.question.explanation.includes(reason));}}
  b.submitRound(record.dayNumber,Object.fromEntries(items.map(item=>[item.id,item.question.answers[0]])),{id:'gsa-correct-'+material.id});assert.equal(b.summary(record.dayNumber).remaining,0);assert.equal(b.recordCorrectionStatus(record).corrected,true);assert.equal(JSON.stringify(record),bytes);assert.equal(Adaptive.verifiedRecord(record,material,Date.parse(NOW)),false);
 }
 assert.equal(count,30);
});

test('GSA punctuation aliases remain narrowly accepted after capture; changed release, scope, offsets or alias policy fail closed',()=>{
 const material=gsa.find(m=>m.source.publicSourceId==='gsa-plain-language-03'),record=saved(material,'aliases'),items=capture([record]).summary(record.dayNumber).items,q=items.find(x=>x.questionId==='q4').question;
 for(const answer of ['The U.S. Courts','U.S. Courts','The US Courts','US Courts'])assert.equal(M.gradeObjective(q,answer).status,'passed');for(const answer of ['US Court','United States Courts','The US Courts and agencies'])assert.notEqual(M.gradeObjective(q,answer).status,'passed');
 for(const edit of [m=>{m.source.gradedCourseRelease.sha256='0'.repeat(64);},m=>{m.questions.find(q=>q.id==='q4').answerAliasPolicy='accept-any-punctuation';},m=>{m.questions[0].evidenceOffsets.offsetUnit='byte';},m=>{m.questions[0].evidenceOffsets.start++;}]){const changed=wrongMaterial(material,edit);assert.throws(()=>M.captureInputs(saved(changed,'bad-gsa'),{materials:[changed]}),/核验|位置|文本|别名|答案/);}
});

test('new capture annotations do not permit unknown fields, inconsistent limits or incomplete option explanations',()=>{
 const material=family.find(m=>m.id==='family-v89-day03-grammar');
 const edits=[m=>{m.questions[0].unknownFutureAnswer='unreviewed';},m=>{const q=m.questions.find(q=>q.wordLimit);q.maxWords=q.wordLimit+1;},m=>{m.questions[0].distractorReasons['not an option']='injected';},m=>{const q=m.questions[0];delete q.distractorReasons[q.options.find(x=>!q.answers.includes(x))];},m=>{m.questions[0].evidenceSpan.unit='bytes';},m=>{m.questions[0].commonErrorReasons={bad:12};},m=>{m.questions[0].evidenceSpan.textSha256='not-a-hash';}];
 for(const edit of edits){const changed=wrongMaterial(material,edit);assert.throws(()=>M.captureInputs(saved(changed,'invalid-notes'),{materials:[changed]}),/不支持|一致|选项|缺少|位置|哈希|长度|格式/);}
 const row=saved(material,'schema'),state=capture([row]).read();for(const key of ['wordLimit','correctExpression','unknownFutureAnswer']){const invalid=copy(state);invalid.items[0].question[key]=1;assert.throws(()=>M.parseState(invalid),/不支持/);assert.throws(()=>Backup.validate(M.KEY,JSON.stringify(invalid)),/不支持/);}
});

test('real Records and Mistakes backup restores original bindings/notes/answers and corrects without replacing originals',async()=>{
 const materials=[family[0],family.find(m=>m.id==='family-v89-day08-grammar'),gsa.find(m=>m.source.publicSourceId==='gsa-plain-language-03')];let state=R.newState();for(const material of materials)state=R.put(state,makeInput(material,'backup'),NOW).state;const original=copy(state.records),bytes=new Map(original.map(r=>[r.id,JSON.stringify(r)])),b=capture(state.records),entries={[R.KEY]:JSON.stringify(state),[M.KEY]:JSON.stringify(b.read())},parsed=Backup.parseBundle({app:'ielts52-backup',schemaVersion:1,entries});
 const destination=memory(),records=R.createStore(R.createMemoryStore());await Backup.restoreAll(destination,parsed,Object.keys(parsed),records);const restored=M.createStore(destination,{now:()=>NOW});for(const row of await records.list()){assert.equal(JSON.stringify(row),bytes.get(row.id));assert.deepEqual(P.materialForRecord(row,D.materials.find(m=>m.id===row.materialId),A).questions,A.decodeArtifact(row).materialBinding.material.questions);}
 for(const day of [...new Set(original.map(r=>r.dayNumber))]){const summary=restored.summary(day);assert.equal(summary.remaining,materials.find(m=>(m.availableFromDay||D.publicCoursePlan.assignments.find(a=>a.materialId===m.id).day)===day).questions.length);restored.submitRound(day,Object.fromEntries(summary.remainingItems.map(item=>[item.id,item.question.answers[0]])),{id:'restored-correct-'+day});assert.equal(restored.summary(day).remaining,0);}
 for(const row of await records.list()){assert.equal(JSON.stringify(row),bytes.get(row.id));assert.equal(restored.recordCorrectionStatus(row).corrected,true);}assert.equal(JSON.stringify(state.records),JSON.stringify(original));
});

test('backup merge rejects tampered immutable metadata instead of discarding original input',async()=>{
 const material=family[0],row=saved(material,'conflict'),original=R.newState();original.records=[row];const records=R.createStore(R.createMemoryStore(original)),destination=memory(),changed=copy(original),artifact=A.decodeArtifact(changed.records[0]);artifact.materialBinding.material.questions[0].correctExpression+=' Changed';changed.records[0].answer=JSON.stringify(artifact);
 await assert.rejects(Backup.restoreAll(destination,{[R.KEY]:JSON.stringify(changed)},[R.KEY],records),/冲突|快照|版本|指纹/);assert.equal((await records.list())[0].answer,row.answer);assert.equal(destination.map.size,0);
});

test('backup page retains original dependency order and narrowly admits pending CourseExpansion and declared retention decoders',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../备份中心.html'),'utf8'),scripts=[...html.matchAll(/(?:data-src|src)="([^"]+\.js)"/g)].map(m=>m[1]),old=['profile-store','study-timer-core','record-snapshot-index','learning-records','mistake-book','curriculum-data','passage-format','oral-practice','adaptive-plan','speaking-library','daily-plan-core','daily-plan-state','notebook','review-core','foundation','assessment-core','legacy-material-compatibility','lesson-vocabulary-supplement','year-first-use-course','course-player','selection-ai','textbook-library-core','vendor/ts-fsrs','personalization-core','memory-core','listening-lab','placement-core','year-first-use-state','backup-core','backup-app','profile-reset','user-data-panel','daily-backups','user-data-bootstrap','study-timer'].map(x=>'assets/'+x+'.js');
 const Policy=require('../server/year-runtime-contract-policy.cjs'),expected=old.slice(),flow='assets/course-expansion.js';expected.splice(expected.indexOf('assets/adaptive-plan.js'),0,flow);const decoderRoles={'lexical-retention-feedback':'assets/lexical-retention-v88-feedback.js','lexical-retention-helper':'assets/lexical-retention-v88.js','lexical-bank-runtime':'assets/lexical-bank-runtime.js'};if(Object.hasOwn(Policy.REQUIRED_COMPONENTS,'lexical-retention-helper')){for(const [role,file] of Object.entries(decoderRoles))assert.equal(Policy.REQUIRED_COMPONENTS[role],file);expected.splice(expected.indexOf('assets/memory-core.js'),0,...Object.values(decoderRoles));}assert.deepEqual(scripts,expected,'Every original dependency retains its exact position relative to all others; only declared new decoders are admitted');for(const file of [flow,...Object.values(decoderRoles).filter(file=>expected.includes(file))]){assert.equal(scripts.filter(x=>x===file).length,1);assert.ok(html.includes('<script type="application/x-ielts-pending" data-ielts-script="1" data-src="'+file+'" defer></script>'),'New dependencies must stay behind the profile startup barrier');}assert.equal(Policy.pageDependencyProblem('备份中心.html',html),null);assert.ok(scripts.indexOf('assets/course-expansion.js')<scripts.indexOf('assets/adaptive-plan.js'));assert.match(html,/<script type="application\/x-ielts-pending" data-ielts-script="1" data-src="assets\/course-expansion\.js" defer><\/script>/);assert.doesNotMatch(html,/^<<<<<<<|^=======|^>>>>>>>/m);
});
