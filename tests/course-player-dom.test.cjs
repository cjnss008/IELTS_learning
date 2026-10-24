const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const A=require('../assets/assessment-core.js'),Records=require('../assets/learning-records.js');
// DOM contract smoke test. Browser layout/audio permissions are checked separately.
class Element {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.style={};this.listeners={};this.attributes={};this.className='';this.value='';this.hidden=false;this.disabled=false;this.checked=false;this._text='';this.classList={toggle:()=>{},add:()=>{},remove:()=>{}};}
  set textContent(value){this._text=String(value);this.children=[];}get textContent(){return this._text+this.children.map(n=>n.textContent||'').join('');}
  append(...children){children.forEach(n=>{if(typeof n==='string'){const t=new Element('span');t.textContent=n;n=t;}n.parentElement=this;this.children.push(n);});}
  prepend(...children){children.reverse().forEach(n=>{n.parentElement=this;this.children.unshift(n);});}
  replaceChildren(...children){this.children=[];this._text='';this.append(...children);}
  setAttribute(key,value){this.attributes[key]=value;}getAttribute(key){return this.attributes[key];}
  addEventListener(name,fn){(this.listeners[name]||=[]).push(fn);}async fire(name){for(const fn of this.listeners[name]||[])await fn({target:this,preventDefault(){}});if(name==='click'&&this.onclick)await this.onclick();}
  all(){return this.children.flatMap(n=>[n,...n.all()]);}
  querySelectorAll(selector){return selector.split(',').flatMap(part=>{part=part.trim();return this.all().filter(n=>part==='input:checked'?n.tagName==='INPUT'&&n.checked:part.startsWith('.')?n.className.split(' ').includes(part.slice(1)):n.tagName===part.toUpperCase());});}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
function fixture(overrides={},options={}){
  let clock=Date.parse('2026-10-24T12:00:00.000Z');class Clock extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
  const html=fs.readFileSync(path.join(__dirname,'../学习课程.html'),'utf8'),nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
  const doc={hidden:false,getElementById:id=>nodes.get(id)||null,createElement:tag=>new Element(tag),createElementNS:(ns,tag)=>new Element(tag),addEventListener(){},querySelectorAll(selector){return selector.split(',').flatMap(part=>{const [id,descendant]=part.trim().split(' ');if(id.startsWith('#'))return descendant?nodes.get(id.slice(1))?.querySelectorAll(descendant)||[]:[nodes.get(id.slice(1))].filter(Boolean);return [...nodes.values()].flatMap(n=>n.querySelectorAll(part));});}};
  const mat={id:'reading-one',version:'1',skill:'reading',title:'A simple reading',type:'practice',week:1,level:'A0',pool:'training',estimatedMinutes:10,passage:'Lin has a red bag.',instructions:'Read and choose.',questions:[{id:'q1',type:'single',prompt:'What colour is the bag?',options:['red','blue'],answers:['red'],explanation:'The text says red.',evidence:'a red bag'}],source:{kind:'original',rights:'原创',verification:'reviewed'}};
  const tasks=['vocabulary','grammar','listening','reading','speaking','writing','reflection'].map(id=>({id,skill:id,minutes:id==='reading'?60:50,quantity:10,unit:'题',materialIds:[mat.id],mode:options.taskMode||'practice',instructions:'Practice carefully.',deliverable:'Your own answer'}));
  Object.assign(mat,overrides);const data={version:'1',weeks:[{week:1,title:'Start',level:'A0',prerequisites:[]}],materials:[mat],days:Array.from({length:364},(_,i)=>({day:i+1,week:1,tasks}))};
  const map=options.storage||new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)},events={},timers=[];let saved=Records.newState(),id=0;
  const api={currentDay:()=>1,makeId:prefix=>prefix+'-'+(++id),list:async()=>saved.records,record:async input=>{const result=Records.put(saved,JSON.parse(JSON.stringify(input)),new Date(clock).toISOString());saved=result.state;return result;},update:async()=>{throw Error('not part of this test');}};
  const win={document:doc,IELTSAssessment:A,IELTSRecords:api,IELTSCurriculumData:data,IELTSProfiles:{current:()=>({id:'legacy'}),storage:()=>storage},location:{search:options.search||'?day=1',origin:'file://'},addEventListener:(name,fn)=>(events[name]||=[]).push(fn),dispatchEvent:event=>(events[event.type]||[]).forEach(fn=>fn(event)),navigator:{}};
  const context={window:win,globalThis:win,Date:Clock,URLSearchParams,URL,Map,Set,AbortController,CustomEvent:class{constructor(type,init={}){this.type=type;this.detail=init.detail;}},setInterval:fn=>(timers.push(fn),timers.length),clearInterval(){},setTimeout:()=>1,clearTimeout(){},console};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/course-player.js'),'utf8'),context);
  return{win,nodes,map,timers,advance:ms=>{clock+=ms;timers.forEach(fn=>fn());},records:()=>saved.records,mat};
}
test('course DOM can select reading, answer, submit actual evidence, and create linked correction',async()=>{
  const f=fixture();await Promise.resolve();const tasks=f.nodes.get('courseTasks').children;await tasks.find(n=>n.dataset.taskId==='reading').fire('click');await f.nodes.get('courseBegin').fire('click');assert.equal(f.nodes.get('courseSession').hidden,false);const input=f.nodes.get('courseQuestions').querySelectorAll('input').find(n=>n.value==='red');input.checked=true;await input.fire('change');f.advance(2000);await f.nodes.get('courseSubmit').fire('click');await Promise.resolve();assert.equal(f.records().length,1);assert.equal(f.records()[0].evaluation.score,1);assert.equal(f.records()[0].minutes,2/60);assert.equal(f.nodes.get('courseResult').hidden,false);assert.match(f.nodes.get('courseSubmitStatus').textContent,/原稿已保存/);const correction=f.nodes.get('courseResult').querySelectorAll('button').find(n=>n.textContent==='建立订正版本');await correction.fire('click');f.advance(1000);await f.nodes.get('courseSubmit').fire('click');assert.equal(f.records().length,2);assert.equal(f.records()[1].parentId,f.records()[0].id);assert.equal(f.records()[1].exposure,'seen');assert.equal(f.records()[1].assistance.answer,true);
});
test('fresh shared exposure prevents another tab from classifying the same text unseen',async()=>{
  const f=fixture();await Promise.resolve();const state=f.win.IELTSCoursePlayer.newState();state.exposures[f.mat.id]={firstSeenAt:'2026-10-24T11:00:00.000Z',lastSeenAt:'2026-10-24T11:00:00.000Z',count:1,assisted:false};f.map.set(f.win.IELTSCoursePlayer.KEY,JSON.stringify(state));await f.nodes.get('courseTasks').children.find(n=>n.dataset.taskId==='reading').fire('click');await f.nodes.get('courseBegin').fire('click');assert.match(f.nodes.get('courseExposure').textContent,/已见/);const saved=JSON.parse(f.map.get(f.win.IELTSCoursePlayer.KEY));assert.equal(Object.values(saved.drafts)[0].exposureAtStart,'seen');
});
test('actual mixed transport fixture renders both all 12 chart values and satisfaction table',async()=>{
  const source=JSON.parse(fs.readFileSync(path.join(__dirname,'../curriculum/materials/writing-task1-07.json'),'utf8'));const f=fixture({figure:source.figure});await Promise.resolve();await f.nodes.get('courseBegin').fire('click');const rendered=f.nodes.get('courseFigure'),tables=rendered.querySelectorAll('table');assert.equal(tables.length,2);assert.equal(rendered.querySelectorAll('svg').length,1);for(const series of source.figure.series){assert.match(tables[0].textContent,new RegExp(series.name));for(const value of series.values)assert.ok(tables[0].textContent.includes(String(value)));}for(const row of source.figure.rows)for(const value of row)assert.ok(tables[1].textContent.includes(value));
});
test('actual multi-country pie fixture renders every series as a separate visible pie',async()=>{
  const source=JSON.parse(fs.readFileSync(path.join(__dirname,'../curriculum/materials/writing-task1-04.json'),'utf8'));const f=fixture({figure:source.figure});await Promise.resolve();await f.nodes.get('courseBegin').fire('click');const rendered=f.nodes.get('courseFigure');assert.equal(rendered.querySelectorAll('svg').length,source.figure.series.length);for(const series of source.figure.series)assert.ok(rendered.textContent.includes(series.name));
});
test('listening plan renderer shows exact geometry, north, entrance and A–F without exposing destination names',async()=>{
  const {materials}=require('../tools/listening-maps.cjs');
  for(const material of materials){const f=fixture({figure:material.figure});await Promise.resolve();await f.nodes.get('courseBegin').fire('click');const rendered=f.nodes.get('courseFigure'),svg=rendered.querySelector('svg'),plan=material.figure.plan;assert.ok(svg);assert.equal(svg.attributes.viewBox,`0 0 ${plan.width} ${plan.height}`);assert.ok(svg.textContent.includes('N / 北'));assert.ok(svg.textContent.includes(plan.entrance.label));const labels=svg.querySelectorAll('text').map(n=>n.textContent);for(const z of plan.zones){assert.ok(labels.includes(z.label));assert.ok(svg.querySelectorAll('rect').some(n=>n.attributes.x===String(z.x)&&n.attributes.y===String(z.y)&&n.attributes.width===String(z.w)&&n.attributes.height===String(z.h)));}assert.equal(svg.querySelectorAll('polyline').length,plan.paths.length);for(const line of plan.paths)assert.ok(svg.querySelectorAll('polyline').some(n=>n.attributes.points===line.points.map(p=>p.x+','+p.y).join(' ')));for(const q of material.questions.slice(0,6))assert.equal(rendered.textContent.includes(q.prompt.match(/contains the (.*?)\?/)[1]),false);}
});
test('plan labels remain pure text and malformed plan leaves a visible warning; Task 1 maps stay unchanged',async()=>{
  const figure=structuredClone(require('../tools/listening-maps.cjs').materials[1].figure);figure.plan.landmarks[0].label='<img src=x onerror=alert(1)>';
  const f=fixture({figure});await Promise.resolve();await f.nodes.get('courseBegin').fire('click');assert.equal(f.nodes.get('courseFigure').querySelectorAll('img').length,0);assert.ok(f.nodes.get('courseFigure').textContent.includes('<img src=x onerror=alert(1)>'));
  const bad=structuredClone(figure);bad.plan.zones[0].x=-20;const invalid=fixture({figure:bad});await Promise.resolve();await invalid.nodes.get('courseBegin').fire('click');assert.match(invalid.nodes.get('courseFigure').textContent,/平面图无法显示/);
  const old=fixture({figure:{type:'map',title:'Before and after',map:{before:[{name:'Park',x:20,y:30}],after:[{name:'Library',x:60,y:70}]}}});await Promise.resolve();await old.nodes.get('courseBegin').fire('click');assert.equal(old.nodes.get('courseFigure').querySelectorAll('svg').length,2);assert.match(old.nodes.get('courseFigure').textContent,/之前Park之后Library/);
});
test('explicit extensive entry uses practice on an assessment day without rewriting the day plan or exposure',async()=>{
  const f=fixture({}, {taskMode:'assessment',search:'?day=1&material=reading-one&activity=extensive&mode=practice'});await Promise.resolve();const before=JSON.stringify(f.win.IELTSCurriculumData.days[0]);assert.equal(f.nodes.get('courseMode').value,'practice');await f.nodes.get('courseBegin').fire('click');assert.equal(f.nodes.get('courseSessionMode').textContent,'练习');const input=f.nodes.get('courseQuestions').querySelectorAll('input').find(n=>n.value==='red');input.checked=true;await input.fire('change');f.advance(2000);await f.nodes.get('courseSubmit').fire('click');assert.equal(A.decodeArtifact(f.records()[0]).mode,'practice');assert.equal(f.records()[0].minutes,2/60);assert.equal(f.records()[0].quantity,1);assert.equal(JSON.stringify(f.win.IELTSCurriculumData.days[0]),before);assert.equal(JSON.parse(f.map.get(f.win.IELTSCoursePlayer.KEY)).exposures['reading-one'].count,1);await f.nodes.get('courseDiscard').fire('click');await f.nodes.get('courseBegin').fire('click');assert.match(f.nodes.get('courseExposure').textContent,/已见/);
  const ordinary=fixture({}, {taskMode:'assessment',search:'?day=1&material=reading-one&mode=practice'});await Promise.resolve();assert.equal(ordinary.nodes.get('courseMode').value,'assessment');
});

const optionInputs=(f,id)=>f.nodes.get('courseQuestions').children.find(n=>n.dataset.questionId===id).querySelectorAll('input');
const choiceQuestions=()=>[
  {id:'q1',type:'single',prompt:'What colour is the bag?',options:['red','blue','green','yellow'],answers:['red'],explanation:'原文说明包是红色的。',evidence:'a red bag'},
  {id:'q2',type:'multi',prompt:'Which two animals are mentioned?',options:['owl','fox','deer','mole'],answers:['owl','fox'],explanation:'原文同时提到猫头鹰和狐狸。',evidence:'an owl and a fox'}
];

test('course renders shuffled single and multi options, preserves fixed enums and saves answer text',async()=>{
  const questions=[...choiceQuestions(),
    {id:'q3',type:'single',prompt:'The bag costs ten pounds.',options:['True','False','Not Given'],answers:['Not Given'],explanation:'价格未提及。',evidence:'未说明价格'},
    {id:'q4',type:'single',prompt:'Which map label marks the library?',options:['A','B','C','D','E','F'],answers:['D'],explanation:'图中 D 为图书馆。',evidence:'D is the library.'}];
  const original=structuredClone(questions),f=fixture({questions});await Promise.resolve();
  await f.nodes.get('courseTasks').children.find(n=>n.dataset.taskId==='reading').fire('click');await f.nodes.get('courseBegin').fire('click');
  const attempt=Object.values(JSON.parse(f.map.get(f.win.IELTSCoursePlayer.KEY)).drafts)[0];
  for(const q of questions){
    const inputs=optionInputs(f,q.id);
    assert.deepEqual(inputs.map(n=>n.value),A.displayOptions(q,f.mat.id,attempt.id));
    assert.ok(inputs.every(n=>n.type===(q.type==='multi'?'checkbox':'radio')));
    inputs.forEach(n=>n.checked=q.answers.includes(n.value));await inputs.find(n=>n.checked).fire('change');
  }
  assert.deepEqual(optionInputs(f,'q3').map(n=>n.value),questions[2].options);
  assert.deepEqual(optionInputs(f,'q4').map(n=>n.value),questions[3].options);
  f.advance(2000);await f.nodes.get('courseSubmit').fire('click');
  assert.equal(f.records()[0].evaluation.score,4);
  const answers=A.decodeArtifact(f.records()[0]).answers;
  assert.equal(answers.q1,'red');assert.deepEqual(answers.q2.slice().sort(),['fox','owl']);assert.equal(answers.q3,'Not Given');assert.equal(answers.q4,'D');
  assert.deepEqual(questions,original);
});

test('reloading a saved attempt restores identical option order and selected answer text',async()=>{
  const questions=choiceQuestions(),f=fixture({questions});await Promise.resolve();
  await f.nodes.get('courseTasks').children.find(n=>n.dataset.taskId==='reading').fire('click');await f.nodes.get('courseBegin').fire('click');
  const order=questions.map(q=>optionInputs(f,q.id).map(n=>n.value));
  for(const q of questions){const inputs=optionInputs(f,q.id);inputs.forEach(n=>n.checked=q.answers.includes(n.value));await inputs.find(n=>n.checked).fire('change');}
  f.advance(1000);f.win.dispatchEvent({type:'pagehide'});
  const saved=Object.values(JSON.parse(f.map.get(f.win.IELTSCoursePlayer.KEY)).drafts)[0];
  const reopened=fixture({questions:structuredClone(questions)},{storage:f.map});await new Promise(resolve=>setImmediate(resolve));
  const restore=reopened.nodes.get('courseDrafts').querySelectorAll('button')[0];assert.ok(restore,'saved draft should be restorable after the history list loads');await restore.fire('click');
  for(let i=0;i<questions.length;i++){
    const inputs=optionInputs(reopened,questions[i].id);
    assert.deepEqual(inputs.map(n=>n.value),order[i]);
    assert.ok(inputs.every(n=>n.name===saved.id+'-'+questions[i].id));
    assert.deepEqual(inputs.filter(n=>n.checked).map(n=>n.value).sort(),questions[i].answers.slice().sort());
  }
  reopened.advance(3000);await reopened.nodes.get('courseSubmit').fire('click');
  assert.equal(reopened.records()[0].id,saved.id);assert.equal(reopened.records()[0].evaluation.score,2);
  assert.deepEqual(A.decodeArtifact(reopened.records()[0]).answers,saved.answers);
});
