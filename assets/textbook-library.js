(function(){
  'use strict';
  const catalog=globalThis.IELTSTextbookCatalog,core=globalThis.IELTSTextbookLibrary,$=id=>document.getElementById(id);
  if(!catalog||!core){$('textbookNotice').textContent='教材索引未能加载。请保持 assets 与 materials 文件夹完整后刷新。';return;}
  const typeNames={exam:'真题主卷',explanation:'解析精讲',paraphrase:'同义改写'},academicNames={academic:'Academic 已确认','academic-with-gt':'Academic + GT 混合册',unconfirmed:'类别未确认'};
  let store=null,state={schemaVersion:1,items:Object.create(null)};const openDetails=new Set();
  function node(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
  function notify(message,error=false){$('textbookNotice').textContent=message;$('textbookNotice').classList.toggle('is-error',error);}
  try{globalThis.IELTSProfiles.mount($('textbookProfile'));store=core.createStore(globalThis.IELTSProfiles.storage());state=store.load();if(globalThis.IELTSProfiles.isPreview())notify('预览模式：曝光记录只写入本次会话，不影响正式学习档案。');}catch(e){notify('教材记录暂不可用：'+e.message+' PDF 仍可打开，请自行记录曝光。',true);}
  function filter(){return{edition:$('textbookEdition').value,type:$('textbookType').value,academic:$('textbookAcademic').value,reserve:$('textbookReserve').value,exposure:$('textbookExposure').value,search:$('textbookSearch').value};}
  function itemLabel(id){const item=state.items[id];if(!item)return'尚未登记';if(item.status==='unseen'&&item.firstSeenAt)return'自报未见 · 有已见历史';return item.status==='seen'?'已见':'自报未见';}
  function update(ids,status,source='manual'){
    if(!store)throw Error('浏览器记录不可用，请先恢复本地存储。');state=store.markMany(ids,status,source);render();return state;
  }
  function markButton(label,ids,status){const b=node('button',label);b.type='button';b.onclick=()=>{try{update(ids,status);notify(status==='seen'?'已保存当前档案的已见记录。':'已保存自报未见状态；已见历史保留，不能据此认定为陌生材料。');}catch(e){notify(e.message,true);}};return b;}
  function link(doc,page,label,anchor){const a=node('a',label,'textbook-link');a.href=core.pdfUrl(doc,page);a.target='_blank';a.rel='noopener';a.dataset.pdfPage=String(page);a.title='PDF 阅读器第 '+page+' 页（物理页码）';a.onclick=()=>{
      try{const targets=core.impactedTests(catalog,doc,anchor);update([doc.id,...targets],'seen',doc.type==='exam'?'pdf-open':'related-pdf-open');notify('已按当前打开范围记录为已见。PDF 可继续翻页；若看到其他试卷，请同时登记。');}
      catch(e){notify('曝光记录未能保存：'+e.message+' 请自行记录本次打开的资料。',true);}
    };return a;}
  function details(host,doc,label,key,className){const d=node('details',undefined,className);d.open=openDetails.has(key);d.append(node('summary',label));d.addEventListener('toggle',()=>{if(d.open)openDetails.add(key);else openDetails.delete(key);});host.append(d);return d;}
  function buildNavigation(host,doc){
    const actions=node('div',undefined,'textbook-card-actions');actions.append(link(doc,1,'打开整本 PDF（记录整册已见）'));
    const toc=doc.anchors.find(a=>a.kind==='contents');if(toc)actions.append(link(doc,toc.page,'目录 · PDF '+toc.page));host.append(actions);
    const tests=doc.tests||[];
    for(const t of tests){
      const row=node('section',undefined,'textbook-test'),heading=node('div',undefined,'textbook-test-heading');heading.append(node('strong',t.label),node('span',itemLabel(t.id)));row.append(heading);
      const links=node('div',undefined,'textbook-test-links');links.append(link(doc,t.startPage,'试卷起始 · '+t.startPage,{testId:t.id}));if(t.readingPage)links.append(link(doc,t.readingPage,'阅读 · '+t.readingPage,{testId:t.id}));if(t.writingPage)links.append(link(doc,t.writingPage,'写作 · '+t.writingPage,{testId:t.id}));row.append(links);
      const status=node('div',undefined,'textbook-status-buttons');status.append(markButton('我已见过',[t.id],'seen'),markButton('我尚未见过 / 更正',[t.id],'unseen'));row.append(status);host.append(row);
    }
    const answer=doc.anchors.find(a=>a.kind==='answers');if(answer){const d=details(host,doc,'完成独立作答后，再打开答案区',doc.id+':answers');d.append(node('p','答案区包含多套答案。打开后按保守规则记录整册试卷已见。','textbook-meta'),link(doc,answer.page,'听读答案区 · PDF '+answer.page));}
    if(!tests.length)host.append(node('p','本资料尚未建立逐试卷页码。打开原件后可在 PDF 阅读器查找；不把文件名当作考试类别证据。','textbook-meta'));
  }
  function card(doc){
    const card=node('article',undefined,'textbook-card'+(doc.reserve?' is-reserved':''));card.id=doc.id;
    const head=node('div',undefined,'textbook-card-head');if(doc.coverPath){const img=node('img',undefined,'textbook-cover');img.src=doc.coverPath;img.alt=doc.filename+' 封面或首页';img.loading='lazy';img.width=75;img.height=104;head.append(img);}
    const title=node('div');title.append(node('h3',doc.filename));const tags=node('div',undefined,'textbook-tags');tags.append(node('span',typeNames[doc.type]||doc.type,'textbook-tag'),node('span',academicNames[doc.academicStatus]||'类别未确认','textbook-tag'+(doc.academicStatus==='unconfirmed'?' is-warm':'')));if(doc.reserve)tags.append(node('span','末期保留 / 防提前曝光','textbook-tag is-warm'));title.append(tags);head.append(title);card.append(head);
    const summary=core.exposure(doc,state);card.append(node('p',(doc.analysis.pageCount?doc.analysis.pageCount+' 页':'页数未核实')+' · '+(doc.bytes/1024/1024).toFixed(1)+' MiB · '+(doc.analysis.textStatus==='extractable-sample'?'前部有可提取文本':'扫描件 / 文本稀少')+' · '+(doc.type==='exam'?'已见历史 '+summary.seen+'/'+summary.total+' 套':itemLabel(doc.id)),'textbook-meta'));
    if(doc.type==='exam')card.append(node('p','缺配套听力音频；可先使用读写部分。','textbook-meta'));
    const status=node('div',undefined,'textbook-status-buttons');status.append(markButton('整册已见',[doc.id,...core.impactedTests(catalog,doc)],'seen'),markButton('整册自报未见 / 更正',[doc.id,...(doc.tests||[]).map(t=>t.id)],'unseen'));card.append(status);
    if(doc.reserve){const reserve=details(card,doc,'保留材料：准备使用时再展开',doc.id+':reserve','textbook-reserve-box');reserve.append(node('p',doc.reserve.reason),node('p','展开此说明不会标记已见；点击 PDF 才登记。若已经看过，请先如实登记并另选末期材料。'));buildNavigation(reserve,doc);}else buildNavigation(card,doc);
    const facts=details(card,doc,'核实说明 · 来源 · SHA-256',doc.id+':facts');const text=node('div',undefined,'textbook-facts');text.append(node('p',doc.academicEvidence));
    for(const note of doc.notes)text.append(node('p',note));
    text.append(node('p','已核实物理页：'+(doc.verification?.pagesReviewed?.join('、')||'尚未核实')));
    text.append(node('p','来源文件：'+doc.sourceFiles.join('；')+(doc.sourceFiles.length>1?'（指纹相同，只保存一份原件）':'')));
    const code=node('code',doc.sha256);text.append(node('p','SHA-256：'),code);facts.append(text);return card;
  }
  function render(){
    const results=catalog.documents.filter(d=>core.matches(d,filter(),state));const fragment=document.createDocumentFragment();for(const doc of results)fragment.append(card(doc));$('textbookResults').replaceChildren(fragment);$('textbookResultCount').textContent=results.length+' / '+catalog.documents.length+' 份';$('textbookEmpty').hidden=results.length>0;
  }
  function download(){try{if(!store)throw Error('当前档案存储不可用。');const data=JSON.stringify(store.load(),null,2),url=URL.createObjectURL(new Blob([data],{type:'application/json'})),a=node('a');a.href=url;a.download='IELTS-教材曝光记录-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('已导出当前档案的教材曝光记录。');}catch(e){notify(e.message,true);}}
  for(const edition of [...new Set(catalog.documents.flatMap(d=>d.editions))].sort((a,b)=>a-b)){const option=node('option','剑桥 '+edition);option.value=String(edition);$('textbookEdition').append(option);}
  const summary=catalog.summary;for(const [value,label] of [[summary.uniquePdfCount,'份去重 PDF'],[catalog.documents.reduce((n,d)=>n+(d.tests||[]).length,0),'个试卷起始'],[summary.duplicateCopies,'份重复副本'],[summary.audioFileCount,'个配套音频文件']]){const div=node('div');div.append(node('strong',String(value)),node('span',label));$('textbookStats').append(div);}
  $('textbookAudio').textContent=catalog.audio.note;
  if(catalog.audioFiles.length){$('textbookAudioHeading').textContent='已发现音频 · 试卷对应待核实';$('textbookAudioFiles').hidden=false;for(const file of catalog.audioFiles){if(!/^materials\/textbook-audio\/[^/\\]+\.(mp3|m4a|wav|ogg|flac|aac|opus)$/i.test(file.path))continue;const li=node('li'),a=node('a',file.filename+'（待核实）');a.href=file.path.split('/').map(encodeURIComponent).join('/');a.target='_blank';a.rel='noopener';li.append(a);$('textbookAudioFiles').append(li);}}
  $('textbookProvenance').textContent='来源：'+catalog.provenance.source+'。'+catalog.provenance.authorization.scope+' '+catalog.provenance.processing+' 索引生成：'+catalog.generatedAt.slice(0,10)+'。';
  for(const id of ['textbookEdition','textbookType','textbookAcademic','textbookReserve','textbookExposure'])$(id).addEventListener('change',render);$('textbookSearch').addEventListener('input',render);
  $('textbookExport').onclick=download;
  $('textbookImport').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;try{if(!store)throw Error('当前档案存储不可用。');if(file.size>2*1024*1024)throw Error('教材记录文件不能超过 2 MiB。');state=store.restore(await file.text());render();notify('已合并当前档案的教材记录；首次已见历史保留。');}catch(e){notify('导入未完成：'+e.message,true);}finally{event.target.value='';}});
  const params=new URLSearchParams(location.search),edition=params.get('edition');if(edition&&[...$('textbookEdition').options].some(o=>o.value===edition))$('textbookEdition').value=edition;
  if(params.get('type')&&[...$('textbookType').options].some(o=>o.value===params.get('type')))$('textbookType').value=params.get('type');
  render();
})();
