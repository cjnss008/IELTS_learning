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
  function eligibleMaterial(material,week){return Boolean(material&&!material.source?.publicSourceId&&material.pool==='training'&&!material.fullTest&&!material.assessmentGroup&&!material.form&&SKILLS.includes(material.skill)&&Number.isInteger(material.week)&&material.week<=week&&material.source?.verification==='reviewed');}
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
    for(const item of [...(Array.isArray(options.records)?options.records:[]),...(Array.isArray(options.drafts)?options.drafts:[])]){
      for(const day of [item?.dayNumber,item?.courseDay])if(validDay(day))out.add(day);
      let answer=item?.answer;
      if(typeof answer==='string'){try{answer=JSON.parse(answer);}catch(_){answer=null;}}
      if(answer&&typeof answer==='object'&&!Array.isArray(answer)&&validDay(answer.courseDay))out.add(answer.courseDay);
    }
    if(Array.isArray(options.exposures))for(const item of options.exposures){const day=item?.dayNumber??item?.courseDay??item?.day;if(validDay(day))out.add(day);}
    else if(options.exposures&&typeof options.exposures==='object')for(const [key,item]of Object.entries(options.exposures)){const day=item?.dayNumber??item?.courseDay??item?.day??(/^\d+$/.test(key)?Number(key):null);if(validDay(day)&&item)out.add(day);for(const n of item?.courseDays||[])if(validDay(n))out.add(n);}
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
  function publicContract(assignment){return Object.fromEntries(['assignmentId','day','taskId','skill','materialId','materialVersion','materialContentHash','sourceId','sourceTextSha256','exposureGroup','mode','required','role'].filter(key=>assignment[key]!==undefined).map(key=>[key,clone(assignment[key])]));}
  function publicMaterialStatus(material,contract,day){
    const failed=reason=>({allowed:false,required:!!contract,reason});
    if(!contract||!material||day<2||day>364||contract.day!==day||contract.required!==true||contract.mode!=='practice'||contract.role!=='contextual-public-course'||!['reading','listening'].includes(contract.skill)||contract.taskId!==contract.skill||material.skill!==contract.skill||material.id!==contract.materialId)return failed('公开材料不属于本日已核对的普通听读任务。');
    const s=material.source||{};
    if(material.pool!=='training'||material.fullTest||material.independentBank||material.assessmentGroup||material.form||s.practiceOnly!==true||s.verification!=='reviewed'||s.independentAssessmentEligible!==false||s.independentTransferEligible!==false||s.publicSourceId!==contract.sourceId||s.exposureGroup!==contract.exposureGroup||contract.exposureGroup!=='public-source:'+contract.sourceId||String(material.version)!==String(contract.materialVersion))return failed('公开材料的来源、版本或普通练习范围已变化。');
    const body=material.skill==='listening'?material.transcript:material.passage;
    try{if(assessment.materialContentHash(material)!==contract.materialContentHash||assessment.sourceTextHash(body)!==contract.sourceTextSha256||s.sourceTextSha256!==contract.sourceTextSha256)return failed('公开材料的正文或题目指纹已变化；原稿保留，请更新课程后继续。');}catch(_){return failed('公开材料的正文或题目指纹无法核验。');}
    if(material.skill==='listening'&&(!material.audio||s.audioReadiness?.eligibleForPractice!==true||s.audioReadiness?.reasons?.length))return failed('本日原声尚未通过常规练习使用核对。');
    return{allowed:true,required:true,contract:publicContract(contract)};
  }
  function validDayBinding(binding,number){
    if(!binding||binding.schema!==1||!binding.day||binding.day.day!==number||number<2||number>364||typeof binding.contentHash!=='string')return null;
    try{const day=frozenDay(binding.day,number);return assessment.materialContentHash(day)===binding.contentHash?day:null;}catch(_){return null;}
  }
  function createStore(options={}){
    const data=options.data||root.IELTSCurriculumData,storage=options.storage||root.IELTSProfiles?.storage()||root.localStorage,now=options.now||(()=>Date.now());if(!storage?.getItem||!storage?.setItem)throw Error('个性化计划存储不可用。');
    const currentProfile=options.getProfile||(options.storage?()=>options.profileId||'legacy':()=>root.IELTSProfiles?.current().id||'legacy'),captured=options.profileId||currentProfile();
    let contextReady=options.contextReady===true,contextRecords=[],contextDrafts=[],contextRevision=0,contextSignature='',publicCache=null,staticValidation=null,preparation=null,prepareSequence=0,decodedRaw,decodedState,descriptorCache=null,grammarContextCache=null;
    const projectionPending=new Map(),publicListeners=new Set(),admissionCache=new Map();
    const check=()=>{if(currentProfile()!==captured)throw Error('学习档案已改变，请刷新后继续；旧计划不会写入新档案。');};
    function decode(raw){const value=raw===null?newState():parseState(raw);if(raw!==null&&!Object.prototype.hasOwnProperty.call(JSON.parse(raw),'frozenDays')){for(const day of value.startedDays){const legacy=root.IELTSLegacyDayPlans?.days?.[day];if(legacy&&!value.frozenDays[day]){const plan=value.history.find(p=>p.id===value.assignments[day]);value.frozenDays[day]=frozenDay(plan?overlay(legacy,plan,data):legacy,day);}}}return value;}
    const readInternal=()=>{check();const raw=storage.getItem(KEY);if(raw!==decodedRaw||!decodedState){decodedRaw=raw;decodedState=decode(raw);}return decodedState;};
    const read=()=>clone(readInternal());
    function publicEngine(){if(options.publicCoursePlanner)return options.publicCoursePlanner;if(root.IELTSPublicCoursePlanner)return root.IELTSPublicCoursePlanner;if(typeof require==='function')try{return require('./public-course-planner.js');}catch(_){}return null;}
    function publicPlan(){return options.publicCoursePlan||data.publicCoursePlan||root.IELTSPublicCoursePlanData||null;}
    function publicRoute(){const p=options.placement||root.IELTSPlacement;return p?.currentRoute?.(data)||null;}
    function retained(state){return Object.values(state.frozenDays).flatMap(day=>day.publicCourse?.assignments||[]).map(a=>({...publicContract(a),status:'frozen-owner-day'}));}
    function notifyPublic(){for(const listener of publicListeners)try{listener();}catch(_){}root.dispatchEvent?.(typeof root.CustomEvent==='function'?new root.CustomEvent('ielts:public-course-plan-changed',{detail:{profileId:captured}}):{type:'ielts:public-course-plan-changed',detail:{profileId:captured}});}
    function workerRequest(request,job){
      if(typeof options.preparePublicCourse==='function')return Promise.resolve().then(()=>options.preparePublicCourse(request));
      if(typeof root.Worker!=='function')return Promise.reject(Error('后台排课组件不可用；原课表保留，可重试更新。'));
      return new Promise((resolve,reject)=>{let worker,timer;const finish=(error,value)=>{if(timer)clearTimeout(timer);worker?.terminate();error?reject(error):resolve(value);};job.cancel=()=>finish(Error('排课上下文已改变，旧计算已停止。'));try{worker=new root.Worker(options.publicCourseWorkerUrl||'assets/public-course-worker.js');worker.onmessage=event=>{if(event.data?.requestId===request.requestId)finish(null,event.data);};worker.onerror=event=>finish(Error(event.message||'后台排课未完成，请重试。'));timer=setTimeout(()=>finish(Error('后台排课未完成，原课表保留；请重试更新。')),45000);worker.postMessage(request);}catch(error){finish(error);}});
    }
    function workerProtocol(){return options.workerProtocol||root.IELTSPublicCourseWorkerProtocol||(typeof require==='function'?require('./public-course-worker.js'):null);}
    function scopeFor(descriptor){const profile=options.getProfileFence?.()||(options.storage?{id:captured}:root.IELTSProfiles?.current?.())||{id:captured},protocol=workerProtocol();return{profileFence:typeof profile==='string'?profile:String(profile.id||captured)+':'+String(profile.createdAt||''),generation:String(storage.getItem('ielts52-data-generation-v1')||'unversioned'),planHash:descriptor.base.planHash,dataContractHash:protocol?protocol.dataContractHash(descriptor.base):descriptor.engine.hash(descriptor.base.input),summaryHash:protocol?protocol.summaryHash(descriptor.replanOptions):descriptor.engine.hash(descriptor.replanOptions)};}
    function beginPreparation(descriptor){
      if(preparation?.key===descriptor.key)return preparation.promise;
      const protocol=workerProtocol();if(!protocol?.createRequest){const error='后台排课协议组件未加载，请刷新后重试。';preparation={key:descriptor.key,status:'public-course-prepare-failed',error,promise:Promise.resolve({valid:false,error})};return preparation.promise;}
      let request;try{request=protocol.createRequest({requestId:'public-prepare-'+(++prepareSequence),scope:scopeFor(descriptor),data,basePlan:descriptor.base,options:descriptor.replanOptions});}catch(error){preparation={key:descriptor.key,status:'public-course-prepare-failed',error:error.message,promise:Promise.resolve({valid:false,error:error.message})};return preparation.promise;}const old=preparation;
      const job={key:descriptor.key,requestId:request.requestId,scope:request.scope,data,base:descriptor.base,status:'preparing-public-course',error:null,promise:null};preparation=job;old?.cancel?.();
      job.promise=workerRequest(request,job).then(response=>{
        check();const current=describePublic(readInternal());
        const currentData=options.getData?.()||(options.data?data:root.IELTSCurriculumData);
        if(preparation!==job)return{stale:true};
        if(!current||current.pending||current.key!==job.key||current.base!==job.base||currentData!==job.data||JSON.stringify(scopeFor(current))!==JSON.stringify(job.scope))throw Error('学习档案或课程版本已更新，旧排课结果已丢弃。请刷新或重新更新后续课程。');
        if(response?.schema!==1||response.type!=='public-course-prepared'||response.requestId!==job.requestId||JSON.stringify(response.scope)!==JSON.stringify(job.scope)||response.ok!==true||response.plan?.valid!==true||response.plan.replanOf!==job.base.planHash||!Array.isArray(response.plan.assignments)||!response.plan.planHash)throw Error(response?.error?.message||response?.error||'后台排课返回的课程合同无法核验。');
        const {planHash,...body}=response.plan;if(descriptor.engine.hash(body)!==planHash)throw Error('后台排课结果指纹不一致。');
        publicCache={data,base:job.base,key:job.key,value:response.plan};projectionPending.clear();admissionCache.clear();job.status='ready';notifyPublic();return response.plan;
      }).catch(error=>{if(preparation===job){job.status='public-course-prepare-failed';job.error=error.message;notifyPublic();}return{valid:false,status:'public-course-prepare-failed',error:error.message};});
      return job.promise;
    }
    function describePublic(state){
      const base=publicPlan(),engine=publicEngine();if(!base)return null;
      if(!contextReady)return{pending:{status:'pending-profile-history',assignments:[],blocked:[{reason:'作品与草稿归属日尚未核对，先保留原课。'}]}};
      if(!engine?.validatePlan||!engine?.replan)return{pending:{status:'pending-planner-component',assignments:[],blocked:[{reason:'普通公开课程组件尚未就绪，原课保留。'}]}};
      let route;try{route=publicRoute();}catch(error){return{pending:{status:'pending-placement-verification',assignments:[],blocked:[{reason:error.message}]}};}
      const levels=Object.fromEntries(['reading','listening'].filter(skill=>route?.skills?.[skill]?.verified===true).map(skill=>[skill,route.skills[skill].level])),startDay=Math.max(2,Number(route?.startDay)||2),protectedDays=[...new Set([...state.startedDays,...Object.keys(state.frozenDays).map(Number)])].sort((a,b)=>a-b),kept=retained(state);
      const key=JSON.stringify([base.planHash,state.revision,protectedDays,kept.map(a=>[a.day,a.materialId,a.materialContentHash]),startDay,levels,contextRevision]);
      if(descriptorCache?.key===key&&descriptorCache.base===base&&descriptorCache.data===data)return descriptorCache.value;
      let capabilities=options.verifiedCapabilities?.()||[];
      if(!options.verifiedCapabilities){const practice=options.publicPractice||root.IELTSPublicMaterialPractice||(typeof require==='function'?require('./public-material-practice.js'):null),currentDay=data.days.find(d=>d.day===Math.max(2,startDay))||data.days[0];try{capabilities=practice?.context({data,day:currentDay,records:contextRecords,drafts:contextDrafts,route,assessment,verifiedRecord,now:now()})?.verifiedCapabilities||[];}catch(_){}}
      const seen=[...new Set(contextRecords.concat(contextDrafts).map(item=>{try{return assessment.decodeArtifact(item)?.materialBinding?.material?.source?.exposureGroup||item.materialBinding?.material?.source?.exposureGroup||data.materials.find(m=>m.id===item.materialId)?.source?.exposureGroup;}catch(_){return null;}}).filter(Boolean))];
      const common={assessment,materialContentHash:assessment?.materialContentHash,expandDay:root.IELTSCourseExpansion?.overlay||(typeof require==='function'?require('./course-expansion.js').overlay:null),sourceContexts:base.reference?.sourceContexts,entries:base.reference?.entryRanks};
      const affected=base.assignments.some(a=>protectedDays.includes(a.day)&&!kept.some(k=>k.day===a.day&&k.materialId===a.materialId&&k.materialContentHash===a.materialContentHash)),relocated=kept.some(k=>!base.assignments.some(a=>a.day===k.day&&a.materialId===k.materialId&&a.materialContentHash===k.materialContentHash)),routeChanges=startDay>2||base.assignments.some(a=>levelRank(levels[a.skill])>levelRank(data.materials.find(m=>m.id===a.materialId)?.level));
      const value={base,engine,key,common,needsReplan:affected||relocated||routeChanges,replanOptions:{protectedDays,retainedAssignments:kept,verifiedSkillLevels:levels,verifiedCapabilities:capabilities,seenSourceGroups:seen,startDay}};descriptorCache={key,base,data,value};return value;
    }
    function runtimePublic(state){
      const descriptor=describePublic(state);if(!descriptor)return null;if(descriptor.pending)return descriptor.pending;
      const {base,engine,key,common}=descriptor;
      if(publicCache?.data===data&&publicCache.base===base&&publicCache.key===key)return publicCache.value;
      if(descriptor.needsReplan&&options.synchronousPublicCourse!==true){beginPreparation(descriptor);return{status:preparation.status,assignments:[],blocked:[{reason:preparation.error||'正在后台更新后续听读课程。已有任务与草稿保留，更新完成前不固定临时课表。'}]};}
      if(!staticValidation||staticValidation.base!==base||staticValidation.hash!==base.planHash){staticValidation={base,hash:base.planHash,value:engine.validatePlan(base,data,common)};}
      let value;
      if(!staticValidation.value.valid)value={valid:false,status:'pending-plan-contract',assignments:[],blocked:staticValidation.value.reasons.map(reason=>({reason}))};
      else{
        value=descriptor.needsReplan?engine.replan(base,data,{...common,...descriptor.replanOptions}):base;
      }
      projectionPending.clear();admissionCache.clear();publicCache={data,base,key,value};return value;
    }
    function originalCompleted(occurrence){
      const material=data.materials.find(m=>m.id===occurrence.materialId);if(!material||assessment.materialContentHash(material)!==occurrence.materialContentHash)return false;
      const player=options.player||root.IELTSCoursePlayer;
      for(const record of contextRecords){if(record.kind!=='original'||record.materialId!==material.id||record.dayNumber!==occurrence.day)continue;try{
        if(!player?.bindingMatchesMaterial?.(record,material)||!player?.submissionSatisfied?.(record,material,{assessment}))continue;
        const corrected=(options.recordCorrectionStatus||root.IELTSMistakes?.recordCorrectionStatus)?.(record)?.corrected===true;
        const grade=assessment.gradeMaterialForArtifact(material,assessment.decodeArtifact(record));if(corrected||grade.allGradable&&grade.answered===grade.total&&grade.correct===grade.total)return true;
      }catch(_){} }return false;
    }
    function projectPublic(baseDay,state){
      if(baseDay.day<2||baseDay.day>364||!regularDay(baseDay,data))return baseDay;
      const plan=runtimePublic(state),assigned=(plan?.assignments||[]).filter(a=>a.day===baseDay.day);if(!assigned.length)return baseDay;
      const next=clone(baseDay),map=new Map(data.materials.map(m=>[m.id,m])),applied=[];
      const pending=reason=>{for(const a of assigned)projectionPending.set(a.assignmentId,{assignmentId:a.assignmentId,materialId:a.materialId,day:a.day,reason});return baseDay;};
      for(const assignment of assigned){
        const task=next.tasks.find(t=>t.id===assignment.taskId),material=map.get(assignment.materialId),status=publicMaterialStatus(material,assignment,next.day);
        if(!task||task.mode!=='practice'||!status.allowed||JSON.stringify(task.materialIds)!==JSON.stringify(assignment.taskMaterialIdsBefore))return pending(status.reason||'本日原任务合同已变化；新公开任务仍待重新安排。');
        const player=options.player||root.IELTSCoursePlayer||(typeof require==='function'?require('./course-player.js'):null),admissionKey=descriptorCache?.key+':'+assignment.assignmentId;
        let access=admissionCache.get(admissionKey);if(!access){try{const result=player?.publicPracticeAccess?.(material,baseDay,data,contextRecords,{assignment,route:publicRoute(),drafts:contextDrafts,assessment,verifiedRecord,now:now()});if(result){access={allowed:result.allowed,...(result.reason?{reason:result.reason}:{}),...(result.allowed?{admission:{schema:1,scope:'ordinary-practice-only',skillLevel:result.context.skillLevels[material.skill],levelBasis:result.context.levelBasis[material.skill],verifiedCapabilities:result.context.verifiedCapabilities.slice()}}:{})};admissionCache.set(admissionKey,access);}}catch(_){}}
        if(!access?.allowed)return pending(access?.reason||'本日公开听读的分项上限与先修尚未核对，保留原课程；开始原课后将在后续未开始日重新安排。');
        let remove=assignment.replaceMaterialIds||[],strategy=assignment.strategy;
        if(remove.length&&!assignment.replacementGuard?.preservedOccurrences?.every(originalCompleted)){
          const fallback=assignment.appendFallback;if(!fallback?.validatedAgainstAuthorReference||fallback.dayBudgetAfter?.totalMinutes>360||JSON.stringify(fallback.materialIdsBefore)!==JSON.stringify(task.materialIds))return pending('先前原稿完成证据不足，保留原任务；公开材料待找到安全预算槽。');
          remove=[];strategy='append-within-task-budget';
        }
        const ids=[...new Set(task.materialIds.filter(id=>!remove.includes(id)).concat(material.id))];
        task.materialIds=ids;task.coreMaterialIds=[...new Set((task.coreMaterialIds||assignment.taskMaterialIdsBefore).filter(id=>!remove.includes(id)).concat(material.id))];
        task.publicCourseAssignments=[...(task.publicCourseAssignments||[]),publicContract(assignment)];
        task.materialPractice=[...(task.materialPractice||[]).filter(p=>ids.includes(p.materialId)&&p.materialId!==material.id),{materialId:material.id,cycle:assignment.exposureIntent==='spaced-same-source-consolidation'?'scheduled-reuse':'first-planned',firstPlannedDay:assignment.day,publicPracticeOnly:true}];
        task.quantity=ids.reduce((n,id)=>n+(map.get(id)?.questions?.length||0),0);
        task.instructions+='\n\n本日听读任务：完成“'+material.title+'”的原始作答与订正；公开来源仅计普通练习，同文听读共享曝光，不作为独立晋级证据。';
        applied.push({...clone(assignment),effectiveStrategy:strategy,admission:clone(access.admission)});projectionPending.delete(assignment.assignmentId);
      }
      next.publicCourse={schema:1,planId:plan.id,version:plan.version,basePlanHash:publicPlan().planHash,planHash:plan.planHash,assignments:applied,integration:{readingListening:'required-ordinary-tasks',vocabularyGrammar:'pending-real-activities',reviews:'pending-real-submissions',masteryCredit:0}};
      return next;
    }
    function write(change){check();const raw=storage.getItem(KEY),state=decode(raw),result=change(state);const clean=parseState(state);if(storage.getItem(KEY)!==raw)throw Error('另一页面刚更新个性化计划，请重试。');check();storage.setItem(KEY,JSON.stringify(clean));return result;}
    function apply(dayNumber,proposal,context={}){
      const clean=normalizeProposal(proposal,data,dayNumber),observation=context.observation?observationShape(context.observation):null;if(typeof context.recapToken!=='string'||!context.recapToken||context.recapToken.length>240)throw Error('自动调整需要已完成复盘的来源标识。');
      return write(state=>{const locked=new Set([...state.startedDays,...constraints(context)]);state.startedDays=[...locked].sort((a,b)=>a-b);const prior=state.history.find(p=>p.sourceDay===dayNumber&&p.recapToken===context.recapToken&&JSON.stringify(p.proposal)===JSON.stringify(clean));if(prior)return{applied:false,duplicate:true,plan:clone(prior),targetDays:prior.targetDays.slice()};
        const active=state.history.find(p=>p.id===state.activePlanId),riskIds=new Set(context.riskRecordIds||[]),newRisk=active&&(context.records||[]).some(r=>riskIds.has(r?.id)&&Date.parse(r.submittedAt)>Date.parse(active.at)&&['revise','pending'].includes(r.evaluation?.result)&&r.source!=='legacy-import'&&['objective','ai','none'].includes(r.evaluation?.method));
        if(active&&!observation&&!newRisk&&now()-Date.parse(active.at)<14*86400000&&interventionSignature(active.proposal)===interventionSignature(clean))return{applied:false,observing:true,plan:clone(active),targetDays:active.targetDays.slice(),observeUntil:new Date(Date.parse(active.at)+14*86400000).toISOString(),reason:'同一重点和练法保留14天观察窗口；本日复盘与未解错误仍各自保存、处理，不重复建立干预。'};
        if(state.history.length>=1000)throw Error('个性化计划历史已达上限，请先备份。');const targets=data.days.filter(d=>d.day>dayNumber&&!locked.has(d.day)&&regularDay(d,data)).map(d=>d.day);state.revision++;const plan={id:'adaptive-'+dayNumber+'-'+state.revision+'-'+hash(context.recapToken+JSON.stringify(clean)),sourceDay:dayNumber,policyVersion:2,recapToken:context.recapToken,at:new Date(now()).toISOString(),proposal:clean,targetDays:targets,...(observation?{observation}:{})};
        for(const key of Object.keys(state.assignments))if(!locked.has(Number(key)))delete state.assignments[key];state.history.push(plan);state.activePlanId=plan.id;for(const target of targets)state.assignments[target]=plan.id;return{applied:true,plan:clone(plan),targetDays:targets};});
    }
    function adoptStarted(context={}){
      contextRecords=Array.isArray(context.records)?(root.IELTSFamilyLessonExpansionV95?.runtime?.()?.isCurrentFullRecords?.(context.records)===true?context.records:context.records.slice()):[];contextDrafts=Array.isArray(context.drafts)?context.drafts.slice():[];contextReady=true;
      const replacements=new Set((publicPlan()?.assignments||[]).flatMap(a=>(a.replacementGuard?.preservedOccurrences||[]).map(o=>o.materialId)));
      const semanticSources=new Set((options.contextPracticeCatalog||root.IELTSPublicContextPracticeData)?.packs?.map(p=>p.sourceId)||[]),semanticMaterials=new Set(data.materials.filter(m=>semanticSources.has(m.source?.publicSourceId)).map(m=>m.id)),correctionRelevant=r=>replacements.has(r.materialId)||semanticMaterials.has(r.materialId)||String(r.materialId||'').startsWith('context-grammar:');
      const correctionComplete=r=>{try{return Boolean((options.recordCorrectionStatus||root.IELTSMistakes?.recordCorrectionStatus)?.(r)?.corrected);}catch(_){return false;}};
      const signature=JSON.stringify([contextRecords.map(r=>[r.id,r.version,r.dayNumber,r.courseDay,r.materialId,r.submittedAt,replacements.has(r.materialId)?assessment.sourceTextHash(r.answer||''):null,correctionRelevant(r)?correctionComplete(r):null]),contextDrafts.map(d=>[d.id,d.courseDay,d.materialId,d.startedAt,d.materialBinding?.contentHash,d.dayPlanBinding?.contentHash]),context.exposures||null]);
      if(signature!==contextSignature){contextSignature=signature;contextRevision++;publicCache=null;projectionPending.clear();admissionCache.clear();}
      const grouped=new Map();for(const item of contextRecords.concat(contextDrafts)){const days=new Set([item.dayNumber,item.courseDay].filter(validDay));let artifact;try{artifact=typeof item.answer==='string'?JSON.parse(item.answer):item.answer;}catch(_){}if(validDay(artifact?.courseDay))days.add(artifact.courseDay);for(const n of days){const list=grouped.get(n)||[];list.push({item,artifact});grouped.set(n,list);}}
      return write(state=>{const locked=constraints(context),legacy=root.IELTSLegacyDayPlans;let changed=false;for(const day of locked){const old=state.startedDays.includes(day);if(!old){state.startedDays.push(day);changed=true;}if(state.frozenDays[day])continue;
        const sources=(grouped.get(day)||[]).sort((a,b)=>String(a.item.startedAt||a.item.submittedAt||'').localeCompare(String(b.item.startedAt||b.item.submittedAt||''))),first=sources[0],bound=first&&validDayBinding(first.item.dayPlanBinding||first.artifact?.dayPlanBinding,day);
        const before=old||sources.some(s=>Date.parse(s.item.startedAt||s.item.submittedAt)<Date.parse(legacy?.capturedAt)),base=bound||before&&legacy?.days?.[day]||data.days.find(d=>d.day===day);
        if(base){const plan=state.history.find(p=>p.id===state.assignments[day]);state.frozenDays[day]=frozenDay(!bound&&plan&&regularDay(base,data)?overlay(base,plan,data):base,day);changed=true;}}
        state.startedDays.sort((a,b)=>a-b);if(changed)state.revision++;return state.startedDays.slice();});
    }
    function markStarted(dayNumber,snapshot){
      if(!validDay(dayNumber))throw Error('课程日无效。');
      // The caller has just resolved this exact day. Resolving its snapshot a
      // second time could attach a newer expansion/plan while starting it.
      const base=data.days.find(d=>d.day===dayNumber),fixed=snapshot?frozenDay(snapshot,dayNumber):base?getDay(base):null;
      if(dayNumber===1&&fixed&&base&&assessment?.materialContentHash(fixed)!==assessment?.materialContentHash(getDay(base)))throw Error('第一课保留原任务；请从当前课程入口继续，原稿不会被改写。');
      return write(state=>{
        if(dayNumber>=2&&!state.startedDays.includes(dayNumber)&&publicPlan()){const publicStatus=runtimePublic(state);if(publicStatus&&!publicStatus.planHash)throw Error(publicStatus.blocked?.[0]?.reason||'后续听读课程正在更新，请稍后重试。');}
        const prior=state.frozenDays[dayNumber];
        if(prior&&fixed&&assessment?.materialContentHash(prior)!==assessment?.materialContentHash(fixed)){
          const flow=root.IELTSCourseExpansion||(typeof require==='function'?require('./course-expansion.js'):null),restored=flow?.restoreFamilyGrammarBase?.(fixed),projected=flow?.familyGrammarProjection?.(prior,data,familyGrammarOptions());
          if(!flow?.validFamilyGrammarProjection?.(fixed,data,{assessment})||assessment.materialContentHash(restored)!==assessment.materialContentHash(prior)||!projected||assessment.materialContentHash(projected)!==assessment.materialContentHash(fixed))throw Error('本日任务已由另一页面固定，请刷新课程后继续；已有原稿与草稿保留。');
        }
        if(!state.startedDays.includes(dayNumber)){state.startedDays.push(dayNumber);state.startedDays.sort((a,b)=>a-b);state.revision++;}
        if(fixed&&!prior)state.frozenDays[dayNumber]=frozenDay(fixed,dayNumber);
        return dayNumber;
      });
    }
    function withoutGrammarContext(baseDay,state){
      const expansion=root.IELTSCourseExpansion||(typeof require==='function'?require('./course-expansion.js'):null),expand=value=>expansion?.overlay(value,data)||value;
      if(state.frozenDays[baseDay.day])return clone(state.frozenDays[baseDay.day]);
      const id=state.assignments[baseDay.day],plan=state.history.find(p=>p.id===id),base=baseDay.adaptation?data.days.find(d=>d.day===baseDay.day)||baseDay:baseDay;
      if(state.startedDays.includes(baseDay.day)){
        const retained=root.IELTSLegacyDayPlans?.days?.[baseDay.day]||base;
        return plan&&regularDay(retained,data)?overlay(retained,plan,data):clone(retained);
      }
      const expanded=expand(clone(base)),integrated=projectPublic(expanded,state);
      return plan&&regularDay(integrated,data)?overlay(integrated,plan,data):integrated;
    }
    function grammarContextApi(){return options.contextPractice||root.IELTSPublicContextPractice||(typeof require==='function'?require('./public-context-practice.js'):null);}
    function grammarContextProjection(state){
      const api=grammarContextApi(),catalog=options.contextPracticeCatalog||root.IELTSPublicContextPracticeData,empty={schema:1,assignments:[],retained:[],accounting:[],pending:[],masteryCredit:0,independentEvidence:false};if(!contextReady||!api||catalog?.active!==true)return empty;
      const publicState=runtimePublic(state);if(publicPlan()&&!publicState?.planHash)return{...empty,pending:[{reason:'public-course-preparation-pending'}]};
      const timerState=options.timerState?.()||root.IELTSStudyTimer?.snapshot?.(),route=publicRoute(),key=JSON.stringify([state.revision,contextRevision,publicCache?.key,route?.startDay||2,timerState?.settings]);
      if(grammarContextCache?.catalog===catalog&&grammarContextCache.key===key&&(!grammarContextCache.nextAt||now()<grammarContextCache.nextAt))return grammarContextCache.value;
      const args={catalog,assessment,records:contextRecords,drafts:contextDrafts,protectedDays:state.startedDays,retainedAssignments:Object.values(state.frozenDays).flatMap(d=>d.publicContextPractice?.assignments||[]),now:now(),timerState,startDay:Math.max(2,route?.startDay||2),recordCorrectionStatus:options.recordCorrectionStatus||root.IELTSMistakes?.recordCorrectionStatus};
      const probe=api.plan(data,{...args,days:[]}),needsSlots=probe.accounting.some(r=>r.sourceEligible&&['awaiting-safe-budget-slot'].includes(r.study)||r.review==='awaiting-safe-budget-slot'),value=needsSlots?api.plan(data,{...args,days:data.days.map(d=>withoutGrammarContext(d,state))}):probe;
      const future=value.pending.map(p=>Date.parse(p.dueAt)).filter(t=>Number.isFinite(t)&&t>now());grammarContextCache={catalog,key,value,nextAt:future.length?Math.min(...future):null};return value;
    }
    function reusableSoundEvidence(record,material){const player=options.player||root.IELTSCoursePlayer||(typeof require==='function'?require('./course-player.js'):null);return verifiedRecord(record,material,now())&&player?.bindingMatchesMaterial?.(record,material,assessment)===true;}
    function familyGrammarOptions(){return{contextReady,records:contextRecords,drafts:contextDrafts,assessment,player:options.player||root.IELTSCoursePlayer,hub:options.hub||root.IELTSTodayHub,recordCorrectionStatus:options.recordCorrectionStatus||root.IELTSMistakes?.recordCorrectionStatus};}
    function getDay(baseDay){
      const state=readInternal(),day=withoutGrammarContext(baseDay,state),flow=root.IELTSCourseExpansion||(typeof require==='function'?require('./course-expansion.js'):null),family=value=>{const prior=flow?.familyGrammarProjection?.(value,data,familyGrammarOptions())||value;return root.IELTSFamilyLessonExpansionV95?.runtime?.().planDay(prior,data,{contextReady,records:contextRecords,drafts:contextDrafts,adaptiveState:state}).day||prior;};
      if(state.startedDays.includes(baseDay.day)||state.frozenDays[baseDay.day])return family(day);
      const api=grammarContextApi(),projected=api?.overlay?api.overlay(day,grammarContextProjection(state),{data,catalog:options.contextPracticeCatalog||root.IELTSPublicContextPracticeData,assessment,protectedDays:state.startedDays,records:contextRecords,drafts:contextDrafts}):day;
      return family(flow?.unstartedLessonFlow?.(projected,data,{contextReady,protectedDays:state.startedDays,records:contextRecords,drafts:contextDrafts,now:now(),verifiedRecord:reusableSoundEvidence})||projected);
    }
    function publicContextState(){return clone(grammarContextProjection(readInternal()));}
    function publicCourseState(){const state=readInternal(),plan=runtimePublic(state);return{available:!!publicPlan(),ready:!!plan?.planHash,status:plan?.status||'not-installed',planHash:plan?.planHash||null,assignedCount:plan?.assignments?.length||0,retainedCount:plan?.retainedAssignments?.length||0,pending:[...(plan?.blocked||[]),...projectionPending.values()].map(clone),exemptions:clone(plan?.exemptions||[]),integration:{readingListening:'ordinary-task-flow',vocabularyGrammar:'pending-real-activities',reviews:'pending-real-submissions',masteryCredit:0}};}
    function preparePublicCourse(config={}){if(config.retry===true&&preparation?.status==='public-course-prepare-failed')preparation=null;const current=runtimePublic(readInternal());return preparation?.status==='preparing-public-course'?preparation.promise:Promise.resolve(current);}
    return{read,apply,markStarted,adoptStarted,getDay,publicCourseState,publicContextState,preparePublicCourse,subscribePublicCourse(listener){publicListeners.add(listener);return()=>publicListeners.delete(listener);},planRemaining:(day,records,proposal,context)=>planRemaining(day,records,proposal,{data,...context})};
  }
  function levelRank(value){const found=String(value||'').match(/A[012]|B[12]|C[12]/g)||[];return Math.max(-1,...found.map(v=>['A0','A1','A2','B1','B2','C1','C2'].indexOf(v)));}
  function verifiedRecord(record,material,now,context={}){
    if(!record||!material||material.source?.publicSourceId||context.blockedMaterialIds?.has(material.id)||material.source?.verification!=='reviewed'||record.materialId!==material.id||String(record.materialVersion)!==String(material.version)||record.kind==='correction'||assessment?.assistanceUsed(record))return false;
    const submitted=Date.parse(record.submittedAt||'');if(!Number.isFinite(submitted)||submitted>now+1000||!(record.activeSeconds>0||record.minutes>0))return false;let artifact=assessment?.decodeArtifact(record);if(!artifact&&material.skill==='vocabulary'){try{artifact=JSON.parse(record.answer);}catch(_){}}if(!artifact||artifact.interrupted||Object.hasOwn(artifact,'lessonSupplement'))return false;
    if(['reading','grammar','listening'].includes(material.skill)){const grade=assessment.gradeMaterial(material,artifact.answers);return grade.allGradable&&grade.ratio===1&&(material.skill!=='listening'||artifact.audioAvailable===true&&artifact.audioCompleted===true&&artifact.transcriptViewed!==true);}
    if(material.skill==='vocabulary'){
      const vocabulary=root.IELTSVocabularyPractice||(typeof module==='object'&&module.exports?require('./vocabulary-practice.js'):null);let payload=artifact;
      if(payload.kind!=='vocabulary-three-modes'){try{payload=artifact.activity?.answer?JSON.parse(artifact.activity.answer):JSON.parse(artifact.text||'{}');}catch(_){return false;}}
      return vocabulary?.verifyTrainingArtifact?.(payload,material)?.mastered===true;
    }
    if(['writing','speaking'].includes(material.skill)){
      const review=assessment.decodeReview(record),original=assessment.normalizeAnswer(material.skill==='writing'?artifact.text:assessment.effectiveSpeakingTranscript(record)),rounds=review?.rounds?.filter(r=>r.ok===true)||[];
      const grounded=review?.status==='complete'&&!review.requiresRetest&&rounds.length>=2&&new Set(rounds.map(r=>r.round)).size>=2&&original&&(!material.minWords||assessment.countWords(original)>=material.minWords)&&rounds.every(r=>r.levelCheck?.meetsGoal===true&&r.levelCheck.evidence?.some(e=>assessment.normalizeAnswer(e.quote)&&original.includes(assessment.normalizeAnswer(e.quote))));
      if(!grounded||record.evaluation?.method!=='ai'||record.evaluation.result!=='pass')return false;
      if(material.skill==='speaking'){
        if(material.rubric?.taskType==='foundation'||material.type==='foundation'){
          const p=review.pronunciationSource,reference=assessment.effectiveSpeakingTranscript(record),ids=(record.media||[]).map(m=>m.id);return Boolean(ids.length&&p?.provider==='ali'&&p.recordId===record.id&&p.completeCoverage===true&&typeof p.evidenceId==='string'&&p.evidenceId&&p.reference===reference&&Number.isFinite(p.durationSeconds)&&p.durationSeconds>0&&p.durationSeconds<=180&&Array.isArray(p.mediaIds)&&p.mediaIds.length===ids.length&&p.mediaIds.every((id,i)=>id===ids[i])&&Object.entries({accuracy:80,fluency:75,completeness:90}).every(([key,min])=>typeof p.result?.[key]==='number'&&Number.isFinite(p.result[key])&&p.result[key]>=min&&p.result[key]<=100));
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
  const api=Object.freeze({KEY,SKILLS,newState,parseState,mergeStates,normalizeProposal,createObservation,observationShape,interventionSignature,promiseOfScore,eligibleMaterial,regularDay,createStore,verifiedRecord,publicContract,publicMaterialStatus,validDayBinding,planRemaining,apply:(...args)=>store().apply(...args),getDay:day=>store().getDay(day),markStarted:(day,snapshot)=>store().markStarted(day,snapshot),read:()=>store().read(),publicCourseState:()=>store().publicCourseState(),publicContextState:()=>store().publicContextState(),preparePublicCourse:config=>store().preparePublicCourse(config),subscribePublicCourse:listener=>store().subscribePublicCourse(listener),adoptStarted:context=>store().adoptStarted(context)});root.IELTSAdaptivePlan=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
