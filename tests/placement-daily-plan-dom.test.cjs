'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Core=require('../assets/daily-plan-core.js'),Store=require('../assets/daily-plan-state.js'),Curriculum=require('../assets/curriculum-data.js'),Placement=require('../assets/placement-core.js'),Player=require('../assets/course-player.js'),Assessment=require('../assets/assessment-core.js');
require('../assets/daily-plan-content.js');
const PLAN_KEY='ielts52-daily-plan-v1',AT='2026-10-25T00:00:00.000Z';
function placementState(adoptedAt=AT){const id='placement-daily-fixture-12345678',skills=Object.fromEntries(Placement.SKILLS.map(skill=>[skill,{level:'A2',confidence:'medium',verified:true,evidence:[],gaps:[]}]));return{version:1,sessions:[{id,createdAt:AT,updatedAt:AT,status:'complete',assessment:{id,tasks:Placement.SKILLS.map(skill=>({id:skill,skill}))},answers:{},report:{assessmentId:id,complete:true,status:'complete',skills,recommendation:{level:'A2',day:57,week:9,reason:'Isolated route fixture.'}}}],adopted:{sessionId:id,adoptedAt}};}
class Element{
 constructor(id=''){this.id=id;this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.listeners={};this.cards=new Map();this.parts=new Map();this.classList={toggle(){}};}
 set innerHTML(value){this.html=value;if(this.id==='taskList')this.cards=new Map([...value.matchAll(/data-task="([^"]+)"/g)].map(match=>[match[1],new Element()]));}
 get innerHTML(){return this.html||'';}
 addEventListener(name,listener){(this.listeners[name]||=[]).push(listener);}
 fire(name,event={}){for(const listener of this.listeners[name]||[])listener({target:this,preventDefault(){},...event});}
 querySelectorAll(){return this.controls||[];}
 querySelector(selector){const task=/^\[data-task="([^"]+)"\]$/.exec(selector);if(task)return this.cards.get(task[1]);if(selector==='.linked-task')return this.linked||null;if(!this.parts.has(selector)){const part=new Element();part.after=node=>{this.linked=node;};this.parts.set(selector,part);}return this.parts.get(selector);}
 scrollIntoView(){}replaceChildren(){}insertAdjacentHTML(){}
}
function fixture(options={}){
 const html=fs.readFileSync(path.join(__dirname,'../每日学习计划.html'),'utf8'),nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(match=>[match[1],new Element(match[1])])),raw=new Map(),events=new Map(),instant=options.now||'2026-10-25T12:00:00.000Z';
 const state=options.state||Store.newState('2026-10-01');raw.set(PLAN_KEY,JSON.stringify(state));if(options.corruptPlacement)raw.set(Placement.KEY,'isolated damaged placement data');let placed=options.placement===false?null:placementState(options.adoptedAt),gatePass=!!options.gatePass,records=options.records||[];
 const clock=class extends Date{constructor(...args){super(...(args.length?args:[instant]));}static now(){return Date.parse(instant);}};
 const core=options.coreComplete?{...Core,summarizeDay(plan,source){const result=Core.summarizeDay(plan,source);return plan.dayNumber===84?{...result,complete:true,completedTasks:result.totalTasks}:result;}}:Core;
 // The actions run in a VM while this bound validator lives in Node; normalize
 // new VM objects through the same JSON boundary used by persisted plan state.
 const boundStore={...Store,getPlan:(value,...args)=>Store.getPlan(JSON.parse(JSON.stringify(value)),...args)};
 const context={IELTSPlanCore:core,IELTSPlanState:boundStore,IELTSPlanContent:global.IELTSPlanContent,IELTSCurriculumData:Curriculum,IELTSCoursePlayer:Player,
  IELTSAssessment:{...Assessment,gateMastery:(_records,materials,config)=>Assessment.gateMastery(_records,materials,config).map(gate=>gate.id==='gate-12'?{...gate,pass:gatePass,reasons:gatePass?[]:gate.reasons}:gate)},
  IELTSPlacement:{KEY:Placement.KEY,currentRoute:data=>{if(options.corruptPlacement)throw Error('damaged fixture');return placed?Placement.routeFromState(placed,data):null;}},
  IELTSRecords:{EVENT:'records',list:async()=>records,summaries:()=>options.summaries||{}},
  IELTSProfiles:{mount(){},storage:()=>({getItem:key=>raw.get(key)??null,setItem:(key,value)=>raw.set(key,value)}),scopeKey:key=>key},
  document:{getElementById:id=>nodes.get(id),createElement:()=>new Element(),querySelectorAll:()=>[]},location:{search:'?preview=1',hash:options.hash||''},Date:clock,URLSearchParams,Map,Set,console,setTimeout:()=>1,clearTimeout(){},addEventListener(name,listener){if(!events.has(name))events.set(name,[]);events.get(name).push(listener);}};
 context.window=context;nodes.get('tasksForm').controls=[new Element('task-input'),nodes.get('submitDay')];vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/daily-plan-app.js'),'utf8'),context);
 const emit=(name,detail={})=>{for(const listener of events.get(name)||[])listener(detail);};return{nodes,raw,context,state:()=>JSON.parse(raw.get(PLAN_KEY)),emit,flush:()=>new Promise(resolve=>setImmediate(resolve)),selectWeek:week=>{nodes.get('weekSelect').value=String(week);nodes.get('weekSelect').fire('change');},setPlacement:value=>{placed=value;emit('ielts:placement-changed');},setGatePass:value=>{gatePass=value;emit('records');},setRecords:value=>{records=value;emit('records');}};
}

test('daily calendar opens the adopted course start without moving the real opening date or inventing completed foundation days',async()=>{
 const f=fixture();await f.flush();assert.equal(f.context.location.hash,'day57');assert.match(f.nodes.get('daySubtitle').textContent,/课程第 57 课 · 测评起点/);assert.doesNotMatch(f.nodes.get('daySubtitle').textContent,/2026-11-26/);assert.equal(f.nodes.get('overdueDays').textContent,'0');assert.match(f.nodes.get('completedDays').innerHTML,/^0 /);assert.equal(f.nodes.get('nextCheckpoint').textContent,'第 12 周');assert.equal(f.nodes.get('submitDay').disabled,false);assert.equal(f.state().startDate,'2026-10-01');assert.deepEqual(f.state().days,{});
 f.selectWeek(1);assert.match(f.nodes.get('weekDays').innerHTML,/基础回看/);assert.doesNotMatch(f.nodes.get('weekDays').innerHTML,/day-dot overdue/);assert.doesNotMatch(f.nodes.get('weekDays').innerHTML,/✓ 已交/);
 f.nodes.get('todayButton').fire('click');assert.equal(f.context.location.hash,'day57');
});

test('course scheduling advances by local adoption dates while actual year limits and unstarted future lessons remain separate',async()=>{
 const f=fixture({now:'2026-10-27T12:00:00.000Z'});await f.flush();assert.equal(f.context.location.hash,'day59');assert.equal(f.nodes.get('overdueDays').textContent,'2');assert.equal(f.state().startDate,'2026-10-01');assert.doesNotMatch(f.nodes.get('dayNotice').textContent,/年度日历已结束/);f.selectWeek(10);assert.equal(f.context.location.hash,'day64');assert.equal(f.nodes.get('submitDay').disabled,true);assert.match(f.nodes.get('dayNotice').textContent,/后续课程预览/);
 const legacyCalendar=fixture({placement:false,now:'2026-10-27T12:00:00.000Z'});await legacyCalendar.flush();assert.equal(legacyCalendar.context.location.hash,'day27');assert.equal(legacyCalendar.nodes.get('overdueDays').textContent,'26');assert.match(legacyCalendar.nodes.get('daySubtitle').textContent,/2026-10-27/);
});

test('a newly adopted route preserves an already started foundation day and its actual history date',async()=>{
 const state=Store.newState('2026-10-01');state.days['10']={planVersion:Core.CURRICULUM_PLAN_VERSION,tasks:{writing:{actualMinutes:4,actualQuantity:0,evidence:'原稿正在继续，请保留实际历史日期。'}},completedAt:'2026-10-10T01:00:00.000Z'};
 const f=fixture({placement:false,state,hash:'#day10'});await f.flush();const original=JSON.stringify(f.state());f.setPlacement(placementState());assert.equal(f.context.location.hash,'day10');assert.match(f.nodes.get('dayNotice').textContent,/基础回看/);assert.match(f.nodes.get('daySubtitle').textContent,/作品日期 2026-10-10/);assert.equal(JSON.stringify(f.state()),original);f.nodes.get('todayButton').fire('click');assert.equal(f.context.location.hash,'day57');assert.equal(f.state().days['10'].completedAt,'2026-10-10T01:00:00.000Z');
});

test('existing course drafts beyond the schedule stay editable with placement while missing or damaged placement cannot authorize new future work',async()=>{
 const state=Store.newState('2026-10-01');state.days['70']={planVersion:Core.CURRICULUM_PLAN_VERSION,tasks:{writing:{actualMinutes:1,actualQuantity:0,evidence:'已有原稿继续保留。'}}};
 const f=fixture({state,hash:'#day70'});await f.flush();assert.equal(f.nodes.get('submitDay').disabled,false);assert.doesNotMatch(f.nodes.get('dayNotice').textContent,/后续课程预览/);assert.match(f.nodes.get('completedDays').innerHTML,/^0 /);
 const invalid=fixture({corruptPlacement:true,hash:'#day57'});await invalid.flush();assert.equal(invalid.nodes.get('submitDay').disabled,true);assert.match(invalid.nodes.get('storageMessage').textContent,/入学测评起点尚未核实/);assert.equal(invalid.raw.get(Placement.KEY),'isolated damaged placement data');
});

test('route week 12 with no real work cannot submit and never requires fabricated old week 8 manual scores',async()=>{
 const f=fixture({state:Store.newState('2026-10-25'),now:'2026-11-21T12:00:00.000Z'});await f.flush();assert.equal(f.context.location.hash,'day84');assert.equal(f.nodes.get('submitDay').disabled,false);f.nodes.get('tasksForm').fire('submit');assert.match(f.nodes.get('dayResult').textContent,/还有任务未达到要求/);assert.equal(f.state().days['84'],undefined);assert.match(f.nodes.get('dayNotice').textContent,/阶段关卡待验证/);assert.doesNotMatch(f.nodes.get('dayNotice').textContent,/第 8 周.*尚未/);assert.equal(f.nodes.get('nextCheckpoint').textContent,'第 12 周');
});

test('complete core submission alone cannot mark a modern checkpoint complete until the independent A and delayed B gate passes',async()=>{
 const f=fixture({state:Store.newState('2026-10-25'),now:'2026-11-21T12:00:00.000Z',coreComplete:true});await f.flush();f.nodes.get('tasksForm').fire('submit');assert.match(f.nodes.get('dayResult').textContent,/阶段关卡仍待验证/);assert.equal(f.state().days['84'],undefined);assert.match(f.nodes.get('completedDays').innerHTML,/^0 /);
 f.setGatePass(true);await f.flush();f.nodes.get('tasksForm').fire('submit');assert.ok(f.state().days['84'].completedAt);assert.equal(f.state().assessments.length,0,'modern gate evidence does not fabricate a legacy manual score');assert.match(f.nodes.get('completedDays').innerHTML,/^1 /);assert.equal(f.nodes.get('nextCheckpoint').textContent,'第 16 周');assert.doesNotMatch(f.nodes.get('dayNotice').textContent,/阶段关卡待验证/);
});

test('legacy checkpoints retain their original manual evidence rule',async()=>{
 const state=Store.newState('2026-10-01');state.days['84']={planVersion:Core.LEGACY_PLAN_VERSION,tasks:{}};const f=fixture({state,now:'2027-01-01T12:00:00.000Z',hash:'#day84',coreComplete:true,placement:false});await f.flush();f.nodes.get('tasksForm').fire('submit');assert.match(f.nodes.get('dayResult').textContent,/旧版阶段测评记录/);assert.equal(f.state().days['84'].completedAt,undefined);
});

test('a gate A original links to the matching B retest with its original course day and parent rather than restarting A',async()=>{
 const material=Curriculum.materials.find(item=>item.id==='gate-12-A-listening'),record={id:'gate-a-original-fixture',materialId:material.id,title:material.title,source:'course-player',taskId:'listening',skill:'listening',dayNumber:84,answer:'{"schema":1,"courseDay":84,"answers":{}}',submittedAt:'2026-10-20T00:00:00.000Z',createdAt:'2026-10-20T00:00:00.000Z',version:1,minutes:1,quantity:16,unit:'题',assistance:{},evaluation:{result:'revise',method:'objective'},kind:'original',media:[],history:[],learningStatus:{label:'待复测',dueAt:'2026-10-22T00:00:00.000Z',until:'2026-11-20T00:00:00.000Z'}},summaries={84:{totalRecords:1,minutes:1,records:[record],tasks:{listening:{count:1,minutes:1,quantities:{'题':16},records:[record]}}}};
 const f=fixture({hash:'#day84',records:[record],summaries});await f.flush();const links=[...f.nodes.get('linkedEvidence').innerHTML.matchAll(/href="([^"]+)"[^>]*>([^<]+)<\/a>/g)],link=links.find(item=>item[2]==='进入对应 B 卷延迟复测');assert.ok(link);const url=new URL(link[1].replace(/&amp;/g,'&'),'http://isolated.test/');assert.equal(url.searchParams.get('material'),'gate-12-B-listening');assert.equal(url.searchParams.get('parent'),record.id);assert.equal(url.searchParams.get('day'),'84');assert.equal(url.searchParams.get('kind'),'retest');assert.equal(url.searchParams.get('mode'),'assessment');assert.equal(url.searchParams.get('preview'),'1');assert.equal(f.nodes.get('submitDay').disabled,false);
});
