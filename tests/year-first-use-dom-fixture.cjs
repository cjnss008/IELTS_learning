const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const A=require('../assets/assessment-core.js'),Records=require('../assets/learning-records.js');
// Explicit proof hook for synthetic legacy workflow fixtures. Real migration
// proof is exercised separately against the published-history index.
const uniqueLegacyFixture={...A,proveLegacyMaterial:(draft,material)=>material?A.proveLegacyMaterial(draft,material,A.createLegacyMaterialCompatibilityIndex([{kind:'git',revision:'synthetic-published',materials:[material]},{kind:'current',revision:'synthetic-current',materials:[material]}],{evidenceScope:'Synthetic unique published fixture'})):{compatible:false,reason:'No original fixture'}};

// DOM contract smoke test. Browser layout/audio permissions are checked separately.
class Element {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.style={};this.listeners={};this.attributes={};this.className='';this.value='';this.hidden=false;this.disabled=false;this.checked=false;this._text='';this.classList={toggle:()=>{},add:()=>{},remove:()=>{}};}
  set textContent(value){this._text=String(value);this.children=[];}get textContent(){return this._text+this.children.map(n=>n.textContent||'').join('');}
  append(...children){children.forEach(n=>{if(typeof n==='string'){const t=new Element('span');t.textContent=n;n=t;}n.parentElement=this;this.children.push(n);});}
  prepend(...children){children.reverse().forEach(n=>{n.parentElement=this;this.children.unshift(n);});}
  scrollIntoView(){}
  replaceChildren(...children){this.children=[];this._text='';this.append(...children);}
  removeAttribute(key){delete this.attributes[key];}
  setAttribute(key,value){this.attributes[key]=value;}getAttribute(key){return this.attributes[key];}
  addEventListener(name,fn){(this.listeners[name]||=[]).push(fn);}async fire(name){for(const fn of this.listeners[name]||[])await fn({target:this,preventDefault(){}});if(name==='click'&&this.onclick)await this.onclick();}
  all(){return this.children.flatMap(n=>[n,...n.all()]);}
  querySelectorAll(selector){return selector.split(',').flatMap(part=>{part=part.trim();return this.all().filter(n=>part==='input:checked'?n.tagName==='INPUT'&&n.checked:part.startsWith('.')?n.className.split(' ').includes(part.slice(1)):n.tagName===part.toUpperCase());});}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
function fixture(overrides={},options={}){
  let clock=Date.parse('2026-10-24T12:00:00.000Z');class Clock extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
  const html=fs.readFileSync(path.join(__dirname,'../今日学习.html'),'utf8'),nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
  nodes.get('courseReadingWorkspace').append(nodes.get('coursePassagePane'),nodes.get('courseQuestionsPane'));
  nodes.get('coursePassagePane').append(nodes.get('coursePassageHeading'),nodes.get('coursePassage'));
  nodes.get('courseQuestionsPane').append(nodes.get('courseQuestionsHeading'),nodes.get('courseQuestions'));
  const doc={hidden:false,getElementById:id=>nodes.get(id)||null,createElement:tag=>new Element(tag),createElementNS:(ns,tag)=>new Element(tag),addEventListener(){},querySelectorAll(selector){return selector.split(',').flatMap(part=>{const [id,descendant]=part.trim().split(' ');if(id.startsWith('#'))return descendant?nodes.get(id.slice(1))?.querySelectorAll(descendant)||[]:[nodes.get(id.slice(1))].filter(Boolean);return [...nodes.values()].flatMap(n=>n.querySelectorAll(part));});}};
  const mat={id:'reading-one',version:'1',skill:'reading',title:'A simple reading',type:'practice',week:1,level:'A0',pool:'training',estimatedMinutes:10,passage:'Lin has a red bag.',instructions:'Read and choose.',questions:[{id:'q1',type:'single',prompt:'What colour is the bag?',options:['red','blue'],answers:['red'],explanation:'The text says red.',evidence:'a red bag'}],source:{kind:'original',rights:'原创',verification:'reviewed'}};
  const tasks=['vocabulary','grammar','listening','reading','speaking','writing','reflection'].map(id=>({id,skill:id,minutes:id==='reading'?60:50,quantity:10,unit:'题',materialIds:[mat.id],mode:options.taskMode||'practice',instructions:'Practice carefully.',deliverable:'Your own answer'}));
  Object.assign(mat,overrides);const data={version:'1',weeks:[{week:1,title:'Start',level:'A0',prerequisites:[]}],materials:[mat,...(options.extraMaterials||[])],days:Array.from({length:364},(_,i)=>({day:i+1,week:1,tasks}))};
  if(options.setup)options.setup(data,mat,tasks);
  const map=options.storage||new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)},events={},timers=[];let saved=options.seedRecords||Records.newState(),id=0;
  const api={currentDay:()=>1,makeId:prefix=>prefix+'-'+(++id),list:async()=>saved.records,record:async input=>{const result=Records.put(saved,JSON.parse(JSON.stringify(options.recordTransform?options.recordTransform(input):input)),new Date(clock).toISOString());saved=result.state;return result;},update:async()=>{throw Error('not part of this test');}};
  const win={document:doc,IELTSAssessment:A,...(options.queue?{IELTSDailyLearningLoad:require('../assets/daily-learning-load.js')}:{}),IELTSTodayHub:require('../assets/today-hub.js'),IELTSOralPractice:options.oral||require('../assets/oral-practice.js'),IELTSRecords:api,IELTSCurriculumData:data,IELTSProfiles:{current:()=>({id:'legacy'}),storage:()=>storage},location:{search:options.search||'?day=1',origin:'file://'},addEventListener:(name,fn)=>(events[name]||=[]).push(fn),dispatchEvent:event=>(events[event.type]||[]).forEach(fn=>fn(event)),navigator:{},...options.window};
  const context={window:win,globalThis:win,Date:Clock,Blob,MediaRecorder:options.window?.MediaRecorder,URLSearchParams,URL,Map,Set,AbortController,CustomEvent:class{constructor(type,init={}){this.type=type;this.detail=init.detail;}},setInterval:fn=>(timers.push(fn),timers.length),clearInterval(){},setTimeout:()=>1,clearTimeout(){},console,TextEncoder,TextDecoder,crypto:require('node:crypto').webcrypto};if(options.beforePlayer)options.beforePlayer(win,context);vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/course-player.js'),'utf8'),context);
  return{win,nodes,map,timers,advance:ms=>{clock+=ms;timers.forEach(fn=>fn());},records:()=>saved.records,mat};
}

module.exports={fixture,Element};
