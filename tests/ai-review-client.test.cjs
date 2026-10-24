'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const client=require('../assets/ai-review.js');
test('client preserves original before network, stores failed review as pending, and links a correction',async()=>{const previous={library:global.IELTSMediaLibrary,records:global.IELTSRecords,profiles:global.IELTSProfiles,fetch:global.fetch};let profile='one',network=0,id=0;const entries=new Map(),records=[];
 global.IELTSProfiles={current:()=>({id:profile})};global.IELTSMediaLibrary={async get(id){return entries.get(id)||null;},async create(meta){const e={...meta,id:'work-'+String(++id).padStart(8,'0'),version:1,attempts:0};entries.set(e.id,e);return e;},async update(id,patch){const e={...entries.get(id),...patch,version:entries.get(id).version+1};entries.set(id,e);return e;}};global.IELTSRecords={async record(e){records.push(e);return {record:e,duplicate:false};},async update(){}};global.fetch=async()=>{network++;assert.equal(entries.size,1);throw Error('fake failure');};
 try{const entry=await client.save({mode:'writing',text:'I learn every day.',prompt:'Introduce your habit.',task:'foundation',level:'A0'},{name:'原稿'});assert.equal(network,0);assert.equal(JSON.parse(records[0].answer).text,'I learn every day.');await assert.rejects(client.submit(entry,new AbortController().signal),/fake failure/);assert.equal(entries.get(entry.id).queueStatus,'pending');assert.equal(entries.get(entry.id).originalText,'I learn every day.');const correction=await client.save({mode:'writing',text:'I study English every day.',prompt:entry.prompt,task:'foundation',level:'A0'},{name:'订正',parentId:entry.id});assert.equal(correction.parentId,entry.id);assert.equal(records.at(-1).kind,'correction');assert.equal(entries.get(entry.id).originalText,'I learn every day.');
 }finally{global.IELTSMediaLibrary=previous.library;global.IELTSRecords=previous.records;global.IELTSProfiles=previous.profiles;global.fetch=previous.fetch;}});

test('Chinese-titled works and imported parent audio satisfy the real learning-records contract',async()=>{const core=require('../assets/learning-records.js');const previous={library:global.IELTSMediaLibrary,records:global.IELTSRecords};const entries=new Map(),records=core.createStore(core.createMemoryStore());global.IELTSRecords=records;global.IELTSMediaLibrary={get:async id=>entries.get(id)||null};
 try{const audio={id:'work-parent1234',kind:'audio',name:'自由口语 原始录音',originalText:'',prompt:'Tell me about your city.',task:'part1',level:'A0',parentId:'',version:1,blob:new Blob(['audio'],{type:'audio/webm'}),durationSeconds:25};entries.set(audio.id,audio);const child={id:'work-child12345',kind:'speaking_text',name:'订正的转写',originalText:'I live in a small city.',prompt:audio.prompt,task:'part1',level:'A0',parentId:audio.id,version:1};entries.set(child.id,child);await client.record(child);const found=await records.list();assert.equal(found.length,2);assert.equal(found.find(r=>r.id===child.id).parentId,audio.id);assert.ok(found.every(r=>/^[a-zA-Z0-9:._-]+$/.test(r.materialId)));await client.record(child);assert.equal((await records.list()).length,2);}
 finally{global.IELTSMediaLibrary=previous.library;global.IELTSRecords=previous.records;}});

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
async function settle(){for(let i=0;i<8;i++)await Promise.resolve();}
async function withGlobals(run){const keys=['IELTSMediaLibrary','IELTSRecords','IELTSProfiles','fetch'],previous=Object.fromEntries(keys.map(key=>[key,global[key]]));try{await run();}finally{Object.assign(global,previous);}}
const original=()=>({id:'work-review123',kind:'writing',name:'原稿',originalText:'I study English.',prompt:'Introduce your habit.',task:'foundation',level:'A0',version:1,attempts:0});

test('saving an original refuses a profile change before its learning record is written',()=>withGlobals(async()=>{
 const pending=deferred(),records=[];let profile='one',saved;
 global.IELTSProfiles={current:()=>({id:profile})};
 global.IELTSMediaLibrary={async create(meta){saved={...original(),...meta};await pending.promise;return saved;}};
 global.IELTSRecords={async record(entry){records.push(entry);return{record:entry,duplicate:false};}};
 const saving=client.save({mode:'writing',text:'I study English.',prompt:'Introduce your habit.',task:'foundation',level:'A0'});
 profile='two';pending.resolve();
 await assert.rejects(saving,/档案已改变/);
 assert.equal(saved.originalText,'I study English.');
 assert.equal(records.length,0);
}));

test('loading a linked parent cannot continue recording the old work after a profile switch',()=>withGlobals(async()=>{
 const pending=deferred(),records=[];let profile='one';
 global.IELTSProfiles={current:()=>({id:profile})};
 global.IELTSMediaLibrary={async get(){await pending.promise;return original();}};
 global.IELTSRecords={async record(entry){records.push(entry);return{record:entry,duplicate:false};}};
 const recording=client.record({...original(),id:'work-child123',parentId:'work-review123'});
 profile='two';pending.resolve();
 await assert.rejects(recording,/档案已改变/);
 assert.equal(records.length,0);
}));

test('a cancelled late AI response preserves the original as pending and never records a completed review',()=>withGlobals(async()=>{
 const pending=deferred(),patches=[],records=[];let entry=original(),network=0;
 global.IELTSProfiles={current:()=>({id:'one'})};
 global.IELTSMediaLibrary={async update(id,patch){patches.push(patch);entry={...entry,...patch,version:entry.version+1};return entry;}};
 global.IELTSRecords={async record(value){records.push(value);return{record:value,duplicate:false};}};
 global.fetch=async()=>{network++;return pending.promise;};
 const aborter=new AbortController(),submitting=client.submit(entry,aborter.signal);await settle();
 assert.equal(network,1);aborter.abort('user');
 pending.resolve({ok:true,json:async()=>({ok:true,status:'complete',rounds:[{round:1,ok:true,criteria:[]},{round:2,ok:true,criteria:[]}]})});
 await assert.rejects(submitting,{name:'AbortError'});
 assert.equal(entry.originalText,'I study English.');
 assert.equal(entry.queueStatus,'pending');
 assert.equal(entry.review,undefined);
 assert.equal(records.length,0);
 assert.ok(patches.every(patch=>patch.queueStatus!=='reviewed'));
}));

test('a profile switch while reserving a review stops before any provider request',()=>withGlobals(async()=>{
 const pending=deferred(),patches=[];let profile='one',network=0;
 global.IELTSProfiles={current:()=>({id:profile})};
 global.IELTSMediaLibrary={async update(id,patch){patches.push(patch);await pending.promise;return{...original(),...patch};}};
 global.fetch=async()=>{network++;throw Error('must not send');};
 const submitting=client.submit(original(),new AbortController().signal);
 profile='two';pending.resolve();
 await assert.rejects(submitting,/档案已改变/);
 assert.equal(network,0);
 assert.equal(patches.length,1);
 assert.equal(patches[0].queueStatus,'processing');
}));

const Records=require('../assets/learning-records.js'),Mistakes=require('../assets/mistake-book.js'),Plan=require('../assets/daily-plan-state.js');
const NOW='2026-10-24T12:00:00.000Z',TEXT='I am Ben and I am a student.';
const stageReview=(text=TEXT,goal=true)=>({ok:true,status:'complete',requiresRetest:false,rounds:[1,2].map(round=>({ok:true,round,task:'foundation',criteria:[],corrections:[],summary:'Checked the actual original.',levelCheck:{targetLevel:'A0',meetsGoal:goal,evidence:[{quote:text,comment:'Evidence from this original.'}],gaps:[]}}))});
const entry=(extra={})=>({id:'work-correct123',kind:'writing',name:'Supplementary original',originalText:TEXT,prompt:'Introduce yourself.',task:'foundation',level:'A0',dayNumber:1,version:1,...extra});
async function learningFixture(run){
 const keys=['IELTSRecords','IELTSMistakes','IELTSProfiles','IELTSMediaLibrary'],previous=Object.fromEntries(keys.map(key=>[key,global[key]])),values=new Map(),mistakes=Mistakes.createStore({getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},{now:()=>NOW}),records=Records.createStore(Records.createMemoryStore(),{now:()=>NOW});
 global.IELTSProfiles=undefined;global.IELTSMistakes={...Mistakes,forDay:day=>mistakes.summary(day)};global.IELTSMediaLibrary={get:async()=>null};
 global.IELTSRecords={list:filter=>records.list(filter),record:async(input,context)=>{const saved=await records.record(input);mistakes.captureRecord(saved.record,context);return saved;},update:async(id,patch,changeId,context)=>{const saved=await records.update(id,patch,changeId);mistakes.captureRecord(saved,context);return saved;}};
 try{await run({records,mistakes});}finally{Object.assign(global,previous);}
}

test('two grounded successful supplementary reviews retain their structure and do not invent a mistake',()=>learningFixture(async({records,mistakes})=>{
 const work=entry(),review=stageReview();await client.record(work);await client.record({...work,version:3},review);const [saved]=await records.list();
 assert.equal(saved.evaluation.result,'pass');assert.equal(JSON.parse(saved.answer).text,TEXT);assert.equal(JSON.parse(saved.evaluation.feedback).rounds.length,2);assert.equal(Plan.validLinkedReview(saved),true);assert.equal(mistakes.summary(1).total,0);
}));

test('complete responses with missing, repeated or ungrounded rounds stay pending without creating errors',async()=>{
 const missing=stageReview();missing.rounds.pop();const repeated=stageReview();repeated.rounds[1].round=1;const invented=stageReview();invented.rounds[1].levelCheck.evidence[0].quote='Invented learner sentence.';const uncertain=stageReview();uncertain.rounds[1].levelCheck.meetsGoal=null;const disputed=stageReview();disputed.requiresRetest=true;const unsuccessful=stageReview();unsuccessful.ok=false;
 for(const review of [missing,repeated,invented,uncertain,disputed,unsuccessful])await learningFixture(async({records,mistakes})=>{await client.record(entry(),review);const [saved]=await records.list();assert.equal(saved.evaluation.result,'pending');assert.equal(mistakes.summary(1).total,0);assert.equal(Plan.validLinkedReview(saved),false);});
});

test('artifact wrapping cannot turn a blank supplementary original into a submitted work',()=>learningFixture(async({records,mistakes})=>{
 await assert.rejects(client.record(entry({originalText:'  '})),/空白原稿/);assert.equal((await records.list()).length,0);assert.equal(mistakes.summary(1).total,0);
}));

test('real supplemental activity is credited once with its date ledger and preserved on later feedback updates',()=>learningFixture(async({records})=>{
 const work=entry({createdAt:NOW,transcript:{activity:{startedAt:'2026-10-24T11:59:00.000Z',endedAt:NOW,activeSeconds:30,activityByDate:{'2026-10-24':30}}}});
 await client.record(work);let [saved]=await records.list();assert.equal(saved.minutes,.5);assert.equal(saved.activeSeconds,30);assert.deepEqual(JSON.parse(saved.answer).activityByDate,{'2026-10-24':30});await client.record({...work,version:2,transcript:{}},stageReview());[saved]=await records.list();assert.equal(saved.minutes,.5);assert.equal(saved.evaluation.result,'pass');assert.equal((await records.list()).length,1);
}));

test('grounded negative goals and actual quoted corrections are errors even if the other service round failed',async()=>{
 const negative=stageReview(TEXT,false),partial=stageReview();partial.status='partial';partial.rounds[0].corrections=[{original:'I am Ben',revised:'My name is Ben',reason:'A concrete correction.'}];partial.rounds[1]={ok:false,round:2,error:{code:'TIMEOUT'}};
 for(const review of [negative,partial])await learningFixture(async({records,mistakes})=>{await client.record(entry(),review);const [saved]=await records.list(),summary=mistakes.summary(1);assert.equal(saved.evaluation.result,'revise');assert.equal(summary.total,1);assert.equal(summary.items[0].originalAnswer,TEXT);assert.equal(summary.items[0].question.task,'foundation');});
});

function academicReview(text,band=7){const review=stageReview(text);for(const round of review.rounds){round.task='academic_task2';round.criteria=['task','coherence','lexical','grammar'].map(id=>({id,band,evidence:[{quote:text.slice(0,30),comment:'Evidence from this original.'}]}));}return review;}
test('Academic supplementary writing requires all four grounded training dimensions rather than only phase goals',async()=>{
 const text=Array(250).fill('student').join(' '),work=entry({originalText:text,task:'academic_task2'}),full=academicReview(text),phaseOnly=stageReview(text),low=academicReview(text,6.5),missingEvidence=academicReview(text,6.5);missingEvidence.rounds[1].criteria[0].evidence=[{quote:'An invented quotation.'}];
 for(const [review,status,count]of [[phaseOnly,'pending',0],[full,'pass',0],[low,'revise',1],[missingEvidence,'pending',0]])await learningFixture(async({records,mistakes})=>{await client.record(work,review);const [saved]=await records.list();assert.equal(saved.evaluation.result,status);assert.equal(mistakes.summary(1).total,count);if(count){const item=mistakes.summary(1).items[0];assert.equal(item.question.fullTest,true);assert.equal(item.question.minWords,250);assert.equal(item.originalAnswer,text);}});
});

test('successful speaking text remains pending for audio evidence while a real text error is still captured',async()=>{
 for(const [review,status,count]of [[stageReview(),'pending',0],[stageReview(TEXT,false),'revise',1]])await learningFixture(async({records,mistakes})=>{await client.record(entry({kind:'speaking_text',mode:'speaking_text'}),review);const [saved]=await records.list();assert.equal(saved.evaluation.result,status);assert.equal(JSON.parse(saved.answer).transcript,TEXT);assert.equal(saved.media.length,0);assert.equal(mistakes.summary(1).total,count);assert.equal(Plan.validLinkedReview(saved),false);});
});

test('retry preserves an existing plain-text original and its original day when the actual learning day has changed',()=>learningFixture(async({records,mistakes})=>{
 const work=entry();await client.record(work);const raw=await records.exportState();raw.records[0].answer=TEXT;const legacy=Records.createStore(Records.createMemoryStore(raw),{now:()=>NOW});
 global.IELTSRecords={list:filter=>legacy.list(filter),currentDay:()=>2,record:async(input,context)=>{const saved=await legacy.record(input.dayNumber===undefined?{...input,dayNumber:2}:input);mistakes.captureRecord(saved.record,context);return saved;},update:async(id,patch,changeId,context)=>{const saved=await legacy.update(id,patch,changeId);mistakes.captureRecord(saved,context);return saved;}};
 await client.record({...work,dayNumber:undefined,version:3},stageReview());const [saved]=await legacy.list();assert.equal(saved.answer,TEXT);assert.equal(saved.dayNumber,1);assert.equal(saved.evaluation.result,'pass');assert.equal(Plan.validLinkedReview(saved),true);assert.equal(mistakes.summary(1).total,0);
}));

test('long feedback stays valid JSON, points to the complete archive and preserves the original review',()=>learningFixture(async({records,mistakes})=>{
 const review=stageReview();review.rounds.forEach(round=>{round.summary='A'.repeat(16000);round.uncertainty='B'.repeat(4000);});const archive=entry({review});await client.record(archive,review);const [saved]=await records.list(),feedback=JSON.parse(saved.evaluation.feedback);assert.ok(saved.evaluation.feedback.length<=24000);assert.equal(feedback.fullReviewArchiveId,archive.id);assert.equal(feedback.feedbackAbbreviated,true);assert.equal(archive.review.rounds[0].summary.length,16000);assert.equal(saved.evaluation.result,'pass');assert.equal(Plan.validLinkedReview(saved),true);assert.equal(mistakes.summary(1).total,0);
}));

test('supplementary pages load the shared evidence and bounded-feedback dependencies before review recording',()=>{
 const fs=require('node:fs'),path=require('node:path');for(const page of ['写作与AI辅导.html','口语练习.html']){const html=fs.readFileSync(path.join(__dirname,'..',page),'utf8'),scripts=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match=>match[1]);for(const dependency of ['assets/assessment-core.js','assets/mistake-book.js','assets/course-player.js'])assert.ok(scripts.indexOf(dependency)>=0&&scripts.indexOf(dependency)<scripts.indexOf('assets/ai-review.js'),page+':'+dependency);assert.ok(scripts.indexOf('assets/mistake-book.js')<scripts.indexOf('assets/learning-records.js'));}
});
