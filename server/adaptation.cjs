'use strict';
const adaptive=require('../assets/adaptive-plan.js');
class AdaptationError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
function normalize(proposal,curriculum,dayNumber,secret=''){
  try{const input=secret?JSON.parse(JSON.stringify(proposal),(_key,value)=>typeof value==='string'?value.split(secret).join('[已隐藏]'):value):proposal;return adaptive.normalizeProposal(input,curriculum,dayNumber);}
  catch(_){throw new AdaptationError(502,'INVALID_ADAPTATION','AI个性化建议无效：重点最多两项，每项须有具体策略；补强只限当前周次已审核的常规材料，不得使用未来、保留卷或承诺考试成绩。');}
}
module.exports={AdaptationError,normalize};
