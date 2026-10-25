'use strict';
// Original concise operating guidance, not a reproduction of the full rubric.
// Primary sources were checked 2026-10-25. Read the official descriptors for
// the complete standard; these paraphrases do not imply IELTS endorsement.
const VERSION='public-descriptor-guide-2023-05-v1';
const SOURCES=Object.freeze([
 {title:'IELTS Writing Band Descriptors (updated May 2023)',url:'https://ielts.org/cdn/Guides/ielts-writing-band-descriptors.pdf'},
 {title:'IELTS scoring in detail',url:'https://ielts.org/take-a-test/your-results/ielts-scoring-in-detail'},
 {title:'IELTS Speaking Band Descriptors',url:'https://ielts.org/cdn/ielts-guides/ielts-speaking-band-descriptors.pdf'},
]);
const ROUND_VARIANTS=Object.freeze(['whole-response-balanced','criterion-evidence-balanced']);
function roundVariant(round){return ROUND_VARIANTS[round===2?1:0];}
function facts(value){const text=String(value.text||'');return {wordCount:(text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)||[]).length,minimumWords:value.mode==='writing'?(value.task==='academic_task1'?150:value.task==='academic_task2'?250:null):40,paragraphCount:text.split(/\n\s*\n/).filter(p=>p.trim()).length};}
function paragraphs(text){const out=[];const pattern=/[^\n](?:[\s\S]*?)(?=\n\s*\n|$)/g;for(const m of text.matchAll(pattern)){if(m[0].trim())out.push({id:out.length+1,start:m.index,end:m.index+m[0].length});}return out.length?out:[{id:1,start:0,end:text.length}];}
function writing(task){return '以下是依据公开描述编写的简短操作指南，不是完整官方描述表。分数评价当前整篇表现，不预测另一篇作品，也不按学习者级别、目标分或样例身份定分。'+
 '相邻档位要按整体质量区分：5档常见任务或发展有明显缺口、组织推进欠清楚、语言限制令读者有困难；6档通常基本回应主要要求、总体可跟随，发展或语言灵活性仍不均衡；7档通常立场和推进清楚、主要观点有发展与支持、用词有一定灵活性、复杂结构有变化且常见无误句，少量不妨碍理解的错误仍可能存在；8档通常内容发展充分、阅读容易、词汇与结构范围宽且运用灵活准确，偶发小错不等于降到6；9档需要非常充分而精确的内容与熟练自然的组织和语言，偶发细小疏漏也不能机械排除。0–4档按实际严重程度判断，不能把所有作品集中在5–6。'+
 (task==='academic_task1'?'task维度：核对题目全部数据、关键特征、概述、准确比较及信息选择；遗漏关键概述或误报数据影响本维，不能自动把其余三个维度同时封顶。':'task维度：核对题目实际要求、立场是否清楚且贯穿、相关观点是否得到解释和支持。仅题目要求讨论双方时才要求对等展开双方；同意程度可以明确全部同意，不额外强求某个比例或标准句。例子的相关性与支持作用要按文本说明，不把未经外部核验的常识断言当已证实的错误；可疑例子不自动封顶整篇四维。')+
 'coherence维度：阅读全篇，考察论点顺序、段落中心、段内发展以及段间关系；指代、替换和语义联系都可形成衔接，不数连接词或强求更多过渡词。说明至少一条实际篇章关系，可用不同位置的真实短引文锚定；单个连接词不能代表整篇连贯性。'+
 'lexical维度：看词义与搭配精度、可用范围、灵活表达和拼写对阅读的实际影响；不按罕见词数量或同义词堆砌评分，必要主题词重复可以合理。grammar维度：看句法范围、从属及复杂表达的实际控制、无误句与错误的分布和理解影响；不把自然简洁句视为错误。'+
 '每维独立权衡代表性的强项与弱项，区分偶发失误和持续限制，不能从一处错误推断所有维度低分。评分先完成，再给可选改进；有效改进建议不证明原稿存在错误。四维各自给分，不强行拉齐，也不为凑平均值调某一维。';}
module.exports={VERSION,SOURCES,ROUND_VARIANTS,roundVariant,facts,paragraphs,writing};
