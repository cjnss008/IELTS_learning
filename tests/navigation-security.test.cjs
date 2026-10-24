'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createServer}=require('../server/server.cjs');
test('external top-level page links work while API, frame, asset and write isolation remains intact',async t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ielts-navigation-')),app=path.join(temp,'app');fs.mkdirSync(app);fs.writeFileSync(path.join(app,'今日学习.html'),'<h1>Today</h1>');fs.writeFileSync(path.join(app,'备份中心.html'),'<h1>Backup</h1>');fs.writeFileSync(path.join(app,'.private.html'),'private');fs.mkdirSync(path.join(app,'assets'));fs.writeFileSync(path.join(app,'assets','test.js'),'void 0');
 const server=createServer({rootDir:app,dataDir:path.join(temp,'data'),migrateLegacy:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>{server.close(r);server.closeAllConnections();});assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(temp,{recursive:true,force:true});});
 const request=(url,headers={},method='GET')=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:encodeURI(url),method,headers},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString(),headers:res.headers}));});req.on('error',reject);req.end();});
 const navigation={'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'};
 for(const url of ['/','/备份中心.html']){const r=await request(url,navigation);assert.equal(r.status,200);assert.equal(r.headers['x-frame-options'],'DENY');}
 for(const url of ['/api/ai/status','/api/user-data/status','/assets/test.js','/.private.html','/用户数据/config/credentials.dpapi'])assert.equal((await request(url,navigation)).status,403,url);
 assert.equal((await request('/备份中心.html',{...navigation,'Sec-Fetch-Dest':'iframe'})).status,403);
 assert.equal((await request('/备份中心.html',{...navigation,'Sec-Fetch-Mode':'cors'})).status,403);
 assert.equal((await request('/api/ai/configure',navigation,'POST')).status,403);
 assert.equal((await request('/api/ai/status',{Origin:'https://external.example'})).status,403);
});
