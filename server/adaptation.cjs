'use strict';
const adaptive=require('../assets/adaptive-plan.js');
class AdaptationError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
function normalize(proposal,curriculum,dayNumber,secret='',candidates){
  try{const input=secret?JSON.parse(JSON.stringify(proposal),(_key,value)=>typeof value==='string'?value.split(secret).join('[已隐藏]'):value):proposal,clean=adaptive.normalizeProposal(input,curriculum,dayNumber);if(candidates!==undefined){if(!Array.isArray(candidates))throw Error('candidate list missing');const allowed=new Map(candidates.map(item=>[item.id,item]));for(const id of clean.reinforcementMaterialIds){const candidate=allowed.get(id),material=curriculum.materials.find(m=>m.id===id);if(!candidate||!material||candidate.skill!==material.skill||!clean.prioritySkills.includes(material.skill))throw Error('candidate not supplied');}}return clean;}
  catch(_){throw new AdaptationError(502,'INVALID_ADAPTATION','AI个性化建议无效：重点最多两项，每项须有具体策略；补强只限当前周次已审核的常规材料，不得使用未来、保留卷或承诺考试成绩。');}
}
module.exports={AdaptationError,normalize};
