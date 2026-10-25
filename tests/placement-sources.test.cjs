'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {POLICY_VERSION,placementSourcePolicy:policy}=require('../server/placement-sources.cjs'),data=require('../assets/curriculum-data.js');
const listening=data.materials.filter(m=>m.skill==='listening'&&m.pool==='independent'),byId=new Map(listening.map(m=>[m.id,m])),clone=value=>structuredClone(value);

test('all 24 existing source metadata records remain in the library while low-level placement admits only the eight registered everyday scenarios',()=>{
 const before=JSON.stringify(listening);assert.equal(listening.length,24);
 for(const level of ['A1','A2']){const allowed=listening.filter(m=>m.level===level&&policy(m).eligible);assert.equal(allowed.length,4);assert.ok(allowed.every(m=>m.source.kind==='original'&&policy(m).priority===0));}
 const crow=byId.get('independent-human-us-crow-pitcher');assert.equal(crow.level,'A2');assert.equal(crow.source.genre,'fable');assert.equal(policy(crow).eligible,false);assert.match(policy(crow).reason,/A1\/A2/);assert.equal(JSON.stringify(listening),before);
});

test('registered scenario decisions retain exact authoring provenance and an independent requirement for the backend audio audit',()=>{
 const audit=JSON.parse(fs.readFileSync(path.join(__dirname,'../curriculum/independent-bank/audio-audit.json'),'utf8')),audited=new Map(audit.items.map(m=>[m.id,m]));
 for(const material of listening.filter(m=>m.source.kind==='original')){const result=policy(material);assert.equal(result.eligible,true,material.id);assert.equal(result.priority,0);assert.equal(result.basis.policyVersion,POLICY_VERSION);assert.equal(result.basis.registry,'curriculum/independent-bank/sources.json');assert.equal(result.basis.authoringSource,'tools/independent-bank.cjs');assert.equal(result.basis.reviewedContentHash,material.source.contentHash);assert.equal(result.basis.audioAuditRequired,true);assert.ok(audited.has(material.id));assert.equal(audited.get(material.id).audio,material.audio);assert.ok(fs.existsSync(path.join(__dirname,'..',material.audio)));}
});

test('a changed content version, relabelled level or an unknown original source cannot silently inherit an entry-level placement decision',()=>{
 const original=byId.get('independent-a2-listen-gb');for(const change of [m=>{m.level='A1';},m=>{m.source.contentHash='0'.repeat(64);},m=>{m.id='new-unregistered-daily-a2';},m=>{m.source.kind='adapted';},m=>{m.source.genre='fable';}]){const changed=clone(original);change(changed);assert.equal(policy(changed).eligible,false);}
 const unknown=clone(original);unknown.id='unknown-source';unknown.title='Easy A2 daily parcel conversation';unknown.source.genre='everyday-dialogue';assert.equal(policy(unknown).eligible,false,'title words are not a language or provenance score');
});

test('historical literary source types cannot become A1/A2 placement merely by changing their title, level or voice label',()=>{
 const historical=listening.filter(m=>m.source.kind==='public-domain-human-reading');assert.equal(historical.length,8);for(const material of historical)for(const level of ['A1','A2']){const changed=clone(material);changed.level=level;changed.title='A simple daily conversation';changed.audioSynthetic=true;changed.audioKind='synthetic';assert.equal(policy(changed).eligible,false,material.id);assert.equal(policy(changed).category,'historical-literature');}
});

test('higher-level contemporary scenarios have priority over traceable literature and a human label does not improve that priority',()=>{
 for(const level of ['B1','B2']){const contemporary=listening.filter(m=>m.level===level&&m.source.kind==='original'),literature=listening.filter(m=>m.level===level&&m.source.kind==='public-domain-human-reading');assert.equal(contemporary.length,4);assert.ok(literature.length>0);assert.ok(contemporary.every(m=>policy(m).priority===0));assert.ok(literature.every(m=>policy(m).eligible&&policy(m).priority===1));}
 const voiced=clone(byId.get('independent-a2-listen-gb'));voiced.audioKind='human';voiced.audioSynthetic=false;assert.equal(policy(voiced).priority,0);const incomplete=clone(byId.get('independent-human-au-emigrant'));delete incomplete.source.registry;assert.equal(policy(incomplete).eligible,false);incomplete.source.registry='curriculum/human-listening/sources/another-source.json';assert.equal(policy(incomplete).eligible,false);
});

test('source policy never admits core, gate, final, incomplete-review or unsupported-level records under a registered scenario ID',()=>{
 const original=byId.get('independent-a1-listen-gb');for(const change of [m=>{m.pool='training';},m=>{m.pool='gate';},m=>{m.pool='final';},m=>{m.fullTest=true;},m=>{m.form='B';},m=>{m.assessmentGroup='gate-04';},m=>{m.skill='reading';},m=>{m.level='A0';},m=>{m.source.verification='pending';}]){const changed=clone(original);change(changed);assert.equal(policy(changed).eligible,false);}assert.equal(policy(null).eligible,false);
});
