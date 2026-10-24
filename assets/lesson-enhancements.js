(function(){
  'use strict';
  let cleanups=[];
  function render(data){
    cleanups.forEach(fn=>fn());cleanups=[];
    const article=document.getElementById('lesson');if(!article||!data)return;
    article.querySelectorAll('.lesson-extra,.lesson-tools-nav').forEach(el=>el.remove());
    const nav=document.createElement('nav');nav.className='lesson-tools-nav';nav.setAttribute('aria-label','本课强化练习');
    const modules=[['grammar-practice','语法精练',globalThis.IELTSGrammar],['sentence-dictation','逐句听写',globalThis.IELTSDictation],['phrase-notebook','原句生词本',globalThis.IELTSNotebook]];
    for(const [id,title,api] of modules){if(!api)continue;const section=document.createElement('section');section.id=id;section.className='lesson-extra';article.append(section);const a=document.createElement('a');a.href='#'+id;a.textContent=title;nav.append(a);const cleanup=api.mount(section,data.lesson,data.groups);if(typeof cleanup==='function')cleanups.push(cleanup);}
    nav.addEventListener('click',event=>{const a=event.target.closest('a');if(a&&a.hash){event.preventDefault();document.getElementById(a.hash.slice(1))?.scrollIntoView({behavior:'smooth',block:'start'});}});
    article.querySelector('.meta')?.after(nav);
  }
  window.addEventListener('ielts:lesson',event=>render(event.detail));
  if(globalThis.IELTSCurrentLesson)render(globalThis.IELTSCurrentLesson);
  window.addEventListener('pagehide',()=>cleanups.forEach(fn=>fn()));
})();
