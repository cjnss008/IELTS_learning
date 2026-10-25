(function(root,factory){'use strict';const assessment=root.IELTSAssessment||(typeof require==='function'?require('./assessment-core.js'):null),api=factory(assessment);root.IELTSObjectiveFeedback=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(A){
'use strict';
const modes=['fill','short','spelling'];
const countable=new Set(['classmate','student','teacher','friend','book','desk','bag','pen','room','house','school','library','park','shop','ticket','visitor','worker','year','day','week','month','hour','minute','question','answer','word','child','person','man','woman']);
const irregular={child:'children',person:'people',man:'men',woman:'women',mouse:'mice',foot:'feet',tooth:'teeth'};
function distance(a,b){let previous=Array.from({length:b.length+1},(_,i)=>i);for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(next[j]+1,previous[j+1]+1,previous[j]+(a[i]===b[j]?0:1)));previous=next;}return previous[b.length];}
function letterDifference(actual,expected){let start=0;while(start<actual.length&&start<expected.length&&actual[start]===expected[start])start++;let end=0;while(end<actual.length-start&&end<expected.length-start&&actual[actual.length-1-end]===expected[expected.length-1-end])end++;return{position:start+1,actual:actual.slice(start,actual.length-end),expected:expected.slice(start,expected.length-end)};}
function omitted(shorter,longer){let index=0;const missing=[];for(const token of longer){if(token===shorter[index])index++;else missing.push(token);}return index===shorter.length&&missing.length?missing:null;}
function pluralOf(singular,plural){return irregular[singular]===plural||plural===singular+'s'||plural===singular+'es'||singular.endsWith('y')&&plural===singular.slice(0,-1)+'ies';}
function includesPhrase(text,phrase){return(' '+text.replace(/[^a-z0-9'’-]+/g,' ')+' ').includes(' '+phrase.replace(/[^a-z0-9'’-]+/g,' ')+' ');}
function nounNumberContext(word,source,plural){if(!/^[a-z]+$/.test(word)||/^(?:news|series|species|means|physics|mathematics|economics|politics)$/.test(word))return false;const lead=plural?'(?:two|three|four|five|six|seven|eight|nine|ten|many|several|both|these|those|are|were|[2-9]|[0-9]{2,})':'(?:a|an|one)';return new RegExp('\\b'+lead+'\\s+(?:[a-z]+\\s+){0,2}'+word+'\\b').test(source);}
function explain(question,supplied,options={}){
 const grade=options.grade||(A?.gradeQuestion?A.gradeQuestion(question,supplied):null),raw=Array.isArray(supplied)?supplied.join('、'):typeof supplied==='string'?supplied:'',expected=Array.isArray(grade?.expected)?grade.expected.filter(value=>typeof value==='string'&&value.trim()):[],points=[],issues=[],evidence=typeof question?.evidence==='string'?question.evidence:'',source=typeof options.sourceText==='string'?options.sourceText:typeof options.transcript==='string'?options.transcript:'',evidenceVerified=Boolean(evidence&&source.includes(evidence)),sourceKind=options.sourceKind||'listening';
 const base={userAnswer:raw,expected:expected.slice(),evidence,evidenceVerified,evidenceLabel:evidenceVerified?({listening:'录音原句',reading:'原文句子',grammar:'题目原句',vocabulary:'例句'}[sourceKind]||'原句依据'):'题目所附依据',explanation:typeof question?.explanation==='string'?question.explanation:'',points,issues};
 if(!grade||grade.gradable!==true||!expected.length)return{...base,status:'pending',title:'题目答案待核对',points:['本题缺少可核对的标准答案，暂不判断这份原稿对错。']};
 if(!grade.answered)return{...base,status:'unanswered',title:'本题尚未作答',points:['这里还没有实际答案，先按题意填写；不会把空白推断为某种语法错误。']};
 if(grade.correct)return{...base,status:'correct',title:'本题原始答案符合要求',points:['本次输入符合这道题当前接受的答案和词数要求。']};
 const normalize=options.normalizeAnswer||A.normalizeAnswer,actual=normalize(raw),accepted=expected.map(value=>({raw:value,key:normalize(value)})),fill=modes.includes(question?.type),max=Number.isInteger(question?.maxWords)&&question.maxWords>0?question.maxWords:null,count=A.countWords(raw),original=normalize(evidence||source),fromText=/原文|原句|文中|from (?:the )?(?:text|passage|recording)|words? (?:from|in) (?:the )?(?:text|passage)/i.test(question?.prompt||'');
 if(fill&&max){points.push('词数要求是最多 '+max+' 词，不是至少 '+max+' 词；“一个词”也不等于必须用单数，不必为了凑满上限添加词语。');if(grade.withinLimit===false){issues.push('word-limit');points.push('本次输入按同一计分规则计为 '+count+' 词，超过 '+max+' 词上限；请只保留题目要求的答案。');}else points.push('本次输入为 '+count+' 词，没有超过上限；还须核对具体信息和完整词形。');}
 let target=null,article=fill?accepted.find(value=>/^(?:the|a|an) /.test(value.key)&&value.key.replace(/^(?:the|a|an) /,'')===actual):null;
 if(article){
  target=article;const word=article.key.split(' ')[0];issues.push('missing-article');points.push('你的原稿与参考短语相比，正好遗漏了开头的冠词 '+word+'；不是大小写或空格差异。');
  if(['the uk','the united kingdom'].includes(article.key))points.push('UK 是 United Kingdom（联合王国）的缩写；这里表示国家，完整名称短语是 the UK / the United Kingdom，通常说 from the UK。the 是这一用法的一部分，不能省略；这不表示所有国家名都要加 the。');
  else points.push('本题原句和参考短语保留了 '+word+'；请结合题干填写这一完整短语，不能推断所有相似名词都必须使用同一个冠词。');
 }else{
  const plural=fill?accepted.find(value=>/^[a-z]+$/.test(actual)&&/^[a-z]+$/.test(value.key)&&((countable.has(actual)||Object.hasOwn(irregular,actual)||nounNumberContext(value.key,original,true))&&pluralOf(actual,value.key)&&nounNumberContext(value.key,original,true)||(countable.has(value.key)||nounNumberContext(value.key,original,false))&&pluralOf(value.key,actual)&&nounNumberContext(value.key,original,false))):null;
  if(plural){target=plural;const userIsSingular=pluralOf(actual,plural.key);issues.push('number-form');points.push('单复数形式不同：本次写“'+raw+'”，参考为“'+plural.raw+'”。'+(userIsSingular?raw+' 是单数，'+plural.raw+' 是复数；本次漏掉了复数形式。':plural.raw+' 是单数，本次把它改成了复数形式。'));if(actual==='classmate'&&plural.key==='classmates')points.push('classmate 表示一名同学，classmates 表示同学们／互为同学的关系；原句用 classmates 表示互为同学，词尾 -s 有意义。“从原文填一个词”限制词数，并不要求把原文的复数改成单数。');}
  else{
   const actualTokens=actual.split(/\s+/),change=fill?accepted.map(value=>({...value,missing:omitted(actualTokens,value.key.split(/\s+/)),extra:omitted(value.key.split(/\s+/),actualTokens)})).find(value=>value.missing||value.extra):null;
   if(change){target=change;const missing=change.missing;issues.push(missing?'missing-words':'extra-words');points.push(missing?'与参考短语逐词对照，本次漏掉“'+missing.join('、')+'”；这些词属于本题要填写的短语，不能只留下部分关键词。':'本次比参考短语多写“'+change.extra.join('、')+'”；请核对空格范围和题意，填写所需答案，不必抄整句。');}
   else{
    const spacing=accepted.find(value=>actual!==value.key&&actual.replace(/\s+/g,' ')===value.key.replace(/\s+/g,' ')),near=fill&&/^[a-z]{3,40}$/.test(actual)?accepted.map(value=>({...value,difference:/^[a-z]{4,40}$/.test(value.key)?distance(actual,value.key):Infinity})).sort((a,b)=>a.difference-b.difference)[0]:null;
    if(spacing){target=spacing;issues.push('spacing');points.push('词语内容相同，但词间空白与标准写法不同；本项当前按标准英文书写核对，请使用“'+spacing.raw+'”的词间空格。');}
    else if(near&&near.difference>0&&near.difference<=2){target=near;const difference=letterDifference(actual,near.key);issues.push('letter-difference');points.push('你的输入与参考词 '+near.raw+' 存在字母差异：从第 '+difference.position+' 个字母处，本次为“'+(difference.actual||'缺少字母')+'”，参考为“'+(difference.expected||'不需要这些字母')+'”。请对照完整拼写 '+near.raw+' 核对。');points.push('仅凭书面答案不能确定是辨词错误还是拼写笔误；先根据原句确认词，再检查字母。');}
    else{issues.push('information-mismatch');points.push((question?.type==='multi'?'本题须同时选全要求的内容，本次多选集合':question?.type==='single'?'本次选择':'本次填写')+'与题目接受的信息不一致。请先核对题干问的是谁、什么关系、地点、时间或数量，再用原句定位答案；不要只凭出现了一个熟悉词作答。');}
   }
  }
 }
 if(target)points.push('本题应写：'+target.raw+'；该写法共 '+A.countWords(target.raw)+' 词。');
 if(fromText){const found=accepted.find(value=>includesPhrase(original,value.key));points.push(found?'本题要求从原文取词，原句采用“'+found.raw+'”这一形式；词尾和短语中的必要词也属于原文，不能先改成词典原形再填写。':'题目要求原文取词，但这份所附依据未定位到参考形式；请核对题目资料，不凭空补充语法规则。');}
 const next=sourceKind==='listening'?'回听所附原句，核对答案前后的小词与词尾，再按题意、词数和准确书写填写。':'回看所附原句，先确认所问信息，再检查词形、短语范围与词数。';
 return{...base,status:'incorrect',title:issues.includes('missing-article')?'少了完整短语中的冠词':issues.includes('number-form')?'单复数形式需要保留':issues.includes('word-limit')?'答案超出词数上限':issues.includes('missing-words')?'答案短语有漏词':issues.includes('extra-words')?'答案短语有多余词':issues.includes('letter-difference')?'核对词语与拼写':'核对题意与原句',next};
}
return Object.freeze({explain});
});
