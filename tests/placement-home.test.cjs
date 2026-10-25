'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
class Element{constructor(tag){this.tagName=tag.toUpperCase();this.textContent='';this.children=[];this.events={};this.disabled=false;}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}addEventListener(name,fn){(this.events[name]||=[]).push(fn);}async fire(name){for(const fn of this.events[name]||[])await fn();}}
function fixture({sessions=[],adopted=null,route=null,preview=false,verification={state:'failed',reason:'本机测评来源尚未核实，请重试。'}}={}){
 const box=new Element('section'),events={},state={sessions,adopted},before=JSON.stringify(state);let reloads=0,requests=0;
 const root={document:{getElementById:()=>box,createElement:tag=>new Element(tag)},IELTSPlacement:{compareSessions:require('../assets/placement-core.js').compareSessions,load:()=>structuredClone(state),currentRoute:()=>route,verificationStatus:()=>verification,verifyAdopted:async()=>{requests++;return{ok:false,...verification};}},IELTSProfiles:{isPreview:()=>preview},location:{reload:()=>reloads++},addEventListener:(name,fn)=>(events[name]||=[]).push(fn)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/placement-home.js'),'utf8'),{globalThis:root,URLSearchParams});return{box,root,state,before,entry:()=>box.children.find(e=>e.tagName==='A'&&e.href.startsWith('入学测评.html')),copy:()=>box.children.map(e=>e.textContent).join('\n'),reloads:()=>reloads,requests:()=>requests,refresh:()=>events['ielts:placement-changed'].forEach(fn=>fn())};
}
const session=(id,date,status='draft')=>({id,createdAt:date,status});
const old=session('placement-old-0001','2026-10-01T00:00:00.000Z','complete'),recent=session('placement-new-0002','2026-10-25T00:00:00.000Z'),route={sessionId:old.id,level:'A2',startDay:57,startWeek:9};
test('first-time home offers a fresh assessment while a saved completed result opens that exact report for adoption',()=>{
 const first=fixture();assert.equal(first.entry().textContent,'开始 AI 能力测评');assert.equal(first.entry().href,'入学测评.html');
 const result={...recent,status:'complete'},saved=fixture({sessions:[result,old]});assert.equal(saved.entry().textContent,'查看评价并选择课程起点');assert.equal(new URL(saved.entry().href,'http://127.0.0.1/').searchParams.get('session'),result.id);assert.match(saved.copy(),/能力评价已保存/);assert.equal(JSON.stringify(saved.state),saved.before);
});
test('a newer retake draft or completed result opens directly while preserving the current adopted course explanation',()=>{
 for(const status of ['draft','evaluating','complete']){const newest={...recent,status},f=fixture({sessions:[newest,old],adopted:{sessionId:old.id},route});assert.equal(new URL(f.entry().href,'http://127.0.0.1/').searchParams.get('session'),newest.id);assert.equal(f.entry().textContent,status==='complete'?'查看评价并选择课程起点':'继续已保存的能力测评');assert.match(f.copy(),/你的课程起点：A2/);assert.match(f.copy(),/第 57 课起安排/);assert.equal(JSON.stringify(f.state),f.before);}
});
test('an older unfinished draft never hijacks the adopted report, and equal-date sessions use a stable ID order',()=>{
 const abandoned=session('placement-abandoned-9999','2026-09-01T00:00:00.000Z'),f=fixture({sessions:[old,abandoned],adopted:{sessionId:old.id},route});assert.equal(new URL(f.entry().href,'http://127.0.0.1/').searchParams.get('session'),old.id);assert.equal(f.entry().textContent,'查看评价／重新测评');
 const a=session('placement-aaaa-1111',recent.createdAt),z=session('placement-zzzz-9999',recent.createdAt,'complete');for(const sessions of [[a,z],[z,a]]){const ordered=fixture({sessions});assert.equal(new URL(ordered.entry().href,'http://127.0.0.1/').searchParams.get('session'),z.id);assert.equal(ordered.entry().textContent,'查看评价并选择课程起点');}
});
test('a failed source check retains retry, backup and assessment recovery links without releasing or modifying the adopted route',async()=>{
 const f=fixture({sessions:[old],adopted:{sessionId:old.id}});assert.match(f.copy(),/课程起点暂未核验/);assert.match(f.copy(),/来源尚未核实/);assert.equal(f.entry().textContent,'查看测评／开始新测评');assert.equal(new URL(f.entry().href,'http://127.0.0.1/').searchParams.get('session'),old.id);assert.ok(f.box.children.some(e=>e.href==='备份中心.html'));const retry=f.box.children.find(e=>e.tagName==='BUTTON');await retry.fire('click');assert.equal(f.requests(),1);assert.equal(f.reloads(),0);assert.equal(JSON.stringify(f.state),f.before);assert.ok(f.entry());
});
test('preview and changed-session home links keep their exact session and isolated query parameters',()=>{
 const f=fixture({sessions:[recent],preview:true});let query=new URL(f.entry().href,'http://127.0.0.1/').searchParams;assert.equal(query.get('preview'),'1');assert.equal(query.get('session'),recent.id);f.state.sessions.push({...recent,id:'placement-later-0003',createdAt:'2026-10-26T00:00:00.000Z',status:'complete'});f.refresh();query=new URL(f.entry().href,'http://127.0.0.1/').searchParams;assert.equal(query.get('preview'),'1');assert.equal(query.get('session'),'placement-later-0003');assert.equal(f.entry().textContent,'查看评价并选择课程起点');
});

test('recovering an older server task set today never makes it a newer retake than the currently adopted assessment',()=>{
 const adopted={...old,assessment:{id:old.id,createdAt:'2026-10-20T00:00:00.000Z'}},recovered={...recent,id:'placement-recovered-older',createdAt:'2026-11-01T00:00:00.000Z',assessment:{id:'placement-recovered-older',createdAt:'2026-10-01T00:00:00.000Z'}},f=fixture({sessions:[adopted,recovered],adopted:{sessionId:old.id},route});assert.equal(new URL(f.entry().href,'http://127.0.0.1/').searchParams.get('session'),old.id);assert.equal(f.entry().textContent,'查看评价／重新测评');assert.equal(JSON.stringify(f.state),f.before);
});

test('recovering multiple task sets in newest-first order still opens the newest server issue time, including legacy-date fallback',()=>{
 const newest={...recent,id:'placement-recovered-newest',createdAt:'2026-11-01T00:00:00.000Z',assessment:{id:'placement-recovered-newest',createdAt:'2026-10-25T00:00:00.000Z'}},older={...recent,id:'placement-recovered-older',createdAt:'2026-11-01T00:00:00.001Z',assessment:{id:'placement-recovered-older',createdAt:'2026-10-24T00:00:00.000Z'}},f=fixture({sessions:[newest,older,old]});assert.equal(new URL(f.entry().href,'http://127.0.0.1/').searchParams.get('session'),newest.id);assert.equal(JSON.stringify(f.state),f.before);const legacy={...recent,assessment:{id:recent.id,createdAt:'legacy-invalid-date'}},fallback=fixture({sessions:[old,legacy]});assert.equal(new URL(fallback.entry().href,'http://127.0.0.1/').searchParams.get('session'),legacy.id);
});
