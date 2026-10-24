 'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../assets/vocabulary-practice.js');
const D = require('../assets/word-dictionary.js');
const Records = require('../assets/learning-records.js');
const course = require('../assets/course-data.js');
const curriculum = require('../assets/curriculum-data.js');
const mat = {id:'vocab-unit',version:'1',vocabulary:[{word:'student',meaning:'学生',example:'I am a student.'},{word:'get up',meaning:'起床',example:'I get up at seven.'},{word:'I',meaning:'我',example:'I am ready.'}]};
const proof = () => ({kind:'browser-tts',source:'English test voice',started:true,completed:true,completedAt:new Date().toISOString()});
function finishRound(session, answers) {
  session.words.forEach((word,index) => { session.setAnswer(index,answers?.[index] ?? word.word); if (session.state.phase === 'dictation') session.markPlayed(index,proof()); });
  return session.submitRound();
}

test('daily words bind to the material, deduplicate, and reuse IPA/audio without harvesting all passage words',() => {
  const material = {...mat,passage:'Many other words must never enter the required list.',vocabulary:[...mat.vocabulary,{word:'STUDENT',meaning:'duplicate'}]};
  const words = V.wordsFor(material,{courseData:course,curriculumData:curriculum});
  assert.deepEqual(words.map(item => item.word),['student','get up','I']);
  assert.equal(words[0].ipa,'/ˈstjuːdənt/');
  const old = V.wordsFor({id:'old-one',vocabulary:[{word:'continent',meaning:'大洲'}]},{courseData:course});
  assert.equal(old[0].audio,'audio/words/continent.mp3');
  assert.equal(old[0].ipa,'/ˈkɒntɪnənt/');
  assert.equal(V.wordsFor({id:'w01-read-1-vocabulary'},{curriculumData:curriculum}).length,8);
});

test('each required word receives all three objective tests and retains each original answer',() => {
  const session = V.createSession({trainingVersion:1,material:mat,courseDay:7});
  assert.equal(session.getSubmission(),null); session.begin();
  assert.equal(finishRound(session,[' Student ','get up','i']).correct,3); session.next();
  assert.equal(finishRound(session,['studant','get  up','I']).correct,1); session.next();
  assert.equal(finishRound(session,['STUDENT','get up','I']).correct,3);
  const payload = session.getSubmission();
  assert.equal(payload.allModesCompleted,true); assert.equal(payload.pass,false);
  assert.equal(payload.correct,7); assert.equal(payload.total,9); assert.equal(payload.quantity,3); assert.equal(payload.unit,'条');
  assert.equal(payload.mistakes.length,2); assert.equal(payload.attempts.length,9);
  assert.equal(new Set(payload.attempts.map(item => item.attemptId)).size,9);
  assert.equal(payload.attempts[0].userAnswer,' Student ');
  assert.equal(payload.attempts[4].userAnswer,'get  up');
  assert.equal(payload.evaluation.method,'objective'); assert.equal(payload.evaluation.result,'revise');
  assert.ok(payload.attempts.every(item => item.courseDay === 7 && item.dayNumber === 7));
  assert.equal(JSON.parse(payload.answer).rounds.length,3);
  assert.throws(() => session.setAnswer(0,'fixed'),/作答无效/);
});

test('empty answers and incomplete audio cannot count as completed dictation',() => {
  const session = V.createSession({trainingVersion:1,material:mat}); session.begin();
  assert.throws(() => session.submitRound(),/请完成第 1 词/);
  finishRound(session); session.next(); finishRound(session); session.next();
  session.words.forEach((word,index) => session.setAnswer(index,word.word));
  assert.throws(() => session.markPlayed(0,{...proof(),started:false}),/真实完成/);
  assert.throws(() => session.markPlayed(0,{...proof(),completed:false}),/真实完成/);
  assert.throws(() => session.submitRound(),/尚未成功播放/);
  session.words.forEach((_,index) => session.markPlayed(index,proof()));
  assert.equal(session.submitRound().correct,3); assert.equal(session.getSubmission().testPass,true);assert.equal(session.getSubmission().pass,false);
});

test('completion masks retain letters when possible and always hide at least one letter',() => {
  for (const word of ['a','I','to','class','get up','café','augmented reality (AR)']) {
    const masked = V.maskWord(word);
    assert.notEqual(masked,word); assert.match(masked,/_/);
    if (word.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g,'').length > 1) assert.match(masked,/[A-Za-zÀ-ÖØ-öø-ÿ]/);
  }
  assert.equal(V.maskWord('get up'),'g_t _p');
  assert.equal(V.normalizeAnswer('  HeLLo  '),'hello');
  assert.notEqual(V.normalizeAnswer('get  up'),'get up');
});

test('every authored vocabulary material produces a complete original within Records size limit',() => {
  const dictionary = D.create({courseData:course,curriculumData:curriculum}); let count = 0;
  for (const material of curriculum.materials.filter(item => Array.isArray(item.vocabulary) && item.vocabulary.length)) {
    const session = V.createSession({trainingVersion:1,material,dictionary}); session.begin();
    finishRound(session); session.next(); finishRound(session); session.next(); finishRound(session);
    const payload = session.getSubmission(); assert.equal(payload.testPass,true,material.id);
    assert.ok(payload.answer.length <= 50000,material.id+' original too long: '+payload.answer.length);
    const record = Records.cleanInput({id:payload.id,materialId:material.id,materialVersion:String(material.version),title:material.title,skill:'vocabulary',taskId:'vocabulary',source:'vocabulary-practice',dayNumber:1,answer:payload.answer,quantity:payload.quantity,unit:payload.unit,evaluation:payload.evaluation,exposure:'seen',startedAt:payload.startedAt,submittedAt:payload.submittedAt});
    assert.equal(record.evaluation.score,payload.total); count++;
  }
  assert.ok(count >= 500);
});

test('local audio only completes after playing and ended, not play() resolution',async () => {
  let audio;
  class Audio { constructor(src) { this.src=src; this.currentTime=0; this.volume=1; audio=this; } play() { return Promise.resolve(); } pause() {} }
  const player = V.createAudioPlayer({Audio,root:{}}); let done=false;
  const playing = player.play({word:'continent',audio:'audio/words/continent.mp3'}).then(result => { done=true; return result; });
  await Promise.resolve(); await Promise.resolve(); assert.equal(done,false);
  audio.onplaying(); audio.currentTime=.9; audio.onended();
  const result = await playing; assert.equal(result.completed,true); assert.equal(result.kind,'local-audio');
});

test('blocked audio and failed/no-English TTS remain incomplete',async () => {
  class BlockedAudio { play() { return Promise.reject(Error('blocked')); } pause() {} }
  const blocked = V.createAudioPlayer({Audio:BlockedAudio,root:{}});
  await assert.rejects(blocked.play({word:'x',audio:'audio/words/x.mp3'}),/不支持英语/);
  const noEnglish = V.createAudioPlayer({root:{},synthesis:{getVoices:() => [{lang:'zh-CN'}]},Utterance:class {}});
  await assert.rejects(noEnglish.play({word:'hello'}),/尚无可用英语/);
  let utterance;
  const failed = V.createAudioPlayer({root:{},synthesis:{getVoices:() => [{lang:'en-GB'}],speak(value) { utterance=value; },cancel() {}},Utterance:class {}});
  const promise = failed.play({word:'hello'}); utterance.onerror();
  await assert.rejects(promise,/合成语音失败/);
});

test('TTS must actually start before its end event can provide a listening proof',async () => {
  let utterance;
  const player = V.createAudioPlayer({root:{},synthesis:{getVoices:() => [{lang:'en-GB',name:'British'}],speak(value) { utterance=value; },cancel() {}},Utterance:class {}});
  const first = player.play({word:'hello'}); utterance.onend({elapsedTime:1}); await assert.rejects(first,/没有成功完成/);
  const second = player.play({word:'hello'}); utterance.onstart(); utterance.onend({elapsedTime:.5});
  const result = await second; assert.equal(result.kind,'browser-tts'); assert.equal(result.completed,true);
});


test('compact drafts restore partial answers, prior wrong originals and completed listening without trusting scores',() => {
  let session = V.createSession({trainingVersion:1,material:mat,courseDay:3}); session.begin(); session.setAnswer(0,' studant ');
  const first = session.getDraft(); assert.equal(first.kind,'vocabulary-practice-draft'); assert.equal(Object.hasOwn(first,'rounds'),false); assert.equal(Object.hasOwn(first,'words'),false);
  session = V.createSession({trainingVersion:1,material:mat,courseDay:3,draft:JSON.stringify(first)});
  assert.equal(session.getState().phase,'meaning'); assert.equal(session.getState().answers.meaning[0],' studant ');
  session.setAnswer(1,'get up'); session.setAnswer(2,'I'); session.submitRound();
  const originalAttempt = session.getState().rounds[0].attempts[0];
  session = V.createSession({trainingVersion:1,material:mat,courseDay:3,draft:session.getDraft()}); assert.equal(session.getState().phase,'feedback');
  assert.deepEqual(session.getState().rounds[0].attempts[0],originalAttempt);
  session.next(); finishRound(session); session.next(); finishRound(session);
  const payload = session.getSubmission();
  session = V.createSession({trainingVersion:1,material:mat,courseDay:3,draft:session.getDraft()});
  assert.deepEqual(session.getSubmission(),payload); assert.equal(session.getSubmission().correct,8); assert.equal(session.getSubmission().mistakes[0].userAnswer,' studant ');
});

test('mismatched, oversized and inconsistent vocabulary drafts fail without being silently reset',() => {
  const session = V.createSession({trainingVersion:1,material:mat}),draft = session.getDraft();
  assert.throws(() => V.createSession({trainingVersion:1,material:{...mat,id:'another'},draft}),/草稿与当前材料/);
  assert.throws(() => V.createSession({trainingVersion:1,material:mat,courseDay:2,draft}),/草稿与当前材料/);
  assert.throws(() => V.createSession({trainingVersion:1,material:mat,draft:{...draft,wordKeys:['another']}}),/草稿与当前材料/);
  assert.throws(() => V.createSession({trainingVersion:1,material:mat,draft:{...draft,phase:'complete',round:3}}),/草稿与当前材料/);
  assert.throws(() => V.createSession({trainingVersion:1,material:mat,draft:{...draft,answers:{meaning:{0:'x'.repeat(201)},completion:{},dictation:{}}}}),/草稿与当前材料/);
  assert.throws(() => V.createSession({trainingVersion:1,material:mat,draft:' '.repeat(15001)}),/超过15KB/);
});

test('worst-length answers and listening metadata for all current vocabulary groups fit the course draft field',() => {
  for (const material of curriculum.materials.filter(item => item.type === 'vocabulary')) {
    const session = V.createSession({trainingVersion:1,material}); session.begin();
    for (let round=0;round<3;round++) {
      session.words.forEach((_,index) => { session.setAnswer(index,'x'.repeat(200)); if (round===2) session.markPlayed(index,{...proof(),source:'v'.repeat(200)}); });
      session.submitRound(); if (round<2) session.next();
    }
    const draft = session.getDraft(); assert.ok(JSON.stringify(draft).length <= 15000,material.id);
    assert.equal(V.createSession({trainingVersion:1,material,draft}).getSubmission().correct,0);
  }
});

function spokenProof(index,trial,word,nonce='run') {
  const crypto=require('node:crypto'),key=nonce+'-'+index+'-'+trial;
  return {workId:'work-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,36),reference:word,hash:crypto.createHash('sha256').update('pcm-'+key).digest('hex'),evidenceId:'evidence-'+key,provider:'Alibaba oral assessment',verified:true,nonSilent:true,durationSeconds:1,recordedAt:new Date().toISOString(),result:{accuracy:90,fluency:85,completeness:95}};
}
function learnAll(session,nonce='run') {session.words.forEach((word,index)=>{for(let trial=1;trial<=3;trial++)assert.equal(session.recordSpelling(index,word.word),true);for(let trial=1;trial<=3;trial++)session.recordSpeaking(index,spokenProof(index,trial,word.word,nonce));});}
test('v2 requires each word three correct spellings followed by three independent professional mic recordings',()=>{
 const session=V.createSession({material:mat});assert.equal(session.version,2);assert.throws(()=>session.begin(),/三遍正确英文输入/);assert.equal(session.recordSpelling(0,'studant'),false);assert.equal(session.learningProgress().items[0].spellings,0);assert.throws(()=>session.recordSpeaking(0,spokenProof(0,1,'student')),/跟读必须/);
 learnAll(session);assert.equal(session.learningProgress().complete,true);assert.throws(()=>session.recordSpeaking(0,spokenProof(0,4,'student')),/已完成/);session.begin();assert.equal(session.state.phase,'completion');finishRound(session);session.next();assert.equal(session.state.phase,'meaning');finishRound(session);session.next();assert.equal(session.state.phase,'dictation');finishRound(session);
 const payload=session.getSubmission();assert.equal(payload.schema,2);assert.equal(payload.trainingVersion,2);assert.equal(payload.trainingComplete,true);assert.equal(payload.pass,true);const raw=JSON.parse(payload.answer);assert.equal(raw.learning.length,3);assert.equal(raw.learning[0].spellings.length,3);assert.equal(raw.learning[0].speaking.length,3);
});
test('v2 never accepts reused work IDs, reused PCM or missing professional dimensions as a separate reading',()=>{
 const session=V.createSession({material:mat});for(let i=0;i<3;i++)session.recordSpelling(0,'student');const proof=spokenProof(0,1,'student');session.recordSpeaking(0,proof);
 assert.throws(()=>session.recordSpeaking(0,{...proof,workId:'work-another-123456789',evidenceId:'another'}),/同一原音/);assert.throws(()=>session.recordSpeaking(0,{...spokenProof(0,2,'student'),nonSilent:false}),/独立、非静音/);assert.throws(()=>session.recordSpeaking(0,{...spokenProof(0,2,'student'),result:{accuracy:90,fluency:null,completeness:95}}),/完整阿里/);
 const low={...spokenProof(0,2,'student'),result:{accuracy:10,fluency:40,completeness:50}};session.recordSpeaking(0,low);assert.equal(session.learningProgress().items[0].speaking,2);assert.equal(session.state.study.speaking[0][1].passed,false);
});
test('v2 draft restores text immediately but never trusts stored audio IDs until original works are verified',()=>{
 const session=V.createSession({material:mat});learnAll(session);session.begin();finishRound(session);session.next();session.setAnswer(0,'student');const draft=session.getDraft();assert.equal(draft.schema,2);assert.equal(draft.study.s[0].length,3);assert.equal(draft.study.w[0].length,3);
 const resumed=V.createSession({material:mat,draft});assert.equal(resumed.state.phase,'meaning');assert.equal(resumed.learningProgress().complete,false);assert.equal(resumed.getSubmission(),null);assert.throws(()=>resumed.submitRound(),/三写三读/);
 resumed.words.forEach((word,index)=>{for(let trial=1;trial<=3;trial++)resumed.recordSpeaking(index,spokenProof(index,trial,word.word));});resumed.finishStudyRestore();assert.equal(resumed.learningProgress().complete,true);assert.equal(resumed.getState().answers.meaning[0],'student');
});
test('legacy drafts retain their old round order and raw answers without being certified as the new training',()=>{
 const legacy=V.createSession({trainingVersion:1,material:mat});legacy.begin();finishRound(legacy);legacy.next();finishRound(legacy);const restored=V.createSession({material:mat,draft:legacy.getDraft()});assert.equal(restored.version,1);assert.deepEqual(restored.modes,['meaning','completion','dictation']);restored.next();finishRound(restored);const payload=restored.getSubmission();assert.equal(payload.testPass,true);assert.equal(payload.pass,false);assert.equal(payload.trainingComplete,false);assert.equal(payload.evaluation.result,'unverified');
});
test('v2 authoring groups fit both course draft and immutable work limits with all study evidence retained',()=>{
 const dictionary=D.create({courseData:course,curriculumData:curriculum});
 for(const material of curriculum.materials.filter(item=>item.type==='vocabulary')){const session=V.createSession({material,dictionary});learnAll(session,material.id);session.begin();for(let round=0;round<3;round++){session.words.forEach((word,index)=>{session.setAnswer(index,'x'.repeat(200));if(session.state.phase==='dictation')session.markPlayed(index,{...proof(),source:'v'.repeat(200)});});session.submitRound();if(round<2)session.next();}assert.ok(JSON.stringify(session.getDraft()).length<=15000,material.id+' draft='+JSON.stringify(session.getDraft()).length);assert.ok(session.getSubmission().answer.length<=50000,material.id+' original too long');}
});


test('training readiness recomputes original spelling, professional dimensions and all test answers instead of cached pass flags',()=>{
 const session=V.createSession({material:mat});learnAll(session);session.begin();finishRound(session);session.next();finishRound(session);session.next();finishRound(session);const raw=JSON.parse(session.getSubmission().answer);
 raw.pass=false;raw.score=0;raw.rounds.forEach(round=>{round.correct=0;round.attempts.forEach(item=>{item.correct=false;});});let check=V.verifyTrainingArtifact(raw,mat);assert.equal(check.valid,true);assert.equal(check.mastered,true);
 const wrong=JSON.parse(JSON.stringify(raw));wrong.rounds[0].attempts[0].userAnswer='studant';wrong.rounds[0].attempts[0].correct=true;wrong.pass=true;check=V.verifyTrainingArtifact(wrong,mat);assert.equal(check.submitted,true);assert.equal(check.testsCorrect,false);assert.equal(check.mastered,false);
 const low=JSON.parse(JSON.stringify(raw));low.learning[0].speaking[0].passed=true;low.learning[0].speaking[0].result.accuracy=1;check=V.verifyTrainingArtifact(low,mat);assert.equal(check.submitted,true);assert.equal(check.professionalPassed,false);assert.equal(check.mastered,false);
 for(const field of ['workId','hash','evidenceId']){const bad=JSON.parse(JSON.stringify(raw));bad.learning[0].speaking[1][field]=bad.learning[0].speaking[0][field];assert.equal(V.verifyTrainingArtifact(bad,mat).valid,false,field);}
 const missing=JSON.parse(JSON.stringify(raw));delete missing.learning;missing.trainingComplete=true;assert.equal(V.verifyTrainingArtifact(missing,mat).valid,false);
 const unheard=JSON.parse(JSON.stringify(raw));unheard.rounds[2].attempts[0].audio.completed=false;assert.equal(V.verifyTrainingArtifact(unheard,mat).valid,false);
 assert.equal(V.verifyTrainingArtifact({...raw,trainingVersion:1},mat).valid,false);
});


test('real course wrapper with schema 1 and trainingSchema 2 retains v2 validation without rewriting legacy works',()=>{
 const session=V.createSession({material:mat});learnAll(session);session.begin();finishRound(session);session.next();finishRound(session);session.next();finishRound(session);const raw=JSON.parse(session.getSubmission().answer),courseArtifact={schema:1,courseDay:1,mode:'practice',startedAt:session.state.startedAt,answers:{},text:'',transcript:'',interrupted:false},wrapped={...courseArtifact,...raw,schema:1,trainingSchema:raw.schema};
 assert.equal(wrapped.schema,1);assert.equal(wrapped.trainingVersion,2);assert.equal(V.verifyTrainingArtifact(wrapped,mat).submitted,true);assert.equal(V.verifyTrainingArtifact(wrapped,mat).mastered,true);
 assert.equal(V.verifyTrainingArtifact({...wrapped,trainingVersion:1,trainingSchema:1},mat).submitted,false);assert.equal(V.verifyTrainingArtifact({...wrapped,trainingComplete:false},mat).submitted,false);
});
