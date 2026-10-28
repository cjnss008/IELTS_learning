const test=require('node:test');const assert=require('node:assert/strict');const P=require('../assets/profile-store.js');
function storage(){const map=new Map();return{get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};}
test('默认档案零拷贝保留旧键，新档案独立且旧页面不能误写新档案',()=>{const s=storage();s.setItem('ielts52-daily-plan-v1','old');const m=P.createManager(s,{idFactory:()=> 'p-12345678'});assert.equal(m.current().id,'legacy');const old=m.storage();assert.equal(old.getItem('ielts52-daily-plan-v1'),'old');const p=m.create('家人');m.activate(p.id);assert.equal(m.storage().getItem('ielts52-daily-plan-v1'),null);m.storage().setItem('ielts52-daily-plan-v1','new');assert.equal(s.getItem('ielts52-daily-plan-v1'),'old');assert.throws(()=>old.setItem('ielts52-daily-plan-v1','lost'),/切换/);assert.equal(m.storage().length,1);assert.equal(m.storage().key(0),'ielts52-daily-plan-v1');m.activate('legacy');assert.equal(m.storage().getItem('ielts52-daily-plan-v1'),'old');});
test('preview 档案与正式键完全分离',()=>{const s=storage();const normal=P.createManager(s),preview=P.createManager(s,{preview:true,idFactory:()=> 'p-preview123'});normal.storage().setItem('ielts-x','real');preview.storage().setItem('ielts-x','qa');assert.equal(normal.storage().getItem('ielts-x'),'real');assert.equal(preview.storage().getItem('ielts-x'),'qa');assert.notEqual(normal.scopeKey('audio'),preview.scopeKey('audio'));assert.equal(preview.storage().length,1);});
test('损坏索引和身份注入保留原始数据并拒绝覆盖',()=>{const s=storage();const raw='{"schemaVersion":1,"activeId":"__proto__"}';s.setItem(P.KEY,raw);const m=P.createManager(s);assert.throws(()=>m.current());assert.throws(()=>m.storage());assert.equal(s.getItem(P.KEY),raw);assert.throws(()=>P.parseProfile(JSON.parse('{"id":"legacy","name":"x","createdAt":"2026-01-01","__proto__":{}}')));});
test('不可创建空白名称或覆盖重复档案',()=>{const s=storage(),m=P.createManager(s,{idFactory:()=> 'p-12345678'});assert.throws(()=>m.create('   '));m.create('甲');assert.throws(()=>m.create('乙'),/重复/);assert.equal(m.list().length,2);});

test('user folder hydration barrier and conflict guard run before any profile write',()=>{const s=storage();let ready=false,blocked=false;const gate={assertReady(){if(!ready)throw Error('loading barrier');},assertWritable(){if(blocked)throw Error('conflicting version');}};assert.throws(()=>P.createManager(s,{userData:gate}),/loading barrier/);assert.equal(s.length,0);ready=true;const m=P.createManager(s,{userData:gate}),view=m.storage();view.setItem('ielts52-daily-plan-v1','preserve');blocked=true;assert.throws(()=>view.setItem('ielts52-daily-plan-v1','stale'),/conflicting version/);assert.throws(()=>m.rename('overwrite'),/conflicting version/);assert.equal(s.getItem('ielts52-daily-plan-v1'),'preserve');});

test('repeated answer ownership checks do not enumerate storage, but live switches and identity changes remain guarded',()=>{
 const base=storage();let scans=0;
 const tracked={get length(){scans++;return base.length;},key(i){scans++;return base.key(i);},getItem:base.getItem,setItem:base.setItem,removeItem:base.removeItem};
 const m=P.createManager(tracked,{idFactory:()=> 'p-audit1111'}),p=m.create('Synthetic audit');m.activate(p.id);
 const view=m.storage(),initial=scans;
 for(let i=0;i<200;i++){assert.equal(m.current().id,p.id);assert.equal(m.storage().profileId,p.id);view.setItem('ielts-audit',String(i));}
 assert.equal(scans,initial,'hot-path identity checks must not scan unrelated storage keys');
 const descriptor=P.KEY+':profile:'+p.id;
 base.setItem(descriptor,JSON.stringify({...p,name:'Renamed elsewhere'}));assert.equal(m.current().name,'Renamed elsewhere');
 base.setItem(P.KEY,JSON.stringify({schemaVersion:1,activeId:'legacy'}));assert.equal(m.current().id,'legacy');assert.throws(()=>view.setItem('ielts-audit','wrong owner'),/切换/);
 base.setItem(P.KEY,JSON.stringify({schemaVersion:1,activeId:p.id}));base.setItem(descriptor,JSON.stringify({...p,id:'p-different'}));assert.throws(()=>m.current(),/身份/);
 base.removeItem(descriptor);assert.throws(()=>m.current(),/不存在/);assert.equal(base.getItem('ielts52-profile:'+p.id+':ielts-audit'),'199');
});

test('one live owner identity reads the registry, descriptor and generation once each',()=>{
 const base=storage();let reads=0;const tracked={get length(){return base.length;},key:base.key,getItem(k){reads++;return base.getItem(k);},setItem:base.setItem,removeItem:base.removeItem};
 const m=P.createManager(tracked,{idFactory:()=> 'p-identity111'}),p=m.create('Synthetic owner');m.activate(p.id);m.current();reads=0;
 assert.deepEqual(m.identity(),{profileId:p.id,rawGeneration:null});assert.equal(reads,3);
 base.setItem(m.scopeKey('ielts52-data-generation-v1'),'busy:restore');assert.equal(m.identity().rawGeneration,'busy:restore');
 base.setItem(m.scopeKey('ielts52-data-generation-v1'),'new-generation');assert.equal(m.identity().rawGeneration,'new-generation');
 base.setItem(P.KEY,JSON.stringify({schemaVersion:1,activeId:'legacy'}));assert.equal(m.identity().profileId,'legacy');
});
