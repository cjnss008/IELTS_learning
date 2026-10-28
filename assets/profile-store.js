(function(root,factory){'use strict';const api=factory(root);root.IELTSProfiles=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const KEY='ielts52-profiles-v1', PREFIX=KEY+':profile:', LEGACY='legacy';
  const validId=id=>typeof id==='string'&&/^(legacy|p-[a-zA-Z0-9-]{8,80})$/.test(id);
  function plain(v){if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))throw Error('档案格式无效。');return v;}
  function allowed(v,keys){plain(v);for(const key of Reflect.ownKeys(v)){const d=Object.getOwnPropertyDescriptor(v,key);if(typeof key!=='string'||!keys.includes(key)||d.get||d.set)throw Error('档案包含不支持的字段。');}}
  function name(value){if(typeof value!=='string'||value.trim().length<1||value.length>40||/[\x00-\x1f\x7f]/.test(value))throw Error('档案名称应为 1–40 个可见字符。');return value.trim();}
  function parseProfile(value){if(typeof value==='string')value=JSON.parse(value);allowed(value,['id','name','createdAt']);if(!validId(value.id)||typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt)))throw Error('档案身份或日期无效。');return{id:value.id,name:name(value.name),createdAt:new Date(value.createdAt).toISOString()};}
  function parseRegistry(raw){const value=typeof raw==='string'?JSON.parse(raw):raw;allowed(value,['schemaVersion','activeId']);if(value.schemaVersion!==1||!validId(value.activeId))throw Error('档案索引无效，已保留原数据。');return{schemaVersion:1,activeId:value.activeId};}
  function makeId(){return'p-'+(root.crypto?.randomUUID?root.crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2));}
  function createManager(storage,options={}){
    if(!storage||typeof storage.getItem!=='function')throw Error('浏览器存储不可用。');
    const preview=Boolean(options.preview),userData=options.userData||(!preview?root.IELTSUserData:null),notify=options.notify||(()=>{}),idFactory=options.idFactory||makeId;
    if(!preview)userData?.assertReady?.();
    const registryKey=preview?'ielts52-profiles-preview-v1':KEY;
    const profilePrefix=preview?registryKey+':profile:':PREFIX;
    const legacy=()=>({id:LEGACY,name:'我的学习档案（原记录）',createdAt:'2026-01-01T00:00:00.000Z'});
    function list(){
      const profiles=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(typeof key==='string'&&key.startsWith(profilePrefix)){const p=parseProfile(storage.getItem(key));if(key!==profilePrefix+p.id)throw Error('档案键与身份不一致，已保留原记录。');profiles.push(p);}}
      if(!profiles.some(p=>p.id===LEGACY))profiles.unshift(legacy());
      if(profiles.length>20)throw Error('本机档案超过 20 个，请先备份。');
      return profiles.sort((a,b)=>a.id===LEGACY?-1:b.id===LEGACY?1:a.createdAt.localeCompare(b.createdAt));
    }
    let initialListChecked=false;
    function current(){
      // Validate the registry once on entry; hot-path ownership checks read only
      // the live active ID and its descriptor. Never cache either mutable value.
      // Scanning every storage key here made every answer check quadratic when
      // the large-text adapter and several profiles were installed.
      if(!initialListChecked){list();initialListChecked=true;}
      const raw=storage.getItem(registryKey),id=raw===null?LEGACY:parseRegistry(raw).activeId,descriptor=storage.getItem(profilePrefix+id);
      if(descriptor===null){if(id===LEGACY)return legacy();throw Error('当前档案不存在，已保留原记录。');}
      const p=parseProfile(descriptor);if(p.id!==id)throw Error('档案键与身份不一致，已保留原记录。');return p;
    }
    function create(label){if(!preview)userData?.assertReady?.();const profiles=list();if(profiles.length>=20)throw Error('最多创建 20 个本地档案。');const p={id:idFactory(),name:name(label),createdAt:new Date().toISOString()};parseProfile(p);if(storage.getItem(profilePrefix+p.id)!==null)throw Error('档案身份重复，请重试。');storage.setItem(profilePrefix+p.id,JSON.stringify(p));notify({type:'created',profile:p});return p;}
    function activate(id){if(!preview)userData?.assertWritable?.(id);const p=list().find(p=>p.id===id);if(!p)throw Error('请选择存在的档案。');storage.setItem(registryKey,JSON.stringify({schemaVersion:1,activeId:id}));notify({type:'activated',profile:p});return p;}
    function rename(label){if(!preview)userData?.assertWritable?.(current().id);const p={...current(),name:name(label)};storage.setItem(profilePrefix+p.id,JSON.stringify(p));notify({type:'renamed',profile:p});return p;}
    function scopeKey(base,id=current().id){if(typeof base!=='string'||!base||base.length>200||!validId(id))throw Error('学习记录键无效。');return(preview?'ielts52-preview:':'')+(id===LEGACY?base:'ielts52-profile:'+id+':'+base);}
    function view(){
      const captured=current().id;const map=base=>scopeKey(base,captured),generation=storage.getItem(map('ielts52-data-generation-v1'));
      function check(){if(!preview)userData?.assertWritable?.(captured);if(String(storage.getItem(map('ielts52-data-generation-v1'))||'').startsWith('busy:'))throw Error('学习档案正在清理或恢复，请到备份中心完成中断恢复后再继续。');if(current().id!==captured)throw Error('学习档案已在另一页切换，请刷新后继续；当前内容尚未写入其他档案。');if(storage.getItem(map('ielts52-data-generation-v1'))!==generation)throw Error('学习记录已重置或恢复，请刷新后继续；旧页面不会写回旧进度。');}
      function keys(){const result=[];for(let i=0;i<storage.length;i++){const k=storage.key(i);if(captured===LEGACY&&!preview){if(k?.startsWith('ielts')&&!k.startsWith('ielts52-profile:')&&!k.startsWith(KEY)&&!k.startsWith('ielts52-preview:'))result.push(k);}else{const marker=(preview?'ielts52-preview:':'')+(captured===LEGACY?'':'ielts52-profile:'+captured+':');if(k?.startsWith(marker))result.push(k.slice(marker.length));}}return result;}
      return{profileId:captured,get length(){return keys().length;},getItem:key=>storage.getItem(map(key)),setItem(key,value){check();storage.setItem(map(key),String(value));},removeItem(key){check();storage.removeItem(map(key));},key:index=>keys()[index]??null};
    }
    function identity(){const p=current();return{profileId:p.id,rawGeneration:storage.getItem(scopeKey('ielts52-data-generation-v1',p.id))};}
    return{KEY:registryKey,current,identity,list,create,activate,rename,scopeKey,storage:view,isPreview:preview,parseProfile,parseRegistry};
  }
  let manager=null,loadedId=null,loadedGeneration;
  function runtime(){if(!manager){const preview=Boolean(root.location&&new URLSearchParams(root.location.search).get('preview')==='1');manager=createManager(preview?root.sessionStorage:root.localStorage,{preview,notify:detail=>root.dispatchEvent?.(new CustomEvent('ielts:profile-changed',{detail}))});loadedId=manager.current().id;loadedGeneration=manager.storage().getItem('ielts52-data-generation-v1');}return manager;}
  function assertFresh(){const value=runtime().identity();if(String(value.rawGeneration||'').startsWith('busy:'))throw Error('学习档案正在清理或恢复，请到备份中心完成中断恢复后再继续。');if(value.profileId!==loadedId||value.rawGeneration!==loadedGeneration)throw Error('学习档案已切换、清空或恢复，请刷新后继续。');return{profileId:value.profileId,generation:value.rawGeneration===null?'initial':String(value.rawGeneration)};}
  function mount(host){
    if(!host||!root.document)return;
    host.replaceChildren();const doc=root.document;
    const title=doc.createElement('strong');title.textContent='当前学习档案';
    const select=doc.createElement('select');select.setAttribute('aria-label','当前学习档案');
    const input=doc.createElement('input');input.type='text';input.maxLength=40;input.placeholder='新档案名称';input.setAttribute('aria-label','新档案名称');
    const createButton=doc.createElement('button');createButton.type='button';createButton.textContent='创建独立档案';
    const switchButton=doc.createElement('button');switchButton.type='button';switchButton.textContent='切换档案';
    const note=doc.createElement('p');note.setAttribute('role','status');note.style.cssText='font-size:12px;color:#60736a;margin:8px 0';
    const row=doc.createElement('div');row.style.cssText='display:flex;align-items:center;flex-wrap:wrap;gap:10px';row.append(title,select,switchButton,input,createButton);host.append(row,note);
    try{const m=runtime();m.list().forEach(p=>{const option=doc.createElement('option');option.value=p.id;option.textContent=p.name;select.append(option);});select.value=m.current().id;note.textContent='原记录保留在默认档案。新档案独立保存学习记录；同一浏览器档案不等于账号级隐私保护。切换前请保存正在编辑的作品。';
      switchButton.onclick=async()=>{try{m.activate(select.value);if(!m.isPreview)await root.IELTSUserData?.syncNow?.({profileId:select.value});root.location.reload();}catch(e){note.textContent=e.message;}};
      createButton.onclick=async()=>{try{const p=m.create(input.value);m.activate(p.id);if(!m.isPreview)await root.IELTSUserData?.syncNow?.({profileId:p.id});root.location.reload();}catch(e){note.textContent=e.message;}};
    }catch(e){note.textContent='档案未能读取：'+e.message;select.disabled=true;switchButton.disabled=true;createButton.disabled=true;}
  }
  if(root.addEventListener){root.addEventListener('storage',event=>{if(event.key===KEY||event.key==='ielts52-profiles-preview-v1'){try{const p=runtime().current();root.dispatchEvent(new CustomEvent('ielts:profile-changed',{detail:{type:'external',profile:p}}));}catch(_){}}});root.addEventListener('ielts:profile-changed',event=>{if(!loadedId||event.detail?.profile?.id===loadedId||!root.document?.body||root.document.getElementById('profileChangedNotice'))return;const box=root.document.createElement('div');box.id='profileChangedNotice';box.setAttribute('role','alert');box.style.cssText='position:fixed;top:0;left:0;right:0;z-index:99999;padding:15px;background:#fff0d1;color:#6e4416;text-align:center';box.textContent='学习档案已切换。请先保留当前未保存的内容，再刷新页面继续。 ';const button=root.document.createElement('button');button.textContent='刷新到当前档案';button.onclick=()=>root.location.reload();box.append(button);root.document.body.append(box);});}
  if(root.addEventListener)root.addEventListener('storage',event=>{try{if(manager&&event.key===manager.scopeKey('ielts52-data-generation-v1')&&root.document?.body&&!root.document.getElementById('profileGenerationNotice')){const box=root.document.createElement('div');box.id='profileGenerationNotice';box.setAttribute('role','alert');box.style.cssText='position:fixed;top:0;left:0;right:0;z-index:99999;padding:15px;background:#fff0d1;color:#6e4416;text-align:center';box.textContent='学习记录正在另一页清理或恢复。当前页暂停写入；请先保留尚未保存的内容，再刷新。 ';const button=root.document.createElement('button');button.textContent='刷新记录';button.onclick=()=>root.location.reload();box.append(button);root.document.body.append(box);}}catch(_){}});
  return Object.freeze({KEY,LEGACY,createManager,parseProfile,parseRegistry,assertFresh,current:()=>runtime().current(),list:()=>runtime().list(),create:n=>runtime().create(n),activate:id=>runtime().activate(id),rename:n=>runtime().rename(n),storage:()=>runtime().storage(),scopeKey:key=>runtime().scopeKey(key),isPreview:()=>runtime().isPreview,mount});
});
