'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {parseCmu,arpabetToIpa,sourceBoundaries,candidatesFor}=require('./build-us-pronunciations.cjs');
const runtime=require('./american-pronunciation-runtime.cjs');
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const normal=value=>value.trim().toLowerCase().replace(/[’]/g,"'").replace(/\s+/g,' ');
function collect(course,curriculum,bridge){
 const required=new Map(),tokens=new Set();
 const add=(word,source)=>{if(typeof word!=='string'||!word.trim())return;const key=normal(word),values=required.get(key)||new Set();values.add(source);required.set(key,values);};
 Object.values(course.vocab||{}).flat().forEach(v=>add(v.word,'course'));
 (curriculum.materials||[]).forEach(m=>(m.vocabulary||[]).forEach(v=>add(v.word,m.id)));
 (bridge||[]).forEach(v=>add(v.word,'bridge'));
 function scan(value){if(typeof value==='string'){for(const m of value.matchAll(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g))if(m[0].length<50)tokens.add(normal(m[0]));}else if(Array.isArray(value))value.forEach(scan);else if(value&&typeof value==='object')Object.values(value).forEach(scan);}
 scan(course);scan(curriculum);for(const word of required.keys())tokens.add(word);return{required,tokens};
}
function build({cmu,essential,course,curriculum,bridge,selection,policy,revision,supplemental={}}){
 const {required,tokens}=collect(course,curriculum,bridge),entries={},provenance={},missing=[];
 const primary={};for(const [key,entry]of Object.entries(essential.entries))primary[key]=entry;
 const compact=values=>{const unique=[...new Set(values)];return unique.length===1?unique[0]:unique;};
 function single(word){
  if(entries[word])return entries[word];
  if(primary[word]){const entry=primary[word];entries[word]=compact(entry.ipaVariants);provenance[word]={kind:entry.source.dictionary,sourceWord:entry.source.sourceWord||word};return entries[word];}
  if(supplemental[word]){entries[word]=compact(supplemental[word].ipaVariants||[supplemental[word].ipa]);provenance[word]={kind:'supplement',...supplemental[word].source};return entries[word];}
  const alias=policy.courseSpellingAliases?.[word]||({palaeontology:'paleontology',artefact:'artifact'})[word],safe=word.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const grammaticalSpelling=word.replace(/ised$/,'ized').replace(/ising$/,'izing');
  const possibilities=[...candidatesFor({word},selection,policy),alias,grammaticalSpelling,safe].filter(Boolean),sourceWord=possibilities.find(w=>cmu.has(w));
  if(!sourceWord)return null;
  const rows=cmu.get(sourceWord),choice=policy.primaryVariants[word]?.variant,sorted=choice?[...rows].sort((a,b)=>(a.variant===choice?-1:b.variant===choice?1:a.variant-b.variant)):rows;
  entries[word]=compact(sorted.map(row=>arpabetToIpa(row.arpabet,{boundaries:sourceBoundaries(sourceWord,row.arpabet,cmu,policy)})));
  provenance[word]={kind:'cmudict',sourceWord};return entries[word];
 }
 Object.keys(primary).forEach(single);for(const word of tokens)if(!/\s/.test(word))single(word);
 for(const word of required.keys()){
  if(single(word))continue;
  // These are citation forms of existing source words, not a claim about
  // connected-speech assimilation, phrase stress, or a new single-word entry.
  const parts=word.replace(/\s*\([a-z]+\)\s*$/,'').split(/\s+/).flatMap(part=>single(part)?[part]:part.split('-')).filter(Boolean);
  if(parts.length<2||parts.some(part=>!single(part))){missing.push({word,materials:[...required.get(word)]});continue;}
  const ipa=parts.map(part=>{const v=entries[part];return(typeof v==='string'?v:v[0]).replace(/^\/|\/$/g,'');}).join(' ');
  entries[word]='/'+ipa+'/';provenance[word]={kind:'component-citation',components:parts};
 }
 const usAbbreviation=cmu.get('us')?.find(v=>v.variant===2);if(usAbbreviation){entries.US=arpabetToIpa(usAbbreviation.arpabet);provenance.US={kind:'cmudict',sourceWord:'us',variant:2,reason:'Uppercase US denotes the United States abbreviation, distinct from the pronoun us.'};}
 const source={cmuRevision:revision,cmuLicense:'BSD-2-Clause',notice:'vocabulary/essential/NOTICE.txt',audit:'vocabulary/essential/course-us-pronunciation-audit.json',method:'Source ARPAbet to broad American IPA; material hints only select existing source variants. Multiword entries concatenate source citation forms.'};
 const data={schema:1,accent:'en-US',source,heteronyms:Object.keys(policy.primaryVariants),entries};
 const audit={schema:1,accent:'en-US',source,requiredCount:required.size,coveredRequired:[...required.keys()].filter(w=>entries[w]).length,missingCount:missing.length,missing,entryCount:Object.keys(entries).length,essentialCount:Object.keys(primary).length,provenance,notes:['Missing source pronunciations remain blank in the course dictionary until a separately labelled American lookup supplies them.','Phrase entries are independent source citation forms, not a connected-speech phonetic transcription.','Only source variants are emitted; legacy British hints are normalized for matching, never used to manufacture an American transcription.']};
 return{data,audit};
}
function main(argv=process.argv.slice(2)){
 const args={};for(let i=0;i<argv.length;i++)if(argv[i].startsWith('--'))args[argv[i].slice(2)]=argv[++i];
 const root=path.resolve(args.root||path.join(__dirname,'..')),dir=path.join(root,'vocabulary','essential'),cmuFile=args.cmu||path.join(root,'work/essential-vocabulary/cmudict/cmudict.dict');
 const lock=JSON.parse(fs.readFileSync(path.join(dir,'source-lock.json'),'utf8')),source=lock.sources.find(s=>s.id==='cmudict'),raw=fs.readFileSync(cmuFile);if(sha256(raw)!==source.files.find(f=>f.file==='cmudict.dict').sha256)throw Error('CMUdict source hash mismatch');
 const course=require(path.join(root,'assets/course-data.js')),curriculum=require(path.join(root,'assets/curriculum-data.js')),bridge=require(path.join(root,'assets/word-dictionary.js')).bridge;
 const {data,audit}=build({cmu:parseCmu(raw.toString('utf8')),essential:JSON.parse(fs.readFileSync(path.join(dir,'us-pronunciations.json'),'utf8')),course,curriculum,bridge,selection:JSON.parse(fs.readFileSync(path.join(dir,'selection-policy.json'),'utf8')),policy:JSON.parse(fs.readFileSync(args.policy||path.join(dir,'us-phonetics-policy.json'),'utf8')),revision:source.revision,supplemental:args.supplement?JSON.parse(fs.readFileSync(args.supplement,'utf8')):{}});
 const out=args.out||path.join(root,'assets/american-pronunciations.js'),auditFile=args.audit||path.join(dir,'course-us-pronunciation-audit.json');
 const script='/* Generated source-based American pronunciations. See vocabulary/essential/NOTICE.txt. */\n(function(root,factory){const api=factory('+JSON.stringify(data)+');root.IELTSAmericanPronunciations=api;if(typeof module==="object"&&module.exports)module.exports=api;})(typeof globalThis!=="undefined"?globalThis:this,'+runtime.toString()+');\n';
 fs.writeFileSync(out,script);audit.assetSha256=sha256(fs.readFileSync(out));audit.assetBytes=fs.statSync(out).size;fs.writeFileSync(auditFile,JSON.stringify(audit,null,2)+'\n');
 console.log(JSON.stringify({out,count:audit.entryCount,bytes:audit.assetBytes,required:audit.requiredCount,covered:audit.coveredRequired,missing:audit.missingCount,sha256:audit.assetSha256}));return{data,audit};
}
module.exports={collect,build,main};if(require.main===module)try{main();}catch(error){console.error(error.stack);process.exitCode=1;}
