'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../assets/memory-core.js'),E=require('../assets/essential-vocabulary-core.js'),Data=require('../assets/essential-vocabulary-data.js');
const {helper}=require('./daily-review-fixture.cjs'),{recall,BASE,DAY}=helper('essential-vocabulary-core.test.cjs','recall,BASE,DAY');
const familyFixture=helper('essential-vocabulary-extensions-v114.test.cjs','fixture').fixture;
const options=(records=[],more={})=>({data:Data,now:BASE+60*DAY,courseDay:3,remainingMinutes:120,records,familyRecords:records,...more});
function evidence(word){let state=M.captureTraining(M.newState(),{attempts:[{id:'proof-seed',word:word.word,meaning:word.meaning,submittedAt:new Date(BASE).toISOString(),correct:true}]}),records=[],at=BASE+3*DAY;for(let round=0;round<2;round++)for(const skill of M.SKILLS){state=recall(state,records,word,skill,at);at+=3*DAY;}return{state,records,at};}

test('empty delayed evidence avoids full-catalog card-ID scans without awarding credit',()=>{
 const original=M.idFor,state=M.newState(),before=JSON.stringify(state);let calls=0,plan;try{M.idFor=(...args)=>{calls++;return original(...args)};plan=E.plan(state,options());}finally{M.idFor=original;}
 assert.equal(plan.stats.total,8000);assert.equal(plan.stats.delayedVerifiedWords,0);assert.equal(plan.stats.delayedRecallWords,0);assert.deepEqual(plan.stats.verifiedBySkill,{recognition:0,spelling:0,listening:0,production:0});assert.equal(calls,0);assert.equal(JSON.stringify(state),before);
});
test('one linked recall still counts reviewed without prematurely verifying it',()=>{
 const word=Data.entries.find(x=>x.word==='student'),records=[];let state=M.captureTraining(M.newState(),{attempts:[{id:'proof-seed',word:word.word,meaning:word.meaning,submittedAt:new Date(BASE).toISOString(),correct:true}]});state=recall(state,records,word,'recognition',BASE+3*DAY);const before=JSON.stringify([state,records]),plan=E.plan(state,options(records,{now:BASE+4*DAY}));assert.equal(plan.stats.delayedRecallWords,1);assert.equal(plan.stats.delayedVerifiedWords,0);assert.ok(Object.values(plan.stats.verifiedBySkill).every(n=>n===0));assert.equal(JSON.stringify([state,records]),before);
});
test('linked delayed evidence verifies four skills; missing originals or later mistakes revoke it',()=>{
 const word=Data.entries.find(x=>x.word==='student'),f=evidence(word);let plan=E.plan(f.state,options(f.records,{now:f.at}));assert.equal(plan.stats.delayedVerifiedWords,1);for(const skill of M.SKILLS)assert.equal(plan.stats.verifiedBySkill[skill],1);
 plan=E.plan(f.state,options(f.records.slice(1),{now:f.at}));assert.equal(plan.stats.delayedVerifiedWords,0);f.state=recall(f.state,f.records,word,'recognition',f.at,false,true);plan=E.plan(f.state,options(f.records,{now:f.at+1000}));assert.equal(plan.stats.delayedVerifiedWords,0);
});
test('family spelling alias and extensions retain separate current identity and proof',t=>{
 const f=familyFixture(t),initial=E.plan(M.newState(),f.opts());assert.equal(initial.stats.total,8000);assert.equal(initial.newWords.filter(w=>w.lexicalKind==='extension').length,24);assert.equal(initial.newWords.find(w=>w.word==='liter').familyCanonicalId,'essential:litre');
 const proof=evidence(f.targets.find(w=>w.word==='liter'));f.setRecords(proof.records);const verified=E.plan(proof.state,f.opts({now:proof.at}));assert.equal(verified.stats.delayedVerifiedWords,1);for(const skill of M.SKILLS)assert.equal(verified.stats.verifiedBySkill[skill],1);
 const stale=E.plan(proof.state,f.opts({now:proof.at,records:[],familyRecords:[]}));assert.equal(stale.stats.delayedVerifiedWords,0);assert.equal(stale.newWords.length,0);
});
test('empty skill list retains the preexisting every-empty-list behavior',()=>{
 const original=M.SKILLS.slice();try{M.SKILLS.splice(0);const entries=[{id:'essential:river',word:'river',meaning:'河',rank:1},{id:'essential:garden',word:'garden',meaning:'花园',rank:2}],plan=E.plan(M.newState(),options([],{entries}));assert.equal(plan.stats.delayedVerifiedWords,2);assert.deepEqual(plan.stats.verifiedBySkill,{});}finally{M.SKILLS.splice(0,M.SKILLS.length,...original);}
});

test('sparse skill arrays preserve the preexisting every-skips-holes behavior',()=>{
 const original=M.SKILLS.slice(),entries=[{id:'essential:river',word:'river',meaning:'河',rank:1},{id:'essential:garden',word:'garden',meaning:'花园',rank:2}];try{M.SKILLS.splice(0);M.SKILLS.length=2;assert.equal(M.SKILLS.every(()=>false),true);const plan=E.plan(M.newState(),options([],{entries}));assert.equal(plan.stats.delayedVerifiedWords,2);assert.equal(plan.stats.verifiedBySkill.undefined,0);}finally{M.SKILLS.splice(0,M.SKILLS.length,...original);}
});
