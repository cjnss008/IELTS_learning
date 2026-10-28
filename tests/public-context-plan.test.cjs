'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const A=require('../assets/assessment-core.js'),P=require('../assets/course-player.js'),C=require('../assets/public-context-practice.js'),Core=require('../assets/daily-plan-core.js'),Adaptive=require('../assets/adaptive-plan.js'),Engine=require('../assets/public-course-planner.js'),D=require('./published-public-baseline-fixture.cjs')(require('../assets/curriculum-data.js')),catalog=require('../assets/public-context-practice-data.js');
require('../assets/daily-plan-content.js');
const content=global.IELTSPlanContent,copy=v=>JSON.parse(JSON.stringify(v)),T=Date.parse('2026-10-26T12:00:00.000Z'),asset=name=>path.join(__dirname,'../assets',name);
const helperFile=path.join(__dirname,'public-context-practice.test.cjs'),helperRaw=fs.readFileSync(helperFile,'utf8'),helper={exports:{}};
new Function('require','__dirname','module',helperRaw.slice(0,helperRaw.indexOf('\ntest('))+'\nmodule.exports={record};')(createRequire(helperFile),__dirname,helper);
function fixture(){
 const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)},records=catalog.packs.map((pack,index)=>{const a=D.publicCoursePlan.assignments.find(a=>a.sourceId===pack.sourceId),m=D.materials.find(m=>m.id===a.materialId);return helper.exports.record(m,a.day,T-(7-index)*86400000);});
 const options={data:D,storage,profileId:'synthetic-context-plan',now:()=>T,publicCoursePlanner:Engine,synchronousPublicCourse:true,placement:{currentRoute:()=>({startDay:2,startWeek:1,skills:{reading:{verified:true,level:'A1'},listening:{verified:true,level:'A1'}}})},contextPractice:C,contextPracticeCatalog:catalog};
 const store=Adaptive.createStore(options);store.adoptStarted({records,drafts:[]});return{store,map,storage,records,options};
}
function build(store,day,extra={}){return Core.buildDay(day,content,{curriculum:D,adaptivePlan:store,contextPractice:C,...extra});}

test('all actual 365-day task contracts resolve semantic additions without changing the base curriculum or planner hash',()=>{
 const before=A.materialContentHash({days:D.days,materials:D.materials,publicCoursePlan:D.publicCoursePlan}),f=fixture(),recordBytes=JSON.stringify(f.records),assignments=f.store.publicContextState().assignments;assert.equal(assignments.length,3);
 const plans=D.days.map(day=>build(f.store,day.day));assert.equal(plans.length,365);
 for(const plan of plans){const source=f.store.getDay(D.days[plan.dayNumber-1]);assert.equal(plan.totalMinutes,360);assert.equal(plan.tasks.reduce((n,t)=>n+t.minutes,0),360);assert.deepEqual(plan.tasks.map(t=>t.materialIds),source.tasks.map(t=>t.materialIds));for(const task of plan.tasks)assert.deepEqual(task.materials.map(m=>m.id),task.materialIds);}
 for(const a of assignments){const plan=plans[a.day-1],task=plan.tasks.find(t=>t.id==='grammar'),link=task.materials.find(m=>m.id===a.materialId),m=C.resolveMaterial(a.materialId,{data:D});assert.ok(link);assert.equal(link.title,m.title);assert.equal(new URL(link.url,'http://isolated.test/').searchParams.get('material'),a.materialId);assert.equal(task.contextPracticeAssignments[0].assignmentId,a.assignmentId);assert.ok(a.day>=2&&a.day<365&&a.budget.totalMinutes<=360);assert.equal(a.independentEvidence,false);}
 for(const day of[1,365])assert.equal(plans[day-1].tasks.some(t=>t.materialIds.some(id=>id.startsWith(C.PREFIX))),false);
 assert.equal(JSON.stringify(f.records),recordBytes);assert.equal(A.materialContentHash({days:D.days,materials:D.materials,publicCoursePlan:D.publicCoursePlan}),before);assert.ok(!D.materials.some(m=>m.id.startsWith(C.PREFIX)));
});

test('dynamic material resolution is explicit in Node, late-bound in a browser and still rejects unknown or mismatched IDs',()=>{
 const f=fixture(),a=f.store.publicContextState().assignments[0],day=a.day;
 assert.throws(()=>Core.buildDay(day,content,{curriculum:D,adaptivePlan:f.store}),/材料不存在/);
 assert.throws(()=>build(f.store,day,{contextPractice:null}),/材料不存在/);
 const unknown={getDay(base){const changed=copy(base);changed.tasks.find(t=>t.id==='grammar').materialIds.push('context-grammar:unknown:1:study');return changed;}};
 assert.throws(()=>build(unknown,day),/材料不存在/);
 assert.throws(()=>build(unknown,day,{contextPractice:{resolveMaterial:()=>({id:'wrong-id',title:'Must not render'})}}),/材料不存在/);
 const calls=[],resolver={resolveMaterial(id,options){calls.push(id);assert.equal(options.data,D);return C.resolveMaterial(id,options);}};build(f.store,day,{contextPractice:resolver});assert.deepEqual(calls,[a.materialId]);
 const context={document:{},IELTSCurriculumData:D,IELTSAdaptivePlan:f.store};vm.runInNewContext(fs.readFileSync(asset('daily-plan-core.js'),'utf8'),context);
 assert.throws(()=>context.IELTSPlanCore.buildDay(day,content),/材料不存在/);context.IELTSPublicContextPractice=C;assert.ok(context.IELTSPlanCore.buildDay(day,content).tasks.find(t=>t.id==='grammar').materials.some(m=>m.id===a.materialId));assert.throws(()=>context.IELTSPlanCore.buildDay(day,content,{contextPractice:null}),/材料不存在/);
});

test('a real semantic draft freezes its original owner, day contract and randomized material across reload and later scheduling',()=>{
 const f=fixture(),a=f.store.publicContextState().assignments[0],day=f.store.getDay(D.days[a.day-1]),material=C.resolveMaterial(a.materialId,{data:D}),binding=P.freezeMaterialBinding(material,{assessment:A,attemptId:'fixed-context-draft'}),dayBinding=P.freezeDayPlanBinding(day,A);
 const draft={id:'fixed-context-draft',materialId:material.id,taskId:'grammar',courseDay:a.day,mode:'practice',kind:'original',parentId:null,startedAt:new Date(T).toISOString(),activeSeconds:17,activityByDate:{},exposureAtStart:'seen',answers:{s1:binding.material.questions[0].options[1]},userEvidence:{},text:'',transcript:'',audioAvailable:false,audioCompleted:false,transcriptViewed:false,interrupted:false,assistance:{hint:false,answer:false,ai:false},media:[],materialBinding:binding,dayPlanBinding:dayBinding,contextPracticeAssignment:{...copy(a),bindingContentHash:binding.contentHash}};
 const state=P.newState();state.day=a.day;state.drafts[draft.id]=draft;const bytes=JSON.stringify(state),parsed=P.parseState(bytes);assert.equal(JSON.stringify(parsed),bytes);
 const reloaded=Adaptive.createStore(f.options);reloaded.adoptStarted({records:f.records,drafts:Object.values(parsed.drafts)});const frozen=reloaded.getDay(D.days[a.day-1]);assert.deepEqual(frozen,day);assert.equal(A.materialContentHash(frozen),dayBinding.contentHash);assert.deepEqual(build(reloaded,a.day).tasks.find(t=>t.id==='grammar').materialIds,day.tasks.find(t=>t.id==='grammar').materialIds);assert.equal(reloaded.publicContextState().assignments.some(next=>next.materialId===a.materialId),false);assert.ok(reloaded.publicContextState().retained.some(next=>next.assignmentId===a.assignmentId));assert.equal(JSON.stringify(P.parseState(bytes)),bytes);
});

const pageHelper=path.join(__dirname,'daily-plan-materials-dom.test.cjs'),pageRaw=fs.readFileSync(pageHelper,'utf8'),pageModule={exports:{}};
const pagePrefix=pageRaw.slice(0,pageRaw.indexOf('\ntest(')).replace('function fixture() {','function fixture(options={}) {').replace("list: async () => [],","list: async () => options.records || [],").replace("hash: '#day1'","hash: options.hash || '#day1'").replace("  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/daily-plan-app.js'), 'utf8'), context);","  if(options.beforeRun)options.beforeRun({context,nodes,storage});\n  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/daily-plan-app.js'), 'utf8'), context);").replace('return { nodes, selectWeek:', 'return { context, storage, nodes, selectWeek:');
new Function('require','__dirname','module',pagePrefix+'\nmodule.exports={fixture};')(createRequire(pageHelper),__dirname,pageModule);
test('the actual daily-plan page renders the dynamic grammar link after real source evidence refresh',async()=>{
 const f=fixture(),a=f.store.publicContextState().assignments[0],recordBytes=JSON.stringify(f.records);let store;
 const page=pageModule.exports.fixture({records:f.records,hash:'#day'+a.day,beforeRun({context}){
  context.Date=class extends Date{constructor(...args){super(...(args.length?args:[T]));}static now(){return T;}};
  context.IELTSCoursePlayer=P;context.IELTSPlacement=f.options.placement;
  for(const file of['assessment-core.js','public-context-practice-data.js','public-context-practice.js','course-expansion.js','public-course-planner.js','public-material-selector.js','public-material-practice.js','adaptive-plan.js','daily-plan-core.js','daily-plan-state.js'])vm.runInNewContext(fs.readFileSync(asset(file),'utf8'),context);
  store=context.IELTSAdaptivePlan.createStore({...f.options,contextPractice:context.IELTSPublicContextPractice});context.IELTSAdaptivePlan={...context.IELTSAdaptivePlan,...store};
 }});
 await new Promise(resolve=>setImmediate(resolve));const html=page.nodes.get('taskList').innerHTML,m=C.resolveMaterial(a.materialId,{data:D});assert.ok(html.includes(m.title));assert.ok(html.includes(encodeURIComponent(a.materialId)));assert.equal(page.nodes.get('dayMinutes').textContent,360);assert.doesNotMatch(page.nodes.get('evidenceStatus').textContent,/无法核实/);assert.equal(page.context.location.hash,'day'+a.day);assert.ok(store.publicContextState().assignments.some(item=>item.assignmentId===a.assignmentId));assert.equal(JSON.stringify(f.records),recordBytes);
});

test('both course and daily-plan entry pages load the reviewed runtime behind the profile barrier before their consumers',()=>{
 const Bootstrap=require('../assets/user-data-bootstrap.js');for(const page of['今日学习.html','每日学习计划.html']){
  const html=fs.readFileSync(path.join(__dirname,'..',page),'utf8'),tags=[...html.matchAll(/<script\b[^>]*>/g)].map(m=>m[0]),pending=tags.filter(tag=>tag.includes('data-ielts-script="1"')).map(tag=>({tag,hasAttribute:name=>new RegExp('(?:^|\\s)'+name+'(?:[=\\s>])').test(tag),getAttribute:name=>new RegExp('(?:^|\\s)'+name+'="([^"]*)"').exec(tag)?.[1]||null})),scripts=Bootstrap.executionOrder(pending).map(tag=>tag.getAttribute('data-src'));
  for(const name of['public-context-practice-data.js','public-context-practice.js']){const src='assets/'+name;assert.equal(scripts.filter(s=>s===src).length,1,page+': '+name);assert.ok(tags.find(tag=>tag.includes('data-src="'+src+'"')).includes('type="application/x-ielts-pending"'));}
  const runtime=scripts.indexOf('assets/public-context-practice.js');assert.ok(scripts.indexOf('assets/assessment-core.js')<runtime);assert.ok(scripts.indexOf('assets/curriculum-data.js')<runtime);assert.ok(scripts.indexOf('assets/public-context-practice-data.js')<runtime);for(const consumer of['adaptive-plan.js','daily-plan-core.js','daily-learning-load.js','course-player.js','today-hub.js'])if(scripts.includes('assets/'+consumer))assert.ok(runtime<scripts.indexOf('assets/'+consumer),page+': '+consumer);
 }
});
