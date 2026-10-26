(function(root,factory){'use strict';const api=factory(root);root.IELTSRecords=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const KEY='ielts52-learning-records-v1', EVENT='ielts:records-changed', SKILLS=['vocabulary','grammar','listening','reading','speaking','writing','reflection','review'], MAX_RECORDS=10000, HOUR=3600000;
  const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
  function object(value,name){if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error(name+'必须是普通对象。');return value;}
  function fields(value,allowed,name){object(value,name);for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!allowed.includes(key)||d.get||d.set)throw Error(name+'包含不支持的字段。');}}
  function text(value,min,max,name){if(typeof value!=='string'||value.length>max||value.trim().length<min||/[\u0000]/.test(value))throw Error(name+'长度或格式不正确。');return value;}
  function id(value,name='记录ID'){if(typeof value!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(value)||['constructor','prototype','__proto__'].includes(value))throw Error(name+'无效。');return value;}
  function number(value,min,max,name,integer=false){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value)))throw Error(name+'超出范围。');return value;}
  function timestamp(value,name,now){if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value||(now!==undefined&&Date.parse(value)>now))throw Error(name+'不是有效时间或位于未来。');return value;}
  function array(value,max,name){if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>max||Object.keys(value).length!==value.length)throw Error(name+'不是有效数组。');for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||d.get||d.set)throw Error(name+'不得有空项或访问器。');}return value;}
  const copy=value=>JSON.parse(JSON.stringify(value));
  function stable(value){if(Array.isArray(value))return'['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';return JSON.stringify(value);}
  function assistance(value={hint:false,answer:false,ai:false}){fields(value,['hint','answer','ai'],'辅助标记');const result={};for(const key of ['hint','answer','ai']){if(typeof value[key]!=='boolean')throw Error('辅助标记必须为布尔值。');result[key]=value[key];}return result;}
  function evaluation(value={method:'none',result:'pending',feedback:''}){
    fields(value,['method','result','feedback','score','maxScore','criteria','threshold'],'评价');
    if(!['objective','ai','self','none'].includes(value.method)||!['pass','revise','pending','unverified'].includes(value.result))throw Error('评价来源或状态无效。');
    const result={method:value.method,result:value.result,feedback:text(value.feedback??'',0,24000,'反馈')};
    if(value.score!==undefined)result.score=number(value.score,0,100000,'得分');
    if(value.maxScore!==undefined)result.maxScore=number(value.maxScore,0.001,100000,'总分');
    if(result.score!==undefined&&result.maxScore!==undefined&&result.score>result.maxScore)throw Error('得分不能大于总分。');
    if(value.threshold!==undefined)result.threshold=number(value.threshold,0.5,1,'内部正确率门槛');
    if(value.criteria!==undefined)result.criteria=array(value.criteria,16,'评价维度').map(x=>text(x,1,1000,'维度说明'));
    if(result.method==='objective'&&result.result==='pass'&&(!own(result,'score')||!own(result,'maxScore')||result.score/result.maxScore<(result.threshold??0.8)))throw Error('客观题通过记录须保留达到内部门槛的原始正确数。');
    return result;
  }
  function media(value=[]){return array(value,8,'录音引用').map(item=>{fields(item,['id','name','mime','durationSeconds'],'录音引用');return{id:id(item.id,'录音ID'),name:text(item.name,1,200,'录音名称'),mime:text(item.mime,1,100,'录音类型'),durationSeconds:number(item.durationSeconds,0,3600,'录音时长')};});}
  function makeId(prefix='attempt'){if(!/^[a-zA-Z][a-zA-Z0-9-]{0,20}$/.test(prefix))throw Error('ID前缀无效。');return prefix+'-'+(root.crypto?.randomUUID?root.crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2));}
  const INPUT_FIELDS=['id','materialId','materialVersion','title','skill','source','dayNumber','taskId','answer','minutes','quantity','unit','assistance','kind','parentId','evaluation','media','notes','exposure','startedAt','submittedAt','createdAt','activeSeconds','elapsedSeconds'];
  function cleanInput(input,now=new Date().toISOString()){
    fields(input,INPUT_FIELDS,'作品');const nowMs=Date.parse(timestamp(now,'当前时间'));
    const result={id:id(input.id),materialId:id(input.materialId,'材料ID'),materialVersion:text(input.materialVersion??'',0,100,'材料版本'),title:text(input.title,1,240,'作品标题'),skill:input.skill,source:text(input.source,1,80,'记录来源'),answer:text(input.answer??'',0,50000,'原始作品'),minutes:number(input.minutes??0,0,1440,'有效分钟'),quantity:number(input.quantity??0,0,100000,'完成数量',true),unit:text(input.unit??'',0,80,'数量单位'),assistance:assistance(input.assistance),kind:input.kind??'original',evaluation:evaluation(input.evaluation),media:media(input.media),notes:text(input.notes??'',0,4000,'作品备注'),exposure:input.exposure??'unknown'};
    if(!SKILLS.includes(result.skill)||!['original','correction','retest'].includes(result.kind)||!['unseen','seen','unknown'].includes(result.exposure))throw Error('作品技能、阶段或曝光状态无效。');
    if(!result.answer.trim()&&!result.media.length)throw Error('作品须有原始答案、文字或录音引用；不能只保存打卡。');
    if(input.dayNumber!==undefined&&input.dayNumber!==null)result.dayNumber=number(input.dayNumber,1,365,'学习日',true);else result.dayNumber=null;
    result.taskId=input.taskId??result.skill;if(!SKILLS.includes(result.taskId))throw Error('关联任务无效。');
    result.parentId=input.parentId===undefined||input.parentId===null?null:id(input.parentId,'前一作品ID');
    if(result.parentId===result.id||(result.kind==='original'&&result.parentId)||(result.kind!=='original'&&!result.parentId))throw Error('订正或复测须关联另一份已有作品。');
    result.submittedAt=timestamp(input.submittedAt??input.createdAt??now,'提交时间',nowMs);result.createdAt=timestamp(input.createdAt??result.submittedAt,'创建时间',nowMs);
    result.startedAt=timestamp(input.startedAt??result.createdAt,'开始时间',nowMs);
    if(result.startedAt>result.submittedAt||result.createdAt>result.submittedAt)throw Error('作品时间顺序无效。');
    result.elapsedSeconds=number(input.elapsedSeconds??Math.max((Date.parse(result.submittedAt)-Date.parse(result.startedAt))/1000,(input.activeSeconds??result.minutes*60)),0,86400,'经过秒数');
    result.activeSeconds=number(input.activeSeconds??result.minutes*60,0,86400,'有效秒数');
    if(result.activeSeconds>result.elapsedSeconds+0.001||result.minutes*60>result.activeSeconds+0.001)throw Error('有效时间不得超过经过时间，记录分钟不得超过有效时间。');
    return result;
  }
  function cleanRecord(value,now){
    fields(value,INPUT_FIELDS.concat(['version','history']),'作品记录');
    const input={};INPUT_FIELDS.forEach(k=>{if(own(value,k))input[k]=value[k];});const record=cleanInput(input,now);
    number(value.version,1,40,'作品版本',true);
    const history=array(value.history,40,'修订历史').map((item,index)=>{fields(item,['version','at','changeId','evaluation','assistance','notes'],'修订历史');if(item.version!==index+1)throw Error('修订版本不连续。');return{version:item.version,at:timestamp(item.at,'修订时间',Date.parse(now)),changeId:id(item.changeId,'修订ID'),evaluation:evaluation(item.evaluation),assistance:assistance(item.assistance),notes:text(item.notes??'',0,4000,'修订备注')};});
    if(history.length!==value.version||!history.length||new Set(history.map(h=>h.changeId)).size!==history.length)throw Error('修订历史缺失或重复。');
    for(let i=0;i<history.length;i++){if(history[i].at<record.createdAt||(i&&history[i].at<history[i-1].at))throw Error('修订日期倒退。');if(i&&['hint','answer','ai'].some(k=>history[i-1].assistance[k]&&!history[i].assistance[k]))throw Error('修订不得撤销已经使用的辅助标记。');}
    const latest=history.at(-1);if(stable(latest.evaluation)!==stable(record.evaluation)||stable(latest.assistance)!==stable(record.assistance)||latest.notes!==record.notes)throw Error('当前记录与修订历史不一致。');
    return{...record,version:value.version,history};
  }
  function parseState(value,now=new Date().toISOString()){
    if(typeof value==='string'){if(value.length>128*1024*1024)throw Error('作品备份超过 128 MB。');try{value=JSON.parse(value);}catch{throw Error('作品备份不是有效JSON。');}}
    fields(value,['schemaVersion','records'],'作品备份');if(value.schemaVersion!==1)throw Error('作品备份版本不支持。');
    const records=array(value.records,MAX_RECORDS,'作品集合').map(r=>cleanRecord(r,now));const ids=new Set(records.map(r=>r.id));if(ids.size!==records.length)throw Error('作品ID重复。');
    const byId=new Map(records.map(r=>[r.id,r]));
    for(const record of records){if(record.parentId){const parent=byId.get(record.parentId);if(!parent)throw Error('订正或复测缺少前一作品。');if(record.createdAt<parent.createdAt||record.skill!==parent.skill)throw Error('订正或复测与原作品的时间、技能不一致。');const seen=new Set([record.id]);let cur=parent;while(cur){if(seen.has(cur.id))throw Error('作品关联不能循环。');seen.add(cur.id);cur=cur.parentId?byId.get(cur.parentId):null;}}}
    return{schemaVersion:1,records:records.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))};
  }
  function newState(){return{schemaVersion:1,records:[]};}
  function put(state,input,now=new Date().toISOString()){
    state=parseState(state,now);const clean=cleanInput(input,now),existing=state.records.find(r=>r.id===clean.id);
    if(existing)clean.exposure=existing.exposure;
    else if(state.records.some(r=>r.materialId===clean.materialId))clean.exposure='seen';
    if(existing){const fixed=r=>{const v={...r};for(const k of ['history','version','evaluation','notes','assistance','createdAt','submittedAt','startedAt'])delete v[k];return v;};if(stable(fixed(existing))!==stable(fixed(clean)))throw Error('同一作品ID的原始内容不可改写，请创建订正版本并关联原作品。');return{state,record:existing,duplicate:true};}
    if(state.records.length>=MAX_RECORDS)throw Error('作品达到本机上限，请先导出归档。');
    const record={...clean,version:1,history:[{version:1,at:clean.createdAt,changeId:clean.id,evaluation:copy(clean.evaluation),assistance:copy(clean.assistance),notes:clean.notes}]};
    state.records.push(record);state=parseState(state,now);return{state,record:state.records.find(r=>r.id===record.id),duplicate:false};
  }
  function updateState(state,recordId,patch,changeId,now=new Date().toISOString()){
    state=parseState(state,now);id(recordId);id(changeId,'修订ID');fields(patch,['evaluation','assistance','notes'],'更新内容');const record=state.records.find(r=>r.id===recordId);if(!record)throw Error('原作品不存在。');
    const next={evaluation:patch.evaluation===undefined?record.evaluation:evaluation(patch.evaluation),assistance:patch.assistance===undefined?record.assistance:assistance(patch.assistance),notes:patch.notes===undefined?record.notes:text(patch.notes,0,4000,'备注')};
    for(const k of ['hint','answer','ai'])if(record.assistance[k])next.assistance[k]=true;
    const prior=record.history.find(h=>h.changeId===changeId);
    if(prior){if(Object.keys(patch).some(k=>stable(prior[k])!==stable(k==='assistance'?next[k]:patch[k])))throw Error('相同修订ID包含不同内容，已保留原记录。');return{state,record,duplicate:true};}
    if(record.version>=40)throw Error('本作品已保存40个版本，请另建关联订正作品。');
    Object.assign(record,next);record.version++;record.history.push({version:record.version,at:timestamp(now,'修订时间'),changeId,evaluation:copy(next.evaluation),assistance:copy(next.assistance),notes:next.notes});
    state=parseState(state,now);return{state,record:state.records.find(r=>r.id===recordId),duplicate:false};
  }
  function mergeStates(left,right,now=new Date().toISOString()){
    const a=parseState(left,now),b=parseState(right,now),map=new Map(a.records.map(r=>[r.id,r]));
    for(const r of b.records){const old=map.get(r.id);if(!old){map.set(r.id,r);continue;}if(stable(old)===stable(r))continue;const newer=r.version>old.version?r:old,older=newer===r?old:r;const base=x=>{const v={...x};for(const k of ['history','version','evaluation','assistance','notes'])delete v[k];return v;};if(stable(base(newer))!==stable(base(older))||stable(newer.history.slice(0,older.history.length))!==stable(older.history))throw Error('作品 '+r.id+' 存在冲突版本，合并已停止且原记录保留。');map.set(r.id,newer);}
    return parseState({schemaVersion:1,records:[...map.values()]},now);
  }
  function indexFamilies(records){
    const map=new Map(records.map(r=>[r.id,r])), roots=new Map(), families=new Map(), firstMaterial=new Map();
    for(const r of [...records].sort((a,b)=>a.submittedAt.localeCompare(b.submittedAt)||a.id.localeCompare(b.id)))if(!firstMaterial.has(r.materialId))firstMaterial.set(r.materialId,r.id);
    for(const record of records){let cur=record,count=0;while(cur.parentId&&map.has(cur.parentId)&&count++<MAX_RECORDS)cur=map.get(cur.parentId);roots.set(record.id,cur.id);if(!families.has(cur.id))families.set(cur.id,[]);families.get(cur.id).push(record);}
    return{roots,families,firstMaterial,statuses:new Map()};
  }
  function familyStatus(family,now,index){
    const base=family.filter(r=>r.kind!=='retest').sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]||family[0];
    const dueAt=new Date(Date.parse(base.submittedAt)+48*HOUR).toISOString(),until=new Date(Date.parse(base.submittedAt)+72*HOUR).toISOString();
    const attempts=family.filter(r=>r.kind==='retest').sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt));
    const latest=attempts.find(r=>Date.parse(r.submittedAt)>=Date.parse(dueAt)&&r.exposure==='unseen'&&r.materialId!==base.materialId&&index.firstMaterial.get(r.materialId)===r.id&&!Object.values(r.assistance).some(Boolean));
    if(latest&&(latest.evaluation.result==='pending'||latest.evaluation.method==='none'))return{state:'pending',label:'最近复测待反馈',dueAt,until,recordId:latest.id};
    if(latest&&(!['objective','ai'].includes(latest.evaluation.method)||latest.evaluation.result==='unverified'))return{state:'self_reported',label:'最近复测结果待验证',dueAt,until,recordId:latest.id};
    if(latest?.evaluation.result==='pass')return{state:latest.evaluation.method==='ai'?'ai_reference_passed':'retest_passed',label:latest.evaluation.method==='ai'?'AI参考复测通过':'独立新题复测通过',dueAt,until,recordId:latest.id};
    if(latest?.evaluation.result==='revise')return{state:'needs_correction',label:'最近复测仍需订正',dueAt,until,recordId:latest.id};
    if(base.evaluation.result==='revise'&&base.kind!=='correction')return{state:'needs_correction',label:'需要订正',dueAt,until};
    if(base.evaluation.result==='pending'||base.evaluation.method==='none')return{state:'pending',label:'已留作品，待反馈',dueAt,until};
    const current=Date.parse(now);return{state:current<Date.parse(dueAt)?'scheduled':current<=Date.parse(until)?'retest_due':'retest_overdue',label:current<Date.parse(dueAt)?'等待48小时后复测':current<=Date.parse(until)?'现在可做新题复测':'延迟复测待补',dueAt,until};
  }
  function status(record,records=[],now=new Date().toISOString(),index){
    index=index||indexFamilies(records.length?records:[record]);const rootId=index.roots.get(record.id)||record.id;
    if(!index.statuses.has(rootId))index.statuses.set(rootId,familyStatus(index.families.get(rootId)||[record],now,index));
    const result=index.statuses.get(rootId);
    return record.evaluation.method==='self'||record.source==='legacy-import'?{state:'self_reported',label:'自报作品，掌握待验证',dueAt:result.dueAt,until:result.until}:{...result};
  }
  function recapToken(record){try{const artifact=JSON.parse(record.answer);if(typeof artifact.token==='string')return artifact.token;if(typeof artifact.activity?.token==='string')return artifact.activity.token;return JSON.parse(artifact.activity?.answer||'{}').token||null;}catch(_){return null;}}
  function summary(records,dayNumber,now=new Date().toISOString(),index){
    index=index||indexFamilies(records);
    const selected=records.filter(r=>r.dayNumber===dayNumber).sort((a,b)=>a.submittedAt.localeCompare(b.submittedAt)||a.id.localeCompare(b.id)),tasks={},intervals=[],credited=new Map();
    let recap=null,recapCredited=false;if(selected.some(r=>r.skill==='reflection'&&r.unit==='份复盘'))try{recap=root.IELTSMistakes?.forDay(dayNumber)||null;}catch(_){}
    const latestOutputs=new Map(),corrections=new Map();for(const record of selected)if(['writing','speaking'].includes(record.skill)&&record.unit==='词')latestOutputs.set(record.skill+':'+record.materialId,record);
    for(const [key,record]of latestOutputs)try{const corrected=root.IELTSMistakes?.recordCorrectionStatus?.(record);if(corrected?.corrected===true&&Number.isInteger(corrected.quantity)&&corrected.quantity>=0)corrections.set(key,{...corrected,recordId:record.id});}catch(_){}
    for(const r of selected){const end=Date.parse(r.submittedAt),start=end-r.minutes*60000;let overlap=0;for(const [a,b]of intervals)overlap+=Math.max(0,Math.min(end,b)-Math.max(start,a));credited.set(r.id,Math.max(0,r.minutes-overlap/60000));if(end>start){intervals.push([start,end]);intervals.sort((a,b)=>a[0]-b[0]);for(let i=1;i<intervals.length;){if(intervals[i][0]<=intervals[i-1][1]){intervals[i-1][1]=Math.max(intervals[i-1][1],intervals[i][1]);intervals.splice(i,1);}else i++;}}}
    for(const r of selected){const t=tasks[r.taskId]||(tasks[r.taskId]={count:0,minutes:0,claimedMinutes:0,quantities:Object.create(null),independent:0,assisted:0,needsCorrection:0,retestPassed:0,aiReferencePassed:0,records:[]});t.count++;t.minutes+=credited.get(r.id);t.claimedMinutes+=r.minutes;let quantity=r.quantity,mistakeReview=null;const corrected=corrections.get(r.skill+':'+r.materialId);if(corrected&&r.unit==='词'){quantity=r.id===corrected.recordId?corrected.quantity:0;if(r.id===corrected.recordId){mistakeReview={...corrected,source:'mistake-book'};(t.correctedOutputs||(t.correctedOutputs=[])).push(mistakeReview);}}if(r.skill==='reflection'&&r.unit==='份复盘'){const valid=r.source==='mistake-review'&&r.evaluation.method==='ai'&&r.evaluation.result==='pass'&&recap?.completionValid===true&&recap.remaining===0&&recapToken(r)===recap.token;quantity=valid&&!recapCredited?Math.min(1,r.quantity):0;if(quantity)recapCredited=true;}if(r.unit)t.quantities[r.unit]=(t.quantities[r.unit]||0)+quantity;Object.values(r.assistance).some(Boolean)?t.assisted++:t.independent++;const s=status(r,records,now,index);if(s.state==='needs_correction')t.needsCorrection++;if(s.state==='retest_passed'&&s.recordId===r.id)t.retestPassed++;if(s.state==='ai_reference_passed'&&s.recordId===r.id)t.aiReferencePassed++;t.records.push({...r,learningStatus:s,...(mistakeReview?{mistakeReview,creditedQuantity:quantity}:{})});}
    for(const t of Object.values(tasks))t.minutes=Math.floor(t.minutes*100)/100;
    return{records:selected,totalRecords:selected.length,tasks,minutes:Math.floor([...credited.values()].reduce((n,m)=>n+m,0)*100)/100,claimedMinutes:selected.reduce((n,r)=>n+r.minutes,0)};
  }
  function summaries(records,now=new Date().toISOString()){
    const index=indexFamilies(records), result={};for(const day of new Set(records.map(r=>r.dayNumber).filter(d=>d!==null)))result[day]=summary(records,day,now,index);return result;
  }
  function createMemoryStore(initial=newState()){
    let value=parseState(initial),chain=Promise.resolve();return{read:async()=>copy(value),transaction(fn){const operation=chain.then(()=>{const result=fn(copy(value));value=copy(result.state);return copy(result.value);});chain=operation.catch(()=>{});return operation;}};
  }
  function createStore(adapter,options={}){
    const notify=options.notify||(()=>{}),clock=options.now||(()=>new Date().toISOString());let snapshotBoundary=null;
    return{async list(filter={}){const index=root.IELTSRecordSnapshotIndex;if(index?.available?.()){snapshotBoundary||=index.createStoreBoundary();const records=await snapshotBoundary.read(()=>adapter.read(),clock);return snapshotBoundary.select(records,filter);}const state=parseState(await adapter.read(),clock());return state.records.filter(r=>Object.keys(filter).every(k=>['dayNumber','taskId','skill'].includes(k)&&r[k]===filter[k]));},
      async record(input){const result=await adapter.transaction(state=>{const r=put(state,input,clock());return{state:r.state,value:{record:r.record,duplicate:r.duplicate}};});if(!result.duplicate)notify(result.record);return result;},
      async update(recordId,patch,changeId){const result=await adapter.transaction(state=>{const r=updateState(state,recordId,patch,changeId,clock());return{state:r.state,value:{record:r.record,duplicate:r.duplicate}};});if(!result.duplicate)notify(result.record);return result.record;},
      async exportState(){return parseState(await adapter.read(),clock());},async exportRawState(){return adapter.read();},
      async importState(value,options={}){const incoming=parseState(value,clock());const result=await adapter.transaction(state=>{const next=options.mode==='replace'?incoming:mergeStates(state,incoming,clock());return{state:next,value:{added:next.records.length-state.records.length,total:next.records.length}};});notify(null);return result;}};
  }
  let store=null,connection=null,profileId=null,profileFailure=null;
  try{if(root.document&&root.IELTSProfiles)profileId=root.IELTSProfiles.current().id;}catch(e){profileFailure=e;}
  function checkProfile(){root.IELTSProfiles?.assertFresh?.();if(profileFailure)throw profileFailure;if(root.IELTSProfiles){const active=root.IELTSProfiles.current().id;if(profileId===null)profileId=active;if(active!==profileId)throw Error('档案已切换，请刷新后保存作品。');}}
  function channelName(){return root.IELTSProfiles?root.IELTSProfiles.scopeKey(KEY):KEY;}
  function notify(record){const detail={profileId,id:record?.id||null,dayNumber:record?.dayNumber||null};root.dispatchEvent?.(new CustomEvent(EVENT,{detail}));try{const channel=new BroadcastChannel(channelName());channel.postMessage(detail);channel.close();}catch(_){}}
  function browserStore(){
    checkProfile();if(store)return store;if(!root.indexedDB)throw Error('当前浏览器不支持作品存储，请先复制作品并换用支持IndexedDB的浏览器。');
    const dbName=root.IELTSProfiles?root.IELTSProfiles.scopeKey(KEY):KEY;
    async function db(){if(connection)return connection;connection=await new Promise((resolve,reject)=>{const request=root.indexedDB.open(dbName,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('records'))request.result.createObjectStore('records',{keyPath:'id'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('作品库无法打开，原记录未清空。'));request.onblocked=()=>reject(Error('作品库被旧页面占用，请关闭旧学习页后重试。'));});connection.onversionchange=()=>{connection.close();connection=null;};return connection;}
    const adapter={async read(){checkProfile();const database=await db();return new Promise((resolve,reject)=>{const transaction=database.transaction('records','readonly'),request=transaction.objectStore('records').getAll();request.onsuccess=()=>resolve({schemaVersion:1,records:request.result});request.onerror=()=>reject(Error('作品库未能读取，原记录已保留。'));});},async transaction(fn){checkProfile();const database=await db();return new Promise((resolve,reject)=>{const transaction=database.transaction('records','readwrite'),objectStore=transaction.objectStore('records'),request=objectStore.getAll();let result,failure;request.onsuccess=()=>{try{checkProfile();const next=fn({schemaVersion:1,records:request.result});result=next.value;const retained=new Set(next.state.records.map(r=>r.id));for(const r of request.result)if(!retained.has(r.id))objectStore.delete(r.id);for(const r of next.state.records)objectStore.put(r);}catch(e){failure=e;transaction.abort();}};transaction.oncomplete=()=>resolve(result);transaction.onabort=transaction.onerror=()=>reject(failure||Error('作品未保存，可能空间不足；原记录保留，请导出备份。'));});}};
    store=createStore(adapter,{notify});return store;
  }
  function currentDay(){if(!root.IELTSProfiles)return null;const raw=root.IELTSProfiles.storage().getItem('ielts52-daily-plan-v1');if(raw===null)return null;let plan;try{plan=JSON.parse(raw);}catch{throw Error('日程记录损坏，请先恢复后再自动关联作品。');}if(typeof plan.startDate!=='string'||!/^\d{4}-\d\d-\d\d$/.test(plan.startDate))throw Error('日程开课日期无效。');const start=Date.parse(plan.startDate+'T00:00:00Z');if(!Number.isFinite(start)||new Date(start).toISOString().slice(0,10)!==plan.startDate)throw Error('日程开课日期无效。');const date=new Date(),today=Date.UTC(date.getFullYear(),date.getMonth(),date.getDate());return Math.floor((today-start)/86400000)+1;}
  function placedCourseDay(input,options={}){
    const data=options.data||root.IELTSCurriculumData;if(!data)return null;const player=options.player||root.IELTSCoursePlayer||(typeof require==='function'?require('./course-player.js'):null),queued=player?.queueCourseDay?.(input,{...options,data});if(queued!==null&&queued!==undefined)return queued;if(input.source==='essential-vocabulary'){let a;try{a=JSON.parse(input.answer);}catch(_){return null;}let s;try{s=options.memory||root.IELTSMemory?.read?.();}catch(_){return null;}const b=s?.essential?.batches?.[a?.essentialBatchId],V=options.vocabulary||root.IELTSVocabularyPractice;if(b&&b.courseDay>=2&&b.courseDay<=365&&input.dayNumber===b.courseDay&&a.courseDay===b.courseDay&&input.materialId===b.materialId&&input.skill==='vocabulary'&&input.taskId==='vocabulary'&&input.kind==='original'&&b.draft?.id===input.id&&V?.verifyTrainingArtifact?.(a,{vocabulary:b.words})?.submitted)return b.courseDay;return null;}const placement=options.placement||root.IELTSPlacement||(typeof require==='function'?require('./placement-core.js'):null),route=placement?.currentRoute?.(data);if(!route)return null;
    let artifact;try{artifact=typeof input.answer==='string'?JSON.parse(input.answer):null;}catch(_){return null;}
    const day=artifact?.courseDay;if(artifact?.materialBinding)return null;if(artifact?.schema!==1||!Number.isInteger(day)||day<1||day>365||input.dayNumber!==undefined&&input.dayNumber!==null&&input.dayNumber!==day||!['course-player','vocabulary-practice','mistake-review','year-review'].includes(input.source))return null;
    const base=data.days.find(d=>d.day===day);if(!base)return null;const plan=options.getDay?.(base)||root.IELTSAdaptivePlan?.getDay?.(base)||base,task=plan?.tasks.find(t=>t.id===(input.taskId||input.skill)),material=data.materials.find(m=>m.id===input.materialId);
    const parent=input.kind==='retest'&&input.parentId&&(options.records||[]).find(r=>r.id===input.parentId),parentMaterial=parent&&data.materials.find(m=>m.id===parent.materialId),gateRetest=material?.pool==='gate'&&material.form==='B'&&parent?.skill===input.skill&&parentMaterial?.pool==='gate'&&parentMaterial.form==='A'&&parentMaterial.assessmentGroup&&parentMaterial.assessmentGroup===material.assessmentGroup&&task?.materialIds?.includes(parentMaterial.id);
    return task&&material&&material.skill===input.skill&&(task.materialIds?.includes(material.id)||material.pool==='training'||material.independentBank===true||gateRetest)?day:null;
  }
  function autoLink(input,options={}){const result={...input},day=options.currentDay===undefined?currentDay():options.currentDay,courseDay=placedCourseDay(input,options);if(courseDay!==null){result.dayNumber=courseDay;return result;}let artifact;try{artifact=typeof input.answer==='string'?JSON.parse(input.answer):null;}catch(_){}if(Number.isInteger(day)&&artifact?.materialBinding&&artifact.courseDay>day&&['course-player','vocabulary-practice','mistake-review','year-review'].includes(input.source))throw Error('未来日程仅供预览；这份跨课原稿的真实队列归属尚未核验，草稿保留。');if(result.dayNumber===undefined)result.dayNumber=day!==null&&day>=1&&day<=365?day:null;if(result.dayNumber!==null&&day!==null&&result.dayNumber>day)throw Error('未来日程仅供预览；提前练习请关联实际学习日。');return result;}
  if(root.addEventListener&&typeof root.BroadcastChannel==='function'){try{const channel=new root.BroadcastChannel(channelName());channel.onmessage=event=>{if(event.data?.profileId===profileId)root.dispatchEvent(new CustomEvent(EVENT,{detail:{...event.data,external:true}}));};}catch(_){}}
  async function durable(){if(root.document&&!root.IELTSProfiles?.isPreview?.()&&root.IELTSUserData?.syncNow){try{await root.IELTSUserData.syncNow({profileId:profileId||root.IELTSProfiles?.current?.().id||'legacy'});}catch(error){error.browserCached=true;throw error;}}}
  async function captureRecord(record,context){if(root.IELTSMistakes)await root.IELTSMistakes.captureRecord(record,context);return record;}
  async function record(input,context={}){const target=browserStore(),records=['course-player','vocabulary-practice','mistake-review','year-review'].includes(input.source)||input.kind==='retest'&&input.parentId?await target.list():undefined,result=await target.record(autoLink(input,{records}));await captureRecord(result.record,context);try{await durable();}catch(error){error.committedResult=result;throw error;}return result;}
  async function update(recordId,patch,key,context={}){const record=await captureRecord(await browserStore().update(recordId,patch,key),context);await durable();return record;}
  async function importState(value,options){const result=await browserStore().importState(value,options);if(root.IELTSMistakes)await root.IELTSMistakes.syncRecords(await browserStore().list());await durable();return result;}
  return Object.freeze({KEY,EVENT,makeId,newState,parseState,cleanInput,put,updateState,mergeStates,status,summary,summaries,createMemoryStore,createStore,currentDay,placedCourseDay,autoLink,record,update,list:filter=>browserStore().list(filter),forDay:day=>browserStore().list({dayNumber:day}),exportState:()=>browserStore().exportState(),exportRawState:()=>browserStore().exportRawState(),importState});
});
