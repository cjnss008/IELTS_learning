'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.join(__dirname,'..'),filename=path.join(root,'tests/memory-page-v94.test.cjs'),marker="test('actual MemoryApp renders",candidate=path.join(root,'assets/memory-app.js');
let source=fs.readFileSync(filename,'utf8');assert(source.includes(marker));source=source.slice(0,source.indexOf(marker)).replace("path.join(base,'assets/memory-app.js')",JSON.stringify(candidate));
const loaded=new Module(filename,module);loaded.filename=filename;loaded.paths=Module._nodeModulePaths(path.dirname(filename));loaded._compile(source+'\nmodule.exports={page,M,tick};',filename);const {page,M,tick}=loaded.exports;
const seed=(entries,now)=>M.observe(M.newState(),entries[0],'spelling',{id:'synthetic-feedback-source',at:new Date(now-3*86400000).toISOString(),correct:true,assisted:true,answer:entries[0].word});
test('objective feedback is visible while durable save is pending; no continue before save',async()=>{
 const f=await page({state:seed});let release;const barrier=new Promise(r=>release=r),record=f.dom.records.record;
 f.dom.records.record=async(...args)=>{await barrier;return record(...args);};
 try{const field=f.host.querySelector('input');field.value='student';await field.fire('input');const sending=f.host.querySelector('form').fire('submit');for(let i=0;i<10;i++)await tick();
 assert.match(f.host.textContent,/本次正确/);assert.match(f.host.textContent,/正在保存原答案/);assert.equal(field.disabled,true);assert(!f.host.querySelectorAll('button').some(b=>b.textContent==='继续本轮复习'));assert.equal((await f.dom.records.list()).length,0);assert.equal(Object.keys(f.dom.memory.read().drafts).length,1);
 release();await sending;assert.equal((await f.dom.records.list()).length,1);assert(f.host.querySelectorAll('button').some(b=>b.textContent==='继续本轮复习'));assert.equal(Object.keys(f.dom.memory.read().drafts).length,0);
 }finally{release();f.close();}
});
test('failed save keeps the exact answer and enables retry, without completion',async()=>{
 const f=await page({state:seed});const record=f.dom.records.record;f.dom.records.record=async()=>{throw Error('synthetic disk unavailable');};
 try{const field=f.host.querySelector('input');field.value='student';await field.fire('input');await f.host.querySelector('form').fire('submit');assert.match(f.host.textContent,/synthetic disk unavailable/);assert.equal(field.value,'student');assert.equal(field.disabled,false);assert.equal(Object.values(f.dom.memory.read().drafts)[0].answer,'student');assert(!f.host.querySelectorAll('button').some(b=>b.textContent==='继续本轮复习'));
 f.dom.records.record=record;await f.host.querySelector('form').fire('submit');assert.equal((await f.dom.records.list()).length,1);
 }finally{f.close();}
});
test('post-commit history refresh failure keeps a retryable continue action without resubmitting',async()=>{
 const f=await page({state:seed});const record=f.dom.records.record,list=f.dom.records.list;let saved=false,fail=true;
 f.dom.records.record=async(...args)=>{const value=await record(...args);saved=true;return value;};f.dom.records.list=async()=>{if(saved&&fail){fail=false;throw Error('synthetic refresh failure');}return list();};
 try{const field=f.host.querySelector('input');field.value='student';await field.fire('input');await f.host.querySelector('form').fire('submit');assert.match(f.host.textContent,/原答案已保存，复习安排尚待刷新/);assert.equal((await list()).length,1);const go=f.host.querySelectorAll('button').find(b=>b.textContent==='继续本轮复习');assert(go);await go.click();assert.equal((await list()).length,1);assert.doesNotMatch(f.host.textContent,/真实作品与记忆记录组件未加载/);
 }finally{f.close();}
});
test('listening playback cannot overwrite feedback during pending save',async()=>{
 const S=require(path.join(root,'assets/memory-session.js'));const f=await page({state:(entries,now)=>{const item={...entries[0],skill:'listening'},state=M.observe(M.newState(),item,'listening',{id:'synthetic-old-listen',at:new Date(now-3*86400000).toISOString(),correct:true,assisted:true,answer:item.word}),draft={...S.makeDraft(item,{id:'memory-synthetic-listening-feedback',courseDay:2,now:now-60000}),answer:item.word,audioCompleted:true};state.drafts[draft.id]=draft;return M.parseState(state);}});let release;const barrier=new Promise(r=>release=r),record=f.dom.records.record;
 f.dom.records.record=async(...args)=>{await barrier;return record(...args);};
 try{const sending=f.host.querySelector('form').fire('submit');for(let i=0;i<10;i++)await tick();const play=f.host.querySelectorAll('button').find(b=>b.textContent==='播放词音');assert(play);assert.equal(play.disabled,true);const before=f.host.textContent;await play.fire('click');assert.equal(f.host.textContent,before);assert.match(before,/正在保存原答案/);release();await sending;assert.equal((await f.dom.records.list()).length,1);
 }finally{release();f.close();}
});
