'use strict';
// Release audit: no network or learner data is accessed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),{jobs}=require('./curriculum-manifest.cjs'),{validate}=require('./author-curriculum.cjs'),A=require('../assets/assessment-core.js');
function audit(data){
 assert.equal(data.status,'complete-material-set','Do not release a partial curriculum');
 assert.equal(data.days.length,364);assert.equal(data.weeks.length,52);
 const map=new Map(data.materials.map(m=>[m.id,m]));assert.equal(map.size,data.materials.length,'Duplicate material ID');
 let questions=0,listening=0,writing=0,fullReading=0,fullListening=0;const textHashes=new Map();
 for(const job of jobs){const m=map.get(job.id);assert.ok(m,'Missing '+job.id);assert.deepEqual(validate(job,m),[],job.id);assert.equal(m.source.verification,'reviewed',job.id);if(job.skill==='writing'){writing++;assert.ok(m.prompt);}}
 for(const m of data.materials){
  for(const q of m.questions||[]){const answer=q.type==='multi'?q.answers:q.answers?.[0];assert.ok(A.gradeQuestion(q,answer).correct,m.id+'/'+q.id+': canonical answer is not accepted');questions++;}
  if(['reading','listening'].includes(m.skill)){
   const text=m.skill==='reading'?m.passage:m.transcript;assert.ok(text?.trim(),m.id+' source');const h=crypto.createHash('sha256').update(text.trim().replace(/\s+/g,' ')).digest('hex');assert.ok(!textHashes.has(h),m.id+' duplicates '+textHashes.get(h));textHashes.set(h,m.id);
   if(m.fullTest){assert.equal(m.questions.length,40,m.id);if(m.skill==='reading')fullReading++;else fullListening++;}
  }
  if(m.skill==='listening'){
   listening++;assert.ok(m.audio&&m.audio.startsWith('audio/curriculum/'),m.id+' audio');assert.ok(fs.statSync(path.join(root,m.audio)).size>1000,m.id+' audio bytes');
   const meta=JSON.parse(fs.readFileSync(path.join(root,'curriculum','audio',m.id+'.json'),'utf8'));assert.equal(meta.transcriptHash,crypto.createHash('sha256').update(m.transcript).digest('hex'),m.id+' stale audio');assert.ok(meta.durationSeconds>1&&meta.voices.length,m.id+' audio metadata');
  }
 }
 const firstWriting=new Set();let totalMinutes=0;
 for(let i=0;i<364;i++){const d=data.days[i];assert.equal(d.day,i+1);assert.equal(d.totalMinutes,360);assert.equal(d.tasks.reduce((n,t)=>n+t.minutes,0),360);totalMinutes+=d.totalMinutes;
  for(const t of d.tasks){assert.ok(t.materialIds.length,d.day+'/'+t.id+' has no material');for(const id of t.materialIds){const m=map.get(id);assert.ok(m,d.day+' missing '+id);assert.equal(m.skill,t.skill,d.day+'/'+t.id);if(t.id==='writing'&&m.type?.startsWith('academic_'))firstWriting.add(id);}assert.ok(t.quantity>0);}
 }
 assert.equal(firstWriting.size,96,'48 first-draft Task1/2 pairs; checkpoints replace regular new pairs');
 assert.equal(totalMinutes,131040);assert.equal(fullReading,30);assert.equal(fullListening,30);assert.equal(writing,124);
 assert.equal(data.gates.length,12,'Weeks 4–48 use A/B; four final batteries use separate readiness evidence');
 for(const gate of data.gates){assert.notEqual(gate.A,gate.B);assert.equal(gate.minimumDelayHours,48);assert.equal(map.get(gate.A+'-reading')?.pool,'gate');assert.equal(map.get(gate.B+'-reading')?.pool,'gate');}
 return {status:'passed',days:364,hours:totalMinutes/60,sourceJobs:jobs.length,materials:data.materials.length,questions,listening,writing,fullReading,fullListening,firstDraftWritingPairs:firstWriting.size/2};
}
module.exports={audit};
if(require.main===module){const result=audit(require('../assets/curriculum-data.js'));fs.writeFileSync(path.join(root,'curriculum','release-audit.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
