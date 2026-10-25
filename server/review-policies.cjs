'use strict';
// The archived prompt is available only for explicit calibration comparisons.
// Ordinary learning always calls the current policy.
const current=require('./review.cjs'),legacy=require('./review-legacy-v3.cjs');
function variants(policy){return policy.ROUND_VARIANTS||['initial','adversarial'];}
function list(){return [current,legacy].filter((p,i,a)=>a.findIndex(x=>x.PROMPT_VERSION===p.PROMPT_VERSION)===i).map(p=>({version:p.PROMPT_VERSION,current:p===current,label:p===current?'当前评分标准':'旧版基线（仅校准对照）',roundVariants:variants(p)}));}
function get(version){if(version===undefined||version===null||version===''||version===current.PROMPT_VERSION)return current;if(version===legacy.PROMPT_VERSION)return legacy;const e=Error('该评分标准版本未在本机登记；未运行评分。');e.code='CALIBRATION_POLICY';e.status=400;throw e;}
module.exports={current,legacy,list,get,variants};
