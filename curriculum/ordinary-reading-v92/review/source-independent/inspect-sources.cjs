'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../ordinary-source-expansion-v92');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const ids=['voa-air-travel','noaa-corals','noaa-invasive-species-dd59','noaa-microplastics-dd66'];
for(const id of ids){const c=read('candidates/'+id+'.json'),b=fs.readFileSync(path.join(root,c.origin.raw.path),'utf8');const m=c.origin.raw.path.endsWith('.json')?JSON.parse(b).markdown:b;
const re=/.{0,100}(copyright|Copyright|credit|Credit|written|Written|music|Music|AP |Reuters|AFP|produced|Produced|Troy|Kosaki|Martinez).{0,200}/g;
console.log(JSON.stringify({id,url:c.origin.sourceUrl,audio:c.audio,people:c.speakers,rightsHits:[...m.matchAll(re)].map(x=>x[0])}));}
const nist=read('evidence/raw/nist-atomic-television.json').markdown;const i=nist.indexOf('NIST’s receiver');console.log(JSON.stringify({nistRawParagraph:nist.slice(i,i+1300)}));
