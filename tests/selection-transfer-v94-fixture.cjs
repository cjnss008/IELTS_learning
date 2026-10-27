'use strict';
// Reuse the frozen actual WritingPath rendering case; do not alter its bytes.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createRequire}=require('node:module'),crypto=require('node:crypto');
const root=path.resolve(process.env.WORD_HOVER_BASE_ROOT||path.join(__dirname,'..')),file=path.resolve(process.env.WORD_HOVER_FROZEN_TEST||path.join(root,'tests/word-hover-delivery-v94.test.cjs'));process.env.WORD_HOVER_BASE_ROOT=root;
async function run(options={}){
const selectionFile=path.resolve(options.selectionFile||process.env.SELECTION_TRANSFER_FILE||path.join(root,'assets/selection-ai.js'));
const raw=fs.readFileSync(file,'utf8'),cases=[],box={exports:{}},native=createRequire(file);function register(name,fn){cases.push({name,fn});}
new Function('require','__dirname','module',raw+'\nmodule.exports={getFixture:()=>fixture,setFixture:fn=>{fixture=fn;},until,turn};')(name=>name==='node:test'?register:native(name),path.dirname(file),box);
const H=box.exports,original=H.getFixture(),observations={schema:1,scope:'Actual saved WritingPath app DOM and actual selection module; synthetic host/library/upstream only',selectionAssetSha256:crypto.createHash('sha256').update(fs.readFileSync(selectionFile)).digest('hex')};
H.setFixture(options=>{const f=original(options),hover=f.hover;f.hover=async(element,word)=>{
  if(element.id==='writingPathTransferPrompt'){
    const transferBody=f.doc.getElementById('writingPathTransferBody');transferBody.remove();f.doc.getElementById('writingPathBody').append(transferBody);
    const goal=f.doc.getElementById('writingPathGoal');goal.remove();f.doc.getElementById('writingPathBody').append(goal);
    f.win.URL=URL;
    element=f.doc.getElementById('writingPathTransferTopic');word=element.textContent.match(/[A-Za-z]+/)[0];
    const before=f.doc.getElementById('writingPathTransferAnswer').value,events=[];f.win.location.origin='http://127.0.0.1:18765';f.win.IELTSProfiles.scopeKey=key=>key;f.win.IELTSRecords.makeId=()=> 'translation-transfer-probe';const html=fs.readFileSync(path.join(root,'写作补强.html'),'utf8'),tag=html.match(/<([A-Za-z0-9]+)\b[^>]*id="writingPathTransferTopic"/);assert.ok(tag);element.tagName=tag[1].toUpperCase();const request=f.win.fetch;f.win.fetch=async(url,opts)=>url==='/api/ai/translate'?{ok:true,json:async()=>({ok:true,feedbackFormat:'text',feedback:word+'是新话题的词语解释。这是可见辅助的合成响应。',model:'synthetic',promptVersion:'translation-probe',assistance:true})}:request(url,opts);
    f.win.addEventListener('ielts:selection-assistance',e=>events.push(e.detail));
    vm.runInNewContext(fs.readFileSync(selectionFile,'utf8'),f.win,{filename:'actual-selection-ai.js'});
    const value=element.textContent,index=value.indexOf(word),node={nodeType:3,parentElement:element,nodeValue:value},range={startContainer:node,endContainer:node,startOffset:index,endOffset:index+word.length,toString:()=>word,getBoundingClientRect:()=>({left:10,right:100,top:10,bottom:30})};f.win.getSelection=()=>({isCollapsed:false,rangeCount:1,toString:()=>word,getRangeAt:()=>range});f.doc.activeElement=f.doc.body;
    const snapshot=f.win.IELTSSelectionAI.captureTranslation(f.win.getSelection(),f.doc,{page:'写作补强.html',mode:'practice'});observations.transferCaptureAllowed=!!snapshot;observations.transferBodyIsActualParent=element.closest('#writingPathTransferBody')?.id==='writingPathTransferBody';observations.ordinarySurfaceStillAvailable=!!f.win.IELTSSelectionAI.translationSurface(f.doc.getElementById('writingPathGoal'),'写作补强.html');
    await f.doc.fire('selectionchange');const trigger=f.doc.querySelector('.selection-ai-trigger');observations.triggerVisible=trigger?.hidden===false;
    if(trigger&&!trigger.hidden){await trigger.click();try{await H.until(()=>f.doc.querySelector('.selection-ai-panel')?.textContent.includes('可见辅助'));}catch(error){observations.panel=f.doc.querySelector('.selection-ai-panel')?.textContent;throw error;}observations.translationVisible=true;observations.assistanceEvents=events;observations.records=(await f.records.list()).filter(r=>r.source==='selection-ai-translation').map(r=>({id:r.id,materialId:r.materialId,assistance:r.assistance,exposure:r.exposure,evaluation:r.evaluation,kind:r.kind}));}
    observations.transferInputUnchanged=f.doc.getElementById('writingPathTransferAnswer').value===before;
  }
  if(element.id==='writingPathTransferTopic')return f.popup();return hover(element,word);
};return f;});
try{const actual=cases.find(c=>c.name.startsWith('actual saved writing-path'));assert.ok(actual);await actual.fn();return observations;}finally{H.setFixture(original);}
}
module.exports={run};
