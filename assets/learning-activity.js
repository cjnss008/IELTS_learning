'use strict';
(function(root){
 function dateKey(n){const d=new Date(n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
 function createClock({now=()=>Date.now(),active=()=>true,remaining=()=>Infinity,onUse=()=>{},onExhausted=()=>{}}={}){
  let state,last=now(),interaction=last,running=false;
  function reset(saved){const at=now();state={id:typeof saved?.id==='string'?saved.id:'activity-'+(root.crypto?.randomUUID?.()||at.toString(36)+'-'+Math.random().toString(36).slice(2)),startedAt:saved?.startedAt&&Number.isFinite(Date.parse(saved.startedAt))?saved.startedAt:new Date(at).toISOString(),activeSeconds:Number.isFinite(saved?.activeSeconds)?Math.max(0,Math.min(86400,saved.activeSeconds)):0,activityByDate:{...(saved?.activityByDate||{})}};last=at;interaction=at;return snapshot(false);}
  function tick(){const at=now(),delta=Math.max(0,Math.min(5,(at-last)/1000));if(running&&active()&&at-interaction<120000&&delta>0){const allowance=Math.max(0,remaining()),add=Math.min(delta,86400-state.activeSeconds,allowance),date=dateKey(at);state.activeSeconds=Math.round((state.activeSeconds+add)*1000)/1000;state.activityByDate[date]=Math.round(((state.activityByDate[date]||0)+add)*1000)/1000;onUse(add);if(allowance<=delta){running=false;onExhausted();}}last=at;}
  function snapshot(advance=true){if(advance)tick();return {id:state.id,startedAt:state.startedAt,endedAt:new Date(now()).toISOString(),activeSeconds:state.activeSeconds,activityByDate:{...state.activityByDate}};}
  function pause(){tick();running=false;return snapshot(false);}
  function resume(){last=now();running=true;}
  function take(){const value=pause();reset();return value;}
  function touch(){tick();interaction=now();}
  reset();return{tick,snapshot,pause,resume,take,touch,reset};
 }
 function browserClock(options={}){const doc=root.document,clock=createClock({...options,active:()=>!doc.hidden&&(!doc.hasFocus||doc.hasFocus())}),touch=()=>clock.touch(),visibility=()=>clock.tick(),timer=setInterval(()=>clock.tick(),1000);for(const e of ['pointerdown','keydown','input','wheel'])doc.addEventListener(e,touch,{passive:true});doc.addEventListener('visibilitychange',visibility);return {...clock,dispose(){clock.pause();clearInterval(timer);for(const e of ['pointerdown','keydown','input','wheel'])doc.removeEventListener(e,touch);doc.removeEventListener('visibilitychange',visibility);}};}
 function notify(){const detail={profileId:root.IELTSProfiles?.current().id,at:Date.now()};root.dispatchEvent?.(new CustomEvent('ielts:media-activity-changed',{detail}));try{const c=new BroadcastChannel(root.IELTSProfiles?.scopeKey('ielts52-media-activity-v1')||'ielts52-media-activity-v1');c.postMessage(detail);c.close();}catch{}}
 const api={createClock,browserClock,dateKey,notify};if(typeof module==='object'&&module.exports)module.exports=api;root.IELTSActivity=api;
})(globalThis);
