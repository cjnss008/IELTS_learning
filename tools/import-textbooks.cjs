'use strict';
// Run locally: node tools/import-textbooks.cjs --source "PATH" --python "python.exe"
// The importer never sends PDF content to an AI service or changes source files.
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const DEFAULT_ROOT=path.resolve(__dirname,'..');
const AUDIO_EXT=new Set(['.mp3','.m4a','.wav','.ogg','.flac','.aac','.opus']);
function argsOf(args){const out={};for(let i=0;i<args.length;i++){const key=args[i];if(!['--source','--python'].includes(key)||!args[i+1])throw Error('Usage: node tools/import-textbooks.cjs [--source "folder"] [--python "python.exe"]');out[key.slice(2)]=args[++i];}return out;}
function readJSON(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw Error('Invalid JSON: '+file+': '+e.message);}}
function sha(file){return new Promise((resolve,reject)=>{const h=crypto.createHash('sha256'),stream=fs.createReadStream(file);stream.on('data',b=>h.update(b));stream.on('error',reject);stream.on('end',()=>resolve(h.digest('hex')));});}
async function walk(dir){let out=[];for(const entry of await fsp.readdir(dir,{withFileTypes:true})){if(entry.name==='@eaDir'||entry.name.startsWith('.'))continue;const file=path.join(dir,entry.name);if(entry.isSymbolicLink())continue;if(entry.isDirectory())out.push(...await walk(file));else if(entry.isFile())out.push(file);}return out.sort((a,b)=>a.localeCompare(b,'zh-CN'));}
function identify(name){const match=name.match(/(?:剑(?:桥雅思)?(?:真题)?|【)(\d{1,2})/),edition=match?Number(match[1]):null;const range=name.includes('456')?[4,5,6]:name.includes('剑1到剑9')?[1,2,3,4,5,6,7,8,9]:name.includes('剑10-剑20')?Array.from({length:11},(_,i)=>i+10):edition?[edition]:[];const type=/同义|转换技巧/.test(name)?'paraphrase':/精讲|解析/.test(name)?'explanation':'exam';return{editions:range,type};}
function verifyAnchors(v,pageCount){for(const anchor of v.anchors||[]){if(!Number.isInteger(anchor.page)||anchor.page<1||anchor.page>pageCount||typeof anchor.label!=='string'||!anchor.evidence)throw Error('Invalid verified PDF page: '+JSON.stringify(anchor));}return v;}
function pythonCandidates(preferred){const candidates=[preferred,process.env.IELTS_PYTHON,'python','python3'];const user=process.env.USERPROFILE;if(user)candidates.splice(2,0,path.join(user,'.cache','codex-runtimes','codex-primary-runtime','dependencies','python','python.exe'));return [...new Set(candidates.filter(Boolean))];}
function analyze(file,preferred){for(const py of pythonCandidates(preferred)){const result=spawnSync(py,[path.join(__dirname,'scan-textbooks.py'),file],{encoding:'utf8',windowsHide:true,maxBuffer:2*1024*1024});if(result.error?.code==='ENOENT')continue;try{const data=JSON.parse(result.stdout.trim());if(!result.status&&!data.error)return data;if(preferred===py)throw Error(data.error||result.stderr);}catch(e){if(preferred===py)throw e;}}return{pageCount:null,method:'unavailable',textStatus:'unverified',error:'未找到可用的本地 Python + pypdf；用 --python 指定解释器后重扫。',textSamplePages:[]};}
async function copyUnique(file,hash,folder,existing){const same=existing.get(hash);if(same)return same;await fsp.mkdir(folder,{recursive:true});let target=path.join(folder,path.basename(file));if(path.resolve(file).toLowerCase()!==path.resolve(target).toLowerCase()){if(fs.existsSync(target)){const current=await sha(target);if(current!==hash)target=path.join(folder,path.basename(file,path.extname(file))+'-'+hash.slice(0,10)+path.extname(file));}if(!fs.existsSync(target))await fsp.copyFile(file,target,fs.constants.COPYFILE_EXCL);if(await sha(target)!==hash)throw Error('Copy checksum mismatch: '+target);}existing.set(hash,target);return target;}
async function run(opts={}){
  const ROOT=path.resolve(opts.root||DEFAULT_ROOT),DEST=path.join(ROOT,'materials','textbooks');
  const log=opts.log||console.log;
  const source=path.resolve(opts.source||DEST);await fsp.mkdir(DEST,{recursive:true});
  const files=await walk(source),pdfs=files.filter(f=>path.extname(f).toLowerCase()==='.pdf');
  if(!pdfs.length&&!files.some(f=>AUDIO_EXT.has(path.extname(f).toLowerCase())))throw Error('No PDF or supported audio found: '+source);
  const old=readJSON(path.join(ROOT,'materials','textbook-catalog.json'),{documents:[],audioFiles:[]}),verifications=readJSON(path.join(ROOT,'materials','textbook-verification.json'),{documents:{}});
  const existing=new Map();for(const d of old.documents||[]){const dest=path.resolve(ROOT,d.path);if(dest.startsWith(DEST+path.sep)&&fs.existsSync(dest)&&await sha(dest)===d.sha256)existing.set(d.sha256,dest);}
  const grouped=new Map();for(const file of pdfs){const hash=await sha(file),stat=await fsp.stat(file),target=await copyUnique(file,hash,DEST,existing);if(!grouped.has(hash))grouped.set(hash,{hash,target,bytes:stat.size,names:[]});grouped.get(hash).names.push(path.relative(source,file).replace(/\\/g,'/'));log('Indexed PDF '+path.basename(file)+' '+hash.slice(0,12));}
  // A source folder may contain only new files: retain all already imported originals.
  for(const oldDoc of old.documents||[])if(!grouped.has(oldDoc.sha256)&&existing.has(oldDoc.sha256))grouped.set(oldDoc.sha256,{hash:oldDoc.sha256,target:existing.get(oldDoc.sha256),bytes:oldDoc.bytes,names:oldDoc.sourceFiles||[oldDoc.filename]});
  const documents=[];for(const group of grouped.values()){
    const prev=(old.documents||[]).find(d=>d.sha256===group.hash),name=path.basename(group.target),meta=prev?.analysis?.pageCount?prev.analysis:analyze(group.target,opts.python);
    const verified=verifyAnchors(verifications.documents[group.hash]||{},meta.pageCount||0);
    const info=identify(name),sourceFiles=[...new Set([...(prev?.sourceFiles||[]),...(source===DEST&&prev?[]:group.names)])];
    documents.push({id:'pdf-'+group.hash.slice(0,16),filename:name,path:path.relative(ROOT,group.target).replace(/\\/g,'/'),sha256:group.hash,bytes:group.bytes,sourceFiles,...info,analysis:meta,
      academicStatus:verified.academicStatus||'unconfirmed',academicEvidence:verified.academicEvidence||'文件名只供识别；尚未核实封面或目录中的考试类别。',
      verification:verified.method?{method:verified.method,reviewedAt:verified.reviewedAt,pagesReviewed:verified.pagesReviewed||[]}:null,
      anchors:verified.anchors||[],notes:verified.notes||[],tests:verified.tests||[],reserve:verified.reserve||null,coverPath:verified.coverPath||null});
  }
  const audioFiles=[...(old.audioFiles||[])],audioHashes=new Map(audioFiles.map(a=>[a.sha256,a]));
  for(const file of files.filter(f=>AUDIO_EXT.has(path.extname(f).toLowerCase()))){const hash=await sha(file);if(audioHashes.has(hash))continue;const target=await copyUnique(file,hash,path.join(ROOT,'materials','textbook-audio'),new Map());const a={id:'audio-'+hash.slice(0,16),path:path.relative(ROOT,target).replace(/\\/g,'/'),filename:path.basename(target),bytes:(await fsp.stat(target)).size,sha256:hash,alignmentStatus:'unverified',note:'已发现音频，但版本/试卷/分节对应关系尚未核实；不自动计为完整听力测评。'};audioHashes.set(hash,a);audioFiles.push(a);}
  documents.sort((a,b)=>(a.editions[0]||99)-(b.editions[0]||99)||a.type.localeCompare(b.type)||a.filename.localeCompare(b.filename,'zh-CN'));
  const catalog={schemaVersion:1,generatedAt:new Date().toISOString(),title:'本地剑桥雅思教材资料库',pageConvention:'所有跳转页码均为 PDF 阅读器从 1 开始的物理页，不是书上印刷页码。',
    provenance:{source:'用户指定的本地教材目录',authorization:{authorized:true,date:'2026-10-24',scope:'用户明确授权教材原件随项目代码上传 GitHub。'},processing:'仅用本机 SHA-256、pypdf 和人工本地视觉核实；未将整本 PDF 发送给外部 AI。'},
    summary:{sourcePdfCount:documents.reduce((n,d)=>n+d.sourceFiles.length,0),uniquePdfCount:documents.length,duplicateCopies:documents.reduce((n,d)=>n+Math.max(0,d.sourceFiles.length-1),0),uniquePdfBytes:documents.reduce((n,d)=>n+d.bytes,0),audioFileCount:audioFiles.length},
    audio:{status:audioFiles.length?'files-found-alignment-unverified':'missing',note:audioFiles.length?'已导入音频文件，需另行核实试卷对应关系。':'本批教材没有配套听力音频。PDF、听力原文或合成朗读均不能代替真实听力试卷音频。'},documents,audioFiles};
  const serialized=JSON.stringify(catalog,null,2)+'\n';await fsp.writeFile(path.join(ROOT,'materials','textbook-catalog.json'),serialized,'utf8');await fsp.writeFile(path.join(ROOT,'assets','textbook-catalog.js'),'// Generated locally by tools/import-textbooks.cjs; do not edit.\n(function(root){\'use strict\';const data='+serialized.trim()+';root.IELTSTextbookCatalog=data;if(typeof module===\'object\'&&module.exports)module.exports=data;})(typeof globalThis!==\'undefined\'?globalThis:this);\n','utf8');
  log(JSON.stringify(catalog.summary,null,2));return catalog;
}
module.exports={argsOf,sha,identify,verifyAnchors,run};
if(require.main===module)run(argsOf(process.argv.slice(2))).catch(e=>{console.error(e.message);process.exitCode=1;});
