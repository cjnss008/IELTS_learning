'use strict';
// Personal local import only. This tool never calls an AI or reads configuration.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const calibration=require('../server/calibration.cjs');
function args(argv){const out={};for(let i=0;i<argv.length;i++){const k=argv[i];if(!['--input','--output','--sample','--text','--prompt','--source-pdf','--catalog'].includes(k)||out[k]!==undefined)throw Error('未知或重复参数：'+k);out[k]=k==='--catalog'?true:argv[++i];if(out[k]===undefined)throw Error('参数缺值：'+k);}return out;}
function read(file,max){const b=fs.readFileSync(path.resolve(file));if(b.length>max)throw Error('输入文件过大。');return b;}
function main(argv){
 const a=args(argv);
 if(a['--catalog']){console.log(JSON.stringify(calibration.CATALOG,null,2));return;}
 if(!a['--output']||Boolean(a['--input'])===Boolean(a['--sample']))throw Error('使用 --input manifest.json --output private.json；或 --sample ID --text answer.txt --prompt question.txt --source-pdf official.pdf --output private.json。');
 let input;
 if(a['--input']){input=JSON.parse(read(a['--input'],150000).toString('utf8').replace(/^\uFEFF/,''));if(input.format!=='ielts-calibration-samples'||input.version!==1)throw Error('导入格式须为ielts-calibration-samples version 1。');}
 else{
  const row=calibration.CATALOG.samples.find(s=>s.id===a['--sample']);if(!row||!a['--text']||!a['--prompt']||!a['--source-pdf'])throw Error('请选择索引中的ID并提供完整原稿、题目及官方原PDF。');
  input={samples:[{id:row.id,name:row.name,mode:row.mode,task:row.task,level:row.level,text:read(a['--text'],50000).toString('utf8').replace(/^\uFEFF/,''),prompt:read(a['--prompt'],12000).toString('utf8').replace(/^\uFEFF/,''),sourceKind:'official_verified',sourceUrl:calibration.CATALOG.source.url,sourceDocumentSha256:calibration.CATALOG.source.sha256,rightsConfirmed:true,completeResponse:true,completePrompt:true,reference:row.reference,note:calibration.CATALOG.source.transcriptionProtocol}]};
 }
 let pdfVerified=false;
 if(a['--source-pdf']){const b=read(a['--source-pdf'],10000000),n=crypto.createHash('sha256').update(b).digest('hex');if(n!==calibration.CATALOG.source.sha256)throw Error('原PDF哈希与索引不符；未生成导入文件。请从索引官方链接重新取得原件。');pdfVerified=true;}
 const samples=calibration.prepare(input),out=path.resolve(a['--output']),repo=path.resolve(__dirname,'..'),rel=path.relative(repo,out),inside=!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);
 if(inside&&!/^(用户数据|work)([\\/]|$)/.test(rel))throw Error('完整第三方正文只可输出到用户数据、work或仓库外的个人目录，不能加入公开源码。');
 if(fs.existsSync(out))throw Error('输出文件已存在，原文件保留；请选择新文件名。');
 fs.mkdirSync(path.dirname(out),{recursive:true});
 fs.writeFileSync(out,JSON.stringify({format:'ielts-calibration-samples',version:1,attribution:calibration.CATALOG.source.copyright,privateUseOnly:true,sourcePdfVerified:pdfVerified,samples:samples.map(calibration.exportSample)},null,2),{encoding:'utf8',flag:'wx'});
 console.log(JSON.stringify({ok:true,output:out,sourcePdfVerified:pdfVerified,samples:samples.map(s=>({id:s.id,sha256:s.sha256,reference:s.reference,verified:s.provenance.verified,eligible:s.eligibility.bandComparison,wordCount:s.eligibility.wordCount}))},null,2));
}
if(require.main===module){try{main(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={args,main};
