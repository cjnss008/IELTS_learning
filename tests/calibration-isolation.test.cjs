'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const client=require('../assets/ai-review.js');
const modes=['calibration','calibration-sample','calibration-round','calibration-report'];
const normal={id:'work-learning-001',kind:'writing',mode:'writing',name:'本人写作',originalText:'I am learning English.',prompt:'Introduce your study.',task:'foundation',level:'A0',createdAt:'2026-10-25T00:00:00.000Z',queueStatus:'pending',version:1};
function entries(){return [normal,...modes.map((mode,i)=>({...normal,id:'work-calibration-'+i,name:'私人参考 '+i,mode}))];}
async function globals(fn){const keys=['IELTSRecords','IELTSProfiles','IELTSMediaLibrary','fetch','document'],old=Object.fromEntries(keys.map(k=>[k,global[k]]));try{await fn();}finally{Object.assign(global,old);}}
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this._value='';this._text='';this.disabled=false;this.checked=false;this.hidden=false;}
 set value(v){this._value=String(v);}get value(){return this.tag==='select'?(this.children.some(o=>o.value===this._value)?this._value:this._value?'':this.children[0]?.value||''):this._value;}
 set textContent(v){this._text=String(v);this.children=[];}get textContent(){return this._text+this.children.map(c=>c.textContent||'').join(' ');}
 append(...c){this.children.push(...c);}replaceChildren(...c){this.children=c;this._text='';if(this.tag==='select')this._value='';}
 querySelectorAll(selector){if(selector.startsWith('input'))return this.children.flatMap(c=>c.children||[]).filter(x=>x.tag==='input'&&x.checked);return [];}
 addEventListener(){}click(){}remove(){}setAttribute(){}
 set innerHTML(v){throw Error('Unexpected HTML injection '+v);}
}
const flush=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};
test('all calibration media are refused before any learning record, queue mutation or model request, including linked and relabelled entries',()=>globals(async()=>{
 const saved=entries(),store=new Map(saved.map(e=>[e.id,e]));let records=0,updates=0,network=0;
 global.IELTSProfiles={current:()=>({id:'preview'})};global.IELTSRecords={record:async()=>{records++;},list:async()=>[]};global.IELTSMediaLibrary={get:async id=>store.get(id),update:async()=>{updates++;return normal;}};global.fetch=async()=>{network++;throw Error('must not send');};
 for(const e of saved.slice(1)){await assert.rejects(client.record(e),/评分校准/);await assert.rejects(client.submit(e),/评分校准/);await assert.rejects(client.record({...e,mode:'writing'}),/评分校准/);await assert.rejects(client.submit({...e,mode:'writing'}),/评分校准/);}
 const child={...normal,id:'work-linked-child',parentId:saved[1].id};store.set(child.id,child);await assert.rejects(client.record(child),/评分校准/);await assert.rejects(client.submit(child),/评分校准/);assert.equal(records,0);assert.equal(updates,0);assert.equal(network,0);
}));
test('supplementary review queue shows learner originals and excludes every calibration subtype',()=>globals(async()=>{
 global.IELTSMediaLibrary={list:async()=>entries()};global.document={createElement:tag=>new Element(tag)};const host=new Element();await client.renderQueue(host,{onLoad:()=>{},onRetry:()=>{}});assert.equal(host.children.length,1);assert.ok(host.textContent.includes('本人写作'));assert.ok(!host.textContent.includes('私人参考'));
}));
test('writing path source picker and direct work links cannot select calibration references or their old linked learning rows',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../assets/writing-path-app.js'),'utf8'),nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Element(/Source$|History$|Step$/.test(id)?'select':'div'));return nodes.get(id);},clock=()=>({pause(){},resume(){},dispose(){},reset(){},snapshot(){return{};}}),saved=entries();let requests=0;
 const root={document:{getElementById:get,createElement:tag=>new Element(tag),addEventListener(){}},location:{search:'?work='+saved[1].id},IELTSProfiles:{current:()=>({id:'preview'}),mount(){}},IELTSMediaLibrary:{list:async()=>saved,get:async id=>saved.find(e=>e.id===id)},IELTSActivity:{browserClock:clock,notify(){}},IELTSRecords:{list:async()=>saved.slice(1).map(e=>({id:e.id,title:e.name,materialId:'old-cal-material',answer:JSON.stringify({text:e.originalText}),source:'ai-coach'}))},IELTSCurriculumData:{materials:[{id:'old-cal-material',prompt:'An old linked prompt.'}]},IELTSYearPlanner:{collectMediaDrafts:()=>[],readBudget:async()=>({remainingMinutes:360,exhausted:false})},IELTSReview:client,fetch:async()=>{requests++;throw Error('must not request for calibration');},AbortController,AbortSignal,URLSearchParams,structuredClone,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},addEventListener(){}};
 vm.runInNewContext(source,{...root,globalThis:root,window:root});await flush();assert.equal(get('writingPathSource').children.length,1);assert.equal(get('writingPathSource').children[0].value,'media:'+normal.id);assert.ok(!get('writingPathSourceInfo').textContent.includes('私人参考'));await get('writingPathCreate').onclick();assert.equal(requests,0);assert.match(get('writingPathMessage').textContent,/真实写作原稿/);
});
test('backup inventory lists calibration separately but preserves all selected original, reference and round IDs in exports',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../assets/backup-app.js'),'utf8'),nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},media=entries();let exported;
 const root={document:{getElementById:get,createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text}),querySelectorAll:()=>[],body:new Element()},IELTSBackup:{KEYS:{}},IELTSRecords:{KEY:'records',list:async()=>[]},IELTSProfiles:{mount(){},storage:()=>({getItem:()=>null}),current:()=>({id:'preview',name:'隔离档案'}),isPreview:()=>false},IELTSMediaLibrary:{list:async()=>media,exportArchive:async ids=>{exported=ids;return new Blob(['{}']);}},URL:{createObjectURL:()=> 'blob:isolated',revokeObjectURL(){}},Blob,Date,setTimeout:()=>1};
 vm.runInNewContext(source,root);await flush();assert.match(get('audioInventory').textContent,/1 份学习/);assert.match(get('audioInventory').textContent,/4 条评分校准/);assert.equal(get('audioChoices').children.length,5);assert.ok(get('audioChoices').children.every(row=>row.children[0].checked));await get('exportAudio').onclick();assert.deepEqual([...exported].sort(),media.map(e=>e.id).sort());
});
