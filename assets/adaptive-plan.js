(function(root){
  'use strict';
  const KEY='ielts52-adaptive-plan-v1',SKILLS=Object.freeze(['vocabulary','grammar','listening','reading','speaking','writing']);
  const clone=value=>JSON.parse(JSON.stringify(value)),validDay=n=>Number.isInteger(n)&&n>=1&&n<=365;
  const validId=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value)&&!['__proto__','constructor','prototype'].includes(value);
  const assessment=root.IELTSAssessment||(typeof module==='object'&&module.exports?require('./assessment-core.js'):null);
  function plain(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.keys(value).some(k=>!keys.includes(k)))throw Error('个性化计划结构无效。');}
  function promiseOfScore(value){return String(value).split(/[。！？\n；;,，]/).some(part=>!/(?:不|不能|无法|不会)\s*(?:保证|确保|承诺)|no guarantee|cannot guarantee/i.test(part)&&/(?:包过|稳过)|(?:保证|确保|必定|一定|肯定|承诺)[^。！？\n]{0,60}(?:考试|雅思|IELTS|band|成绩|[5-9](?:\.\d)?分)|(?:将|会)(?:获得|考到|达到|取得|拿到)[^。！？\n]{0,30}(?:雅思|IELTS|band|[5-9](?:\.\d)?分)|(?:guarantee(?:d)?|will definitely|sure to)[^.!?\n]{0,80}(?:score|band|ielts|pass|exam)|\b(?:you|students?|learners?)\s+will\s+(?:score|achieve|pass|reach|get)[^.!?\n]{0,60}(?:band|IELTS|exam|score)/i.test(part));}
  function text(value,max){if(typeof value!=='string'||!value.trim()||value.length>max||promiseOfScore(value))throw Error('策略文字缺失、过长或含考试成绩保证。');return value.trim().replace(/</g,'＜').replace(/>/g,'＞');}
  function proposalShape(value){
    plain(value,['prioritySkills','reason','strategies','reinforcementMaterialIds']);
    if(!Array.isArray(value.prioritySkills)||value.prioritySkills.length>2||new Set(value.prioritySkills).size!==value.prioritySkills.length||value.prioritySkills.some(s=>!SKILLS.includes(s)))throw Error('重点技能最多选择两项。');
    if(!Array.isArray(value.strategies)||value.strategies.length>6||new Set(value.strategies.map(s=>s?.skill)).size!==value.strategies.length)throw Error('学习策略格式无效。');
    const strategies=value.strategies.map(item=>{plain(item,['skill','action']);if(!SKILLS.includes(item.skill))throw Error('策略技能无效。');return{skill:item.skill,action:text(item.action,800)};});
    if(value.prioritySkills.some(skill=>!strategies.some(s=>s.skill===skill)))throw Error('每个重点技能都需要具体学习策略。');
    if(!Array.isArray(value.reinforcementMaterialIds)||value.reinforcementMaterialIds.length>3||new Set(value.reinforcementMaterialIds).size!==value.reinforcementMaterialIds.length||value.reinforcementMaterialIds.some(id=>!validId(id)))throw Error('补强材料最多三份，须使用现有材料ID。');
    return{prioritySkills:value.prioritySkills.slice(),reason:text(value.reason,1200),strategies,reinforcementMaterialIds:value.reinforcementMaterialIds.slice()};
  }
  function eligibleMaterial(material,week){return Boolean(material&&material.pool==='training'&&!material.fullTest&&!material.assessmentGroup&&!material.form&&SKILLS.includes(material.skill)&&Number.isInteger(material.week)&&material.week<=week&&material.source?.verification==='reviewed');}
  function normalizeProposal(value,data,dayNumber){
    if(!validDay(dayNumber)||!Array.isArray(data?.days)||!Array.isArray(data?.materials))throw Error('个性化计划缺少有效课程日和材料来源。');
    const day=data.days.find(d=>d.day===dayNumber);if(!day)throw Error('课程日不存在。');const out=proposalShape(value);
    for(const id of out.reinforcementMaterialIds){const m=data.materials.find(m=>m.id===id);if(!eligibleMaterial(m,day.week)||!out.prioritySkills.includes(m.skill))throw Error('补强材料须为已到周次、匹配重点技能的已审核常规材料；保留卷和未来材料不能使用。');}
    return out;
  }
  function frozenDay(value,number){
    if(!value||value.day!==number||!Number.isInteger(value.week)||value.week<1||value.week>52||!Array.isArray(value.tasks)||!value.tasks.length||value.tasks.length>7||JSON.stringify(value).length>50000||value.totalMinutes!==360||value.tasks.reduce((n,t)=>n+t.minutes,0)!==360)throw Error('已开始课程的固定材料无效。');
    const ids=new Set();for(const task of value.tasks){if(![...SKILLS,'reflection'].includes(task.id)||ids.has(task.id)||!Number.isInteger(task.minutes)||task.minutes<1||!Array.isArray(task.materialIds)||!task.materialIds.length||task.materialIds.length>30||task.materialIds.some(id=>!validId(id))||!['practice','assessment'].includes(task.mode)||typeof task.instructions!=='string'||task.instructions.length>5000)throw Error('已开始课程任务无效。');ids.add(task.id);}return clone(value);
  }
  function newState(){return{schema:1,revision:0,history:[],activePlanId:null,assignments:{},startedDays:[],frozenDays:{}};}
  function observationShape(value){
    plain(value,['schema','version','at','comparisons','fingerprint']);if(value.schema!==1||value.version!=='personalization-effects-v1'||!Number.isFinite(Date.parse(value.at))||new Date(value.at).toISOString()!==value.at||!Array.isArray(value.comparisons)||!value.comparisons.length||value.comparisons.length>2)throw Error('长期观察来源无效。');
    const skills=new Set();for(const c of value.comparisons){plain(c,['planId','skill','beforeIds','afterIds','beforeDays','afterDays','afterSpanDays','observedDays','beforeMean','afterMean','delta','interval','metric']);if(!validId(c.planId)||!SKILLS.includes(c.skill)||skills.has(c.skill)||!Number.isInteger(c.beforeDays)||c.beforeDays<3||!Number.isInteger(c.afterDays)||c.afterDays<3||!Number.isFinite(c.afterSpanDays)||c.afterSpanDays<7||!Number.isFinite(c.observedDays)||c.observedDays<14||!Number.isFinite(c.beforeMean)||c.beforeMean<0||c.beforeMean>1||!Number.isFinite(c.afterMean)||c.afterMean<0||c.afterMean>1||!Number.isFinite(c.delta)||c.delta>=0||c.delta< -1||!Array.isArray(c.interval)||c.interval.length!==2||c.interval.some(n=>!Number.isFinite(n)||n< -1||n>1)||c.interval[0]>c.interval[1]||c.interval[1]>=0||typeof c.metric!=='string'||!c.metric||c.metric.length>80)throw Error('长期下降观察缺少充分的同层新材料证据。');skills.add(c.skill);for(const ids of [c.beforeIds,c.afterIds])if(!Array.isArray(ids)||ids.length<6||ids.length>120||new Set(ids).size!==ids.length||ids.some(id=>!validId(id)))throw Error('长期观察的原作品引用无效。');if(c.beforeIds.some(id=>c.afterIds.includes(id)))throw Error('前后观察不能重复使用同一作品。');}
    const clean={schema:1,version:value.version,at:value.at,comparisons:clone(value.comparisons)},fingerprint=hash(JSON.stringify(clean));if(value.fingerprint!==fingerprint)throw Error('长期观察摘要校验不一致。');return{...clean,fingerprint};
  }
  function createObservation(value){const out={schema:1,version:'personalization-effects-v1',at:value.at,comparisons:clone(value.comparisons)};return observationShape({...out,fingerprint:hash(JSON.stringify(out))});}
  function interventionSignature(proposal){const p=proposalShape(proposal),clean=s=>String(s).normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu,'');return JSON.stringify([p.prioritySkills.slice().sort(),p.strategies.map(v=>[v.skill,clean(v.action)]).sort((a,b)=>a[0].localeCompare(b[0])),p.reinforcementMaterialIds.slice().sort()]);}
  function parseState(value){
    if(typeof value==='string'){if(value.length>8*1024*1024)throw Error('个性化计划备份过大。');value=JSON.parse(value);}
    plain(value,['schema','revision','history','activePlanId','assignments','startedDays','frozenDays']);
    if(value.schema!==1||!Number.isInteger(value.revision)||value.revision<0||value.revision>1000000||!Array.isArray(value.history)||value.history.length>1000||!Array.isArray(value.startedDays)||value.startedDays.length>365||new Set(value.startedDays).size!==value.startedDays.length||value.startedDays.some(n=>!validDay(n)))throw Error('个性化计划记录无效。');
    const out=newState();out.revision=value.revision;out.startedDays=value.startedDays.slice().sort((a,b)=>a-b);const ids=new Set();
    out.history=value.history.map(plan=>{plain(plan,['id','sourceDay','recapToken','at','proposal','targetDays','policyVersion','observation']);if((plan.policyVersion!==undefined&&![1,2].includes(plan.policyVersion))||!validId(plan.id)||ids.has(plan.id)||!validDay(plan.sourceDay)||typeof plan.recapToken!=='string'||!plan.recapToken||plan.recapToken.length>240||typeof plan.at!=='string'||!Number.isFinite(Date.parse(plan.at))||new Date(plan.at).toISOString()!==plan.at||!Array.isArray(plan.targetDays)||plan.targetDays.length>365||new Set(plan.targetDays).size!==plan.targetDays.length||plan.targetDays.some(d=>!validDay(d)||d<=plan.sourceDay))throw Error('个性化调整来源无效。');ids.add(plan.id);return{...plan,proposal:proposalShape(plan.proposal),targetDays:plan.targetDays.slice(),...(plan.observation?{observation:observationShape(plan.observation)}:{})};});
    for(const plan of out.history)for(const c of plan.observation?.comparisons||[])if(c.planId===plan.id||!ids.has(c.planId))throw Error('长期观察缺少原干预来源。');
    if(value.activePlanId!==null&&!ids.has(value.activePlanId)||value.history.length&&!value.activePlanId)throw Error('个性化当前计划引用无效。');out.activePlanId=value.activePlanId;
    if(!value.assignments||typeof value.assignments!=='object'||Array.isArray(value.assignments)||Object.keys(value.assignments).length>365)throw Error('个性化排课引用无效。');
    for(const [day,id]of Object.entries(value.assignments)){const n=Number(day),plan=out.history.find(p=>p.id===id);if(!validDay(n)||String(n)!==day||!plan||!plan.targetDays.includes(n)||!out.startedDays.includes(n)&&id!==out.activePlanId)throw Error('个性化排课缺少来源或试图恢复已替换的调整。');out.assignments[day]=id;}
    if(value.frozenDays!==undefined){if(!value.frozenDays||typeof value.frozenDays!=='object'||Array.isArray(value.frozenDays)||Object.keys(value.frozenDays).length>365)throw Error('固定课程集合无效。');for(const [day,snapshot]of Object.entries(value.frozenDays)){if(!validDay(Number(day))||String(Number(day))!==day||!out.startedDays.includes(Number(day)))throw Error('固定课程缺少已开始记录。');out.frozenDays[day]=frozenDay(snapshot,Number(day));}}
    return out;
  }
  function mergeStates(left,right){
    const a=parseState(left),b=parseState(right),out=newState(),plans=new Map(a.history.map(p=>[p.id,p]));
    for(const p of b.history){if(plans.has(p.id)&&JSON.stringify(plans.get(p.id))!==JSON.stringify(p))throw Error('同一个性化调整存在不同版本，原记录已保留。');plans.set(p.id,p);}
    out.history=[...plans.values()].sort((x,y)=>x.at.localeCompare(y.at)||x.id.localeCompare(y.id));out.startedDays=[...new Set([...a.startedDays,...b.startedDays])].sort((x,y)=>x-y);out.revision=Math.max(a.revision,b.revision);
    const active=[a.activePlanId,b.activePlanId].filter(Boolean).map(id=>plans.get(id)).sort((x,y)=>y.at.localeCompare(x.at)||y.id.localeCompare(x.id))[0];out.activePlanId=active?.id||null;
    for(const day of out.startedDays){const x=a.assignments[day],y=b.assignments[day],startedA=a.startedDays.includes(day),startedB=b.startedDays.includes(day);if(startedA&&startedB&&x!==y)throw Error('已开始的课程日存在不同个性化安排，请保留两份备份。');const frozen=startedA?x:y;if(frozen)out.assignments[day]=frozen;}
    for(const day of out.startedDays){const x=a.frozenDays[day],y=b.frozenDays[day];if(x&&y&&JSON.stringify(x)!==JSON.stringify(y))throw Error('已开始的课程材料不同，原备份已保留。');if(x||y)out.frozenDays[day]=clone(x||y);}
    for(const day of active?.targetDays||[])if(!out.startedDays.includes(day))out.assignments[day]=active.id;
    return parseState(out);
  }
  function constraints(options={}){
    const out=new Set((options.startedDays||[]).filter(validDay));
    if(Array.isArray(options.records))for(const item of options.records){
      for(const day of [item?.dayNumber,item?.courseDay])if(validDay(day))out.add(day);
      let answer=item?.answer;
      if(typeof answer==='string'){try{answer=JSON.parse(answer);}catch(_){answer=null;}}
      if(answer&&typeof answer==='object'&&!Array.isArray(answer)&&validDay(answer.courseDay))out.add(answer.courseDay);
    }
    if(Array.isArray(options.exposures))for(const item of options.exposures){const day=item?.dayNumber??item?.courseDay??item?.day;if(validDay(day))out.add(day);}
    else if(options.exposures&&typeof options.exposures==='object')for(const [key,item]of Object.entries(options.exposures)){const day=item?.dayNumber??item?.courseDay??item?.day??(/^\d+$/.test(key)?Number(key):null);if(validDay(day)&&item)out.add(day);}
    return out;
  }
  function regularDay(day,data){return Boolean(day?.day!==365&&day?.tasks?.length&&day.tasks.every(t=>t.mode!=='assessment'&&(t.materialIds||[]).every(id=>{const m=data.materials.find(m=>m.id===id);return m&&m.pool==='training'&&!m.fullTest&&!m.assessmentGroup&&!m.form;})));}
  function overlay(base,plan,data){
    const day=clone(base),proposal=normalizeProposal(plan.proposal,data,plan.sourceDay),priority=proposal.prioritySkills.filter(s=>day.tasks.some(t=>t.id===s));let transferred=0;const transferLimit=plan.policyVersion===2?(priority.length===1?60:90):30,donorLimit=plan.policyVersion===2?30:15;
    if(priority.length){const donors=day.tasks.filter(t=>SKILLS.includes(t.id)&&!priority.includes(t.id)).sort((a,b)=>b.minutes-a.minutes||a.id.localeCompare(b.id));const capacity=donors.reduce((n,t)=>n+Math.min(donorLimit,Math.max(0,t.minutes-15)),0);if(capacity>=Math.min(30,transferLimit)){for(const donor of donors){const amount=Math.min(donorLimit,donor.minutes-15,transferLimit-transferred);donor.minutes-=amount;transferred+=amount;if(transferred===transferLimit)break;}priority.forEach((skill,i)=>{day.tasks.find(t=>t.id===skill).minutes+=Math.floor(transferred/priority.length)+(i<transferred%priority.length?1:0);});}}
    for(const task of day.tasks){task.coreMaterialIds=task.materialIds.slice();const added=(day.week<=data.days.find(d=>d.day===plan.sourceDay).week+1?proposal.reinforcementMaterialIds:[]).filter(id=>data.materials.find(m=>m.id===id)?.skill===task.id&&!task.materialIds.includes(id));task.materialIds.push(...added);task.reinforcementMaterialIds=added;const strategy=proposal.strategies.find(s=>s.skill===task.id);if(strategy)task.adaptiveStrategy=strategy.action;}
    day.totalMinutes=day.tasks.reduce((n,t)=>n+t.minutes,0);if(day.totalMinutes!==360||day.tasks.some(t=>t.minutes<15))throw Error('建议分配无法保持360分钟总可用时间与安全分配。');
    day.adaptation={observationWindow:{startedAt:plan.at,until:new Date(Date.parse(plan.at)+14*86400000).toISOString(),rule:'同一重点、练法和补强材料在14天内不重复新建干预；未解错题和待评照常处理。'},...(plan.observation?{observation:clone(plan.observation)}:{}),planId:plan.id,sourceDay:plan.sourceDay,recapToken:plan.recapToken,reason:proposal.reason,prioritySkills:priority,strategies:clone(proposal.strategies),transferredMinutes:transferred,minutesAreSuggestions:true,disclaimer:'分钟仅为总可用时间内的建议分配；掌握按真实作答与评阅证据判断，不要求等待计时，不代表能力或考试成绩达标。'};return day;
  }
  function hash(value){let n=2166136261;for(const ch of String(value))n=Math.imul(n^ch.charCodeAt(0),16777619);return(n>>>0).toString(16).padStart(8,'0');}
  function createStore(options={}){
    const data=options.data||root.IELTSCurriculumData,storage=options.storage||root.IELTSProfiles?.storage()||root.localStorage,now=options.now||(()=>Date.now());if(!storage?.getItem||!storage?.setItem)throw Error('个性化计划存储不可用。');
    const currentProfile=options.getProfile||(options.storage?()=>options.profileId||'legacy':()=>root.IELTSProfiles?.current().id||'legacy'),captured=options.profileId||currentProfile();
    const check=()=>{if(currentProfile()!==captured)throw Error('学习档案已改变，请刷新后继续；旧计划不会写入新档案。');};
    function decode(raw){const value=raw===null?newState():parseState(raw);if(raw!==null&&!Object.prototype.hasOwnProperty.call(JSON.parse(raw),'frozenDays')){for(const day of value.startedDays){const legacy=root.IELTSLegacyDayPlans?.days?.[day];if(legacy&&!value.frozenDays[day]){const plan=value.history.find(p=>p.id===value.assignments[day]);value.frozenDays[day]=frozenDay(plan?overlay(legacy,plan,data):legacy,day);}}}return value;}
    const read=()=>{check();return decode(storage.getItem(KEY));};
    function write(change){check();const raw=storage.getItem(KEY),state=decode(raw),result=change(state);const clean=parseState(state);if(storage.getItem(KEY)!==raw)throw Error('另一页面刚更新个性化计划，请重试。');check();storage.setItem(KEY,JSON.stringify(clean));return result;}
    function apply(dayNumber,proposal,context={}){
      const clean=normalizeProposal(proposal,data,dayNumber),observation=context.observation?observationShape(context.observation):null;if(typeof context.recapToken!=='string'||!context.recapToken||context.recapToken.length>240)throw Error('自动调整需要已完成复盘的来源标识。');
      return write(state=>{const locked=new Set([...state.startedDays,...constraints(context)]);state.startedDays=[...locked].sort((a,b)=>a-b);const prior=state.history.find(p=>p.sourceDay===dayNumber&&p.recapToken===context.recapToken&&JSON.stringify(p.proposal)===JSON.stringify(clean));if(prior)return{applied:false,duplicate:true,plan:clone(prior),targetDays:prior.targetDays.slice()};
        const active=state.history.find(p=>p.id===state.activePlanId),riskIds=new Set(context.riskRecordIds||[]),newRisk=active&&(context.records||[]).some(r=>riskIds.has(r?.id)&&Date.parse(r.submittedAt)>Date.parse(active.at)&&['revise','pending'].includes(r.evaluation?.result)&&r.source!=='legacy-import'&&['objective','ai','none'].includes(r.evaluation?.method));
        if(active&&!observation&&!newRisk&&now()-Date.parse(active.at)<14*86400000&&interventionSignature(active.proposal)===interventionSignature(clean))return{applied:false,observing:true,plan:clone(active),targetDays:active.targetDays.slice(),observeUntil:new Date(Date.parse(active.at)+14*86400000).toISOString(),reason:'同一重点和练法保留14天观察窗口；本日复盘与未解错误仍各自保存、处理，不重复建立干预。'};
        if(state.history.length>=1000)throw Error('个性化计划历史已达上限，请先备份。');const targets=data.days.filter(d=>d.day>dayNumber&&!locked.has(d.day)&&regularDay(d,data)).map(d=>d.day);state.revision++;const plan={id:'adaptive-'+dayNumber+'-'+state.revision+'-'+hash(context.recapToken+JSON.stringify(clean)),sourceDay:dayNumber,policyVersion:2,recapToken:context.recapToken,at:new Date(now()).toISOString(),proposal:clean,targetDays:targets,...(observation?{observation}:{})};
        for(const key of Object.keys(state.assignments))if(!locked.has(Number(key)))delete state.assignments[key];state.history.push(plan);state.activePlanId=plan.id;for(const target of targets)state.assignments[target]=plan.id;return{applied:true,plan:clone(plan),targetDays:targets};});
    }
    function adoptStarted(context={}){return write(state=>{const locked=constraints(context),legacy=root.IELTSLegacyDayPlans;for(const day of locked){const old=state.startedDays.includes(day);if(!old)state.startedDays.push(day);if(state.frozenDays[day])continue;const sources=[...(context.records||[]),...(context.drafts||[])].filter(item=>[item?.courseDay,item?.dayNumber].includes(day)||(()=>{try{return JSON.parse(item?.answer)?.courseDay===day;}catch(_){return false;}})()),before=old||sources.some(item=>Date.parse(item.startedAt||item.submittedAt)<Date.parse(legacy?.capturedAt)),base=before&&legacy?.days?.[day]||data.days.find(d=>d.day===day);if(base){const plan=state.history.find(p=>p.id===state.assignments[day]);state.frozenDays[day]=frozenDay(plan&&regularDay(base,data)?overlay(base,plan,data):base,day);}}state.startedDays.sort((a,b)=>a-b);return state.startedDays.slice();});}
    function markStarted(dayNumber,snapshot){if(!validDay(dayNumber))throw Error('课程日无效。');const base=snapshot||data.days.find(d=>d.day===dayNumber),fixed=base?getDay(base):null;return write(state=>{if(!state.startedDays.includes(dayNumber)){state.startedDays.push(dayNumber);state.startedDays.sort((a,b)=>a-b);state.revision++;}if(fixed&&!state.frozenDays[dayNumber])state.frozenDays[dayNumber]=frozenDay(fixed,dayNumber);return dayNumber;});}
    function getDay(baseDay){const state=read();if(state.frozenDays[baseDay.day])return clone(state.frozenDays[baseDay.day]);const id=state.assignments[baseDay.day],plan=state.history.find(p=>p.id===id),base=baseDay.adaptation?data.days.find(d=>d.day===baseDay.day)||baseDay:baseDay;return plan&&regularDay(base,data)?overlay(base,plan,data):clone(base);}
    return{read,apply,markStarted,adoptStarted,getDay,planRemaining:(day,records,proposal,context)=>planRemaining(day,records,proposal,{data,...context})};
  }
  function levelRank(value){const found=String(value||'').match(/A[012]|B[12]|C[12]/g)||[];return Math.max(-1,...found.map(v=>['A0','A1','A2','B1','B2','C1','C2'].indexOf(v)));}
  function verifiedRecord(record,material,now,context={}){
    if(!record||!material||context.blockedMaterialIds?.has(material.id)||material.source?.verification!=='reviewed'||record.materialId!==material.id||String(record.materialVersion)!==String(material.version)||record.kind==='correction'||assessment?.assistanceUsed(record))return false;
    const submitted=Date.parse(record.submittedAt||'');if(!Number.isFinite(submitted)||submitted>now+1000||!(record.activeSeconds>0||record.minutes>0))return false;let artifact=assessment?.decodeArtifact(record);if(!artifact&&material.skill==='vocabulary'){try{artifact=JSON.parse(record.answer);}catch(_){}}if(!artifact||artifact.interrupted)return false;
    if(['reading','grammar','listening'].includes(material.skill)){const grade=assessment.gradeMaterial(material,artifact.answers);return grade.allGradable&&grade.ratio===1&&(material.skill!=='listening'||artifact.audioAvailable===true&&artifact.audioCompleted===true&&artifact.transcriptViewed!==true);}
    if(material.skill==='vocabulary'){
      const vocabulary=root.IELTSVocabularyPractice||(typeof module==='object'&&module.exports?require('./vocabulary-practice.js'):null);let payload=artifact;
      if(payload.kind!=='vocabulary-three-modes'){try{payload=artifact.activity?.answer?JSON.parse(artifact.activity.answer):JSON.parse(artifact.text||'{}');}catch(_){return false;}}
      return vocabulary?.verifyTrainingArtifact?.(payload,material)?.mastered===true;
    }
    if(['writing','speaking'].includes(material.skill)){
      const review=assessment.decodeReview(record),original=assessment.normalizeAnswer(material.skill==='writing'?artifact.text:artifact.transcript),rounds=review?.rounds?.filter(r=>r.ok===true)||[];
      const grounded=review?.status==='complete'&&!review.requiresRetest&&rounds.length>=2&&new Set(rounds.map(r=>r.round)).size>=2&&original&&(!material.minWords||assessment.countWords(original)>=material.minWords)&&rounds.every(r=>r.levelCheck?.meetsGoal===true&&r.levelCheck.evidence?.some(e=>assessment.normalizeAnswer(e.quote)&&original.includes(assessment.normalizeAnswer(e.quote))));
      if(!grounded||record.evaluation?.method!=='ai'||record.evaluation.result!=='pass')return false;
      if(material.skill==='speaking'){
        if(material.rubric?.taskType==='foundation'||material.type==='foundation'){
          const p=review.pronunciationSource,reference=artifact.transcript,ids=(record.media||[]).map(m=>m.id);return Boolean(ids.length&&p?.provider==='ali'&&p.recordId===record.id&&p.completeCoverage===true&&typeof p.evidenceId==='string'&&p.evidenceId&&p.reference===reference&&Number.isFinite(p.durationSeconds)&&p.durationSeconds>0&&p.durationSeconds<=180&&Array.isArray(p.mediaIds)&&p.mediaIds.length===ids.length&&p.mediaIds.every((id,i)=>id===ids[i])&&Object.entries({accuracy:80,fluency:75,completeness:90}).every(([key,min])=>typeof p.result?.[key]==='number'&&Number.isFinite(p.result[key])&&p.result[key]>=min&&p.result[key]<=100));
        }
        const source=review.audioSource;if(!(record.media?.length>0&&review.audioAnalysisEvidence===true&&source?.recordId===record.id&&source.completeCoverage===true&&source.mediaIds?.length===record.media.length&&source.mediaIds.every((id,i)=>id===record.media[i].id)&&Number.isFinite(source.durationSeconds)&&source.durationSeconds>0&&Array.isArray(source.segments)&&source.segments.length))return false;
        let cursor=0;for(const segment of source.segments){if(segment.audible!==true||!Number.isFinite(segment.startSeconds)||!Number.isFinite(segment.endSeconds)||Math.abs(segment.startSeconds-cursor)>.03||segment.endSeconds<=cursor||segment.endSeconds>source.durationSeconds+.03)return false;cursor=segment.endSeconds;}return Math.abs(cursor-source.durationSeconds)<=.05;
      }
      return true;
    }
    return false;
  }
  function planRemaining(dayInput,records,proposal,options={}){
    const data=options.data||root.IELTSCurriculumData,day=typeof dayInput==='number'?data?.days?.find(d=>d.day===dayInput):dayInput;if(!day||!validDay(day.day)||!Array.isArray(records)||!data?.materials)throw Error('追加学习需要课程日和真实作品记录。');
    const budget=options.budgetMinutes??360;if(!Number.isFinite(budget)||budget<0||budget>360)throw Error('每日总可用时间应为0–360分钟。');
    const now=typeof options.now==='number'?options.now:Date.now(),today=records.filter(r=>r?.dayNumber===day.day),spent=options.calendarBudget?.spentMinutes??today.reduce((n,r)=>n+(Number.isFinite(r.activeSeconds)&&r.activeSeconds>=0?r.activeSeconds/60:Number.isFinite(r.minutes)&&r.minutes>=0?r.minutes:0),0),remaining=Math.max(0,budget-spent),map=new Map(data.materials.map(m=>[m.id,m]));
    const clean=proposal?normalizeProposal(proposal,data,day.day):null,priority=clean?.prioritySkills||day.adaptation?.prioritySkills||SKILLS,latest=new Map();
    for(const record of today){const old=latest.get(record.materialId);if(!old||String(record.submittedAt)>String(old.submittedAt))latest.set(record.materialId,record);}
    const mistakes=options.mistakes||root.IELTSMistakes?.forDay(day.day)?.items||[],blockedMaterialIds=new Set([...(options.unresolvedMaterialIds||[]),...mistakes.filter(m=>m.status!=='passed').map(m=>m.materialId)]),proofContext={blockedMaterialIds};
    const verified=[...latest.values()].filter(r=>verifiedRecord(r,map.get(r.materialId),now,proofContext)),verifiedSkills=[...new Set(verified.map(r=>r.skill))],done=new Set(verified.map(r=>r.materialId)),core=new Set(day.tasks.flatMap(t=>t.materialIds||[]));
    const started=new Set(options.startedMaterialIds||[]),retained=[...started].filter(id=>map.has(id)&&!latest.has(id)).map(id=>({kind:'in-progress',materialId:id,skill:map.get(id).skill,estimatedMinutes:Number(map.get(id).estimatedMinutes)||15}));
    const reserve=[...core].filter(id=>!done.has(id)&&!started.has(id)).reduce((n,id)=>n+(Number(map.get(id)?.estimatedMinutes)||15),0)+retained.reduce((n,t)=>n+t.estimatedMinutes,0);let memoryReserve=0;try{const memory=root.IELTSMemory?.stats?.(root.IELTSMemory.read());memoryReserve=Math.min(remaining,Math.ceil((memory?.dueWords||0)*.5));}catch(_){}let room=Math.max(0,remaining-reserve-memoryReserve);
    const result={dayNumber:day.day,budgetMinutes:budget,spentMinutes:spent,remainingBudget:remaining,reservedCoreMinutes:reserve,reservedMemoryMinutes:memoryReserve,verifiedSkills,tasks:[],retained,estimatedMinutes:0,reason:'追加任务依据分科新题、延迟保持与先修关卡安排常规材料；分钟为估计，不是完成门槛。'};
    if(!regularDay(day,data)||remaining<=0){result.reason='测评／保留卷日保持原安排，或今天的总可用时间已用完。';return result;}
    const seen=id=>Boolean(options.exposures?.[id])||records.some(r=>r.materialId===id)||started.has(id),currentLevel=levelRank(options.level||data.weeks?.find(w=>w.week===day.week)?.level||day.tasks.flatMap(t=>t.materialIds).map(id=>map.get(id)?.level).join(' ')),limit=Math.min(6,Math.max(1,options.maxTasks||3));
    const year=root.IELTSYearPlanner||(typeof require==='function'?require('./year-planner.js'):null),route=year?.progression(data,records,{now,currentWeek:day.week,verifiedRecord,unresolvedMaterialIds:[...blockedMaterialIds]}),unlockedWeek=route?.unlockedWeek||day.week;result.progression=route;
    const explicit=new Set(clean?.reinforcementMaterialIds||[]),eligible=data.materials.filter(m=>eligibleMaterial(m,unlockedWeek)&&levelRank(m.level)>=0&&levelRank(m.level)<=currentLevel+(m.week>day.week&&unlockedWeek>day.week?1:0)&&!core.has(m.id)&&!started.has(m.id)&&(!seen(m.id)&&verifiedSkills.includes(m.skill)||seen(m.id)&&explicit.has(m.id)));
    eligible.sort((a,b)=>(priority.includes(a.skill)?priority.indexOf(a.skill):99)-(priority.includes(b.skill)?priority.indexOf(b.skill):99)||b.week-a.week||a.id.localeCompare(b.id));
    for(const m of eligible){const estimate=Number(m.estimatedMinutes);if(result.tasks.length>=limit)break;if(!Number.isFinite(estimate)||estimate<=0||estimate>room)continue;const repeated=seen(m.id);result.tasks.push({kind:repeated?'reinforcement':(m.week>day.week?'progression':'new-practice'),materialId:m.id,skill:m.skill,estimatedMinutes:estimate,unseen:!repeated,reason:repeated?'每日复盘明确安排的同级旧题补强，保留已见标记，不作为未见新题。':m.week>day.week?'分科延迟保持及前置关卡齐全，按先修顺序练习下一周常规新材料；不改动已开始日或保留卷。':'已有独立正确或真实评阅证据，增加同级未见材料。'});room-=estimate;result.estimatedMinutes+=estimate;}
    if(!result.tasks.length){const needs=[...latest.values()].filter(r=>!verifiedRecord(r,map.get(r.materialId),now,proofContext)).sort((a,b)=>String(b.submittedAt).localeCompare(String(a.submittedAt)));for(const record of needs){const m=map.get(record.materialId);if(!eligibleMaterial(m,day.week)||started.has(m.id))continue;const estimate=Math.min(10,Number(m.estimatedMinutes)||10);if(estimate>remaining)continue;result.tasks.push({kind:'verification',materialId:m.id,skill:m.skill,estimatedMinutes:estimate,questionIds:(m.questions||[]).slice(0,2).map(q=>q.id),unseen:false,reason:'完成很快仍需验证：先做无提示短复测；速度和自报通过不能用来升级。'});result.estimatedMinutes=estimate;break;}}
    return result;
  }
  let runtime=null;function store(){if(!runtime)runtime=createStore();return runtime;}
  const api=Object.freeze({KEY,SKILLS,newState,parseState,mergeStates,normalizeProposal,createObservation,observationShape,interventionSignature,promiseOfScore,eligibleMaterial,regularDay,createStore,verifiedRecord,planRemaining,apply:(...args)=>store().apply(...args),getDay:day=>store().getDay(day),markStarted:(day,snapshot)=>store().markStarted(day,snapshot),read:()=>store().read(),adoptStarted:context=>store().adoptStarted(context)});root.IELTSAdaptivePlan=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
