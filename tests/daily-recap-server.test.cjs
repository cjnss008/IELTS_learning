'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createServer}=require('../server/server.cjs');
test('daily recap repairs invalid AI structure once, never applies invalid plans and does not retry input errors',async()=>{
 const cache=path.resolve(__dirname,'../.cache');fs.mkdirSync(cache,{recursive:true});const dir=fs.mkdtempSync(path.join(cache,'recap-repair-'));
 const valid={recap:'根据今日原始作答及订正，身份句表达有所改善。仍须用新人物和新情境检验迁移，保持先独立作答再参考反馈。明天练习主语与动词搭配，48小时后换题复测。学习时间仅为可用预算，不作为能力证明。',adaptation:{prioritySkills:['writing'],reason:'身份句需要用新情境复核。',strategies:[{skill:'writing',action:'用三个新人物各写一句身份句并独立检查。'}],reinforcementMaterialIds:[]}};
 let calls=0,mode='repair',messages=[];
 const server=createServer({budgetDir:dir,fetchImpl:async(url,options)=>{
  if(url.endsWith('/models'))return Response.json({data:[{id:'deepseek-flash'}]});
  calls++;messages.push(JSON.parse(options.body).messages);
  return Response.json({choices:[{message:{content:JSON.stringify(mode==='repair'&&calls%2===0?valid:{...valid,adaptation:{...valid.adaptation,prioritySkills:['writing','writing']}})}}]});
 }});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const post=(url,body)=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(body)});
 try{
  assert.equal((await post('/api/ai/connect',{baseUrl:'https://api.example.test',apiKey:'fixture-only-credential',preferredModel:'deepseek-flash'})).status,200);
  const body={dayNumber:1,summary:{total:0,passed:0,rounds:0},records:[{id:'writing-1',skill:'writing',answer:'I am a student.',minutes:3,quantity:5}],mistakes:[]};
  const response=await post('/api/ai/daily-recap',body),value=await response.json();assert.equal(response.status,200);assert.deepEqual(value.adaptation,valid.adaptation);assert.equal(calls,2);assert.match(messages[1].at(-1).content,/上一轮结构校验未通过/);
  mode='always-invalid';const failure=await post('/api/ai/daily-recap',body);assert.equal(failure.status,502);assert.equal((await failure.json()).error.code,'INVALID_ADAPTATION');assert.equal(calls,4);
  assert.equal((await post('/api/ai/daily-recap',{...body,records:[]})).status,400);assert.equal(calls,4);
 }finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
});
