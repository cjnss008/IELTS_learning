'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{audit}=require('../tools/audit-learning-progression.cjs');
test('progression audit counts repeated content but preserves deliberate option letter-case distinctions',()=>{
 const grammar={id:'case-grammar',week:1,skill:'grammar',pool:'training',fullTest:false,type:'grammar',title:'Capital letters',passage:'Capitalize I.',questions:[{id:'q1',type:'single',prompt:'Choose the correctly capitalized sentence.',options:['i am Lee.','I am Lee.'],answers:['I am Lee.'],evidence:'I am Lee.'}]};
 const faulty={...grammar,id:'duplicate-grammar',questions:[{id:'q2',type:'single',prompt:'Choose the correct form.',options:['because of she was sick','because she was sick','because of she was sick'],answers:['because she was sick']}]};
 const data={status:'fixture',materials:[grammar,faulty],weeks:[],days:[{day:1,week:1,tasks:[{id:'grammar',skill:'grammar',mode:'practice',materialIds:[grammar.id,faulty.id]}]},{day:2,week:1,tasks:[{id:'grammar',skill:'grammar',mode:'practice',materialIds:[grammar.id]}]}]};
 const result=audit(data);assert.equal(result.summary.grammar.assignments,3);assert.equal(result.summary.grammar.uniqueMaterialIds,2);assert.equal(result.summary.grammar.reusedAssignments,1);assert.equal(result.summary.grammar.daysWithNoNewContent,1);assert.deepEqual(result.questionAudit.issues.duplicateOptions,[{id:'duplicate-grammar',questionId:'q2'}]);
});
