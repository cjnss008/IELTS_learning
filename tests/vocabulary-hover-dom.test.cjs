 'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const Dictionary = require('../assets/word-dictionary.js');
class Element {
  constructor(tag,doc) { this.nodeType=1; this.tagName=tag.toUpperCase(); this.ownerDocument=doc; this.children=[]; this.dataset={}; this.style={}; this.attributes={}; this.listeners={}; this.className=''; this.hidden=false; this.disabled=false; this.value=''; this._text=''; this.classList={add:value => { this.className+=' '+value; }}; }
  set textContent(value) { this._text=String(value); this.children=[]; } get textContent() { return this._text+this.children.map(item => item.textContent ?? item.nodeValue ?? '').join(''); }
  set innerHTML(_) { throw Error('unsafe HTML rendering'); }
  append(...items) { for (const item of items) { item.parentElement=this; item.parentNode=this; this.children.push(item); } }
  replaceChildren(...items) { this._text=''; this.children=[]; this.append(...items); }
  setAttribute(key,value) { this.attributes[key]=String(value); } getAttribute(key) { return this.attributes[key]; }
  matches(selector) { if (selector.startsWith('.')) return this.className.split(' ').includes(selector.slice(1)); if (selector==='[hidden]') return this.hidden; const attr=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/); if(attr) { let value=this.attributes[attr[1]]; if(attr[1].startsWith('data-')) value=this.dataset[attr[1].slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]; return attr[2]===undefined ? value!==undefined : value===attr[2]; } return this.tagName===selector.toUpperCase(); }
  closest(selector) { for(let item=this;item;item=item.parentElement) if(selector.split(',').some(part => item.matches(part))) return item; return null; }
  contains(item) { return item===this || this.children.some(child => child.nodeType===1 && child.contains(item)); }
  all() { return this.children.flatMap(item => item.nodeType===1 ? [item,...item.all()] : []); }
  querySelectorAll(selector) { return this.all().filter(item => selector.split(',').some(part => item.matches(part.trim()))); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(type,fn) { (this.listeners[type]||=[]).push(fn); } removeEventListener(type,fn) { this.listeners[type]=(this.listeners[type]||[]).filter(item=>item!==fn); }
  async fire(type,extra={}) { const event={type,target:this,preventDefault() { this.prevented=true; },...extra}; for(const fn of [...(this.listeners[type]||[])]) await fn(event); return event; }
  getBoundingClientRect() { return {left:20,right:360,top:30,bottom:60,width:340,height:210}; }
  focus() { this.ownerDocument.activeElement=this; }
  select() { this.selectionStart=0;this.selectionEnd=this.value.length; }
  click() { if(!this.disabled)return this.fire('click'); }
  remove() { if(this.parentElement) this.parentElement.children=this.parentElement.children.filter(item=>item!==this); }
}
function fixture() {
  const listeners={},timers=new Map(); let timerId=0,profile='legacy';
  const win={IELTSWordDictionary:Dictionary,URLSearchParams,console,IELTSProfiles:{current:()=>({id:profile})},innerWidth:1024,innerHeight:768,CustomEvent:class { constructor(type,init={}) { this.type=type; this.detail=init.detail; } },setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},addEventListener(type,fn){(listeners[type]||=[]).push(fn);},removeEventListener(type,fn){listeners[type]=(listeners[type]||[]).filter(item=>item!==fn);},dispatchEvent(event){(listeners[event.type]||[]).forEach(fn=>fn(event));}};
  const doc=new Element('document');doc.nodeType=9;doc.ownerDocument=doc;doc.defaultView=win;doc.createElement=tag=>new Element(tag,doc);doc.body=new Element('body',doc);doc.documentElement=doc.body;doc.append(doc.body);doc.activeElement=doc.body;win.document=doc;
  const paragraph=new Element('p',doc),text={nodeType:3,nodeValue:'Hello, student.',textContent:'Hello, student.'}; paragraph.append(text);doc.body.append(paragraph);
  doc.caretPositionFromPoint=(x,y)=>({offsetNode:text,offset:Math.floor(x/10)});
  doc.createRange=()=>({startOffset:0,endOffset:5,startContainer:text,endContainer:text,setStart(node,offset){this.startContainer=node;this.startOffset=offset;},setEnd(node,offset){this.endContainer=node;this.endOffset=offset;},getBoundingClientRect(){return {left:this.startOffset*10,right:this.endOffset*10,top:0,bottom:20,height:20};}});
  let selection={isCollapsed:true,rangeCount:0,toString:()=>''};win.getSelection=()=>selection;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/vocabulary-practice.js'),'utf8'),win);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/word-hover.js'),'utf8'),win);
  return {win,doc,paragraph,text,setSelection(value){selection=value;},switchProfile(){profile='p-other-profile';win.dispatchEvent({type:'ielts:profile-changed'});},tick(){const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());}};
}
function button(box,text) { return box.querySelectorAll('button').find(item=>item.textContent===text); }
async function answerRound(box,answers) { const inputs=box.querySelectorAll('input'); for(let i=0;i<inputs.length;i++){inputs[i].value=answers[i];await inputs[i].fire('input');}return box.querySelector('form').fire('submit'); }

test('DOM hides full answers in tests, requires playback, retries failed callbacks, and retains the original',async()=>{
  const f=fixture(),container=f.doc.createElement('div');f.doc.body.append(container);let failures=1,saves=0,saveFailures=1,playsFail=true;const captured=[];
  const controller=f.win.IELTSVocabularyPractice.mount(container,{trainingVersion:1,material:{id:'daily-vocab',version:'1',vocabulary:[{word:'student',meaning:'学生',example:'I am a student.'},{word:'teacher',meaning:'老师',example:'He is a teacher.'}]},courseDay:2,player:{cancel(){},async play(){if(playsFail)throw Error('playback failed');return {kind:'browser-tts',started:true,completed:true,completedAt:new Date().toISOString()};}},onMistake:async value=>{if(failures-- >0)throw Error('save mistake failed');captured.push(value);},onSubmit:async value=>{saves++;if(saveFailures-- >0)throw Error('save original failed');assert.equal(value.correct,5);}});
  const box=container.children[0];assert.match(box.textContent,/student/);
  await button(box,'学完了，开始第 1 轮').fire('click');assert.equal(box.dataset.vocabTesting,'true');assert.doesNotMatch(box.textContent,/student|teacher/);assert.ok(box.querySelectorAll('input').every(input=>!JSON.stringify(input.attributes).includes('student')));
  await answerRound(box,['student','techer']);assert.equal(controller.getState().phase,'feedback');assert.equal(captured.length,0);
  await button(box,'继续第 2 轮').fire('click');assert.equal(captured.length,1);assert.equal(box.dataset.vocabTesting,'true');assert.doesNotMatch(box.textContent,/student|teacher/);
  await answerRound(box,['student','teacher']);await button(box,'继续第 3 轮').fire('click');assert.doesNotMatch(box.textContent,/student|teacher/);
  await answerRound(box,['student','teacher']);assert.match(box.textContent,/尚未成功播放/);assert.equal(controller.getSubmission(),null);
  await button(box,'播放第 1 词').fire('click');assert.match(box.textContent,/playback failed/);assert.equal(controller.getState().audio[0],undefined);
  playsFail=false;await button(box,'播放第 1 词').fire('click');await button(box,'播放第 2 词').fire('click');await box.querySelector('form').fire('submit');await button(box,'查看三轮总成绩').fire('click');
  assert.equal(controller.getSubmission().total,6);assert.equal(controller.getSubmission().quantity,2);assert.equal(controller.getSubmission().mistakes.length,1);
  await button(box,'提交三轮原稿').fire('click');assert.match(box.textContent,/save original failed/);assert.equal(controller.getSubmission().attempts[1].userAnswer,'techer');
  await button(box,'提交三轮原稿').fire('click');assert.equal(saves,2);assert.equal(captured.length,1);await controller.submit();assert.equal(saves,2);assert.equal(button(box,'已提交原稿').disabled,true);
  controller.destroy();
});

test('switching profile disables an existing vocabulary module and cannot save into the next profile',async()=>{
  const f=fixture(),container=f.doc.createElement('div');f.doc.body.append(container);let saved=0;
  const controller=f.win.IELTSVocabularyPractice.mount(container,{trainingVersion:1,material:{id:'vocab',vocabulary:[{word:'student',meaning:'学生'}]},onSubmit:()=>{saved++;}});
  f.switchProfile();assert.ok(container.querySelectorAll('button').every(item=>item.disabled));await assert.rejects(controller.submit(),/档案或练习已切换/);assert.equal(saved,0);controller.destroy();
});

test('hover waits, preserves the text nodes, and never prevents selection or right-click',async()=>{
  const f=fixture(),hover=f.win.IELTSWordHover.install({root:f.doc}),popup=f.doc.body.querySelector('.word-hover-popup');
  await f.doc.fire('pointermove',{target:f.paragraph,clientX:25,clientY:10,pointerType:'mouse',buttons:0});assert.equal(popup.hidden,true);f.tick();assert.equal(popup.hidden,false);assert.match(popup.textContent,/Hello/);assert.equal(f.paragraph.children[0],f.text);assert.equal(f.paragraph.children.length,1);
  const menu=await f.doc.fire('contextmenu',{target:f.paragraph});assert.equal(menu.prevented,undefined);assert.equal(popup.hidden,true);
  await f.doc.fire('pointermove',{target:f.paragraph,clientX:25,clientY:10,pointerType:'mouse',buttons:1});f.tick();assert.equal(popup.hidden,true);
  f.setSelection({isCollapsed:false,rangeCount:1,toString:()=> 'student'});await f.doc.fire('selectionchange');await f.doc.fire('pointermove',{target:f.paragraph,clientX:95,clientY:10,pointerType:'mouse',buttons:0});f.tick();assert.equal(popup.hidden,true);hover.destroy();
});

test('selected-word keyboard access works and assessment/vocabulary tests disable lookup',async()=>{
  const f=fixture(),hover=f.win.IELTSWordHover.install({root:f.doc}),popup=f.doc.body.querySelector('.word-hover-popup');
  const range=f.doc.createRange();range.startOffset=7;range.endOffset=14;
  f.setSelection({isCollapsed:false,rangeCount:1,toString:()=> 'student',getRangeAt:()=>range});
  const key=await f.doc.fire('keydown',{key:'D',altKey:true,shiftKey:true});assert.equal(key.prevented,true);assert.equal(popup.hidden,false);assert.match(popup.textContent,/student/);assert.equal(f.doc.activeElement.tagName,'BUTTON');
  await f.doc.fire('keydown',{key:'Escape'});assert.equal(popup.hidden,true);assert.equal(f.doc.activeElement,f.doc.body);
  f.win.dispatchEvent({type:'ielts:assessment-mode',detail:{active:true}});await f.doc.fire('keydown',{key:'D',altKey:true,shiftKey:true});assert.equal(popup.hidden,true);
  f.win.dispatchEvent({type:'ielts:assessment-mode',detail:{active:false}});f.win.dispatchEvent({type:'ielts:vocabulary-testing',detail:{active:true}});await f.doc.fire('keydown',{key:'D',altKey:true,shiftKey:true});assert.equal(popup.hidden,true);hover.destroy();
});

test('AI response strings are rendered as text without executing HTML',async()=>{
  const f=fixture(),hover=f.win.IELTSWordHover.install({root:f.doc,lookupAI:async word=>({word,ipa:'/test/',meaning:'<img src=x onerror=alert(1)>',example:'<script>alert(1)</script>'})});
  const popup=f.doc.body.querySelector('.word-hover-popup');hover.show({word:'unknownword',context:'A word.',level:'A0',rect:{left:10,top:10,bottom:30},element:f.paragraph});
  await button(popup,'AI 补全词条').fire('click');assert.match(popup.textContent,/<img src=x onerror=alert\(1\)>/);assert.equal(popup.querySelector('img'),null);assert.equal(popup.querySelector('script'),null);hover.destroy();
});


test('new learning UI requires three checked spellings and three completed recordings before opening completion test',async()=>{
 const f=fixture(),container=f.doc.createElement('div');f.doc.body.append(container);let current={phase:'idle',busy:false},callbacks,seq=0;
 const speakerFactory=options=>{callbacks=options;return{getState:()=>current,async start(word,context){current={phase:'recording',busy:true,context:{...context,word}};options.onState(current);},async stop(){const ctx=current.context,index=++seq,workId='work-ui-recording-'+String(index).padStart(8,'0');await options.onSaved({id:workId},ctx);await options.onAttempt({wordIndex:ctx.wordIndex,workId,reference:ctx.word,hash:String(index).padStart(64,'0'),evidenceId:'evidence-ui-'+index,provider:'Alibaba oral assessment',verified:true,nonSilent:true,durationSeconds:1,recordedAt:new Date().toISOString(),result:{accuracy:90,fluency:90,completeness:95}});current={phase:'idle',busy:false,context:ctx};options.onState(current);},restore(){throw Error('not used');},destroy(){},cancel(){},play(){}};};
 const controller=f.win.IELTSVocabularyPractice.mount(container,{material:{id:'new-vocab',vocabulary:[{word:'hello',meaning:'你好',example:'Hello.'}]},speakerFactory,player:{cancel(){}}});const box=container.children[0];
 assert.equal(button(box,'学完了，开始第 1 轮').disabled,true);assert.equal(button(box,'开始第 1 次跟读录音').disabled,true);
 let input=box.querySelector('input');input.value='hellp';await input.fire('input');await button(box,'核对本遍输入').fire('click');assert.equal(controller.getState().learning.items[0].spellings,0);
 for(let i=0;i<3;i++){input=box.querySelector('input');input.value='hello';await input.fire('input');await button(box,'核对本遍输入').fire('click');}
 assert.equal(controller.getState().learning.items[0].spellings,3);assert.equal(controller.getState().learning.items[0].speaking,0);
 for(let trial=1;trial<=3;trial++){await button(box,'开始第 '+trial+' 次跟读录音').fire('click');assert.equal(controller.getState().learning.items[0].speaking,trial-1);assert.equal(button(box,'学完了，开始第 1 轮').disabled,true);await button(box,'结束本次录音并评测').fire('click');}
 assert.equal(controller.getState().learning.complete,true);assert.equal(button(box,'学完了，开始第 1 轮').disabled,false);await button(box,'学完了，开始第 1 轮').fire('click');assert.equal(controller.getState().phase,'completion');assert.match(box.textContent,/第 1 \/ 3 轮 · 补全单词/);assert.doesNotMatch(box.textContent,/hello/);controller.destroy();
});


test('copy confirmation keeps typing focus, supports Enter without IME/repeat submits, and hands off without starting the mic',async()=>{
 const f=fixture(),container=f.doc.createElement('div');f.doc.body.append(container);let micStarts=0,finishMistake;const mistakes=[];
 const controller=f.win.IELTSVocabularyPractice.mount(container,{material:{id:'focus-vocab',vocabulary:[{word:'hello',meaning:'你好'}]},speakerFactory:()=>({getState:()=>({busy:false}),start(){micStarts++;},cancel(){},destroy(){}}),player:{cancel(){}},onMistake:async value=>{mistakes.push(value);await new Promise(resolve=>{finishMistake=resolve;});}});const box=container.children[0];
 let input=box.querySelector('input');input.value='hellp';await input.fire('input');const write=button(box,'核对本遍输入');write.focus();const saving=write.fire('click');
 assert.equal(f.doc.activeElement,input);assert.equal(input.value,'hellp');assert.equal(input.selectionEnd,5);assert.equal(mistakes[0].userAnswer,'hellp');
 const other=f.doc.createElement('input');f.doc.body.append(other);other.focus();finishMistake();await saving;assert.equal(f.doc.activeElement,other);
 input.value='hello';await input.fire('input');await input.fire('compositionstart');await input.fire('keydown',{key:'Enter'});await input.fire('compositionend');await input.fire('keydown',{key:'Enter',isComposing:true});await input.fire('keydown',{key:'Enter',keyCode:229});await input.fire('keydown',{key:'Enter',repeat:true});assert.equal(controller.getState().learning.items[0].spellings,0);
 const key=await input.fire('keydown',{key:'Enter'});assert.equal(key.prevented,true);let next=box.querySelector('input');assert.notEqual(next,input);assert.equal(f.doc.activeElement,next);assert.equal(next.value,'');
 next.value='hello';await next.fire('input');button(box,'核对本遍输入').focus();await button(box,'核对本遍输入').fire('click');next=box.querySelector('input');assert.equal(f.doc.activeElement,next);assert.equal(controller.getState().learning.items[0].spellings,2);
 next.value='hello';await next.fire('input');await next.fire('keydown',{key:'Enter'});assert.equal(f.doc.activeElement,button(box,'开始第 1 次跟读录音'));assert.equal(micStarts,0);assert.equal(controller.getState().learning.items[0].speaking,0);assert.equal(button(box,'学完了，开始第 1 轮').disabled,true);controller.destroy();
});

test('shuffled DOM labels, answers, audio and wrong-answer feedback stay attached to the displayed word',async()=>{
 const f=fixture(),container=f.doc.createElement('div');f.doc.body.append(container);const material={id:'order-dom',vocabulary:[{word:'student',meaning:'学生'},{word:'teacher',meaning:'老师'},{word:'hello',meaning:'你好'}]},session=f.win.IELTSVocabularyPractice.createSession({trainingVersion:1,material});session.state.roundOrders={meaning:[1,2,0],completion:[2,0,1],dictation:[0,2,1]};const played=[];
 const controller=f.win.IELTSVocabularyPractice.mount(container,{material,draft:session.getDraft(),player:{cancel(){},async play(word){played.push(word.word);return{kind:'browser-tts',started:true,completed:true,completedAt:new Date().toISOString()};}}}),box=container.children[0];
 await button(box,'学完了，开始第 1 轮').fire('click');assert.deepEqual(box.querySelectorAll('.vocab-prompt').map(item=>item.textContent),['老师','你好','学生']);await answerRound(box,['techer','hello','student']);assert.match(box.textContent,/第 1 词 · 需要订正/);assert.equal(controller.getState().rounds[0].attempts[0].word,'teacher');assert.equal(controller.getState().rounds[0].attempts[0].userAnswer,'techer');
 await button(box,'继续第 2 轮').fire('click');assert.deepEqual(box.querySelectorAll('.vocab-prompt').map(item=>item.textContent),['你好','学生','老师']);await answerRound(box,['hello','student','teacher']);await button(box,'继续第 3 轮').fire('click');
 for(let i=1;i<=3;i++)await button(box,'播放第 '+i+' 词').fire('click');assert.deepEqual(played,['student','hello','teacher']);await answerRound(box,['student','hello','teacher']);assert.equal(controller.getSubmission().correct,8);assert.equal(controller.getSubmission().mistakes[0].word,'teacher');controller.destroy();
});


test('resuming saved test rounds shows recovery progress instead of an empty learning form',async()=>{
 const f=fixture(),container=f.doc.createElement('div');f.doc.body.append(container);const material={id:'restore-screen',vocabulary:[{word:'hello',meaning:'你好'}]},session=f.win.IELTSVocabularyPractice.createSession({material});
 const proofs=[1,2,3].map(trial=>({wordIndex:0,workId:'work-restore-screen-'+trial,reference:'hello',hash:String(trial).repeat(64),evidenceId:'restore-evidence-'+trial,provider:'Alibaba oral assessment',verified:true,nonSilent:true,durationSeconds:1,recordedAt:new Date().toISOString(),result:{accuracy:90,fluency:90,completeness:95}}));
 for(let i=0;i<3;i++)session.recordSpelling(0,'hello');for(const proof of proofs)session.recordSpeaking(0,proof);session.begin();session.setAnswer(0,'hello');session.submitRound();session.next();session.setAnswer(0,'hello');session.submitRound();session.next();session.setAnswer(0,'hel');let release;
 const controller=f.win.IELTSVocabularyPractice.mount(container,{material,draft:session.getDraft(),player:{cancel(){}},speakerFactory:()=>({getState:()=>({busy:false}),async restore(id){if(id===proofs[0].workId)await new Promise(resolve=>{release=resolve;});return proofs.find(proof=>proof.workId===id);},destroy(){},cancel(){}})}),box=container.children[0];
 assert.match(box.textContent,/正在恢复第 3 轮 · 听写/);assert.match(box.textContent,/已保留 2 轮原稿/);assert.match(box.textContent,/正确输入 3\/3，已保存跟读 3\/3/);assert.equal(box.querySelectorAll('input').length,0);
 release();await controller.ready;assert.match(box.textContent,/第 3 \/ 3 轮 · 听写/);assert.equal(box.querySelector('input').value,'hel');assert.equal(controller.getState().rounds.length,2);assert.equal(controller.getState().learning.complete,true);controller.destroy();
});


test('automatic missing-word lookup fills the writing prompt popup, caches results, and never leaks into a test or a later hover',async()=>{
 const f=fixture();let finish,calls=0;const hover=f.win.IELTSWordHover.install({root:f.doc,autoEnrich:true,lookupAI:async word=>{calls++;return await new Promise(resolve=>{finish=()=>resolve({word,ipa:'/tɛst/',meaning:'写作中的测试词',example:'This is a test.'});});}}),popup=f.doc.body.querySelector('.word-hover-popup');
 const item={word:'unknownwritingword',context:'A writing prompt.',level:'A0',rect:{left:10,top:10,bottom:30},element:f.paragraph};hover.show(item);assert.match(popup.textContent,/正在查询音标/);finish();await new Promise(resolve=>setImmediate(resolve));assert.match(popup.textContent,/写作中的测试词/);assert.match(popup.textContent,/tɛst/);hover.hide();hover.show(item);assert.equal(calls,1);
 hover.show({...item,word:'anotherunknownword'});hover.hide();finish();await new Promise(resolve=>setImmediate(resolve));assert.equal(popup.hidden,true);
 f.win.dispatchEvent({type:'ielts:assessment-mode',detail:{active:true}});hover.show({...item,word:'blockedword'});assert.equal(calls,2);assert.equal(popup.hidden,true);hover.destroy();
});
