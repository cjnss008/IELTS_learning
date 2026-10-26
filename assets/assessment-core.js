(function (root) {
  'use strict';
  const SKILLS = ['listening', 'reading', 'writing', 'speaking'];
  const normalizeAnswer = value => typeof value === 'string' ? value.normalize('NFKC').replace(/[‘’]/g, "'").trim().replace(/\s+/g, ' ').replace(/^["“”]+|["“”]+$/g, '').toLowerCase() : '';
  const countWords = value => typeof value === 'string' ? (value.match(/(?:[A-Za-z]\.){2,}|[0-9]+(?:[:,.][0-9]+)*(?:[A-Za-z]+)?(?:[’'’-][A-Za-z0-9]+)*|[A-Za-z][A-Za-z0-9]*(?:[’'’-][A-Za-z0-9]+)*/g) || []).length : 0;
  function displayOptions(question, materialId = '', attemptId = '') {
    const options = Array.isArray(question?.options) ? question.options.slice() : [];
    if (!['single', 'multi'].includes(question?.type) || options.length < 2) return options;
    const keys = options.map(value => normalizeAnswer(value).replace(/[.!?。！？]+$/, '').replace(/[\s_-]+/g, ''));
    const enumerations = [['true', 'false'], ['true', 'false', 'notgiven'], ['yes', 'no'], ['yes', 'no', 'notgiven'], ['正确', '错误'], ['正确', '错误', '未提及']];
    // Keep conventional judgment enums and map/reference letters in their supplied order.
    if (enumerations.some(values => values.length === keys.length && values.every(value => keys.includes(value))) || options.every(value => typeof value === 'string' && /^[A-F]$/.test(value.normalize('NFKC').trim()))) return options;
    const seed = JSON.stringify([String(materialId), String(question.id || ''), String(attemptId)]);
    let state = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 0x01000193);
    state = state >>> 0 || 0x9e3779b9;
    for (let i = options.length - 1; i > 0; i--) {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      const j = Math.floor((state >>> 0) / 0x100000000 * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    return options;
  }
  function stableMaterialJSON(value,depth=0,seen=new Set()) {
    if(depth>40)throw Error('Material snapshot is too deeply nested');
    if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
    if(typeof value==='number'){if(!Number.isFinite(value))throw Error('Material snapshot has a non-finite number');return JSON.stringify(value);}
    if(!value||typeof value!=='object'||seen.has(value))throw Error('Material snapshot is not JSON data');
    seen.add(value);let result;
    if(Array.isArray(value)){if(Object.keys(value).length!==value.length)throw Error('Material snapshot has a sparse array');result='['+value.map(item=>stableMaterialJSON(item,depth+1,seen)).join(',')+']';}
    else{if(Object.prototype.toString.call(value)!=='[object Object]')throw Error('Material snapshot is not a plain object');result='{'+Object.keys(value).sort().map(key=>{const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor||descriptor.get||descriptor.set)throw Error('Material snapshot has an accessor');return JSON.stringify(key)+':'+stableMaterialJSON(descriptor.value,depth+1,seen);}).join(',')+'}';}
    seen.delete(value);return result;
  }
  let immutableMaterialHash=null,immutableMaterialIndex=null;
  function materialContentHash(material) { const index=root.IELTSRecordSnapshotIndex;if(index?.memoizeTrustedObject){if(index!==immutableMaterialIndex){immutableMaterialIndex=index;immutableMaterialHash=index.memoizeTrustedObject(value=>sourceTextHash(stableMaterialJSON(value)));}return immutableMaterialHash(material);}return sourceTextHash(stableMaterialJSON(material)); }
  function sourceTextHash(text) {
    if(typeof text!=='string')throw Error('Source text must be a string');
    if(typeof require==='function')try{return require('node:crypto').createHash('sha256').update(text,'utf8').digest('hex');}catch(_){}
    const bytes=[];for(const char of text){let cp=char.codePointAt(0);if(cp>=0xd800&&cp<=0xdfff)cp=0xfffd;if(cp<0x80)bytes.push(cp);else if(cp<0x800)bytes.push(0xc0|(cp>>6),0x80|(cp&63));else if(cp<0x10000)bytes.push(0xe0|(cp>>12),0x80|((cp>>6)&63),0x80|(cp&63));else bytes.push(0xf0|(cp>>18),0x80|((cp>>12)&63),0x80|((cp>>6)&63),0x80|(cp&63));}
    const length=bytes.length;bytes.push(0x80);while(bytes.length%64!==56)bytes.push(0);const high=Math.floor(length/0x20000000),low=(length*8)>>>0;for(let shift=24;shift>=0;shift-=8)bytes.push((high>>>shift)&255);for(let shift=24;shift>=0;shift-=8)bytes.push((low>>>shift)&255);
    const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],ror=(x,n)=>(x>>>n)|(x<<(32-n)),w=new Uint32Array(64);
    for(let offset=0;offset<bytes.length;offset+=64){for(let i=0;i<16;i++)w[i]=((bytes[offset+i*4]<<24)|(bytes[offset+i*4+1]<<16)|(bytes[offset+i*4+2]<<8)|bytes[offset+i*4+3])>>>0;for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2],s0=ror(a,7)^ror(a,18)^(a>>>3),s1=ror(b,17)^ror(b,19)^(b>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;}let[a,b,c,d,e,f,g,j]=h;for(let i=0;i<64;i++){const s1=ror(e,6)^ror(e,11)^ror(e,25),ch=(e&f)^(~e&g),t1=(j+s1+ch+k[i]+w[i])>>>0,s0=ror(a,2)^ror(a,13)^ror(a,22),maj=(a&b)^(a&c)^(b&c),t2=(s0+maj)>>>0;j=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}for(const [i,v]of [a,b,c,d,e,f,g,j].entries())h[i]=(h[i]+v)>>>0;}
    return h.map(value=>value.toString(16).padStart(8,'0')).join('');
  }
  function resolveArtifactMaterial(material,artifact,record) {
    const binding=artifact?.materialBinding;if(binding===undefined)return{valid:true,material,bound:false};
    const invalid=reason=>({valid:false,material:null,bound:true,reason});
    if(!binding||binding.schema!==1||!binding.material||typeof binding.material!=='object'||Array.isArray(binding.material)||!/^[a-f0-9]{64}$/.test(binding.contentHash||''))return invalid('原稿材料快照格式无效，原稿保留。');
    const snapshot=binding.material;
    if(typeof snapshot.id!=='string'||!snapshot.id||snapshot.version===undefined||material&&snapshot.id!==material.id||record&&snapshot.id!==record.materialId)return invalid('原稿材料快照身份不匹配，未套用当前新题。');
    if(artifact.materialVersion!==undefined&&String(artifact.materialVersion)!==String(snapshot.version)||record?.materialVersion&&String(record.materialVersion)!==String(snapshot.version))return invalid('原稿材料快照版本不匹配，原稿保留。');
    const objective=['reading','listening','grammar'].includes(snapshot.skill),policy=binding.gradingPolicy;
    if(artifact.gradingPolicy!==policy||objective&&(!['canonical-v2','legacy-normalized-v1'].includes(policy)||artifact.objectiveGrading!==policy)||!objective&&policy!=='existing-subjective-v1'||!objective&&artifact.objectiveGrading!==undefined&&artifact.objectiveGrading!==policy)return invalid('原稿材料快照的评分规则不一致。');
    try{if(materialContentHash(snapshot)!==binding.contentHash)return invalid('原稿材料快照哈希不匹配，未套用当前新题。');}catch(_){return invalid('原稿材料快照无法核验，原稿保留。');}
    return{valid:true,material:snapshot,bound:true};
  }

  function legacyMaterialContract(material) {
    const copy=value=>value===undefined?null:JSON.parse(JSON.stringify(value)),prompt=value=>value?.originalPromptChinese||value?.originalPrompt||value?.prompt||'';
    const question=q=>({id:String(q.id||''),type:q.type||'',prompt:prompt(q),options:copy(q.options||[]),answers:copy(q.answers||[]),maxWords:q.maxWords??null,answerAliases:copy(q.answerAliases||[]),caseSensitive:q.caseSensitive??null});
    const fields=['id','skill','type','level','pool','form','assessmentGroup','fullTest','independentBank','minWords','maxWords','timeLimitSeconds','estimatedMinutes','rubric','thresholds','trainingVersion'];
    const result=Object.fromEntries(fields.map(key=>[key,copy(material?.[key])])),skill=material?.skill;
    result.title=material?.title||'';result.prompt=skill==='reflection'?'':prompt(material);
    // Reflection navigation and general study hints are not answer contracts.
    // Formal constraints live in questions, minWords/time/rubric and V schema.
    result.instructions=['speaking','writing'].includes(skill)&&!result.prompt?material?.originalInstructions||material?.instructions||'':'';
    if(typeof result.assessmentGroup==='string'&&result.assessmentGroup.startsWith('gate-'))result.assessmentGroup=result.assessmentGroup.replace(/-[AB]$/,'');
    if(skill==='writing')result.rubric={...(result.rubric||{}),taskType:material.type??null};
    result.questions=(material?.questions||[]).map(question);
    result.verifiedForAssessment=material?.source?.verification==='reviewed';
    if(['reading','grammar'].includes(skill))result.passage=material.passage||'';
    if(skill==='listening')result.transcript=material.transcript||'';
    if(!['speaking','writing','reflection'].includes(skill)&&material.figure!==undefined)result.figure=copy(material.figure);
    for(const key of ['requirements','answerFormat','wordLimit','minSentences','maxSentences','requiredDimensions'])if(material[key]!==undefined)result[key]=copy(material[key]);
    if(['speaking','writing','reflection'].includes(skill)){result.reference=material.reference||'';result.figure=copy(material.figure||null);}
    if(skill==='vocabulary')result.vocabulary=(material.vocabulary||[]).map(word=>({word:String(word.word||'').trim().toLowerCase().replace(/\s+/g,' '),meaning:word.meaning||'',example:word.example||word.context||'',exampleTranslation:word.exampleTranslation||''}));
    return result;
  }
  function legacyMaterialContractHash(material) { return materialContentHash(legacyMaterialContract(material)); }
  function createLegacyMaterialCompatibilityIndex(records,options={}) {
    const entries={},evidence=[],scope=String(options.evidenceScope||'Known public Git revisions, current public content and explicitly recovered development source candidates only; unknown uncommitted versions are not claimed.').slice(0,1000);
    for(const record of records||[]){const evidenceId=evidence.length;evidence.push({kind:record.kind,revision:String(record.revision||''),path:String(record.path||''),assetSha256:record.assetSha256||null});for(const material of record.materials||[]){if(!material||typeof material.id!=='string')continue;const contractHash=legacyMaterialContractHash(material),entry=entries[material.id]||(entries[material.id]={variantHashes:[],versions:[],evidence:[],publishedEvidenceCount:0,developmentEvidenceCount:0,currentContractHash:null,questionIds:[],wordKeys:[]});if(!entry.variantHashes.includes(contractHash))entry.variantHashes.push(contractHash);const version=String(material.version||'1');if(!entry.versions.includes(version))entry.versions.push(version);entry.evidence.push(evidenceId);if(record.kind==='git')entry.publishedEvidenceCount++;if(record.kind==='development')entry.developmentEvidenceCount++;if(record.kind==='current'){entry.currentContractHash=contractHash;entry.questionIds=(material.questions||[]).map(q=>String(q.id));entry.wordKeys=[...new Set((material.vocabulary||[]).map(v=>String(v.word||'').trim().toLowerCase().replace(/\s+/g,' ')).filter(Boolean))];}}}
    for(const [id,entry]of Object.entries(entries)){entry.variantHashes.sort();entry.variantCount=entry.variantHashes.length;entry.contractHash=entry.variantCount===1?entry.variantHashes[0]:null;entry.evidenceClass=entry.variantCount!==1?'known-semantic-variants':entry.publishedEvidenceCount?'published-unique':entry.developmentEvidenceCount?'development-observed-unique':'current-only';entry.proofId='legacy-'+materialContentHash({id,variantHashes:entry.variantHashes,evidence:entry.evidence.map(i=>evidence[i])});}
    return{schema:1,contractProjectionVersion:1,method:'known-public-material-history-v1',complete:options.complete!==false,evidenceScope:scope,evidence,entries};
  }
  function proveLegacyMaterial(draft,currentMaterial,index) {
    let data=index||root.IELTSLegacyMaterialCompatibility;if(!data&&typeof require==='function')try{data=require('./legacy-material-compatibility.js');}catch(_){}
    const fail=reason=>({compatible:false,material:null,gradingPolicy:'legacy-normalized-v1',evidenceScope:String(data?.evidenceScope||'Known history index unavailable').slice(0,1000),reason});
    if(!draft||!currentMaterial||draft.materialId!==currentMaterial.id)return fail('旧草稿与当前材料身份不一致；输入保留。');
    if(!data||data.schema!==1||data.complete!==true||data.method!=='known-public-material-history-v1')return fail('旧材料已知历史证据未完整加载；输入保留。');
    const entry=data.entries?.[currentMaterial.id];if(!entry||entry.variantCount!==1||!entry.contractHash||entry.contractHash!==legacyMaterialContractHash(currentMaterial)||entry.currentContractHash!==entry.contractHash)return fail('同ID存在不同正文、题目、答案或要求，暂不能确认旧草稿所用版本。');
    if(!['published-unique','development-observed-unique'].includes(entry.evidenceClass))return fail('该材料只有当前版本，缺少可恢复的既有发布或开发版本证明。');
    let nested=null;if(draft.taskId==='vocabulary'&&draft.text)try{const parsed=JSON.parse(draft.text);if(parsed?.kind==='vocabulary-practice-draft')nested=parsed;}catch(_){return fail('旧词汇草稿无法核对，完整输入保留。');}
    const version=nested?.materialVersion??draft.materialVersion;
    if(version!==undefined&&!entry.versions.includes(String(version)))return fail('草稿材料版本未出现在已知历史中；输入保留。');
    if(nested&&(nested.materialId!==currentMaterial.id||JSON.stringify(nested.wordKeys)!==JSON.stringify(entry.wordKeys)))return fail('旧词汇草稿词头或顺序与唯一已知版本不一致。');
    if(draft.taskId!=='vocabulary'&&draft.answers&&Object.keys(draft.answers).some(id=>!entry.questionIds.includes(id)))return fail('旧草稿含未能对应的题号；输入保留。');
    const material=JSON.parse(JSON.stringify(currentMaterial));if(version!==undefined)material.version=String(version);
    return{compatible:true,material,gradingPolicy:'legacy-normalized-v1',evidenceScope:String(data.evidenceScope).slice(0,1000),proofId:entry.proofId,contractHash:entry.contractHash,evidenceClass:entry.evidenceClass,reason:'在已检查的公开发布与可恢复开发候选范围内，同ID任务语义唯一；保留旧评分规则和原输入。'};
  }

  function canonicalChoice(options,value,normalizer) {
    if (typeof value !== 'string' || !value.trim()) return null;
    if (options.includes(value)) return value;
    const key=normalizer(value), matches=options.filter(option => normalizer(option) === key);
    return matches.length === 1 ? matches[0] : null;
  }
  function gradeQuestion(question, supplied) {
    const accepted = Array.isArray(question?.answers) ? question.answers : [];
    const multi = question?.type === 'multi';
    const values = multi ? (Array.isArray(supplied) ? supplied : []) : [typeof supplied === 'string' ? supplied : ''];
    const choice=['single','multi'].includes(question?.type);
    const options=Array.isArray(question?.options) ? question.options : [];
    const normalized = choice ? values.map(value => canonicalChoice(options,value,normalizeAnswer)) : values.map(normalizeAnswer).filter(Boolean);
    const expected = choice ? accepted.map(value => canonicalChoice(options,value,normalizeAnswer)) : accepted.map(normalizeAnswer).filter(Boolean);
    const answered = values.some(value => typeof value === 'string' && Boolean(value.trim()));
    const unambiguous = !choice || normalized.every(value => value !== null) && expected.every(value => value !== null);
    const withinLimit = !question?.maxWords || values.every(value => countWords(value) <= question.maxWords);
    const correct = answered && withinLimit && unambiguous && expected.length > 0 && (multi ? new Set(normalized).size === normalized.length && normalized.length === expected.length && expected.every(answer => normalized.includes(answer)) : expected.includes(normalized[0]));
    return {id: question?.id || '', answered, correct, gradable: expected.length > 0 && (!choice || expected.every(value => value !== null)), withinLimit, expected: accepted.slice(), explanation: question?.explanation || '', evidence: question?.evidence || ''};
  }
  function gradeQuestionLegacy(question, supplied) {
    const accepted=Array.isArray(question?.answers)?question.answers:[],multi=question?.type==='multi',values=multi?(Array.isArray(supplied)?supplied:[]):[typeof supplied==='string'?supplied:''];
    const normalized=values.map(normalizeAnswer).filter(Boolean),expected=accepted.map(normalizeAnswer).filter(Boolean),answered=normalized.length>0,withinLimit=!question?.maxWords||values.every(value=>countWords(value)<=question.maxWords);
    const correct=answered&&withinLimit&&expected.length>0&&(multi?new Set(normalized).size===normalized.length&&normalized.length===expected.length&&expected.every(answer=>normalized.includes(answer)):expected.includes(normalized[0]));
    return{id:question?.id||'',answered,correct,gradable:expected.length>0,withinLimit,expected:accepted.slice(),explanation:question?.explanation||'',evidence:question?.evidence||''};
  }
  function gradeMaterialWith(material, answers, grader) {
    const items = (material?.questions || []).map(question => grader(question, answers[question.id]));
    const total = items.filter(item => item.gradable).length;
    const correct = items.filter(item => item.correct).length;
    return {items, correct, total, answered: items.filter(item => item.answered).length, ratio: total ? correct / total : null, allGradable: items.length > 0 && total === items.length};
  }
  function gradeMaterial(material, answers = {}) { return gradeMaterialWith(material,answers,gradeQuestion); }
  function gradeMaterialForArtifact(material, artifact) {
    const resolved=resolveArtifactMaterial(material,artifact);
    if(!resolved.valid)return{items:[],correct:0,total:0,answered:0,ratio:null,allGradable:false,gradingPolicy:'invalid-material-binding',reason:resolved.reason};
    material=resolved.material;
    const policy=artifact?.objectiveGrading;
    if(policy!==undefined&&policy!==null&&!['legacy-normalized-v1','canonical-v2'].includes(policy))return{items:[],correct:0,total:0,answered:0,ratio:null,allGradable:false,gradingPolicy:'unsupported'};
    return{...gradeMaterialWith(material,artifact?.answers||{},policy==='canonical-v2'?gradeQuestion:gradeQuestionLegacy),gradingPolicy:policy==='canonical-v2'?'canonical-v2':'legacy-normalized-v1'};
  }
  function decodeArtifact(record) {
    try {
      const cached = root.IELTSRecordSnapshotIndex?.parsedAnswer?.(record), value = cached?.available ? cached.value : JSON.parse(record?.answer || '{}');
      return value && value.schema === 1 && typeof value === 'object' && !Array.isArray(value) ? value : null;
    } catch (_) { return null; }
  }
  function decodeReview(record) {
    try {
      const cached = root.IELTSRecordSnapshotIndex?.parsedReview?.(record), value = cached?.available ? cached.value : JSON.parse(record?.evaluation?.feedback || '{}');
      return value && Array.isArray(value.rounds) ? value : null;
    } catch (_) { return null; }
  }
  // ASR is an append-only interpretation of the original audio. It never replaces
  // record.answer, the learner's old transcript, timestamps, quantity or media.
  function transcriptionForRecord(record,source) {
    try{
      const artifact=decodeArtifact(record);if(record?.skill!=='speaking'||!artifact)return null;
      const explicit=source!==undefined;let review={};if(!explicit){review=JSON.parse(record.evaluation?.feedback||'{}');source=review.transcriptionSource;}
      const keys=['schema','evidenceId','provider','text','textSha256','audioSha256','durationSeconds','verifiedAt','recordId','materialId','materialVersion','bindingContentHash','mediaIds','mediaRanges'];
      if(!source||typeof source!=='object'||Array.isArray(source)||Object.keys(source).some(k=>!keys.includes(k))||source.schema!==1||source.recordId!==record.id||source.materialId!==record.materialId||String(source.materialVersion)!==String(record.materialVersion)||typeof source.evidenceId!=='string'||!source.evidenceId||source.evidenceId.length>160||typeof source.provider!=='string'||!source.provider.trim()||source.provider.length>100)return null;
      if(typeof source.text!=='string'||!source.text.trim()||source.text.length>10000||sourceTextHash(source.text)!==source.textSha256||!/^[a-f0-9]{64}$/.test(source.audioSha256||'')||!Number.isFinite(source.durationSeconds)||source.durationSeconds<=0||source.durationSeconds>900||typeof source.verifiedAt!=='string'||!Number.isFinite(Date.parse(source.verifiedAt)))return null;
      const binding=artifact.materialBinding,ids=(record.media||[]).map(m=>m.id);if(!binding||!resolveArtifactMaterial(null,artifact,record).valid||source.bindingContentHash!==binding.contentHash||!ids.length||new Set(ids).size!==ids.length||!Array.isArray(source.mediaIds)||source.mediaIds.length!==ids.length||!source.mediaIds.every((id,i)=>id===ids[i]))return null;
      let cursor=0;if(!Array.isArray(source.mediaRanges)||source.mediaRanges.length!==ids.length||!source.mediaRanges.every((range,i)=>{const valid=range&&Object.keys(range).every(k=>['id','startSeconds','endSeconds'].includes(k))&&range.id===ids[i]&&Number.isFinite(range.startSeconds)&&Number.isFinite(range.endSeconds)&&Math.abs(range.startSeconds-cursor)<.001&&range.endSeconds>range.startSeconds&&range.endSeconds<=source.durationSeconds+.05;cursor=range.endSeconds;return valid;})||Math.abs(cursor-source.durationSeconds)>.05)return null;
      // Existing local records are not cryptographic certificates. For completed
      // reviews, nevertheless require exact agreement with both server-returned
      // ASR evidence and the acoustic evidence rather than trusting an appendix alone.
      if(!explicit&&(record.evaluation?.method==='ai'||review.status==='complete')){
        const proof=review.transcriptionEvidence;if(!proof||proof.schema!==1||!['evidenceId','provider','text','textSha256','audioSha256','durationSeconds','verifiedAt'].every(k=>proof[k]===source[k]))return null;
        const acoustic=review.pronunciationSource||review.audioSource;if(!acoustic||acoustic.audioSha256!==source.audioSha256||!Number.isFinite(acoustic.durationSeconds)||Math.abs(acoustic.durationSeconds-source.durationSeconds)>.1||review.pronunciationSource&&acoustic.reference!==source.text)return null;
      }
      return JSON.parse(JSON.stringify(source));
    }catch(_){return null;}
  }
  function effectiveSpeakingTranscript(record){
    const artifact=decodeArtifact(record);if(typeof artifact?.transcript==='string'&&artifact.transcript.trim())return artifact.transcript;
    return transcriptionForRecord(record)?.text||'';
  }
  function assistanceUsed(record) { return Boolean(record?.assistance && ['hint', 'answer', 'ai'].some(key => record.assistance[key] === true)); }
  function audioGrounded(item,dimension,review,record) {
    const source=review?.audioSource,duration=source?.durationSeconds,mediaIds=(record.media||[]).map(m=>m.id);
    if(review?.audioAnalysisEvidence!==true||source?.recordId!==record.id||source?.completeCoverage!==true||!Number.isFinite(duration)||duration<=0||duration>900||!Array.isArray(source.mediaIds)||!source.mediaIds.length||source.mediaIds.length!==mediaIds.length||!source.mediaIds.every((id,index)=>id===mediaIds[index])||!Array.isArray(source.segments)||!source.segments.length)return false;
    let cursor=0;for(const segment of source.segments){if(!Number.isFinite(segment.startSeconds)||!Number.isFinite(segment.endSeconds)||Math.abs(segment.startSeconds-cursor)>.03||segment.endSeconds<=segment.startSeconds||segment.endSeconds>duration+.03||segment.audible!==true||!Array.isArray(segment.fluencyIds)||!segment.fluencyIds.length||!Array.isArray(segment.pronunciationIds)||!segment.pronunciationIds.length)return false;cursor=segment.endSeconds;}if(Math.abs(cursor-duration)>.05)return false;
    return Array.isArray(item?.audioEvidence)&&item.audioEvidence.some(e=>e?.dimension===dimension&&typeof e.id==='string'&&typeof e.quote==='string'&&e.quote.trim()&&Number.isFinite(e.startSeconds)&&Number.isFinite(e.endSeconds)&&e.startSeconds>=0&&e.endSeconds>e.startSeconds&&e.endSeconds<=duration+.01&&source.segments.some(s=>e.startSeconds>=s.startSeconds-.01&&e.endSeconds<=s.endSeconds+.01&&s[dimension+'Ids'].includes(e.id)));
  }
  function evaluatedCriteria(record, material, target = 7) {
    const review = decodeReview(record);
    const required = material.skill === 'writing' ? ['task', 'coherence', 'lexical', 'grammar'] : ['fluency', 'lexical', 'grammar', 'pronunciation'];
    const artifact = decodeArtifact(record);
    const text = normalizeAnswer(material.skill==='speaking'?effectiveSpeakingTranscript(record):artifact?.text||'');
    const rounds = review?.rounds?.filter(round => round.ok === true) || [];
    const reasons = [];
    if (review?.status !== 'complete') reasons.push('两轮评阅尚未完整完成');
    if (rounds.length < 2 || new Set(rounds.map(round => round.round)).size < 2) reasons.push('缺少两轮对同一原稿的有效 AI 评阅');
    const criteria = required.map(id => {
      const entries = rounds.map(round => round.criteria?.find(item => item.id === id));
      const bands = entries.map(item => item?.band).filter(band => typeof band === 'number' && Number.isFinite(band) && band >= 0 && band <= 9 && Number.isInteger(band*2));
      const complete = rounds.length >= 2 && entries.every(item => item && typeof item.band === 'number' && Number.isFinite(item.band) && item.band >= 0 && item.band <= 9 && Number.isInteger(item.band*2));
      const acoustic=material.skill==='speaking'&&['fluency','pronunciation'].includes(id);
      const grounded = entries.every(item => acoustic?audioGrounded(item,id,review,record):Array.isArray(item?.evidence) && item.evidence.some(evidence => typeof evidence.quote === 'string' && normalizeAnswer(evidence.quote).length > 0 && text.includes(normalizeAnswer(evidence.quote))));
      const difference = bands.length ? Math.max(...bands) - Math.min(...bands) : null;
      const pass = complete && grounded && bands.every(band => band >= target) && difference <= 0.5;
      if (!complete) reasons.push(id + ' 维度待验证');
      else if (!grounded) reasons.push(id + ' 缺少可核对的原稿证据');
      else if (difference > 0.5) reasons.push(id + ' 两轮意见分歧较大，需要新题复测');
      else if (!pass) reasons.push(id + ' 尚未稳定达到训练线');
      return {id, bands, complete, grounded, difference, pass};
    });
    if (review?.requiresRetest) reasons.push('AI 评阅标记需要复测');
    if (material.skill === 'speaking' && (!record.media?.length || review?.audioAnalysisEvidence!==true || !criteria.filter(c=>['fluency','pronunciation'].includes(c.id)).every(c=>c.grounded))) reasons.push('缺少可核对的原始录音及有效音频评价，发音不能由转写替代');
    if(material.skill==='speaking'&&(material.fullTest||material.pool==='final')&&(review?.audioSource?.task!=='full_test'||review.audioSource.durationSeconds<660))reasons.push('完整口语训练需要覆盖整套任务且不少于 11 分钟的原音证据');
    return {pass: reasons.length === 0 && criteria.every(item => item.pass), criteria, reasons: [...new Set(reasons)], source: 'ai-estimate'};
  }
  function practiceOnlyMaterial(material) {
    const source=material?.source;
    return Boolean(source?.publicSourceId || material?.practiceOnly === true || source?.practiceOnly === true ||
      material?.independentAssessmentEligible === false || source?.independentAssessmentEligible === false ||
      material?.independentTransferEligible === false || source?.independentTransferEligible === false);
  }
  function evidenceFor(record, material, options = {}) {
    const artifact = decodeArtifact(record), reasons = [];
    const now = typeof options.now === 'number' ? options.now : Date.now();
    if (!record || !artifact) return {pass: false, pending: true, reasons: ['缺少课程原始作答记录']};
    if(Object.hasOwn(artifact,'lessonSupplement'))reasons.push('本次属于普通课程补充，不提供独立测评或进阶新材料证据');
    const resolved=resolveArtifactMaterial(material,artifact,record);
    if(!resolved.valid)return{pass:false,pending:true,reasons:[resolved.reason],artifact};
    if(practiceOnlyMaterial(material)||practiceOnlyMaterial(resolved.material))reasons.push('此来源仅用于普通练习，不提供独立测评或进阶迁移证据');
    material=resolved.material;
    if (record.materialId !== material.id || String(record.materialVersion || artifact.materialVersion) !== String(material.version)) reasons.push('材料或版本不匹配');
    if (artifact.mode !== 'assessment') reasons.push('这是练习记录，不是独立测评');
    if (record.exposure !== 'unseen' || artifact.exposureAtStart !== 'unseen') reasons.push('材料在本次测评前已经曝光或曝光状态不明');
    if (assistanceUsed(record)) reasons.push('作答中使用了提示、答案或 AI');
    if (artifact.interrupted) reasons.push('本次测评曾暂停或中断');
    const started = Date.parse(record.startedAt || artifact.startedAt), submitted = Date.parse(record.submittedAt || '');
    if (!Number.isFinite(started) || !Number.isFinite(submitted) || submitted < started || submitted > now + 1000) reasons.push('测评时间证据无效');
    if (!(record.activeSeconds > 0) || !(record.elapsedSeconds > 0)) reasons.push('缺少实际计时记录');
    if (!Number.isFinite(record.activeSeconds) || !Number.isFinite(record.elapsedSeconds) || record.activeSeconds > record.elapsedSeconds + 0.001) reasons.push('实际计时与经过时间不一致');
    const timeLimit = Number(material.timeLimitSeconds || material.estimatedMinutes * 60);
    if (Number.isFinite(timeLimit) && record.elapsedSeconds > timeLimit + 5) reasons.push('超过本材料限时');
    if (material.source?.verification !== 'reviewed') reasons.push('材料尚未完成内容复核，仅供练习');
    let grade = null, ai = null;
    if (['reading', 'listening', 'grammar'].includes(material.skill)) {
      grade = gradeMaterialForArtifact(material, artifact);
      if (!grade.allGradable) reasons.push('题目答案或计分配置不完整');
      const final = options.final === true;
      if (final && (!material.fullTest || grade.total !== 40)) reasons.push('不是完整 40 题测评');
      const threshold = final ? 32 / 40 : record.kind === 'retest' ? 0.8 : 0.85;
      if (grade.ratio === null || grade.ratio < threshold) reasons.push('客观题尚未达到本阶段训练线');
      if (material.skill === 'listening' && (!artifact.audioCompleted || !artifact.audioAvailable || artifact.transcriptViewed)) reasons.push('缺少完整听音证据，或作答时已查看听力原文');
    } else if (['writing', 'speaking'].includes(material.skill)) {
      const text = material.skill === 'writing' ? artifact.text : effectiveSpeakingTranscript(record);
      if (material.minWords && countWords(text) < material.minWords) reasons.push('原始输出未满足该任务最低词数');
      if (options.final || material.fullTest) {
        ai = evaluatedCriteria(record, material, options.target || 7);
        reasons.push(...ai.reasons);
      } else {
        const review = decodeReview(record), rounds = review?.rounds?.filter(round => round.ok === true) || [];
        const original = normalizeAnswer(text || '');
        const valid = review?.status === 'complete' && rounds.length >= 2 && new Set(rounds.map(round => round.round)).size >= 2 && !review.requiresRetest && rounds.every(round => round.levelCheck?.meetsGoal === true && round.levelCheck.evidence?.some(item => normalizeAnswer(item.quote) && original.includes(normalizeAnswer(item.quote))));
        if (!valid) reasons.push('新情境输出尚无两轮带原稿证据的有效 AI 目标核对');
        if (material.skill === 'speaking' && !record.media?.length) reasons.push('未保存原始口语录音');
      }
    }
    return {pass: reasons.length === 0, pending: !grade && (!ai || ai.criteria.some(item => !item.complete)), reasons: [...new Set(reasons)], grade, ai, artifact};
  }
  function localDate(iso) { const date = new Date(iso); return Number.isNaN(date.getTime()) ? '' : date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'); }
  function groupAssessments(records, materials, options = {}) {
    const groups = new Map(), materialMap = new Map(materials.map(material => [material.id, material]));
    for (const record of records) {
      const material = materialMap.get(record.materialId), artifact = decodeArtifact(record);
      if (!material?.assessmentGroup || !artifact || artifact.mode !== 'assessment' || (options.pool && material.pool !== options.pool)) continue;
      const key = material.assessmentGroup + ':' + (material.form || 'A');
      if (!groups.has(key)) groups.set(key, {id: key, assessmentGroup: material.assessmentGroup, form: material.form || 'A', pool: material.pool, records: [], materials: [], lastSubmittedAt: '', date: ''});
      const group = groups.get(key);
      group.records.push(record); group.materials.push(material);
      if (record.submittedAt > group.lastSubmittedAt) { group.lastSubmittedAt = record.submittedAt; group.date = localDate(record.submittedAt); }
    }
    return [...groups.values()].map(group => {
      const required = materials.filter(material => material.assessmentGroup === group.assessmentGroup && (material.form || 'A') === group.form && SKILLS.includes(material.skill));
      const results = required.map(material => {
        // A new attempt never erases a later failure; use the latest submitted version.
        const record = group.records.filter(item => item.materialId === material.id).sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)))[0];
        return {material, record, ...evidenceFor(record, material, {...options, final: material.pool === 'final'})};
      });
      const missingSkills = SKILLS.filter(skill => !required.some(material => material.skill === skill));
      const dates = new Set(results.filter(result => result.record).map(result => localDate(result.record.submittedAt)));
      return {...group, results, missingSkills, sameDate: dates.size === 1 && !dates.has(''), pass: missingSkills.length === 0 && results.length > 0 && results.every(result => result.pass) && dates.size === 1, reasons: [...missingSkills.map(skill => '材料包缺少 ' + skill), ...(dates.size !== 1 ? ['同一套测评未在同一天完成'] : []), ...results.flatMap(result => result.reasons)]};
    }).sort((a, b) => String(b.lastSubmittedAt).localeCompare(String(a.lastSubmittedAt)));
  }
  function readiness(records, materials, options = {}) {
    const now = typeof options.now === 'number' ? options.now : Date.now();
    const cutoff = now - (options.windowDays || 28) * 86400000;
    const recent = groupAssessments(records, materials, {...options, pool: 'final', now}).filter(group => Date.parse(group.lastSubmittedAt) >= cutoff && Date.parse(group.lastSubmittedAt) <= now).slice(0, 3);
    const dates = new Set(recent.map(group => group.date));
    const ids = recent.flatMap(group => group.results.map(result => result.material.id));
    const unique = new Set(ids).size === ids.length;
    const reasons = [];
    if (recent.length < 3) reasons.push('最近 28 天内不足三套完整末期测评记录');
    if (dates.size < recent.length) reasons.push('三套测评需要在不同日期进行');
    if (!unique) reasons.push('测评材料重复');
    recent.forEach(group => { if (!group.pass) reasons.push(group.id + '：' + group.reasons.join('；')); });
    return {ready: recent.length === 3 && dates.size === 3 && unique && recent.every(group => group.pass), recent, reasons, label: reasons.length ? '训练证据仍需补齐或补强' : '近期训练证据符合内部标准（写口为 AI 估计）', disclaimer: '这不是正式 IELTS 成绩，也不是考试结果保证；纯文字反馈不能验证口语发音。'};
  }
  function gateMastery(records,materials,options={}) {
    const groups=groupAssessments(records,materials,{...options,pool:'gate'});
    const ids=[...new Set(materials.filter(m=>m.pool==='gate'&&m.assessmentGroup).map(m=>m.assessmentGroup))];
    return ids.map(id=>{
      const a=groups.find(g=>g.assessmentGroup===id&&g.form==='A'),b=groups.find(g=>g.assessmentGroup===id&&g.form==='B'),reasons=[];
      const due=a?.pass?Date.parse(a.lastSubmittedAt)+48*3600000:null;
      if(!a?.pass)reasons.push(a?'A 卷仍有缺失或未通过的独立证据':'尚无合格 A 卷原稿');
      if(!b?.pass)reasons.push(b?'B 卷仍需补齐或补强':'A 卷通过后仍须进行 B 卷延迟复测');
      const aIds=new Set(a?.results.map(r=>r.material.id)||[]);
      if(b?.results.some(r=>aIds.has(r.material.id)))reasons.push('A、B 卷材料不能重复');
      const earliestB=b?.results.length?Math.min(...b.results.map(r=>Date.parse(r.record?.startedAt||''))):NaN;
      if(a?.pass&&b&&(!Number.isFinite(earliestB)||earliestB<due))reasons.push('B 卷必须在 A 卷完整提交后至少 48 小时才开始');
      const pass=Boolean(a?.pass&&b?.pass&&!reasons.length);
      const status=pass?'mastered':a?.pass&&!b?'awaiting-retest':a?.pass&&b?.pass?'too-early':'needs-evidence';
      return{id,week:Math.max(...materials.filter(m=>m.assessmentGroup===id).map(m=>m.week)),pass,status,label:pass?'A + 延迟 B 卷符合完整掌握条件':a?.pass&&!b?'A 卷合格，待延迟复测':'关卡证据仍需补齐或补强',a,b,dueAt:due?new Date(due).toISOString():null,reasons};
    });
  }
  function remediation(record, material) {
    const artifact = decodeArtifact(record), grade = gradeMaterialForArtifact(material, artifact);
    return grade.items.filter(item => !item.correct).map(item => ({questionId: item.id, skill: material.skill, action: '先定位原文依据，解释错因，再闭卷回答同类新题。', evidence: item.evidence, explanation: item.explanation}));
  }
  function retestAvailability(record, alternatives, now = Date.now()) {
    const submitted = Date.parse(record?.submittedAt || '');
    const dueAt = Number.isFinite(submitted) ? submitted + 48 * 3600000 : Infinity;
    return {due: now >= dueAt, dueAt: Number.isFinite(dueAt) ? new Date(dueAt).toISOString() : null, materials: alternatives.filter(material => material.id !== record?.materialId), message: now >= dueAt ? '可以使用未见同级材料复测' : '先订正，至少间隔 48 小时后换题复测'};
  }
  const api = Object.freeze({SKILLS, practiceOnlyMaterial, normalizeAnswer, countWords, displayOptions, sourceTextHash, materialContentHash, resolveArtifactMaterial, legacyMaterialContract, legacyMaterialContractHash, createLegacyMaterialCompatibilityIndex, proveLegacyMaterial, gradeQuestion, gradeMaterial, gradeMaterialForArtifact, decodeArtifact, decodeReview, transcriptionForRecord, effectiveSpeakingTranscript, assistanceUsed, audioGrounded, evaluatedCriteria, evidenceFor, groupAssessments, gateMastery, readiness, remediation, retestAvailability, localDate});
  root.IELTSAssessment = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
