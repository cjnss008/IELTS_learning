'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{createRequire}=require('node:module');
const S=require('../assets/selection-ai.js'),A=require('../assets/assessment-core.js'),Review=require('../assets/mistake-review.js'),{createServer}=require('../server/server.cjs');
function courseFixture(overrides={},options={}){const file=path.join(__dirname,'course-player-dom.test.cjs'),text=fs.readFileSync(file,'utf8');return new Function('require','__dirname',text.slice(0,text.indexOf('\ntest('))+'\nreturn fixture;')(createRequire(file),__dirname)(overrides,options);}
test('translation captures selected English writing only in an explicit learning root and preserves the surrounding input',()=>{
 const surface={},text='I study biology because I enjoy science.',control={tagName:'TEXTAREA',id:'coachDraft',lang:'en',value:text,selectionStart:8,selectionEnd:15,isConnected:true,closest(selector){return selector===S.TRANSLATION_SURFACES['写作与AI辅导.html']?surface:null;},getBoundingClientRect:()=>({left:10,right:100,top:20,bottom:80})};
 const selected=S.captureTranslation(null,{activeElement:control},{page:'写作与AI辅导.html',mode:'practice'});assert.equal(selected.text,'biology');assert.equal(selected.context,text);assert.equal(control.value,text);assert.equal(selected.verify(),true);
 assert.equal(S.captureTranslation(null,{activeElement:control},{page:'AI设置.html',mode:'practice'}),null);assert.equal(S.captureTranslation(null,{activeElement:control},{page:'写作与AI辅导.html',mode:'assessment'}),null);assert.equal(S.captureTranslation(null,{activeElement:control},{page:'写作与AI辅导.html',mode:'practice',vocabularyTesting:true}),null);
 control.value='Changed draft';assert.equal(selected.verify(),false);control.value=text;control.tagName='INPUT';control.type='password';assert.equal(S.captureTranslation(null,{activeElement:control},{page:'写作与AI辅导.html',mode:'practice'}),null);
 assert.equal(S.translationSnapshot('biology','biology',{page:'入学测评.html',mode:'practice'}),null);assert.equal(S.translationSnapshot('biology','biology',{page:'30分钟能力测试.html',mode:'practice'}),null);
});
test('ordinary question and option DOM ranges use the translation fallback and reject cross-surface or hidden selections',()=>{
 const host={},paragraph={nodeType:1,textContent:'Which bus stops near the school?',isConnected:true,closest(){return null;}},element={nodeType:1,isContentEditable:false,closest(selector){if(selector===S.TRANSLATION_SURFACES['今日学习.html'])return host;if(selector.startsWith('p,li,'))return paragraph;return null;}},node={nodeType:3,parentElement:element},range={startContainer:node,endContainer:node,toString:()=> 'near the school',getBoundingClientRect:()=>({left:12,right:90,top:10,bottom:30})},selection={isCollapsed:false,rangeCount:1,getRangeAt:()=>range};
 const value=S.captureTranslation(selection,{activeElement:null},{page:'今日学习.html',mode:'practice',materialId:'listen-m1',skill:'listening'});assert.equal(value.text,'near the school');assert.equal(value.materialId,'listen-m1');
 assert.equal(S.captureTranslation(selection,{activeElement:null},{page:'今日学习.html',mode:'practice',assessment:true}),null);
 paragraph.closest=()=>({hidden:true});assert.equal(S.captureTranslation(selection,{activeElement:null},{page:'今日学习.html',mode:'practice'}),null);
});
test('course DOM displays English labels in shuffled order while canonical Chinese selections and scoring survive',async()=>{
 const q={id:'q1',type:'single',prompt:'Where does the bus stop?',options:['学校','公园'],optionsEnglish:['The school','The park'],answers:['学校'],explanation:'The recording says school.',evidence:'near the school'};
 const f=courseFixture({questions:[q]});await new Promise(resolve=>setImmediate(resolve));await f.nodes.get('courseTasks').children.find(n=>n.dataset.taskId==='reading').fire('click');await f.nodes.get('courseBegin').fire('click');
 const inputs=f.nodes.get('courseQuestions').querySelectorAll('input');for(const input of inputs)assert.equal(input.parentElement.textContent,q.optionsEnglish[q.options.indexOf(input.value)]);
 const chosen=inputs.find(n=>n.value==='学校');chosen.checked=true;await chosen.fire('change');f.advance(1000);await f.nodes.get('courseSubmit').fire('click');
 const record=f.records()[0],artifact=A.decodeArtifact(record);assert.equal(artifact.answers.q1,'学校');assert.equal(record.evaluation.score,1);assert.deepEqual(q.options,['学校','公园']);
});
test('review display overlays current English prompt/labels without mutating historical question or answer values',()=>{
 const old={id:'q1',type:'single',prompt:'公共汽车在哪停？',options:['公园','学校'],answers:['学校']},before=JSON.stringify(old),item={materialId:'listen-m1',questionId:'q1',skill:'listening',question:old},data={materials:[{id:'listen-m1',questions:[{id:'q1',type:'single',prompt:'Where does the bus stop?',originalPrompt:'公共汽车在哪停？',options:['学校','公园'],optionsEnglish:['The school','The park'],answers:['学校']}]}]};
 const shown=Review.displayQuestion(item,data);assert.equal(shown.prompt,'Where does the bus stop?');assert.deepEqual(shown.optionsEnglish,['The park','The school']);assert.deepEqual(shown.options,old.options);assert.deepEqual(shown.answers,old.answers);assert.equal(JSON.stringify(old),before);
 assert.deepEqual(Review.displayQuestion(item,{materials:[]}),old);
});
test('translation controller reaches the isolated HTTP route, records assistance, and rejects assessment/settings before upstream use',async t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ielts-translation-integration-')),calls=[],marks=[],fake='translation-test-key-only';fs.writeFileSync(path.join(temp,'开始学习.html'),'<title>Isolated test</title>');
 const app=createServer({rootDir:temp,dataDir:path.join(temp,'user-data'),materialMigration:false,lessons:[],fetchImpl:async(url,options)=>{if(url.endsWith('/models'))return new Response(JSON.stringify({data:[{id:'deepseek-flash'}]}));const body=JSON.parse(options.body);calls.push(body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({feedback:'biology 的意思是生物学。这是模拟上游返回，仅验证接口与辅助记录。'})},finish_reason:'stop'}],usage:{prompt_tokens:20,completion_tokens:20}}));}});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.address().port;
 t.after(async()=>{await new Promise(resolve=>{app.close(resolve);app.closeAllConnections();});const resolved=path.resolve(temp),parent=path.resolve(os.tmpdir());if(resolved.startsWith(parent+path.sep)&&path.basename(resolved).startsWith('ielts-translation-integration-'))fs.rmSync(resolved,{recursive:true,force:true});});
 const api=async(route,body)=>{const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:response.status,value:await response.json()};};
 assert.equal((await api('/api/ai/connect',{baseUrl:'https://api.deepseek.com',apiKey:fake,preferredModel:'deepseek-flash'})).status,200);
 const controller=S.createTranslationController({origin:base,fetch:(url,options)=>fetch(base+url,options),onAssistance:(snapshot,result)=>marks.push({text:snapshot.text,assistance:result.assistance})}),snapshot=S.translationSnapshot('biology','I study biology every day.',{page:'今日学习.html',mode:'practice'});
 assert.equal(await controller.explain(snapshot),true);assert.equal(controller.getState().phase,'done');assert.equal(marks.length,1);assert.equal(marks[0].assistance,true);assert.equal(calls.length,1);assert.match(calls[0].messages[0].content,/不选择正确答案/);assert.ok(!JSON.stringify(controller.getState()).includes(fake));
 for(const body of [{text:'biology',context:'biology',page:'今日学习.html',mode:'assessment'},{text:'biology',context:'biology',page:'AI设置.html',mode:'practice'},{text:'a'.repeat(801),page:'今日学习.html',mode:'practice'}])assert.ok((await api('/api/ai/translate',body)).status>=400);
 assert.equal(calls.length,1);
});
