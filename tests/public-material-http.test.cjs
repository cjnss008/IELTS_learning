'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{inspect}=require('node:util'),{createServer}=require('../server/server.cjs');
const root=path.join(__dirname,'..'),hash=v=>crypto.createHash('sha256').update(v).digest('hex');
test('released public text, context scripts and original MP3 byte ranges pass the actual local server using isolated data',async t=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'ielts-public-http-')),server=createServer({rootDir:root,dataDir,migrateLegacy:false,materialMigration:false,fetchImpl:async()=>{throw Error('No external services in static material test');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});const target=path.resolve(dataDir);assert.equal(path.dirname(target),path.resolve(os.tmpdir()));assert.ok(path.basename(target).startsWith('ielts-public-http-'));fs.rmSync(target,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port,release=require('../curriculum/public-supplements/practice-release.json'),catalog=require('../curriculum/public-supplement-catalog.json');
  const diagnostic=(relative,error)=>new Error('GET /'+relative+' failed: '+String(error?.message||error)+'; cause: '+inspect(error?.cause,{depth:3}),{cause:error});
  async function get(relative,init){try{return await fetch(base+'/'+relative,init);}catch(error){throw diagnostic(relative,error);}}
  async function bytes(response,relative){try{return Buffer.from(await response.arrayBuffer());}catch(error){throw diagnostic(relative,error);}}
  for(const relative of ['assets/public-learning-support.js','assets/public-context-data.js']){const response=await get(relative,{headers:{Connection:'close'}});assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/javascript/);assert.equal(hash(await bytes(response,relative)),hash(fs.readFileSync(path.join(root,relative))));}
  for(const contract of release.sources){const source=catalog.sources.find(s=>s.sourceId===contract.sourceId),response=await get(source.text.path,{headers:{Connection:'close'}});assert.equal(response.status,200,source.sourceId);assert.equal(hash(await bytes(response,source.text.path)),source.text.sha256);
   if(source.audio?.usage?.eligibleForPractice!==true)continue;const original=fs.readFileSync(path.join(root,source.audio.path)),r=await get(source.audio.path,{headers:{Connection:'close',Range:'bytes=0-127'}});assert.equal(r.status,206,source.sourceId);assert.match(r.headers.get('content-type'),/^audio\/mpeg/);assert.equal(r.headers.get('content-range'),'bytes 0-127/'+original.length);assert.deepEqual(await bytes(r,source.audio.path),original.subarray(0,128));
 }
});
