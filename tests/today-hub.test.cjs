 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Hub=require('../assets/today-hub.js'),Player=require('../assets/course-player.js'),A=require('../assets/assessment-core.js');
const materials=['g1','g2','l1'].map(id=>({id,skill:id==='l1'?'listening':'grammar',questions:[{id:'q1',type:'single',prompt:'Choose a.',options:['a','b'],answers:['a']}]}));
const task={id:'grammar',materialIds:['g1','g2'],minutes:30};
function record(id,materialId,result='pass',at='2026-10-24T10:00:00.000Z',extra={}){return{id,taskId:'grammar',skill:'grammar',materialId,kind:'original',dayNumber:1,answer:'{"schema":1,"answers":{"q1":"a"}}',submittedAt:at,evaluation:{method:'objective',result},minutes:1,...extra};}
test('each material uses its latest valid record, with pending determined only from that record',()=>{
 const old=record('old','g1','pending'),latest=record('new','g1','pass','2026-10-24T11:00:00.000Z'),second=record('two','g2');
 let state=Hub.taskState(task,[latest,old,second],{dayNumber:1,materials});assert.equal(state.done,true);assert.equal(state.pending,false);
 state=Hub.taskState(task,[old,second,{...latest,evaluation:{result:'pending'}}],{dayNumber:1,materials});assert.equal(state.done,false);assert.equal(state.pending,true);assert.equal(state.nextMaterialId,'g1');assert.equal(state.count,2);
 const invalid=record('invalid','g1','pass','invalid timestamp');state=Hub.taskState(task,[old,second,invalid],{dayNumber:1,materials});assert.equal(state.pending,true);
});
test('listening requires safely decoded completed playback and a malformed newer record never crashes progress',()=>{
 const listening={id:'listening',minutes:75,materialIds:['l1']},own=extra=>record('listen','l1','pass',undefined,{taskId:'listening',skill:'listening',...extra});
 for(const answer of ['{broken','null','[]','"text"','{"audioCompleted":false}','']){const state=Hub.taskState(listening,[own({answer})],{dayNumber:1,materials});assert.equal(state.done,false);assert.equal(state.count,0);}
 const good=own({answer:'{"audioCompleted":true,"answers":{"q1":"a"}}'}),bad=own({id:'later',submittedAt:'2026-10-24T12:00:00.000Z',answer:'{broken',evaluation:{result:'pending'}});
 assert.equal(Hub.taskState(listening,[good,bad],{dayNumber:1,materials}).done,true);assert.equal(Hub.taskState(listening,[good,bad],{dayNumber:1,materials}).pending,false);
});
test('resumption selects the first unsubmitted material in task order and ignores another day or retest-only evidence',()=>{
 let state=Hub.taskState(task,[record('one','g1')],{dayNumber:1,materials});assert.equal(state.nextMaterialId,'g2');assert.deepEqual(state.missingMaterialIds,['g2']);
 state=Hub.taskState(task,[record('one','g1','pass',undefined,{dayNumber:2}),record('two','g2','pass',undefined,{kind:'retest'})],{dayNumber:1,materials});assert.deepEqual(state.missingMaterialIds,['g1','g2']);
 const waiting={task,...Hub.taskState(task,[record('one','g1','pending'),record('two','g2')],{dayNumber:1,materials})},fresh={task:{id:'reading'},done:false,missingMaterialIds:['r1']};assert.equal(Hub.chooseNext([waiting,fresh]),fresh);
});
test('reflection completion is based on the current mistake completion token and drafts are matched precisely',()=>{
 const reflection={id:'reflection',materialIds:['reflection-1']};assert.equal(Hub.taskState(reflection,[],{completionValid:false}).done,false);assert.equal(Hub.taskState(reflection,[],{completionValid:true}).done,true);
 const drafts=[{id:'draft',taskId:'grammar',materialId:'g2'}];assert.equal(Hub.hasDraft('grammar','g2',drafts),true);assert.equal(Hub.hasDraft('grammar','g1',drafts),false);assert.equal(Hub.hasDraft('grammar','g2',[],{active:true,submitted:false,taskId:'grammar',materialId:'g2'}),true);
});
class Element{constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this.attributes={};this.textContent='';this.disabled=false;}replaceChildren(...items){this.children=items;}append(...items){this.children.push(...items);}setAttribute(k,v){this.attributes[k]=v;}getAttribute(k){return this.attributes[k];}addEventListener(k,v){(this.listeners[k]||=[]).push(v);}async fire(k){for(const fn of this.listeners[k]||[])await fn({target:this});}scrollIntoView(){}}
async function fixture(options={}){
 const ids=['todayOverview','todayEyebrow','todayTitle','todayGoal','todayDone','todayMinutes','todayMistakes','todayStart','todayNext','todayAdvice','todayRoute','todayAdaptiveContent','todayLearningQueue','todayQueueSummary','courseMaterialIntro','courseSession'],nodes=new Map(ids.map(id=>[id,new Element()])),events={},calls=[],data=options.data||{days:[{day:1,week:1,title:'Test',tasks:options.tasks||[task]}]},storage={getItem:()=> '{}',setItem(){}};
 data.materials=[...materials,...(data.materials||[]).map(item=>({...materials.find(m=>m.id===item.id),...item}))].filter((item,index,all)=>all.findLastIndex(m=>m.id===item.id)===index);
 const navigation={...(options.omitResumeDraft?{}:{resumeDraft:async id=>calls.push(['draft',id])}),...(options.allDrafts?{allDrafts:()=>options.allDrafts}:{}),...(options.budget?{budget:()=>options.budget}:{}),showDay:(...args)=>calls.push(['day',...args]),current:()=>({day:1,taskId:'grammar',materialId:'g1',active:false,submitted:false,...options.current}),drafts:()=>options.drafts||[],showTask:(...args)=>calls.push(['show',...args]),showLatestRecord:async(...args)=>calls.push(['record',...args]),openExtra:entry=>calls.push(['extra',entry]),exposures:()=>options.exposures||{},resumeNext:async(...args)=>calls.push(['resume',...args])};
 const root={document:{getElementById:id=>nodes.get(id)||null,createElement:tag=>new Element(tag),querySelectorAll:()=>[]},IELTSRecords:{list:async()=>options.records||[]},IELTSCoursePlayer:Player,...(options.queue?{IELTSDailyLearningLoad:require('../assets/daily-learning-load.js'),IELTSYearPlanner:require('../assets/year-planner.js')}:{}),IELTSAssessment:A,IELTSPlacement:options.placement,IELTSPlanState:require('../assets/daily-plan-state.js'),IELTSCurriculumData:data,IELTSAdaptivePlan:options.adaptive,IELTSVocabularyPractice:require('../assets/vocabulary-practice.js'),IELTSMistakes:{EVENT:'mistakes',forDay:n=>options.summaryForDay?.(n)||({completionValid:options.completionValid||false,remaining:0}),recordCorrectionStatus:options.recordCorrectionStatus},IELTSTodayNavigation:navigation,IELTSProfiles:{storage:()=>storage},location:{search:'?preview=1',href:'http://127.0.0.1:8765/?preview=1'},addEventListener:(k,fn)=>(events[k]||=[]).push(fn)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/today-hub.js'),'utf8'),{window:root,URLSearchParams,URL});await new Promise(resolve=>setImmediate(resolve));return{nodes,calls,root,events};
}
test('home Start resumes the first missing material instead of going back to the first material',async()=>{
 const f=await fixture({records:[record('one','g1')]});await f.nodes.get('todayStart').fire('click');assert.deepEqual(f.calls,[['resume','grammar','g2']]);
});
test('home exposes a usable optional challenge card from stronger placement evidence and hides it when core-reserved budget is too small',async()=>{
 const core={id:'core-reading',skill:'reading',week:9,level:'A2',pool:'training',estimatedMinutes:10,source:{verification:'reviewed'},title:'A2 core'},strong={...core,id:'strong-reading',week:15,level:'B1',estimatedMinutes:12,title:'B1 challenge'},data={days:[{day:57,week:9,title:'Matched course',tasks:[{id:'reading',minutes:10,materialIds:[core.id]},{id:'reflection',minutes:10,materialIds:['reflection-57']}]}],materials:[core,strong]},route={sessionId:'placement-home-fixture',adoptedAt:'2026-10-24T00:00:00.000Z',startDay:57,startWeek:9,level:'A2',skills:{reading:{level:'B1',verified:true}}},opts={data,queue:true,placement:{currentRoute:()=>route},current:{day:57,taskId:'reading',materialId:core.id},budget:{remainingMinutes:360,spentMinutes:0,exhausted:false}},f=await fixture(opts),all=node=>[node,...node.children.flatMap(all)],go=all(f.nodes.get('todayLearningQueue')).find(n=>n.tagName==='BUTTON'&&n.textContent==='开始这份适级挑战');assert.ok(go);assert.equal(go.disabled,false);assert.match(content(f.nodes.get('todayLearningQueue')),/可选：B1 阅读适级挑战/);assert.equal(f.nodes.get('todayDone').textContent,'0 / 2');await go.fire('click');assert.equal(f.calls[0][0],'extra');assert.equal(f.calls[0][1].materialId,strong.id);assert.equal(f.calls[0][1].sessionId,route.sessionId);const noRoom=await fixture({...opts,budget:{remainingMinutes:25,spentMinutes:335,exhausted:false}});assert.equal(all(noRoom.nodes.get('todayLearningQueue')).some(n=>n.textContent==='开始这份适级挑战'),false);
});

test('independent material homepage keeps its title and primary action on the selected short assessment',async()=>{
 const material={id:'independent-a1-read-1',title:'A new independent text',skill:'reading',level:'A1',estimatedMinutes:12,independentBank:true},data={days:[{day:1,week:1,title:'Core',tasks:[task]}],materials:[material]};
 for(const active of [false,true]){const f=await fixture({data,current:{taskId:'reading',materialId:material.id,active}});assert.equal(f.nodes.get('todayTitle').textContent,material.title);assert.match(f.nodes.get('todayGoal').textContent,/不会替代今日核心/);assert.equal(f.nodes.get('todayStart').textContent,active?'继续这份独立短测':'开始这份独立短测');await f.nodes.get('todayStart').fire('click');assert.deepEqual(f.calls,[['resume','reading',material.id]]);assert.equal(f.nodes.get('todayDone').textContent,'0 / 1');}
 const done=await fixture({data,current:{taskId:'reading',materialId:material.id,active:true,submitted:true}});assert.equal(done.nodes.get('todayStart').textContent,'查看本次短测结果');await done.nodes.get('todayStart').fire('click');assert.deepEqual(done.calls,[]);
});
test('home labels a draft and routes Continue through resume without invoking a fresh begin',async()=>{
 const f=await fixture({records:[record('one','g1')],drafts:[{id:'retained-draft',taskId:'grammar',materialId:'g2'}]});assert.match(f.nodes.get('todayStart').textContent,/未提交草稿/);await f.nodes.get('todayStart').fire('click');assert.deepEqual(f.calls,[['resume','grammar','g2']]);
});
test('all-submitted pending task opens its pending material without creating another attempt',async()=>{
 const f=await fixture({records:[record('one','g1','pending'),record('two','g2')]});assert.match(f.nodes.get('todayStart').textContent,/查看待评作品/);await f.nodes.get('todayStart').fire('click');assert.deepEqual(f.calls,[['record','grammar','g1']]);
});
test('day changes reload records and stale progress from another day does not corrupt the overview',async()=>{
 const f=await fixture({records:[record('one','g1')]});f.root.IELTSCurriculumData.days.push({day:2,week:1,title:'Day2',tasks:[task]});
 for(const fn of f.events['ielts:course-view'])fn({detail:{day:2,taskId:'grammar',materialId:'g1',active:false,submitted:false}});
 for(const fn of f.events['ielts:course-progress'])fn({detail:{day:1,records:[record('two','g2')]}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(f.nodes.get('todayDone').textContent,'0 / 1');assert.equal(f.nodes.get('todayMinutes').textContent,'0.0 / 360 分钟');
});

function newVocabularyRaw(wrong=false){
 const V=require('../assets/vocabulary-practice.js'),crypto=require('node:crypto'),material={id:'v1',vocabulary:[{word:'hello',meaning:'你好'}]},session=V.createSession({material});
 for(let n=1;n<=3;n++)session.recordSpelling(0,'hello');for(let n=1;n<=3;n++)session.recordSpeaking(0,{workId:'work-testing-'+String(n).padStart(8,'0'),reference:'hello',hash:crypto.createHash('sha256').update(String(n)).digest('hex'),evidenceId:'evidence-'+n,provider:'Alibaba oral assessment',verified:true,nonSilent:true,durationSeconds:1,recordedAt:new Date().toISOString(),result:{accuracy:90,fluency:90,completeness:95}});session.begin();
 for(let i=0;i<3;i++){session.setAnswer(0,wrong&&i===0?'hellp':'hello');if(i===2)session.markPlayed(0,{kind:'local-audio',started:true,completed:true,completedAt:new Date().toISOString()});session.submitRound();if(i<2)session.next();}return{material,payload:session.getSubmission()};
}
test('old vocabulary records remain preserved but cannot complete the new v2 training task',()=>{
 const vocab={id:'vocabulary',materialIds:['v1']},legacy=record('old','v1','pass',undefined,{taskId:'vocabulary',skill:'vocabulary',answer:JSON.stringify({schema:1,trainingVersion:1,kind:'vocabulary-three-modes',allModesCompleted:true})});const state=Hub.taskState(vocab,[legacy],{dayNumber:1,materials});assert.equal(state.done,false);assert.equal(state.legacyTraining,true);assert.equal(state.nextMaterialId,'v1');
});
test('genuine v2 three-mode submission counts even when test mistakes remain and cached pass is false',()=>{
 const {material,payload}=newVocabularyRaw(true),vocab={id:'vocabulary',materialIds:['v1']},work=record('new','v1','revise',undefined,{taskId:'vocabulary',skill:'vocabulary',answer:JSON.stringify({...JSON.parse(payload.answer),schema:1,trainingSchema:2})});assert.equal(payload.pass,false);const state=Hub.taskState(vocab,[work],{dayNumber:1,materials:[material]});assert.equal(state.done,true);assert.equal(state.count,1);assert.equal(state.legacyTraining,false);
 const incomplete=JSON.parse(work.answer);delete incomplete.learning;const invalid=Hub.taskState(vocab,[{...work,answer:JSON.stringify(incomplete)}],{dayNumber:1,materials:[material]});assert.equal(invalid.done,false);
});
function walk(node){return[node,...node.children.flatMap(walk)];}function content(node){return String(node.textContent||'')+node.children.map(content).join('');}

test('home automatically shows the next course as today primary queue after fast complete core and recap without opening it',async()=>{
 const reflection={id:'reflection',minutes:20,materialIds:['reflection-1']},data={days:[{day:1,week:1,title:'First',tasks:[task,reflection]},{day:2,week:1,title:'Second',tasks:[{...task,materialIds:['g3']},{...reflection,materialIds:['reflection-2']}]}],materials:[{...materials[0],id:'g3',title:'Next actual unit',estimatedMinutes:15}]};
 const f=await fixture({queue:true,data,records:[record('one','g1'),record('two','g2')],summaryForDay:n=>({completionValid:n===1,remaining:0}),budget:{date:'2026-10-24',budgetMinutes:360,spentMinutes:10,remainingMinutes:350,exhausted:false}});assert.match(f.nodes.get('todayStart').textContent,/第 2 课/);assert.match(content(f.nodes.get('todayLearningQueue')),/Next actual unit/);assert.match(f.nodes.get('todayAdvice').textContent,/下一课已自动加入/);assert.equal(f.calls.length,0);await f.nodes.get('todayStart').fire('click');assert.deepEqual(f.calls,[['day',2,'g3'],['resume','grammar','g3']]);
});

test('home displays estimated source and uncertainty and explicitly ends today when twenty minutes cannot fit the next unit',async()=>{
 const reflection={id:'reflection',minutes:30,materialIds:['reflection-1']},data={days:[{day:1,week:1,title:'First',tasks:[task,reflection]},{day:2,week:1,title:'Second',tasks:[{...task,materialIds:['g3']},{...reflection,materialIds:['reflection-2']}]}],materials:[{...materials[0],id:'g3',title:'Long unit',estimatedMinutes:45}]},f=await fixture({queue:true,data,records:[record('one','g1'),record('two','g2')],summaryForDay:n=>({completionValid:n===1,remaining:0}),budget:{date:'2026-10-24',spentMinutes:340,remainingMinutes:20,exhausted:false}});
 assert.match(f.nodes.get('todayStart').textContent,/今天到此/);assert.equal(f.nodes.get('todayStart').disabled,true);assert.match(content(f.nodes.get('todayLearningQueue')),/课程预计/);assert.match(content(f.nodes.get('todayLearningQueue')),/不确定性高/);assert.match(f.nodes.get('todayNext').textContent,/下一日继续/);assert.equal(f.calls.length,0);assert.equal(f.nodes.get('todayDone').textContent,'2 / 2');
});

test('pending outputs leave the daily queue incomplete while the homepage offers an independent missing task',async()=>{
 const writing={id:'writing',minutes:40,materialIds:['w1']},data={days:[{day:1,week:1,title:'First',tasks:[writing,task,{id:'reflection',minutes:20,materialIds:['reflection-1']}]}],materials:[{id:'w1',skill:'writing',estimatedMinutes:20}]},f=await fixture({queue:true,data,records:[record('w','w1','pending',undefined,{taskId:'writing',skill:'writing',answer:'{"schema":1,"text":"My draft."}'})]});assert.match(f.nodes.get('todayStart').textContent,/语法/);assert.match(content(f.nodes.get('todayLearningQueue')),/待评作品/);assert.equal(f.nodes.get('todayDone').textContent,'0 / 3');await f.nodes.get('todayStart').fire('click');assert.deepEqual(f.calls,[['resume','grammar','g1']]);
});

test('daily queue foregrounds one action with two brief previews and folds the remaining route and statistical explanation',async()=>{
 const ids=['g1','g2','g3','g4','g5','g6','g7'],data={days:[{day:1,week:1,title:'Long route',tasks:[{...task,materialIds:ids},{id:'reflection',minutes:20,materialIds:['reflection-1']}]}],materials:ids.slice(2).map(id=>({...materials[0],id,title:id,estimatedMinutes:15}))},f=await fixture({queue:true,data});
 const box=f.nodes.get('todayLearningQueue'),cards=box.children.filter(n=>n.tagName==='ARTICLE'),previews=box.children.filter(n=>n.tagName==='P');assert.equal(cards.length,1);assert.equal(previews.length,2);assert.equal(cards[0].children.filter(n=>n.tagName==='BUTTON').length,1);assert.equal(cards[0].children.filter(n=>n.tagName==='DETAILS').length,1);assert.equal(box.children.filter(n=>n.tagName==='DETAILS').length,1);assert.match(content(box),/为什么这样安排/);assert.match(content(box),/查看后续队列/);assert.ok(cards[0].children.filter(n=>n.tagName==='P').every(n=>!n.textContent.includes('样本')&&!n.textContent.includes('百分位')));assert.match(f.nodes.get('todayQueueSummary').textContent,/学习与番茄休息共用六小时/);
});
test('adaptive section shows overlay reasons, reserves core work and opens an actual same-level recommendation on click only',async()=>{
 const calls=[],data={days:[{day:1,week:1,title:'Test',tasks:[task]}],materials:[{id:'g1',title:'Grammar one'},{id:'g2',title:'Grammar two'},{id:'extra',title:'A fresh same-level practice',skill:'reading'}]},exposures={seen:{count:1}};
 const adaptive={getDay:base=>({...base,adaptation:{reason:'根据昨日原稿调整策略。',strategies:[{skill:'reading',action:'先定位原句再回答。'}]}}),planRemaining:(day,records,proposal,options)=>{calls.push({day,records,proposal,options});return{remainingBudget:350,reservedCoreMinutes:30,tasks:[{kind:'new-practice',materialId:'extra',skill:'reading',estimatedMinutes:10,reason:'已有真实核对证据，进行同级迁移。'}],retained:[]};}};
 const f=await fixture({records:[record('one','g1')],data,adaptive,exposures});const box=f.nodes.get('todayAdaptiveContent'),text=content(box);assert.match(text,/昨日原稿调整/);assert.match(text,/先定位原句/);assert.match(text,/剩余可用预算 350/);assert.ok(text.indexOf('下一份核心任务')<text.indexOf('剩余预算内的适级练习'));assert.equal(f.calls.length,0);assert.equal(calls.at(-1).options.budgetMinutes,360);assert.deepEqual(calls.at(-1).options.exposures,exposures);
 const open=walk(box).find(node=>node.textContent==='开始同级新练习');await open.fire('click');assert.equal(f.calls[0][0],'extra');assert.equal(f.calls[0][1].materialId,'extra');assert.equal(f.nodes.get('todayDone').textContent,'0 / 1');
});
test('adaptive retained work continues its draft and lack of extra recommendations never invents completion',async()=>{
 const data={days:[{day:1,week:1,title:'Test',tasks:[task]}],materials:[{id:'extra-draft',title:'A retained draft',skill:'reading'}]},adaptive={getDay:day=>day,planRemaining:()=>({remainingBudget:20,reservedCoreMinutes:30,tasks:[],retained:[{kind:'in-progress',materialId:'extra-draft',skill:'reading'}],reason:'先完成核心任务。'})};
 const f=await fixture({data,adaptive,drafts:[{id:'saved-draft',materialId:'extra-draft',taskId:'reading'}]});const box=f.nodes.get('todayAdaptiveContent');assert.match(content(box),/保留的未提交练习/);assert.match(content(box),/先完成核心任务/);assert.equal(walk(box).some(node=>node.textContent==='开始同级新练习'),false);await walk(box).find(node=>node.textContent==='继续这份草稿').fire('click');assert.deepEqual(f.calls,[['draft','saved-draft']]);
});

test('personalised Continue restores an existing draft by identity across course days and never invokes a fresh begin or material-only route',async()=>{
 const data={days:[{day:1,week:1,title:'Today',tasks:[task]}],materials:[{id:'retained-human',title:'Retained audio',skill:'listening'}]},adaptive={getDay:day=>day,planRemaining:()=>({remainingBudget:300,reservedCoreMinutes:30,tasks:[],retained:[{kind:'in-progress',materialId:'retained-human',skill:'listening'}]})},saved={id:'exact-listening-draft',courseDay:7,materialId:'retained-human',taskId:'listening',audioCompleted:true,startedAt:'2026-10-23T12:00:00Z'},f=await fixture({data,adaptive,allDrafts:[saved]});
 await walk(f.nodes.get('todayAdaptiveContent')).find(n=>n.textContent==='继续这份草稿').fire('click');assert.deepEqual(f.calls,[['draft','exact-listening-draft']]);assert.equal(saved.audioCompleted,true);assert.equal(saved.courseDay,7);
});

test('a missing saved draft or unavailable restore component shows an error without silently starting a replacement',async()=>{
 const data={days:[{day:1,week:1,title:'Today',tasks:[task]}],materials:[{id:'retained',title:'Retained',skill:'reading'}]},adaptive={getDay:day=>day,planRemaining:()=>({remainingBudget:300,reservedCoreMinutes:30,tasks:[],retained:[{kind:'in-progress',materialId:'retained',skill:'reading'}]})};
 for(const options of [{drafts:[]},{drafts:[{id:'saved',materialId:'retained',taskId:'reading'}],omitResumeDraft:true}]){const f=await fixture({data,adaptive,...options});await walk(f.nodes.get('todayAdaptiveContent')).find(n=>n.textContent==='继续这份草稿').fire('click');assert.equal(f.calls.length,0);assert.match(f.nodes.get('todayAdvice').textContent,/未找到|刷新/);}
});


test('verification card honestly opens the original full task rather than promising a ten-minute two-question test',async()=>{
 const data={days:[{day:1,week:1,title:'Test',tasks:[task]}],materials:[{id:'check-original',title:'Original full material',skill:'reading'}]},adaptive={getDay:day=>day,planRemaining:()=>({remainingBudget:300,reservedCoreMinutes:30,tasks:[{kind:'verification',materialId:'check-original',skill:'reading',estimatedMinutes:10,reason:'现有表现还需要核对。'}],retained:[]})};
 const f=await fixture({data,adaptive}),box=f.nodes.get('todayAdaptiveContent');assert.match(content(box),/参考首轮检查 10 分钟/);assert.match(content(box),/原完整材料/);assert.match(content(box),/估时以实际练习为准/);assert.doesNotMatch(content(box),/两题|2题|开始短验证/);await walk(box).find(node=>node.textContent==='先验证／补练（打开原任务）').fire('click');assert.equal(f.calls[0][0],'extra');assert.equal(f.calls[0][1].materialId,'check-original');
});


test('adaptive overview stays compact: one next core, two visible strategies and at most two extra cards',async()=>{
 const tasks=[task,{id:'reading',materialIds:['r1'],minutes:60},{id:'writing',materialIds:['w1'],minutes:75}],data={days:[{day:2,week:1,title:'Test',tasks}],materials:[...['g1','g2','r1','w1'].map(id=>({id,title:id})),...['e1','e2','e3'].map(id=>({id,title:'Extra '+id,skill:'reading'}))]},adaptive={getDay:day=>({...day,adaptation:{reason:'本日重点。',strategies:[{skill:'reading',action:'策略一'},{skill:'writing',action:'策略二'},{skill:'speaking',action:'策略三'}]}}),planRemaining:()=>({remainingBudget:300,reservedCoreMinutes:90,tasks:['e1','e2','e3'].map(id=>({kind:'new-practice',materialId:id,skill:'reading',estimatedMinutes:10,reason:'同级迁移'})),retained:[]})};
 const f=await fixture({data,adaptive,current:{day:2}}),box=f.nodes.get('todayAdaptiveContent'),items=walk(box);assert.equal(items.filter(node=>node.textContent==='继续核心任务').length,1);assert.equal(items.filter(node=>node.textContent==='开始同级新练习').length,2);assert.equal(items.filter(node=>node.textContent==='查看其余学习策略').length,1);assert.ok(box.children.some(node=>node.children.some(child=>child.textContent==='查看其余学习策略')));
});
test('first day without validated new work uses a brief next-step hint and does not duplicate the vocabulary verification card',async()=>{
 const vocab={id:'vocabulary',materialIds:['v1'],minutes:45},data={days:[{day:1,week:1,title:'Start',tasks:[vocab]}],materials:[{id:'v1',title:'Vocabulary',skill:'vocabulary'}]},adaptive={getDay:day=>day,planRemaining:()=>({remainingBudget:350,reservedCoreMinutes:180,tasks:[{kind:'verification',materialId:'v1',skill:'vocabulary',estimatedMinutes:10}],retained:[]})};
 const f=await fixture({data,adaptive}),box=f.nodes.get('todayAdaptiveContent'),text=content(box);assert.match(text,/上方主按钮继续/);assert.equal(walk(box).filter(node=>node.textContent==='继续核心任务').length,0);assert.equal(walk(box).filter(node=>node.textContent==='先验证／补练（打开原任务）').length,0);
});


test('a validated correction of the latest pending original clears only submission pending and leaves the original unchanged',()=>{
 const writing={id:'writing',materialIds:['w1']},original=record('writing-new','w1','pending',undefined,{taskId:'writing',skill:'writing',version:2,answer:JSON.stringify({schema:1,text:'An original answer.'})}),before=JSON.stringify(original),seen=[];
 const corrected=Hub.taskState(writing,[original],{dayNumber:1,materials,recordCorrectionStatus:work=>{seen.push(work.id);return{corrected:work.id==='writing-new'&&work.version===2,submitted:true};}});assert.equal(corrected.done,true);assert.equal(corrected.pending,false);assert.deepEqual(seen,['writing-new']);assert.equal(JSON.stringify(original),before);assert.equal(original.evaluation.result,'pending');
});
test('no matched errors, stale record correction, malformed proof or a failed lookup cannot clear a pending original',()=>{
 const writing={id:'writing',materialIds:['w1']},latest=record('writing-new','w1','pending',undefined,{taskId:'writing',skill:'writing',version:2});
 for(const recordCorrectionStatus of [undefined,()=>({corrected:false,reason:'no matched errors'}),record=>({corrected:record.id==='old-writing'}),()=>({corrected:'true'}),()=>{throw Error('unreadable mistakes');}]){const state=Hub.taskState(writing,[latest],{dayNumber:1,materials,recordCorrectionStatus});assert.equal(state.pending,true);assert.equal(state.done,false);}
});
test('home stops waiting on an original only after the validated mistake correction hook resolves it',async()=>{
 const pending=record('pending-work','g1','pending'),second=record('second','g2'),f=await fixture({records:[pending,second],recordCorrectionStatus:work=>({corrected:work.id==='pending-work'})});assert.equal(f.nodes.get('todayDone').textContent,'1 / 1');assert.equal(f.nodes.get('todayStart').textContent,'查看今日复盘');assert.equal(pending.evaluation.result,'pending');
});


test('real mistake-book two-round correction releases pending submission but never alters or masters the original',()=>{
 const M=require('../assets/mistake-book.js'),now='2026-10-24T12:00:00.000Z',writing={id:'writing',materialIds:['w1']},original=record('writing-original','w1','pending',now,{taskId:'writing',skill:'writing',version:1,answer:JSON.stringify({schema:1,text:'I student.'})});
 let book=M.capture(M.newState(),{dayNumber:1,source:'course-player',materialId:'w1',recordId:original.id,recordVersion:1,skill:'writing',questionId:'output',title:'Introduce yourself',question:{id:'output',type:'subjective',prompt:'Introduce yourself.',answers:[],task:'foundation',level:'A0'},originalAnswer:'I student.',evaluation:{method:'none',result:'pending'},status:'pending',at:now},now).state;
 const helper=work=>M.recordCorrectionStatus(work,book);assert.equal(Hub.taskState(writing,[original],{dayNumber:1,materials,recordCorrectionStatus:helper}).pending,true);
 const item=book.items[0],corrected='I am a student.',review={ok:true,status:'complete',requiresRetest:false,rounds:[1,2].map(round=>({ok:true,round,summary:'根据原稿核对。',criteria:[],levelCheck:{meetsGoal:true,evidence:[{quote:corrected,comment:'完整阶段表达'}]}}))};book=M.submitRound(book,1,{[item.id]:corrected},{id:'correction-round',now,subjective:{[item.id]:{review}}}).state;
 assert.equal(M.recordCorrectionStatus(original,book).corrected,true);const state=Hub.taskState(writing,[original],{dayNumber:1,materials,recordCorrectionStatus:helper});assert.equal(state.done,true);assert.equal(state.pending,false);assert.equal(original.evaluation.result,'pending');assert.equal(JSON.parse(original.answer).text,'I student.');
 const newer={...original,id:'new-writing-original',version:2};assert.equal(Hub.taskState(writing,[newer],{dayNumber:1,materials,recordCorrectionStatus:helper}).pending,true);
 const damaged=JSON.parse(JSON.stringify(book));damaged.items[0].lastRoundId='missing-round';assert.equal(Hub.taskState(writing,[original],{dayNumber:1,materials,recordCorrectionStatus:work=>M.recordCorrectionStatus(work,damaged)}).pending,true);
});
