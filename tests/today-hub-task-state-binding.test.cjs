'use strict';
// taskState must derive its own latest answers; an injected map can never grant completion.
const test=require('node:test'),assert=require('node:assert/strict');
const Hub=require('../assets/today-hub.js');
const at='2026-10-25T10:00:00.000Z';
const material={id:'r1',skill:'reading',type:'practice',level:'A0',questions:[{id:'q',type:'single',options:['a','b'],answers:['a']}],source:{verification:'reviewed'}};
const task={id:'reading',minutes:60,materialIds:['r1'],coreMaterialIds:['r1']};
const data={materials:[material],days:[{day:1,tasks:[task]}],weeks:[{week:1,level:'A0'}]};
const options={data,dayNumber:1,materials:data.materials};
const record={id:'work-r1',version:1,materialId:'r1',taskId:'reading',skill:'reading',kind:'original',dayNumber:1,submittedAt:at,startedAt:'2026-10-25T09:50:00.000Z',activeSeconds:600,activityByDate:{'2026-10-25':600},answer:JSON.stringify({schema:1,answers:{q:'a'}}),evaluation:{method:'objective',result:'pass'}};

test('an injected latest map cannot turn empty records into completion',()=>{
 const forged=new Map([['r1',{...record}]]);
 const state=Hub.taskState(task,[],{...options,latest:forged});
 assert.equal(state.done,false);assert.deepEqual(state.missingMaterialIds,['r1']);assert.equal(state.count,0);
 const pair=Hub.taskStateAndLatest(task,[],{...options,latest:forged});
 assert.equal(pair.state.done,false);assert.equal(pair.latest.size,0);assert.equal(pair.latest instanceof Map,true);
});

test('empty records with a material id remain incomplete even when the caller claims a pass',()=>{
 const state=Hub.taskState(task,[],options);
 assert.equal(state.done,false);assert.equal(state.pending,false);assert.deepEqual(state.missingMaterialIds,['r1']);
 const forgedEmpty=new Map();// an empty map is not completion either
 const withEmpty=Hub.taskState(task,[],{...options,latest:forgedEmpty});
 assert.equal(withEmpty.done,false);assert.deepEqual(withEmpty.missingMaterialIds,['r1']);
});

test('a real complete original is still recognised and the pair returns the same answer map',()=>{
 const pair=Hub.taskStateAndLatest(task,[record],options);
 assert.equal(pair.state.done,true);assert.equal(pair.latest instanceof Map,true);assert.equal(pair.latest.get('r1'),record);
 assert.deepEqual(Hub.taskState(task,[record],options),pair.state);
 assert.equal('latest' in Hub.taskState(task,[record],options),false);
 // a forged map must not hide a real pass
 const forged=new Map();
 assert.equal(Hub.taskState(task,[record],{...options,latest:forged}).done,true);
});

test('pending, retest, and draft-only work never becomes completion',()=>{
 const pending={...record,id:'work-pending',evaluation:{method:'none',result:'pending'}};
 assert.equal(Hub.taskStateAndLatest(task,[pending],options).state.done,false);
 const retest={...record,id:'work-retest',kind:'retest'};const retestPair=Hub.taskStateAndLatest(task,[retest],options);
 assert.equal(retestPair.latest.size,0);assert.equal(retestPair.state.done,false);assert.equal(Hub.taskState(task,[retest],options).done,false);
 const draft={id:'draft-r1',courseDay:1,taskId:'reading',materialId:'r1',startedAt:at,text:'old draft'};
 assert.equal(Hub.taskState(task,[],{...options,drafts:[draft]}).done,false);
});
