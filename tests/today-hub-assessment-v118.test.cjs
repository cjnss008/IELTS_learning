'use strict';
// UI contract test against public, root-reviewed build data. Queue and learner
// state are synthetic; no browser profile, audio or service is accessed.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=require('../../v118-linked-build-output/assets/curriculum-data.js'),P=require('../assets/course-player.js'),V=require('../assets/vocabulary-practice.js'),A=require('../assets/assessment-core.js');
class Node {constructor(tag='div'){this.tagName=tag;this.children=[];this._text='';this.dataset={};this.listeners={};this.hidden=false;this.disabled=false;}set textContent(v){this._text=String(v);this.children=[];}get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}append(...nodes){for(const node of nodes)this.children.push(node);}replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}setAttribute(){}addEventListener(name,fn){this.listeners[name]=fn;}querySelectorAll(){return[];}}
async function render({number,queue,projected=false}){
 const data=JSON.parse(JSON.stringify(source)),raw=data.days.find(d=>d.day===number),unit=data.familyLessonRelease.units.find(u=>u.day===number);
 const day=JSON.parse(JSON.stringify(raw));if(projected)day.familyLessonExpansion={unitId:unit.id};else day.familyAfterCore={schema:1};
 const ids=['todayOverview','todayEyebrow','todayTitle','todayGoal','todayDone','todayMinutes','todayMistakes','todayStart','todayNext','todayAdvice','todayRoute','todayQueueSummary','todayLearningQueue','todayEssentialVocabulary'],nodes=new Map(ids.map(id=>[id,new Node()]));
 const document={hidden:false,getElementById:id=>nodes.get(id)||null,createElement:tag=>new Node(tag),addEventListener(){},querySelectorAll(){return[];}},records=[];
 const navigation={current:()=>({day:number,taskId:'vocabulary',materialId:raw.tasks.find(t=>t.id==='vocabulary').materialIds[0]}),drafts:()=>[],allDrafts:()=>[],budget:()=>({spentMinutes:0,remainingMinutes:360}),learningQueue:()=>queue};
 const win={document,IELTSCurriculumData:data,IELTSCoursePlayer:P,IELTSVocabularyPractice:V,IELTSAssessment:A,IELTSTodayNavigation:navigation,IELTSRecords:{list:async()=>records},IELTSAdaptivePlan:{getDay:()=>day},IELTSProfiles:{storage:()=>({getItem:()=>null})},IELTSMistakes:{forDay:()=>({completionValid:false,remaining:0})},location:{search:''},addEventListener(){}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/today-hub.js'),'utf8'),{window:win,URLSearchParams,URL,Date,Map,Set,console});for(let i=0;i<3;i++)await new Promise(resolve=>setImmediate(resolve));return{nodes,unit,day,data};
}
const budget={remainingMinutes:360};
test('actual day 28 frozen assessment shows its native eight-word task before core completion',async()=>{
 const next={day:28,taskId:'vocabulary',kind:'material',materialId:'w04-read-1-vocabulary',label:'继续原词汇',reason:'已有原稿保留。'},f=await render({number:28,queue:{budget,entries:[next],next}}),route=f.nodes.get('todayRoute').textContent;
 assert.match(route,/1组 \/ 8个词项/);assert.match(f.nodes.get('todayNext').textContent,/当前词汇任务共 1 组 \/ 8 个词项/);assert.doesNotMatch(f.nodes.get('todayGoal').textContent,/关联补充|30 个/);assert.notEqual(f.nodes.get('todayTitle').textContent,'第 28 课：'+f.data.materials.find(m=>m.id===f.unit.tasks.find(t=>t.id==='reading').materialRefs[0].materialId).title);
});
test('day 28 linked continuation is separately labelled and does not replace the original task count',async()=>{
 const next={day:28,taskId:'vocabulary',kind:'essential-vocabulary',familyVocabularyContinuation:true,label:'继续关联补充',reason:'先复习到期词。'},f=await render({number:28,queue:{budget,entries:[next],next,currentComplete:true}});
 assert.match(f.nodes.get('todayGoal').textContent,/关联补充词汇目标 30 个词项（素材 5 组）/);assert.match(f.nodes.get('todayRoute').textContent,/1组 \/ 8个词项/);assert.doesNotMatch(f.nodes.get('todayNext').textContent,/当前词汇任务共/);
});
test('historical day 2 keeps its original title; a projected day 2 uses the linked title',async()=>{
 const next={day:2,taskId:'vocabulary',kind:'material',label:'继续原词汇',reason:'原任务'},queue={budget,entries:[next],next},old=await render({number:2,queue}),projected=await render({number:2,queue,projected:true}),linked=old.data.materials.find(m=>m.id===old.unit.tasks.find(t=>t.id==='reading').materialRefs[0].materialId).title;
 assert.notEqual(old.nodes.get('todayTitle').textContent,'第 2 课：'+linked);assert.equal(projected.nodes.get('todayTitle').textContent,'第 2 课：'+linked);assert.match(projected.nodes.get('todayGoal').textContent,/原词汇任务和其他模块按实际课程分别完成/);
});
