'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function build(options={}){
 const root=path.resolve(options.root||path.join(__dirname,'..')),V=require(path.join(root,'tools/audit-essential-material-overlap.cjs')),Audit=require(path.join(root,'tools/audit-public-supplements.cjs')),B=require(path.join(root,'tools/build-public-supplement-materials.cjs'));
 const catalog=JSON.parse(fs.readFileSync(path.join(root,'curriculum/public-supplement-catalog.json'))),pack=require(path.join(root,'assets/essential-vocabulary-data.js')),csv=fs.readFileSync(options.csv||path.join(root,'work/essential-vocabulary/ecdict.csv')),lock=JSON.parse(fs.readFileSync(path.join(root,'vocabulary/essential/source-lock.json'))),expected=lock.sources.find(s=>s.id==='ecdict').files.find(f=>f.file==='ecdict.csv').sha256;
 if(hash(csv)!==expected)throw Error('Exact dictionary source required for explicit inflections');
 const forms=V.formIndex(pack.entries,csv),roster=B.releaseRoster(root,catalog,options.sourceIds),sources=[];
 for(const id of roster.sourceIds){
  const source=catalog.sources.find(s=>s.sourceId===id);if(!source)throw Error('Source missing from catalogue: '+id);
  const text=fs.readFileSync(B.publicFile(root,source.text.path),'utf8');if(hash(text)!==source.text.sha256||source.contentHash!==hash(text))throw Error('Source bytes changed: '+id);
  const grammar=Audit.grammarAudit(source,text);if(grammar.errors.length)throw Error(id+': '+grammar.errors.join('; '));
  const masked=Audit.maskSpeakerLabels(text,source.speakerLabels||source.text.speakerLabels||[]),candidateText=require(path.join(root,'assets/public-material-selector.js')).lexicalText({skill:source.kind==='listening'?'listening':'reading'},masked.masked),seen=new Set(),words=[];
  for(const token of V.tokens(candidateText)){
   const matches=forms.index.get(token.key)||[],heads=[...new Set(matches.map(m=>m.headword))];
   for(const word of heads){if(seen.has(word))continue;seen.add(word);const relation=token.key===word?'exact-headword':matches.find(m=>m.headword===word).relation;words.push({word,surface:text.slice(token.start,token.end),start:token.start,end:token.end,relation,ambiguousLemma:heads.length>1});}
  }
  sources.push({sourceId:id,sourceTextSha256:hash(text),level:source.level,words,grammar:source.grammarEvidence});
 }
 const data={schema:1,use:'ordinary-practice-source-contexts',meaningStatus:'dictionary-gloss-not-context-sense-certification',masteryEvidence:false,essentialAssetSha256:hash(fs.readFileSync(path.join(root,'assets/essential-vocabulary-data.js'))),ecdictSha256:hash(csv),release:roster.release?{id:roster.release.id,sha256:roster.release.sha256}:null,sources};
 if(options.output){const json=JSON.stringify(data).replace(/</g,'\\u003c'),bytes=`(function(root){'use strict';const data=${json};root.IELTSPublicContextData=data;if(typeof module==='object'&&module.exports)module.exports=data;})(typeof globalThis!=='undefined'?globalThis:this);\n`,incoming=options.output+'.incoming-'+process.pid+'-'+crypto.randomBytes(6).toString('hex');try{fs.writeFileSync(incoming,bytes,{flag:'wx'});if(hash(fs.readFileSync(incoming))!==hash(bytes))throw Error('Context asset write verification failed');fs.renameSync(incoming,options.output);}finally{if(fs.existsSync(incoming))fs.unlinkSync(incoming);}}
 return data;
}
module.exports={build};
if(require.main===module){const root=path.resolve(process.argv[2]||path.join(__dirname,'..')),output=path.join(root,'assets/public-context-data.js'),data=build({root,output});console.log(JSON.stringify({sources:data.sources.length,wordContextCandidates:data.sources.reduce((n,s)=>n+s.words.length,0),grammar:data.sources.reduce((n,s)=>n+s.grammar.length,0),bytes:fs.statSync(output).size,masteryEvidence:false}));}
