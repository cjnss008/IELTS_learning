(function(root){
  'use strict';
  const KEY='ielts52-notebook-v1';
  function parse(value){
    const a=typeof value==='string'?JSON.parse(value):value;
    if(!Array.isArray(a)||a.length>5000)throw Error('生词本格式不正确或超过 5000 条。');
    const ids=new Set();
    return a.map(c=>{
      if(!c||typeof c!=='object'||!/^custom-[a-zA-Z0-9-]{8,80}$/.test(c.id)||ids.has(c.id))throw Error('生词条目标识无效。');
      ids.add(c.id);
      if(!Number.isInteger(c.day)||c.day<1||c.day>52)throw Error('生词篇号无效。');
      for(const [k,min,max] of [['word',1,80],['meaning',1,300],['context',1,1500]])if(typeof c[k]!=='string'||c[k].trim().length<min||c[k].length>max)throw Error('生词内容超出范围。');
      return {id:c.id,day:c.day,word:c.word,meaning:c.meaning,context:c.context,audio:'',status:c.status==='known'?'known':'learning'};
    });
  }
  function storage(){return new URLSearchParams(location.search).get('preview')==='1'?sessionStorage:localStorage;}
  function key(){return new URLSearchParams(location.search).get('preview')==='1'?'ielts52-notebook-preview-v1':KEY;}
  function load(){return parse(storage().getItem(key())||'[]');}
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function mount(host,lesson){
    host.innerHTML=`<h2>把生词放回原句</h2><p class="small">借助课文语境记词组。填写词或短语、自己的释义和原句，加入生词本后到复习页翻面回忆。已认识不等于永久掌握，复习仍按实际表现安排。</p><form data-n="form"><label>词或短语<input type="text" data-n="word" required maxlength="80"></label><label>中文释义 / 用法<input type="text" data-n="meaning" required maxlength="300"></label><label>原句<textarea data-n="context" required maxlength="1500"></textarea></label><div class="toolbar"><button class="primary">加入生词本</button><button type="button" data-n="selection">读取选中的课文文字</button><a href="生词复习.html">前往到期复习 →</a></div></form><p data-n="status" role="status"></p><div data-n="list"></div>`;
    if (new URLSearchParams(location.search).get('preview')==='1') host.querySelector('a').href='生词复习.html?preview=1';
    const $=n=>host.querySelector(`[data-n="${n}"]`);
    function render(){try{const cards=load().filter(c=>c.day===lesson.day);$('list').innerHTML=cards.length?`<details open><summary>本篇生词 ${cards.length} 条</summary>${cards.map(c=>`<p><strong lang="en">${esc(c.word)}</strong> · ${esc(c.meaning)}<br><span class="small" lang="en">${esc(c.context)}</span></p>`).join('')}</details>`:'<p class="small">尚未收集本篇生词。</p>';}catch{$('status').textContent='已有生词本无法读取，原始数据已保留。请先到备份中心导出，不会覆盖旧记录。';$('form').querySelector('button').disabled=true;}}
    $('selection').onclick=()=>{const text=String(window.getSelection()).trim();if(!text){$('status').textContent='先在正文中选中词语，再点击此按钮；也可以直接输入。';return;}if(!lesson.text.includes(text)){$('status').textContent='请选择本课英文正文中的文字。';return;}$('word').value=text.slice(0,80);const sentences=lesson.text.match(/[^.!?]+[.!?]*/g)||[lesson.text];$('context').value=(sentences.find(s=>s.includes(text))||text).trim();};
    $('form').onsubmit=e=>{e.preventDefault();try{const cards=load(),word=$('word').value.trim(),existing=cards.find(c=>c.day===lesson.day&&c.word.toLowerCase()===word.toLowerCase());if(existing){$('status').textContent='本篇已收集这个词或短语，请在复习页练习。';return;}const id='custom-'+(root.crypto?.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));cards.push({id,day:lesson.day,word,meaning:$('meaning').value.trim(),context:$('context').value.trim(),audio:'',status:'learning'});storage().setItem(key(),JSON.stringify(parse(cards)));$('status').textContent='已保存原句词卡；复习页刷新后可加入每日新词队列。';$('form').reset();render();}catch(e){$('status').textContent='未保存：'+e.message;}};
    render();
  }
  root.IELTSNotebook={KEY,parse,load,mount};if(typeof module!=='undefined')module.exports=root.IELTSNotebook;
})(globalThis);
