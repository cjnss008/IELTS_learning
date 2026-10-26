'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function audit(rootDir=path.resolve(__dirname,'..')){
 const data=require(path.join(rootDir,'assets/curriculum-data.js')),oral=require(path.join(rootDir,'assets/oral-practice.js')),index=JSON.parse(fs.readFileSync(path.join(rootDir,'curriculum/oral-model-audio-index.json'),'utf8')),models=require(path.join(rootDir,'assets/oral-model-audio.js'));
 const expected=new Map(),problems=[],counts={sources:0,sourceSegments:0,uniqueSegments:0,readyFiles:0,bytes:0,durationSeconds:0,lostWords:0,isolatedMarkers:0,overWordLimit:0,missingIndex:0,missingSourceLinks:0,hashErrors:0,missingFiles:0,sizeErrors:0,durationErrors:0,audioHeaderErrors:0,mapErrors:0};
 for(const material of data.materials.filter(m=>m.skill==='speaking'&&m.pool==='training')){
  const reading=data.materials.find(m=>m.id===material.id.replace(/-speaking$/,'')),sourceText=material.reference?.trim()?material.reference:reading?.passage;if(!sourceText)continue;counts.sources++;
  const parts=oral.spokenReferenceParts(sourceText,65);counts.sourceSegments+=parts.length;
  if(parts.join(' ').trim().replace(/\s+/g,' ')!==oral.spokenText(sourceText).trim().replace(/\s+/g,' ')){counts.lostWords++;problems.push('Spoken source words differ: '+material.id);}
  parts.forEach((reference,segmentIndex)=>{if(/^[A-Z]\.?$/.test(reference))counts.isolatedMarkers++;if(reference.split(/\s+/).length>65)counts.overWordLimit++;if(!expected.has(reference))expected.set(reference,[]);expected.get(reference).push({materialId:material.id,readingId:material.reference?.trim()?material.id:reading.id,segmentIndex});});
 }
 counts.uniqueSegments=expected.size;const entries=new Map(index.segments.map(e=>[e.reference,e])),plannedFiles=new Set();
 for(const [reference,sources]of expected){const entry=entries.get(reference);if(!entry){counts.missingIndex++;continue;}const hash=crypto.createHash('sha256').update(reference).digest('hex'),fileHash=crypto.createHash('sha256').update(entry.voice+'|'+entry.rate+'|'+reference).digest('hex');if(entry.textHash!==hash||!/^en-US-/.test(entry.voice||'')||entry.src!=='audio/oral-models/'+fileHash.slice(0,24)+'.mp3'){counts.hashErrors++;continue;}plannedFiles.add(path.basename(entry.src));
  for(const source of sources)if(!entry.sources?.some(s=>s.materialId===source.materialId&&s.readingId===source.readingId&&s.segmentIndex===source.segmentIndex))counts.missingSourceLinks++;
  if(!entry.ready)continue;const target=path.join(rootDir,entry.src);if(!fs.existsSync(target)){counts.missingFiles++;continue;}const bytes=fs.readFileSync(target),size=bytes.length;counts.readyFiles++;counts.bytes+=size;if(size!==entry.bytes||size<1000)counts.sizeErrors++;if(crypto.createHash('sha256').update(bytes).digest('hex')!==entry.audioHash)counts.hashErrors++;
  if(!Number.isFinite(entry.durationSeconds)||entry.durationSeconds<.1||entry.durationSeconds>180)counts.durationErrors++;else counts.durationSeconds+=entry.durationSeconds;
  const fd=fs.openSync(target,'r'),head=Buffer.alloc(10);try{fs.readSync(fd,head,0,head.length,0);}finally{fs.closeSync(fd);}if(head.subarray(0,3).toString('ascii')!=='ID3'&&!(head[0]===255&&(head[1]&224)===224))counts.audioHeaderErrors++;
  const mapped=models.get(reference);if(!mapped||mapped.src!==entry.src||mapped.textHash!==hash||mapped.audioHash!==entry.audioHash||mapped.voice!==entry.voice||mapped.rate!==entry.rate||mapped.reference!==reference||Math.abs(mapped.durationSeconds-entry.durationSeconds)>.001)counts.mapErrors++;
 }
 const folder=path.join(rootDir,'audio/oral-models'),orphanFiles=fs.readdirSync(folder).filter(name=>name.endsWith('.mp3')&&!plannedFiles.has(name));
 if(entries.size!==expected.size)problems.push('Index contains stale or duplicated source references.');if(index.plannedSegments!==counts.sourceSegments||index.uniqueSegments!==counts.uniqueSegments||index.readySegments!==counts.readyFiles)problems.push('Index counts do not match audited assets.');
 const errors=['lostWords','isolatedMarkers','overWordLimit','missingIndex','missingSourceLinks','hashErrors','missingFiles','sizeErrors','durationErrors','audioHeaderErrors','mapErrors'].reduce((n,k)=>n+counts[k],0)+problems.length;
 return{schema:1,complete:errors===0&&counts.readyFiles===counts.uniqueSegments,counts:{...counts,durationSeconds:Math.round(counts.durationSeconds*1000)/1000},pendingFiles:counts.uniqueSegments-counts.readyFiles,orphanFiles,problems};
}
if(require.main===module){const result=audit();console.log(JSON.stringify(result,null,2));if(result.complete)fs.writeFileSync(path.join(__dirname,'../curriculum/oral-model-audio-audit.json'),JSON.stringify(result,null,2)+'\n','utf8');if(!result.complete&&!process.argv.includes('--allow-partial'))process.exitCode=1;}
module.exports={audit};
