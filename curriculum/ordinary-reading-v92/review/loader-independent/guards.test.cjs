'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const{fixture,Tool,P,A,Composer,candidate}=require('./probe.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));

test('actual six author objects derive only explicit v2 fixes and remain ordinary reading',()=>{
 const f=fixture(),loaded=Tool.load(f);
 assert.equal(loaded.materials.length,6);assert.equal(loaded.audit.questions,48);
 const athletes=loaded.materials.find(m=>m.source.publicSourceId==='bls-athletes'),cbo=loaded.materials.find(m=>m.source.publicSourceId==='cbo-budget-2025');
 assert.equal(athletes.version,'t1-q2');assert.equal(cbo.version,'t1-q2');
 assert.equal(athletes.questions[3].prompt,'Choose TRUE, FALSE or NOT GIVEN: Some athletes may have to travel internationally for competitions.');
 assert.ok(cbo.questions[2].explanation.includes('Those increases的先行内容'));
 for(const m of loaded.materials){assert.equal(m.source.normalization.officialVerbatim,false);assert.equal(m.source.practiceOnly,true);assert.equal(m.source.independentAssessmentEligible,false);assert.equal(m.source.independentTransferEligible,false);assert.deepEqual(m.source.contentHashFields,['instructions','passage','transcript','questions']);assert.equal(m.source.contentHash,Tool.sha(JSON.stringify(Object.fromEntries(m.source.contentHashFields.map(k=>[k,m[k]])))));assert.equal(m.source.questionContractHash,Tool.sha(JSON.stringify(m.questions)));}
});

test('absent approval is rejected without mutating author input',()=>{
 const f=fixture(),file=path.join(f.root,f.releasePath),release=JSON.parse(fs.readFileSync(file));release.readingApproved=false;fs.writeFileSync(file,JSON.stringify(release));
 assert.throws(()=>Tool.load(f),/not approved/);
});

test('traversal, absolute path and package escape junction are rejected',()=>{
 const f=fixture();
 for(const relative of ['../outside.txt',Tool.PREFIX+'../outside.txt',Tool.PREFIX+'/sources/a.json',Tool.PREFIX+'sources\\a.json','C:/outside.txt'])assert.throws(()=>Tool.safeFile(f.root,relative),/unsafe package path/);
 const outside=path.join(f.root,'outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'sentinel.txt'),'synthetic public fixture');
 fs.symlinkSync(outside,path.join(f.root,Tool.PREFIX,'escape'),'junction');
 assert.throws(()=>Tool.safeFile(f.root,Tool.PREFIX+'escape/sentinel.txt'),/escaped its dedicated directory/);
});

test('changed source bytes and mismatching exact adaptation edits are rejected',()=>{
 const f=fixture(),file=path.join(f.root,Tool.PREFIX,'teaching-texts/bls-athletes.txt');
 assert.ok(fs.existsSync(file));fs.appendFileSync(file,' changed');assert.throws(()=>Tool.load(f),/hash mismatch/);
 const input='Original paragraph.\n',adaptation={inputSha256:Tool.sha(input),outputSha256:Tool.sha('New paragraph.\n'),edits:[{startUtf16:0,endUtf16:8,before:'Mismatch',after:'New',reason:'test'}]};
 assert.throws(()=>Tool.replayEdits(input,adaptation),/original span changed/);
});

test('exact references must reject negative grammar/word offsets even when slice aliases the valid span',()=>{
 const f=fixture(({id,ctx,authorMaterial})=>{if(id==='bls-athletes'){for(const item of [ctx.grammar[0],ctx.words[0]]){item.start-=authorMaterial.passage.length;item.end-=authorMaterial.passage.length;}}});
 assert.throws(()=>Tool.load(f),/span|location/);
});

test('question evidence must reject negative offsets even when slice aliases the exact evidence',()=>{
 const f=fixture(({id,authorMaterial})=>{if(id==='bls-athletes'){const q=authorMaterial.questions.find(q=>q.evidenceSpan.end<authorMaterial.passage.length);q.evidenceSpan.start-=authorMaterial.passage.length;q.evidenceSpan.end-=authorMaterial.passage.length;q.evidenceOffsets.start=q.evidenceSpan.start;q.evidenceOffsets.end=q.evidenceSpan.end;}});
 assert.throws(()=>Tool.load(f),/span|evidence/);
});

test('word quote envelope must reject negative quote offsets without changing the valid target span',()=>{
 const f=fixture(({id,ctx,authorMaterial})=>{if(id==='bls-athletes'){ctx.words[0].quoteStartUtf16-=authorMaterial.passage.length;ctx.words[0].quoteEndUtf16-=authorMaterial.passage.length;}});
 assert.throws(()=>Tool.load(f),/span|location|quote/);
});

test('actual static composition preserves old80, all owner patches/reviews, raw days and budgets',()=>{
 const f=fixture(),loaded=Tool.load(f),baseData=copy(require('../ordinary-reading-admission-v92/formal-base-v91/assets/curriculum-data.js'));
 const baseSourceContexts=copy(require('../ordinary-reading-admission-v92/formal-base-v91/assets/public-context-data.js')),data=copy(baseData),sourceContexts={...copy(baseSourceContexts),sources:[...copy(baseSourceContexts.sources),...copy(loaded.sourceContexts.sources)]};data.materials.push(...loaded.materials);
 const shared={entries:require(path.join(candidate,'assets/essential-vocabulary-data.js')).entries,expandDay:require(path.join(candidate,'assets/course-expansion.js')).overlay,materialContentHash:A.materialContentHash};
 const before=P.hash({baseData,data,baseSourceContexts,sourceContexts}),plan=Composer.compose({baseData,data,basePlan:baseData.publicCoursePlan,baseSourceContexts,sourceContexts,newMaterialIds:loaded.materials.map(m=>m.id),newReadingStartDay:256,...shared});
 assert.equal(P.hash({baseData,data,baseSourceContexts,sourceContexts}),before);
 for(const [list,key]of [['assignments','assignmentId'],['reviews','reviewId'],['dailyChanges','day']])for(const item of baseData.publicCoursePlan[list])assert.deepEqual(plan[list].find(other=>other[key]===item[key]),item);
 assert.equal(plan.assignments.length,86);assert.equal(plan.assignments.filter(a=>a.strategy==='replace-repeated-practice').length,baseData.publicCoursePlan.assignments.filter(a=>a.strategy==='replace-repeated-practice').length);
 assert.ok(plan.dailyChanges.every(d=>d.dayBudget.after.totalMinutes<=360));Tool.planReceipt(loaded,plan);
 const badData=copy(data);badData.materials.find(m=>m.id===loaded.materials[0].id).estimatedMinutes=400;
 assert.throws(()=>Composer.compose({baseData,data:badData,basePlan:baseData.publicCoursePlan,baseSourceContexts,sourceContexts,newMaterialIds:loaded.materials.map(m=>m.id),newReadingStartDay:256,...shared}),/suitable complete-unit budget slots/);
 const next=P.replan(plan,data,{...shared,sourceContexts,cache:false});assert.equal(next.valid,true);
 const violations=next.assignments.filter(a=>loaded.materials.some(m=>m.id===a.materialId)).filter(a=>{const s=loaded.catalog.find(s=>s.id===a.sourceId);return a.day<s.suggestedWindow[0]||a.day>s.suggestedWindow[1];});
 // Persist actual reachability separately: suggested-window policy must be resolved by Root.
 fs.writeFileSync(path.join(__dirname,'runtime-window-violations.json'),JSON.stringify(violations.map(a=>({id:a.materialId,day:a.day,window:loaded.catalog.find(s=>s.id===a.sourceId).suggestedWindow})),null,2)+'\n');
});
