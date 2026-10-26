'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Readable}=require('node:stream'),{pipeline}=require('node:stream/promises');
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function fetchSources(root=path.resolve(__dirname,'..')){
 const lock=JSON.parse(fs.readFileSync(path.join(root,'vocabulary','essential','source-lock.json'),'utf8'));
 const out=path.join(root,'work','essential-vocabulary');fs.mkdirSync(out,{recursive:true});
 for(const source of lock.sources.filter(s=>Array.isArray(s.files)))for(const file of source.files){
  const folder=source.id==='ecdict'?out:path.join(out,source.id);fs.mkdirSync(folder,{recursive:true});const target=path.join(folder,file.file);
  if(fs.existsSync(target)&&sha256(fs.readFileSync(target))===file.sha256){console.log(file.file+': verified cache');continue;}
  const response=await fetch(file.url);if(!response.ok)throw Error(file.file+': HTTP '+response.status);
  const temp=target+'.download.tmp';await pipeline(Readable.fromWeb(response.body),fs.createWriteStream(temp));
  const bytes=fs.readFileSync(temp);if(bytes.length!==file.bytes||sha256(bytes)!==file.sha256)throw Error(file.file+': source hash mismatch; cached final source was not replaced');
  fs.renameSync(temp,target);console.log(file.file+': downloaded and verified');
 }
 return out;
}
module.exports={fetchSources};if(require.main===module)fetchSources(process.argv[2]?path.resolve(process.argv[2]):undefined).catch(e=>{console.error(e.message);process.exitCode=1;});
