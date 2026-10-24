(function(root,factory){'use strict';const api=factory();root.IELTSTextbookLibrary=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const KEY='ielts52-textbook-exposure-v1';
  const validId=id=>typeof id==='string'&&/^(?:pdf-[a-f0-9]{16}|cambridge-\d{1,2}-test-\d{1,2})$/.test(id);
  function plain(value){if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('教材记录格式无效，已保留原记录。');return value;}
  function fields(value,allowed){plain(value);for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!allowed.includes(key)||d.get||d.set)throw Error('教材记录包含不支持的字段。');}}
  function date(value){if(typeof value!=='string'||value.length>40||!Number.isFinite(Date.parse(value)))throw Error('教材记录日期无效。');return new Date(value).toISOString();}
  function parseState(raw){
    if(typeof raw==='string'){if(raw.length>2*1024*1024)throw Error('教材记录文件过大。');raw=JSON.parse(raw);}
    fields(raw,['schemaVersion','items']);if(raw.schemaVersion!==1)throw Error('教材记录版本不支持。');plain(raw.items);
    for(const key of Reflect.ownKeys(raw.items)){const descriptor=Object.getOwnPropertyDescriptor(raw.items,key);if(typeof key!=='string'||descriptor.get||descriptor.set)throw Error('教材记录包含不支持的字段。');}
    const entries=Object.entries(raw.items);if(entries.length>10000)throw Error('教材记录数量异常。');const items=Object.create(null);
    for(const [id,value] of entries){if(!validId(id))throw Error('教材身份无效。');fields(value,['status','updatedAt','firstSeenAt','source','seenCount']);if(!['seen','unseen'].includes(value.status)||!['manual','pdf-open','related-pdf-open'].includes(value.source)||!Number.isInteger(value.seenCount)||value.seenCount<0||value.seenCount>1000000)throw Error('教材曝光记录无效。');const first=value.firstSeenAt===null?null:date(value.firstSeenAt);if(value.status==='seen'&&!first)throw Error('已见记录缺少首次曝光日期。');items[id]={status:value.status,updatedAt:date(value.updatedAt),firstSeenAt:first,source:value.source,seenCount:value.seenCount};}
    return{schemaVersion:1,items};
  }
  function empty(){return{schemaVersion:1,items:Object.create(null)};}
  function createStore(storage){
    if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function')throw Error('教材记录存储不可用。');
    function load(){const raw=storage.getItem(KEY);return raw===null?empty():parseState(raw);}
    function markMany(ids,status,source='manual',now=new Date().toISOString()){
      if(!['seen','unseen'].includes(status)||!['manual','pdf-open','related-pdf-open'].includes(source))throw Error('曝光状态无效。');const time=date(now),state=load();
      for(const id of new Set(ids)){if(!validId(id))throw Error('教材身份无效。');const previous=state.items[id];state.items[id]={status,updatedAt:time,firstSeenAt:previous?.firstSeenAt||(status==='seen'?time:null),source,seenCount:Math.min(1000000,(previous?.seenCount||0)+(status==='seen'?1:0))};}
      storage.setItem(KEY,JSON.stringify(state));return state;
    }
    function restore(raw){const incoming=parseState(raw),current=load();for(const [id,item] of Object.entries(incoming.items)){const old=current.items[id];if(!old){current.items[id]=item;continue;}const latest=old.updatedAt>=item.updatedAt?old:item;const dates=[old.firstSeenAt,item.firstSeenAt].filter(Boolean).sort();current.items[id]={...latest,firstSeenAt:dates[0]||null,seenCount:Math.max(old.seenCount,item.seenCount)};}storage.setItem(KEY,JSON.stringify(current));return current;}
    return{load,markMany,restore};
  }
  function pdfUrl(doc,page=1){if(!doc||typeof doc.path!=='string'||!/^materials\/textbooks\/[^/\\]+\.pdf$/i.test(doc.path)||!Number.isInteger(page)||page<1||(doc.analysis?.pageCount&&page>doc.analysis.pageCount))throw Error('PDF 路径或物理页码无效。');return doc.path.split('/').map(encodeURIComponent).join('/')+'#page='+page;}
  function impactedTests(catalog,doc,anchor){if(anchor?.testId)return[anchor.testId];if(doc.type==='exam')return(doc.tests||[]).map(t=>t.id);return(catalog.documents||[]).filter(d=>d.type==='exam'&&d.editions.some(n=>doc.editions.includes(n))).flatMap(d=>(d.tests||[]).map(t=>t.id));}
  function seen(item){return Boolean(item?.firstSeenAt);}
  function exposure(doc,state){const tests=(doc.tests||[]).map(t=>state.items[t.id]);if(tests.length){const count=tests.filter(seen).length;return{seen:count,total:tests.length,status:count?'seen':tests.every(t=>t?.status==='unseen')?'unseen':'unknown',corrected:tests.some(t=>t?.status==='unseen'&&t.firstSeenAt)};}const item=state.items[doc.id];return{seen:seen(item)?1:0,total:1,status:seen(item)?'seen':item?.status==='unseen'?'unseen':'unknown',corrected:item?.status==='unseen'&&Boolean(item.firstSeenAt)};}
  function matches(doc,filter,state){if(filter.edition&&!doc.editions.includes(Number(filter.edition)))return false;if(filter.type&&doc.type!==filter.type)return false;if(filter.academic&&doc.academicStatus!==filter.academic)return false;if(filter.reserve==='reserved'&&!doc.reserve)return false;if(filter.reserve==='training'&&doc.reserve)return false;const status=exposure(doc,state).status;if(filter.exposure==='seen'&&status!=='seen')return false;if(filter.exposure==='fresh'&&status==='seen')return false;if(filter.search&&!doc.filename.toLocaleLowerCase().includes(filter.search.trim().toLocaleLowerCase()))return false;return true;}
  return Object.freeze({KEY,validId,parseState,createStore,pdfUrl,impactedTests,seen,exposure,matches});
});
