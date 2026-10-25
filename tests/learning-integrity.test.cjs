const test=require('node:test'),assert=require('node:assert/strict');
const guard=require('../assets/learning-integrity.js');
function target({learning=true,answer=false,exempt=false}={}){return {closest(selector){if(selector==='main,[data-learning-content]')return learning?this:null;if(selector.startsWith('[data-learning-paste'))return exempt?this:null;return answer?this:null;}};}
test('study answers reject paste, drop and native insertion while normal typing and IME continue',()=>{
  const input=target({answer:true});for(const type of ['paste','drop'])assert.equal(guard.shouldBlock(type,{target:input}),true);
  for(const inputType of ['insertFromPaste','insertFromDrop'])assert.equal(guard.shouldBlock('beforeinput',{target:input,inputType}),true);
  for(const inputType of ['insertText','insertCompositionText','deleteContentBackward','historyUndo'])assert.equal(guard.shouldBlock('beforeinput',{target:input,inputType}),false);
});
test('copy and cut of selected learning material are blocked without changing selection or answers',()=>{
  const text={nodeType:3,parentElement:target()},selection={anchorNode:text,focusNode:text};const outside=target({learning:false});
  for(const type of ['copy','cut','dragstart'])assert.equal(guard.shouldBlock(type,{target:outside},selection),true);
  assert.equal(guard.shouldBlock('contextmenu',{target:text},selection),false);assert.equal(guard.shouldBlock('pointerup',{target:text},selection),false);assert.equal(selection.anchorNode,text);
});
test('settings, imports and explicitly permitted reference fields retain clipboard access',()=>{
  for(const input of [target({learning:false,answer:true}),target({answer:true,exempt:true})])for(const type of ['copy','cut','paste','drop','beforeinput'])assert.equal(guard.shouldBlock(type,{target:input,inputType:'insertFromPaste'}),false);
  assert.equal(guard.shouldBlock('paste',{target:target()}),false);
});

test('an editable exempt field stays pasteable and copyable even after selecting study text',()=>{const input=target({answer:true,exempt:true}),selection={anchorNode:target(),focusNode:target()};for(const type of ['copy','cut','paste'])assert.equal(guard.shouldBlock(type,{target:input},selection),false);});
