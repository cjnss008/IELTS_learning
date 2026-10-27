'use strict';
// Public application resources only; never opens profile storage or a user data directory.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function audit(root=path.resolve(__dirname,'..')){
  const Bank=require(path.join(root,'assets/lexical-bank-runtime.js'));
  const Ret=require(path.join(root,'assets/lexical-retention-v88.js'));
  const Policy=require(path.join(root,'server/year-runtime-contract-policy.cjs'));
  const registryFile=path.join(root,'curriculum/lexical-bank/registry.json');
  const registryBytes=fs.readFileSync(registryFile);assert.equal(sha(registryBytes),Bank.REGISTRY_SHA256);
  const registry=Bank.validateRegistry(JSON.parse(registryBytes));
  const row=registry.releases.find(entry=>entry.releaseId===Bank.LEGACY_RELEASE_ID);assert(row);
  assert.equal(row.status,'legacy-delegate');assert.equal(row.codecId,Ret.VERSION);
  assert(/^curriculum\/lexical-bank\/releases\/[a-z0-9][a-z0-9._-]*\.json$/.test(row.descriptor.path));
  const descriptorBytes=fs.readFileSync(path.join(root,row.descriptor.path));
  assert.equal(descriptorBytes.length,row.descriptor.bytes);assert.equal(sha(descriptorBytes),row.descriptor.sha256);
  const descriptor=JSON.parse(descriptorBytes);assert.equal(Bank.hash(descriptor),row.descriptor.contentSha256);
  assert.equal(row.descriptor.contentSha256,Bank.LEGACY_DESCRIPTOR_SHA256);
  assert.equal(descriptor.releaseId,Bank.LEGACY_RELEASE_ID);assert.equal(descriptor.codecId,Ret.VERSION);
  assert.equal(descriptor.legacy.field,Ret.FIELD);assert.equal(descriptor.legacy.role,Ret.ROLE);
  assert.equal(Bank.stable(descriptor.legacy.inputPins),Bank.stable(Ret.INPUT_PINS));
  assert.equal(Bank.hash(Ret.POLICY),descriptor.legacy.policySha256);
  assert.equal(Bank.hash(Ret.RESPONSE_POLICY),descriptor.legacy.responsePolicySha256);
  assert.equal(descriptor.approval.initial.standaloneReceiptPath,null);
  const resources=[...descriptor.resources,descriptor.approval.derived];
  for(const resource of resources){
    assert(/^(?:assets\/[a-z0-9.-]+\.js|curriculum\/lexical-retention-v88\/root-derived-review\.json)$/.test(resource.path));
    const bytes=fs.readFileSync(path.join(root,resource.path));assert.equal(bytes.length,resource.bytes,resource.path);assert.equal(sha(bytes),resource.sha256,resource.path);
  }
  const runtime=Bank.createRuntime({legacyCodec:Ret,readBytes:relative=>fs.readFileSync(path.join(root,relative))});
  assert.equal((await runtime.loadRegistry()).status,'ready');
  const resolved=await runtime.resolveRelease(Bank.LEGACY_RELEASE_ID);assert.equal(resolved.status,'ready');
  assert.equal(Bank.stable(resolved.descriptor),Bank.stable(descriptor));assert.equal(resolved.trainingAllowed,false);
  const state=Ret.newState(),before=JSON.stringify(state),mapped=runtime.restoreLegacyState(state);
  assert.equal(mapped.status,'ready');assert.equal(mapped.rewritten,false);assert.equal(JSON.stringify(state),before);
  assert.equal((await runtime.resolveRelease('unregistered-future-release')).status,'pending');
  assert.equal(Policy.REQUIRED_COMPONENTS['lexical-bank-runtime'],'assets/lexical-bank-runtime.js');
  assert.equal(Policy.REQUIRED_ROLES.length,51);assert.equal(Policy.MAX_COMPONENTS,52);
  const pages=['今日学习.html','每日学习计划.html','词汇记忆.html','个性化学习.html','备份中心.html','写作补强.html','无稿口语.html'];
  for(const file of pages)assert.equal(Policy.pageDependencyProblem(file,fs.readFileSync(path.join(root,file),'utf8')),null,file);
  return{schema:1,status:'immutable-legacy-lexical-bank-audit-passed',legacyReleaseId:Bank.LEGACY_RELEASE_ID,
    legacyWords:24,legacyScenes:48,legacyQuestions:144,resourcePins:resources.length,pages:pages.length,
    requiredRuntimeRoles:51,maxRuntimeComponents:52,registrySha256:sha(registryBytes),descriptorSha256:sha(descriptorBytes),
    archiveAdoptionOrWrites:false,newWordActivation:0,realLearnerDataRead:false,realBrowser:false};
}
if(require.main===module)audit().then(report=>console.log(JSON.stringify(report,null,2))).catch(error=>{console.error(error.stack);process.exitCode=1;});
module.exports={audit};
