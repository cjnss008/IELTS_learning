'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module'),A=require('../assets/assessment-core.js'),F=require('../assets/objective-feedback.js'),V=require('../assets/vocabulary-practice.js');
const listening=JSON.parse(fs.readFileSync(path.join(__dirname,'../curriculum/materials/w01-listen-1.json'),'utf8')),reading=JSON.parse(fs.readFileSync(path.join(__dirname,'../curriculum/materials/w01-read-1.json'),'utf8'));
const text=value=>value.points.join('\n');

test('UK feedback explains the missing article, real sentence and a maximum of two words without changing grading',()=>{
 const q=listening.questions.find(q=>q.answers?.includes('the UK')),grade=A.gradeQuestion(q,'UK'),before=JSON.stringify({q,grade}),result=F.explain(q,'UK',{grade,sourceText:listening.transcript,sourceKind:'listening'});
 assert.equal(grade.correct,false);assert.equal(grade.withinLimit,true);assert.equal(result.status,'incorrect');assert.ok(result.issues.includes('missing-article'));assert.match(text(result),/United Kingdom/);assert.match(text(result),/最多 2 词，不是至少 2 词/);assert.match(text(result),/1 词，没有超过上限/);assert.equal(result.evidence,'I am from the UK.');assert.equal(result.evidenceVerified,true);assert.equal(result.evidenceLabel,'录音原句');assert.equal(JSON.stringify({q,grade}),before);
});
test('classmate feedback explains plural meaning and why one word is not a singular-form instruction',()=>{
 const q=reading.questions.find(q=>q.answers?.includes('classmates')),result=F.explain(q,'classmate',{sourceText:reading.passage,sourceKind:'reading'});assert.equal(result.status,'incorrect');assert.ok(result.issues.includes('number-form'));assert.match(text(result),/classmate 是单数，classmates 是复数/);assert.match(text(result),/一个词.*词数.*单数/);assert.equal(result.evidenceVerified,true);assert.equal(result.evidenceLabel,'原文句子');assert.equal(A.gradeQuestion(q,'classmate').correct,false);
});
test('a source-dependent noun-number rule is not invented for news or a verb ending in s',()=>{
 for(const [answer,input,evidence]of [['news','new','The news is good.'],['books','book','He books a room.'],['goes','go','She goes home.']]){const q={type:'fill',answers:[answer],evidence,maxWords:1},result=F.explain(q,input,{sourceText:evidence,sourceKind:'grammar'});assert.ok(!result.issues.includes('number-form'));assert.equal(result.status,'incorrect');}
});
test('accepted variants remain correct and case or outer whitespace does not produce a fabricated mistake',()=>{
 const q={type:'fill',answers:['the UK','UK'],maxWords:2,evidence:'I am from the UK.'};for(const input of ['UK','  The uk  ']){const result=F.explain(q,input,{sourceText:q.evidence});assert.equal(result.status,'correct');assert.equal(result.issues.length,0);}
});
test('missing and extra words are identified from the actual token difference',()=>{
 let q={type:'fill',answers:['in the park'],maxWords:3,evidence:'She is in the park.'},result=F.explain(q,'in park',{sourceText:q.evidence});assert.ok(result.issues.includes('missing-words'));assert.match(text(result),/漏掉“the”/);
 q={type:'fill',answers:['the UK'],maxWords:2,evidence:'I am from the UK.'};result=F.explain(q,'from the UK',{sourceText:q.evidence});assert.ok(result.issues.includes('word-limit'));assert.ok(result.issues.includes('extra-words'));assert.match(text(result),/多写“from”/);assert.match(text(result),/3 词.*2 词上限/);
});
test('spelling guidance identifies real differing letters and does not claim an observed listening cause',()=>{
 const q={type:'spelling',answers:['student'],evidence:'I am a student.'},result=F.explain(q,'studant',{sourceText:q.evidence,sourceKind:'vocabulary'});assert.ok(result.issues.includes('letter-difference'));assert.match(text(result),/第 5 个字母.*“a”.*“e”/);assert.match(text(result),/不能确定.*辨词错误.*拼写笔误/);
});
test('vocabulary keeps its own strict spacing judgement instead of borrowing a looser objective normalizer',()=>{
 const q={type:'spelling',answers:['get up'],evidence:'I get up at seven.'},grade={correct:false,answered:true,gradable:true,withinLimit:true,expected:['get up']},result=F.explain(q,'get  up',{grade,normalizeAnswer:V.normalizeAnswer,sourceText:q.evidence,sourceKind:'vocabulary'});assert.equal(result.status,'incorrect');assert.ok(result.issues.includes('spacing'));assert.equal(grade.correct,false);assert.equal(result.userAnswer,'get  up');
});
test('unknown answers and blank answers stay pending or unanswered instead of acquiring a speculative grammar fault',()=>{
 assert.equal(F.explain({type:'fill',answers:[]},'UK').status,'pending');assert.equal(F.explain({type:'fill',answers:['the UK']},'').status,'unanswered');assert.deepEqual(F.explain({type:'fill',answers:[]},'UK').issues,[]);
});
test('the reference excerpt is not called a verified original sentence when it is absent from supplied source text',()=>{
 const q={type:'fill',answers:['classmates'],prompt:'从原文取一个词',evidence:'An unrelated excerpt.'},result=F.explain(q,'classmate',{sourceText:'A different passage.',sourceKind:'reading'});assert.equal(result.evidenceVerified,false);assert.equal(result.evidenceLabel,'题目所附依据');assert.ok(!result.issues.includes('number-form'));assert.match(text(result),/未定位.*参考形式/);
});
test('course objective results show detailed reasons and distinguish missing answer keys from actual errors',async()=>{
 const fixtureFile=path.join(__dirname,'course-player-dom.test.cjs'),source=fs.readFileSync(fixtureFile,'utf8'),{fixture}=new Function('require','__dirname',source.slice(0,source.indexOf('\ntest('))+'\nreturn {fixture};')(createRequire(fixtureFile),__dirname);
 const questions=[{id:'q1',type:'fill',prompt:'Tom来自哪里？',answers:['the UK'],maxWords:2,evidence:'I am from the UK.',explanation:'Tom说他来自英国。'},{id:'q2',type:'fill',prompt:'尚待核对的题目',answers:[]},{id:'q3',type:'fill',prompt:'尚未作答',answers:['China']}],f=fixture({id:'listening-explanation',skill:'listening',transcript:'Tom: I am from the UK.',questions},{window:{IELTSObjectiveFeedback:F}});await new Promise(resolve=>setImmediate(resolve));await f.win.IELTSTodayNavigation.resumeNext('listening',f.mat.id);const inputs=f.nodes.get('courseQuestions').querySelectorAll('input');inputs[0].value='UK';await inputs[0].fire('input');inputs[1].value='unverified';await inputs[1].fire('input');f.advance(1000);await f.nodes.get('courseSubmit').fire('click');
 const box=f.nodes.get('courseResult'),details=box.querySelectorAll('details');assert.match(box.textContent,/United Kingdom/);assert.match(box.textContent,/你的原始答案：UK/);assert.equal(box.querySelectorAll('.course-objective-feedback').length,1);assert.ok(details.some(detail=>detail.dataset.result==='pending'));assert.ok(details.some(detail=>detail.dataset.result==='unanswered'));assert.equal(f.records()[0].evaluation.score,0);assert.equal(A.decodeArtifact(f.records()[0]).answers.q1,'UK');
});
