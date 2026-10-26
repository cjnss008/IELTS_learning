'use strict';
// A symbol conversion of existing source pronunciations, not grapheme-to-phoneme.
// No GPL cmudict-tools code or conversion tables are included.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
const IPA=Object.freeze({AA:'ɑ',AE:'æ',AH:'ʌ',AO:'ɔ',AW:'aʊ',AY:'aɪ',B:'b',CH:'tʃ',D:'d',DH:'ð',EH:'ɛ',ER:'ɝ',EY:'eɪ',F:'f',G:'ɡ',HH:'h',IH:'ɪ',IY:'i',JH:'dʒ',K:'k',L:'l',M:'m',N:'n',NG:'ŋ',OW:'oʊ',OY:'ɔɪ',P:'p',R:'ɹ',S:'s',SH:'ʃ',T:'t',TH:'θ',UH:'ʊ',UW:'u',V:'v',W:'w',Y:'j',Z:'z',ZH:'ʒ'});
const VOWELS=new Set(['AA','AE','AH','AO','AW','AY','EH','ER','EY','IH','IY','OW','OY','UH','UW']);
// Maximal English onset clusters are used only to place existing source stress
// before a syllable onset. They never add, remove or predict source phonemes.
const ONSETS=new Set(['P L','P R','B L','B R','T R','D R','K L','K R','G L','G R','F L','F R','TH R','SH R','S P','S T','S K','S F','S M','S N','S L','S W','T W','D W','K W','G W','TH W','S P L','S P R','S T R','S K L','S K R','S K W','P Y','B Y','T Y','D Y','K Y','G Y','F Y','V Y','TH Y','S Y','Z Y','HH Y','M Y','N Y','L Y','S K Y','S P Y','S T Y']);
function parseCmu(text){
 const map=new Map();
 for(const raw of text.split(/\r?\n/)){
  const line=raw.split('#')[0].trim();if(!line||line.startsWith(';;;'))continue;
  const [head,...phones]=line.split(/\s+/),match=head.match(/^(.*?)(?:\((\d+)\))?$/),word=match[1].toLowerCase();
  if(!phones.length||phones.some(p=>!/^([A-Z]+)([012])?$/.test(p)))throw Error('Invalid CMU pronunciation row: '+head);
  if(!map.has(word))map.set(word,[]);map.get(word).push({headword:head,variant:Number(match[2]||1),arpabet:phones.join(' ')});
 }
 for(const variants of map.values())variants.sort((a,b)=>a.variant-b.variant);
 return map;
}
function arpabetToIpa(value,{boundaries=[]}={}){
 const tokens=Array.isArray(value)?value:value.split(/\s+/),phones=tokens.map(token=>{const match=token.match(/^([A-Z]+)([012])?$/);if(!match||!IPA[match[1]])throw Error('Unknown source phoneme: '+token);return{phone:match[1],stress:match[2]===undefined?null:Number(match[2])};});
 const vowelIndexes=phones.map((p,i)=>VOWELS.has(p.phone)?i:-1).filter(i=>i>=0),marks=new Map();
 for(const [vowelAt,index] of vowelIndexes.entries()){
  const stress=phones[index].stress;if(stress!==1&&stress!==2||vowelIndexes.length===1)continue;
  let onset=0;
  if(vowelAt>0){const previous=vowelIndexes[vowelAt-1];onset=index;for(let start=previous+1;start<index;start++){const cluster=phones.slice(start,index).map(p=>p.phone);if(cluster.length===1&&cluster[0]!=='NG'||ONSETS.has(cluster.join(' '))){onset=start;break;}}}
  for(const boundary of boundaries)if(boundary<=index&&boundary>onset)onset=boundary;
  const mark=stress===1?'ˈ':'ˌ';if(!marks.has(onset)||mark==='ˈ')marks.set(onset,mark);
 }
 return'/'+phones.map((p,i)=>(marks.get(i)||'')+(p.phone==='AH'&&p.stress===0?'ə':p.phone==='ER'&&p.stress===0?'ɚ':IPA[p.phone])).join('')+'/';
}
function sourceBoundaries(word,arpabet,cmu,policy){
 const parts=policy.compoundBoundaries?.[word];if(!parts||parts.join('')!==word||!cmu.has(parts[0])||!cmu.has(parts[1]))return[];
 const plain=value=>value.replace(/[012]/g,'');for(const left of cmu.get(parts[0]))for(const right of cmu.get(parts[1]))if(plain(left.arpabet+' '+right.arpabet)===plain(arpabet))return[left.arpabet.split(' ').length];
 return[];
}
function candidatesFor(entry,selectionPolicy,policy){
 const word=entry.word.toLowerCase(),regional=selectionPolicy.preferredVariantSets.find(s=>s.includes(word))||[];
 const normalized=word.replace(/isation(s?)$/,'ization$1').replace(/iser(s?)$/,'izer$1').replace(/ise$/,'ize').replace(/yse$/,'yze');
 return[...new Set([word,...(entry.spellingVariants||[]),...regional,normalized,policy.spellingAliases[word]].filter(Boolean))];
}
function build(seed,cmu,selectionPolicy,policy,supplement,source){
 const entries={},missing=[],sourceCounts={cmudict:0,wiktionary:0},homographs=[];
 for(const entry of seed.entries){
  const key=entry.word.toLowerCase(),sourceWord=candidatesFor(entry,selectionPolicy,policy).find(word=>cmu.has(word));
  if(sourceWord){
   const raw=cmu.get(sourceWord),variants=raw.map(row=>({...row,ipa:arpabetToIpa(row.arpabet,{boundaries:sourceBoundaries(sourceWord,row.arpabet,cmu,policy)})})),choice=policy.primaryVariants[key],primary=choice?variants.find(v=>v.variant===choice.variant):variants[0];
   if(!primary)throw Error('Selected source variant is absent: '+entry.word);
   entries[key]={word:entry.word,ipa:primary.ipa,ipaVariants:[...new Set([primary.ipa,...variants.map(v=>v.ipa)])],accent:'en-US',source:{dictionary:'cmudict',sourceWord,headword:primary.headword,variant:primary.variant,arpabet:primary.arpabet,variants:variants.map(v=>({headword:v.headword,arpabet:v.arpabet,ipa:v.ipa})),revision:source.revision,license:'BSD-2-Clause'},primaryReason:choice?.reason||'First CMUdict source variant; other source variants are retained.'};
   sourceCounts.cmudict++;if(choice)homographs.push({word:entry.word,primaryVariant:primary.variant,ipa:primary.ipa,reason:choice.reason,variants:variants.map(v=>({variant:v.variant,ipa:v.ipa,arpabet:v.arpabet}))});
  }else if(supplement.entries[key]){const patch=supplement.entries[key];entries[key]={word:entry.word,ipa:patch.ipa,ipaVariants:[patch.ipa],accent:'en-US',source:{dictionary:'wiktionary',...patch},primaryReason:'Public dictionary supplement for a CMUdict gap; source accent label is preserved.'};sourceCounts.wiktionary++;}
  else missing.push(entry.word);
 }
 if(missing.length)throw Error('Missing verified US pronunciation sources: '+missing.join(', '));
 const comparison=['car','farm','hard','work','teacher','doctor','water','her','world','learn','first','better','more','four','schedule','tomato','new','clerk'].map(word=>{const old=seed.entries.find(e=>e.word.toLowerCase()===word);return old?{word,previousSourceTranscription:old.source.sourcePhonetic,previousDisplayIpa:old.ipa,usIpa:entries[word].ipa,sourceArpabet:entries[word].source.arpabet||null}:null;}).filter(Boolean);
 const data={schema:1,accent:'en-US',count:Object.keys(entries).length,method:'CMUdict ARPAbet phoneme-symbol conversion to broad American IPA; maximal-onset placement of existing stress marks with explicit compound boundaries verified against the same source phonemes; two attributed dictionary supplements; all source variants retained',entries};
 const audit={schema:1,count:data.count,target:seed.target,sourceCounts,headwordHash:sha256(Buffer.from(seed.entries.map(e=>e.word).join('\n')+'\n')),cmuRevision:source.revision,homographSelections:homographs,regionalSpellingAliases:Object.values(entries).filter(e=>e.source.dictionary==='cmudict'&&e.source.sourceWord!==e.word.toLowerCase()).map(e=>({word:e.word,cmuWord:e.source.sourceWord})),rhoticVowelEntries:Object.values(entries).filter(e=>e.source.dictionary==='cmudict'&&/\bER[012]\b/.test(e.source.arpabet)).length,comparison,missing:[],notes:['This is conversion of an existing American-English phoneme source, not spelling-based prediction.','ARPAbet AH0 becomes schwa and ER0 becomes rhotic schwa; stressed ER becomes a rhotic vowel. Monosyllables omit a redundant primary-stress marker.','Stress is inherited from CMUdict. Syllable-onset placement is deterministic phonotactic formatting; it is not independently phonetician-calibrated for every word.','Broad IPA does not encode every American allophone or regional merger. Retained source variants may differ by stress, word sense or reduction.','The two supplemental entries retain their published source accent labels. Alga explicitly covers UK/US; destine is an unlabelled English broad transcription used as dialect-shared.','An en-US synthesis request or a generated MP3 is not proof that an engine precisely obeyed every IPA phoneme. No engine-to-IPA alignment is certified here.']};
 return{data,audit};
}
function main(argv=process.argv.slice(2)){
 const args={};for(let i=0;i<argv.length;i++)if(argv[i].startsWith('--'))args[argv[i].slice(2)]=argv[++i];
 const root=path.resolve(args.root||path.join(__dirname,'..')),dir=path.join(root,'vocabulary','essential'),seed=JSON.parse(fs.readFileSync(args.seed||path.join(root,'work','essential-vocabulary','essential-vocabulary-seed.json'),'utf8')),selectionPolicy=JSON.parse(fs.readFileSync(args.selection||path.join(dir,'selection-policy.json'),'utf8')),policy=JSON.parse(fs.readFileSync(args.policy||path.join(dir,'us-phonetics-policy.json'),'utf8')),supplement=JSON.parse(fs.readFileSync(args.supplement||path.join(dir,'us-supplemental.json'),'utf8')),lock=JSON.parse(fs.readFileSync(args.lock||path.join(dir,'source-lock.json'),'utf8')),source=lock.sources?lock.sources.find(s=>s.id==='cmudict'):lock,raw=fs.readFileSync(args.source||path.join(root,'work','essential-vocabulary','cmudict','cmudict.dict'));
 if(sha256(raw)!==source.files.find(f=>f.file==='cmudict.dict').sha256)throw Error('CMUdict source hash mismatch');
 const {data,audit}=build(seed,parseCmu(raw.toString('utf8')),selectionPolicy,policy,supplement,source),out=args.out||path.join(dir,'us-pronunciations.json'),auditFile=args.audit||path.join(dir,'us-pronunciation-audit.json');
 fs.writeFileSync(out,JSON.stringify(data,null,2)+'\n');audit.dataSha256=sha256(fs.readFileSync(out));fs.writeFileSync(auditFile,JSON.stringify(audit,null,2)+'\n');console.log(JSON.stringify({count:data.count,out,audit:auditFile,sourceCounts:audit.sourceCounts,rhoticVowelEntries:audit.rhoticVowelEntries}));return{data,audit};
}
module.exports={IPA,VOWELS,ONSETS,parseCmu,arpabetToIpa,sourceBoundaries,candidatesFor,build,main};if(require.main===module)try{main();}catch(error){console.error(error.message);process.exitCode=1;}
