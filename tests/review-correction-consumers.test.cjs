'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const client=require('../assets/ai-review.js'),mistakes=require('../assets/mistake-book.js'),path=require('../server/writing-path.cjs').createWritingPath({signingKey:Buffer.alloc(32,7)});
const original='I is learning English.',complete={original,revised:'I am learning English.',reason:'主语I与am搭配。'};
function result(corrections,extra={}){return {ok:true,status:'complete',rounds:[{ok:true,round:1,criteria:[],summary:'原有诊断必须保留。',corrections,...extra}],comparison:[]};}
function record(review){return {skill:'writing',answer:JSON.stringify({schema:1,text:original}),evaluation:{method:'ai',result:'pending',feedback:JSON.stringify(review)}};}
test('missing/blank revised or reason never renders an empty correction or becomes an actionable writing issue/mistake',()=>{
 for(const correction of [{original},{original,revised:'',reason:'诊断仍保留'},{original,revised:'  ',reason:'诊断仍保留'},{original,revised:complete.revised},{original,revised:complete.revised,reason:'  '},{original,revised:9,reason:'诊断仍保留'},{...complete,revised:original+'  '},null]){
  const review=result([correction]),before=JSON.stringify(review),formatted=client.format(review);assert.match(formatted,/原有诊断必须保留/);assert.match(formatted,/订正资料不完整/);assert.ok(!formatted.includes('订正建议：'));assert.equal(client.completeCorrections(review.rounds[0]).length,0);assert.deepEqual(path.issues({text:original},review),[]);assert.equal(mistakes.explicitRecordError(record(review)),false);assert.equal(JSON.stringify(review),before,'do not rewrite original parsed/service evidence');
 }
});
test('complete grounded correction remains visible and actionable; absent correction alone never erases a real task failure',()=>{
 const review=result([complete]);assert.match(client.format(review),/I is learning English\. → I am learning English\./);assert.equal(client.completeCorrections(review.rounds[0]).length,1);assert.equal(path.issues({text:original},review)[0].suggestedRevision,complete.revised);assert.equal(mistakes.explicitRecordError(record(review)),true);
 const failed=result([{original}],{levelCheck:{meetsGoal:false,evidence:[{quote:original,comment:'实际缺少题目要求。'}],gaps:['实际目标缺口。']}});assert.equal(mistakes.explicitRecordError(record(failed)),true);assert.match(client.format(failed),/实际目标缺口/);assert.match(client.format(failed),/需要补强/);
 const empty=result([]);assert.ok(!client.format(empty).includes('订正资料不完整'));assert.ok(!client.format(empty).includes('没有错误'));assert.equal(path.issues({text:original},result([{...complete,original:'A different sentence.'}] )).length,0);
});
