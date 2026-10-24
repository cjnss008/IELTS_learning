'use strict';
// Development-only authoring tool. Credentials arrive via stdin; never persisted.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {jobs}=require('./curriculum-manifest.cjs');
const root=path.join(__dirname,'..'),draftDir=path.join(root,'private','course-authoring'),outDir=path.join(root,'curriculum','materials');
fs.mkdirSync(draftDir,{recursive:true});fs.mkdirSync(outDir,{recursive:true});
const words=s=>(String(s||'').match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]).length;
const norm=s=>String(s||'').trim().toLowerCase().replace(/[’‘]/g,"'").replace(/[.,!?;:]$/,'').replace(/\s+/g,' ');
function normalizeNumbers(value){
 const small=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
 const tens=['twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
 return norm(value).replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[ -](one|two|three|four|five|six|seven|eight|nine))?\b/g,(_,t,u)=>String((tens.indexOf(t)+2)*10+(u?small.indexOf(u):0))).replace(new RegExp('\\b('+small.join('|')+')\\b','g'),v=>String(small.indexOf(v)));
}
const answerWords=s=>(String(s||'').match(/(?:[A-Za-z]\.){2,}|[0-9]+(?:[:,.][0-9]+)*(?:[A-Za-z]+)?(?:[’'’-][A-Za-z0-9]+)*|[A-Za-z][A-Za-z0-9]*(?:[’'’-][A-Za-z0-9]+)*/g)||[]).length;
function containsAnswer(text,answer){const value=normalizeNumbers(answer).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return !!value&&new RegExp('(?:^|[^a-z0-9])'+value+'(?:$|[^a-z0-9])','i').test(normalizeNumbers(text));}
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function constraints(job){
 if(job.skill==='writing')return `Create ONE ORIGINAL IELTS Academic writing TASK PROMPT, not an answer. Unique task seed ${job.id}; theme ${job.topic}; task ${job.type}. Return strict JSON {title:string,prompt:string,instructions:string,questions:[],rubric:{taskType:'${job.type}'},figure?:object}. prompt is the COMPLETE English question visible to the student. instructions is Chinese study guidance and says all scenarios/data are simulated, not an official IELTS paper. Do NOT output transfer/vocabulary/grammar/passage/sample essay. Do not put the actual question anywhere except prompt.
${job.type==='academic_task1'?`Task1: supply a complete ${job.figureType} figure and EXACTLY matching English prompt to summarize main features and comparisons. Explicitly instruct: Write at least 150 words. All necessary data must be present in figure. Do not ask for opinion or reasons. figure={type:'${job.figureType}',title:string,labels:string[],series:[{name:string,values:number[]}],rows?:string[][],steps?:string[],map?:{before:object[],after:object[]}}. Table/line/bar/pie/mixed: coherent labelled units, times and numerical series with values length=labels length; pie totals100. Process: 6–9 concrete ordered steps, no numeric series required. Map: before/after named places with coordinates{x,y,w,h,name} in0–100, north/south orientation; no unrelated visitor-count question. mixed: chart+table coordinated numerical series or parts array of figures. Give 2–4 important comparable features but do not reveal model-answer summary in instructions.`:`Task2: write a complete distinct Academic ${job.essayType} essay question in 2–4 sentences. Explicitly instruct: Write at least 250 words. State exactly what position/discussion/advantages/solutions to address. No chart/table, no paragraph-only task, no requirement to merely describe data. Do not provide essay content or outline that answers the question.`}
No placeholders, copyrighted exam text, citations or made-up official statistics. The question and figure must be self-contained and mutually consistent. Strict JSON only.`;
 return `Write one ORIGINAL educational English ${job.skill} material for a Chinese adult, level ${job.level}, week ${job.week}, theme ${job.topic}, grammar ${job.grammarFocus}. Unique seed ${job.id} (invent a distinct coherent scenario; no reused template passage). Pool ${job.pool}. ${job.fullTest?(job.skill==='reading'?'A full reading test ONLY: THREE titled passages totalling 2150–2750 English words (aim 2450), questions 1–13 on passage 1,14–26 on passage 2,27–40 on passage 3. Do not create a listening transcript.':'A full listening test ONLY: FOUR clearly labelled sections totalling 1500–2400 words (aim1900),10 ordered questions per section:a social dialogue, a social monologue, an academic discussion and an academic lecture. Do not create a reading passage.'):'Keep difficulty within this learner level; A0 sentences are 3–8 everyday words, no advanced clauses.'}
${job.skill==='reading'||job.skill==='listening'?`The ${job.skill==='reading'?'passage':'transcript'} MUST contain ${job.minWords}–${job.maxWords} English words and exactly ${job.questionCount} questions. Listening contains real turn-taking and natural corrections/distractors; no answer lists read aloud. Reading has coherent paragraphs with A/B/C labels where appropriate. Questions mix single-choice, fill-in, matching/headings via single-choice, and true/false/not given (these are single with exactly those three options). Fill answers must occur verbatim in the source, with maxWords limit. No multi-choice questions with ambiguous answers. A0/A1 MUST use only Chinese instructions with direct literal single-choice or exact-source fill questions, no True/False/Not Given and no inference. Include at least 8 distinct explicit facts for the 8 questions, avoid testing the same fact twice. A0 uses only I/you and am/are; no he/she/they or untaught clauses. For A2+ use the listed varieties progressively. Never infer that a student cannot also be a teacher; false answers need explicit contradicting evidence. For NOT GIVEN, explain which required fact is absent. Answer options are full strings, not letters. A0 may use Chinese question instructions. All explanations are Chinese and evidence is exact quote from the English source (or a clear absence explanation for NOT GIVEN). Do not ask about facts not supplied by the text.`:''}
${job.skill==='writing'?`Task type ${job.type}. ${job.type==='academic_task1'?`Provide actual complete ${job.figureType} data/diagram, coherent units/times and comparable variables. Table/line/bar/pie/mixed use labels and numeric series; pie values sum to 100. Map uses before/after grid of named locations with actual coordinates (map.before/map.after arrays of objects {name,x,y,w,h}, coordinates and sizes 0–100); process uses 6–9 ordered steps. Figure has {type,title,labels,series:[{name,values}],rows?,steps?,map?}. Include a precise English prompt asking summary and comparisons, never an essay about causes in Task1.`:`Provide an original precise Academic Task2 ${job.essayType} prompt with clear task requirements.`} Do NOT write a sample essay or the answer. Include a Chinese preparation checklist, rubric, and no objective questions.`:''}
Return STRICT JSON object with keys title (English), instructions (Chinese, actionable), ${job.skill==='reading'?'passage (English, omit transcript entirely)':'transcript (English, omit passage entirely)'}, questions:[{id:'q1',type:'single'|'fill',prompt,options?:string[],answers:string[],maxWords?:number,explanation (Chinese),evidence}], vocabulary:[{word,meaning,example}] 8 useful words in source, grammar:{title,explanation (Chinese plain explanation before terminology),example (actual source quote),questions:4 same-question-schema independent new sentences}, transfer:{speaking:{part1:4 English questions,part2:English cue card with 4 bullets,part3:4 English questions},writing:one level-appropriate new-context prompt}, figure (only Task1), rubric:{taskType}. Foundation sounds variant includes alphabet names/numbers/minimal pairs such as ship/sheep, fifteen/fifty, stress; never claim pronunciation from text. Explain any symbols. Foundation transfer asks 2–8 simple sentences, NOT IELTS essays.
No copyrighted passages, fake citations, real research claims requiring attribution, HTML, URLs, credentials or placeholders. All scenarios/data are original simulated education materials and clearly labelled as simulated in Chinese instructions. Do not label these official IELTS tests or calibrated Band scores. Return all content in one JSON.`;
}
function validate(job,d){
 const errors=[];
 if(!d||typeof d!=='object'||typeof d.title!=='string'||typeof d.instructions!=='string')return ['Invalid material object'];
 if(['reading','listening'].includes(job.skill)){
  const text=d[job.skill==='reading'?'passage':'transcript'];const n=words(text);
  if(n<job.minWords||n>job.maxWords)errors.push(`English source word count ${n}; required ${job.minWords}–${job.maxWords}`);
  if(!Array.isArray(d.questions)||d.questions.length!==job.questionCount)errors.push('Question count must be '+job.questionCount);
  for(const q of d.questions||[]){
   if(!q.prompt||!q.evidence||!q.explanation||!Array.isArray(q.answers)||!q.answers.length)errors.push('Question missing prompt/answers/evidence/explanation');
   if(!['single','multi','fill','short'].includes(q.type))errors.push('Invalid question type');
   if(['single','multi'].includes(q.type)&&(!Array.isArray(q.options)||(q.answers||[]).some(a=>!q.options.includes(a))))errors.push('Correct answer must exactly match an option');
   if(q.type==='fill'&&(q.answers||[]).some(a=>!containsAnswer(text,a)))errors.push('Fill answer not in source: '+q.answers.join('/'));
   if(q.type==='fill'&&(!Number.isInteger(q.maxWords)||q.maxWords<1||(q.answers||[]).some(a=>answerWords(a)>q.maxWords)))errors.push('Fill answer exceeds word limit');
  }
  if(!Array.isArray(d.vocabulary)||d.vocabulary.length<6)errors.push('Need >=6 source vocabulary items');
  if(!d.grammar?.explanation||!d.grammar.example||!Array.isArray(d.grammar.questions)||d.grammar.questions.length<4)errors.push('Need clear grammar lesson plus 4 questions');
  if(!d.transfer?.writing||!Array.isArray(d.transfer?.speaking?.part1))errors.push('Need actionable speaking/writing transfer');
 }
 if(job.type==='academic_task1'){
  const f=d.figure;
  if(!f||f.type!==job.figureType)errors.push('Figure must match '+job.figureType);
  else if(f.type==='process'){if(!Array.isArray(f.steps)||f.steps.length<6)errors.push('Process needs >=6 steps');}
  else if(f.type==='map'){if(!Array.isArray(f.map?.before)||!Array.isArray(f.map?.after)||!f.map.before.length||!f.map.after.length)errors.push('Map needs before/after locations');}
  else if(!Array.isArray(f.labels)||!f.labels.length||!Array.isArray(f.series)||!f.series.length||f.series.some(s=>!Array.isArray(s.values)||s.values.length!==f.labels.length||s.values.some(v=>!Number.isFinite(v))))errors.push('Chart data shape invalid');
  else if(f.type==='pie'&&f.series.some(s=>Math.abs(s.values.reduce((a,b)=>a+b,0)-100)>.01))errors.push('Pie data must sum to 100');
 }
 if(job.skill==='writing'){
  if(typeof d.prompt!=='string'||d.prompt.length<80)errors.push('Need a complete top-level English prompt');
  const minimum=job.type==='academic_task1'?150:250;if(!new RegExp('at least '+minimum+' words','i').test(d.prompt||''))errors.push('Prompt must explicitly say Write at least '+minimum+' words');
  if(job.type==='academic_task2'&&d.figure)errors.push('Task2 must not be a data description task');
  if(d.rubric?.taskType!==job.type)errors.push('Rubric taskType must match '+job.type);
 }
 return [...new Set(errors)];
}
async function run(config){
 const base=new URL(config.baseUrl||'https://api.deepseek.com');
 if(base.protocol!=='https:'||base.username||base.password)throw new Error('HTTPS base URL required');
 if(typeof config.apiKey!=='string'||!config.apiKey.trim())throw new Error('API key is required via stdin');
 const model=config.model||'deepseek-flash';const usage={requests:0,inputTokens:0,outputTokens:0};
 async function chat(messages,max_tokens=28000){
  const response=await fetch(base.href.replace(/\/$/,'')+'/chat/completions',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+config.apiKey,'Content-Type':'application/json'},signal:AbortSignal.timeout(180000),body:JSON.stringify({model,messages,response_format:{type:'json_object'},max_tokens,temperature:0.3,thinking:{type:'disabled'}})});
  if(!response.ok){await response.body?.cancel();throw new Error('Provider HTTP '+response.status);}
  const body=await response.json();usage.requests++;usage.inputTokens+=body.usage?.prompt_tokens||0;usage.outputTokens+=body.usage?.completion_tokens||0;
  const c=body.choices?.[0];if(c?.finish_reason==='length')throw new Error('Provider truncated JSON');
  return JSON.parse(c?.message?.content||'');
 }
 async function author(job){
  const destination=job.parentId?path.join(draftDir,'verified-parts'):outDir;fs.mkdirSync(destination,{recursive:true});
  const file=path.join(destination,job.id+'.json'),draft=path.join(draftDir,job.id+'.json');
  if(fs.existsSync(file)&&!config.force){const prior=JSON.parse(fs.readFileSync(file,'utf8'));if(!validate(job,prior).length&&(job.skill!=='writing'||prior.prompt&&prior.source?.schemaVersion===2))return {id:job.id,status:'cached'};}
  if(config.sectioned&&job.fullTest&&['reading','listening'].includes(job.skill)){
   const reading=job.skill==='reading',count=reading?3:4,parts=[];
   for(let index=0;index<count;index++){
    const format=reading?'A coherent Academic-style reading passage with a distinct subject, thesis and supporting paragraphs.':'Listening section '+(index+1)+': '+['social dialogue between two people','social monologue giving practical information','academic discussion between students and tutor','academic lecture by one speaker'][index]+'. Questions follow the order of the recording. Use explicit named speaker turns for a dialogue. Do not include a reading passage.';
    const part={...job,id:job.id+'-part-'+(index+1),parentId:job.id,fullTest:false,minWords:reading?720:375,maxWords:reading?910:590,questionCount:reading?(index===2?14:13):10,topic:job.topic+' — independent section '+(index+1),sourceFormat:format};
    await author(part);parts.push(JSON.parse(fs.readFileSync(path.join(draftDir,'verified-parts',part.id+'.json'),'utf8')));
   }
   const key=reading?'passage':'transcript',first=parts[0];let qn=0;
   const d={title:job.topic+' · '+(reading?'Three academic readings':'Four listening sections'),instructions:'原创模拟训练材料；先独立作答，再核对依据。'+(reading?'三篇文章共40题，限时60分钟。':'四节音频共40题，按顺序听音作答。合成训练音频时长不同于正式考试。'),[key]:parts.map((p,i)=>(reading?'Passage ':'Section ')+(i+1)+': '+p.title+'\n\n'+p[key]).join('\n\n'),questions:parts.flatMap(p=>p.questions.map(q=>({...q,id:'q'+(++qn)}))),vocabulary:parts.flatMap(p=>p.vocabulary).slice(0,12),grammar:first.grammar,transfer:first.transfer,rubric:{taskType:job.skill}};
   const errors=validate(job,d);if(errors.length)throw Error('Assembled sections invalid: '+errors.join('; '));
   const material={...job,...d,version:'1',source:{schemaVersion:2,kind:'original',rights:'项目原创，AI辅助编写；模拟场景与数据',verification:'reviewed',method:'各节经过规则校验、独立AI解题或逐题证据复核，再核对整套题号与题量；分节记录具体复核方法，未经真人考生标定',model,contentHash:hash(JSON.stringify(d)),sections:parts.map(p=>({id:p.id,hash:p.source.contentHash,model:p.source.model,verification:p.source.verification,method:p.source.method}))},audio:'',audioVoice:'',audioSynthetic:true};
   fs.writeFileSync(file,JSON.stringify(material,null,2)+'\n');return {id:job.id,status:'reviewed',words:words(d[key]),sections:count};
  }
  let d=job.skill!=='writing'&&fs.existsSync(draft)?JSON.parse(fs.readFileSync(draft,'utf8')):null;
  let feedback='';
  for(let attempt=0;attempt<(config.attempts||6);attempt++){
   if(!d||feedback){
    const previous=fs.existsSync(draft)?JSON.parse(fs.readFileSync(draft,'utf8')):null;
     if(previous&&/^English source word count \d+; required /.test(feedback)){
     const key=job.skill==='reading'?'passage':'transcript',target=Math.round((job.minWords+job.maxWords)/2);
     const revised=await chat([{role:'system',content:'Revise this English '+key+' to about '+target+' English words, within '+job.minWords+'–'+job.maxWords+'. Current diagnosis: '+feedback+'. Preserve existing facts, speaker roles and quoted phrases. Add relevant supporting explanation when expanding; remove nonessential repetition when shortening. Keep level '+job.level+'. Return JSON {"'+key+'":string}. Do not return questions or another source field.'},{role:'user',content:previous[key]}],14000);
     d={...previous,[key]:revised[key]};
    }else if(previous&&feedback&&job.skill!=='writing'){
     const key=job.skill==='reading'?'passage':'transcript';
     const revised=await chat([{role:'system',content:'Repair questions and grammar against an IMMUTABLE original English source. Do not rewrite or return the source. Resolve every listed ambiguity or unsupported claim by changing the question/options/answer/explanation, not inventing evidence. Return strict JSON {questions:the complete corrected list,grammar:the complete corrected grammar lesson and 4 questions,vocabulary:8 useful source words}. Question objects need id,type,prompt,options if single,answers as exact option strings or source phrase,maxWords if fill,explanation in Chinese,evidence. Every answer must be supported. No missing question. For a/the, state the intended new non-specific indefinite noun phrase. For I/you/be distinguish persons accurately.'},{role:'user',content:JSON.stringify({level:job.level,questionCount:job.questionCount,source:previous[key],questions:previous.questions,grammar:previous.grammar,vocabulary:previous.vocabulary,feedback})}],16000);
     d={...previous,questions:revised.questions,grammar:revised.grammar,vocabulary:revised.vocabulary};
    }else d=await chat([{role:'system',content:'You are an expert adult beginner-to-Academic English materials writer. Return rigorous ORIGINAL JSON content, not a scaffold. Obey all length constraints. Aim for the MIDDLE of the requested word range, not its lower boundary.'},{role:'user',content:constraints(job)+'\n'+(job.sourceFormat||'')+(feedback?'\nRevise the previous full material below, fixing these specific issues while preserving other correct content. Return the complete corrected object, not a patch. Issues: '+feedback+'\nPrevious JSON: '+JSON.stringify(previous):'')}]);
    fs.writeFileSync(draft,JSON.stringify(d));
   }
   if(job.skill==='reading')delete d.transcript;else if(job.skill==='listening')delete d.passage;
   const errors=validate(job,d);if(errors.length){feedback=errors.join('; ');d=null;continue;}
   const blind={taskType:job.type,title:d.title,prompt:d.prompt,instructions:d.instructions,passage:d.passage,transcript:d.transcript,figure:d.figure,questions:(d.questions||[]).map(({id,type,prompt,options,maxWords})=>({id,type,prompt,options,maxWords})),grammar:d.grammar?{...d.grammar,questions:d.grammar.questions.map(({id,type,prompt,options,maxWords})=>({id,type,prompt,options,maxWords}))}:undefined};
   const review=await chat([{role:'system',content:'Independently solve and audit this English learning material. No answer key is provided. Return JSON {answers:[{id,answer:string,evidence:string}],grammarAnswers:[{id,answer:string}],blockingIssues:[{location:string,problem:string,evidence:string}],advice:string[]}. Answer with the EXACT option string or shortest valid source phrase. Blocking issues require specific evidence of a genuinely ambiguous/incorrect/unsupported question, erroneous grammar explanation, incoherent data, or inappropriate difficulty; advice and stylistic preferences go ONLY in advice. The transcript WILL be synthesized into audio before release; do not flag missing audio in this authoring payload. The application separately provides recording, timing, chart rendering and hidden answers. Reading/listening comprehension questions need not test the grammar focus; ONLY grammar.questions are grammar questions. Target grammar is one focus, not an exhaustive description of every word. Reusing a grammar pattern in independent questions is intentional beginner practice, not an error. Do not invent a score or assume the writer is correct. Statements such as no issue, acceptable, defensible or minor stylistic gap must not appear in blockingIssues.'},{role:'user',content:JSON.stringify({level:job.level,...blind})}],8000);
   const mismatches=[];
   for(const [qs,rs,label] of [[d.questions||[],review.answers||[],'question'],[d.grammar?.questions||[],review.grammarAnswers||[],'grammar']])for(const q of qs){const r=rs.find(r=>r.id===q.id);if(!r||!q.answers?.some(a=>normalizeNumbers(a)===normalizeNumbers(r.answer)))mismatches.push(label+' '+q.id+' blind answer disagrees');}
   if((review.blockingIssues||[]).length||mismatches.length){feedback=[...(review.blockingIssues||[]).map(x=>JSON.stringify(x)),...mismatches].join('; ').slice(0,6000);fs.writeFileSync(path.join(draftDir,job.id+'.review.json'),JSON.stringify(review));d=null;continue;}
   const material={...job,...d,id:job.id,week:job.week,skill:job.skill,pool:job.pool,version:'1',fullTest:job.fullTest,source:{schemaVersion:2,kind:'original',rights:'项目原创，AI辅助编写；模拟场景与数据',verification:'reviewed',method:'规则校验＋未提供答案的第二轮AI解题一致性检查；未经真人考生标定',model,contentHash:hash(JSON.stringify(d))},audio:'',audioVoice:'',audioSynthetic:true};
   material.questions=(material.questions||[]).map((q,i)=>({...q,id:'q'+(i+1)}));
   fs.writeFileSync(file,JSON.stringify(material,null,2)+'\n');return {id:job.id,status:'reviewed',words:words(d.passage||d.transcript)};
  }
  fs.writeFileSync(path.join(draftDir,job.id+'.issues.json'),JSON.stringify({id:job.id,feedback}));throw new Error('Material validation unresolved: '+job.id);
 }
 let selected=jobs.filter(j=>(!config.ids||config.ids.includes(j.id))&&(!config.minWeek||j.week>=config.minWeek)&&(!config.maxWeek||j.week<=config.maxWeek));
 let cursor=0,completed=0,failed=[];
 await Promise.all(Array.from({length:Math.min(config.concurrency||6,8)},async()=>{for(;;){const job=selected[cursor++];if(!job)return;try{const result=await author(job);completed++;console.log(JSON.stringify({...result,completed,total:selected.length}));}catch(error){failed.push(job.id);console.log(JSON.stringify({id:job.id,status:'failed',reason:error.message.replaceAll(config.apiKey,'[redacted]').slice(0,160)}));}}}));
 fs.writeFileSync(path.join(draftDir,'last-run.json'),JSON.stringify({model,completed,failed,usage}));
 console.log(JSON.stringify({done:true,completed,failed:failed.length,usage}));
 process.exitCode=failed.length?1:0;
}
module.exports={validate,words,norm,normalizeNumbers,answerWords,containsAnswer,constraints};
if(require.main===module){let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>input+=s);process.stdin.on('end',()=>{let config;try{config=JSON.parse(input);input='';}catch{console.error('Invalid configuration JSON on stdin');process.exitCode=1;return;}run(config).catch(()=>{console.error('Authoring stopped; verify connection and configuration.');process.exitCode=1;});});}
