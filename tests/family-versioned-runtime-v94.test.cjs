'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),Activation=require('../tools/year-runtime-activation.cjs'),Policy=require('../server/year-runtime-contract-policy.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
test('family delivery selects its new exact current runtime contract and retains all 52 original role paths',()=>{
 const old=fs.readFileSync(path.join(root,'curriculum/year-first-use-runtime-contract.json'));assert.equal(sha(old),'06272530120956c9ce01fab7288afb3037147be824f63c58ab3cce3ade9baf7d');
 const active=Activation.validateRuntimeContract({root});assert.equal(active.metadata.contract.path,'curriculum/year-first-use-runtime-contract-v94-daily-review.json');assert.equal(Policy.REQUIRED_ROLES.length,51);assert.equal(Policy.MAX_COMPONENTS,52);assert.equal(active.metadata.components.length,52);assert.deepEqual(active.metadata.components.map(({role,path})=>({role,path})),JSON.parse(old).components.map(({role,path})=>({role,path})));
 const data=require('../assets/curriculum-data.js');assert.equal(data.yearFirstUse.runtimeContract.contract.path,active.metadata.contract.path);assert.equal(data.yearFirstUse.runtimeContract.contract.sha256,active.metadata.contract.sha256);
});
test('build validation rejects contract paths the actual catalog cannot serve',()=>{
 assert.throws(()=>Activation.validateRuntimeContract({root,contractPath:'curriculum/custom-proof-copy.json'}),/Unsupported exact runtime contract path/);
 assert.throws(()=>Activation.validateRuntimeContract({root,contractPath:'../outside.json'}),/Unsupported exact runtime contract path/);
});
