'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const core=require('../assets/textbook-library-core.js'),profiles=require('../assets/profile-store.js');
const catalog=require('../materials/textbook-catalog.json'),offline=require('../assets/textbook-catalog.js'),importer=require('../tools/import-textbooks.cjs');
const ROOT=path.resolve(__dirname,'..');
function storage(){const values=new Map();return{get length(){return values.size;},key:i=>[...values.keys()][i]??null,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};}
const exam=edition=>catalog.documents.find(d=>d.type==='exam'&&d.editions.includes(edition));

test('本地索引完整、SHA去重、离线JS一致并保留剑12原编号',()=>{
  assert.deepEqual(offline,catalog);assert.ok(catalog.summary.sourcePdfCount>=42);assert.ok(catalog.summary.uniquePdfCount>=41);assert.ok(catalog.summary.duplicateCopies>=1);assert.equal(catalog.summary.uniquePdfCount,catalog.documents.length);assert.equal(catalog.documents.length,new Set(catalog.documents.map(d=>d.sha256)).size);assert.equal(catalog.summary.audioFileCount,catalog.audioFiles.length);if(!catalog.audioFiles.length)assert.equal(catalog.audio.status,'missing');
  for(let edition=4;edition<=19;edition++){const d=exam(edition);assert.ok(d,'edition '+edition);assert.equal(d.tests.length,4);assert.equal(d.academicStatus,edition<11?'academic-with-gt':'academic');}
  assert.deepEqual(exam(12).tests.map(t=>t.number),[5,6,7,8]);assert.ok(catalog.documents.reduce((n,d)=>n+d.tests.length,0)>=64);assert.ok(exam(11).sourceFiles.length>=2);
  for(const d of catalog.documents){assert.match(d.sha256,/^[0-9a-f]{64}$/);assert.equal(fs.statSync(path.join(ROOT,d.path)).size,d.bytes);if(d.verification){assert.ok(d.analysis.pageCount>0);if(d.coverPath)assert.ok(fs.existsSync(path.join(ROOT,d.coverPath)));}for(const a of d.anchors){assert.ok(a.page>=1&&a.page<=d.analysis.pageCount);assert.ok(a.evidence);assert.ok(d.verification.pagesReviewed.includes(a.page));}for(const t of d.tests){assert.ok(d.anchors.some(a=>a.testId===t.id&&a.page===t.startPage));assert.equal(t.audioStatus,'missing');}}
  assert.match(fs.readFileSync(path.join(ROOT,'.gitattributes'),'utf8'),/^\*\.pdf filter=lfs diff=lfs merge=lfs -text$/m);
});

test('只用实际核实的物理页链接PDF，并拒绝不安全路径和伪页码',()=>{
  const d=exam(19);assert.match(core.pdfUrl(d,17),/#page=17$/);assert.ok(core.pdfUrl(d,17).includes('%E5%89%91'));
  for(const bad of [0,-1,2.4,99999,'17'])assert.throws(()=>core.pdfUrl(d,bad));
  for(const bad of ['javascript:alert(1)','../../private/secret.pdf','materials/textbooks/../secret.pdf','materials\\textbooks\\x.pdf'])assert.throws(()=>core.pdfUrl({...d,path:bad},1));
});

test('单套打开只影响该套，整册/答案/解析/跨卷同义资料保守登记相关套',()=>{
  const d=exam(19);assert.deepEqual(core.impactedTests(catalog,d,{testId:d.tests[1].id}),[d.tests[1].id]);assert.equal(core.impactedTests(catalog,d).length,4);
  const explanation=catalog.documents.find(x=>x.type==='explanation'&&x.editions.includes(19));assert.deepEqual(core.impactedTests(catalog,explanation),d.tests.map(t=>t.id));
  const synonyms=catalog.documents.find(x=>x.filename==='剑10-剑20阅读同义替换词.pdf');assert.ok(core.impactedTests(catalog,synonyms).includes(d.tests[3].id));
  assert.ok(d.reserve);assert.ok(explanation.reserve);assert.ok(synonyms.reserve);
});

test('档案隔离、预览隔离且切换档案后旧页面不能误写',()=>{
  const s=storage(),manager=profiles.createManager(s,{idFactory:()=> 'p-materials123'}),legacy=core.createStore(manager.storage()),id=exam(19).tests[0].id;
  legacy.markMany([id],'seen','pdf-open','2026-10-24T10:00:00Z');const p=manager.create('另一学习者');manager.activate(p.id);const other=core.createStore(manager.storage());assert.equal(other.load().items[id],undefined);assert.throws(()=>legacy.markMany([id],'unseen'),/切换/);other.markMany([id],'unseen');manager.activate('legacy');assert.equal(core.createStore(manager.storage()).load().items[id].status,'seen');
  const preview=profiles.createManager(s,{preview:true}),previewStore=core.createStore(preview.storage());assert.equal(previewStore.load().items[id],undefined);previewStore.markMany([id],'unseen');assert.equal(legacy.load().items[id].status,'seen');
});

test('自报未见、备份合并与筛选不会抹掉既往曝光或生成成绩',()=>{
  const s=storage(),store=core.createStore(s),d=exam(19),id=d.tests[0].id;
  store.markMany(d.tests.map(t=>t.id),'unseen','manual','2026-10-24T09:00:00Z');assert.equal(core.exposure(d,store.load()).status,'unseen');
  store.markMany([id],'seen','pdf-open','2026-10-24T10:00:00Z');store.markMany([id],'unseen','manual','2026-10-24T11:00:00Z');assert.equal(core.exposure(d,store.load()).status,'seen');assert.equal(core.exposure(d,store.load()).corrected,true);assert.equal(core.matches(d,{exposure:'fresh'},store.load()),false);
  const backup=store.load();backup.items[id].firstSeenAt='2026-10-23T00:00:00.000Z';backup.items[id].updatedAt='2026-10-23T00:00:00.000Z';store.restore(JSON.stringify(backup));assert.equal(store.load().items[id].firstSeenAt,'2026-10-23T00:00:00.000Z');assert.equal(store.load().items[id].status,'unseen');assert.equal('band' in store.load().items[id],false);
  assert.equal(core.matches(d,{edition:'19',type:'exam',academic:'academic',reserve:'reserved'},store.load()),true);assert.equal(core.matches(d,{reserve:'training'},store.load()),false);
});

test('损坏或注入记录保留原值并拒绝覆盖，配额错误明确传播',()=>{
  const s=storage(),bad='{"schemaVersion":1,"items":{"__proto__":{}}}';s.setItem(core.KEY,bad);const store=core.createStore(s);assert.throws(()=>store.markMany([exam(19).id],'seen'));assert.equal(s.getItem(core.KEY),bad);
  const getter={schemaVersion:1,items:{}};Object.defineProperty(getter.items,'pdf-1234567890abcdef',{get(){throw Error('getter executed');},enumerable:true});assert.throws(()=>core.parseState(getter),/不支持/);
  assert.throws(()=>core.createStore({getItem:()=>null,setItem(){throw Error('quota');}}).markMany([exam(19).id],'seen'),/quota/);
});

test('文件类型/版本识别不猜Academic，人工页码必须有证据且在范围内',()=>{
  assert.deepEqual(importer.identify('剑桥雅思真题18.pdf'),{editions:[18],type:'exam'});assert.deepEqual(importer.identify('【456合辑】剑桥雅思真题精讲456合辑.pdf'),{editions:[4,5,6],type:'explanation'});assert.equal(importer.identify('剑10-剑20听力同义替换词.pdf').editions.length,11);
  assert.throws(()=>importer.verifyAnchors({anchors:[{page:12,label:'Test1',evidence:'checked'}]},10));assert.throws(()=>importer.verifyAnchors({anchors:[{page:2,label:'guess'}]},10));
});

test('真实导入按字节去重、保留旧文件，新增音频保持未核实且重扫不虚增副本',async t=>{
  const os=require('node:os'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ielts-textbook-test-')),project=path.join(temp,'project'),source=path.join(temp,'source');
  t.after(()=>{const resolved=path.resolve(temp),base=path.resolve(os.tmpdir());assert.ok(resolved.startsWith(base+path.sep)&&path.basename(resolved).startsWith('ielts-textbook-test-'));fs.rmSync(resolved,{recursive:true,force:true});});
  fs.mkdirSync(path.join(project,'assets'),{recursive:true});fs.mkdirSync(source,{recursive:true});
  function tinyPDF(label){const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>'];let out='%PDF-1.4\n% '+label+'\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(out));out+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}const xref=Buffer.byteLength(out);out+='xref\n0 4\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';return out;}
  const original=tinyPDF('first');fs.writeFileSync(path.join(source,'new-book.pdf'),original);fs.writeFileSync(path.join(source,'duplicate.pdf'),original);
  const first=await importer.run({root:project,source,log:()=>{}});assert.equal(first.summary.uniquePdfCount,1);assert.equal(first.summary.sourcePdfCount,2);assert.equal(first.summary.duplicateCopies,1);assert.equal(first.documents[0].academicStatus,'unconfirmed');assert.deepEqual(first.documents[0].anchors,[]);assert.equal(fs.readFileSync(path.join(source,'new-book.pdf'),'utf8'),original);
  fs.writeFileSync(path.join(source,'second-book.pdf'),tinyPDF('second'));fs.writeFileSync(path.join(source,'audio.mp3'),'unverified-audio-fixture');
  const second=await importer.run({root:project,source,log:()=>{}});assert.equal(second.summary.uniquePdfCount,2);assert.equal(second.audioFiles.length,1);assert.equal(second.audioFiles[0].alignmentStatus,'unverified');assert.ok(fs.existsSync(path.join(project,first.documents[0].path)));
  const rescanned=await importer.run({root:project,log:()=>{}});assert.equal(rescanned.summary.uniquePdfCount,2);assert.equal(rescanned.summary.sourcePdfCount,3);assert.equal(rescanned.summary.duplicateCopies,1);assert.equal(rescanned.audioFiles.length,1);
  const audioOnly=path.join(temp,'audio-only');fs.mkdirSync(audioOnly);fs.writeFileSync(path.join(audioOnly,'new-audio.mp3'),'second-unverified-audio');const audioRescan=await importer.run({root:project,source:audioOnly,log:()=>{}});assert.equal(audioRescan.summary.uniquePdfCount,2);assert.equal(audioRescan.audioFiles.length,2);
});

test('后期映射保留四套未见材料并明示缺音频',()=>{
  const mapping=require('../materials/textbook-training-map.json');assert.equal(mapping.recommendations.length,32);const final=mapping.recommendations.filter(x=>x.role==='reserved-unseen-assessment');assert.deepEqual(final.map(x=>x.week),[49,50,51,52]);assert.equal(new Set(final.map(x=>x.testId)).size,4);
  for(const row of mapping.recommendations){assert.equal(row.readinessClaim,false);assert.equal(row.listeningStatus,'blocked-missing-authentic-audio');const d=catalog.documents.find(x=>x.id===row.documentId);assert.ok(d.tests.some(t=>t.id===row.testId&&t.startPage===row.startPage));if(row.week>=37){assert.ok(row.readingPage);assert.ok(row.writingPage);}}
});

test('教材入口资源完整且无需fetch即可离线加载目录',()=>{
  const html=fs.readFileSync(path.join(ROOT,'本地教材.html'),'utf8');for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g)){const file=match[1].split(/[?#]/)[0];assert.ok(fs.existsSync(path.join(ROOT,file)),file);}
  assert.ok(html.includes('assets/profile-store.js'));assert.ok(html.includes('assets/textbook-catalog.js'));assert.doesNotMatch(fs.readFileSync(path.join(ROOT,'assets/textbook-library.js'),'utf8'),/fetch\(/);assert.match(fs.readFileSync(path.join(ROOT,'assets/textbook-library.js'),'utf8'),/IELTSProfiles\.storage\(\)/);
});
