'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),T=require('../tools/audit-linked-teaching.cjs');
test('finds direct word-card evidence and an answer in a different question stem',()=>{
 const material={questions:[{id:'q1',prompt:'What does she need?',answers:['Quiet'],evidence:'I need quiet.'},{id:'q2',prompt:'Does he listen to music?',answers:['No']},{id:'q3',prompt:'What does his sister enjoy?',answers:['music']}]};
 const result=T.inspect(material,[{canonicalId:'essential:quiet',quote:'I need quiet.'}]);
 assert.ok(result.some(x=>x.type==='evidence-in-word-card'&&x.question==='q1'));
 assert.ok(result.some(x=>x.type==='answer-in-word-card'&&x.question==='q1'));
 assert.ok(result.some(x=>x.type==='answer-in-other-prompt'&&x.question==='q3'&&x.otherQuestion==='q2'));
 assert.equal(result.some(x=>x.question==='q2'),false);
});
test('phrase matching uses boundaries and does not treat a substring as a word',()=>{
 assert.equal(T.exactPhrase('The college has a goal.','go'),false);
 assert.equal(T.exactPhrase('The child uses a room.','room'),true);
 assert.equal(T.exactPhrase('No, she doesn’t.','doesn\'t'),true);
});
test('a question that includes its own answer is flagged for review',()=>{
 const warnings=T.inspect({questions:[{id:'q1',prompt:'Anna 的名字是什么？',answers:['Anna'],evidence:'My name is Anna.'}]},[]);
 assert.ok(warnings.some(w=>w.type==='answer-in-own-prompt'&&w.question==='q1'));
});
test('another question option mentioning the answer is a weak review lead, not an automatic failure',()=>{
 const warnings=T.inspect({questions:[{id:'q1',prompt:'What is he doing?',options:['He is drinking tea.','He is reading.'],answers:['He is reading.']},{id:'q5',prompt:'What is he drinking?',answers:['Tea.']}]},[]);
 assert.ok(warnings.some(w=>w.type==='answer-in-other-option'&&w.question==='q5'&&w.otherQuestion==='q1'));
});
test('the audit identifies only declared listening/reading materials and never grants approval',()=>{
 const p={active:false,notForLearningCredit:true,materials:[],units:[{day:2,targets:[{canonicalId:'essential:week',quote:'Three times a week.'}],tasks:[{materialRefs:[{materialId:'listen'},{materialId:'write'}]}]}]};
 const out=T.audit(p,new Map([['listen',{id:'listen',skill:'listening',questions:[{id:'q',prompt:'How often?',answers:['Three times a week.'],evidence:'Three times a week.'}]}],['write',{id:'write',skill:'writing',questions:[]}]]));
 assert.equal(out.status,'inactive-heuristic-triage-only');assert.equal(out.days[0].materials.length,1);assert.ok(out.days[0].materials[0].warnings.length);
 assert.throws(()=>T.audit({...p,active:true},new Map()),/inactive/);
});
test('a grammar explanation can expose a later reading answer, without treating a later source as earlier',()=>{
 const p={active:false,notForLearningCredit:true,materials:[],units:[{day:3,targets:[],tasks:[{materialRefs:[{materialId:'grammar'}]},{materialRefs:[{materialId:'reading'}]}]}]};
 const map=new Map([['grammar',{id:'grammar',skill:'grammar',passage:'There are two chairs in the living room.'}],['reading',{id:'reading',skill:'reading',passage:'There are two chairs in the living room.',questions:[{id:'r1',prompt:'How many chairs?',answers:['two'],evidence:'There are two chairs in the living room.'}]}]]);
 const out=T.audit(p,map),w=out.days[0].materials[0].warnings;
 assert.ok(w.some(x=>x.type==='evidence-in-earlier-material'&&x.earlierMaterial==='grammar'));
 assert.ok(w.some(x=>x.type==='answer-in-earlier-material'&&x.earlierMaterial==='grammar'));
});
test('a preceding material in the same task is only a possible exposure',()=>{
 const p={active:false,notForLearningCredit:true,materials:[],units:[{day:2,targets:[],tasks:[{materialRefs:[{materialId:'first'},{materialId:'second'}]}]}]};
 const map=new Map([['first',{id:'first',skill:'listening',transcript:'The meeting starts at six.',questions:[]}],['second',{id:'second',skill:'listening',questions:[{id:'q',prompt:'When?',answers:['at six'],evidence:'The meeting starts at six.'}]}]]);
 const result=T.audit(p,map);assert.equal(result.days[0].materials[0].warnings.length,0);assert.ok(result.days[0].materials[1].warnings.some(w=>w.type==='evidence-in-earlier-material'&&w.earlierMaterial==='first'));
});
test('earlier grammar questions and options are potential exposure, distinct from passage text',()=>{
 const p={active:false,notForLearningCredit:true,materials:[],units:[{day:2,targets:[],tasks:[{materialRefs:[{materialId:'grammar'}]},{materialRefs:[{materialId:'listening'}]}]}]};
 const map=new Map([['grammar',{id:'grammar',skill:'grammar',questions:[{id:'g1',prompt:'The meeting starts at six.',options:['At six.','At nine.']}]}],['listening',{id:'listening',skill:'listening',questions:[{id:'l1',prompt:'When?',answers:['At six.'],evidence:'The meeting starts at six.'}]}]]);
 const warnings=T.audit(p,map).days[0].materials[0].warnings;
 assert.ok(warnings.some(w=>w.type==='evidence-in-earlier-question'&&w.earlierQuestion==='g1'));
 assert.ok(warnings.some(w=>w.type==='answer-in-earlier-option'&&w.earlierQuestion==='g1'));
});
test('exact evidence across questions and short numeric answers are still flagged',()=>{
 const m={questions:[{id:'q1',prompt:'Did she study?',answers:['Yes.'],evidence:'She studied in the morning.'},{id:'q2',prompt:'She studied in the morning. Where?',answers:['2']},{id:'q3',prompt:'Is it 2 or 22?',answers:['No.']}]};
 const w=T.inspect(m,[]);assert.ok(w.some(x=>x.type==='evidence-in-other-prompt'&&x.question==='q1'));
 assert.ok(w.some(x=>x.type==='answer-in-other-prompt'&&x.question==='q2'));
 assert.equal(T.exactPhrase('Room 22','2'),false);
});
test('the file reader refuses traversal, a wrong digest, and a symlink',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'linked-audit-'));try{const file=path.join(dir,'a.json'),b=Buffer.from('{}');fs.writeFileSync(file,b);const digest=crypto.createHash('sha256').update(b).digest('hex');assert.deepEqual(T.readFile(dir,'a.json',digest),{});assert.throws(()=>T.readFile(dir,'../a.json',digest));assert.throws(()=>T.readFile(dir,'a.json:hidden.json',digest));assert.throws(()=>T.readFile(dir,'a.json','0'.repeat(64)));try{fs.symlinkSync(file,path.join(dir,'link.json'));assert.throws(()=>T.readFile(dir,'link.json',digest));}catch(error){if(!['EPERM','EACCES'].includes(error.code))throw error;}}finally{for(const name of ['link.json','a.json']){const file=path.join(dir,name);if(fs.existsSync(file))fs.unlinkSync(file);}fs.rmdirSync(dir);}
});
test('bad question shapes cannot look like a clean scan',()=>{
 assert.throws(()=>T.inspect({questions:'bad'},[]),/question array/);
 assert.throws(()=>T.inspect({questions:[{id:'q',prompt:'Where?',answers:'home'}]},[]),/cannot be inspected/);
 assert.throws(()=>T.inspect({questions:[{id:'q',prompt:'Where?',answers:['']}]},[]),/cannot be inspected/);
 assert.throws(()=>T.inspect({questions:[{id:'q',prompt:'Where?',answers:['home']},{id:'q',prompt:'When?',answers:['today']}]},[]),/cannot be inspected/);
});
test('word cards must match the cited source quotation and offsets',()=>{
 const source='A cat waits in a room.',target={canonicalId:'essential:cat',sourceMaterialId:'source',sourceTextSha256:crypto.createHash('sha256').update(source).digest('hex'),surface:'cat',start:2,end:5,quote:source,quoteStart:0,quoteEnd:source.length};
 const unit={targets:[target],tasks:[{id:'vocabulary',materialRefs:[{materialId:'vocab'}]},{id:'reading',materialRefs:[{materialId:'source'}]}]},map=new Map([['source',{skill:'reading',passage:source}],['vocab',{skill:'vocabulary',vocabulary:[{word:'cat',example:source}]}]]);
 assert.doesNotThrow(()=>T.verifyTargets(unit,map));assert.throws(()=>T.verifyTargets({...unit,targets:[{...target,quote:'different example'}]},map),/quotation/);
 assert.throws(()=>T.verifyTargets({...unit,targets:[target,{...target,canonicalId:'essential:CAT'}]},map),/duplicated/);
 assert.throws(()=>T.verifyTargets({...unit,tasks:[...unit.tasks,...unit.tasks]},map),/duplicate task/);
 map.get('vocab').vocabulary[0].example='other';assert.throws(()=>T.verifyTargets(unit,map),/quotation/);map.get('vocab').vocabulary[0].example=source;
 map.get('vocab').vocabulary.push({word:'dog',example:'A dog waits.'});assert.throws(()=>T.verifyTargets(unit,map),/not represented/);map.get('vocab').vocabulary.pop();
 const falseSource='A dog waits in a room.',falseTarget={...target,sourceTextSha256:crypto.createHash('sha256').update(falseSource).digest('hex'),surface:'dog',quote:falseSource,quoteEnd:falseSource.length};map.get('source').passage=falseSource;map.get('vocab').vocabulary[0].example=falseSource;assert.throws(()=>T.verifyTargets({...unit,targets:[falseTarget]},map),/quotation/);
});
test('a high number of lexical hits is bounded and explicitly marked incomplete',()=>{
 const m={questions:Array.from({length:200},(_,i)=>({id:'q'+i,prompt:'Where is the cat?',answers:['cat']}))},warnings=T.inspect(m,[]);
 assert.equal(warnings.at(-1).type,'warnings-truncated');assert.ok(warnings.at(-1).omittedOccurrencesAtLeast>0);assert.ok(warnings.length<=1001);
});
test('a large number of comparisons reports an incomplete scan even with no hits',()=>{
 const m={questions:Array.from({length:200},(_,i)=>({id:'q'+i,prompt:'Prompt without matches',answers:Array.from({length:20},(_,j)=>'needle'+j)}))},prior=Array.from({length:80},(_,i)=>({id:'earlier'+i,text:'unrelated text'})),warnings=T.inspect(m,[],prior);
 assert.ok(warnings.some(w=>w.type==='scan-incomplete'&&w.reason==='comparison-budget'));
});
test('short evidence and a full yes-no phrase can be flagged across prompts',()=>{
 const m={questions:[{id:'q1',prompt:'Does she agree?',answers:['No, she does not.'],evidence:'At six.'},{id:'q2',prompt:'No, she does not. What happened at six?',answers:['In a shop.']}]},w=T.inspect(m,[]);
 assert.ok(w.some(x=>x.type==='evidence-in-other-prompt'&&x.question==='q1'));assert.ok(w.some(x=>x.type==='generic-answer-in-other-prompt'&&x.question==='q1'));
});
test('visible task and material instructions are included as possible clues',()=>{
 const p={active:false,notForLearningCredit:true,materials:[],units:[{day:2,targets:[],tasks:[{id:'listening',instructions:'The bus arrives at six.',materialRefs:[{materialId:'audio'}]}]}]},map=new Map([['audio',{id:'audio',skill:'listening',instructions:'The destination is the park.',questions:[{id:'q1',prompt:'When?',answers:['at six'],evidence:'The bus arrives at six.'},{id:'q2',prompt:'Where?',answers:['the park'],evidence:'The destination is the park.'}]}]]);
 const w=T.audit(p,map).days[0].materials[0].warnings;assert.ok(w.some(x=>x.type==='evidence-in-earlier-material'&&x.earlierMaterial==='task:listening'));assert.ok(w.some(x=>x.type==='evidence-in-earlier-material'&&x.earlierMaterial==='audio'));
});
test('the end-to-end reader verifies each declared material digest and requires an inactive proposal',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'linked-proposal-'));
 const materialFile=path.join(dir,'reading.json'),proposalFile=path.join(dir,'release-proposal.json');
 try{
  const material={id:'reading',skill:'reading',pool:'training',questions:[{id:'q',prompt:'Where?',answers:['library'],evidence:'She went to the library.'}]},bytes=Buffer.from(JSON.stringify(material));
  fs.writeFileSync(materialFile,bytes);const digest=crypto.createHash('sha256').update(bytes).digest('hex');
  const p={active:false,notForLearningCredit:true,materials:[{id:'reading',file:'reading.json',fileSha256:digest,materialContentHash:T.contentHash(material),questionsSha256:crypto.createHash('sha256').update(JSON.stringify(material.questions)).digest('hex')}],units:[{day:2,targets:[],tasks:[{id:'reading',materialRefs:[{materialId:'reading',contentHash:T.contentHash(material)}]}]}]};
  fs.writeFileSync(proposalFile,JSON.stringify(p));assert.equal(T.main(proposalFile).days[0].materials[0].questions,1);
  fs.writeFileSync(proposalFile,JSON.stringify({...p,units:[{day:2,targets:[],tasks:[{id:'reading',materialRefs:[{materialId:'reading',contentHash:'0'.repeat(64)}]}]}]}));assert.throws(()=>T.main(proposalFile),/task material hash/);
  fs.writeFileSync(proposalFile,JSON.stringify({...p,materials:[{...p.materials[0],materialContentHash:'0'.repeat(64)}]}));assert.throws(()=>T.main(proposalFile),/material content hash/);
  const held={...material,pool:'final',fullTest:true},heldBytes=Buffer.from(JSON.stringify(held));fs.writeFileSync(materialFile,heldBytes);fs.writeFileSync(proposalFile,JSON.stringify({...p,materials:[{...p.materials[0],fileSha256:crypto.createHash('sha256').update(heldBytes).digest('hex'),materialContentHash:T.contentHash(held)}]}));assert.throws(()=>T.main(proposalFile),/only ordinary training/);
  const malformed={...material,fullTest:'true'},badBytes=Buffer.from(JSON.stringify(malformed));fs.writeFileSync(materialFile,badBytes);fs.writeFileSync(proposalFile,JSON.stringify({...p,materials:[{...p.materials[0],fileSha256:crypto.createHash('sha256').update(badBytes).digest('hex'),materialContentHash:T.contentHash(malformed)}]}));assert.throws(()=>T.main(proposalFile),/only ordinary training/);
  fs.writeFileSync(materialFile,bytes);
  fs.writeFileSync(proposalFile,JSON.stringify(p));
  fs.writeFileSync(materialFile,'{}');assert.throws(()=>T.main(proposalFile),/digest/);
  fs.writeFileSync(proposalFile,JSON.stringify({...p,active:true}));assert.throws(()=>T.main(proposalFile),/inactive/);
 }finally{for(const file of [proposalFile,materialFile])if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(dir);}
});
