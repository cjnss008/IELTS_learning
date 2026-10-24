(function(root,factory){'use strict';const api=factory(root);root.IELTSYearPlanner=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
const DAYS=365,SKILLS=['vocabulary','grammar','listening','reading','speaking','writing'],NAMES={vocabulary:'词汇',grammar:'语法',listening:'听力',reading:'阅读',speaking:'口语',writing:'写作'},MS=86400000;
const A=root.IELTSAssessment||(typeof require==='function'?require('./assessment-core.js'):null);
function dateKey(value=Date.now()){const d=new Date(value);return Number.isFinite(d.getTime())?d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'):'';}
function dateNumber(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value)))throw Error('学习日期格式无效。');const n=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==value)throw Error('学习日期无效。');return n;}
function rank(value){return Math.max(-1,...(String(value||'').match(/A[012]|B[12]|C[12]/g)||[]).map(v=>['A0','A1','A2','B1','B2','C1','C2'].indexOf(v)));}
function artifact(record){try{return typeof record?.answer==='string'?JSON.parse(record.answer):record?.answer||null;}catch(_){return null;}}
function courseDay(record){const n=artifact(record)?.courseDay??record?.courseDay??record?.dayNumber;return Number.isInteger(n)&&n>=1&&n<=DAYS?n:null;}
function seconds(record){return Number.isFinite(record?.activeSeconds)&&record.activeSeconds>=0?record.activeSeconds:Number.isFinite(record?.minutes)&&record.minutes>=0?record.minutes*60:0;}
function latestRecords(records){const map=new Map();for(const record of records||[]){if(!record?.id)continue;const prior=map.get(record.id);if(!prior||Number(record.version||0)>Number(prior.version||0)||String(record.submittedAt)>String(prior.submittedAt))map.set(record.id,record);}return [...map.values()];}
function activityByDate(value,isDraft=false){
 const a=isDraft?value:artifact(value),ledger=a?.activityByDate||value?.activityByDate,result={};let total=0;
 if(ledger&&typeof ledger==='object'&&!Array.isArray(ledger)){for(const [date,n]of Object.entries(ledger)){try{dateNumber(date);}catch(_){continue;}if(Number.isFinite(n)&&n>=0&&n<=86400){result[date]=n;total+=n;}}if(total<=seconds(value)+1)return result;}
 const date=dateKey(isDraft?value.startedAt:value.submittedAt);if(date)result[date]=Math.min(86400,seconds(value));return result;
}
function mediaDraftsRemaining(drafts,records){
 const works=latestRecords(records),ids=new Set(works.map(r=>r.id)),out=new Map();
 for(const draft of drafts||[]){if(!draft?.id||ids.has(draft.id)||draft.recordId&&ids.has(draft.recordId))continue;const raw=draft.rawActivityByDate||activityByDate(draft,true),ledger={...raw};
  if(draft.source==='media-draft'){const consumed={};for(const r of works){const a=artifact(r),session=a?.activitySessionId,match=draft.activitySessionId&&session?draft.activitySessionId===session:r.materialId===draft.materialId&&r.startedAt===draft.startedAt;if(!match)continue;for(const [date,n]of Object.entries(activityByDate(r)))consumed[date]=Math.max(consumed[date]||0,n);}for(const date of Object.keys(ledger))ledger[date]=Math.max(0,ledger[date]-(consumed[date]||0));}
  const total=Object.values(ledger).reduce((n,v)=>n+v,0);if(!total)continue;const clean={...draft,activeSeconds:total,activityByDate:ledger,...(draft.source==='media-draft'?{rawActivityByDate:{...raw}}:{})},key=draft.source==='media-draft'?(draft.activitySessionId?'session:'+draft.activitySessionId:'legacy:'+draft.materialId+':'+draft.startedAt):'id:'+draft.id,prior=out.get(key);
  if(!prior)out.set(key,clean);else{for(const [date,n]of Object.entries(ledger))prior.activityByDate[date]=Math.max(prior.activityByDate[date]||0,n);if(prior.rawActivityByDate&&clean.rawActivityByDate)for(const [date,n]of Object.entries(clean.rawActivityByDate))prior.rawActivityByDate[date]=Math.max(prior.rawActivityByDate[date]||0,n);prior.activeSeconds=Object.values(prior.activityByDate).reduce((n,v)=>n+v,0);}
 }
 return[...out.values()];
}
function collectMediaDrafts(entries,records=[],options={}){
 const drafts=[],usedIds=new Set(latestRecords(records).map(r=>r.id));
 function add(entry,slot,activity,skill,materialId){if(!activity||typeof activity!=='object'||!Number.isFinite(activity.activeSeconds)||activity.activeSeconds<=0||!Number.isFinite(Date.parse(activity.startedAt)))return;const ledger=activityByDate({...activity,startedAt:activity.startedAt},true),total=Object.values(ledger).reduce((n,v)=>n+v,0);if(!total)return;const day=Number(entry.dayNumber??options.courseDay??1);drafts.push({id:'media-draft:'+entry.id+':'+slot,source:'media-draft',recordId:slot==='original'?entry.recordsId||entry.id:null,mediaEntryId:entry.id,activitySessionId:typeof activity.id==='string'?activity.id:'',skill,taskId:skill,courseDay:Number.isInteger(day)&&day>=1&&day<=365?day:365,materialId,startedAt:activity.startedAt,endedAt:activity.endedAt||entry.updatedAt,activeSeconds:total,activityByDate:ledger});}
 for(const entry of entries||[]){if(!entry||typeof entry.id!=='string'||usedIds.has(entry.id)||entry.recordsId&&usedIds.has(entry.recordsId))continue;const state=entry.transcript;if(!state||typeof state!=='object')continue;
  if(entry.mode==='writing_path'&&state.format==='ielts-writing-path-v1'){const materialId=state.plan?.id?'writingpath:'+state.plan.id:entry.materialId;for(const [id,step]of Object.entries(state.steps||{}))add(entry,id,step?.activity,'writing',materialId);add(entry,'transfer',state.transferActivity,'writing',materialId);}
  else if(entry.mode==='dialogue'&&state.format==='ielts-dialogue-v1')add(entry,'dialogue',state.activity,'speaking','dialogue:'+(state.state?.taskId||state.state?.task?.id||entry.task||''));
  else if(state.activity)add(entry,'original',state.activity,entry.kind==='writing'?'writing':'speaking',entry.materialId||'');
 }
 return mediaDraftsRemaining(drafts,records);
}
async function readBudget(options={}){
 const profiles=root.document?root.IELTSProfiles:null,getProfile=options.getProfile||(options.profileId?()=>options.profileId:()=>profiles?.current?.().id||'legacy'),profileId=getProfile(),assert=()=>{if(getProfile()!==profileId)throw Error('档案已切换，未使用其他档案的活动预算。');profiles?.assertFresh?.();};assert();
 const r=options.records!==undefined?options.records:await(root.document?root.IELTSRecords?.list?.():[])||[],library=options.library||(root.document?root.IELTSMediaLibrary:null),media=options.mediaEntries!==undefined?options.mediaEntries:await library?.list?.()||[];assert();let local=options.drafts;
 if(local===undefined){local=[];const storage=options.storage||(root.document?profiles?.storage?.():null);if(storage){for(const [key,section]of [['ielts52-course-player-v1','drafts'],['ielts52-memory-v1','drafts']]){const raw=storage.getItem(key);if(raw!==null){let value;try{value=JSON.parse(raw);}catch(_){throw Error('活动草稿无法读取，预算核对已停止；原记录保留。');}local.push(...Object.values(value?.[section]||{}));}}}}
 const mediaDrafts=collectMediaDrafts(media,r,{courseDay:options.courseDay}),drafts=mediaDraftsRemaining([...(local||[]).filter(d=>d.source!=='media-draft'),...mediaDrafts],r),budget=calendarBudget(r,drafts,options.today||dateKey(),options.budgetMinutes??360);assert();return{...budget,profileId,records:r,drafts,mediaDrafts};
}
function watchMediaActivity(listener){if(!root.document)return()=>{};const profile=root.IELTSProfiles?.current?.().id,receive=event=>{if(!event.detail?.profileId||event.detail.profileId===profile)listener();};root.addEventListener?.('ielts:media-activity-changed',receive);let channel;try{if(root.BroadcastChannel){channel=new root.BroadcastChannel(root.IELTSProfiles?.scopeKey('ielts52-media-activity-v1')||'ielts52-media-activity-v1');channel.onmessage=event=>receive({detail:event.data});}}catch(_){}return()=>{root.removeEventListener?.('ielts:media-activity-changed',receive);channel?.close();};}
function calendarBudget(records,drafts,today=dateKey(),budget=360){
 dateNumber(today);if(!Number.isFinite(budget)||budget<0||budget>360)throw Error('每日预算必须在0–360分钟。');
 const works=latestRecords(records),ids=new Set(works.map(r=>r.id)),items=[...works,...mediaDraftsRemaining(drafts,works).filter(d=>!ids.has(d.id))],seen=new Set();let used=0;
 for(const item of items){if(seen.has(item.id))continue;seen.add(item.id);used+=(activityByDate(item,!ids.has(item.id))[today]||0)/60;}
 return{date:today,budgetMinutes:budget,spentMinutes:used,remainingMinutes:Math.max(0,budget-used),exhausted:used>=budget-1e-8,includesDrafts:true};
}
function mastery(data,records,options={}){
 const now=options.now??Date.now(),verified=options.verifiedRecord||root.IELTSAdaptivePlan?.verifiedRecord,blocked=new Set(options.unresolvedMaterialIds||[]),materials=new Map((data.materials||[]).map(m=>[m.id,m])),latest=new Map();
 for(const r of latestRecords(records)){const old=latest.get(r.materialId);if(!old||String(r.submittedAt)>String(old.submittedAt))latest.set(r.materialId,r);}
 const profile={};for(const skill of SKILLS){const proofs=[];for(const record of latest.values()){const m=materials.get(record.materialId),a=artifact(record);if(!m||m.skill!==skill||m.pool!=='training'||m.fullTest||m.form||m.assessmentGroup||blocked.has(m.id)||!a||record.kind==='correction'||record.exposure!=='unseen'||(a.exposureAtStart!==undefined&&a.exposureAtStart!=='unseen')||A?.assistanceUsed(record)||a.interrupted||typeof verified!=='function'||!verified(record,m,now,{blockedMaterialIds:blocked}))continue;
 proofs.push({recordId:record.id,materialId:m.id,week:m.week,level:m.level,rank:rank(m.level),submittedAt:record.submittedAt});}
 proofs.sort((a,b)=>a.submittedAt.localeCompare(b.submittedAt));let achieved=-1;for(let level=0;level<=6;level++){const same=proofs.filter(p=>p.rank>=level),distinct=new Set(same.map(p=>p.materialId));if(distinct.size>=2&&Date.parse(same.at(-1).submittedAt)-Date.parse(same[0].submittedAt)>=48*3600000)achieved=level;}
 profile[skill]={skill,proofs,evidenceCount:proofs.length,levelRank:achieved,level:achieved<0?'待验证':['A0','A1','A2','B1','B2','C1','C2'][achieved],retained:achieved>=0,reason:achieved<0?'至少两份不同未见材料，间隔48小时、独立正确或真实评阅；短用时本身不推进。':'已保留不同新材料和延迟保持证据；仍需通过阶段关卡。'};}
 return profile;
}
function progression(data,records,options={}){
 const profile=options.profile||mastery(data,records,options),now=options.now??Date.now(),gates=A?.gateMastery(records,data.materials,{now})||[],currentWeek=Math.max(1,Math.min(52,options.currentWeek||1)),weeks=data.weeks||[],checks=[];
 let unlockedWeek=currentWeek;
 for(let week=currentWeek+1;week<=52;week++){
  const previous=weeks.find(w=>w.week===week-1),level=rank(previous?.level||data.materials.find(m=>m.week===week-1&&m.pool==='training')?.level),unmet=SKILLS.filter(skill=>profile[skill].levelRank<level||profile[skill].proofs.filter(p=>p.week>=week-1).length<2),blocked=gates.filter(g=>g.week<week&&!g.pass),reasons=[...unmet.map(s=>NAMES[s]+'仍缺第'+(week-1)+'周及以上的两份新材料与延迟保持证据'),...blocked.map(g=>g.id+'：'+g.reasons.join('；'))],pass=!reasons.length;
  checks.push({week,pass,reasons,prerequisiteWeek:week-1});if(!pass)break;unlockedWeek=week;
 }
 return{currentWeek,unlockedWeek,profile,gates,checks,next:checks.find(c=>!c.pass)||null,rule:'逐周核对六项前置、48小时保持及全部先前A/B关卡；不挪用关卡B卷和末期保留卷。'};
}
function loadWindow(records,today,days,options={}){
 const end=dateNumber(today),dates=Array.from({length:days},(_,i)=>new Date(end-(days-1-i)*MS).toISOString().slice(0,10)),byDate=new Map(dates.map(date=>[date,{date,minutes:0,draftMinutes:0,drafts:0,records:0,pending:0,revise:0,assisted:0,unseen:0,completed:0}]));
 for(const r of latestRecords(records)){for(const [date,n]of Object.entries(activityByDate(r))){const row=byDate.get(date);if(row)row.minutes+=n/60;}const row=byDate.get(dateKey(r.submittedAt));if(!row)continue;row.records++;if(r.evaluation?.result==='pending')row.pending++;if(r.evaluation?.result==='revise')row.revise++;if(A?.assistanceUsed(r))row.assisted++;if(r.exposure==='unseen'&&!A?.assistanceUsed(r)&&r.kind!=='correction')row.unseen++;}
 for(const date of options.completedDates||[])if(byDate.has(date))byDate.get(date).completed++;
 for(const draft of mediaDraftsRemaining(options.drafts||[],records)){for(const [date,n]of Object.entries(activityByDate(draft,true))){const row=byDate.get(date);if(row){row.minutes+=n/60;row.draftMinutes+=n/60;if(n>0)row.drafts++;}}}
 const rows=[...byDate.values()],observed=rows.filter(r=>r.records||r.minutes),sum=key=>rows.reduce((n,r)=>n+r[key],0),first=rows.slice(0,Math.floor(days/2)).filter(r=>r.records),last=rows.slice(Math.floor(days/2)).filter(r=>r.records),ratio=(rows,key)=>rows.reduce((n,r)=>n+r[key],0)/Math.max(1,rows.reduce((n,r)=>n+r.records,0)),fatigue=[];
 if(observed.filter(r=>r.minutes>=300).length>=5)fatigue.push('多日作品活动接近六小时，请拆分难点并安排休息。');
 if(first.length>=3&&last.length>=3&&ratio(last,'revise')-ratio(first,'revise')>=.2)fatigue.push('后半段需修改作品占比上升，建议先减量补强再观察。');
 if(sum('pending')>=5)fatigue.push('待评作品积累，先重试评阅并学习其他已可用任务。');
 return{days,rows,observedDays:observed.length,minutes:sum('minutes'),draftMinutes:sum('draftMinutes'),drafts:sum('drafts'),averageDailyMinutes:sum('minutes')/days,records:sum('records'),pending:sum('pending'),revise:sum('revise'),assisted:sum('assisted'),unseen:sum('unseen'),fatigue,interpretation:observed.length<7?'真实记录不足七日，暂不判断疲劳或长期学习效果。':'以下为作品活动、待评和修改比例的负荷观察，不能据此诊断疲劳或计算考试通过概率。'};
}
function submissionSatisfied(record,material){
 if(!record||!material)return false;const value=artifact(record);if(!value||value.interrupted&&value.mode==='assessment')return false;
 if(['reading','grammar','listening'].includes(material.skill)){try{const g=A.gradeMaterial(material,value.answers);return g.allGradable&&g.answered===material.questions.length&&(material.skill!=='listening'||value.audioCompleted===true);}catch(_){return false;}}
 if(material.skill==='vocabulary'){const vocabulary=root.IELTSVocabularyPractice||(typeof require==='function'?require('./vocabulary-practice.js'):null);return vocabulary?.verifyTrainingArtifact?.(value,material)?.submitted===true;}
 if(['writing','speaking'].includes(material.skill)){const plan=root.IELTSPlanState||(typeof require==='function'?require('./daily-plan-state.js'):null);return plan?.validLinkedReview?.(record)===true;}
 if(material.skill==='reflection')return record.source==='mistake-review'||record.source==='year-review';return false;
}
function observe(options={}){
 const {data}=options,records=latestRecords(options.records||[]),drafts=[...(options.drafts||[]),...collectMediaDrafts(options.mediaEntries||[],records)],now=options.now??Date.now(),today=options.today||dateKey(now),startDate=options.startDate||today,calendarDay=Math.floor((dateNumber(today)-dateNumber(startDate))/MS)+1,materials=new Map(data.materials.map(m=>[m.id,m])),byDay=new Map(),completed=[];
 for(const r of records){const n=courseDay(r);if(n){if(!byDay.has(n))byDay.set(n,[]);byDay.get(n).push(r);}}
 const rows=data.days.map(day=>{const own=byDay.get(day.day)||[],done=options.isDayComplete?.(day.day,own)===true;if(done)completed.push(day.day);const pending=own.filter(r=>r.evaluation?.result==='pending').length,required=day.tasks.flatMap(t=>t.coreMaterialIds||t.materialIds||[]),submitted=new Set(own.filter(r=>r.kind!=='retest'&&submissionSatisfied(r,materials.get(r.materialId))).map(r=>r.materialId)),remainingIds=required.filter(id=>!submitted.has(id)),estimatedMinutes=done?0:remainingIds.reduce((n,id)=>n+(Number(materials.get(id)?.estimatedMinutes)||15),0)+(pending*15);return{day:day.day,week:day.week,done,pending,remainingIds,estimatedMinutes:done?0:Math.max(15,estimatedMinutes),started:own.length>0||drafts.some(d=>d.courseDay===day.day)};});
 const first=rows.find(r=>!r.done),backlog=rows.filter(r=>r.day<calendarDay&&!r.done),remaining=rows.filter(r=>!r.done),budget=calendarBudget(records,drafts,today,options.budgetMinutes??360),currentWeek=first?.week||52,proof=mastery(data,records,{...options,now}),route=progression(data,records,{...options,now,currentWeek,profile:proof}),windows={};for(const days of [7,14,30])windows[days]=loadWindow(records,today,days,{drafts});
 const estimatedMinutes=remaining.reduce((n,r)=>n+r.estimatedMinutes,0),availableDays=Math.max(0,DAYS-Math.max(1,calendarDay)+1),minimumDays=Math.ceil(estimatedMinutes/360),observedDaily=windows[30].averageDailyMinutes,observedDaysNeeded=windows[30].observedDays>=7&&observedDaily>0?Math.ceil(estimatedMinutes/observedDaily):null,risk=[];
 if(backlog.length)risk.push(backlog.length+'个课程日尚有未完成或待验证任务。');if(minimumDays>availableDays)risk.push('按材料估时，即使每天360分钟也需要延长约'+(minimumDays-availableDays)+'天；估时会随真实表现更新。');if(observedDaysNeeded!==null&&observedDaysNeeded>availableDays)risk.push('按最近30天实际投入，剩余材料预计超过当前年限；先核对负荷与短板，再调整周期。');if(route.next)risk.push('前置能力或关卡未齐全，尚不能自动推进第'+route.next.week+'周。');
 const readiness=A?.readiness(records,data.materials,{now})||{ready:false,reasons:['准备度组件未就绪。']},yearEnd=calendarDay>=365;
 return{today,startDate,calendarDay,courseDay:first?.day||365,completedDays:completed,rows,backlog,backlogMinutes:backlog.reduce((n,r)=>n+r.estimatedMinutes,0),budget,windows,mastery:proof,progression:route,annual:{availableDays,estimatedRemainingMinutes:estimatedMinutes,minimumDays,observedDaysNeeded,risk,probability:null,explanation:'仅显示材料工作量、证据缺口和真实投入趋势；没有经过长期校准的考试通过概率。'},yearEnd:{due:yearEnd,readiness,continueReinforcement:!readiness.ready,action:readiness.ready?'近期完整训练证据达到内部标准；继续维护并以正式考试核验。':'继续补强：先完成未交材料和待评，再处理最弱技能，按48小时窗口使用未曝光关卡复测；保留末期新卷，待条件齐全再测。'},nextAction:first?{day:first.day,kind:backlog.length?'backlog':'continue',label:(backlog.length?'补做':'继续')+'第'+first.day+'天'}:{day:365,kind:'year-review',label:'查看第365天年度总结'}};
}
return Object.freeze({DAYS,SKILLS,NAMES,dateKey,dateNumber,rank,artifact,courseDay,seconds,activityByDate,mediaDraftsRemaining,collectMediaDrafts,readBudget,watchMediaActivity,calendarBudget,mastery,progression,loadWindow,submissionSatisfied,observe});
});
