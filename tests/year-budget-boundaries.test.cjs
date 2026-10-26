'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
const B=require('../tools/year-budget-estimates.cjs'),P=require('../tools/year-budget-planner.cjs'),input=require('./year-budget-fixture.cjs').load().legacyInput;
test('invalid/infinite forecast inputs terminate promptly rather than loop',()=>{
 const modulePath=path.resolve(__dirname,'../tools/year-budget-estimates.cjs');
 for(const expression of ['B.forecast(Infinity)','B.forecast(NaN)','B.forecast(-1)','B.forecast(20,{...B.DEFAULT,focusMinutes:0})','B.forecast(20,{...B.DEFAULT,focusMinutes:Infinity})','B.forecast(20,{...B.DEFAULT,cycles:1.5})','B.forecast(20,{...B.DEFAULT,longBreakMinutes:Infinity})']){
  const code='const B=require('+JSON.stringify(modulePath)+');try{'+expression+';process.exit(2)}catch(e){if(!(e instanceof RangeError))process.exit(3)}';const result=spawnSync(process.execPath,['-e',code],{timeout:1500});assert.equal(result.error,undefined,expression);assert.equal(result.status,0,expression);
 }
});
test('planner rejects invalid contingency, level gaps and fractional scheduling counts',()=>{
 for(const policy of [{contingencyStudyMinutes:Infinity},{contingencyStudyMinutes:NaN},{maxBelowLevel:Infinity},{maxBelowLevel:NaN},{cycles:1.5},{maxNewMaterialsPerDay:1.5}])assert.throws(()=>P.build(input,{policy}));
});
test('a public high-level source cannot raise the original core placement ceiling',()=>{
 const map=new Map([['core',{level:'A1'}],['public',{level:'C1',source:{publicSourceId:'public-example'}}]]),day={tasks:[{id:'reading',materialIds:['core','public']}]};assert.equal(P.levelEligible({skill:'reading',level:'B2'},day,map,{maxBelowLevel:1}),false);assert.equal(P.levelEligible({skill:'reading',level:'A1'},day,map,{maxBelowLevel:1}),true);
});
test('valid frozen scenario keeps its original source/derived accounting',()=>{const p=P.build(input);assert.deepEqual(p.summary.sources,{total:272,assigned:272,pending:0});assert.deepEqual(p.summary.all,{total:688,assigned:461,pending:227});});
