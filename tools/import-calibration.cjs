'use strict';
// Personal local import only. This tool never calls an AI or reads configuration.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const calibration=require('../server/calibration.cjs');
function args(argv){const out={};for(let i=0;i<argv.length;i++){const k=argv[i];if(!['--input','--output','--sample','--text','--prompt','--source-pdf','--source-pdfs','--catalog'].includes(k)||out[k]!==undefined)throw Error('未知或重复参数：'+k);out[k]=k==='--catalog'?true:argv[++i];if(out[k]===undefined||typeof out[k]==='string'&&out[k].startsWith('--'))throw Error('参数缺值：'+k);}if(out['--source-pdf']&&out['--source-pdfs'])throw Error('--source-pdf 与 --source-pdfs 不能同时使用。');return out;}
function read(file,max){const b=fs.readFileSync(path.resolve(file));if(b.length>max)throw Error('输入文件过大。');return b;}
function resolveSource(row,catalog=calibration.CATALOG){const source=row?.sourceId?catalog.sources?.[row.sourceId]:catalog.source;if(!source)throw Error('样本来源未在索引中注册。');return source;}
function selectedSources(input,catalog=calibration.CATALOG){const selected=new Map();for(const sample of input.samples||[]){if(sample.sourceKind!=='official_verified')continue;const row=catalog.samples.find(s=>s.id===sample.id);if(!row)throw Error('官方样本ID不在索引中。');const source=resolveSource(row,catalog);selected.set(row.sourceId||source.id||'ielts-academic-2023',source);}return selected;}
function verifySourcePdfs(input,a,catalog=calibration.CATALOG){
 const selected=selectedSources(input,catalog);if(!a['--source-pdf']&&!a['--source-pdfs'])return {verified:false,sourceIds:[]};if(!selected.size)throw Error('当前导入没有可核验原PDF的官方样本。');
 let files;
 if(a['--source-pdf']){if(selected.size!==1)throw Error('多个原件来源须使用 --source-pdfs 私有映射文件，不能用一份PDF核实其他来源。');const id=selected.keys().next().value;files={[id]:path.resolve(a['--source-pdf'])};}
 else{const manifest=path.resolve(a['--source-pdfs']),value=JSON.parse(read(manifest,15000).toString('utf8').replace(/^\uFEFF/,''));if(!value||Array.isArray(value)||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)throw Error('PDF映射须为 sourceId 到本地PDF路径的对象。');files={};for(const [id,file] of Object.entries(value)){if(!selected.has(id)||typeof file!=='string'||!file)throw Error('PDF映射只能包含本批选中来源及非空路径。');files[id]=path.resolve(path.dirname(manifest),file);}}
 for(const [id,source] of selected){if(!files[id])throw Error('PDF映射缺少来源：'+id);const b=read(files[id],10000000),actual=crypto.createHash('sha256').update(b).digest('hex');if(actual!==source.sha256)throw Error('原PDF哈希与索引不符：'+id+'；原件未通过，未生成导入文件。');}
 return {verified:true,sourceIds:[...selected.keys()]};
}
function main(argv){
 const a=args(argv);
 if(a['--catalog']){console.log(JSON.stringify(calibration.CATALOG,null,2));return;}
 if(!a['--output']||Boolean(a['--input'])===Boolean(a['--sample']))throw Error('使用 --input manifest.json --output private.json；或 --sample ID --text answer.txt --prompt question.txt --source-pdf official.pdf --output private.json。');
 let input;
 if(a['--input']){input=JSON.parse(read(a['--input'],150000).toString('utf8').replace(/^\uFEFF/,''));if(input.format!=='ielts-calibration-samples'||input.version!==1)throw Error('导入格式须为ielts-calibration-samples version 1。');}
 else{
  const row=calibration.CATALOG.samples.find(s=>s.id===a['--sample']);if(!row||!a['--text']||!a['--prompt']||!a['--source-pdf']&&!a['--source-pdfs'])throw Error('请选择索引中的ID并提供完整原稿、题目及官方原PDF。');const source=resolveSource(row);
  input={samples:[{id:row.id,name:row.name,mode:row.mode,task:row.task,level:row.level,text:read(a['--text'],50000).toString('utf8').replace(/^\uFEFF/,''),prompt:read(a['--prompt'],12000).toString('utf8').replace(/^\uFEFF/,''),sourceKind:'official_verified',sourceUrl:source.url,sourceDocumentSha256:source.sha256,rightsConfirmed:true,completeResponse:true,completePrompt:true,reference:row.reference,note:source.transcriptionProtocol}]};
 }
 const pdfs=verifySourcePdfs(input,a),pdfVerified=pdfs.verified;
 const samples=calibration.prepare(input),out=path.resolve(a['--output']),repo=path.resolve(__dirname,'..'),rel=path.relative(repo,out),inside=!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);
 if(inside&&!/^(用户数据|work)([\\/]|$)/.test(rel))throw Error('完整第三方正文只可输出到用户数据、work或仓库外的个人目录，不能加入公开源码。');
 if(fs.existsSync(out))throw Error('输出文件已存在，原文件保留；请选择新文件名。');
 fs.mkdirSync(path.dirname(out),{recursive:true});
 const attribution=[...new Set([...selectedSources(input).values()].map(s=>s.copyright))].join('; ')||calibration.CATALOG.source.copyright;
 fs.writeFileSync(out,JSON.stringify({format:'ielts-calibration-samples',version:1,attribution,privateUseOnly:true,sourcePdfVerified:pdfVerified,verifiedSourceIds:pdfs.sourceIds,samples:samples.map(calibration.exportSample)},null,2),{encoding:'utf8',flag:'wx'});
 console.log(JSON.stringify({ok:true,output:out,sourcePdfVerified:pdfVerified,verifiedSourceIds:pdfs.sourceIds,samples:samples.map(s=>({id:s.id,sha256:s.sha256,reference:s.reference,verified:s.provenance.verified,eligible:s.eligibility.bandComparison,wordCount:s.eligibility.wordCount}))},null,2));
}
if(require.main===module){try{main(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={args,main,resolveSource,selectedSources,verifySourcePdfs};
