'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createCatalog}=require('../server/year-material-catalog.cjs'),{fixture,hash,wrap}=require('./year-material-fixture.cjs');
// Code may run from NAS. Native copy, rename and junction fixtures always stay
// in a unique local OS temp directory, never beside the UNC-hosted test file.
const tempBase=path.resolve(os.tmpdir());
if(process.platform==='win32'&&tempBase.startsWith('\\\\'))throw Error('Native fixture needs a local os.tmpdir(); executing the test file from NAS is supported.');
const root=fs.mkdtempSync(path.join(tempBase,'ielts-year-native-stamp-v86-')),rootReal=fs.realpathSync(root);
function within(base,target){const relative=path.relative(base,target);return relative!==''&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);}
function fixturePath(value){
 const absolute=path.resolve(value);if(!within(root,absolute))throw Error('Native copy path leaves its unique temporary fixture.');
 const anchor=fs.lstatSync(root);if(anchor.isSymbolicLink()||!anchor.isDirectory()||fs.realpathSync(root)!==rootReal)throw Error('Native copy temporary fixture anchor changed.');
 let current=root;for(const part of path.relative(root,absolute).split(path.sep)){current=path.join(current,part);let stat;try{stat=fs.lstatSync(current);}catch(error){if(error.code==='ENOENT')break;throw error;}if(stat.isSymbolicLink())throw Error('Native fixture copy refuses links and junctions.');const real=fs.realpathSync(current);if(real!==rootReal&&!within(rootReal,real))throw Error('Native copy canonical path leaves its temporary fixture.');}
 return absolute;
}
function copyFixtureTree(from,to,{preserveTimestamps=false}={}){
 const source=fixturePath(from),destination=fixturePath(to);if(source===destination||within(source,destination)||within(destination,source))throw Error('Native copy destination overlaps its source.');const sourceStat=fs.lstatSync(source);if(sourceStat.isSymbolicLink()||!sourceStat.isDirectory())throw Error('Native copy source must be an ordinary directory.');
 if(fs.existsSync(destination)){const stat=fs.lstatSync(destination);if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('Native copy destination must be an ordinary directory.');}else fs.mkdirSync(destination,{recursive:true});
 for(const entry of fs.readdirSync(source,{withFileTypes:true})){
  if(entry.name==='.'||entry.name==='..'||entry.name!==path.basename(entry.name)||entry.name.includes(':')||entry.isSymbolicLink())throw Error('Native fixture copy refuses links or invalid names.');
  const input=fixturePath(path.join(source,entry.name)),output=fixturePath(path.join(destination,entry.name)),stat=fs.lstatSync(input);if(stat.isSymbolicLink())throw Error('Native fixture copy refuses links and junctions.');
  if(entry.isDirectory()&&stat.isDirectory())copyFixtureTree(input,output,{preserveTimestamps});else{if(!entry.isFile()||!stat.isFile())throw Error('Native copy accepts only ordinary files and directories.');fs.copyFileSync(input,output,fs.constants.COPYFILE_EXCL);if(preserveTimestamps)fs.utimesSync(output,stat.atimeMs/1000,stat.mtimeMs/1000);}
 }
 if(preserveTimestamps)fs.utimesSync(destination,sourceStat.atimeMs/1000,sourceStat.mtimeMs/1000);
}
function native({defaultManifest=true}={}){const directory=fs.mkdtempSync(path.join(root,'public-')),f=fixture({rootDir:directory});f.writeFiles();const options={...f.catalogOptions};delete options.readFile;if(defaultManifest)delete options.manifest;return{...f,options,catalog:createCatalog(options)};}
function counts(callback){const original={},value={};for(const name of ['realpathSync','lstatSync','statSync','readFileSync','openSync']){original[name]=fs[name];fs[name]=(...args)=>{value[name]=(value[name]||0)+1;return original[name](...args);};if(original[name].native)fs[name].native=original[name].native;}try{callback(value);return value;}finally{for(const[name,fn]of Object.entries(original))fs[name]=fn;}}
const file=(f,role='frontend-adapter')=>path.resolve(f.root,f.runtimeContract.components.find(c=>c.role===role).path);
function modifyEqualLength(p){const before=fs.statSync(p,{bigint:true}),bytes=fs.readFileSync(p),next=Buffer.from(bytes);next[next.length-1]^=1;fs.writeFileSync(p,next);fs.utimesSync(p,Number(before.atimeNs)/1e9,Number(before.mtimeNs)/1e9);return{before,after:fs.statSync(p,{bigint:true})};}

test('native warm status checks every parent/file stamp and reads only bootstrap without repeating40 realpath resolutions',()=>{
 const f=native();assert.equal(f.catalog.status().active,true);const measured=counts(()=>{for(let n=0;n<5;n++)assert.equal(f.catalog.status().active,true);});assert.equal(measured.realpathSync,5,'only the freshly verified bootstrap uses realpath on an unchanged request');assert.equal(measured.readFileSync,5,'unchanged runtime/index content hashes are not reread');assert.ok(measured.lstatSync>=5*(f.runtimeContract.components.length+2),'every runtime ref and its lexical parent chain is checked on every request');
});

test('same-length component edits with restored mtime are caught immediately through ctime and hash',()=>{
 const f=native(),p=file(f);fs.utimesSync(p,1700000000,1700000000);assert.equal(f.catalog.status().active,true);const changed=modifyEqualLength(p);assert.equal(changed.before.size,changed.after.size);assert.equal(changed.before.mtimeNs,changed.after.mtimeNs);assert.equal(changed.before.ino,changed.after.ino);assert.notEqual(changed.before.ctimeNs,changed.after.ctimeNs);assert.throws(()=>f.catalog.status(),{code:'YEAR_CONTENT_HASH'});
});

test('same-length index edits with restored mtime revoke prepared and hydrated access immediately',()=>{
 const f=native(),p=path.resolve(f.root,f.indexRef.path);fs.utimesSync(p,1700000000,1700000000);assert.equal(f.catalog.status().active,true);assert.ok(f.catalog.get(f.reading.id));const changed=modifyEqualLength(p);assert.equal(changed.before.size,changed.after.size);assert.equal(changed.before.mtimeNs,changed.after.mtimeNs);assert.equal(changed.before.ino,changed.after.ino);assert.notEqual(changed.before.ctimeNs,changed.after.ctimeNs);assert.throws(()=>f.catalog.status(),{code:'YEAR_CONTENT_HASH'});assert.throws(()=>f.catalog.get(f.reading.id),{code:'YEAR_CONTENT_HASH'});
});

test('a same-content file identity replacement requires full canonical, runtime hash and index validation',()=>{
 const f=native(),p=file(f);assert.equal(f.catalog.status().active,true);const before=fs.statSync(p),replacement=p+'.replacement';fs.writeFileSync(replacement,fs.readFileSync(p));fs.utimesSync(replacement,before.atime,before.mtime);fs.renameSync(p,p+'.retained');fs.renameSync(replacement,p);const measured=counts(()=>assert.equal(f.catalog.status().active,true));assert.ok(measured.realpathSync>=f.runtimeContract.components.length+2);assert.ok(measured.readFileSync>=f.runtimeContract.components.length+3);
});

test('a same-content parent directory identity replacement forces complete runtime and index validation',()=>{
 const f=native(),directory=path.join(f.root,'assets'),retained=directory+'-retained';assert.equal(f.catalog.status().active,true);fs.renameSync(directory,retained);copyFixtureTree(retained,directory,{preserveTimestamps:true});const measured=counts(()=>assert.equal(f.catalog.status().active,true));assert.ok(measured.realpathSync>=f.runtimeContract.components.length+2);assert.ok(measured.readFileSync>=f.runtimeContract.components.length+3);
});

test('an unchanged-content external junction replacing a warm parent can never authorize an escape',()=>{
 const f=native({defaultManifest:false}),directory=path.join(f.root,'assets'),retained=directory+'-retained',outside=fs.mkdtempSync(path.join(root,'outside-'));assert.equal(f.catalog.status().active,true);copyFixtureTree(directory,outside);fs.renameSync(directory,retained);fs.symlinkSync(outside,directory,'junction');assert.throws(()=>f.catalog.status(),{code:'YEAR_CONTENT_PATH'});
});

test('an external junction replacing the warm index directory cannot reuse the old prepared index',()=>{
 const f=native({defaultManifest:false}),directory=path.join(f.root,'curriculum/year-first-use'),retained=directory+'-retained',outside=fs.mkdtempSync(path.join(root,'outside-index-'));assert.equal(f.catalog.status().active,true);copyFixtureTree(directory,outside);fs.renameSync(directory,retained);fs.symlinkSync(outside,directory,'junction');assert.throws(()=>f.catalog.status(),{code:'YEAR_CONTENT_PATH'});
});

test('a linked in-root file is revalidated every request and link retargeting outside is refused',t=>{
 const f=native({defaultManifest:false}),p=file(f),target=p+'.target';assert.equal(f.catalog.status().active,true);fs.renameSync(p,target);try{fs.symlinkSync(target,p,'file');}catch(error){if(['EPERM','EACCES'].includes(error.code)){t.skip('Native Windows file symlink privilege unavailable; native directory junction cases still run.');return;}throw error;}assert.equal(f.catalog.status().active,true);const measured=counts(()=>assert.equal(f.catalog.status().active,true));assert.ok(measured.readFileSync>=f.runtimeContract.components.length+2);fs.unlinkSync(p);const outside=path.join(fs.mkdtempSync(path.join(root,'outside-file-')),'identical.js');fs.copyFileSync(target,outside);fs.symlinkSync(outside,p,'file');assert.throws(()=>f.catalog.status(),{code:'YEAR_CONTENT_PATH'});
});

test('regenerated disk pins cannot pretend that this process has loaded a different catalog implementation',()=>{
 const f=native(),component=f.runtimeContract.components.find(c=>c.role==='server-catalog');assert.equal(f.catalog.status().active,true);const content=Buffer.concat([fs.readFileSync(file(f,'server-catalog')),Buffer.from('\n// Synthetic different execution revision.\n')]),updated=f.put(component.path,content);Object.assign(component,updated);const contract={schema:1,kind:'year-first-use-runtime-contract',protocol:1,runtimeConnected:true,activationReviewed:true,components:f.runtimeContract.components};f.runtimeContract.contract=f.put('curriculum/year-first-use-runtime-contract.json',JSON.stringify(contract));f.index.runtimeContract=f.runtimeContract;const index=f.content('curriculum/year-first-use/index',f.index);f.manifest.index=index;f.manifest.runtimeContract=f.runtimeContract;f.data.yearFirstUse.materialIndex=index;f.data.yearFirstUse.runtimeContract=f.runtimeContract;f.data.yearFirstUse.firstUseManifest=f.put('assets/year-first-use-manifest.js',wrap(f.manifest));f.writeFiles();assert.throws(()=>f.catalog.status(),{code:'YEAR_RUNTIME_RESTART_REQUIRED'});
});

test('the explicit injected byte reader retains full checks on every call',()=>{
 const f=fixture(),catalog=createCatalog(f.catalogOptions);assert.equal(catalog.status().active,true);f.files.set(file(f),Buffer.from('Unreviewed injected revision'));assert.throws(()=>catalog.status(),{code:'YEAR_CONTENT_HASH'});
});

test('a reparse-file stamp always takes complete verification even when its visible identity is unchanged',()=>{
 const f=native({defaultManifest:false}),p=file(f);assert.equal(f.catalog.status().active,true);const original=fs.lstatSync;fs.lstatSync=(...args)=>{const stat=original(...args);return args[0]===p?new Proxy(stat,{get(target,key){return key==='isSymbolicLink'?()=>true:Reflect.get(target,key);}}):stat;};try{const measured=counts(()=>assert.equal(f.catalog.status().active,true));assert.ok(measured.readFileSync>=f.runtimeContract.components.length+2,'a link must never take the unchanged prepared/hash shortcut');}finally{fs.lstatSync=original;}
});
