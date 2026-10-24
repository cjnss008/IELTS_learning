(function(){
 'use strict';
 const C=globalThis.IELTSCurriculumCoverage,data=globalThis.IELTSCurriculumData,report=C.summarize(data),map=new Map(data.materials.map(m=>[m.id,m]));
 const preview=Boolean(globalThis.location&&new URLSearchParams(globalThis.location.search).get('preview')==='1');
 C.render(document.getElementById('coverage'),data);
 function link(text,id){const a=document.createElement('a');a.textContent=text;a.href='今日学习.html?material='+encodeURIComponent(id)+(preview?'&preview=1':'');return a;}
 for(const w of report.lateWeeks){const tr=document.createElement('tr');for(const value of [w.week,w.newReading,w.newListening,w.speaking]){const td=document.createElement('td');td.textContent=value;tr.append(td);}document.getElementById('late-weeks').append(tr);}
 for(const s of report.authentic){
  const m=map.get(s.id),section=document.createElement('section'),h=document.createElement('h3');h.append(link(m.title,m.id));
  const p=document.createElement('p');p.textContent='第'+m.week+'周 · '+Math.round(m.audioDurationSeconds)+'秒 · '+(m.captionFile?'官方VTT已与转录比对':'只有官方英文转录，无逐句时间轴')+' · '+m.source.accent;
  const audio=document.createElement('audio');audio.controls=true;audio.preload='metadata';audio.src=m.audio;
  const policy=document.createElement('a');policy.href=m.source.rightsUrl;policy.textContent='NOAA 使用政策';policy.target='_blank';policy.rel='noopener';section.append(h,p,audio,policy);document.getElementById('authentic-audio').append(section);
 }
 const uncovered=document.getElementById('uncovered');
 const uncoveredStatus=document.getElementById('uncovered-status');if(uncoveredStatus)uncoveredStatus.textContent=report.uncoveredCount?'仍有'+report.uncoveredCount+'个常规候选未排课，清单如下。':'此前70个候选已绑定新原创例句、示范读音、三写三读与三轮测试，以及不同新句的语境用词题；当前没有未排课候选。排课覆盖仍不代表本人掌握。';
 for(const v of report.uncovered){const p=document.createElement('p');p.textContent=v.word+' — '+v.senseLabels.join('；')+' · ';p.append(link('查看第'+v.earliestWeek+'周来源',v.sourceIds[0]));uncovered.append(p);}
 const contexts=document.getElementById('lexical-contexts');if(contexts)for(const a of data.audit.lexicalContexts?.schedule||[]){const tr=document.createElement('tr'),day=document.createElement('td'),words=document.createElement('td'),training=document.createElement('td');day.textContent='第'+a.day+'天（第'+a.scheduledWeek+'周）';words.textContent=a.words.join(' · ');training.append(link('词汇流程',a.packId),document.createTextNode(' / '),link('新句迁移',a.contextId));tr.append(day,words,training);contexts.append(tr);}
 if(preview)for(const a of document.querySelectorAll?.('a[href]')||[]){const value=a.getAttribute('href');if(value&&!/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(value)&&!/[?&]preview=1(?:&|$)/.test(value)){const [before,fragment]=value.split('#');a.href=before+(before.includes('?')?'&':'?')+'preview=1'+(fragment?'#'+fragment:'');}}
})();
