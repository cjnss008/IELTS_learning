'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const U=require('../assets/american-pronunciations.js'),D=require('../assets/word-dictionary.js');
test('the compact American dictionary covers essential headwords and actual course inflections without the full dataset as a dependency',()=>{
 assert.equal(U.accent,'en-US');assert.ok(U.count>=14000);assert.ok(fs.statSync(path.join(__dirname,'../assets/american-pronunciations.js')).size<1000000);
 assert.equal(U.lookup('classmates','/ˈklɑːsmeɪts/').ipa,'/ˈklæsˌmeɪts/');assert.equal(U.lookup('car').ipa,'/kɑɹ/');assert.equal(U.lookup('teacher').ipa,'/ˈtitʃɚ/');
 assert.notEqual(U.lookup('US').ipa,U.lookup('us').ipa);assert.match(U.lookup('UK').ipa,/keɪ/);assert.ok(U.lookup('wi-fi password'));
});
test('legacy material hints choose existing American heteronym variants without generating new phonemes',()=>{
 for(const [word,hint,expected]of [['read','/riːd/','/ɹid/'],['read','/red/','/ɹɛd/'],['live','/lɪv/','/lɪv/'],['live','/laɪv/','/laɪv/'],['record','/ˈrekɔːd/','/ˈɹɛkɚd/'],['record','/rɪˈkɔːd/','/ɹɪˈkɔɹd/']]){const value=U.lookup(word,hint);assert.equal(value.ipa,expected);assert.ok(value.ipaVariants.includes(value.ipa));}
 assert.match(U.lookup('live').ipa,/laɪv.*lɪv/);assert.equal(U.lookup('invented-dictionary-gap'),null);
});
test('course dictionary converts source IPA, preserves meanings and permits explicitly labelled American AI supplements only',()=>{
 const original={word:'student',ipa:'/ˈstjuːdənt/',meaning:'本课学生',example:'I am a student.'},value=D.safeEntry(original);
 assert.equal(value.ipa,'/ˈstudənt/');assert.equal(value.ipaAccent,'en-US');assert.equal(value.meaning,original.meaning);assert.equal(original.ipa,'/ˈstjuːdənt/');
 assert.equal(D.safeEntry({word:'sourcegap',ipa:'/səʊsɡæp/'}).ipa,'');
 assert.equal(D.safeEntry({word:'sourcegap',ipa:'/sɔɹsɡæp/',ipaAccent:'en-US'}).ipa,'/sɔɹsɡæp/');
 const merged=D.mergeAI({word:'sourcegap',meaning:'原义',ipa:'',example:'A source gap remains.'},{word:'sourcegap',ipa:'/sɔɹsɡæp/',ipaAccent:'en-US',meaning:'新义'});assert.equal(merged.ipaAccent,'en-US');assert.equal(merged.meaning,'原义');
});

test('an existing verified American batch snapshot keeps its contextual heteronym pronunciation when another course sense is the fallback',()=>{
 const V=require('../assets/vocabulary-practice.js');
 const dictionary={lookup:()=>({word:'live',meaning:'居住',ipa:'/lɪv/',ipaAccent:'en-US',example:'I live here.'})};
 const material={id:'essential-snapshot',vocabulary:[{word:'live',meaning:'现场的',ipa:'/laɪv/',example:'We watched a live game.'}]};
 assert.equal(V.wordsFor(material,{dictionary})[0].ipa,'/laɪv/');
 const readings=D.safeEntry({word:'read'});assert.match(readings.ipa,/ɹid.*ɹɛd/);assert.equal(D.safeEntry(readings).ipa,readings.ipa);
});
