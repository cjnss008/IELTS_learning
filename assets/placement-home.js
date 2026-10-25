(function(root){'use strict';const doc=root.document,box=doc?.getElementById('todayPlacement'),P=root.IELTSPlacement;if(!box||!P)return;
function node(tag,text,className){const e=doc.createElement(tag);e.textContent=text;if(className)e.className=className;return e;}
function entry(state,route,unverified=false){
 const order=P.compareSessions,latest=[...state.sessions].sort(order).at(-1),adopted=state.sessions.find(s=>s.id===state.adopted?.sessionId),selected=latest&&(!adopted||order(latest,adopted)>0)?latest:adopted||latest;
 const label=selected&&selected.status!=='complete'?'继续已保存的能力测评':selected&&selected.id!==adopted?.id?'查看评价并选择课程起点':route?'查看评价／重新测评':unverified?'查看测评／开始新测评':'开始 AI 能力测评';
 const a=node('a',label,'button '+(route||unverified?'secondary':'primary')),query=new URLSearchParams();if(root.IELTSProfiles?.isPreview?.())query.set('preview','1');if(selected)query.set('session',selected.id);a.href='入学测评.html'+(query.size?'?'+query.toString():'');return{link:a,selected};
}
function render(){box.replaceChildren();try{const state=P.load(),route=P.currentRoute(root.IELTSCurriculumData),next=entry(state,route,!!state.adopted&&!route);
 if(state.adopted&&!route){const verification=P.verificationStatus?.();box.append(node('h2','课程起点暂未核验'),node('p',verification?.reason||'正在核对本机保存的测评原稿和 AI 结论，已有学习记录保留。'));const retry=node('button','重新核对课程起点','button primary');retry.type='button';retry.addEventListener('click',async()=>{retry.disabled=true;try{await P.verifyAdopted();if(P.verificationStatus().state==='verified')root.location.reload();else render();}catch(error){box.append(node('p',error.message));retry.disabled=false;}});const backup=node('a','打开备份中心','button secondary');backup.href='备份中心.html'+(root.IELTSProfiles?.isPreview?.()?'?preview=1':'');box.append(retry,next.link,backup);return;}
 box.append(node('p',route?'YOUR STARTING POINT':'START WITH YOUR LEVEL','eyebrow'));
 box.append(node('h2',route?'你的课程起点：'+route.level+' · 第 '+route.startWeek+' 周':next.selected?.status==='complete'?'你的能力评价已保存，接下来选择课程起点':next.selected?'继续能力测评，找到适合你的起点':'第一次学习，先找到适合你的起点'));
 if(route)box.append(node('p',({A0:'基础起步（本项目标签）',A1:'入门：使用简单词句',A2:'基础：处理常见生活交流',B1:'中级：围绕熟悉话题连贯表达',B2:'中高级：理解较复杂内容并展开观点'})[route.level]+'。这是课程能力阶段，不是雅思分数。','course-small'));
 box.append(node('p',route?'已采用 AI 听说读写测评，课程从第 '+route.startDay+' 课起安排。此前基础课仍可回看，不算积压或已掌握；强项可以继续适级加练。':next.selected?.status==='complete'?'听说读写评价与原始作答已保存。查看结果并采用建议后，首页将从匹配的课程继续。':next.selected?'本次题目与已完成作答已保存，可从未完成的部分继续。采用结果后，首页将从匹配的课程开始。':'完成听说读写能力测评，由 AI 给出评价与课程建议。已经会的基础无需从第一课重复学；未测评时，下方暂按基础课程展示。'));
 if(route?.provisional)box.append(node('p','这次起点包含保守判断，后续学习会继续验证较弱项与自由口语能力。','course-small'));
 box.append(next.link);
 }catch(error){box.append(node('p','能力测评记录暂未载入：'+error.message+'。已有课程与原稿保留。'));}}
root.addEventListener('ielts:placement-changed',render);root.addEventListener('ielts:placement-verification-changed',render);render();
})(typeof globalThis!=='undefined'?globalThis:this);
