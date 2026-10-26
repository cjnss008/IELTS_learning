'use strict';
// Build the public, offline essential-vocabulary pack from pinned public sources.
// No learner folders, settings, credentials, or private service results are read.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const STAGES=[
  {id:'starter',label:'起步常用词',fromRank:1,toRank:1000},
  {id:'core',label:'常用核心词',fromRank:1001,toRank:3000},
  {id:'expansion',label:'阅读扩展词',fromRank:3001,toRank:6000},
  {id:'academic',label:'进阶阅读与学术扩展',fromRank:6001,toRank:8000}
];
const number=value=>Number(value)>0?Number(value):null;
const decode=value=>value.replace(/\\r\\n|\\n|\\r/g,'\n').replace(/\r/g,'');
const key=value=>value.toLowerCase();
function* parseCsv(text){
  let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);field='';if(row.some(Boolean))yield row;row=[];}
    else field+=c;
  }
  if(quoted)throw Error('CSV has an unclosed quoted field');
  if(field||row.length){row.push(field);yield row;}
}
function readCsv(bytes){const iterator=parseCsv(bytes.toString('utf8').replace(/^\uFEFF/,'')),headers=iterator.next().value;return Array.from(iterator,row=>{if(row.length!==headers.length)throw Error('CSV column count mismatch');return Object.fromEntries(headers.map((c,i)=>[c,row[i]||'']));});}
function exchangeValues(raw,type){return raw.split('/').filter(p=>p.startsWith(type+':')).flatMap(p=>p.slice(type.length+1).split(',')).filter(Boolean);}
function makeIpa(raw){
  // ECDICT's legacy IPA characters: Cyrillic schwa, ASCII length/stress marks.
  // This is character normalization of an existing transcription, never G2P.
  const body=raw.trim().replace(/^\[|\]$/g,'').replace(/^\/|\/$/g,'').replace(/ә/g,'ə').replace(/є/g,'e').replace(/g/g,'ɡ').replace(/:/g,'ː').replace(/'/g,'ˈ').replace(/^[.,]/,'ˌ');
  return body?'/'+body+'/':'';
}
function makeMeaning(row,policy){
  if(policy.meaningOverrides[row.word])return policy.meaningOverrides[row.word];
  const lines=decode(row.translation).split('\n').map(s=>s.trim()).filter(Boolean);
  const general=lines.filter(s=>!/^\[[^\]]+\]/.test(s));
  return (general.length?general:lines).slice(0,2).map(s=>s.replace(/\s+/g,' ').replace(/,\s*/g,'；').replace(/\.\.\./g,'……')).join('；').slice(0,220);
}
function makePos(row,meaning){
  const text=meaning+'\n'+decode(row.translation);
  const found=[...text.matchAll(/(?:^|[；\s])((?:n|v|vt|vi|adj|a|adv|pron|prep|conj|interj|art|aux|modal|num|det)\.)/g)].map(m=>m[1].replace(/^a\.$/,'adj.'));
  return [...new Set(found)].join(' / ')||row.pos.split('/').map(p=>p.split(':')[0]).filter(Boolean).join(' / ')||'词类见释义';
}
function variantFamily(word,allWords,policy){
  const explicit=policy.preferredVariantSets.find(set=>set.includes(word));
  if(explicit)return explicit[0];
  // Only merge an -ise/-ize spelling when the alternative is in the source.
  const transformed=word.replace(/isation(s?)$/,'ization$1').replace(/isability$/,'izability').replace(/iser(s?)$/,'izer$1').replace(/ise$/,'ize').replace(/yse$/,'yze');
  if(transformed!==word&&allWords.has(transformed))return transformed;
  return word;
}
function selectRows(rows,policy){
  const allowedCapitalized=new Set(policy.allowedCapitalized),allowedExtra=new Set(policy.additionalCommonHeadwords.split(/\s+/)),excludedExplicit=new Set(policy.excludedHeadwords.split(/\s+/));
  const allWords=new Set(rows.map(r=>r.word));
  const inflectionOf=new Map();
  for(const row of rows)for(const type of ['p','d','i','3','r','t','s'])for(const form of exchangeValues(row.exchange,type)){if(form!==row.word){const k=key(form);if(!inflectionOf.has(k))inflectionOf.set(k,new Set());inflectionOf.get(k).add(key(row.word));}}
  const rejected={},candidates=[];
  const reject=(reason)=>{rejected[reason]=(rejected[reason]||0)+1;};
  for(const row of rows){
    const meaning=decode(row.translation),lemma=exchangeValues(row.exchange,'0'),frq=number(row.frq),bnc=number(row.bnc);
    let reason='';
    if(!/^[a-z]+$/.test(row.word)&&!allowedCapitalized.has(row.word))reason='not-lowercase-single-headword';
    else if(!row.phonetic.trim())reason='missing-source-transcription';
    else if(!/[\u3400-\u9fff]/.test(meaning))reason='missing-Chinese-gloss';
    else if(excludedExplicit.has(row.word))reason='reviewed-unsuitable-headword';
    else if(!frq&&!bnc)reason='missing-frequency';
    else if(lemma.some(base=>key(base)!==key(row.word)))reason='inflected-lemma';
    else if(inflectionOf.has(key(row.word)))reason='inflection-in-source-paradigm';
    else if(/(?:的(?:过去式|过去分词|现在分词|复数|比较级|最高级|第三人称))|(?:复数形式|缩写|首字母缩略|人名|姓氏|男子名|女子名|男性名|女性名|男名|女名|城市名|公司名|地名)/.test(meaning))reason='form-name-abbreviation-gloss';
    else if(!(row.tag||number(row.collins)||row.oxford==='1'||allowedExtra.has(row.word)||allowedCapitalized.has(row.word)))reason='outside-reviewed-teaching-candidates';
    if(reason){reject(reason);continue;}
    const f=frq||bnc,b=bnc||frq;
    const frequencyScore=Math.exp(.6*Math.log(f)+.4*Math.log(b))*(row.oxford==='1'?.8:1);
    // I's BNC rank refers to letter/name occurrences; use its contemporary pronoun rank.
    const score=row.word==='I'?frq*.8:frequencyScore;
    candidates.push({...row,score,family:variantFamily(row.word,allWords,policy)});
  }
  candidates.sort((a,b)=>a.score-b.score||a.word.localeCompare(b.word,'en'));
  const unique=new Map(),variants=[];
  for(const row of candidates){
    const family=key(row.family);
    if(unique.has(family)){const canonical=unique.get(family);canonical.variants.push(row.word);variants.push({word:row.word,canonical:canonical.word,reason:'regional-spelling-variant'});continue;}
    unique.set(family,{...row,variants:[]});
  }
  const selected=[...unique.values()].slice(0,policy.target);
  if(selected.length!==policy.target)throw Error('Not enough eligible headwords');
  return{selected,rejected,variants,candidateCount:candidates.length,uniqueCandidateCount:unique.size};
}
function seedFromRows(rows,policy,sourceLock,phoneticOverrides={entries:{}}){
  const selection=selectRows(rows,policy);
  const entries=selection.selected.map((row,index)=>{
    const rank=index+1,meaning=makeMeaning(row,policy),stage=STAGES.find(s=>rank<=s.toRank).id;
    const patch=phoneticOverrides.entries[row.word];
    return{id:'essential:'+key(row.word),word:row.word,ipa:patch?.ipa||makeIpa(row.phonetic),ipaAccent:patch?.accent||'source-primarily-British',meaning,pos:makePos(row,meaning),example:'',exampleTranslation:'',rank,stage,spellingVariants:row.variants,
      frequency:{bnc:number(row.bnc),contemporary:number(row.frq),selectionScore:+row.score.toFixed(5)},
      source:{dictionary:'ecdict',rowWord:row.word,sourcePhonetic:row.phonetic,meaningEdited:!!policy.meaningOverrides[row.word],...(patch?{pronunciation:patch}:{})},
      audio:{text:row.word,lang:'en-GB'}};
  });
  const seed={schema:1,target:policy.target,count:entries.length,status:'examples-pending',stageBasis:'项目内按常用词频与学习顺序分组；不是CEFR或考生难度标定',stages:STAGES,sources:sourceLock.sources,entries};
  const audit={schema:1,target:policy.target,count:entries.length,sourceRows:rows.length,sourceHash:sourceLock.sources[0].files.find(f=>f.file==='ecdict.csv').sha256,selectionPolicy:'vocabulary/essential/selection-policy.json',selectionPolicyHash:sha256(Buffer.from(JSON.stringify(policy))),candidateCount:selection.candidateCount,uniqueCandidateCount:selection.uniqueCandidateCount,rejected:selection.rejected,regionalVariantsMerged:selection.variants,headwordHash:sha256(Buffer.from(entries.map(e=>e.word).join('\n')+'\n')),stages:STAGES.map(s=>({...s,count:entries.filter(e=>e.stage===s.id).length})),examples:{complete:0,pending:entries.length},notes:['Count is case-insensitive, distinct single dictionary headwords, with source inflection paradigms excluded. Derivational words with separate meanings may both occur.','The source publisher declares MIT. Its historical README describes mixed compilation; this audit records that declaration and does not claim independent chain-of-title clearance for each source row.','Frequency ranks are inherited historical corpus metadata, not current corpus recomputation, CEFR certification, or an IELTS outcome promise.','No IPA is inferred from spelling. Existing legacy transcription characters are normalized and raw sourcePhonetic is retained.','Existing course words, phrases, and learner records are not modified.']};
  return{seed,audit};
}
function checkExample(entry,item){
  const errors=[];
  if(!item||typeof item.example!=='string'||typeof item.exampleTranslation!=='string')return['missing-example'];
  const sentence=item.example.trim(),translation=item.exampleTranslation.trim();
  if(sentence.length<12||sentence.length>340)errors.push('example-length');
  if(!new RegExp('(?:^|[^A-Za-z])'+entry.word+'(?:$|[^A-Za-z])','i').test(sentence))errors.push('missing-exact-headword');
  if(!/[.!?]["”']?$/.test(sentence))errors.push('missing-sentence-ending');
  if(!/[\u3400-\u9fff]/.test(translation)||translation.length<3)errors.push('missing-Chinese-example-translation');
  const escaped=entry.word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if(new RegExp('^(?:I (?:like|love|see|know|use|need|want|learn)|This is|That is|We (?:like|use|need|learn)) (?:a |an |the )?'+escaped+'[.!?]$','i').test(sentence))errors.push('generic-template');
  if(/\b(?:WORD|PLACEHOLDER|INSERT_HERE)\b/.test(sentence)||/\{\{?[^{}]*(?:word|target)[^{}]*\}?\}/i.test(sentence))errors.push('placeholder');
  return errors;
}
function applyExamples(seed,items){
  const byWord=new Map();for(const item of items){if(!item?.word)throw Error('Example row has no word');const k=key(item.word);if(byWord.has(k))throw Error('Duplicate example word: '+item.word);byWord.set(k,item);}
  const errors=[],seen=new Map();
  for(const entry of seed.entries){
    const item=byWord.get(key(entry.word)),problems=checkExample(entry,item);
    if(!item||typeof item.contextMeaning!=='string'||!/[\u3400-\u9fff]/.test(item.contextMeaning.trim()))problems.push('missing-Chinese-context-meaning');
    if(!item?.source||!(item.source.provider&&item.source.model&&item.source.promptVersion)&&item.source.kind!=='project-authored')problems.push('missing-example-provenance');
    if(problems.length){errors.push({word:entry.word,errors:problems});continue;}
    const sentence=item.example.trim(),normal=sentence.toLowerCase().replace(/\s+/g,' ');
    if(seen.has(normal))errors.push({word:entry.word,errors:['duplicate-example-with:'+seen.get(normal)]});seen.set(normal,entry.word);
    entry.dictionaryMeaning=entry.meaning;entry.contextMeaning=item.contextMeaning.trim();entry.meaning=entry.contextMeaning;
    entry.example=sentence;entry.exampleTranslation=item.exampleTranslation.trim();entry.source.example=item.source;entry.source.meaning='contextual sense from the attributed example generation/review; dictionaryMeaning retains the ECDICT-derived gloss';
  }
  return errors;
}
function writeJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');}
function applyPronunciations(seed,pronunciations){
  if(pronunciations.schema!==1||pronunciations.accent!=='en-US'||pronunciations.count!==seed.target)throw Error('US pronunciation table is incomplete or has an unknown schema');
  for(const entry of seed.entries){const pronunciation=pronunciations.entries[key(entry.word)];if(!pronunciation||pronunciation.word!==entry.word||!/^\/.+\/$/.test(pronunciation.ipa)||!Array.isArray(pronunciation.ipaVariants)||!pronunciation.ipaVariants.length)throw Error('Missing US IPA: '+entry.word);entry.ipa=pronunciation.ipa;entry.ipaVariants=pronunciation.ipaVariants;entry.ipaAccent='en-US';entry.source.pronunciation={...pronunciation.source,primaryReason:pronunciation.primaryReason};entry.audio.lang='en-US';}
  seed.pronunciation={accent:'en-US',method:pronunciations.method,covered:seed.count,audioPhonemeAlignmentVerified:false};
}
function main(argv=process.argv.slice(2)){
  const args={};for(let i=0;i<argv.length;i++){const a=argv[i];if(a.startsWith('--'))args[a.slice(2)]=argv[i+1]&&!argv[i+1].startsWith('--')?argv[++i]:true;}
  const project=args.root?path.resolve(args.root):path.resolve(__dirname,'..');
  const dataDir=path.join(project,'vocabulary','essential');
  const sourceLock=JSON.parse(fs.readFileSync(args['source-lock']||path.join(dataDir,'source-lock.json'),'utf8'));
  const policy=JSON.parse(fs.readFileSync(path.join(dataDir,'selection-policy.json'),'utf8'));
  const phoneticOverrides=JSON.parse(fs.readFileSync(path.join(dataDir,'phonetic-overrides.json'),'utf8'));
  const source=path.resolve(args.source||path.join(project,'work','essential-vocabulary','ecdict.csv'));
  const raw=fs.readFileSync(source),expected=sourceLock.sources[0].files.find(f=>f.file==='ecdict.csv');
  if(sha256(raw)!==expected.sha256)throw Error('Source hash does not match pinned ECDICT CSV');
  const {seed,audit}=seedFromRows(readCsv(raw),policy,sourceLock,phoneticOverrides);
  audit.phoneticRepairs=Object.keys(phoneticOverrides.entries);
  audit.phoneticOverridesHash=sha256(fs.readFileSync(path.join(dataDir,'phonetic-overrides.json')));
  if(args['without-pronunciations']&&!args['seed-only'])throw Error('--without-pronunciations is permitted only for an explicitly pending seed');
  const pronunciationPath=!args['without-pronunciations']&&(args.pronunciations||sourceLock.sources.some(s=>s.id==='cmudict')&&path.join(dataDir,'us-pronunciations.json'));
  if(pronunciationPath){applyPronunciations(seed,JSON.parse(fs.readFileSync(pronunciationPath,'utf8')));audit.pronunciation={accent:'en-US',sourceFileSha256:sha256(fs.readFileSync(pronunciationPath)),covered:seed.count,audioPhonemeAlignmentVerified:false};audit.phoneticRepairs=[];audit.legacyPhoneticOverridesHash=audit.phoneticOverridesHash;delete audit.phoneticOverridesHash;audit.notes.push('Current displayed IPA comes from the pinned American CMUdict phone conversion plus two attributed supplemental transcriptions; legacy sourcePhonetic is retained only for provenance.');}
  const seedPath=path.resolve(args.seed||path.join(project,'work','essential-vocabulary','essential-vocabulary-seed.json'));
  writeJson(seedPath,seed);
  if(args['seed-only']){console.log(JSON.stringify({seed:seedPath,count:seed.count,headwordHash:audit.headwordHash}));return;}
  if(!args.examples&&!args['examples-from-asset'])throw Error('Use --examples PATH or --examples-from-asset PATH for a complete build, or --seed-only for an explicitly pending seed');
  const examplesPath=path.resolve(args.examples||args['examples-from-asset']),exampleBytes=fs.readFileSync(examplesPath),text=exampleBytes.toString('utf8').replace(/^\uFEFF/,'');
  const items=args['examples-from-asset']?require(examplesPath).entries.map(e=>({word:e.word,example:e.example,exampleTranslation:e.exampleTranslation,contextMeaning:e.contextMeaning,source:e.source.example})):text.trim().startsWith('[')?JSON.parse(text):text.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  const errors=applyExamples(seed,items);
  if(errors.length){writeJson(path.join(project,'work','essential-vocabulary','example-errors.json'),errors);throw Error(`${errors.length} example failures; see work/essential-vocabulary/example-errors.json`);}
  seed.status='complete';
  audit.examples={complete:seed.count,pending:0,contextMeaningComplete:seed.entries.filter(e=>e.contextMeaning).length,inputKind:args['examples-from-asset']?'published-asset':'reviewed-jsonl',sourceFileSha256:sha256(exampleBytes),validation:'exact headword, sentence/translation presence, Chinese contextual sense, provenance, no generic templates, no duplicate examples; not independent human semantic calibration'};
  const dataFile=path.resolve(args.out||path.join(project,'assets','essential-vocabulary-data.js'));
  const packed=JSON.stringify(seed);
  fs.writeFileSync(dataFile,"/* Derived dictionary data: MIT / BSD / attributed supplements; see vocabulary/essential/NOTICE.txt and source-lock.json. */\n(function(root,factory){'use strict';const data=factory();root.IELTS_ESSENTIAL_VOCABULARY=data;if(typeof module==='object'&&module.exports)module.exports=data;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';return "+packed+";});\n");
  audit.assetSha256=sha256(fs.readFileSync(dataFile));
  writeJson(args.audit||path.join(dataDir,'audit.json'),audit);
  console.log(JSON.stringify({asset:dataFile,count:seed.count,headwordHash:audit.headwordHash,assetSha256:audit.assetSha256}));
}
module.exports={parseCsv,readCsv,makeIpa,makeMeaning,makePos,variantFamily,selectRows,seedFromRows,checkExample,applyExamples,applyPronunciations,main,STAGES};
if(require.main===module)try{main();}catch(error){console.error(error.message);process.exitCode=1;}
