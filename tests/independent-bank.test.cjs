'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const data=require('../assets/curriculum-data.js'),Bank=require('../assets/independent-bank.js'),Player=require('../assets/course-player.js'),Assessment=require('../assets/assessment-core.js');
const {audit}=require('../tools/audit-independent-bank.cjs'),Lexical=require('../tools/lexical-contexts.cjs');
const independent=data.materials.filter(m=>m.independentBank);

test('independent sources, audio and seven complete figures have declared provenance and stay outside core days',()=>{
 const report=audit(independent,{courseData:data,lexical:Lexical.build()});assert.deepEqual(report.errors,[]);assert.equal(report.status,'complete');assert.equal(report.sourceCount,independent.filter(m=>['reading','listening'].includes(m.skill)).length);assert.equal(report.questions,independent.reduce((n,m)=>n+m.questions.length,0));assert.deepEqual(report.voiceKinds,{synthetic:16,human:8});assert.equal(report.humanReaders,5);assert.deepEqual(report.syntheticLocales,{'en-GB':4,'en-US':4,'en-AU':4,'en-IN':4});assert.equal(report.figureTypes.length,7);
 for(const m of independent)for(const q of m.questions){assert.equal(Assessment.gradeQuestion(q,q.answers[0]).correct,true,m.id+'/'+q.id);assert.equal(Assessment.gradeQuestion(q,'unsupported-answer').correct,false,m.id+'/'+q.id);}
 assert.ok(data.days.every(d=>d.tasks.every(t=>t.materialIds.every(id=>!id.startsWith('independent-')))));
});

test('audit rejects changed source evidence and accidental scheduling of an independent source',()=>{
 const changed=structuredClone(independent);changed[0].questions[0].evidence='A claim absent from the original text.';const report=audit(changed,{requireAudio:false});assert.ok(report.errors.some(e=>e.includes('evidence not verbatim')));assert.ok(report.errors.some(e=>e.includes('Content hash')));
 const poisoned={...data,days:[{tasks:[{materialIds:[independent[0].id]}]}]};assert.ok(audit(independent,{requireAudio:false,courseData:poisoned}).errors.some(e=>e.includes('scheduled in core')));
});

test('all 70 previously uncovered words have source sentences, applied questions and scheduled live training',()=>{
 const {materials,assignments}=Lexical.build(),map=new Map(materials.map(m=>[m.id,m]));assert.equal(assignments.flatMap(a=>a.words).length,70);assert.equal(new Set(assignments.flatMap(a=>a.words)).size,70);assert.equal(data.audit.lexicalCoverage.scheduledLexemes,1686);assert.equal(data.audit.lexicalCoverage.uncoveredCount,0);
 for(const a of assignments){assert.ok(a.words.length<=4);const pack=map.get(a.packId),context=map.get(a.contextId),day=data.days.find(d=>d.tasks.some(t=>t.materialIds.includes(a.packId)));assert.ok(day);assert.ok(day.week>=a.week);assert.ok(day.tasks.find(t=>t.id==='grammar').materialIds.includes(a.contextId));assert.ok(day.tasks.find(t=>t.id==='vocabulary').quantity<=12);assert.equal(context.questions.length,pack.vocabulary.length);for(const v of pack.vocabulary){assert.ok(v.ipa&&v.sourceQuote&&context.contextPassage.includes(v.sourceQuote));assert.ok(context.questions.some(q=>q.answers[0]===v.word&&q.evidence!==v.example));}}
});

test('catalogue allowlist exposes metadata only and preserves seen status from exposure or submitted works',()=>{
 const first=independent[0],second=independent[1],state=Player.newState();state.exposures[first.id]={firstSeenAt:'2026-10-24T00:00:00.000Z',lastSeenAt:'2026-10-24T00:00:00.000Z',count:1,assisted:true};const items=Bank.catalog(data,state.exposures,[{materialId:second.id,assistance:{hint:false,answer:false,ai:false}}]);assert.equal(items.length,independent.length);assert.equal(items.find(m=>m.id===first.id).exposure,'seen');assert.equal(items.find(m=>m.id===first.id).assisted,true);assert.equal(items.find(m=>m.id===second.id).exposure,'seen');
 for(const item of items)for(const secret of ['passage','transcript','prompt','figure','questions','audio','vocabulary','answers'])assert.equal(Object.hasOwn(item,secret),false);
 assert.equal(Bank.filter(items,{level:'A2',skill:'listening',locale:'en-IN',exposure:'unseen'}).length,1);assert.match(Bank.href(items[0],true),/^今日学习.html\?bank=1&material=independent-.*&preview=1$/);assert.throws(()=>Bank.href({id:'../../bad'}));
});

function mockDOM(){
 const ids=new Map(),events=new Map();let writes=0;
 class Element{constructor(tag){this.tagName=tag;this.children=[];this.listeners=new Map();this.textContent='';this.value='';}append(...children){this.children.push(...children);}replaceChildren(...children){this.children=[...children];}addEventListener(type,fn){this.listeners.set(type,fn);}getAttribute(key){return this[key]||null;}set innerHTML(_){throw Error('Unsafe raw HTML');}}
 const navLinks=[Object.assign(new Element('a'),{href:'今日学习.html'}),Object.assign(new Element('a'),{href:'课程覆盖.html'}),Object.assign(new Element('a'),{href:'curriculum/independent-bank/sources.json'})];
 const doc={readyState:'loading',createElement:tag=>new Element(tag),getElementById:id=>{if(!ids.has(id))ids.set(id,new Element(id.startsWith('bank')?'div':'main'));return ids.get(id);},querySelectorAll:()=>navLinks,addEventListener(){}};
 const host={document:doc,location:{search:'?preview=1'},URLSearchParams,IELTSCurriculumData:data,IELTSCoursePlayer:Player,IELTSRecords:{list:async()=>[]},IELTSProfiles:{assertFresh(){},storage:()=>({getItem:()=>null,setItem(){writes++;throw Error('Catalogue must not write');}})},addEventListener:(type,fn)=>events.set(type,fn)};
 return{ids,events,host,navLinks,writes:()=>writes};
}
test('catalogue boots in an isolated DOM without revealing audio/text or writing exposure',async()=>{
 const env=mockDOM(),context=vm.createContext(env.host);vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/independent-bank.js'),'utf8'),context);await context.IELTSIndependentBank.mount(env.host);assert.equal(env.ids.get('bankMaterials').children.length,independent.length);assert.equal(env.writes(),0);assert.ok(env.navLinks.every(a=>a.href.includes('preview=1')));const text=JSON.stringify(env.ids.get('bankMaterials').children);assert.equal(text.includes('My name is Mina'),false);assert.equal(text.includes('audio/independent-bank/'),false);assert.equal(text.includes('audio/human-listening/'),false);
 env.ids.get('bankLevel').value='A2';env.ids.get('bankSkill').value='listening';env.ids.get('bankLocale').value='en-IN';env.ids.get('bankLocale').listeners.get('change')();assert.equal(env.ids.get('bankMaterials').children.length,1);env.events.get('ielts:profile-changed')();assert.equal(env.ids.get('bankMaterials').children.length,0);assert.match(env.ids.get('bankStatus').textContent,/档案已切换/);assert.equal(env.writes(),0);
});

test('a malformed existing course state blocks catalogue status instead of resetting records',async()=>{
 const env=mockDOM();env.host.IELTSProfiles.storage=()=>({getItem:()=>'{malformed',setItem(){throw Error('Must not reset');}});const result=await Bank.mount(env.host);assert.equal(result.items().length,0);assert.match(env.ids.get('bankStatus').textContent,/暂未打开/);assert.equal(env.writes(),0);
});
