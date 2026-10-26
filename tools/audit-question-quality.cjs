'use strict';
// Heuristic triage only. A clean scan is not a claim of psychometric validity or a full manual review.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.join(__dirname,'..');
const CONTENT_FIELDS=['title','prompt','instructions','passage','transcript','questions','vocabulary','grammar','transfer','figure','rubric'];
const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const ENUMS=new Set(['true','false','not given','yes','no','正确','错误','未提及','是','否']);
const STOP=new Set(['a','an','the','am','are','is','i','you','he','she','we','they','it','in','on','at','to','for','and','or','of','by','with','this','that']);
function containsLiteral(prompt,answer){const p=normalize(prompt),a=normalize(answer);if(!a)return false;if(/[\u3400-\u9fff]/.test(a))return p.includes(a);return new RegExp('(?:^|[^a-z0-9])'+escape(a)+'(?:$|[^a-z0-9])','i').test(p);}
function nameQuestion(prompt){return/(?:叫什么名字|名字是什么|姓名是什么|(?:名字|姓名).{0,8}[？?]|(?:what(?:'s| is)|which).{0,70}(?:name|called)|(?:name|called).{0,45}[?])/i.test(prompt);}
function auditMaterial(material){
 if(!['reading','listening'].includes(material.skill))return[];const findings=[];
 for(const q of material.questions||[]){
  const answers=(q.answers||[]).filter(a=>typeof a==='string'),literal=answers.filter(a=>!ENUMS.has(normalize(a))&&!STOP.has(normalize(a))&&containsLiteral(q.prompt,a)),isName=nameQuestion(q.prompt),add=(rule,severity,reason)=>findings.push({materialId:material.id,week:material.week,skill:material.skill,questionId:q.id,rule,severity,reason,prompt:q.prompt,answers,options:q.options||[],evidence:q.evidence||''});
  if(isName&&literal.length)add('NAME_ANSWER_IN_QUESTION','high','姓名题的正确姓名已经出现在题干，可能无需读取或听取材料。');
  else if(literal.length&&/(?:e\.g\.?|例如|（如|\(如)/i.test(q.prompt))add('FORMAT_EXAMPLE_IS_ANSWER','high','答题格式示例直接使用本题标准答案，导致无需听读也能填写。');
  else if(literal.some(a=>normalize(a).length>=3||/^\d+(?::\d+)?$/.test(normalize(a))))add('ANSWER_LITERAL_IN_PROMPT','review','题干含完整正确答案；需区分必要背景、选项标签和直接泄答。');
  const namedObject=/\b(?:park|program|programme|garden|project|building|caf[eé]|library|museum|company|club|organisation|organization)\b/i.test(q.prompt);
  if(isName&&!namedObject&&q.type==='single'&&(q.options||[]).some(option=>/^(?:class|room|school|student|teacher|blue|red|green|china|the uk)\b/i.test(option)||/^(?:\d+班|教室|学生|老师|红色|蓝色)$/.test(option)))add('NAME_OPTIONS_NOT_ALL_NAMES','review','姓名题出现班级、身份、颜色等选项，可能仅凭类别即可排除。');
  if((material.level==='A0'||material.week===1)&&(q.options||[]).some(option=>/^(?:true|false|not given)$/i.test(option)))add('A0_ABSTRACT_JUDGEMENT','high','零基础首周使用 True/False/Not Given，超出直接中文题干与字面信息提取的限定。');
  if(/(?:who is|什么身份|是什么身份)/i.test(q.prompt)&&(q.options||[]).some(option=>/^(?:a |the )?(?:class|classroom|room)\b/i.test(option)||/^(?:班级|教室|房间)$/.test(option)))add('IDENTITY_OPTION_CATEGORY','review','人物身份题的干扰项含非人物类别，降低了必须理解原文的要求。');
 }
 return findings;
}
function contentPayload(material){const keys=CONTENT_FIELDS.filter(k=>Object.hasOwn(material,k));return{keys,value:Object.fromEntries(keys.map(k=>[k,material[k]]))};}
function reviewIdentity(material,question){const digest=value=>crypto.createHash('sha256').update(value).digest('hex');return{sourceContentHash:digest(JSON.stringify(contentPayload(material).value)),questionHash:digest(JSON.stringify(question)),sourceTextHash:digest(material.passage||material.transcript||'')};}
function reviewFinding(finding,material,registry){
 const q=(material.questions||[]).find(v=>v.id===finding.questionId),candidates=(registry.reviews||[]).filter(r=>r.materialId===finding.materialId&&r.questionId===finding.questionId&&r.rule===finding.rule);if(!q||!candidates.length)return{status:'missing'};const identity=reviewIdentity(material,q),text=material.passage||material.transcript||'';
 for(const row of candidates){if(finding.severity!=='review'||row.decision!=='reviewed-acceptable')continue;if(Object.entries(identity).some(([key,value])=>row[key]!==value))continue;const exact=typeof row.sourceQuote==='string'&&row.sourceQuote.length>0&&Number.isInteger(row.quoteStart)&&Number.isInteger(row.quoteEnd)&&row.quoteEnd>row.quoteStart&&text.slice(row.quoteStart,row.quoteEnd)===row.sourceQuote;if(exact&&row.rationale&&row.reviewer&&row.reviewedAt)return{status:'accepted-current-content',reviewId:row.reviewId,decision:row.decision,rationale:row.rationale,reviewer:row.reviewer,reviewedAt:row.reviewedAt,...identity};return{status:'invalid-exact-source-proof'};}
 return{status:'stale-or-inapplicable'};
}
function loadReviewRegistry(root=ROOT){const file=path.join(root,'curriculum/question-quality-reviews.json');if(!fs.existsSync(file))return{schema:1,reviews:[]};const registry=JSON.parse(fs.readFileSync(file,'utf8'));if(registry.schema!==1||!Array.isArray(registry.reviews))throw Error('Unsupported source question review registry');return registry;}

function updateContentHash(material){const payload=contentPayload(material);material.source={...material.source,contentHash:crypto.createHash('sha256').update(JSON.stringify(payload.value)).digest('hex'),contentHashFields:payload.keys};return material;}
function scan(root=ROOT){
 const directory=path.join(root,'curriculum','materials'),files=fs.readdirSync(directory).filter(name=>name.endsWith('.json')).sort(),materials=files.map(name=>JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'))),registry=loadReviewRegistry(root),findings=materials.flatMap(material=>auditMaterial(material).map(finding=>({...finding,review:reviewFinding(finding,material,registry)}))),questionCount=materials.filter(m=>['reading','listening'].includes(m.skill)).reduce((sum,m)=>sum+(m.questions||[]).length,0);
 return{schema:1,generatedAt:new Date().toISOString(),scope:'全部公开源材料的理解题规则筛查；不包含派生语法题，不代表逐题人工审核或难度标定。',sourceMaterials:materials.length,comprehensionMaterials:materials.filter(m=>['reading','listening'].includes(m.skill)).length,questions:questionCount,high:findings.filter(f=>f.severity==='high').length,review:findings.filter(f=>f.severity==='review').length,reviewedCurrentContent:findings.filter(f=>f.severity==='review'&&f.review.status==='accepted-current-content').length,unresolvedReview:findings.filter(f=>f.severity==='review'&&f.review.status!=='accepted-current-content').length,reviewRegistry:'curriculum/question-quality-reviews.json',findings};
}
function main(){const report=scan(),args=process.argv.slice(2),reportIndex=args.indexOf('--report');if(reportIndex!==-1){if(!args[reportIndex+1])throw Error('--report requires a path');const file=path.resolve(args[reportIndex+1]);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');}if(args.includes('--json'))console.log(JSON.stringify(report,null,2));else{console.log('Question quality triage: '+report.sourceMaterials+' source materials / '+report.questions+' questions; high='+report.high+', review='+report.review+', current-hash reviewed='+report.reviewedCurrentContent+', unresolved='+report.unresolvedReview+'.');for(const finding of report.findings.filter(f=>f.severity==='high').slice(0,40))console.log(finding.materialId+'/'+finding.questionId+' '+finding.rule+': '+finding.prompt);}process.exitCode=report.high||args.includes('--require-reviewed')&&report.unresolvedReview?1:0;}
if(require.main===module)main();
module.exports={CONTENT_FIELDS,containsLiteral,nameQuestion,auditMaterial,contentPayload,updateContentHash,reviewIdentity,reviewFinding,loadReviewRegistry,scan};
