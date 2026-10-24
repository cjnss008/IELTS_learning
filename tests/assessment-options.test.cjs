'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../assets/assessment-core.js');
const choices=()=>({id:'q1',type:'single',options:['A changing market','Why the plan failed','The value of practice','An unexpected result'],answers:['A changing market'],explanation:'原文明确说明市场变化。',evidence:'The market changed.'});

test('display order is a stable copy and preserves every option, including repeated text',()=>{
  const question=choices();question.options.push('Why the plan failed');
  const before=structuredClone(question);Object.freeze(question.options);Object.freeze(question.answers);Object.freeze(question);
  const first=A.displayOptions(question,'reading-1','attempt-1');
  assert.notEqual(first,question.options);
  assert.deepEqual(first.slice().sort(),question.options.slice().sort());
  assert.deepEqual(first,A.displayOptions(question,'reading-1','attempt-1'));
  first.pop();assert.deepEqual(question,before);
});

test('material, question and attempt identities each contribute to option order',()=>{
  const question=choices();
  for(const dimension of ['material','question','attempt']){
    const orders=Array.from({length:16},(_,i)=>JSON.stringify(A.displayOptions({...question,id:dimension==='question'?'q'+i:question.id},dimension==='material'?'reading-'+i:'reading-1',dimension==='attempt'?'attempt-'+i:'attempt-1')));
    assert.ok(new Set(orders).size>1,dimension+' identity must affect the display');
  }
});

test('single and multi grading still use original answer text after display shuffling',()=>{
  const single=choices(),multi={...choices(),id:'q2',type:'multi',answers:['The value of practice','An unexpected result']};
  const before=structuredClone([single,multi]);
  for(let i=0;i<16;i++){
    const shown=A.displayOptions(single,'reading-1','attempt-'+i);
    assert.equal(A.gradeQuestion(single,shown.find(value=>value===single.answers[0])).correct,true);
    assert.equal(A.gradeQuestion(single,shown.find(value=>value!==single.answers[0])).correct,false);
    const selected=A.displayOptions(multi,'reading-1','attempt-'+i).filter(value=>multi.answers.includes(value));
    assert.equal(A.gradeQuestion(multi,selected).correct,true);
    assert.equal(A.gradeQuestion(multi,selected.slice(0,1)).correct,false);
  }
  assert.deepEqual([single,multi],before);
});

test('conventional judgment enums keep their supplied order without exposing the original array',()=>{
  for(const options of [['True','False','Not Given'],['TRUE','FALSE','NOT GIVEN'],['Not Given','True','False'],['Yes','No','Not Given'],['True','False'],['Yes','No'],['正确','错误','未提及']]){
    const question={id:'enum',type:'single',options};
    for(const seed of ['attempt-1','attempt-2']){const shown=A.displayOptions(question,'reading-1',seed);assert.deepEqual(shown,options);assert.notEqual(shown,options);}
  }
});

test('A–F map references keep their order in both actual listening plans',()=>{
  const {materials}=require('../tools/listening-maps.cjs');
  for(const material of materials)for(const question of material.questions.slice(0,6))for(const attempt of ['first','retest']){
    assert.deepEqual(A.displayOptions(question,material.id,attempt),question.options);
    assert.equal(A.gradeQuestion(question,question.answers[0]).correct,true);
  }
});

test('headings, grammar articles and ordinary words resembling an enum are shuffled',()=>{
  for(const options of [choices().options,['a','an','the'],['beautiful','true','loud','old']]){
    const question={id:'q1',type:'single',options};
    const orders=Array.from({length:20},(_,i)=>A.displayOptions(question,'material-'+i,'attempt'));
    assert.ok(orders.some(order=>JSON.stringify(order)!==JSON.stringify(options)));
    for(const order of orders)assert.deepEqual(order.slice().sort(),options.slice().sort());
  }
});

test('an original first-position answer reaches every position across stable question seeds',()=>{
  const question=choices(),positions=[0,0,0,0];
  for(let i=0;i<128;i++)positions[A.displayOptions(question,'distribution-material-'+i,'attempt-1').indexOf(question.answers[0])]++;
  for(const count of positions)assert.ok(count>=12&&count<=52,JSON.stringify(positions));
});
