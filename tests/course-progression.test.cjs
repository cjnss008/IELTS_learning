const test=require('node:test'),assert=require('node:assert/strict');
const Player=require('../assets/course-player.js'),Hub=require('../assets/today-hub.js'),A=require('../assets/assessment-core.js'),Oral=require('../assets/oral-practice.js');
function objective(id='g1',skill='grammar'){return{id,skill,questions:[1,2].map(i=>({id:'q'+i,type:'single',prompt:'Choose a.',options:['a','b'],answers:['a']}))};}
function work(material,answers={q1:'a',q2:'b'},extra={}){return{id:'record-'+material.id,version:1,dayNumber:1,taskId:material.skill,skill:material.skill,materialId:material.id,kind:'original',answer:JSON.stringify({schema:1,answers,audioCompleted:true}),submittedAt:'2026-10-25T09:00:00.000Z',evaluation:{method:'objective',result:'revise'},media:[],...extra};}
function speakingFixture(){
 const reference=Array.from({length:24},(_,i)=>'We read sentence '+(i+1)+' together.').join(' '),reading={id:'r1',skill:'reading',pool:'training',passage:reference},material={id:'r1-speaking',skill:'speaking',pool:'training',week:1,reference},task={id:'speaking',mode:'practice',materialIds:[material.id]},data={materials:[reading,material],days:[{day:1,tasks:[{id:'reading',materialIds:[reading.id]},task]}]};
 const segments=Oral.splitReference(reference).map((text,index)=>({reference:text,workId:'work-model-'+String(index).padStart(8,'0'),evidenceId:'model-evidence-'+index,status:'complete',professional:{result:{text,accuracy:32,fluency:41,completeness:65}},coach:{feedbackFormat:'oral-coach-v1',evidenceId:'model-evidence-'+index}}));
 const snapshot=Player.modelReadingSnapshot({segments},material.id,1),record=work(material,{}, {answer:JSON.stringify({schema:1,transcript:'My name is Lin.',text:'',modelReading:snapshot,mode:'practice'}),media:[{id:'work-free-00000001',name:'Free expression',mime:'audio/webm',durationSeconds:4}],evaluation:{method:'ai',result:'pending',feedback:'{}'}});
 return{data,material,task,segments,snapshot,record};
}
test('objective whole-material submission checks actual complete answers independently of cached score or pass',()=>{
 const m=objective();assert.equal(Player.objectiveSubmissionComplete(work(m,{q1:'a'}),m,A),false);
 for(const answers of [{q1:'a',q2:''},{q1:'a',q2:'   '},{q1:'a',other:'a'}])assert.equal(Player.objectiveSubmissionComplete(work(m,answers),m,A),false);
 assert.equal(Player.objectiveSubmissionComplete(work(m,{q1:'b',q2:'b'}),m,A),true);
 assert.equal(Player.objectiveSubmissionComplete({...work(m),answer:'{broken'},m,A),false);assert.equal(Player.objectiveSubmissionComplete(work(m),undefined,A),false);
 const task={id:'grammar',materialIds:['g1']};assert.equal(Hub.taskState(task,[work(m,{q1:'a'},{evaluation:{result:'pass',score:2}})],{dayNumber:1,materials:[m]}).done,false);assert.equal(Hub.taskState(task,[work(m,{q1:'b',q2:'b'})],{dayNumber:1,materials:[m]}).done,true);
});
test('all model segments with professional low scores and matching AI feedback unlock separate free expression',()=>{
 const f=speakingFixture();assert.ok(f.snapshot.segments.length>1);const status=Player.validateModelReading(f.snapshot,f.material,f.task,f.data,1);assert.equal(status.complete,true);assert.equal(status.completedSegments,f.snapshot.segments.length);assert.equal(Player.verifySpeakingStage(f.record,f.material,f.task,f.data,1).submitted,true);
 const state=Hub.taskState(f.task,[f.record],{dayNumber:1,data:f.data});assert.equal(state.count,1);assert.equal(state.done,false);assert.equal(state.pending,true);
 assert.equal(Hub.taskState(f.task,[f.record],{dayNumber:1,data:f.data,recordCorrectionStatus:()=>({corrected:true})}).done,true);
});
test('model provenance rejects a missing coach, incomplete result, changed reference, duplicate work/evidence and material/day mismatch',()=>{
 const f=speakingFixture(),changes=[s=>s.segments[0].coach=null,s=>s.segments[0].status='partial',s=>s.segments[0].professional.accuracy=null,s=>s.segments[0].reference+=' Changed.',s=>s.segments[1].workId=s.segments[0].workId,s=>s.segments[1].evidenceId=s.segments[0].evidenceId,s=>s.materialId='other-speaking',s=>s.dayNumber=2,s=>s.required=false];
 for(const change of changes){const snapshot=structuredClone(f.snapshot);change(snapshot);assert.equal(Player.validateModelReading(snapshot,f.material,f.task,f.data,1).complete,false);const record={...f.record,answer:JSON.stringify({...JSON.parse(f.record.answer),modelReading:snapshot})};assert.equal(Hub.taskState(f.task,[record],{dayNumber:1,data:f.data,recordCorrectionStatus:()=>({corrected:true})}).done,false);}
});

test('model stage accepts exact old and spoken section references at the same index without accepting changed body text',()=>{
 const reference='A. This is my book.\nB. I study every day.',reading={id:'label-reading',skill:'reading',pool:'training',passage:reference},material={id:'label-reading-speaking',skill:'speaking',pool:'training',week:1},task={id:'speaking',mode:'practice',materialIds:[material.id]},data={materials:[reading,material],days:[{day:1,tasks:[{id:'reading',materialIds:[reading.id]},task]}]},legacy=Oral.splitReference(reference),spoken=Oral.spokenReferenceParts(reference);
 const make=parts=>Player.modelReadingSnapshot({segments:parts.map((text,index)=>({reference:text,workId:'work-label-proof-'+index+'00000000',evidenceId:'label-proof-'+index,status:'complete',professional:{result:{text,accuracy:65,fluency:70,completeness:80}},coach:{feedbackFormat:'oral-coach-v1',evidenceId:'label-proof-'+index}}))},material.id,1);
 for(const parts of [legacy,spoken,[legacy[0],spoken[1]]]){const snapshot=make(parts),before=JSON.stringify(snapshot);assert.equal(Player.validateModelReading(snapshot,material,task,data,1).complete,true);assert.equal(JSON.stringify(snapshot),before);}
 for(const parts of [[spoken[1],spoken[0]],[spoken[0].replace('book','bag'),spoken[1]],[spoken[0]+' ',spoken[1]]])assert.equal(Player.validateModelReading(make(parts),material,task,data,1).complete,false);
});
test('model recordings and free expression media remain separate and a manually changed mode cannot bypass training',()=>{
 const f=speakingFixture(),raw=JSON.parse(f.record.answer);for(const media of [[],[{id:f.snapshot.segments[0].workId}],[{id:'free'},{id:'free'}]])assert.equal(Player.verifySpeakingStage({...f.record,media},f.material,f.task,f.data,1).submitted,false);
 assert.equal(Player.verifySpeakingStage({...f.record,answer:JSON.stringify({...raw,modelReading:undefined,mode:'assessment'})},f.material,f.task,f.data,1).submitted,false);
 assert.equal(Player.verifySpeakingStage({...f.record,answer:JSON.stringify({...raw,modelReading:undefined})},f.material,{...f.task,mode:'assessment'},f.data,1).submitted,true);
 assert.equal(Player.verifySpeakingStage({...f.record,answer:JSON.stringify({...raw,transcript:'   '})},f.material,f.task,f.data,1).submitted,true);
 const audioOnly={...f.record,answer:JSON.stringify({...raw,transcript:''})};assert.equal(Hub.taskState(f.task,[audioOnly],{dayNumber:1,data:f.data}).done,false);assert.equal(Hub.taskState(f.task,[audioOnly],{dayNumber:1,data:f.data}).pending,true);assert.throws(()=>Player.reviewRequest({...f.material,level:'A0',title:'Answer',prompt:'Introduce yourself.'},JSON.parse(audioOnly.answer)),{code:'SPEAKING_AUDIO_PENDING'});
});
test('model provenance survives validated draft and immutable original conversion without adding model audio to media',()=>{
 const f=speakingFixture(),attempt={id:'course-model-test',materialId:f.material.id,taskId:'speaking',courseDay:1,mode:'practice',kind:'original',parentId:null,startedAt:'2026-10-25T08:59:00.000Z',submittedAt:'2026-10-25T09:00:00.000Z',activeSeconds:30,exposureAtStart:'unseen',answers:{},userEvidence:{},text:'',transcript:'My name is Lin.',audioAvailable:false,audioCompleted:false,transcriptViewed:false,interrupted:false,assistance:{hint:false,answer:false,ai:false},media:f.record.media,modelReading:f.snapshot},state=Player.newState();state.drafts[attempt.id]=attempt;
 assert.deepEqual(Player.parseState(state).drafts[attempt.id].modelReading,f.snapshot);const original=Player.toRecord(attempt,{...f.material,version:'1',title:'Introduce yourself',questions:[],rubric:{taskType:'foundation'}},1,A);assert.deepEqual(JSON.parse(original.answer).modelReading,f.snapshot);assert.deepEqual(original.media,f.record.media);assert.equal(Player.verifySpeakingStage(original,f.material,f.task,f.data,1).submitted,true);
});
test('continuation completes every material in the current task before advancing and partial originals stay on their material',()=>{
 const a=objective('g1'),b=objective('g2'),r=objective('r1','reading'),task={id:'grammar',materialIds:['g1','g2']},data={materials:[a,b,r],days:[{day:1,tasks:[task,{id:'reading',materialIds:['r1']}]}]};
 assert.equal(Player.nextDestination(data,1,'grammar',[work(a)]).materialId,'g2');assert.equal(Player.nextDestination(data,1,'grammar',[work(a,{q1:'a'})]).materialId,'g1');assert.equal(Player.nextDestination(data,1,'grammar',[work(a),work(b)]).taskId,'reading');
});
test('daily recap readiness requires full objective material, real linked subjective review or strict correction, and all speaking segments',()=>{
 const grammar=objective(),writing={id:'w1',skill:'writing'},gt={id:'grammar',materialIds:['g1'],coreMaterialIds:['g1']},wt={id:'writing',materialIds:['w1']},data={materials:[grammar,writing],days:[{day:1,tasks:[gt,wt,{id:'reflection',materialIds:['reflection']}]}]},raw=work(writing,{}, {answer:JSON.stringify({schema:1,text:'I am Lin.'}),evaluation:{method:'ai',result:'pass',feedback:'{}'}}),records=[work(grammar),raw];
 assert.equal(Player.dayReadiness(data,1,records).ready,false);const corrected=()=>({corrected:true});assert.equal(Player.dayReadiness(data,1,records,{recordCorrectionStatus:corrected}).ready,true);assert.equal(Player.dayReadiness(data,1,[work(grammar,{q1:'a'}),raw],{recordCorrectionStatus:corrected}).ready,false);
 const f=speakingFixture();f.data.days[0].tasks=[f.task];const invalid={...f.record,answer:JSON.stringify({...JSON.parse(f.record.answer),modelReading:undefined})};assert.equal(Player.dayReadiness(f.data,1,[invalid],{recordCorrectionStatus:corrected}).ready,false);
});
test('foundation routing agrees with review requests and accepts alternate local HTTP service ports',()=>{
 for(const extra of [{week:1},{week:9,rubric:{task:'foundation'}},{week:9,rubric:{taskType:'foundation'}}]){const m={skill:'speaking',prompt:'Introduce yourself.',...extra};assert.equal(Player.foundationSpeaking(m),true);assert.equal(Player.reviewRequest(m,{transcript:'I am Lin.'}).task,'foundation');}
 assert.equal(Player.foundationSpeaking({skill:'speaking',week:9}),false);for(const origin of ['http://127.0.0.1:9321','http://localhost:8765','http://[::1]:9200'])assert.equal(Player.localHTTP({origin}),true);for(const origin of ['file://','http://example.com:8765','https://127.0.0.1:8765'])assert.equal(Player.localHTTP({origin}),false);
});
