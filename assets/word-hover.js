(function (root, factory) {
  'use strict';
  const dictionary = root.IELTSWordDictionary || (typeof require === 'function' ? require('./word-dictionary.js') : null);
  const api = factory(root,dictionary);
  root.IELTSWordHover = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, Dictionary) {
  'use strict';
  const MAX_CACHE = 256;
  function tokenAt(text,offset) {
    if (typeof text !== 'string' || !Number.isInteger(offset) || offset < 0 || offset > text.length) return null;
    const regex = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’.-][A-Za-zÀ-ÖØ-öø-ÿ]+)*/g;
    let match;
    while ((match = regex.exec(text))) if (offset >= match.index && offset < match.index+match[0].length) return {word:match[0],start:match.index,end:match.index+match[0].length};
    return null;
  }
  function createLookup(options = {}) {
    if (!Dictionary) throw Error('本地查词组件未加载。');
    const lexical = options.dictionary || Dictionary.create(options), cache = new Map(), pending = new Map();
    let epoch = 0;
    const keyFor = (word,context,level,materialId) => JSON.stringify([Dictionary.normalize(word),String(context || '').slice(0,1600),String(level || ''),String(materialId || '')]);
    const lookup = (word,context = '',level = '',materialId = '') => cache.get(keyFor(word,context,level,materialId)) || lexical.lookup(word,context,materialId);
    async function enrich(word,context = '',level = 'A0',materialId = '') {
      if (!Dictionary.validWord(word)) throw Error('请选择一个英文词或词组。');
      const local = lookup(word,context,level,materialId), key = keyFor(word,context,level,materialId);
      if (local.complete) return local;
      const request = options.lookupAI || options.lookup;
      if (!request) throw Error('未配置AI查词；已展示本地可用信息，其余待查询。');
      if (pending.has(key)) return pending.get(key);
      const startedEpoch = epoch;
      const run = (async () => {
        const result = await request(word,String(context || '').slice(0,1600),level || 'A0');
        if (startedEpoch !== epoch) throw Error('学习档案已切换，请重新查词。');
        const merged = Dictionary.mergeAI(local,result);
        cache.delete(key); cache.set(key,merged);
        while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
        return merged;
      })();
      pending.set(key,run);
      try { return await run; } finally { if (pending.get(key) === run) pending.delete(key); }
    }
    return {lookup,enrich,clear() { epoch++; cache.clear(); pending.clear(); },cacheSize:() => cache.size};
  }
  function pointWord(doc,x,y) {
    let textNode, offset;
    if (doc.caretPositionFromPoint) { const position = doc.caretPositionFromPoint(x,y); textNode = position?.offsetNode; offset = position?.offset; }
    else if (doc.caretRangeFromPoint) { const range = doc.caretRangeFromPoint(x,y); textNode = range?.startContainer; offset = range?.startOffset; }
    if (textNode?.nodeType !== 3) return null;
    let token = tokenAt(textNode.nodeValue,offset);
    // Some engines place the caret just after the final character.
    if (!token && offset > 0) token = tokenAt(textNode.nodeValue,offset-1);
    if (!token) return null;
    const range = doc.createRange(); range.setStart(textNode,token.start); range.setEnd(textNode,token.end);
    const rect = range.getBoundingClientRect();
    // Caret APIs return the nearest text even over blank page space; require an actual word hit.
    if (x < rect.left-2 || x > rect.right+2 || y < rect.top-2 || y > rect.bottom+2) return null;
    return {...token,node:textNode,element:textNode.parentElement,rect};
  }
  function install(options = {}) {
    const target = options.root || root.document, doc = target?.nodeType === 9 ? target : target?.ownerDocument || root.document;
    if (!doc?.createElement || !Dictionary) return {destroy() {},hide() {},lookup:() => null};
    const host = doc.defaultView || root, lexical = createLookup(options), listeners = [];
    let open = null, candidate = null, timer = null, hideTimer = null, generation = 0, destroyed = false, assessment = false, vocabularyTesting = false;
    const popup = doc.createElement('aside'); popup.className = 'word-hover-popup'; popup.hidden = true;
    popup.setAttribute('role','dialog'); popup.setAttribute('aria-label','英文词义'); popup.setAttribute('data-word-hover-popup','true');
    (doc.body || doc.documentElement).append(popup);
    function node(tag,className,text) { const el = doc.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = String(text); return el; }
    function listen(element,event,callback,config) { element.addEventListener(event,callback,config); listeners.push(() => element.removeEventListener(event,callback,config)); }
    function selected() { const selection = host.getSelection?.(); return Boolean(selection && !selection.isCollapsed && String(selection).trim()); }
    function clearTimers() { if (timer) host.clearTimeout(timer); if (hideTimer) host.clearTimeout(hideTimer); timer = hideTimer = null; }
    function hide() { clearTimers(); generation++; popup.hidden = true; open = candidate = null; }
    const blocked = el => !el || assessment || vocabularyTesting || el.closest?.('input,textarea,select,button,[contenteditable="true"],[contenteditable=""],[data-word-hover-off],[data-vocab-testing="true"],[data-word-hover-popup],[hidden],script,style,pre,code');
    function position(rect) {
      const width = Math.min(350,Math.max(240,host.innerWidth-24)), margin = 12;
      popup.style.width = width+'px';
      let left = Math.max(margin,Math.min(rect.left,host.innerWidth-width-margin)), top = rect.bottom+9;
      const height = popup.getBoundingClientRect().height || 230;
      if (top+height > host.innerHeight-margin) top = Math.max(margin,rect.top-height-9);
      popup.style.left = left+'px'; popup.style.top = top+'px';
    }
    function render(value,item,message) {
      popup.replaceChildren();
      const header = node('div','word-hover-header'), title = node('strong','word-hover-word',item.word), close = node('button','word-hover-close','×'); close.type = 'button'; close.setAttribute('aria-label','关闭词义浮窗'); close.addEventListener('click',() => { const returnFocus = item.keyboard; hide(); if (returnFocus) item.returnFocus?.focus?.(); }); header.append(title,close);
      popup.append(header,node('p','word-hover-ipa',value.ipa || '音标待查询'),node('p','word-hover-meaning',value.meaning || '本地词库暂未收录这个词义。'),node('p','word-hover-example',value.example || '例句待查询'));
      if (value.exampleTranslation) popup.append(node('p','word-hover-translation',value.exampleTranslation));
      if (!value.complete && (options.lookupAI || options.lookup)) {
        const query = node('button','word-hover-query','AI 补全词条'); query.type = 'button';
        query.addEventListener('click',async () => {
          const token = generation; query.disabled = true; const status = node('p','word-hover-status','正在查询……'); status.setAttribute('role','status'); popup.append(status);
          try { const result = await lexical.enrich(item.word,item.context,item.level,item.materialId); if (destroyed || token !== generation || open !== item) return; render(result,item); }
          catch (error) { if (!destroyed && token === generation) { status.textContent = '暂未查询成功：'+error.message; query.disabled = false; } }
        }); popup.append(query);
      }
      if (message) popup.append(node('p','word-hover-status',message));
      popup.append(node('p','word-hover-source',value.source === 'ai-supplement' ? 'AI补充，语境释义可能需核对。' : value.source === 'missing' ? '缺项待查询，未推测音标。' : '本地词库 · 音标以词条形式为准。'));
      popup.append(node('p','word-hover-keyboard','Esc 关闭 · 选词后 Alt+Shift+D 查词'));
      position(item.rect);
    }
    function show(item) {
      if (destroyed || assessment || vocabularyTesting || !Dictionary.validWord(item.word)) return;
      clearTimers(); generation++; open = item; popup.hidden = false;
      render(lexical.lookup(item.word,item.context,item.level,item.materialId),item);
      if (item.keyboard) popup.querySelector('button')?.focus?.();
    }
    function contextualize(item) {
      const paragraph = item.element?.closest?.('[data-ai-reading],p,li,td,th,article,section') || item.element;
      const raw = paragraph?.textContent || item.node?.nodeValue || '';
      const offset = Math.max(0,raw.toLowerCase().indexOf(item.word.toLowerCase()));
      return {...item,context:raw.slice(Math.max(0,offset-500),offset+900),level:typeof options.level === 'function' ? options.level() : options.level || 'A0',materialId:typeof options.materialId === 'function' ? options.materialId() : options.materialId || ''};
    }
    function move(event) {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      if (popup.contains(event.target)) { if (hideTimer) host.clearTimeout(hideTimer); hideTimer = null; return; }
      if (event.buttons || selected() || blocked(event.target)) { hide(); return; }
      const hit = pointWord(doc,event.clientX,event.clientY);
      if (!hit || blocked(hit.element) || (target !== doc && !target.contains(hit.element))) {
        if (timer) host.clearTimeout(timer); timer = null; candidate = null;
        if (!hideTimer) hideTimer = host.setTimeout(hide,160); return;
      }
      if (open?.node === hit.node && open.start === hit.start) { if (hideTimer) host.clearTimeout(hideTimer); hideTimer = null; return; }
      if (candidate?.node === hit.node && candidate.start === hit.start) return;
      clearTimers(); if (open) { popup.hidden = true; open = null; generation++; }
      candidate = contextualize(hit); const expected = candidate;
      timer = host.setTimeout(() => { timer = null; if (candidate === expected && !selected() && !blocked(expected.element)) show(expected); },Math.max(250,options.delay || 500));
    }
    function keyboard(event) {
      if (event.key === 'Escape' && !popup.hidden) { const item = open; hide(); if (item?.keyboard) item.returnFocus?.focus?.(); return; }
      if (!(event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && String(event.key).toLowerCase() === 'd') || assessment || vocabularyTesting) return;
      const selection = host.getSelection?.(), word = String(selection || '').trim();
      if (!Dictionary.validWord(word) || word.length > 100 || selection?.rangeCount !== 1) return;
      const range = selection.getRangeAt(0), element = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
      if (blocked(element) || (target !== doc && !target.contains(element))) return;
      event.preventDefault();
      show(contextualize({word,element,node:range.startContainer,start:range.startOffset,end:range.endOffset,rect:range.getBoundingClientRect(),keyboard:true,returnFocus:doc.activeElement}));
    }
    listen(target,'pointermove',move,{passive:true});
    listen(doc,'pointerdown',event => { if (!popup.contains(event.target)) hide(); },{passive:true});
    listen(doc,'contextmenu',hide,{passive:true});
    listen(doc,'selectionchange',() => { if (selected() && !open?.keyboard) hide(); });
    listen(doc,'keydown',keyboard);
    listen(doc,'scroll',hide,{capture:true,passive:true});
    listen(host,'resize',hide,{passive:true});
    listen(host,'blur',hide);
    listen(host,'ielts:profile-changed',() => { hide(); lexical.clear(); });
    listen(host,'ielts:assessment-mode',event => { assessment = event.detail?.active === true; hide(); });
    listen(host,'ielts:vocabulary-testing',event => { vocabularyTesting = event.detail?.active === true; hide(); });
    listen(popup,'pointerenter',() => { if (hideTimer) host.clearTimeout(hideTimer); hideTimer = null; });
    listen(popup,'pointerleave',() => { hideTimer = host.setTimeout(hide,200); });
    return {lookup:lexical.lookup,enrich:lexical.enrich,show,hide,setTesting(active) { vocabularyTesting = Boolean(active); hide(); },destroy() { destroyed = true; hide(); lexical.clear(); listeners.forEach(fn => fn()); popup.remove(); }};
  }
  return {tokenAt,pointWord,createLookup,createLexicon:options => Dictionary.create(options),install};
});
