(function(root,factory){const api=factory(root);root.IELTSProfileReset=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const GENERATION='ielts52-data-generation-v1',ARCHIVE='ielts52-recovery-points-v1';
 const DATABASES=[['ielts52-learning-records-v1','records','id'],['ielts-media-v1','works','id'],['ielts-diagnostic-audio-v1','clips',null]];
 const clearKeys=keys=>Object.keys(keys).filter(k=>k!=='ielts40-translation-visible');
 function createService({storage,sessionStorage,keys,databases,archive,profileId,assertCurrent=()=>{},notify=()=>{},clock=()=>new Date(),lock=run=>run(),validateEntry=()=>{},checkpoint=async()=>{}}){
  let busy=false;
  async function exclusive(run){if(busy)throw Error('上一项档案操作尚未结束。');busy=true;try{return await lock(async()=>{assertCurrent();return run();});}finally{busy=false;}}
  async function capture(reason){
   const entries={},session={};for(const key of clearKeys(keys)){const raw=storage.getItem(key);if(raw!==null)entries[key]=raw;}
   const cache='ielts52-selection-ai-cache-v1',cached=sessionStorage?.getItem(cache);if(cached!=null)session[cache]=cached;
   const stores=[];for(const db of databases){const rows=await db.read();assertCurrent();stores.push({name:db.name,rows});}
   return {id:'point-'+clock().getTime()+'-'+Math.random().toString(36).slice(2),schemaVersion:1,profileId,createdAt:clock().toISOString(),reason,entries,session,stores};
  }
  async function prune(){const points=await archive.list();for(const old of points.filter(p=>p.profileId===profileId).sort((a,b)=>(b.updatedAt||b.createdAt).localeCompare(a.updatedAt||a.createdAt)).slice(3))await archive.remove(old.id);}
  async function savePoint(reason){const point=await capture(reason);await archive.put(point);assertCurrent();await prune();await checkpoint({allowBusy:true});return point;}
  function validate(point){if(!point||point.schemaVersion!==1||point.profileId!==profileId||!point.entries||!Array.isArray(point.stores)||point.stores.length!==databases.length||Object.keys(point.entries).some(k=>!clearKeys(keys).includes(k))||point.stores.some((s,i)=>s.name!==databases[i].name||!Array.isArray(s.rows)))throw Error('恢复点与当前档案不匹配。');for(const [key,raw]of Object.entries(point.entries)){if(typeof raw!=='string')throw Error('恢复点文字记录无效。');validateEntry(key,raw);}}
  async function apply(point){
   validate(point);assertCurrent();
   for(let i=0;i<databases.length;i++){assertCurrent();await databases[i].replace(point.stores[i].rows);}
   assertCurrent();for(const key of clearKeys(keys)){if(Object.hasOwn(point.entries,key))storage.setItem(key,key==='ielts52-study-timer-v1'?JSON.stringify(root.IELTSStudyTimerCore.restore(point.entries[key])):point.entries[key]);else storage.removeItem(key);}
   const cache='ielts52-selection-ai-cache-v1';if(sessionStorage){if(point.session?.[cache]!=null)sessionStorage.setItem(cache,point.session[cache]);else sessionStorage.removeItem(cache);}
  }
  function signal(){const value=String(clock().getTime())+'-'+Math.random().toString(36).slice(2);storage.setItem(GENERATION,value);notify(value);}
  async function fenced(point,run){
   const marker='busy:'+point.id+':'+clock().getTime();storage.setItem(GENERATION,marker);notify(marker);let keepLocked=false;
   try{const captured=await capture(point.reason),stable={...captured,id:point.id,createdAt:point.createdAt};await archive.put(stable);assertCurrent();await checkpoint({allowBusy:true});return await run(stable);}
   catch(error){keepLocked=error.keepLocked===true;throw error;}
   finally{assertCurrent();if(!keepLocked)signal();await checkpoint({allowBusy:true});}
  }
  async function reset(){return exclusive(async()=>{
   const initial=await savePoint('清空前');return fenced(initial,async point=>{
    const empty={...point,entries:{},session:{},stores:point.stores.map(s=>({...s,rows:[]}))};
    try{await apply(empty);}catch(e){try{await apply(point);}catch{const error=Error('清理中断且无法完整回滚。清理前恢复点仍在，请通过恢复按钮还原。');error.keepLocked=true;throw error;}throw Error('清理未完成，原记录已还原；请刷新学习页后继续。');}
    return point;
   });
  });}
  async function restore(id){return exclusive(async()=>{
   const point=await archive.get(id);validate(point);const initial=await savePoint('恢复前');return fenced(initial,async before=>{
    try{await apply(point);}catch{try{await apply(before);}catch{const error=Error('恢复中断，请保留恢复点并重试。');error.keepLocked=true;throw error;}throw Error('恢复未完成，已还原操作前记录；请刷新学习页后继续。');}
    return point;
   });
  });}
  function hasLearning(point){if(point.stores.some(store=>store.rows.length))return true;for(const raw of Object.values(point.entries)){try{const data=JSON.parse(raw);if(data&&typeof data==='object'&&Object.entries(data).some(([key,value])=>['records','drafts','items','days','assessments','rounds','history','exposures'].includes(key)&&value&&typeof value==='object'&&Object.keys(value).length))return true;}catch(_){}}return false;}
  async function autoBackup(){return exclusive(async()=>{
   if(String(storage.getItem(GENERATION)||'').startsWith('busy:'))return null;
   const points=await archive.list(),same=points.filter(p=>p.profileId===profileId&&p.reason==='每日自动'&&new Date(p.createdAt).toDateString()===clock().toDateString()).sort((a,b)=>(b.updatedAt||b.createdAt).localeCompare(a.updatedAt||a.createdAt))[0],captured=await capture('每日自动');if(!hasLearning(captured))return null;
   const point={...captured,...(same?{id:same.id,createdAt:same.createdAt}:{}),updatedAt:clock().toISOString()};await archive.put(point);assertCurrent();await prune();return point;
  });}
  return {reset,restore,autoBackup,interrupted:()=>{const raw=storage.getItem(GENERATION)||'';return raw.startsWith('busy:')?raw.split(':')[1]:null;},recoverInterrupted:async()=>{const raw=storage.getItem(GENERATION)||'',id=raw.startsWith('busy:')?raw.split(':')[1]:null;if(!id)throw Error('当前没有中断的清理或恢复。');return restore(id);},list:async()=>(await archive.list()).filter(p=>p.profileId===profileId).sort((a,b)=>(b.updatedAt||b.createdAt).localeCompare(a.updatedAt||a.createdAt))};
 }
 async function database(name,store,keyPath){
  return new Promise((resolve,reject)=>{const req=root.indexedDB.open(name,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(store))req.result.createObjectStore(store,keyPath?{keyPath}:undefined);};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error('无法打开本地恢复库，未清空学习数据。'));req.onblocked=()=>reject(Error('档案被旧页面占用，请关闭其他学习页再试。'));});
 }
 function adapter(name,store,keyPath){
  async function transact(mode,run){const db=await database(name,store,keyPath);return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode);let result;tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=tx.onabort=()=>{db.close();reject(Error('本地档案操作未完成，可能存储空间不足。'));};try{run(tx.objectStore(store),v=>{result=v;});}catch(e){tx.abort();reject(e);}});}
  return {name,read:()=>transact('readonly',(s,done)=>{const values=s.getAll(),keys=s.getAllKeys();keys.onsuccess=()=>done(keys.result.map((key,i)=>({key,value:values.result[i]})));}),replace:rows=>transact('readwrite',s=>{s.clear();for(const row of rows){if(s.keyPath)s.put(row.value);else s.put(row.value,row.key);}}),list:()=>transact('readonly',(s,done)=>{s.getAll().onsuccess=e=>done(e.target.result);}),get:id=>transact('readonly',(s,done)=>{s.get(id).onsuccess=e=>done(e.target.result);}),put:value=>transact('readwrite',s=>s.put(value)),remove:id=>transact('readwrite',s=>s.delete(id))};
 }
 let service;
 function runtime(){if(service)return service;const p=root.IELTSProfiles,profileId=p.current().id,scope=p.scopeKey,raw=p.isPreview()?root.sessionStorage:root.localStorage,mapped=Object.fromEntries([...Object.keys(root.IELTSBackup.KEYS),GENERATION,'ielts52-selection-ai-cache-v1'].map(k=>[k,scope(k)]));
  service=createService({storage:{getItem:k=>raw.getItem(mapped[k]),setItem:(k,v)=>raw.setItem(mapped[k],v),removeItem:k=>raw.removeItem(mapped[k])},sessionStorage:{getItem:k=>root.sessionStorage.getItem(scope(k)),setItem:(k,v)=>root.sessionStorage.setItem(scope(k),v),removeItem:k=>root.sessionStorage.removeItem(scope(k))},keys:root.IELTSBackup.KEYS,databases:DATABASES.map(([n,s,k])=>adapter(scope(n),s,k)),archive:adapter(scope(ARCHIVE),'points','id'),profileId,checkpoint:options=>p.isPreview()?Promise.resolve():root.IELTSUserData?.syncNow?.({profileId,...options}),lock:run=>root.navigator?.locks?root.navigator.locks.request(scope('ielts52-recovery-lock'),{mode:'exclusive'},run):run(),validateEntry:(key,value)=>root.IELTSBackup.validate(key,value),assertCurrent:()=>{if(p.current().id!==profileId)throw Error('档案已切换，请刷新再操作。');},notify:value=>root.dispatchEvent(new CustomEvent('ielts:profile-reset',{detail:{profileId,value}}))});return service;
 }
 function confirmAction(message,confirmLabel='确认清空'){
  return new Promise(resolve=>{const doc=root.document,dialog=doc.createElement('dialog'),title=doc.createElement('h3'),copy=doc.createElement('p'),actions=doc.createElement('p'),cancel=doc.createElement('button'),accept=doc.createElement('button');dialog.id='profileResetDialog';dialog.setAttribute('aria-labelledby','profileResetDialogTitle');dialog.style.cssText='max-width:560px;width:calc(100% - 48px);padding:28px;border:1px solid #9bb4a5;border-radius:16px;background:#fffdf7;color:#203c2f;box-shadow:0 16px 70px #0005';title.id='profileResetDialogTitle';title.textContent=confirmLabel==='确认清空'?'清空当前学习进度？':'恢复学习快照？';copy.textContent=message;copy.style.cssText='line-height:1.8;white-space:pre-wrap';cancel.type=accept.type='button';cancel.id='profileResetCancel';accept.id='profileResetConfirm';cancel.className='button secondary';accept.className='button primary';cancel.textContent='取消';accept.textContent=confirmLabel;actions.append(cancel,doc.createTextNode(' '),accept);dialog.append(title,copy,actions);let settled=false;const previous=doc.activeElement;function finish(result){if(settled)return;settled=true;dialog.close();dialog.remove();if(previous?.isConnected)previous.focus();resolve(result);}cancel.onclick=()=>finish(false);accept.onclick=()=>finish(true);dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});dialog.addEventListener('close',()=>{if(!settled)finish(false);});doc.body.append(dialog);dialog.showModal();cancel.focus();});
 }
 async function mount(host){if(!host)return;host.innerHTML='<h2>重新开始与本档案恢复点</h2><p>清空当前档案的进度、草稿、错题、评阅和录音。AI、阿里云配置、费用记录、教材、显示偏好及其他档案保留。正式清空前先保存完整备份，可在上方按日期恢复。下方兼容旧记录的本档案恢复点最多保留三份；完整日备份另行保留最近 30 个备份日。</p><button type="button" id="resetLearning" class="button secondary">清空进度，保留 AI 配置</button><p role="status" id="resetStatus"></p><div id="recoveryPoints"></div>';
  const status=host.querySelector('#resetStatus'),button=host.querySelector('#resetLearning'),noticeKey=root.IELTSProfiles.scopeKey('ielts52-reset-notice');
  const previousNotice=root.sessionStorage.getItem(noticeKey);if(previousNotice){status.textContent=previousNotice;root.sessionStorage.removeItem(noticeKey);}
  function reloadAfterAction(message){root.sessionStorage.setItem(noticeKey,message);root.location.hash='resetPanel';root.location.reload();}
  async function render(){const points=await runtime().list(),box=host.querySelector('#recoveryPoints');box.replaceChildren();for(const point of points){const row=root.document.createElement('p'),restore=root.document.createElement('button');row.append(root.document.createTextNode(new Date(point.updatedAt||point.createdAt).toLocaleString()+' · '+point.reason+' '));restore.textContent='恢复此快照';restore.onclick=async()=>{if(!await confirmAction('将当前学习记录替换为此快照，当前记录会先保存恢复点。AI 与阿里云配置保留。','确认恢复'))return;restore.disabled=true;try{await runtime().restore(point.id);reloadAfterAction('已恢复该快照，作品、草稿与录音清单已刷新。');}catch(e){status.textContent=e.message;}finally{restore.disabled=false;}};row.append(restore);box.append(row);}}
  button.onclick=async()=>{if(!await confirmAction('当前档案：'+root.IELTSProfiles.current().name+'\n进度、草稿、错题和录音会清空。程序先保留原记录；如果保存未成功，不会开始清空。\nAI 与阿里云配置、教材和其他档案保留。其他电脑的旧缓存会在连接后自动更新，不能把旧进度写回来。'))return;button.disabled=true;try{if(!root.IELTSProfiles.isPreview()&&root.IELTSUserData?.resetProfile){await root.IELTSUserData.resetProfile({profileId:root.IELTSProfiles.current().id});reloadAfterAction('学习进度已清空，AI 与语音配置保留；其他设备会自动读取新的起点。');}else{const point=await runtime().reset();reloadAfterAction('学习进度已清空，AI 与语音配置保留。恢复点：'+new Date(point.createdAt).toLocaleString()+'。');}}catch(e){status.textContent=e.message;}finally{button.disabled=false;}};
  try{await render();if(runtime().interrupted()){status.textContent='上次清理或恢复被中断。学习写入已暂停，请恢复中断前快照。';const recover=root.document.createElement('button');recover.textContent='恢复中断前快照并解除写入暂停';recover.type='button';recover.onclick=async()=>{recover.disabled=true;try{await runtime().recoverInterrupted();reloadAfterAction('已恢复中断前快照，学习写入已恢复。');}catch(error){status.textContent=error.message;recover.disabled=false;}};host.append(recover);}}catch(e){status.textContent=e.message;button.disabled=true;}
 }
 if(root.document){let autoTimer=null;function scheduleAuto(){clearTimeout(autoTimer);autoTimer=setTimeout(async()=>{if(!root.IELTSBackup||!root.IELTSProfiles||root.IELTSProfiles.isPreview())return;try{const point=await runtime().autoBackup();root.dispatchEvent(new CustomEvent('ielts:auto-backup',{detail:{ok:true,created:!!point}}));}catch(error){if(error.message.includes('上一项档案操作尚未结束')){scheduleAuto();return;}root.dispatchEvent(new CustomEvent('ielts:auto-backup',{detail:{ok:false,error:error.message}}));}},500);}root.addEventListener('DOMContentLoaded',()=>mount(root.document.getElementById('resetPanel')));root.addEventListener('ielts:records-changed',scheduleAuto);}
 return {GENERATION,ARCHIVE,DATABASES,clearKeys,createService,confirmAction,mount,autoBackup:()=>runtime().autoBackup()};
});
