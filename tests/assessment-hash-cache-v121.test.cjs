'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
function load(){const box={console};box.window=box;box.globalThis=box;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/assessment-core.js'),'utf8'),box,{filename:'assessment-core.js'});return box.IELTSAssessment;}
const sha=text=>crypto.createHash('sha256').update(text,'utf8').digest('hex');
test('the JS SHA cache handles the 65536/131072 boundaries and repeated long strings without changing digests',()=>{
 const A=load(),cases=['',...['a','b','c'].map(char=>char.repeat(55)),'a'.repeat(56),'a'.repeat(63),'a'.repeat(64),'a'.repeat(65),'a'.repeat(65536),'a'.repeat(65537),'a'.repeat(131072),'a'.repeat(131073),'中文🙂\u0000'.repeat(9000),'x'.repeat(1000)+'🙂'.repeat(9000)];
 for(const text of cases){const first=A.sourceTextHash(text),second=A.sourceTextHash(text);assert.equal(first,sha(text));assert.equal(second,first);}
 assert.throws(()=>A.sourceTextHash(new Uint8Array(1)),/string/);
});
