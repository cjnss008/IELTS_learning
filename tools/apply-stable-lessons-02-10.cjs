'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const clone=value=>JSON.parse(JSON.stringify(value)),sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function apply(data,options={}){
 const root=options.root||path.join(__dirname,'..'),A=options.assessment||require(path.join(root,'assets/assessment-core.js')),folder=path.join(root,'curriculum/stable-lessons-02-10'),catalog=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));
 // The builder still has optional undefined properties. Compare the JSON
 // contract it will export, without normalizing or mutating its live objects.
 const contractHash=value=>A.materialContentHash(clone(value));
 if(catalog.schema!==1||catalog.policy!=='versioned-source-overlay-after-derived-and-english-v1'||!Array.isArray(catalog.materials)||new Set(catalog.materials.map(m=>m.id)).size!==catalog.materials.length)throw Error('Invalid stable lesson source catalog.');
 const day1=data.days.find(d=>d.day===1),protectedIds=new Set(day1.tasks.flatMap(t=>t.materialIds)),map=new Map(data.materials.map((m,i)=>[m.id,{material:m,index:i}]));
 if(contractHash(day1)!==catalog.protectedDay1.dayContentHash)throw Error('Day 1 plan drifted; stable lesson overlay will not alter it.');
 const protectedBefore=[...protectedIds].map(id=>{const m=map.get(id)?.material,expected=catalog.protectedDay1.materials.find(m=>m.id===id);if(!m||!expected||contractHash(m)!==expected.contentHash)throw Error('Day 1 material drifted: '+id);return{id,contentHash:expected.contentHash};});
 const replacements=[];let alreadyCurrent=0;
 for(const row of catalog.materials){
  if(!/^[a-zA-Z0-9-]+$/.test(row.id)||row.file!=='materials/'+row.id+'.json'||protectedIds.has(row.id))throw Error('Stable lesson catalog attempted a protected or invalid ID: '+row.id);
  const bytes=fs.readFileSync(path.join(folder,row.file));if(sha(bytes)!==row.fileSHA256)throw Error('Stable lesson source file hash mismatch: '+row.id);
  const next=JSON.parse(bytes),entry=map.get(row.id);if(!entry||next.id!==row.id||contractHash(next)!==row.afterContentHash)throw Error('Stable lesson source identity mismatch: '+row.id);
  const old=entry.material,currentHash=contractHash(old);if(currentHash===row.afterContentHash){alreadyCurrent++;continue;}
  if(currentHash!==row.beforeContentHash)throw Error('Stable lesson base content drifted: '+row.id+'; refusing to overwrite an unreviewed source revision.');
  if(String(next.version)!==row.version||String(next.version)===String(old.version))throw Error('Stable lesson version did not advance: '+row.id);
  for(const key of ['transcript','audio','audioVoice','audioVoices','audioDurationSeconds','audioSynthetic','minWords','maxWords'])if(JSON.stringify(next[key])!==JSON.stringify(old[key]))throw Error('Stable lesson changed protected source or gate '+row.id+'/'+key);
  if(next.skill!=='grammar'&&next.passage!==old.passage)throw Error('Stable lesson changed a reading source: '+row.id);
  if(JSON.stringify((next.questions||[]).map(q=>q.answers))!==JSON.stringify((old.questions||[]).map(q=>q.answers)))throw Error('Stable lesson changed accepted answers: '+row.id);
  const projection=Object.fromEntries(next.source.contentHashFields.map(key=>[key,next[key]]));if(contractHash(projection)!==next.source.contentHash)throw Error('Stable lesson teaching-field hash mismatch: '+row.id);
  replacements.push({index:entry.index,material:clone(next)});
 }
 // Validate the whole catalog before changing one array element.
 for(const item of replacements)data.materials[item.index]=item.material;
 for(const item of protectedBefore)if(contractHash(data.materials.find(m=>m.id===item.id))!==item.contentHash)throw Error('Protected day 1 material changed unexpectedly.');
 return{schema:1,catalogSHA256:sha(fs.readFileSync(path.join(folder,'manifest.json'))),applied:replacements.length,alreadyCurrent,protectedDay1Materials:protectedBefore.length};
}
module.exports={apply};
