(function(root,factory){const api=factory(root);root.IELTSMemorySession=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){'use strict';
function materialId(word){let h=2166136261;for(const c of String(word).toLowerCase())h=Math.imul(h^c.charCodeAt(0),16777619);return'memory-recall-'+(h>>>0).toString(16);}
function makeDraft(item,{id,courseDay=1,now=Date.now()}={}){return{id,word:item.word,skill:item.skill,materialId:item.materialId||'',courseDay:Math.min(365,Math.max(1,courseDay||1)),startedAt:new Date(now).toISOString(),activeSeconds:0,activityByDate:{},answer:'',assisted:false,audioCompleted:false};}
function recordFor(draft,item,result,{now=Date.now()}={}){
 if(typeof result?.correct!=='boolean'||!draft.answer.trim()||item.skill==='listening'&&!draft.audioCompleted)throw Error('记忆回忆缺少真实答案、评阅或完整听音证据。');
 const subjective=item.skill==='production',question={id:'memory-recall',type:subjective?'subjective':item.skill==='recognition'?'single':'spelling',prompt:subjective?'使用「'+item.word+'」在自己的学习、工作或生活情境中造句。':item.skill==='recognition'?'为「'+item.word+'」选择正确中文义。':item.meaning||'听音后写出英文',answers:subjective?[]:[item.skill==='recognition'?item.meaning:item.word],explanation:result.feedback||item.meaning||'',evidence:item.example||'',...(subjective?{task:'foundation',level:'A0',minWords:1}:{}),returnUrl:'词汇记忆.html'};
 const elapsedSeconds=Math.min(86400,Math.max(0,(now-Date.parse(draft.startedAt))/1000)),activeSeconds=Math.min(elapsedSeconds,draft.activeSeconds),artifact={schema:1,mode:'practice',kind:'memory-recall',courseDay:draft.courseDay,memorySkill:item.skill,word:item.word,originalMaterialId:item.materialId||'',text:draft.answer,answers:{'memory-recall':draft.answer},questions:[question],activityByDate:draft.activityByDate,assisted:draft.assisted,audioCompleted:draft.audioCompleted,result};
 return{id:draft.id,materialId:materialId(item.word),materialVersion:'1',title:'到期词汇回忆：'+item.word,skill:'vocabulary',taskId:'vocabulary',source:'memory-review',dayNumber:draft.courseDay,kind:'original',answer:JSON.stringify(artifact),minutes:activeSeconds/60,activeSeconds,elapsedSeconds,quantity:1,unit:'条',startedAt:draft.startedAt,submittedAt:new Date(now).toISOString(),exposure:'seen',assistance:{hint:draft.assisted,answer:false,ai:false},media:[],evaluation:subjective?{method:'ai',result:result.correct?'pass':'revise',feedback:JSON.stringify(result)}:{method:'objective',result:result.correct?'pass':'revise',score:result.correct?1:0,maxScore:1,threshold:1,feedback:result.feedback||'词项独立回忆的客观核对，不替代新词三写三读。'}};
}
function committedEvidence(record,draft,item){
 let a;try{a=JSON.parse(record.answer);}catch(_){throw Error('已存回忆原稿无法读取，停止补记；原稿与当前输入保留。');}
 if(record.id!==draft.id||record.source!=='memory-review'||record.kind!=='original'||record.skill!=='vocabulary'||record.materialId!==materialId(item.word)||String(record.materialVersion)!=='1'||a?.schema!==1||a.kind!=='memory-recall'||a.word!==item.word||a.memorySkill!==item.skill||a.courseDay!==draft.courseDay||a.text!==draft.answer||a.answers?.['memory-recall']!==draft.answer||typeof a.assisted!=='boolean'||typeof a.result?.correct!=='boolean'||!Number.isFinite(Date.parse(record.startedAt))||!Number.isFinite(Date.parse(record.submittedAt))||record.startedAt>record.submittedAt||!record.assistance||record.assistance.hint!==a.assisted||record.assistance.answer!==false||record.assistance.ai!==false||record.evaluation?.method!==(item.skill==='production'?'ai':'objective')||record.evaluation.result!==(a.result.correct?'pass':'revise')||item.skill==='listening'&&a.audioCompleted!==true)throw Error('这份回忆原稿已保存，但与当前词、技能或答案不一致；不会覆盖原稿。请保留当前输入并从已存作品继续。');
 return{record,artifact:a,result:a.result};
}
async function findSaved({draft,item,records}){if(typeof records?.list!=='function')return null;const stored=(await records.list()).find(r=>r.id===draft.id);return stored?committedEvidence(stored,draft,item):null;}
async function saveReviewed({draft,item,result,records,memory,now=Date.now(),durable}){
 // Records can already be committed even when the caller saw a later folder
 // sync or memory/quota error. Recover that immutable original before trying
 // another submission with a later clock or a second AI result.
 let saved=await findSaved({draft,item,records});if(!saved){const input=recordFor(draft,item,result,{now}),created=await records.record(input);saved=committedEvidence(created.record,draft,item);}
 const r=saved.record,a=saved.artifact;memory.record(item,item.skill,{id:r.id,recordId:r.id,startedAt:r.startedAt,at:r.submittedAt,correct:a.result.correct,assisted:a.assisted,source:item.skill==='production'?'ai-context-review':'objective-recall',answer:a.text});
 // Keep the draft until the original and memory have passed the durability
 // barrier. A failure here must leave an ordinary retryable draft signature.
 if(typeof durable==='function')await durable();else if(root.document&&!root.IELTSProfiles?.isPreview?.())await root.IELTSUserData?.syncNow?.();memory.clearDraft(draft.id);return r;
}
return{materialId,makeDraft,recordFor,committedEvidence,findSaved,saveReviewed};
});
