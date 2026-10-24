'use strict';
require('../assets/daily-plan-content.js');
const weeks = global.IELTSPlanContent.weeks;
const jobs=[];
const pad=n=>String(n).padStart(2,'0');
const level=w=>w===1?'A0':w<=8?'A1':w<=14?'A2':w<=20?'B1':w<=28?'B1–B2':'B2–C1';
const formats=['table','line','bar','pie','map','process','mixed'];
function add(id,week,skill,options={}){
 const full=!!options.fullTest;
 jobs.push({id,week,skill,level:level(week),topic:weeks[week-1].title,grammarFocus:weeks[week-1].grammarFocus,
  pool:'training',type:skill,fullTest:false,estimatedMinutes:skill==='reading'?30:skill==='listening'?25:skill==='writing'?40:20,
  minWords:skill==='reading'?(full?2150:week<=2?45:week<=8?80:week<=20?220:550):skill==='listening'?(full?1500:week<=2?35:week<=8?65:week<=20?180:250):0,
  maxWords:skill==='reading'?(full?2750:week<=2?90:week<=8?160:week<=20?350:800):skill==='listening'?(full?2400:week<=2?90:week<=8?140:week<=20?320:450):0,
  questionCount:['reading','listening'].includes(skill)?(full?40:week<=8?8:10):0,...options});
}
for(let w=1;w<=36;w++){
 const n=w<=8?6:w<=20?4:3;
 for(let i=1;i<=n;i++)add(`w${pad(w)}-read-${i}`,w,'reading');
 const l=w<=8?6:4;
 for(let i=1;i<=l;i++)add(`w${pad(w)}-listen-${i}`,w,'listening',{variant:i,type:w<=2?'sounds':i%4===0?'lecture':i%4===3?'academic-discussion':i%4===2?'directions':'dialogue'});
}
// Later weeks use their own focused texts. Existing IDs and reserved batteries stay intact.
for(let w=37;w<=52;w++){
 add(`w${pad(w)}-read-1`,w,'reading',{type:'critical-reading',minWords:280,maxWords:600,questionCount:8,lateFocused:true,lexicalTraining:true,requireAudioHash:true});
 add(`w${pad(w)}-listen-1`,w,'listening',{type:'academic-discussion',minWords:180,maxWords:450,questionCount:8,lateFocused:true,lexicalTraining:true,requireAudioHash:true});
}
for(const source of require('../curriculum/sources/jobs.json'))add(source.id,source.week,source.skill,source);
for(let i=1;i<=32;i++){
 const week=i<=16?20+i:i<=28?20+i:48+(i-28);
 add(`writing-task1-${pad(i)}`,week,'writing',{type:'academic_task1',figureType:formats[(i-1)%7],minWords:150,maxWords:210,estimatedMinutes:20});
 add(`writing-task2-${pad(i)}`,week,'writing',{type:'academic_task2',essayType:['opinion','discussion','advantages','problem-solution'][i%4],minWords:250,maxWords:330});
}
function battery(id,week,pool,form,fullTest){
 const common={assessmentGroup:id,pool,form,fullTest};
 add(id+'-reading',week,'reading',{...common,estimatedMinutes:fullTest?60:25,timeLimitSeconds:fullTest?3600:1500,questionCount:fullTest?40:week<=8?8:16});
 add(id+'-listening',week,'listening',{...common,estimatedMinutes:fullTest?35:20,timeLimitSeconds:fullTest?2100:1200,questionCount:fullTest?40:week<=8?8:16});
 if(fullTest){
  add(id+'-task1',week,'writing',{...common,type:'academic_task1',figureType:formats[(week+(form==='B'?2:0))%7],minWords:150,maxWords:210,estimatedMinutes:20});
  add(id+'-task2',week,'writing',{...common,type:'academic_task2',essayType:['opinion','discussion','advantages','problem-solution'][week%4],minWords:250,maxWords:330,estimatedMinutes:40});
 }
}
for(let w=37;w<=52;w++)battery((w<=48?'training-':'final-')+pad(w),w,w<=48?'training':'final','A',true);
for(let w=4;w<=48;w+=4)for(const form of ['A','B'])battery(`gate-${pad(w)}-${form}`,w,'gate',form,w>=24);
module.exports={jobs,weeks,level};
if(require.main===module)console.log(JSON.stringify({jobs:jobs.length,bySkill:jobs.reduce((a,j)=>(a[j.skill]=(a[j.skill]||0)+1,a),{}),fullTests:new Set(jobs.filter(j=>j.fullTest).map(j=>j.assessmentGroup)).size}));
