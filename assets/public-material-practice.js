(function(root,factory){'use strict';const api=factory(root);root.IELTSPublicMaterialPractice=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
const dependency=(name,file)=>root[name]||(typeof require==='function'?require(file):null);
const SKILLS=['listening','reading'],PHASES=['foundation','everyday','independent','academic','integration','verification'];
const clean=value=>String(value||'').toLowerCase().trim(),array=value=>Array.isArray(value)?value:[],unique=value=>[...new Set(value.filter(Boolean))];
function phaseForDay(day){return day<=28?'foundation':day<=84?'everyday':day<=168?'independent':day<=252?'academic':day<=330?'integration':'verification';}
function placementPhase(rank){return rank<=1?'foundation':rank===2?'everyday':rank===3?'independent':'academic';}
function artifact(record,assessment){try{return assessment?.decodeArtifact(record)||JSON.parse(record.answer);}catch(_){return null;}}
function groupOf(item,map,assessment){return item?.materialBinding?.material?.source?.exposureGroup||artifact(item,assessment)?.materialBinding?.material?.source?.exposureGroup||map.get(item?.materialId)?.source?.exposureGroup||null;}
function grammarTargets(materials){
 const tags=materials.flatMap(m=>[...array(m.grammarTags),...array(m.source?.grammarTags)]),named=materials.map(m=>[m.grammarFocus,m.grammar?.title].filter(Boolean).join(' ')).join(' ');
 const patterns=[[/\bbe\b|be动词|be 动词/i,'be-present'],[/现在进行|present continuous/i,'present-continuous'],[/一般现在|present simple/i,'present-simple'],[/一般过去|past simple/i,'past-simple'],[/现在完成进行|present perfect continuous/i,'present-perfect-continuous'],[/现在完成|present perfect/i,'present-perfect'],[/过去完成|past perfect/i,'past-perfect'],[/过去进行|past continuous/i,'past-continuous'],[/祈使|imperative/i,'imperatives'],[/位置介词|方位介词|place preposition/i,'place-prepositions'],[/频率副词|frequency adverb/i,'frequency-adverbs'],[/被动|passive/i,'passive-voice'],[/定语从句|relative clause/i,'relative-clauses'],[/条件|conditional|hypothetical/i,'hypothetical-conditions']];
 for(const [pattern,tag]of patterns)if(pattern.test(named))tags.push(tag);return unique(tags.map(clean));
}
function context(options={}){
 const data=options.data||{},day=options.day,records=array(options.records),drafts=array(options.drafts),map=new Map(array(data.materials).map(m=>[m.id,m])),A=options.assessment||dependency('IELTSAssessment','./assessment-core.js'),S=options.selector||dependency('IELTSPublicMaterialSelector','./public-material-selector.js');
 if(!day||!S)return{available:false,reason:'public-practice-context-unavailable'};
 const own=day.tasks.flatMap(t=>array(t.materialIds)).map(id=>map.get(id)).filter(Boolean),skillLevels={},levelBasis={},phaseBySkill={},capabilities=new Set(array(options.verifiedCapabilities));
 for(const skill of SKILLS){
  const placed=options.route?.skills?.[skill],placement=S.levelRange(placed?.level),range=placed?.verified===true&&placement?placement:null,courseRanges=own.filter(m=>m.skill===skill&&!m.source?.publicSourceId).map(m=>S.levelRange(m.level)).filter(Boolean),rank=range?.low??(courseRanges.length?Math.min(...courseRanges.map(r=>r.low)):-1);
  if(rank<0)continue;let ceiling=rank;skillLevels[skill]=S.LEVELS[rank];levelBasis[skill]=range?'verified-placement-skill; lower bound of any range':'current-actual-core-material lower bound; practice ceiling, not a capability certification';phaseBySkill[skill]=placementPhase(rank);
  const verified=new Map(),latest=new Map();for(const record of records){if(record.kind!=='original')continue;const old=latest.get(record.materialId);if(!old||String(record.submittedAt||record.createdAt||'')>=String(old.submittedAt||old.createdAt||''))latest.set(record.materialId,record);}
  for(const record of latest.values()){const snapshot=artifact(record,A)?.materialBinding?.material,m=snapshot||map.get(record.materialId);if(!m||m.skill!==skill||m.source?.publicSourceId||m.pool!=='training'||m.fullTest||m.independentBank||m.assessmentGroup||m.form)continue;let valid=false;try{valid=options.verifiedRecord?.(record,m,options.now??Date.now(),{})===true;}catch(_){}if(valid)verified.set(m.id,m);}
  // Placement is an entry point. Later bound, unaided works may raise the
  // ceiling for ordinary practice within the normally unlocked course. This
  // limited admission rule never changes the verified placement or CEFR.
  if(range&&courseRanges.length){
   const year=options.yearPlanner||dependency('IELTSYearPlanner','./year-planner.js');let unlocked=options.route?.startWeek||1;
   try{unlocked=year?.progression(data,records,{placement:{currentRoute:()=>options.route||null},currentWeek:unlocked,verifiedRecord:options.verifiedRecord,now:options.now??Date.now()})?.unlockedWeek||unlocked;}catch(_){}
   const proofs=[];for(const record of latest.values()){const a=artifact(record,A),m=a?.materialBinding?.material;if(!m||!verified.has(m.id)||!Number.isInteger(m.week)||m.week<1||m.week>unlocked||m.week>day.week||record.exposure!=='unseen'||a.exposureAtStart!=='unseen'||a.interrupted||A?.assistanceUsed(record))continue;let bound=false;try{bound=A.resolveArtifactMaterial(m,a,record)?.valid===true;}catch(_){}if(!bound)continue;const t=Date.parse(record.submittedAt);if(Number.isFinite(t))proofs.push({id:m.id,rank:S.levelRange(m.level)?.low??-1,t});}
   const coreCeiling=Math.max(...courseRanges.map(r=>r.high));for(let candidate=rank+1;candidate<=coreCeiling;candidate++){const same=proofs.filter(p=>p.rank>=candidate);if(new Set(same.map(p=>p.id)).size>=2&&Math.max(...same.map(p=>p.t))-Math.min(...same.map(p=>p.t))>=48*3600000)ceiling=candidate;}
   if(ceiling>rank){skillLevels[skill]=S.LEVELS[ceiling];levelBasis[skill]='later bound nonpublic unaided works, delayed retention and normally unlocked core; ordinary practice ceiling only, not CEFR certification';phaseBySkill[skill]=placementPhase(ceiling);}
  }
  // These are conservative prerequisites for ordinary practice only. Two
  // distinct complete unaided original works do not certify a CEFR or Band.
  for(const [name,minimum]of [['foundation',0],['everyday',1],['independent',3]]){
   const evidenced=[...verified.values()].filter(m=>(S.levelRange(m.level)?.low??-1)>=minimum).length>=2;
   if(range&&rank>=minimum||evidenced)capabilities.add(name+':'+skill);
  }
 }
 const seen=new Set(array(options.seenSourceGroups));
 for(const id of Object.keys(options.exposures||{})){const group=map.get(id)?.source?.exposureGroup;if(group)seen.add(group);}
 for(const item of [...records,...drafts]){const group=groupOf(item,map,A);if(group)seen.add(group);}
 const current=map.get(options.currentMaterialId),currentGroup=current?.source?.exposureGroup;if(currentGroup)seen.add(currentGroup);
 const targetWords=unique(own.flatMap(m=>array(m.vocabulary).map(v=>typeof v==='string'?v:v.word)).map(clean)),weak=new Set(array(options.weakGrammarTags).map(clean));
 for(const record of records.filter(r=>r.dayNumber===day.day)){
  const m=map.get(record.materialId);if(!m||m.source?.publicSourceId)continue;const payload=artifact(record,A);let wrong=false;try{const grade=A?.gradeMaterialForArtifact?A.gradeMaterialForArtifact(m,payload):A?.gradeMaterial(m,payload?.answers||{});wrong=grade?.allGradable&&grade.answered===grade.total&&grade.correct<grade.total;}catch(_){}
  if(wrong)for(const tag of grammarTargets([m]))weak.add(tag);
 }
 return{available:true,skillLevels,levelBasis,phaseBySkill,calendarPhaseReference:phaseForDay(day.day),verifiedCapabilities:[...capabilities],weakGrammarTags:[...weak],currentGrammarTags:grammarTargets(own),currentTargetWords:targetWords,wordTargetBasis:'current actual course headwords; not assumed unknown or already known',seenSourceGroups:[...seen],sourceGroupsAreSharedAcrossModalities:true,notIndependentAssessmentEvidence:true};
}
function plan(options={}){
 const S=options.selector||dependency('IELTSPublicMaterialSelector','./public-material-selector.js'),pool=array(options.data?.materials).filter(m=>m.source?.publicSourceId),ctx=context({...options,selector:S}),selected=[],bySkill={};
 const result={status:'no-match',selected,bySkill,context:ctx,optional:true,required:false,persistentChanges:false,reason:pool.length?'no-appropriate-public-practice':'public-practice-pool-unavailable'};
 if(!ctx.available||!pool.length)return result;
 if(options.courseComplete===true){result.reason='completed-course-day-is-frozen';return result;}
 if(options.budget?.dayEnded||options.budget?.exhausted||options.budget?.budgetError){result.reason='calendar-budget-not-open-for-new-practice';return result;}
 const remaining=Number(options.budget?.remainingMinutes),core=Number(options.coreReserveMinutes??0),due=Number(options.dueReviewMinutes);
 if(!Number.isFinite(remaining)||!Number.isFinite(core)||core<0||!Number.isFinite(due)||due<0){result.reason='actual-core-or-review-budget-unavailable';return result;}
 const seen=new Set(ctx.seenSourceGroups),estimates=options.durationEstimates||{};
 let available=Math.max(0,remaining-core),reservedDue=due,reservedBreak=Number(options.breakReserveMinutes??10);
 for(const skill of SKILLS){
  const picked=S.plan(pool,{skill,mode:'practice',phaseId:ctx.phaseBySkill[skill],skillLevels:ctx.skillLevels,verifiedCapabilities:ctx.verifiedCapabilities,weakGrammarTags:ctx.weakGrammarTags,currentGrammarTags:ctx.currentGrammarTags,currentWordGaps:ctx.currentTargetWords,seenSourceGroups:[...seen],remainingMinutes:available,dueReviewMinutes:reservedDue,breakReserveMinutes:reservedBreak,durationEstimates:estimates,knownHeadwords:options.knownHeadwords,knownHeadwordsEvidence:options.knownHeadwordsEvidence,limit:1});bySkill[skill]=picked;
  for(const entry of picked.selected){selected.push({...entry,kind:'public-practice',optional:true,required:false,wordTargetBasis:ctx.wordTargetBasis,levelBasis:ctx.levelBasis[skill],strategy:'这是可选补充练习，先完成到期复习与当前核心任务。'+(skill==='listening'?'先听原声再答题，需要时再打开转写。官方同页原声与文本配对，尚未独立听审。':'先独立阅读并答题，再对照原文依据订正。')+'同文听读共用曝光记录，结果只记录练习表现。',reason:'匹配当前'+(skill==='reading'?'阅读':'听力')+'练习上限、先修证据及本课语法／词目标；已为未完核心、到期复习和休息留出预算。'});seen.add(entry.sourceExposureGroup);available=Math.max(0,available-entry.estimatedMinutes);}
 }
 result.status=selected.length?'selected':'no-match';result.reason=selected.length?'optional-practice-after-core-and-due-review':'no-appropriate-public-practice';result.reserved={currentCoreMinutes:core,dueReviewMinutes:reservedDue,breakReserveMinutes:reservedBreak};return result;
}
return Object.freeze({SKILLS,PHASES,phaseForDay,grammarTargets,context,plan});
});
