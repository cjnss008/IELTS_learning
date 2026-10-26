'use strict';
const LEVELS=['A0','A1','A2','B1','B2','C1'];
const DEFAULT={totalMinutes:360,contingencyStudyMinutes:15,focusMinutes:25,shortBreakMinutes:5,longBreakMinutes:15,cycles:4,estimateScale:1,vocabularyMinutesPerWord:4,grammarMinutesPerQuestion:1.5};
const words=x=>(String(x||'').match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]).length;
function level(v){const ranks=String(v||'').replace(/-/g,'–').split('–').map(x=>LEVELS.indexOf(x.trim()));return ranks.length&&ranks.every(x=>x>=0)?{low:Math.min(...ranks),high:Math.max(...ranks)}:null;}
function forecast(study,policy=DEFAULT){
 if(!Number.isFinite(study)||study<0)throw new RangeError('Study minutes must be finite and nonnegative');
 if(!policy||!Number.isFinite(policy.focusMinutes)||policy.focusMinutes<=0||!Number.isInteger(policy.cycles)||policy.cycles<=0||![policy.shortBreakMinutes,policy.longBreakMinutes].every(n=>Number.isFinite(n)&&n>=0))throw new RangeError('Invalid focus/rest/cycle policy');
 let left=study,rest=0,cycles=0;while(left>policy.focusMinutes+1e-8){left-=policy.focusMinutes;cycles++;rest+=cycles%policy.cycles===0?policy.longBreakMinutes:policy.shortBreakMinutes;}return{studyMinutes:study,breakMinutes:rest,totalMinutes:study+rest};
}
function estimate(material,policy=DEFAULT){
 if(!material||!Number.isFinite(material.estimatedMinutes)||material.estimatedMinutes<=0)return{known:false,minutes:null,reason:'missing-positive-material-duration'};
 // A timed complete paper is an indivisible assessment event, not an untimed
 // practice unit. Do not inflate it by two listens or per-question practice time.
 // Post-test correction is a separate evidence-triggered workload, never exam credit.
 if(material.fullTest)return{known:true,minutes:material.estimatedMinutes,declaredMinutes:material.estimatedMinutes,unitFloorMinutes:material.estimatedMinutes,basis:'authored complete timed assessment; no practice repetition during the paper; post-assessment correction must be admitted separately',calibrated:false,indivisibleAssessment:true};
 const q=material.questions?.length||0,w=material.vocabulary?.length||0,rank=level(material.level)?.low??0,readRate=[40,50,65,90,120,150][rank],outputRate=[5,7,9,11,13,15][rank];let floor=0,basis='author estimate';
 if(material.skill==='vocabulary'){floor=w*policy.vocabularyMinutesPerWord+2;basis='word count × 4 minutes for three typed entries, three separately recorded attempts, three test modes and setup; service/error delay remains uncertain';}
 if(material.skill==='grammar'){floor=q*policy.grammarMinutesPerQuestion+9;basis='question count × 1.5 + 6 rule/source minutes + 3 independent transfer minutes';}
 if(material.skill==='reading'){floor=words(material.passage)/readRate+q*1.5+8;basis='source reading at conservative level rate + answer/evidence time + correction/summary';}
 if(material.skill==='listening'){if(!Number.isFinite(material.audioDurationSeconds)||material.audioDurationSeconds<=0)return{known:false,minutes:null,reason:'missing-positive-audio-duration',declaredMinutes:material.estimatedMinutes};floor=2*material.audioDurationSeconds/60+q*1.5+8;basis='two complete plays + questions + locating/correcting and retelling';}
 if(material.skill==='speaking'){floor=(material.minWords||30)/Math.max(30,outputRate*5)*2+18;basis='two output takes + preparation, replay and feedback; API waiting not measured';}
 if(material.skill==='writing'){floor=(material.minWords||12)/outputRate+24;basis='full required output at conservative level rate + planning, feedback and revision';}
 const minutes=Math.ceil(Math.max(material.estimatedMinutes,floor)*policy.estimateScale);return{known:true,minutes,declaredMinutes:material.estimatedMinutes,unitFloorMinutes:Math.ceil(floor),basis,calibrated:false};
}
function dayCost(day,map,policy=DEFAULT,extraStudy=0){const items=[],unknown=[];let study=extraStudy;for(const task of day.tasks||[])for(const id of task.materialIds||[]){const e=estimate(map.get(id),policy);items.push({taskId:task.id,materialId:id,...e});if(e.known)study+=e.minutes;else unknown.push({taskId:task.id,materialId:id,reason:e.reason});}const budget=forecast(study,policy);return{...budget,extraStudyMinutes:extraStudy,known:!unknown.length,unknown,items};}
module.exports={LEVELS,DEFAULT,words,level,forecast,estimate,dayCost};
