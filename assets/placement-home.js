(function(root){'use strict';const doc=root.document,box=doc?.getElementById('todayPlacement'),P=root.IELTSPlacement;if(!box||!P)return;
function node(tag,text,className){const e=doc.createElement(tag);e.textContent=text;if(className)e.className=className;return e;}
function render(){box.replaceChildren();try{const state=P.load(),route=P.currentRoute(root.IELTSCurriculumData),pending=state.sessions.some(s=>s.status!=='complete');
 if(state.adopted&&!route){const verification=P.verificationStatus?.();box.append(node('h2','课程起点暂未核验'),node('p',verification?.reason||'正在核对本机保存的测评原稿和 AI 结论，已有学习记录保留。'));const retry=node('button','重新核对课程起点','button primary');retry.type='button';retry.addEventListener('click',async()=>{retry.disabled=true;try{await P.verifyAdopted();if(P.verificationStatus().state==='verified')root.location.reload();else render();}catch(error){box.append(node('p',error.message));retry.disabled=false;}});const backup=node('a','打开备份中心','button secondary');backup.href='备份中心.html'+(root.IELTSProfiles?.isPreview?.()?'?preview=1':'');box.append(retry,backup);return;}
 box.append(node('p',route?'YOUR STARTING POINT':'START WITH YOUR LEVEL','eyebrow'));
 box.append(node('h2',route?'你的课程起点：'+route.level+' · 第 '+route.startWeek+' 周':'第一次学习，先找到适合你的起点'));
 box.append(node('p',route?'已采用 AI 听说读写测评，课程从第 '+route.startDay+' 课起安排。此前基础课仍可回看，不算积压或已掌握；强项可以继续适级加练。':'完成听说读写能力测评，由 AI 给出评价与课程建议。已经会的基础无需从第一课重复学；未测评时，下方暂按基础课程展示。'));
 if(route?.provisional)box.append(node('p','这次起点包含保守判断，后续学习会继续验证较弱项与自由口语能力。','course-small'));
 const a=node('a',route?'查看评价／重新测评':pending?'继续已保存的能力测评':'开始 AI 能力测评','button '+(route?'secondary':'primary'));const selected=route?.sessionId||state.sessions.slice().reverse().find(s=>s.status!=='complete')?.id,query=new URLSearchParams();if(root.IELTSProfiles?.isPreview?.())query.set('preview','1');if(selected)query.set('session',selected);a.href='入学测评.html'+(query.size?'?'+query.toString():'');box.append(a);
 }catch(error){box.append(node('p','能力测评记录暂未载入：'+error.message+'。已有课程与原稿保留。'));}}
root.addEventListener('ielts:placement-changed',render);root.addEventListener('ielts:placement-verification-changed',render);render();
})(typeof globalThis!=='undefined'?globalThis:this);
