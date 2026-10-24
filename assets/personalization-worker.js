'use strict';
importScripts('vendor/ts-fsrs.js','assessment-core.js','personalization-core.js');
self.onmessage=event=>{try{const {memory,records,now}=event.data;const result=self.IELTSPersonalization.train(memory,{records,now});self.postMessage({ok:true,result});}catch(error){self.postMessage({ok:false,error:error?.message||'本地拟合未完成，原模型保留。'});}};
