'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),H=require('./daily-review-fixture.cjs'),E=H.load('essential-vocabulary-core.js'),{training}=H.helper('essential-vocabulary-core.test.cjs','training'),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function originals(entries){const records=[];for(let i=0;i<entries.length;i+=12){const words=entries.slice(i,i+12).map(e=>({word:e.word,meaning:e.meaning,ipa:e.ipa,example:e.example})),batch={id:'essential-batch-tail-'+i,materialId:'essential-vocabulary-tail-'+i,courseDay:2},r=training(words,batch).record,a=JSON.parse(r.answer);for(let w=0;w<a.learning.length;w++)for(let n=0;n<3;n++){const stamp=sha('isolated-tail-'+i+'-'+w+'-'+n),s=a.learning[w].speaking[n];s.workId='work-tail-'+stamp.slice(0,40);s.hash=stamp;s.evidenceId='synthetic-tail-'+stamp.slice(0,35);}
 r.answer=JSON.stringify(a);r.title='Synthetic strict original for core-tail arithmetic';r.dayNumber=2;r.taskId='vocabulary';r.quantity=words.length;r.unit='词';r.minutes=r.activeSeconds/60;r.evaluation={...r.evaluation,score:a.rounds.reduce((n,r)=>n+r.correct,0),maxScore:a.rounds.reduce((n,r)=>n+r.total,0),threshold:1};
 const saved=H.R.put(H.R.newState(),r,new Date(H.NOW).toISOString()).record;records.push(saved);
 }return records;}

test('the real 8000-head catalog remains a distinct completed total while a thirty-word source gap and due reviews remain visible',()=>{
 const records=originals(H.V.entries),before=JSON.stringify(records),plan=E.plan(H.dueState(4),{data:H.V,records,courseDay:2,now:H.NOW,remainingMinutes:360,contextWords:H.V.entries.slice(0,60)});
 assert.equal(plan.stats.initialCompleted,8000);assert.equal(plan.quota.dailyTarget,30);assert.equal(plan.quota.goalRemaining,30);assert.equal(plan.newWords.length,0);assert.equal(plan.due.length,4);assert.equal(plan.reviewDebt.required,true);assert.equal(JSON.stringify(records),before);
 const missing=E.plan(H.M.newState(),{data:H.V,records:records.slice(0,-1),courseDay:2,now:H.NOW,remainingMinutes:360});assert.equal(missing.stats.initialCompleted,7992);assert.equal(missing.quota.dailyTarget,30);assert.equal(missing.quota.goalRemaining,30);assert.equal(missing.newWords.length,0,'missing source remains pending, even with eight genuine heads still unlearned');
});

test('a small source offers only the real uncompleted words while retaining the unmet daily goal',()=>{
 const entries=H.V.entries.slice(0,7),records=originals(entries.slice(0,4)),plan=E.plan(H.M.newState(),{entries,records,contextWords:entries,courseDay:2,now:H.NOW,remainingMinutes:360});assert.equal(plan.quota.dailyTarget,30);assert.equal(plan.quota.goalRemaining,30);assert.equal(plan.newWords.length,3);
 const exposed=H.M.captureTraining(H.M.newState(),{attempts:entries.map((e,i)=>({id:'legacy-only-'+i,word:e.word,meaning:e.meaning,mode:'meaning',submittedAt:new Date(H.NOW-H.DAY).toISOString(),correct:true,userAnswer:e.word}))}),legacy=E.plan(exposed,{entries,records:[],contextWords:entries,courseDay:2,now:H.NOW,remainingMinutes:360});assert.equal(legacy.stats.initialCompleted,0);assert.equal(legacy.quota.dailyTarget,30);assert.equal(legacy.quota.goalRemaining,30);assert.equal(E.DAILY_NEW,30);
});
