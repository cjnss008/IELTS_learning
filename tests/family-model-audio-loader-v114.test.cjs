'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const F=require('./family-lessons-v95-fixture.cjs'),Oral=require('../assets/oral-practice.js');

const REFERENCE='A. This is the first spoken segment.\nB. This is the second spoken segment.';
const PARTS=Oral.spokenReferenceParts(REFERENCE,65);
const LEGACY_COMPILED_SHA256='202178f3eea6066b45a80ea2d3daa84c15ab54b45b8ab8a1e870328e8257aaaa';

function fixture(t){
 const pack=F.packageData(),root=path.resolve(pack.root),temp=path.resolve(os.tmpdir());
 assert.ok(root.startsWith(temp+path.sep)&&path.basename(root).startsWith('family95-fixture-'),'fixture must stay in the temporary directory');
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const release=F.copy(pack.release),dir=path.join(root,'fixtures'),row=release.materials.find(r=>r.id==='new-speaking'),material=JSON.parse(fs.readFileSync(path.join(dir,row.file),'utf8'));
 const base=F.copy(pack.data);base.materials=base.materials.filter(m=>!m.source?.familyLessonV95);delete base.familyLessonRelease;
 const essential={entries:release.units[0].targets.map(target=>({id:target.canonicalId,word:target.surface}))};
 const wave=fs.readFileSync(path.join(root,'audio/synthetic.wav'));
 const clips=PARTS.map((text,index)=>{const bytes=Buffer.from(wave);bytes.writeInt16LE(index+1,44);const src='audio/model-segment-'+index+'.wav';fs.writeFileSync(path.join(root,src),bytes);return{text,src,sha256:F.sha(bytes),bytes:bytes.length};});
 function compile(mutate=()=>{},beforeApply=()=>{}){
  const r=F.copy(release),m=F.copy(material);m.reference=REFERENCE;m.oralModelAudio=F.copy(clips);mutate(m,r);
  const speak=r.materials.find(entry=>entry.id===m.id),file=path.join(dir,speak.file),bytes=Buffer.from(JSON.stringify(m)+'\n');fs.writeFileSync(file,bytes);
  speak.fileSha256=F.sha(bytes);speak.materialContentHash=F.A.materialContentHash(m);speak.questionsSha256=F.sha(Buffer.from(JSON.stringify(m.questions||[])));
  const ref=r.units[0].tasks.find(task=>task.id==='speaking').materialRefs.find(item=>item.materialId===m.id);ref.contentHash=speak.materialContentHash;
  const review={schema:1,releaseId:r.id,decision:'approved-ordinary-six-module-content',reviewStatus:'root-ai-content-and-binding-reviewed-not-human',independentAssessmentEligible:false,targetBindingsReviewed:true,releasePayloadSha256:F.sha(Buffer.from(JSON.stringify({id:r.id,policy:r.policy,materials:r.materials,units:r.units}))),materials:F.copy(r.materials),units:r.units.map(unit=>({id:unit.id,unitPayloadSha256:F.sha(Buffer.from(JSON.stringify(unit)))}))};
  const reviewed=Buffer.from(JSON.stringify(review)+'\n');fs.writeFileSync(path.join(dir,'review.json'),reviewed);r.rootReview={file:'review.json',sha256:F.sha(reviewed)};fs.writeFileSync(path.join(dir,'release.json'),JSON.stringify(r)+'\n');
  beforeApply({root,clips,r,m});const data=F.copy(base),receipt=F.Loader.apply(data,{root,releasePath:'fixtures/release.json',player:F.P,essential});return{data,receipt};
 }
 return{pack,root,clips,base,essential,compile};
}

test('real loader admits a reviewed map only when each spoken part and local file pin match',t=>{
 assert.equal(PARTS.length,2);const f=fixture(t),{data,receipt}=f.compile(),speaking=data.materials.find(m=>m.id==='new-speaking'),unit=data.familyLessonRelease.units[0],ref=unit.tasks.find(task=>task.id==='speaking').materialRefs[0];
 assert.equal(receipt.active,true);assert.deepEqual(speaking.oralModelAudio,f.clips);assert.deepEqual(speaking.oralModelAudio.map(item=>item.text),PARTS);assert.equal(ref.contentHash,F.A.materialContentHash(speaking));
 for(const clip of speaking.oralModelAudio){const bytes=fs.readFileSync(path.join(f.root,clip.src));assert.equal(bytes.length,clip.bytes);assert.equal(F.sha(bytes),clip.sha256);}
});

test('missing, reordered, duplicate-path, or full-reference-as-one-part maps are rejected',async t=>{
 const cases=[
  ['missing a segment',m=>m.oralModelAudio.pop(),/All exact speaking segments require models/],
  ['full reference instead of first segment',m=>{m.oralModelAudio[0].text=REFERENCE;},/Exact local speaking segment pin required/],
  ['reordered segments',m=>m.oralModelAudio.reverse(),/Exact local speaking segment pin required/],
  ['one path reused for different segments',m=>{m.oralModelAudio[1].src=m.oralModelAudio[0].src;},/Exact local speaking segment pin required/]
 ];
 for(const [name,mutate,message] of cases)await t.test(name,sub=>{const f=fixture(sub);assert.throws(()=>f.compile(mutate),message);});
});

test('reviewed segment size, digest, and actual file bytes are checked independently',async t=>{
 const cases=[
  ['incorrect declared byte count',m=>{m.oralModelAudio[0].bytes++;},()=>{},/Speaking segment size changed/],
  ['incorrect declared sha256',m=>{m.oralModelAudio[0].sha256='0'.repeat(64);},()=>{},/Speaking segment audio changed/],
  ['file content altered without changing its size',()=>{},({root,clips})=>{const file=path.join(root,clips[0].src),bytes=fs.readFileSync(file);bytes[bytes.length-1]^=1;fs.writeFileSync(file,bytes);},/Speaking segment audio changed/],
  ['file length altered after approval',()=>{},({root,clips})=>{fs.appendFileSync(path.join(root,clips[0].src),Buffer.from([0]));},/Speaking segment size changed/]
 ];
 for(const [name,mutate,before,message] of cases)await t.test(name,sub=>{const f=fixture(sub);assert.throws(()=>f.compile(mutate,before),message);});
});

test('a legacy release without segment maps compiles to the exact pre-v114 bytes',t=>{
 const f=fixture(t),data=F.copy(f.base),receipt=F.Loader.apply(data,{root:f.root,releasePath:'fixtures/release.json',player:F.P,essential:f.essential});
 assert.equal(Object.hasOwn(data.materials.find(m=>m.id==='new-speaking'),'oralModelAudio'),false);
 // Digest obtained from the committed v113 loader running this same deterministic fixture.
 const compiled=Buffer.from(JSON.stringify({materials:data.materials,release:data.familyLessonRelease,receipt}));assert.equal(compiled.length,39491);assert.equal(F.sha(compiled),LEGACY_COMPILED_SHA256);
});
