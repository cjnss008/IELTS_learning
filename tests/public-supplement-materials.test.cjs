'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.join(__dirname,'..'),B=require('../tools/build-public-supplement-materials.cjs'),A=require('../assets/assessment-core.js');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'curriculum','public-supplement-catalog.json'),'utf8')),source=id=>catalog.sources.find(s=>s.sourceId===id),pack=id=>JSON.parse(fs.readFileSync(path.join(root,'curriculum','public-supplements','questions',id+'.json'),'utf8')),text=s=>fs.readFileSync(B.publicFile(root,s.text.path),'utf8'),copy=v=>JSON.parse(JSON.stringify(v));
const loaded=B.load({root,requireComplete:true,sourceIds:B.FIRST_BATCH_IDS});
test('all 17 final source versions provide 99 actual-evidence questions in a staged compatible package',()=>{
 assert.equal(loaded.active,false);assert.equal(loaded.audit.loadedSources,17);assert.equal(loaded.audit.uniqueQuestions,99);assert.equal(loaded.materials.filter(m=>m.skill==='reading').length,17);assert.equal(loaded.blockedMaterials.length,14);
 for(const id of B.FIRST_BATCH_IDS){const s=source(id),q=pack(id);assert.deepEqual(B.validateQuestionSet(s,text(s),q,A),[]);if(id.startsWith('nasa-'))assert.equal(q.sourceVersion,'2');}
});
test('existing assessment-core grades all canonical keys and rejects wrong options without presentation remapping',()=>{
 for(const material of loaded.materials){const keys=Object.fromEntries(material.questions.map(q=>[q.id,q.answers[0]]));const grade=A.gradeMaterial(material,keys);assert.equal(grade.correct,material.questions.length);assert.equal(grade.allGradable,true);
  for(const q of material.questions)for(const option of (q.options||[]).filter(o=>!q.answers.includes(o)))assert.equal(A.gradeQuestion(q,option).correct,false,material.id+'/'+q.id);
  assert.doesNotThrow(()=>A.materialContentHash(material));assert.equal(material.fullTest,false);assert.equal(material.pool,'training');
 }
});
test('source hashes and literal evidence offsets cannot silently survive an edited source',()=>{
 const s=source('voa-l1-06'),p=pack(s.sourceId);assert.ok(B.validateQuestionSet(s,text(s)+' Changed source.',p,A).some(e=>e.includes('hash changed')));
 const changed=copy(p);changed.questions[0].evidenceOffsets.start++;assert.ok(B.validateQuestionSet(s,text(s),changed,A).some(e=>e.includes('evidence/offset')));
});
test('prompts/options stay English and leaked answers or stale blind inputs are rejected',()=>{
 const s=source('voa-l1-06'),q=pack(s.sourceId),bad=copy(q);bad.questions[2].prompt+=' lobby';assert.ok(B.validateQuestionSet(s,text(s),bad,A).some(e=>e.includes('leaked literally')));
 const changed=copy(q);changed.questions[0].options[0]='To buy a ticket.';assert.ok(B.validateQuestionSet(s,text(s),changed,A).some(e=>e.includes('blind review does not match')));
 const chinese=copy(q);chinese.questions[0].prompt='问题';assert.ok(B.validateQuestionSet(s,text(s),chinese,A).some(e=>e.includes('prompt must be English')));
});
test('unspoken stage directions and role labels cannot count as audible evidence, while spoken clock times remain valid',()=>{
 const s=source('voa-l1-07'),body=text(s),q=pack(s.sourceId),bad=copy(q),quote='(in the studio)',start=body.indexOf(quote);assert.ok(start>=0);bad.questions[0].spokenEvidence=[{quote,start,end:start+quote.length}];assert.ok(B.validateQuestionSet(s,body,bad,A).some(e=>e.includes('silent stage direction')));
 const clock=source('voa-l2-03');assert.deepEqual(B.validateQuestionSet(clock,text(clock),pack(clock.sourceId),A),[]);
});
test('reading and listening retain one stable exposure group even after a source version increment',()=>{
 const s=source('voa-l1-06'),q=pack(s.sourceId),body=text(s),a=B.sourceMaterial(s,body,q,'reading',{eligible:false,status:'pending'}),b=B.sourceMaterial(s,body,q,'listening',{eligible:false,status:'pending'});
 assert.equal(a.source.exposureGroup,'public-source:voa-l1-06');assert.equal(a.source.exposureGroup,b.source.exposureGroup);assert.equal(a.source.independentUnseenParallel,false);
 const later=B.sourceMaterial({...s,version:'2'},body,{...q,sourceVersion:'2'},'reading',{eligible:false,status:'pending'});assert.equal(later.source.exposureGroup,a.source.exposureGroup);assert.notEqual(later.version,a.version);
});
test('provider-linked file integrity does not become an independent listening or rights review',()=>{
 const s=source('voa-l1-06'),q=pack(s.sourceId);assert.equal(B.canonicalAudioIntegrity(s,root).status,'hash-verified-independent-listening-review-pending');assert.equal(B.listeningReadiness(s,q,{root}).eligible,false);
 const blocked=loaded.blockedMaterials.find(x=>x.sourceId==='voa-l1-24');assert.ok(blocked.reasons.some(r=>/usage-blocked|festival/.test(r)));assert.equal(blocked.material.audio,'');
 for(const m of loaded.materials)assert.equal(m.skill,'reading');
});
test('a public Git clone may omit only the doubly disabled audio; existing forbidden audio still requires its hash',()=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ielts-public-questions-')),bytes=Buffer.from('fixture public audio bytes, not a real recording'),s={sourceId:'fixture',kind:'listening',audio:{path:'audio/public/blocked.mp3',sha256:B.hash(bytes),durationSeconds:1,usage:{eligibleForPractice:false,redistributionAllowed:false}}};
 try{
  assert.equal(B.canonicalAudioIntegrity(s,temporary).status,'blocked-audio-absent-as-required-in-public-clone');
  const file=B.publicFile(temporary,s.audio.path);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'wrong');assert.throws(()=>B.canonicalAudioIntegrity(s,temporary),/hash mismatch/);
  fs.writeFileSync(file,bytes);assert.equal(B.canonicalAudioIntegrity(s,temporary).status,'hash-verified-but-usage-blocked');fs.unlinkSync(file);
  const required=copy(s);required.audio.usage={eligibleForPractice:true,redistributionAllowed:true};assert.throws(()=>B.canonicalAudioIntegrity(required,temporary),/Required provider audio missing/);
 }finally{const resolved=path.resolve(temporary),parent=path.resolve(os.tmpdir());assert.ok(path.dirname(resolved)===parent&&path.basename(resolved).startsWith('ielts-public-questions-'));fs.rmSync(resolved,{recursive:true,force:true});}
});
test('builder writes only explicit staging and cannot activate or target production assets',()=>{
 assert.throws(()=>B.main(['--activate']),/production activation/);assert.throws(()=>B.main(['--root',root]),/staging --output-root/);assert.throws(()=>B.main(['--root',root,'--output-root',path.join(root,'assets','staging')]),/never production/);assert.throws(()=>B.publicFile(root,'用户数据/record.mp3'),/outside the public-source/);
});
