(function(root){
  'use strict';
  const EXEMPT='[data-learning-paste="allow"],input[type="password"],input[type="url"],input[type="email"],input[type="search"],input[type="file"],input[type="number"],input[type="date"],input[type="time"],#contextPrompt,#referenceText';
  function element(node){return node?.nodeType===3?node.parentElement:node;}
  function protectedNode(node){const target=element(node);return Boolean(target?.closest?.('main,[data-learning-content]'))&&!target.closest(EXEMPT);}
  function answerField(node){const target=element(node);return protectedNode(target)&&Boolean(target.closest('textarea,input:not([type]),input[type="text"],[contenteditable="true"]'));}
  function shouldBlock(type,event,selection){
    if(element(event.target)?.closest?.(EXEMPT))return false;
    if(type==='paste'||type==='drop')return answerField(event.target);
    if(type==='beforeinput')return /^(?:insertFromPaste|insertFromDrop)$/.test(event.inputType||'')&&answerField(event.target);
    if(type==='copy'||type==='cut'||type==='dragstart')return protectedNode(event.target)||protectedNode(selection?.anchorNode)||protectedNode(selection?.focusNode);
    return false;
  }
  function install(doc=root.document){
    if(!doc||doc.documentElement?.dataset.learningIntegrity==='on')return null;
    if(doc.documentElement)doc.documentElement.dataset.learningIntegrity='on';
    let notice,timer;const handlers=[];
    function inform(){
      if(!notice){notice=doc.createElement('p');notice.id='learningIntegrityStatus';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.style.cssText='position:fixed;left:16px;bottom:16px;max-width:min(440px,calc(100vw - 32px));box-sizing:border-box;margin:0;padding:12px 16px;background:#203f39;color:white;border-radius:10px;z-index:1500;pointer-events:none;box-shadow:0 4px 18px #0003';doc.body.append(notice);}
      notice.hidden=false;notice.textContent='请自行输入答案。学习区不支持复制、剪切、粘贴或拖入文字；划词查询仍可使用。';root.clearTimeout(timer);timer=root.setTimeout(()=>{notice.hidden=true;},4500);
    }
    for(const type of ['copy','cut','paste','drop','dragstart','beforeinput']){const handler=event=>{if(!shouldBlock(type,event,doc.getSelection?.()))return;event.preventDefault();event.stopImmediatePropagation?.();inform();};doc.addEventListener(type,handler,true);handlers.push([type,handler]);}
    return {destroy(){for(const [type,handler]of handlers)doc.removeEventListener(type,handler,true);root.clearTimeout(timer);notice?.remove();if(doc.documentElement)delete doc.documentElement.dataset.learningIntegrity;}};
  }
  const api=Object.freeze({protectedNode,answerField,shouldBlock,install});root.IELTSLearningIntegrity=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',()=>install(),{once:true});else install();}
})(typeof globalThis!=='undefined'?globalThis:this);
