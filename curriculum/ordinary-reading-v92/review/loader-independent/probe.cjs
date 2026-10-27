'use strict';
// Synthetic approval receipts are test fixtures only. No production approval is made.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const candidate=path.resolve(__dirname,'../ordinary-reading-admission-v92/candidate');
const Tool=require(path.join(candidate,'tools/build-ordinary-reading-course.cjs'));
const Composer=require(path.join(candidate,'tools/append-ordinary-reading-plan.cjs'));
const P=require(path.join(candidate,'assets/public-course-planner.js'));
const A=require(path.join(candidate,'assets/assessment-core.js'));
const copy=v=>JSON.parse(JSON.stringify(v)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const author=path.join(candidate,Tool.PREFIX,'author-v1');
function fixture(mutator){
 const root=fs.mkdtempSync(path.join(__dirname,'fixture-')),pkg=path.join(root,Tool.PREFIX);
 fs.mkdirSync(pkg,{recursive:true});fs.mkdirSync(path.join(root,'assets'),{recursive:true});
 for(const name of ['assessment-core.js','public-course-planner.js'])fs.copyFileSync(path.join(candidate,'assets',name),path.join(root,'assets',name));
 const write=(relative,value)=>{const file=path.join(pkg,relative),bytes=Buffer.from(typeof value==='string'?value:JSON.stringify(value));fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);return{path:relative,sha256:sha(bytes),bytes:bytes.length};};
 const copyRef=ref=>{const rel=ref.path.startsWith(Tool.PREFIX)?ref.path.slice(Tool.PREFIX.length):ref.path;assert.ok(!rel.split('/').includes('..'));const source=path.join(candidate,Tool.PREFIX,rel),stat=fs.lstatSync(source);assert.ok(stat.isFile()&&!stat.isSymbolicLink());assert.ok(stat.size<=2*1024*1024);assert.equal(sha(fs.readFileSync(source)),ref.sha256);fs.mkdirSync(path.dirname(path.join(pkg,rel)),{recursive:true});fs.copyFileSync(source,path.join(pkg,rel));};
 const contexts=copy(JSON.parse(fs.readFileSync(path.join(author,'context-catalog.json'))));contexts.masteryEvidence=false;
 const sourceRows=[],approved=[];
 for(const id of Tool.SOURCE_IDS){
  const source=JSON.parse(fs.readFileSync(path.join(author,'sources',id+'.json'))),authorMaterial=JSON.parse(fs.readFileSync(path.join(author,'materials',id+'-reading.json'))),ctx=contexts.sources.find(s=>s.sourceId===id);
  mutator?.({id,source,authorMaterial,ctx});
  const material=Tool.deriveAuthorMaterial(authorMaterial);
  for(const ref of [source.original,source.selected,source.teaching,source.raw,...source.rights])copyRef(ref);
  const sourceRef=write('sources/'+id+'.json',source),authorRef=write('author-v1/materials/'+id+'-reading.json',authorMaterial),materialRef=write('materials/'+id+'-reading.json',material);
  sourceRows.push({sourceId:id,source:sourceRef,authorMaterial:authorRef,material:materialRef});
  approved.push({sourceId:id,authorMaterialSha256:authorRef.sha256,sourceMetadataSha256:sourceRef.sha256,materialSha256:materialRef.sha256,questionsSha256:sha(JSON.stringify(material.questions)),materialContentHash:A.materialContentHash(material),contextSha256:sha(JSON.stringify(ctx))});
 }
 const contextsRef=write('test-contexts.json',contexts),note=write('test-note.json',{simulationOnly:true,approval:false});
 const review=write('test-review.json',{schema:1,decision:'approved-ordinary-reading-only',reviewer:'root-ai-not-human',independentQuestionsReviewed:true,textAndAdaptationsReviewed:true,explanationsReviewed:true,rightsReviewed:true,contextsSha256:contextsRef.sha256,approvedSources:approved,independentReview:note,blindReadingNotes:note,sourceReview:note});
 const releasePath=Tool.PREFIX+'test-release.json';write('test-release.json',{schema:1,id:'ordinary-reading-v92',status:'reviewed-ordinary-reading-only',readingApproved:true,use:'ordinary-required-reading-only',independentAssessmentEligible:false,independentTransferEligible:false,lexicalActivation:false,audioActivation:false,sourceIds:[...Tool.SOURCE_IDS],sources:sourceRows,rootReview:review,contexts:contextsRef});
 return{root,releasePath,contexts};
}
function main(){
 const pins=Object.fromEntries(['tools/build-ordinary-reading-course.cjs','tools/append-ordinary-reading-plan.cjs','tools/build-curriculum.cjs','assets/public-course-planner.js'].map(file=>[file,sha(fs.readFileSync(path.join(candidate,file)))]));
 const f=fixture(),loaded=Tool.load(f),result={scope:'read-only candidate; synthetic receipts are not approval',pins,control:{materials:loaded.materials.length,questions:loaded.audit.questions}};
 assert.equal(loaded.materials.length,6);assert.equal(loaded.audit.questions,48);
 const negative=fixture(({id,ctx})=>{if(id==='bls-athletes'){const len=JSON.parse(fs.readFileSync(path.join(author,'materials',id+'-reading.json'))).passage.length;ctx.grammar[0].start-=len;ctx.grammar[0].end-=len;ctx.words[0].start-=len;ctx.words[0].end-=len;}});
 try{Tool.load(negative);result.negativeOffsets={accepted:true,grammar:negative.contexts.sources[0].grammar[0].start,word:negative.contexts.sources[0].words[0].start};}catch(error){result.negativeOffsets={accepted:false,message:error.message};}
 const baseData=copy(require(path.resolve(__dirname,'../ordinary-reading-admission-v92/formal-base-v91/assets/curriculum-data.js'))),baseSourceContexts=copy(require(path.resolve(__dirname,'../ordinary-reading-admission-v92/formal-base-v91/assets/public-context-data.js'))),data=copy(baseData),sourceContexts={...copy(baseSourceContexts),sources:[...copy(baseSourceContexts.sources),...copy(loaded.sourceContexts.sources)]};data.materials.push(...loaded.materials);
 const entries=require(path.join(candidate,'assets/essential-vocabulary-data.js')).entries,expandDay=require(path.join(candidate,'assets/course-expansion.js')).overlay,shared={entries,expandDay,materialContentHash:A.materialContentHash};
 const plan=Composer.compose({baseData,data,basePlan:baseData.publicCoursePlan,baseSourceContexts,sourceContexts,newMaterialIds:loaded.materials.map(m=>m.id),newReadingStartDay:256,...shared});
 Tool.planReceipt(loaded,plan);
 const newIds=new Set(loaded.materials.map(m=>m.id)),next=P.replan(plan,data,{...shared,sourceContexts,cache:false});
 result.composition={oldAssignments:baseData.publicCoursePlan.assignments.length,newAssignments:plan.assignments.filter(a=>newIds.has(a.materialId)).map(a=>({id:a.materialId,day:a.day,minutes:a.dayBudget.after.totalMinutes})),oldAssignmentsExact:baseData.publicCoursePlan.assignments.every(a=>P.hash(a)===P.hash(plan.assignments.find(b=>b.assignmentId===a.assignmentId))),replanValid:next.valid,replanned:next.assignments.filter(a=>newIds.has(a.materialId)).map(a=>({id:a.materialId,day:a.day,window:loaded.catalog.find(s=>s.id===a.sourceId).suggestedWindow}))};
 fs.writeFileSync(path.join(__dirname,'observation.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
if(require.main===module)main();module.exports={fixture,Tool,P,A,Composer,candidate};
