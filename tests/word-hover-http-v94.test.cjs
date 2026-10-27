'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(process.env.WORD_HOVER_BASE_ROOT||path.join(__dirname,'..')),staticRoot=path.resolve(process.env.WORD_HOVER_STATIC_ROOT||path.join(__dirname,'..'));
test('actual server serves the lazy JSON reference with exact bytes and the browser client verifies it without upstream access',async t=>{
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'ielts-hover-v94-'));assert.equal(path.dirname(scratch),os.tmpdir());assert.match(path.basename(scratch),/^ielts-hover-v94-/);let server,upstream=0;
  t.after(async()=>{if(server?.listening){server.closeIdleConnections?.();await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}assert.equal(path.dirname(path.resolve(scratch)),os.tmpdir());fs.rmSync(scratch,{recursive:true,force:true});});
  const {createServer}=require(path.join(root,'server/server.cjs'));server=createServer({rootDir:staticRoot,dataDir:path.join(scratch,'synthetic-data'),migrateLegacy:false,materialMigration:false,fetchImpl:async()=>{upstream++;throw Error('No upstream is authorized by this synthetic test.');}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port,requests=[];
  const context={TextDecoder,TextEncoder,crypto:crypto.webcrypto,fetch:async(url,options)=>{requests.push(url);return fetch(origin+'/'+url,options);}};
  // The full production file contains the same bounded reference factory first.
  vm.runInNewContext(fs.readFileSync(path.join(staticRoot,'assets/word-hover.js'),'utf8').split('\n(function (root, factory) {')[0],context);
  const client=context.IELTSWordReferenceV94;assert.ok(client);const word=await client.lookup('mortgage');assert.equal(word.word,'mortgage');assert.ok(word.meaning);assert.deepEqual(requests,['assets/word-reference-v94/m.json']);const again=await client.lookup('mortgage');assert.equal(again.word,'mortgage');assert.equal(requests.length,1);
  const response=await fetch(origin+'/assets/word-reference-v94/m.json'),bytes=Buffer.from(await response.arrayBuffer()),expected=client.manifest.shards.m;assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/json/);assert.equal(bytes.length,expected.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),expected.sha256);assert.equal(upstream,0);
});
