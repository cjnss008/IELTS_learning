'use strict';
(function(root){
 const TASKS=Object.freeze([
  {id:'intro',name:'A0 认识新同学',level:'A0',part:'foundation',goal:'用自己的真实信息介绍姓名、住处和一个喜好，并听懂一个追问。',opening:'Hello! What is your name?',hints:['姓名','居住地','一个喜好'],turns:4},
  {id:'cafe',name:'A0–A1 咖啡店点单',level:'A1',part:'foundation',goal:'选择饮品、说明大小、回答堂食或带走；听不懂时请求重复。',opening:'Hello! What would you like to drink?',hints:['饮品','大小','堂食 / 带走'],turns:5},
  {id:'directions',name:'A1 问路与确认',level:'A1',part:'foundation',goal:'询问目的地，确认一个方向，听到变化后再次确认。',opening:'Hello! Where would you like to go?',hints:['目的地','方向','请求确认'],turns:5},
  {id:'appointment',name:'A2 安排时间',level:'A2',part:'foundation',goal:'商量时间、说明一次冲突并提出另一个安排，达成共同决定。',opening:'When would you like to meet this weekend?',hints:['时间','冲突原因','替代安排'],turns:6},
  {id:'part1',name:'Part 1 熟悉话题与追问',level:'B1',part:'part1',goal:'直接回答熟悉话题，用个人细节展开，回应不可预先背好的追问。',opening:'What do you enjoy doing in your free time?',hints:['直接回答','个人细节'],turns:6},
  {id:'part2',name:'Part 2 长回答与后续问答',level:'B2',part:'part2',goal:'描述一个帮助过你的人：是谁、何时、怎样帮助，以及为什么重要。可准备一分钟，随后自己展开，再回答追问。',opening:'Describe a person who helped you. Please tell me who they are, when it happened, how they helped, and why it mattered to you.',hints:['人物','发生的事'],turns:4,prepareSeconds:60},
  {id:'part3',name:'Part 3 比较、原因与反例',level:'B2',part:'part3',goal:'讨论人们互相帮助的原因，比较不同群体，用理由、例子和可能的反例回应追问。',opening:'Why do you think some people are more willing to help others?',hints:['观点','理由'],turns:6},
 ]);
 function task(id){return TASKS.find(item=>item.id===id)||null;}
 function hintsFor(item,turn){return turn===0?item.hints.slice(0,3):turn===1?item.hints.slice(0,1):[];}
 function assistance(session){return(session.turns||[]).some(turn=>turn.hintsShown===true);}
 function responseLatency(shown,started){const a=Date.parse(shown),b=Date.parse(started);return Number.isFinite(a)&&Number.isFinite(b)&&b>=a&&b-a<=86400000?Math.round(b-a):null;}
 function finishEligible(session){return Boolean(session&&session.status==='complete'&&session.turns?.length>=task(session.taskId)?.turns&&session.turns.every(turn=>turn.mediaId&&turn.transcript?.trim()&&turn.source?.verified===true));}
 const api=Object.freeze({TASKS,task,hintsFor,assistance,responseLatency,finishEligible});
 if(typeof module==='object'&&module.exports)module.exports=api;root.IELTSDialogue=api;
})(globalThis);
