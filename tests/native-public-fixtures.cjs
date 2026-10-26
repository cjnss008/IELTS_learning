'use strict';
// Native mutation fixtures always live on the local OS temporary volume.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
function inside(root,target){const relative=path.relative(path.resolve(root),path.resolve(target));return relative===''||(!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep));}
function checked(root,target){
 const base=path.resolve(root),file=path.resolve(target);assert(inside(base,file),'fixture path escaped its dedicated root');const parts=path.relative(base,file).split(path.sep).filter(Boolean);let current=base;for(const part of [null,...parts]){if(part!==null)current=path.join(current,part);const stat=fs.lstatSync(current);assert(!stat.isSymbolicLink(),'native fixture refuses a symlink or junction');}
 const canonicalRoot=fs.realpathSync(base),canonical=fs.realpathSync(file);assert(inside(canonicalRoot,canonical),'native fixture canonical path escaped its dedicated root');return fs.lstatSync(file);
}
function directory(root,target){
 const base=path.resolve(root),destination=path.resolve(target);assert(inside(base,destination),'fixture destination escaped its dedicated root');checked(base,base);let current=base;for(const part of path.relative(base,destination).split(path.sep).filter(Boolean)){current=path.join(current,part);if(!fs.existsSync(current))fs.mkdirSync(current);assert(checked(base,current).isDirectory(),'fixture destination parent is not a directory');}
}
function copyTree(source,target,{sourceRoot,destinationRoot,preserveTimestamps=true}={}){
 assert(sourceRoot&&destinationRoot,'both native copy boundaries are required');const from=path.resolve(source),to=path.resolve(target),sourceBase=fs.realpathSync(path.resolve(sourceRoot)),destinationBase=fs.realpathSync(path.resolve(destinationRoot));assert(!inside(sourceBase,destinationBase)&&!inside(destinationBase,sourceBase),'native fixture copy roots overlap');assert(inside(sourceRoot,from)&&inside(destinationRoot,to),'native fixture copy escaped its dedicated root');const stat=checked(sourceRoot,from);
 if(stat.isDirectory()){
  directory(destinationRoot,to);for(const entry of fs.readdirSync(from,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){assert(!entry.isSymbolicLink(),'native fixture refuses a symlink or junction');assert(entry.isFile()||entry.isDirectory(),'native fixture refuses special filesystem entries');copyTree(path.join(from,entry.name),path.join(to,entry.name),{sourceRoot,destinationRoot,preserveTimestamps});}
  if(preserveTimestamps)fs.utimesSync(to,stat.atime,stat.mtime);
 }else{
  assert(stat.isFile(),'native fixture refuses a non-regular source');directory(destinationRoot,path.dirname(to));if(fs.existsSync(to)){checked(destinationRoot,to);assert.fail('native fixture destination already exists');}fs.copyFileSync(from,to,fs.constants.COPYFILE_EXCL);checked(sourceRoot,from);assert(checked(destinationRoot,to).isFile());if(preserveTimestamps)fs.utimesSync(to,stat.atime,stat.mtime);
 }
 return to;
}
function tempDirectory(t,prefix='ielts-public-fixture-'){
 assert(t&&typeof t.after==='function','native fixture cleanup requires the owning test');assert(/^[a-z0-9-]+-$/.test(prefix),'unsafe native fixture prefix');const parent=fs.realpathSync(os.tmpdir()),directory=fs.mkdtempSync(path.join(parent,prefix)),canonical=fs.realpathSync(directory);assert.equal(path.dirname(canonical),parent);assert.ok(path.basename(canonical).startsWith(prefix));assert(!directory.startsWith('\\\\'),'native fixture needs a local OS temporary directory');
 t.after(()=>{if(!fs.existsSync(directory))return;assert(!fs.lstatSync(directory).isSymbolicLink(),'native fixture root identity changed');assert.equal(fs.realpathSync(directory),canonical,'native fixture root identity changed');assert.equal(path.dirname(canonical),parent);assert.ok(path.basename(canonical).startsWith(prefix));fs.rmSync(canonical,{recursive:true,force:true});});return directory;
}
module.exports={inside,checked,copyTree,tempDirectory};
