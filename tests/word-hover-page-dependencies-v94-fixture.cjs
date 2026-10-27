'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const pages=['今日学习.html','开始学习.html','词汇记忆.html','单词分组学习.html','基础入门.html','口语练习.html','生词复习.html','无稿口语.html','写作补强.html','写作与AI辅导.html','学习课程.html','每日学习计划.html','本地教材.html','真人听力来源.html','课程目标与资源.html','课程覆盖.html','评分校准.html','入学测评.html','30分钟能力测试.html','陌生材料库.html','个性化学习.html'];
const dependencies=['assets/american-pronunciations.js','assets/word-dictionary.js','assets/word-hover.js'],sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function transform(source){
  assert.equal((source.match(/<\/head>/gi)||[]).length,1,'One real head is required.');assert.ok(source.includes('assets/user-data-bootstrap.js'),'Keep the existing Profiles/data script barrier.');
  const nl=source.includes('\r\n')?'\r\n':'\n',slot='<!--word-hover-v94-dependencies-->';
  const existing=dependencies.flatMap(dep=>[...source.matchAll(new RegExp('<script\\b[^>]*(?:data-src|src)=["\']'+dep.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'["\'][^>]*>\\s*</script>','gi'))]);
  if(existing.some(m=>m[0].includes('data-word-hover-v94="1"'))){assert.equal(existing.length,3);assert.ok(existing.every(m=>m[0].includes('data-word-hover-v94="1"')&&m[0].includes('application/x-ielts-pending')));const positions=dependencies.map(d=>source.indexOf('data-src="'+d+'"'));assert.ok(positions.every((p,i)=>p>=0&&(!i||p>positions[i-1])));const firstConsumer=[...source.matchAll(/<script\b[^>]*data-src=["']assets\/(?:vocabulary-practice|course-player|essential-vocabulary-app|memory-app)\.js["'][^>]*>\s*<\/script>/gi)].sort((a,b)=>a.index-b.index)[0];if(firstConsumer)assert.ok(positions[2]<firstConsumer.index,'Hover dependencies must remain before consumers.');assert.ok(source.includes('href="assets/word-hover.css"'));return source;}
  const consumers=[...source.matchAll(/<script\b[^>]*data-src=["']assets\/(?:vocabulary-practice|course-player|essential-vocabulary-app|memory-app)\.js["'][^>]*>\s*<\/script>/gi)];
  const first=[...existing,...consumers].sort((a,b)=>a.index-b.index)[0],earliest=first&&first.index<source.indexOf('</head>')?first[0]:'</head>';
  assert.equal(source.split(earliest).length,2,'One exact insertion anchor is required.');let result=source.replace(earliest,slot+earliest);
  const tags=dependencies.map(dep=>{const regex=new RegExp('<script\\b[^>]*(?:data-src|src)=["\']'+dep.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'["\'][^>]*>\\s*</script>','gi'),matches=[...result.matchAll(regex)];assert.ok(matches.length<=1,'Duplicate learning dependency: '+dep);if(matches.length){assert.match(matches[0][0],/application\/x-ielts-pending/,'Do not move a dependency outside the data barrier.');result=result.replace(matches[0][0],'');}return '<script type="application/x-ielts-pending" data-ielts-script="1" data-word-hover-v94="1" data-src="'+dep+'" defer></script>';});
  // Keep dependencies before their earliest existing slot or consumer. Moving
  // Dictionary/hover after Player or vocabulary-practice would lose its factory.
  assert.equal(result.split(slot).length,2);result=result.replace(slot,tags.join(nl)+nl);
  if(!result.includes('href="assets/word-hover.css"'))result=result.replace(/<\/head>/i,'<link rel="stylesheet" href="assets/word-hover.css">'+nl+'</head>');
  const positions=dependencies.map(dep=>result.indexOf('data-src="'+dep+'"'));assert.ok(positions.every((p,i)=>p>=0&&(!i||p>positions[i-1])));return result;
}
module.exports={pages,dependencies,transform};
