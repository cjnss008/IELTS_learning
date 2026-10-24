(function(root,factory){'use strict';const api=factory(root);root.IELTSLearningBridge=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 let active=0,last=Date.now();
 const visible=()=>!root.document||(!root.document.hidden&&(!root.document.hasFocus||root.document.hasFocus()));
 let wasVisible=visible();
 function clock(){const now=Date.now();if(wasVisible)active+=Math.max(0,now-last);last=now;wasVisible=visible();return active;}
 root.document?.addEventListener?.('visibilitychange',clock);
 root.addEventListener?.('focus',clock);root.addEventListener?.('blur',clock);
 function create(options){
  let start=Date.now(),activeStart=clock(),lastAnswer=null,lastId=null,chain=Promise.resolve(),viewed=Boolean(options.assisted),initialized=false;
  const profileId=root.IELTSProfiles?.current?.()?.id;
  function checkProfile(){if(profileId!==root.IELTSProfiles?.current?.()?.id)throw Error('学习档案已切换，请重新打开练习后提交。');}
  function expose(){viewed=true;}
  function submit(value){
   if(!root.IELTSRecords)return Promise.resolve({saved:false,message:'本页作品记录组件未加载；原有练习仍可使用。'});
   const answer=String(value.answer||'');if(!answer.trim())return Promise.resolve({saved:false,message:'没有可保存的作答。'});
   const elapsed=Math.max(0,(Date.now()-start)/1000),seconds=Math.min(elapsed,Math.max(0,(clock()-activeStart)/1000));
   const payload={...options,answer,assistance:{hint:false,answer:viewed||Boolean(value.assisted),ai:false},minutes:Math.floor(seconds)/60,activeSeconds:Math.floor(seconds),elapsedSeconds:elapsed,startedAt:new Date(start).toISOString(),submittedAt:new Date().toISOString(),quantity:value.quantity??1,unit:options.unit||'题',exposure:options.exposure||'unknown',evaluation:{method:'objective',score:value.score,maxScore:value.maxScore||1,threshold:value.threshold||0.85,result:value.score/(value.maxScore||1)>=(value.threshold||0.85)?'pass':'revise',feedback:value.feedback||'依据本题参考答案核对；不换算雅思成绩。'}};
   delete payload.assisted;delete payload.exposureHint;
   chain=chain.catch(()=>{}).then(async()=>{
    checkProfile();
    if(!initialized){const prior=(await root.IELTSRecords.list({taskId:options.taskId})).filter(r=>r.materialId===options.materialId&&r.materialVersion===(options.materialVersion||'')).sort((a,b)=>String(b.submittedAt).localeCompare(String(a.submittedAt)))[0];checkProfile();if(prior){lastId=prior.id;lastAnswer=prior.answer;viewed=true;}initialized=true;}
    if(lastAnswer===answer)return{saved:true,duplicate:true,id:lastId,message:'这份作答已留存，不重复计数。'};
    const id=root.IELTSRecords.makeId('practice');
    if(lastId)payload.assistance.answer=true;
    const input={...payload,id,kind:lastId?'correction':'original',parentId:lastId||null};
    const result=await root.IELTSRecords.record(input);lastAnswer=answer;lastId=result.record.id;viewed=true;start=Date.now();activeStart=clock();
    return{saved:true,id:lastId,message:'原始作答已留存，已关联实际学习日；查看解析后的改答记为订正。'};
   });return chain;
  }
  return{submit,expose};
 }
 function report(promise,element){promise.then(r=>{if(element?.isConnected&&r.message)element.textContent+=' '+r.message;}).catch(()=>{if(element?.isConnected)element.textContent+=' 作品未能保存，请先复制答案并检查备份中心。';});}
 return{create,report};
});
