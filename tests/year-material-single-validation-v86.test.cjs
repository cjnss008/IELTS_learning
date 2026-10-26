'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const original=path.join(__dirname,'year-material-http.test.cjs'),raw=fs.readFileSync(original,'utf8'),holder={exports:{}};
new Function('require','__dirname','module',raw.slice(0,raw.indexOf('\ntest('))+'\nmodule.exports={diskFixture,host,materialURL,sha};')(createRequire(original),__dirname,holder);
const {diskFixture,host,materialURL,sha}=holder.exports;
test('each valid material HTTP request performs one complete current contract validation, retaining exact bytes and live rejection',async t=>{
 const f=diskFixture(),{api}=await host(t,f),source=f.jobs.find(job=>job.kind==='source'&&job.skill==='reading'),derived=f.jobs.find(job=>job.kind==='derived');assert.ok(source);assert.ok(derived);
 const indexPath=path.resolve(f.root,f.indexRef.path),indexReads=()=>f.reads.filter(file=>path.resolve(file)===indexPath).length;
 for(const job of [source,derived,source]){const before=indexReads(),response=await api(materialURL(job));assert.equal(response.status,200);assert.equal(sha(response.bytes),job.materialHash);assert.equal(indexReads()-before,1,'One validation per successful request; a second warm prepare repeats costly NAS path checks.');}
 // No time window may retain activation for the next separate request.
 const component=f.runtimeContract.components.find(row=>row.role==='frontend-adapter');fs.appendFileSync(path.join(f.root,component.path),'\n// partial upgrade after the last complete request\n');const rejected=await api(materialURL(source));assert.equal(rejected.status,503);assert.equal(rejected.data.ok,false);
});
