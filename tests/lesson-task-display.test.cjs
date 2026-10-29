'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const D=require('../assets/curriculum-data.js'),P=require('../assets/course-player.js'),V=require('../assets/vocabulary-practice.js');
function fixture(name){const file=path.join(__dirname,name),source=fs.readFileSync(file,'utf8');return new Function('require','__dirname',source.slice(0,source.indexOf('\ntest('))+'\nreturn fixture;')(createRequire(file),__dirname);}
const playerFixture=fixture('course-player-dom.test.cjs'),vocabularyFixture=fixture('vocabulary-hover-dom.test.cjs');
function hubFixture(options){const file=path.join(__dirname,'today-hub.test.cjs'),localRequire=createRequire(file),source=fs.readFileSync(file,'utf8');return new Function('require','__dirname',source+'\nreturn fixture;')(name=>name==='node:test'?()=>{}:localRequire(name),__dirname)(options);}
test('actual lessons 2–10 task introductions use the task total once and preserve lesson/material contracts',async()=>{
 const original=JSON.stringify(D),snapshot=P.freezeMaterialBinding(D.materials.find(m=>m.id==='w02-read-1'),{data:D,courseDay:8});let checked=0;
 for(const day of D.days.filter(d=>d.day>=2&&d.day<=10)){
  const initial=D.materials.find(m=>m.id===day.tasks.find(t=>t.id==='reading').materialIds[0]);
  const f=playerFixture(initial,{search:'?day='+day.day,setup(data){data.materials=D.materials;data.weeks=D.weeks;data.days=D.days;}});
  await new Promise(resolve=>setImmediate(resolve));
  for(const task of day.tasks){
   const button=f.nodes.get('courseTasks').children.find(node=>node.dataset.taskId===task.id);assert.ok(button,day.day+':'+task.id);await button.fire('click');
   const intro=f.nodes.get('courseMaterialIntro'),paragraph=intro.children.find(node=>node.textContent.startsWith('本模块参考预算 '));assert.ok(paragraph,day.day+':'+task.id);
   assert.match(paragraph.textContent,new RegExp('^本模块参考预算 '+task.minutes+' 分钟；'));
   assert.equal([...paragraph.textContent.matchAll(/\d+(?:\.\d+)?\s*分钟/g)].length,1,day.day+':'+task.id+' '+paragraph.textContent);
   if(task.id==='speaking')assert.doesNotMatch(paragraph.textContent,/回听及核对转写/);
   checked++;
  }
 }
 assert.equal(checked,63);assert.equal(JSON.stringify(D),original);assert.deepEqual(P.freezeMaterialBinding(D.materials.find(m=>m.id==='w02-read-1'),{data:D,courseDay:8}),snapshot);
});
test('lesson 1 and material-level instructions retain their own original time constraints',async()=>{
 const f=playerFixture({instructions:'Speak for at least 11 minutes.'},{search:'?day=1'});await new Promise(resolve=>setImmediate(resolve));
 assert.doesNotMatch(f.nodes.get('courseMaterialIntro').textContent,/本模块参考预算/);
 const source=fs.readFileSync(path.join(__dirname,'../assets/course-player.js'),'utf8');
 assert.ok(source.includes('taskDisplayText(material.instructions,skill)'));assert.ok(!source.includes('taskDisplayText(material.instructions,skill,task.minutes)'));
});
test('all twelve early lexical examples in lessons 2–10 disclose their later source lesson without changing words',()=>{
 let count=0;const before=JSON.stringify(D);
 for(const day of D.days.filter(d=>d.day>=2&&d.day<=10))for(const id of day.tasks.find(t=>t.id==='vocabulary').materialIds){
  const material=D.materials.find(m=>m.id===id);if(material.source?.kind!=='derived-lexical')continue;
  for(const word of material.vocabulary){const first=D.days.find(d=>d.tasks.some(t=>t.materialIds.includes(word.sourceMaterialId)));if(!first||first.day<=day.day)continue;
   const source=D.materials.find(m=>m.id===word.sourceMaterialId);assert.equal(source.pool,'training');assert.ok(!source.assessmentGroup&&!source.form&&!source.fullTest&&!source.independentBank);
   const label=V.sourceContextLabel(word,material,{courseDay:day.day,curriculumData:D});assert.match(label,/本周其他课原句预习/);assert.ok(label.includes('第 '+first.day+' 课'));assert.match(label,/不应当作完全陌生检测/);assert.doesNotMatch(label,/本课已学|首次未见/);count++;
  }
 }
 assert.equal(count,12);assert.equal(JSON.stringify(D),before);
});
test('real vocabulary cards show origin labels from frozen material, restore original draft and hide labels in tests',async()=>{
 const material=D.materials.find(m=>m.id==='lexical-w02-1'),bound=P.freezeMaterialBinding(material,{data:D,courseDay:8}).material;
 const f=vocabularyFixture();f.win.IELTSCurriculumData=D;const host=f.doc.createElement('div');f.doc.body.append(host);
 const controller=f.win.IELTSVocabularyPractice.mount(host,{material:bound,courseDay:8,curriculumData:D,trainingVersion:1,player:{cancel(){}}});await controller.ready;
 const cards=host.querySelectorAll('.vocab-word-card');assert.equal(cards.length,4);assert.ok(cards.every(card=>card.querySelector('.vocab-source-context')));assert.match(cards[2].textContent,/第 10 课/);
 const before=controller.getDraft();assert.doesNotMatch(JSON.stringify(before),/本周其他课原句|vocab-source-context/);controller.destroy();
 const restored=f.win.IELTSVocabularyPractice.mount(host,{material:bound,courseDay:8,curriculumData:D,draft:before,trainingVersion:1,player:{cancel(){}}});await restored.ready;assert.deepEqual(JSON.parse(JSON.stringify(restored.getDraft())),JSON.parse(JSON.stringify(before)));
 await host.querySelectorAll('button').find(node=>node.textContent==='学完了，开始第 1 轮').fire('click');assert.equal(host.querySelectorAll('.vocab-source-context').length,0);assert.doesNotMatch(host.textContent,/Sam: Is that your hat|第 10 课|It is a red bag/);restored.destroy();
});
test('old source text unavailable is labelled pending, with old meanings/examples retained',()=>{
 const material=D.materials.find(m=>m.id==='lexical-w02-1'),bound=P.freezeMaterialBinding(material,{data:D,courseDay:8}).material,word=bound.vocabulary.find(w=>w.word==='hat'),before=JSON.stringify(bound);
 const changed={...D,materials:D.materials.map(m=>m.id==='w02-listen-3'?{...m,transcript:'A replacement text without the original example.'}:m)};
 assert.match(V.sourceContextLabel(word,bound,{courseDay:8,curriculumData:changed}),/原来源待核验/);assert.equal(JSON.stringify(bound),before);
 assert.equal(V.sourceContextLabel(word,bound,{courseDay:1,curriculumData:D}),'');assert.equal(V.sourceContextLabel(word,bound,{curriculumData:D}),'');
});
test('day 1 to day 2 next-course button cannot append day 1 vocabulary group counts',async()=>{
 const data=JSON.parse(JSON.stringify({days:D.days.slice(0,2),materials:D.materials})),f=await hubFixture({data,current:{day:1,taskId:'vocabulary',materialId:data.days[0].tasks[0].materialIds[0]}});
 const next={kind:'material',day:2,taskId:'vocabulary',materialId:data.days[1].tasks[0].materialIds[0],label:'继续第 2 课：词汇',reason:'开始下一课原有词汇组',fitsBudget:true},queue={currentComplete:true,next,entries:[next],deferred:[],budget:{remainingMinutes:300}};
 f.root.IELTSTodayNavigation.learningQueue=()=>queue;for(const render of f.events['ielts:study-timer-changed']||[])render();
 assert.match(f.nodes.get('todayStart').textContent,/第 2 课/);assert.equal(f.nodes.get('todayNext').textContent,next.reason);assert.doesNotMatch(f.nodes.get('todayNext').textContent,/本课共|12 个词项/);assert.equal(f.calls.length,0);
 next.day=1;next.materialId=data.days[0].tasks[0].materialIds[0];next.label='继续本课词汇';for(const render of f.events['ielts:study-timer-changed']||[])render();
 assert.match(f.nodes.get('todayNext').textContent,/当前词汇任务共/);const summary=P.vocabularyTaskSummary(data.days[0].tasks[0],data);assert.ok(f.nodes.get('todayNext').textContent.includes(summary.wordCount+' 个词项'));
});
