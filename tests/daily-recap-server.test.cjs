'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createServer}=require('../server/server.cjs');
test('daily recap ignores unsolicited adaptation, repairs an incomplete recap once and does not retry input errors',async()=>{
 const cache=path.resolve(__dirname,'../.cache');fs.mkdirSync(cache,{recursive:true});const dir=fs.mkdtempSync(path.join(cache,'recap-repair-'));
 const valid={recap:'根据今日原始作答及订正，身份句表达有所改善。仍须用新人物和新情境检验迁移，保持先独立作答再参考反馈。明天练习主语与动词搭配，48小时后换题复测。学习时间仅为可用预算，不作为能力证明。'},unsolicited={prioritySkills:['writing','writing'],reason:'无效的旧排课建议',strategies:[],reinforcementMaterialIds:['unoffered']};
 let calls=0,mode='valid',messages=[];
 const server=createServer({materialMigration:false,dataDir:path.join(dir,'user-data'),budgetDir:dir,fetchImpl:async(url,options)=>{
  if(url.endsWith('/models'))return Response.json({data:[{id:'deepseek-flash'}]});
  calls++;messages.push(JSON.parse(options.body).messages);
  const recap=mode==='always-invalid'||mode==='repair'&&calls===2?'复盘太短。':valid.recap;
  return Response.json({choices:[{message:{content:JSON.stringify({recap,adaptation:unsolicited})}}]});
 }});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const post=(url,body)=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(body)});
 try{
  assert.equal((await post('/api/ai/connect',{baseUrl:'https://api.example.test',apiKey:'fixture-only-credential',preferredModel:'deepseek-flash'})).status,200);
  const body={dayNumber:1,summary:{total:0,passed:0,rounds:0},records:[{id:'writing-1',skill:'writing',answer:'I am a student.',minutes:3,quantity:5}],mistakes:[]};
  const response=await post('/api/ai/daily-recap',body),value=await response.json();assert.equal(response.status,200);assert.equal(value.recap,valid.recap);assert.equal(Object.hasOwn(value,'adaptation'),false);assert.equal(calls,1);
  mode='repair';const repaired=await post('/api/ai/daily-recap',body),repairedValue=await repaired.json();assert.equal(repaired.status,200);assert.equal(repairedValue.recap,valid.recap);assert.equal(Object.hasOwn(repairedValue,'adaptation'),false);assert.equal(calls,3);assert.match(messages[2].at(-1).content,/上一轮复盘未完整返回/);assert.match(messages[2].at(-1).content,/不要返回课程调整指令或 adaptation/);
  mode='always-invalid';const failure=await post('/api/ai/daily-recap',body);assert.equal(failure.status,502);assert.equal((await failure.json()).error.code,'INVALID_RECAP');assert.equal(calls,5);
  assert.equal((await post('/api/ai/daily-recap',{...body,records:[]})).status,400);assert.equal(calls,5);
 }finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
});
