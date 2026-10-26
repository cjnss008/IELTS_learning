'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../assets/assessment-core.js'),M=require('../assets/mistake-book.js');
// English labels are a live source overlay in mistake-review; the historical
// mistake question intentionally stores canonical options only.
const correct=(api,q,value)=>{if(api===A)return api.gradeQuestion(q,value).correct;const {optionsEnglish,...stored}=q;return api.gradeObjective(stored,value).status==='passed';};
test('canonical wrong capitalization and punctuation choices stay wrong in course grading and corrections',()=>{
 const q={id:'case',type:'single',prompt:'Choose the complete capitalized sentence.',options:['I am Ben.','i am Ben.','I am Ben'],answers:['I am Ben.']};
 for(const api of [A,M]){assert.equal(correct(api,q,'I am Ben.'),true);assert.equal(correct(api,q,'i am Ben.'),false);assert.equal(correct(api,q,'I am Ben'),false);assert.equal(correct(api,q,'I AM BEN.'),false);}
});
test('noncanonical legacy formatting resolves only one canonical choice and retains Chinese answer values behind English display labels',()=>{
 const q={id:'unique',type:'single',prompt:'Choose a color.',options:['Blue','Red'],answers:['Blue']};
 const zh={id:'english-labels',type:'single',prompt:'What color is it?',options:['蓝色','红色'],optionsEnglish:['Blue','Red'],answers:['蓝色']};
 for(const api of [A,M]){assert.equal(correct(api,q,' blue '),true);assert.equal(correct(api,q,'RED'),false);assert.equal(correct(api,zh,'蓝色'),true);assert.equal(correct(api,zh,'红色'),false);assert.equal(correct(api,zh,'Blue'),false);}
});
test('multi choice collisions, duplicates and noncanonical ambiguous input cannot pass but unique legacy case fallback can',()=>{
 const q={id:'multi',type:'multi',prompt:'Select the required forms.',options:['I','i','You'],answers:['I','You']};
 for(const api of [A,M]){assert.equal(correct(api,q,['You','I']),true);assert.equal(correct(api,q,['i','You']),false);assert.equal(correct(api,q,[' I ','You']),false);assert.equal(correct(api,q,['I','I','You']),false);assert.equal(correct(api,q,['I','you']),true);}
});
test('fill answers preserve tolerant case, whitespace and apostrophe normalization',()=>{
 assert.equal(A.gradeQuestion({id:'fill',type:'fill',answers:["I'm ready"],maxWords:2},' I’M   READY ').correct,true);
 assert.equal(M.gradeObjective({id:'short',type:'short',prompt:'Write two words.',answers:["I'm ready"],maxWords:2},' I’M   READY ').status,'passed');
});
test('old correction rounds keep their original raw answer and proof while new collision proofs remain strict',()=>{
 const now='2026-10-26T00:00:00.000Z',q={id:'q-case',type:'single',prompt:'Choose I.',options:['I','i'],answers:['I']};
 const captured=M.capture(M.newState(),{id:'capture-case',dayNumber:1,source:'course',materialId:'sample-case',recordId:'work-case',skill:'grammar',questionId:q.id,title:'Case',question:q,originalAnswer:'i',at:now},now);
 const round=M.submitRound(captured.state,1,{[captured.item.id]:'I'},{id:'round-case',now});
 const legacy=JSON.parse(JSON.stringify(round.state)),result=legacy.days[1].rounds[0].results[0];result.answer=' I ';delete result.evidence.choiceMatching;
 const before=JSON.stringify(legacy),parsed=M.parseState(legacy);assert.equal(JSON.stringify(legacy),before);assert.equal(parsed.days[1].rounds[0].results[0].answer,' I ');assert.equal(parsed.items[0].originalAnswer,'i');assert.equal(parsed.items[0].status,'passed');
 const strict=JSON.parse(before);strict.days[1].rounds[0].results[0].evidence.choiceMatching='canonical-v2';assert.throws(()=>M.parseState(strict),/通过标记/);
});
