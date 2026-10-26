'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../assets/curriculum-data.js'),A=require('../assets/assessment-core.js'),P=require('../assets/course-player.js'),Adaptive=require('../assets/adaptive-plan.js'),Y=require('../assets/year-planner.js'),Compatibility=require('../assets/legacy-material-compatibility.js');
// Public v1 course material only. All records below are synthetic; no user data,
// real provider credentials or live assessment evidence is used by these tests.
const OLD_MATERIAL={
  "id": "w01-read-2",
  "week": 1,
  "skill": "reading",
  "level": "A0",
  "topic": "字母、声音与自我介绍",
  "grammarFocus": "人称代词 I / you；be 动词 am / are；句首大写与句号。",
  "pool": "training",
  "type": "reading",
  "fullTest": false,
  "estimatedMinutes": 30,
  "minWords": 45,
  "maxWords": 90,
  "questionCount": 8,
  "title": "My First English Class",
  "instructions": "阅读下面的短文，然后回答问题。所有题目都是单选题或填空题。填空题的答案必须来自短文，且不超过规定的字数。请仔细阅读短文，并在答案中引用原文。本材料为模拟教学材料，不是官方雅思考试。",
  "passage": "Hello. I am Li Ming. I am a student. You are Wang Fang. You are a student, too. We are in Room 5. We are friends. I am happy. You are happy, too. We are a good class. I am from China. You are from China, too. We are in a small room. The room is clean. I am ready for class. You are ready, too. We are a good team.",
  "transcript": "",
  "questions": [
    {
      "id": "q1",
      "type": "single",
      "prompt": "What does Li Ming say he is at school?",
      "options": [
        "学生",
        "老师",
        "医生"
      ],
      "answers": [
        "学生"
      ],
      "explanation": "开头直接说 I am a student.；朋友关系另有说明，不把两种关系混作互斥身份。",
      "evidence": "I am Li Ming. I am a student.",
      "originalPrompt": "Li Ming 介绍自己的学习身份是什么？",
      "optionsEnglish": [
        "Student",
        "Teacher",
        "Doctor"
      ],
      "presentation": {
        "version": "english-v69-1",
        "sourceHash": "85b11707754fae0d3a67b47b5b3a2b3cdd1e8a2bbb5b4be0994bfffd407b9394",
        "internalAnswerValuesUnchanged": true
      }
    },
    {
      "id": "q2",
      "type": "single",
      "prompt": "What is Wang Fang at school?",
      "options": [
        "学生",
        "老师",
        "医生"
      ],
      "answers": [
        "学生"
      ],
      "explanation": "原文直接说 You are a student, too.。",
      "evidence": "You are Wang Fang. You are a student, too.",
      "originalPrompt": "Wang Fang 的学习身份是什么？",
      "optionsEnglish": [
        "Student",
        "Teacher",
        "Doctor"
      ],
      "presentation": {
        "version": "english-v69-1",
        "sourceHash": "cfe449ccb675b1120ff05b57d3d662d14986af36fc61c068acbbce9c55ab359f",
        "internalAnswerValuesUnchanged": true
      }
    },
    {
      "id": "q3",
      "type": "single",
      "prompt": "Which room are the two people in?",
      "options": [
        "Room 5",
        "Room 4",
        "Room 6"
      ],
      "answers": [
        "Room 5"
      ],
      "explanation": "原文说明两人在 Room 5。",
      "evidence": "We are in Room 5.",
      "originalPrompt": "两人在哪一间教室？",
      "optionsEnglish": [
        "Room 5",
        "Room 4",
        "Room 6"
      ],
      "presentation": {
        "version": "english-v69-1",
        "sourceHash": "ce7a087b2d3717b954130636d420a1b09db5058bd17ceb6fdfbf331fd52df498",
        "internalAnswerValuesUnchanged": true
      }
    },
    {
      "id": "q4",
      "type": "single",
      "prompt": "What relationship does the text use for the two people?",
      "options": [
        "朋友",
        "家人",
        "邻居"
      ],
      "answers": [
        "朋友"
      ],
      "explanation": "原文说 We are friends.。",
      "evidence": "We are friends.",
      "originalPrompt": "原文明确用哪种关系称呼两人？",
      "optionsEnglish": [
        "Friend",
        "Family member",
        "Neighbor"
      ],
      "presentation": {
        "version": "english-v69-1",
        "sourceHash": "2d472347afad1b86d956a43305d120b843fc8cab5f27cae4886d505036c5287f",
        "internalAnswerValuesUnchanged": true
      }
    },
    {
      "id": "q5",
      "type": "single",
      "prompt": "How does Li Ming say he feels?",
      "options": [
        "开心",
        "伤心",
        "疲倦"
      ],
      "answers": [
        "开心"
      ],
      "explanation": "I am happy. 直接表达开心。",
      "evidence": "I am happy.",
      "originalPrompt": "Li Ming 说自己感觉怎样？",
      "optionsEnglish": [
        "Happy",
        "Sad",
        "Tired"
      ],
      "presentation": {
        "version": "english-v69-1",
        "sourceHash": "67d6df8443affa9a08c322793562a3f3b42b498e4867d8a4c0e3c6a69d93c9aa",
        "internalAnswerValuesUnchanged": true
      }
    },
    {
      "id": "q6",
      "type": "fill",
      "prompt": "Which country is Wang Fang from? Fill in one English word from the text.",
      "answers": [
        "China"
      ],
      "maxWords": 1,
      "explanation": "You are from China, too. 说明对方也来自中国。",
      "evidence": "You are from China, too.",
      "originalPrompt": "Wang Fang 来自哪个国家？从原文填一个英文词。",
      "presentation": {
        "version": "english-v69-1",
        "sourceHash": "3bcc96d3cf43e64946dd617ed1d763069645a01a9b0f18fe5f09c71c463d1558",
        "internalAnswerValuesUnchanged": true
      }
    },
    {
      "id": "q7",
      "type": "fill",
      "prompt": "What good thing does the last sentence say the two people are? Fill in one English word from the last sentence.",
      "answers": [
        "team"
      ],
      "maxWords": 1,
      "explanation": "限定最后一句，避免前文 good class 和结尾 good team 都能填入同一裸句。",
      "evidence": "We are a good team.",
      "originalPrompt": "原文最后一句把两人称为一个好的什么？从最后一句填一个英文词。",
      "presentation": {
        "version": "english-v69-1",
        "sourceHash": "6cbeb0a796836103a8916d2d3cd25697b6e6888df68bb6601cd9c5f40fcd6ee1",
        "internalAnswerValuesUnchanged": true
      }
    },
    {
      "id": "q8",
      "type": "single",
      "prompt": "How does the text describe the condition of the classroom?",
      "options": [
        "干净",
        "脏乱",
        "黑暗"
      ],
      "answers": [
        "干净"
      ],
      "explanation": "The room is clean. 明确说教室干净。",
      "evidence": "The room is clean.",
      "originalPrompt": "原文怎样描述教室的状态？",
      "optionsEnglish": [
        "Clean",
        "Dirty",
        "Dark"
      ],
      "presentation": {
        "version": "english-v69-1",
        "sourceHash": "6c7bf96c95c47ae52911feb300457b2d6a8a6ea875e1fc3612180dba03986ef2",
        "internalAnswerValuesUnchanged": true
      }
    }
  ],
  "vocabulary": [
    {
      "word": "hello",
      "meaning": "你好",
      "example": "Hello. I am Li Ming."
    },
    {
      "word": "student",
      "meaning": "学生",
      "example": "I am a student."
    },
    {
      "word": "friend",
      "meaning": "朋友",
      "example": "We are friends."
    },
    {
      "word": "happy",
      "meaning": "高兴的",
      "example": "I am happy."
    },
    {
      "word": "class",
      "meaning": "班级",
      "example": "We are a good class."
    },
    {
      "word": "room",
      "meaning": "房间",
      "example": "We are in Room 5."
    },
    {
      "word": "good",
      "meaning": "好的",
      "example": "We are a good class."
    },
    {
      "word": "too",
      "meaning": "也",
      "example": "You are a student, too."
    }
  ],
  "grammar": {
    "title": "人称代词与be动词",
    "explanation": "在英语中，人称代词I表示“我”，you表示“你”。be动词am用于I，are用于you。句首字母要大写，句末要有句号。例如：I am a student. You are a student.",
    "example": "I am a student. You are a student, too.",
    "questions": [
      {
        "id": "g1",
        "type": "single",
        "prompt": "______ am a student.",
        "options": [
          "I",
          "You",
          "We"
        ],
        "answers": [
          "I"
        ],
        "explanation": "主语是“我”，用I，且be动词是am，所以选I。",
        "evidence": "I am a student."
      },
      {
        "id": "g2",
        "type": "single",
        "prompt": "You ______ a student.",
        "options": [
          "am",
          "are",
          "is"
        ],
        "answers": [
          "are"
        ],
        "explanation": "主语是you，be动词用are。",
        "evidence": "You are a student, too."
      },
      {
        "id": "g3",
        "type": "single",
        "prompt": "______ are happy.",
        "options": [
          "I",
          "You",
          "He"
        ],
        "answers": [
          "You"
        ],
        "explanation": "主语是“你”，用you，且be动词是are，所以选You。",
        "evidence": "You are happy, too."
      },
      {
        "id": "g4",
        "type": "single",
        "prompt": "I ______ happy.",
        "options": [
          "am",
          "are",
          "is"
        ],
        "answers": [
          "am"
        ],
        "explanation": "主语是I，be动词用am。",
        "evidence": "I am happy."
      }
    ]
  },
  "transfer": {
    "speaking": {
      "part1": [
        "What is your name?",
        "Are you a student?",
        "Are you happy?",
        "Are you in Room 5?"
      ],
      "part2": "Describe yourself. You should say:",
      "part3": [
        "Are you a student?",
        "Are you happy?",
        "Are you in Room 5?",
        "Are you a friend?"
      ]
    },
    "writing": "Write 2-8 simple sentences about yourself. Use 'I am...' and 'You are...'. Example: I am Li Ming. I am a student. You are Wang Fang. You are a student, too."
  },
  "rubric": {
    "taskType": "reading"
  },
  "version": "1",
  "source": {
    "schemaVersion": 2,
    "kind": "original",
    "rights": "项目原创，AI辅助编写；模拟场景与数据",
    "verification": "reviewed",
    "method": "原材料曾做规则校验与AI解题核对；2026-10-24由Codex逐题对照本次改动的原文证据、题干泄答与选项同类性；未重跑独立AI盲解、未真人审题或难度标定。",
    "model": "deepseek-flash",
    "contentHash": "1c3eb81f7e8c7d4e1d21a506e164f2f7dbe478466286aa02a456e231e5463b86",
    "contentHashFields": [
      "title",
      "instructions",
      "passage",
      "transcript",
      "questions",
      "vocabulary",
      "grammar",
      "transfer",
      "rubric"
    ]
  },
  "audio": "",
  "audioVoice": "",
  "audioSynthetic": true
};
const NOW=Date.parse('2026-10-26T04:00:00.000Z'),CURRENT=D.materials.find(m=>m.id===OLD_MATERIAL.id),REGISTRATION=Compatibility.reviewedRevisions.entries[OLD_MATERIAL.id],options={now:NOW,verifiedRecord:Adaptive.verifiedRecord},copy=structuredClone;
assert.equal(A.materialContentHash(OLD_MATERIAL),REGISTRATION.fromMaterialHash,'public old fixture must match reviewed registry');
assert.equal(A.materialContentHash(CURRENT),REGISTRATION.toMaterialHash,'current material must match reviewed registry');
function record(material,{id='fixture-unseen',exposure='unseen',at=NOW-72*3600000,bound=true}={}){
 const artifact={schema:1,mode:'practice',courseDay:2,materialVersion:String(material.version),gradingPolicy:'canonical-v2',objectiveGrading:'canonical-v2',exposureAtStart:exposure,startedAt:new Date(at-120000).toISOString(),activeSeconds:120,answers:Object.fromEntries(material.questions.map(q=>[q.id,q.type==='multi'?q.answers.slice():q.answers[0]])),interrupted:false,transcriptViewed:false};
 if(bound)artifact.materialBinding=P.freezeMaterialBinding(material,{data:D,courseDay:2});
 return{id,materialId:material.id,materialVersion:String(material.version),dayNumber:2,skill:'reading',kind:'original',source:'course-player',exposure,startedAt:artifact.startedAt,submittedAt:new Date(at).toISOString(),activeSeconds:120,minutes:2,assistance:{hint:false,answer:false,ai:false},answer:JSON.stringify(artifact),evaluation:{method:'objective',result:'pass',feedback:'Synthetic correct-answer fixture'}};
}
function artifact(r,change){const a=JSON.parse(r.answer);change(a);r.answer=JSON.stringify(a);}
function proof(records,data=D,extra={}){return Y.mastery(data,records,{...options,...extra}).reading.proofs.find(p=>p.materialId===OLD_MATERIAL.id);}
test('reviewed old frozen content preserves its exact original proof after successful same-version review',()=>{
 const original=record(OLD_MATERIAL),review=record(OLD_MATERIAL,{id:'fixture-seen',exposure:'seen',at:NOW}),records=[original,review],before=JSON.stringify(records),p=proof(records);assert.equal(p.recordId,original.id);assert.equal(p.submittedAt,original.submittedAt);assert.equal(p.week,CURRENT.week);assert.equal(p.level,CURRENT.level);assert.equal(JSON.stringify(records),before);
});
test('only an explicitly registered new-version successful review can retain the old proof',()=>{
 const original=record(OLD_MATERIAL),review=record(CURRENT,{id:'fixture-new-version',exposure:'seen',at:NOW}),p=proof([original,review]);assert.equal(p.recordId,original.id);assert.equal(p.submittedAt,original.submittedAt);assert.equal(proof([original,review],D,{compatibility:{}}),undefined);
 const next=copy(D),m=next.materials.find(m=>m.id===CURRENT.id);m.version='999';m.source.revisionOf={version:String(CURRENT.version),materialContentHash:A.materialContentHash(CURRENT)};assert.equal(proof([original,record(m,{id:'fixture-unregistered-next',exposure:'seen',at:NOW})],next),undefined);
});
test('old unbound records remain unverified across versions while current-version unbound evidence stays compatible',()=>{
 assert.equal(proof([record(OLD_MATERIAL,{bound:false})]),undefined);const current=record(CURRENT,{bound:false});assert.equal(proof([current]).recordId,current.id);
 for(const field of ['record-version','artifact-version','broken-hash','different-id']){const r=record(OLD_MATERIAL);artifact(r,a=>{if(field==='record-version')r.materialVersion='999';if(field==='artifact-version')a.materialVersion='999';if(field==='broken-hash')a.materialBinding.material.questions[0].answers=['changed without rehash'];if(field==='different-id')a.materialBinding.material.id='another-material';});assert.equal(proof([r]),undefined,field);}
});
test('self-consistent unknown versions, changed answers, changed body, week and level cannot authorize evidence',()=>{
 for(const kind of ['unknown-version','answers','body','week','level']){const r=record(OLD_MATERIAL);artifact(r,a=>{const m=a.materialBinding.material;if(kind==='unknown-version'){r.materialVersion=a.materialVersion=m.version='999';}if(kind==='answers'){const q=m.questions.find(q=>q.type==='single'&&q.options?.length>1),wrong=q.options.find(v=>!q.answers.includes(v));assert.ok(wrong);q.answers=[wrong];a.answers[q.id]=wrong;}if(kind==='body')m.passage+=' This sentence was not in the published material.';if(kind==='week')m.week++;if(kind==='level')m.level='C2';a.materialBinding.contentHash=A.materialContentHash(m);});assert.equal(proof([r]),undefined,kind);}
});
test('missing registry, changed current bytes and changed revision linkage fail closed',()=>{
 const r=record(OLD_MATERIAL);assert.equal(proof([r],D,{compatibility:{}}),undefined);for(const kind of ['title','revision']){const changed=copy(D),m=changed.materials.find(m=>m.id===CURRENT.id);if(kind==='title')m.title+=' changed after review';else m.source.revisionOf.materialContentHash='0'.repeat(64);assert.equal(proof([r],changed),undefined,kind);}
});
test('review dates never replace original dates or manufacture the 48-hour retention window',()=>{
 const other=D.materials.find(m=>m.skill==='reading'&&m.pool==='training'&&m.week===1&&m.id!==CURRENT.id&&!A.practiceOnlyMaterial(m)&&m.source?.verification==='reviewed');assert.ok(other);
 const first=record(OLD_MATERIAL,{at:NOW-48*3600000}),second=record(other,{id:'fixture-other',at:NOW-47*3600000}),review=record(CURRENT,{id:'fixture-later-review',exposure:'seen',at:NOW}),records=[first,second,review],before=JSON.stringify(records),p=Y.mastery(D,records,options).reading;assert.equal(p.evidenceCount,2);assert.equal(p.levelRank,-1);assert.equal(p.proofs.find(p=>p.materialId===CURRENT.id).submittedAt,first.submittedAt);assert.equal(JSON.stringify(records),before);assert.equal(JSON.parse(first.answer).courseDay,first.dayNumber);
 const delayed=record(other,{id:'fixture-other-delayed',at:NOW});assert.equal(Y.mastery(D,[first,delayed,review],options).reading.levelRank,0);
});
test('latest wrong, assisted, interrupted, correction or unresolved practice cannot borrow an older success',()=>{
 for(const kind of ['wrong','assisted','interrupted','correction','unresolved']){const first=record(OLD_MATERIAL),latest=record(CURRENT,{id:'fixture-current-problem',exposure:'seen',at:NOW});if(kind==='wrong')artifact(latest,a=>{a.answers[Object.keys(a.answers)[0]]='definitely wrong';});if(kind==='assisted')latest.assistance.hint=true;if(kind==='interrupted')artifact(latest,a=>{a.interrupted=true;});if(kind==='correction')latest.kind='correction';assert.equal(proof([first,latest],D,kind==='unresolved'?{unresolvedMaterialIds:[CURRENT.id]}:{}),undefined,kind);}
});
