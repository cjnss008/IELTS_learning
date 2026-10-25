'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),Audit=require('../tools/audit-question-quality.cjs');
function material(q){return{id:'sample',week:2,level:'A1',skill:'listening',questions:[{id:'q1',type:'single',prompt:'第一位说话者的名字是什么？',options:['Anna','Tom','Lucy'],answers:['Anna'],evidence:'I am Anna.',...q}]};}
test('question audit blocks the self-answering name question in Chinese and English',()=>{
 for(const prompt of ['Anna 的名字是什么？',"What is Anna's name?"]){const findings=Audit.auditMaterial(material({prompt}));assert.equal(findings.some(f=>f.rule==='NAME_ANSWER_IN_QUESTION'&&f.severity==='high'),true);}
});
test('speaker reference alone is not a leaked name answer and proper name alternatives are accepted',()=>{
 assert.deepEqual(Audit.auditMaterial(material({})),[]);assert.deepEqual(Audit.auditMaterial(material({prompt:'Anna 来自哪个国家？',options:['China','Canada','the UK'],answers:['China']})),[]);assert.deepEqual(Audit.auditMaterial(material({prompt:'What time does Anna arrive?',options:['9:00','9:30','10:00'],answers:['9:30']})),[]);
});
test('answer candidates and non-person identity distractors are triaged without claiming all are errors',()=>{
 assert.equal(Audit.auditMaterial(material({prompt:'Which room is Room 6?',options:['Room 6','Room 8','Room 9'],answers:['Room 6']}))[0].severity,'review');assert.ok(Audit.auditMaterial(material({prompt:'Who is Li Ming?',options:['A student','A teacher','A class'],answers:['A student']})).some(f=>f.rule==='IDENTITY_OPTION_CATEGORY'));
});
test('a format example equal to the answer is a blocking leak while a different example is not',()=>{
 const value=material({type:'fill',prompt:"What time does the review start? (e.g. '9 a.m.')",options:[],answers:['9 a.m.']});assert.ok(Audit.auditMaterial(value).some(f=>f.rule==='FORMAT_EXAMPLE_IS_ANSWER'&&f.severity==='high'));value.questions[0].prompt="What time does the review start? (e.g. '2 p.m.')";assert.deepEqual(Audit.auditMaterial(value),[]);
});
test('A0 judgement questions are blocked while enum labels do not become answer-leak findings',()=>{
 const value=material({prompt:'True, False, or Not Given: Anna is a student.',options:['True','False','Not Given'],answers:['True']});value.week=1;value.level='A0';const findings=Audit.auditMaterial(value);assert.ok(findings.some(f=>f.rule==='A0_ABSTRACT_JUDGEMENT'));assert.ok(findings.every(f=>f.rule!=='ANSWER_LITERAL_IN_PROMPT'));
});
test('revised hashes cover explicit author-content fields and exclude immutable audio metadata',()=>{
 const value={...material({}),title:'Sample',instructions:'Listen.',transcript:'I am Anna.',source:{contentHash:'old'},audio:'audio/sample.mp3',audioSynthetic:true,version:'1'};Audit.updateContentHash(value);const {value:payload,keys}=Audit.contentPayload(value);assert.deepEqual(value.source.contentHashFields,keys);assert.equal(value.source.contentHash,crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'));assert.ok(!keys.includes('audio'));assert.ok(!keys.includes('source'));
});
test('the published source corpus has no unresolved high-risk or newly unreviewed literal candidates',()=>{
 const report=Audit.scan(),reviewed=new Set(['training-42-reading/q4/ANSWER_LITERAL_IN_PROMPT','w27-read-2/q5/ANSWER_LITERAL_IN_PROMPT','w28-listen-4/q2/ANSWER_LITERAL_IN_PROMPT']);assert.ok(report.sourceMaterials>=508);assert.ok(report.questions>=5500);assert.equal(report.high,0,JSON.stringify(report.findings.filter(f=>f.severity==='high')));for(const finding of report.findings)assert.ok(reviewed.has([finding.materialId,finding.questionId,finding.rule].join('/')),'Needs a source-based review: '+JSON.stringify(finding));
});

test('title punctuation alias accepts Mr Wang without weakening exact source answers',()=>{
 const fs=require('node:fs'),path=require('node:path'),{validate}=require('../tools/author-curriculum.cjs'),{jobs}=require('../tools/curriculum-manifest.cjs'),A=require('../assets/assessment-core.js');
 const m=JSON.parse(fs.readFileSync(path.join(__dirname,'../curriculum/materials/w01-read-1.json'),'utf8')),job=jobs.find(j=>j.id===m.id),q=m.questions.find(q=>q.answers.includes('Mr Wang'));
 assert.equal(A.gradeQuestion(q,'Mr Wang').correct,true);assert.equal(A.gradeQuestion(q,'Mr. Wang').correct,true);assert.equal(A.gradeQuestion(q,'Mr Wong').correct,false);assert.deepEqual(validate(job,m),[]);
 q.answers.push('Mr Wong');q.answerAliases.push({value:'Mr Wong',source:'Mr. Wang',kind:'title-punctuation'});assert.ok(validate(job,m).some(e=>e.includes('Fill answer not in source')));
});
