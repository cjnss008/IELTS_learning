'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),{createRequire}=require('node:module');
const independent=fs.existsSync(path.join(__dirname,'../source/server/year-runtime-contract-policy.cjs'));
const review=independent?path.resolve(__dirname,'..'):path.join(require('node:os').tmpdir(),'ielts-year-activation-review-v86');
const root=path.resolve(process.env.IELTS_REVIEW_ROOT||(independent?path.join(review,'../year-integration-v86/candidate'):path.join(__dirname,'..')));
const Policy=require(path.join(independent?path.join(review,'source'):root,'server/year-runtime-contract-policy.cjs'));
const Activation=require(path.join(root,'tools/year-runtime-activation.cjs')),Catalog=require(path.join(root,'server/year-material-catalog.cjs'));
const Fixture=require(path.join(root,'tests/year-material-fixture.cjs'));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),copy=v=>JSON.parse(JSON.stringify(v));
const scratchServers=new WeakMap();
function scratch(t){const area=path.join(review,'scratch');fs.mkdirSync(area,{recursive:true});const directory=fs.mkdtempSync(path.join(area,'audit-')),servers=[];scratchServers.set(t,servers);t.after(async()=>{for(const server of servers)if(server.listening){server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}const resolved=path.resolve(directory);assert.ok(resolved.startsWith(path.resolve(area)+path.sep));fs.rmSync(resolved,{recursive:true,force:true});});return directory;}
function trackServer(t,server){const servers=scratchServers.get(t);assert.ok(servers,'HTTP fixtures require an owned scratch root');servers.push(server);}
function copyPublicTree(from,to){
 const source=path.resolve(from),target=path.resolve(to);assert.ok(['assets','server','tools','calibration'].some(name=>source===path.resolve(root,name)),'copy only explicit public source directories');assert.ok(target.startsWith(path.resolve(review)+path.sep),'copy only into the owned local scratch tree');
 function walk(current,destination){assert.ok(current===source||current.startsWith(source+path.sep));assert.ok(destination===target||destination.startsWith(target+path.sep));fs.mkdirSync(destination,{recursive:true});for(const item of fs.readdirSync(current,{withFileTypes:true})){assert.equal(item.isSymbolicLink(),false,'public source links are not followed');const file=path.join(current,item.name),output=path.join(destination,item.name);if(item.isDirectory())walk(file,output);else{assert.ok(item.isFile(),'copy only public files and directories');fs.copyFileSync(file,output);}}}
 walk(source,target);
}
function componentBytes(relative){const file=path.join(root,relative),bytes=fs.readFileSync(fs.existsSync(file)?file:path.join(review,'source',relative));return relative.endsWith('.html')?Buffer.from(bytes.toString('utf8').replace(/<script\b[^>]*data-src="assets\/family-lesson-expansion-v95\.js"[^>]*><\/script>\r?\n?/g,'')):bytes;}
function productionContract(t){
 const directory=scratch(t),components=[];
 for(const [role,relative]of Object.entries(Policy.REQUIRED_COMPONENTS)){const bytes=componentBytes(relative),target=path.join(directory,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);components.push({role,path:relative,sha256:sha(bytes),bytes:bytes.length});}
 const value={schema:1,kind:'year-first-use-runtime-contract',protocol:1,runtimeConnected:true,activationReviewed:true,components},file=path.join(directory,'curriculum/year-first-use-runtime-contract.json');fs.mkdirSync(path.dirname(file),{recursive:true});
 const write=()=>fs.writeFileSync(file,JSON.stringify(value)),check=()=>Activation.validateRuntimeContract({root:directory,contractPath:'curriculum/year-first-use-runtime-contract.json'});write();return{directory,value,file,write,check};
}
function rebind(f,components){
 const contract={schema:1,kind:'year-first-use-runtime-contract',protocol:1,runtimeConnected:true,activationReviewed:true,components};
 const metadata={protocol:1,runtimeConnected:true,contract:f.put('curriculum/year-first-use-runtime-contract.json',JSON.stringify(contract)),components};
 f.runtimeContract=metadata;f.index.runtimeContract=metadata;f.manifest.runtimeContract=metadata;f.data.yearFirstUse.runtimeContract=metadata;
 const indexRef=f.content('curriculum/year-first-use/index',f.index);f.indexRef=indexRef;f.manifest.index=indexRef;f.data.yearFirstUse.materialIndex=indexRef;f.data.yearFirstUse.firstUseManifest=f.put('assets/year-first-use-manifest.js',Fixture.wrap(f.manifest));
}
function scriptOrder(text){const entries=[];for(const match of text.matchAll(/<script\b([^>]*)>/gi)){const attrs=new Map();for(const a of match[1].matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))attrs.set(a[1].toLowerCase(),a[2]??a[3]??a[4]??'');if(attrs.get('data-ielts-script')==='1')entries.push({file:attrs.get('data-src'),deferred:attrs.has('defer')||attrs.get('data-ielts-type')==='module'});}return[...entries.filter(e=>!e.deferred),...entries.filter(e=>e.deferred)].map(e=>e.file);}

test('reviewed activation binds every actual production consumer, with a bounded component count',t=>{
 const f=productionContract(t);assert.equal(Policy.PLAYER_PAGES.length,10);assert.equal(Policy.REQUIRED_ROLES.length,51);assert.equal(Policy.MAX_COMPONENTS,52);assert.equal(Policy.componentListProblem(f.value.components),null);assert.equal(f.check().metadata.components.length,51);
});
test('four generic role labels cannot activate a curriculum or substitute another path for a consumer',t=>{
 const f=productionContract(t),roles=new Set(['frontend-adapter','server-catalog','backup-keys','entrypoint']);f.value.components=f.value.components.filter(c=>roles.has(c.role));f.write();assert.throws(f.check);
 const full=productionContract(t),row=full.value.components.find(c=>c.role==='frontend-adapter'),other=full.value.components.find(c=>c.role==='course-player');Object.assign(row,{path:other.path,sha256:other.sha256,bytes:other.bytes});full.write();assert.throws(full.check);
});
test('no required State, Runtime, ownership, budget, persistence, evidence or Player page pin may be omitted',t=>{
 const f=productionContract(t),original=copy(f.value.components);for(const role of Policy.REQUIRED_ROLES){f.value.components=original.filter(c=>c.role!==role);f.write();assert.throws(f.check,undefined,role);}
});
test('build rejects duplicate paths, missing byte sizes and more than the bounded component cap',t=>{
 const f=productionContract(t),original=copy(f.value.components),first=original[0];
 for(const bad of [[...original,{...first,role:'extra-alias'}],original.map((r,i)=>i===0?{role:r.role,path:r.path,sha256:r.sha256}:r)]){f.value.components=bad;f.write();assert.throws(f.check);}
 f.value.components=original;for(let i=0;i<=Policy.MAX_COMPONENTS-Policy.REQUIRED_ROLES.length;i++){const relative='assets/optional-'+i+'.js',bytes=Buffer.from('// explicit optional component '+i+'\n');fs.writeFileSync(path.join(f.directory,relative),bytes);f.value.components.push({role:'optional-'+i,path:relative,sha256:sha(bytes),bytes:bytes.length});}f.write();assert.throws(f.check);
});
test('server applies the same role/path, duplicate-file and cap rules before exposing the index',()=>{
 for(const edit of [rows=>rows.filter(r=>['frontend-adapter','server-catalog','backup-keys','entrypoint'].includes(r.role)),rows=>[...rows,{...rows[0],role:'extra-alias'}],rows=>rows.map((row,index)=>index===0?{...row,path:rows[1].path,sha256:rows[1].sha256,bytes:rows[1].bytes}:row)]){
  const f=Fixture.fixture();rebind(f,edit(copy(f.runtimeContract.components)));assert.throws(()=>Catalog.createCatalog(f.catalogOptions).status());assert.equal(f.materialReads().length,0);
 }
 const f=Fixture.fixture(),rows=copy(f.runtimeContract.components);while(rows.length<=Policy.MAX_COMPONENTS){const index=rows.length;rows.push({role:'optional-'+index,...f.put('assets/optional-'+index+'.js','// bounded optional component\n')});}rebind(f,rows);assert.throws(()=>Catalog.createCatalog(f.catalogOptions).status());assert.equal(f.materialReads().length,0);
});
test('warm catalog rechecks changed source bytes instead of trusting an unchanged manifest cache key',()=>{
 const f=Fixture.fixture(),catalog=Catalog.createCatalog(f.catalogOptions);assert.equal(catalog.status().active,true);const row=f.runtimeContract.components.find(c=>c.role==='frontend-adapter');f.files.set(path.resolve(f.root,row.path),Buffer.from('changed consumer after activation'));assert.throws(()=>catalog.status());assert.equal(f.materialReads().length,0);
});
test('readFile seam revalidates a same-length changed index even with the same manifest key',()=>{
 const f=Fixture.fixture(),catalog=Catalog.createCatalog(f.catalogOptions);assert.equal(catalog.status().active,true);const file=path.resolve(f.root,f.indexRef.path),before=f.files.get(file),changed=Buffer.from(before.toString().replace('"estimatedStudyMinutes":12','"estimatedStudyMinutes":13'));assert.equal(changed.length,before.length);assert.notDeepEqual(changed,before);f.files.set(file,changed);assert.throws(()=>catalog.status(),{code:'YEAR_CONTENT_HASH'});assert.equal(f.materialReads().length,0);
});
test('warm native HTTP rejects a same-length index change while the manifest remains unchanged',async t=>{
 const directory=scratch(t),f=Fixture.fixture({rootDir:path.join(directory,'app')});f.writeFiles();const {createServer}=require(path.join(root,'server/server.cjs')),server=createServer({rootDir:f.root,dataDir:path.join(directory,'synthetic-data'),migrateLegacy:false,materialMigration:false,yearFirstUseCatalog:{rootDir:f.root,data:f.data,getContextCatalog:()=>f.contextCatalog}});trackServer(t,server);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/api/year-first-use/status';assert.equal((await fetch(url)).status,200);const file=path.join(f.root,f.indexRef.path),before=fs.readFileSync(file),stat=fs.statSync(file),changed=Buffer.from(before.toString().replace('"estimatedStudyMinutes":12','"estimatedStudyMinutes":13'));assert.equal(changed.length,before.length);assert.notDeepEqual(changed,before);fs.writeFileSync(file,changed);fs.utimesSync(file,stat.atime,stat.mtime);const after=await fetch(url);assert.equal(after.status,503);assert.equal((await after.json()).error.code,'YEAR_CONTENT_HASH');
});
test('unchanged native filesystem stamps reuse the index and component hashes and hydrate only one requested body',t=>{
 const directory=scratch(t),f=Fixture.fixture({rootDir:path.join(directory,'app')});f.writeFiles();const {readFile,...options}=f.catalogOptions,original=fs.openSync,opened=[];fs.openSync=function(file,...args){opened.push(String(file));return original.call(this,file,...args);};try{const catalog=Catalog.createCatalog(options);assert.equal(catalog.status().active,true);const first=opened.length;for(let i=0;i<20;i++)assert.equal(catalog.status().active,true);assert.equal(opened.length,first);assert.equal(opened.filter(file=>file===path.join(f.root,f.indexRef.path)).length,1);assert.equal(opened.filter(file=>file.includes(path.sep+'materials'+path.sep)).length,0);assert.ok(catalog.get(f.reading.id));assert.ok(catalog.get(f.reading.id));assert.equal(opened.filter(file=>file.includes(path.sep+'materials'+path.sep)).length,1);assert.equal(opened.filter(file=>file===path.join(f.root,f.indexRef.path)).length,1);}finally{fs.openSync=original;}
});
test('warm native HTTP status revokes activation after a reviewed component changes on disk',async t=>{
 const directory=scratch(t),f=Fixture.fixture({rootDir:path.join(directory,'app')});f.writeFiles();const {createServer}=require(path.join(root,'server/server.cjs'));const server=createServer({rootDir:f.root,dataDir:path.join(directory,'synthetic-data'),migrateLegacy:false,materialMigration:false,yearFirstUseCatalog:{rootDir:f.root,data:f.data,getContextCatalog:()=>f.contextCatalog}});trackServer(t,server);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/api/year-first-use/status',initial=await fetch(url);assert.equal(initial.status,200);assert.equal((await initial.json()).active,true);const row=f.runtimeContract.components.find(c=>c.role==='frontend-adapter');fs.appendFileSync(path.join(f.root,row.path),'\n// partial update after activation\n');const after=await fetch(url);assert.equal(after.status,503);assert.equal((await after.json()).ok,false);
});
for(const role of ['user-data-server','server-routes'])test('same-process cached '+role+' cannot borrow newly signed disk bytes from a newly loaded catalog',async t=>{
 const directory=scratch(t),isolated=path.join(directory,'app');fs.mkdirSync(isolated,{recursive:true});for(const name of ['assets','server','tools','calibration'])copyPublicTree(path.join(root,name),path.join(isolated,name));for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.html')||n==='VERSION'))fs.copyFileSync(path.join(root,name),path.join(isolated,name));
 const f=Fixture.fixture({rootDir:isolated});f.writeFiles();const userFile=path.join(isolated,'server/user-data.cjs'),routeFile=path.join(isolated,'server/server.cjs'),catalogFile=path.join(isolated,'server/year-material-catalog.cjs'),oldUser=require(userFile),oldRoute=require(routeFile);
 assert.ok(Object.isFrozen(oldUser.RUNTIME_SOURCE));assert.ok(Object.isFrozen(oldRoute.RUNTIME_SOURCE));const row=f.runtimeContract.components.find(c=>c.role===role),updated=Buffer.concat([fs.readFileSync(path.join(isolated,row.path)),Buffer.from('\n// simulated reviewed update in the same process\n')]);f.put(row.path,updated);const components=f.runtimeContract.components.map(c=>c.role===role?{...c,sha256:sha(updated),bytes:updated.length}:c);rebind(f,components);f.writeFiles();
 delete require.cache[require.resolve(catalogFile)];const freshCatalog=require(catalogFile),cachedPins={'server-routes':oldRoute.RUNTIME_SOURCE,'user-data-server':oldUser.RUNTIME_SOURCE};assert.throws(()=>freshCatalog.createCatalog({...f.catalogOptions,loadedRuntimeComponents:cachedPins}).status(),{code:'YEAR_RUNTIME_RESTART_REQUIRED'});
 async function status(routes,suffix){const server=routes.createServer({rootDir:isolated,dataDir:path.join(directory,'synthetic-data-'+suffix),migrateLegacy:false,materialMigration:false,yearFirstUseCatalog:{rootDir:isolated,data:f.data,getContextCatalog:()=>f.contextCatalog}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/year-first-use/status');return{status:response.status,body:await response.json()};}finally{server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}}
 const denied=await status(oldRoute,'cached');assert.equal(denied.status,503);assert.equal(denied.body.error.code,'YEAR_RUNTIME_RESTART_REQUIRED');for(const file of Object.keys(require.cache))if(file.startsWith(path.resolve(isolated)+path.sep))delete require.cache[file];const freshRoute=require(routeFile),accepted=await status(freshRoute,'fresh');assert.equal(accepted.status,200);assert.equal(accepted.body.active,true);assert.equal(accepted.body.hydrated,0);
});

let frozenDraftPromise;
async function actualFrozenDraft(){
 if(!frozenDraftPromise)frozenDraftPromise=(async()=>{const file=path.join(root,'tests/year-first-use-consumers.test.cjs'),raw=fs.readFileSync(file,'utf8'),module={exports:{}};new Function('require','__dirname','module',raw.slice(0,raw.indexOf('\ntest('))+'\nmodule.exports={flow};')(createRequire(file),path.dirname(file),module);const flow=await module.exports.flow({actual:true}),entry=flow.win.IELTSTodayNavigation.learningQueue().next;assert.equal(entry.kind,'year-first-use');assert.equal(await flow.win.IELTSTodayNavigation.openYear(entry),true);return flow.map.get('ielts52-course-player-v1');})();return frozenDraftPromise;
}
for(const page of Policy.PLAYER_PAGES)test('actual Load-started year draft survives browser-no-require parsing on '+page,async()=>{
 const raw=await actualFrozenDraft(),text=fs.readFileSync(path.join(root,page),'utf8'),order=scriptOrder(text),selected=new Set(['assets/assessment-core.js','assets/legacy-material-compatibility.js','assets/lesson-vocabulary-supplement.js','assets/year-first-use-course.js','assets/course-player.js']);
 const context={console,TextEncoder,TextDecoder,URL,URLSearchParams,structuredClone,crypto:crypto.webcrypto};context.window=context;context.globalThis=context;vm.createContext(context);for(const file of order.filter(file=>selected.has(file)))vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:page+':'+file});
 const parsed=context.IELTSCoursePlayer.parseState(raw);assert.ok(Object.values(parsed.drafts).some(d=>d.yearAssignment));assert.equal(JSON.stringify(parsed),raw);assert.equal(Policy.pageDependencyProblem(page,text,Policy.FAMILY_CONTRACT_PATH),null);
});
test('page contract uses bootstrap effective defer order and protects all six Backup consumers',()=>{
 for(const page of Policy.BACKUP_PAGES)assert.equal(Policy.pageDependencyProblem(page,fs.readFileSync(path.join(root,page),'utf8'),Policy.FAMILY_CONTRACT_PATH),null,page);
 const page='陌生材料库.html',text=fs.readFileSync(path.join(root,page),'utf8'),tag='<script type="application/x-ielts-pending" data-ielts-script="1" data-src="assets/year-first-use-course.js"></script>';assert.ok(text.includes(tag));assert.match(Policy.pageDependencyProblem(page,text.replace(tag,tag.replace('></script>',' defer></script>')),Policy.FAMILY_CONTRACT_PATH),/execute before Player/);
});
