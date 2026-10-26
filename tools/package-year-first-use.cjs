'use strict';
// Explicit build module. No implicit input tree, runtime activation or learner writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function packageFirstUse({outputRoot,plan,catalog,planRef,runtimeContract=null,write}={}){
 assert(typeof outputRoot==='string'&&outputRoot,'outputRoot is required');
 assert(plan?.schema==='year-budget-first-use-v1'&&typeof plan.active==='boolean','versioned budget plan required');
 const active=plan.active;
 assert.equal(plan.runtimeConnected,active,'plan active/runtimeConnected must agree');
 if(active){assert(runtimeContract?.protocol===1&&runtimeContract.runtimeConnected===true,'active package requires validated runtime contract');assert.deepEqual(plan.runtimeContract,runtimeContract,'active package contract binding');}
 else assert.equal(runtimeContract,null,'inactive package must not claim runtime activation');
 assert(typeof plan.inputHash==='string'&&/^[a-f0-9]{64}$/.test(plan.inputHash),'bound input hash required');
 for(const key of ['baseHash','publicPlanHash','contextCatalogHash'])assert(/^[a-f0-9]{64}$/.test(plan[key]||''),'bound '+key+' required');
 assert(planRef?.sha256&&planRef.bytes>0&&planRef.path==='curriculum/year-expansion-budget-plan.json','bound plan reference required');
 assert.equal(sha(Buffer.from(JSON.stringify(plan,null,2)+'\n')),planRef.sha256,'plan reference hash');
 assert.equal(Buffer.byteLength(JSON.stringify(plan,null,2)+'\n'),planRef.bytes,'plan reference bytes');
 assert(Array.isArray(catalog?.materials)&&Array.isArray(plan.ledger),'catalog and ledger required');
 const root=path.resolve(outputRoot),folder='curriculum/year-first-use',rows=new Map(plan.ledger.map(row=>[row.materialId,row]));
 assert.equal(rows.size,plan.ledger.length,'unique ledger identity');assert.equal(new Set(catalog.materials.map(m=>m.id)).size,rows.size,'unique catalog identity count');
 const save=(relative,bytes,immutable=true)=>{
  const target=path.resolve(root,relative);assert(target.startsWith(root+path.sep),'package path must stay inside output root');
  if(immutable&&fs.existsSync(target)){assert.deepEqual(fs.readFileSync(target),Buffer.from(bytes),'immutable packaged file changed: '+relative);return;}
  if(write)write(relative,bytes);else{fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}
 };
 const jobs=[];
 for(const material of catalog.materials){
  assert(/^[A-Za-z0-9_-]+$/.test(material.id),'safe material identity');
  const row=rows.get(material.id),bytes=Buffer.from(JSON.stringify(material));assert(row,'material must have a ledger row');
  const materialHash=sha(bytes);assert.equal(materialHash,row.materialHash,'material ledger hash: '+material.id);
  assert.equal(material.pool,'training');assert.equal(material.fullTest,false);assert.equal(material.source?.practiceOnly,true);assert.equal(material.source?.independentAssessmentEligible,false);assert.equal(material.source?.independentTransferEligible,false);
  const ref={path:folder+'/materials/'+material.id+'.'+materialHash.slice(0,16)+'.json',sha256:materialHash,bytes:bytes.length};save(ref.path,bytes);
  jobs.push({materialId:material.id,materialHash,skill:material.skill,level:material.level,kind:row.kind,parentMaterialId:row.parentMaterialId,sourceWeek:row.sourceWeek,releaseCourseIndex:row.releaseDay,plannedCourseIndex:row.day||null,staticStatus:row.status,staticReason:row.reason||null,estimatedStudyMinutes:row.estimate.minutes,ref});
 }
 const index={schema:1,protocol:1,kind:'year-first-use-index',version:plan.version,active,runtimeConnected:active,...(active?{runtimeContract}:{}),inputHash:plan.inputHash,planSha256:planRef.sha256,coreHash:plan.baseHash,publicPlanHash:plan.publicPlanHash,contextCatalogHash:plan.contextCatalogHash,summary:plan.summary,jobs};
 const bytes=Buffer.from(JSON.stringify(index)),hash=sha(bytes),indexRef={path:folder+'/index.'+hash.slice(0,16)+'.json',sha256:hash,bytes:bytes.length};save(indexRef.path,bytes);
 const bootstrap={schema:1,protocol:1,kind:'year-first-use-manifest',version:plan.version,active,runtimeConnected:active,...(active?{runtimeContract}:{}),index:indexRef,inputHash:plan.inputHash,planSha256:planRef.sha256,coreHash:plan.baseHash,publicPlanHash:plan.publicPlanHash,contextCatalogHash:plan.contextCatalogHash,counts:plan.summary.all,activationPolicy:'Requires explicit reviewed activation and matching owner context; no automatic catalog hydration.'};
 const bootstrapText="(function(root){'use strict';const value="+JSON.stringify(bootstrap)+";root.IELTSYearFirstUseManifest=value;if(typeof module==='object'&&module.exports)module.exports=value;})(typeof globalThis!=='undefined'?globalThis:this);\n";
 const bootstrapRef={path:'assets/year-first-use-manifest.js',sha256:sha(bootstrapText),bytes:Buffer.byteLength(bootstrapText)};save(bootstrapRef.path,bootstrapText,false);
 return {indexRef,bootstrapRef,materialCount:jobs.length,totalIndividualBytes:jobs.reduce((n,j)=>n+j.ref.bytes,0),maximumIndividualBytes:Math.max(0,...jobs.map(j=>j.ref.bytes)),active,runtimeConnected:active};
}
module.exports={packageFirstUse};
if(require.main===module){
 const args=process.argv.slice(2),option=name=>{const at=args.indexOf(name);assert(at>=0&&args[at+1],name+' is required');return path.resolve(args[at+1]);};
 const outputRoot=option('--output-root'),planFile=option('--plan'),catalogFile=option('--catalog'),bytes=fs.readFileSync(planFile),plan=JSON.parse(bytes),catalog=JSON.parse(fs.readFileSync(catalogFile));
 const contractIndex=args.indexOf('--year-runtime-contract');let runtimeContract=null;
 if(plan.active){assert(contractIndex>=0&&args[contractIndex+1],'active package requires --year-runtime-contract');runtimeContract=require('./year-runtime-activation.cjs').validateRuntimeContract({root:path.resolve(__dirname,'..'),contractPath:args[contractIndex+1]}).metadata;}
 const result=packageFirstUse({outputRoot,plan,catalog,planRef:{path:'curriculum/year-expansion-budget-plan.json',sha256:sha(bytes),bytes:bytes.length},runtimeContract});console.log(JSON.stringify(result));
}
