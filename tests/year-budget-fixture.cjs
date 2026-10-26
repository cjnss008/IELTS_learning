'use strict';
// Read-only fixture: a default core build may omit runtime year metadata.
// Its test-only view is reconstructed only from committed, hash-bound sidecars.
const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.resolve(process.env.YEAR_BUDGET_OUTPUT_ROOT||root),P=require('../tools/year-budget-planner.cjs');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function bootstrapValue(bytes){
 const text=bytes.toString('utf8'),prefix="(function(root){'use strict';const value=",suffix=";root.IELTSYearFirstUseManifest=value;if(typeof module==='object'&&module.exports)module.exports=value;})(typeof globalThis!=='undefined'?globalThis:this);";
 assert(Buffer.from(text,'utf8').equals(bytes),'committed bootstrap UTF-8');assert(text.startsWith(prefix)&&text.trimEnd().endsWith(suffix),'committed bootstrap wrapper');return JSON.parse(text.trimEnd().slice(prefix.length,-suffix.length));
}
function bound(ref,from=output){assert(ref&&typeof ref.path==='string'&&!path.isAbsolute(ref.path)&&!ref.path.split(/[\\/]/).includes('..'),'safe committed reference');const bytes=fs.readFileSync(path.join(from,ref.path));assert.equal(sha(bytes),ref.sha256,ref.path);assert.equal(bytes.length,ref.bytes,ref.path);return JSON.parse(bytes);}
function load(options={}){
 const from=path.resolve(options.outputRoot||output),data=options.data||require(path.join(from,'assets/curriculum-data.js')),before=P.hash(data),bootstrapPath='assets/year-first-use-manifest.js';
 const bootstrapBytes=fs.readFileSync(path.join(from,bootstrapPath)),bootstrap=bootstrapValue(bootstrapBytes);
 assert.equal(bootstrap.schema,1);assert.equal(bootstrap.protocol,1);assert.equal(bootstrap.kind,'year-first-use-manifest');assert.equal(typeof bootstrap.active,'boolean','committed activation must be boolean');if(Object.hasOwn(options,'expectedActive')){assert.equal(typeof options.expectedActive,'boolean','expectedActive must be an explicit boolean');assert.equal(bootstrap.active,options.expectedActive,'committed activation expectation');}const active=bootstrap.active;
 assert.equal(bootstrap.runtimeConnected,active,'bootstrap activation consistency');
 const index=bound(bootstrap.index,from),planPath='curriculum/year-expansion-budget-plan.json',planBytes=fs.readFileSync(path.join(from,planPath)),frozenPlan=JSON.parse(planBytes);
 assert.equal(sha(planBytes),bootstrap.planSha256,'committed plan hash');assert.equal(index.planSha256,bootstrap.planSha256);assert.equal(frozenPlan.schema,P.SCHEMA);assert.equal(frozenPlan.active,active);assert.equal(frozenPlan.runtimeConnected,active);assert.equal(index.active,active);assert.equal(index.runtimeConnected,active);assert.equal(index.protocol,1);
 const catalog=require('../assets/public-context-practice-data.js');
 for(const key of ['inputHash','coreHash','publicPlanHash','contextCatalogHash']){assert.match(bootstrap[key],/^[a-f0-9]{64}$/);assert.equal(index[key],bootstrap[key],key+' index binding');}
 assert.equal(bootstrap.coreHash,frozenPlan.baseHash);assert.equal(bootstrap.inputHash,frozenPlan.inputHash);
 assert.equal(bootstrap.coreHash,P.hash(P.coreContract(data)),'committed year core contract mismatch');
 assert.equal(bootstrap.publicPlanHash,data.publicCoursePlan?.planHash,'committed public plan mismatch');assert.equal(bootstrap.publicPlanHash,frozenPlan.publicPlanHash);
 assert.equal(bootstrap.contextCatalogHash,P.hash(catalog),'committed context catalog mismatch');assert.equal(bootstrap.contextCatalogHash,frozenPlan.contextCatalogHash);
 const materialPath='curriculum/year-expansion-staged-materials.json',materialBytes=fs.readFileSync(path.join(from,materialPath)),staged=JSON.parse(materialBytes),yearMaterials=staged.materials,rows=new Map(frozenPlan.ledger.map(row=>[row.materialId,row]));
 assert.equal(staged.active,active);assert.equal(staged.runtimeConnected,active);assert.equal(staged.schema,1);assert.equal(rows.size,frozenPlan.ledger.length);assert.equal(yearMaterials.length,rows.size);assert.equal(new Set(yearMaterials.map(m=>m.id)).size,rows.size);
 for(const material of yearMaterials)assert.equal(P.hash(material),rows.get(material.id)?.materialHash,'committed material binding: '+material.id);
 assert.equal(P.hash({days:data.days,materials:data.materials,yearMaterials,publicPlanHash:data.publicCoursePlan.planHash,catalog}),bootstrap.inputHash,'committed complete planning input mismatch');
 const pendingPath='curriculum/year-expansion-pending.json',pendingBytes=fs.readFileSync(path.join(from,pendingPath)),pending=JSON.parse(pendingBytes);
 assert.equal(pending.active,active);assert.equal(pending.runtimeConnected,active);assert.deepEqual(pending.pending,frozenPlan.ledger.filter(row=>row.status==='pending'));assert.deepEqual(pending.spacedPractice,frozenPlan.spacedPractice);assert.deepEqual(pending.summary,frozenPlan.summary);
 const ref=(relative,bytes,count)=>({path:relative,sha256:sha(bytes),bytes:bytes.length,...(count===undefined?{}:{count})});
 const committed={schema:frozenPlan.schema,protocol:1,version:frozenPlan.version,active,runtimeConnected:active,status:frozenPlan.status,summary:frozenPlan.summary,plan:ref(planPath,planBytes,rows.size),stagedMaterials:ref(materialPath,materialBytes,rows.size),pending:ref(pendingPath,pendingBytes,pending.pending.length),firstUseManifest:ref(bootstrapPath,bootstrapBytes),materialIndex:bootstrap.index,inputHash:bootstrap.inputHash,coreHash:bootstrap.coreHash,publicPlanHash:bootstrap.publicPlanHash,contextCatalogHash:bootstrap.contextCatalogHash};
 if(active){assert.deepEqual(index.runtimeContract,bootstrap.runtimeContract);assert.deepEqual(frozenPlan.runtimeContract,bootstrap.runtimeContract);const contract=bound(bootstrap.runtimeContract.contract,from);assert.equal(contract.protocol,1);assert.equal(contract.runtimeConnected,true);assert.equal(contract.activationReviewed,true);assert.deepEqual(contract.components,bootstrap.runtimeContract.components,'committed runtime components');committed.runtimeContract=bootstrap.runtimeContract;}else{for(const value of [bootstrap,index,frozenPlan])assert.equal(value.runtimeContract,undefined,'inactive artifact must not claim runtime activation');}
 if(data.yearFirstUse)for(const key of Object.keys(committed))assert.deepEqual(data.yearFirstUse[key],committed[key],'runtime year metadata '+key);
 const meta=data.yearFirstUse||committed,base=P.clone(data);delete base.yearFirstUse;assert.equal(P.hash(data),before,'fixture must not mutate actual D');
 return{active,base,yearMaterials,catalog,inputHash:frozenPlan.inputHash,Year:require('../tools/year-expansion.cjs'),frozenPlan,data,meta,testOnlyMetadataView:data.yearFirstUse?null:{...P.clone(data),yearFirstUse:P.clone(committed)},metadataSource:data.yearFirstUse?'runtime-bundle':'committed-sidecars-test-only',outputRoot:from};
}
module.exports={root,output,sha,bound,load};
