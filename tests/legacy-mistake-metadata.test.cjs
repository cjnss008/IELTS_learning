 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Mistakes=require('../assets/mistake-book.js');
const base=path.join(__dirname,'..'),read=name=>fs.readFileSync(path.join(base,name),'utf8'),copy=value=>JSON.parse(JSON.stringify(value));
class Element {
  constructor(tag='div',doc){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.events={};this.attributes={};this.value='';this.checked=false;this.hidden=false;this.isConnected=true;this._text='';this.className='';}
  set textContent(value){this._text=String(value);this.children=[];}get textContent(){return this._text+this.children.map(item=>item.textContent).join('');}
  append(...children){children.forEach(item=>{item.parentElement=this;this.children.push(item);});}replaceChildren(...children){this._text='';this.children=[];this.append(...children);}
  setAttribute(key,value){this.attributes[key]=String(value);}addEventListener(key,fn){(this.events[key]||=[]).push(fn);}removeEventListener(key,fn){this.events[key]=(this.events[key]||[]).filter(item=>item!==fn);}
  querySelectorAll(){return [];}pause(){}remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(item=>item!==this);}
}
function environment(){
  const nodes=new Map(),captured=[],submitted=[],storage={getItem:()=>null,setItem(){}};
  const doc={hidden:false,hasFocus:()=>true,createElement:tag=>new Element(tag,doc),getElementById:id=>nodes.get(id)||null,querySelectorAll:()=>[],addEventListener(){}};
  const root={document:doc,location:{search:'?preview=1'},sessionStorage:storage,localStorage:storage,addEventListener(){},IELTSLearningBridge:{create(options){captured.push(copy(options));return{expose(){},submit(value){submitted.push(copy(value));return Promise.resolve({saved:true});}};},report(){}}};
  return{root,doc,nodes,captured,submitted,add(id,tag='div'){const item=new Element(tag,doc);nodes.set(id,item);return item;},run(name){vm.runInNewContext(read(name),{window:root,globalThis:root,location:root.location,document:doc,sessionStorage:storage,localStorage:storage,URLSearchParams,Intl,setTimeout,clearTimeout});}};
}

test('foundation and grammar bridges carry complete replayable questions including case-sensitive options',()=>{
  const f=environment();for(const id of ['foundationApp','foundationWeek','foundationStop','foundationUnit','foundationVoice','foundationPreview','foundationStorage','foundationProgress'])f.add(id);
  f.run('assets/foundation.js');assert.equal(f.captured.length,8);
  for(const options of f.captured){const q=Mistakes.question(options.mistakeQuestion);assert.equal(q.type,'single');assert.equal(q.options.length,3);assert.equal(q.answers.length,1);assert.ok(q.evidence.length>0);assert.equal(Mistakes.gradeObjective(q,q.answers[0]).status,'passed');}
  const casing=f.captured[2].mistakeQuestion;assert.equal(Mistakes.gradeObjective(casing,'i am Ben.').status,'wrong');
  const g=environment();g.run('assets/grammar-coach.js');const lesson=require('../assets/course-data.js').lessons[0],container=new Element('div',g.doc);g.root.IELTSGrammar.mount(container,lesson);assert.equal(g.captured.length,6);
  for(const options of g.captured){const q=Mistakes.question(options.mistakeQuestion);assert.equal(q.id,options.materialId);assert.equal(q.type,'single');assert.ok(lesson.grammar.some(item=>item.quote===q.evidence));assert.ok(q.explanation.length>0);}
});

test('sentence dictation carries its exact original and uses a 100% threshold',()=>{
  const f=environment();f.run('assets/dictation.js');const host=new Element('div',f.doc),slots=new Map();
  Object.defineProperty(host,'innerHTML',{set(html){for(const match of html.matchAll(/data-d="([^"]+)"/g))slots.set(match[1],new Element(match[1]==='audio'?'audio':'div',f.doc));}});host.querySelector=selector=>slots.get(selector.match(/data-d="([^"]+)"/)[1]);
  const groups=[{}, {index:1,text:'I have a red book.',start:0,voiceEnd:4,words:[{fromChar:0,toChar:1,start:0,end:.3},{fromChar:2,toChar:6,start:.4,end:1},{fromChar:7,toChar:8,start:1.1,end:1.4},{fromChar:9,toChar:12,start:1.5,end:2},{fromChar:13,toChar:18,start:2.1,end:3}]}];
  f.root.IELTSDictation.mount(host,{day:1},groups);assert.equal(f.captured.length,1);const q=Mistakes.question(f.captured[0].mistakeQuestion);assert.equal(q.type,'dictation');assert.deepEqual(q.answers,['I have a red book.']);assert.equal(q.evidence,'I have a red book.');
  slots.get('answer').value='I have red book.';slots.get('check').onclick();assert.equal(f.submitted[0].threshold,1);assert.equal(Mistakes.gradeObjective(q,'I have red book.').status,'wrong');assert.equal(Mistakes.gradeObjective(q,'i have a red book').status,'passed');
});

test('original 52-lesson objective/spelling records receive question context without polluting Records fields',async()=>{
  const html=read('开始学习.html'),slice=(a,z)=>html.slice(html.indexOf(a),html.indexOf(z,html.indexOf(a))),rows=[],contexts=[],nodes=new Map();let id=0;
  const sourceLessons=JSON.parse(html.match(/^const LESSONS=(.*);\r?$/m)[1]),lesson=sourceLessons[0];
  function el(key){if(!nodes.has(key))nodes.set(key,{value:'',textContent:'',hidden:false,checked:false,isConnected:true,addEventListener(){}});return nodes.get(key);}
  const legacy={values:{},vocab:{}};
  const root={document:{hidden:false,hasFocus:()=>true,getElementById:el,addEventListener(){}},addEventListener(){},IELTSRecords:{makeId:()=> 'legacy-test-'+(++id),list:async()=>rows,record:async(input,context)=>{assert.equal(Object.hasOwn(input,'mistakeQuestion'),false);const record={...copy(input),dayNumber:3,createdAt:input.submittedAt};rows.push(record);contexts.push(copy(context));return{record};}},LESSONS:sourceLessons,VOCAB:{1:[{word:'continent',meaning:'大洲',context:lesson.text}]},day:1,rec:()=>legacy,persist(){},norm:value=>value.trim().toLowerCase().replace(/\s+/g,' '),wordRecord:word=>legacy.vocab[word]||(legacy.vocab[word]={}),vocabStats:()=>({meaning:0,spell:0,wrong:0})};
  const context=vm.createContext(root);vm.runInContext(slice('/* main-evidence:start */','function persist()')+slice('function checkObjective()','function toggleDone()')+slice('function checkVocabSpelling()','function nextVocab()')+';let vocabRun=null;',context);
  el('p0').value='wrong';el('gq').value='wrong';vm.runInContext('checkObjective()',context);await root.IELTSMainEvidence.idle();assert.equal(rows.length,2);
  assert.deepEqual(contexts[0].question.answers,lesson.phrases[0].answers);assert.equal(contexts[0].question.prompt,lesson.phrases[0].hint);assert.equal(contexts[1].question.prompt,lesson.grammarQuiz.q);
  for(let i=0;i<rows.length;i++){const inputs=Mistakes.captureInputs(rows[i],contexts[i]);assert.equal(inputs.length,1);assert.equal(inputs[0].originalAnswer,'wrong');}
  el('vocabAnswer').value='contintent';vm.runInContext("vocabRun={mode:'spell',indices:[0],pos:0,score:0,revealed:false,answered:false};checkVocabSpelling()",context);await root.IELTSMainEvidence.idle();assert.deepEqual(contexts.at(-1).question.answers,['continent']);assert.equal(contexts.at(-1).question.type,'short');
});

test('legacy entry pages load profile then mistake book then Records and their exercise bridge',()=>{
  for(const name of ['基础入门.html','开始学习.html']){const html=read(name),scripts=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match=>match[1]);const profile=scripts.indexOf('assets/profile-store.js'),mistake=scripts.indexOf('assets/mistake-book.js'),records=scripts.indexOf('assets/learning-records.js'),bridge=scripts.indexOf('assets/learning-bridge.js');assert.ok(profile>=0 && profile<mistake && mistake<records && records<bridge,name);}
});


test('52-lesson page installs one shared tooltip with original local meanings, IPA and exact lesson examples',()=>{
  const html=read('开始学习.html'),parse=name=>JSON.parse(html.match(new RegExp('^const '+name+'=(.*);\\r?$','m'))[1]),events={},browserEvents={},Dictionary=require('../assets/word-dictionary.js');let installed;
  const root={IELTSWordDictionary:Dictionary,IELTSWordHover:{install(options){installed=options;return{hide(){}};}},document:{addEventListener:(name,fn)=>{events[name]=fn;}},addEventListener:(name,fn)=>{browserEvents[name]=fn;}};
  const context={...root,globalThis:root,window:root,document:root.document,day:1,VOCAB:parse('VOCAB'),LESSONS:parse('LESSONS'),HOVER_LEXICON:parse('HOVER_LEXICON'),HOVER_CONTEXT:parse('HOVER_CONTEXT')};
  vm.runInNewContext(html.slice(html.indexOf('// Shared lookup'),html.indexOf('function clickableParagraph')),context);events.DOMContentLoaded();
  assert.ok(installed);assert.equal(installed.materialId(),'lesson-1');const result=installed.dictionary.lookup('continent','',installed.materialId());assert.equal(result.ipa,'/ˈkɒntɪnənt/');assert.match(result.meaning,/大洲/);assert.match(result.example,/Kuang/);
  const local=installed.dictionary.lookup('quiz','After a quiz last autumn.','lesson-1');assert.ok(local.meaning.length>0);assert.ok(local.example.length>0);
  assert.ok(html.includes('assets/word-hover.css'));assert.equal((html.match(/src="assets\/word-hover.js"/g)||[]).length,1);assert.doesNotMatch(html,/tip\.id='wordMeaningTooltip'/);
});
