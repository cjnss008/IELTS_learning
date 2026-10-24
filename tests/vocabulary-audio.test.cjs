 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Audio=require('../assets/vocabulary-audio.js'),D=require('../assets/word-dictionary.js'),course=require('../assets/course-data.js'),curriculum=require('../assets/curriculum-data.js');
const root=path.join(__dirname,'..');
test('every required word in all 144 vocabulary materials resolves to a verified local MP3',()=>{
 const dictionary=D.create({courseData:course,curriculumData:curriculum,audioData:Audio}),materials=curriculum.materials.filter(m=>m.type==='vocabulary'),words=new Set(materials.flatMap(m=>m.vocabulary.map(v=>D.normalize(v.word))));assert.equal(materials.length,144);assert.equal(words.size,667);assert.equal(Audio.count,words.size);
 for(const word of words){const entry=Audio.items[word];assert.ok(entry,word);assert.match(entry.audio,/^audio\/(words|vocabulary)\/[a-zA-Z0-9._-]+\.mp3$/);assert.ok(entry.durationSeconds>.1,word);const file=path.join(root,entry.audio),bytes=fs.readFileSync(file);assert.ok(bytes.length>500,word);assert.ok(bytes.subarray(0,3).toString()==='ID3'||bytes[0]===255&&bytes[1]>=224,word+' must be real MP3, not an LFS pointer');assert.equal(dictionary.lookup(word).audio,entry.audio);}
 assert.equal(Object.values(Audio.items).filter(item=>item.source==='generated').length,622);assert.equal(Object.values(Audio.items).filter(item=>item.source==='existing').length,45);
});
test('new audio carries text/configuration hashes and the first day requires no browser TTS',()=>{
 const words=['hello','student','class','classmate','teacher','too','same','say'];
 for(const word of words){const entry=Audio.items[word],meta=JSON.parse(fs.readFileSync(path.join(root,'audio/vocabulary/metadata',path.basename(entry.audio,'.mp3')+'.json'),'utf8'));assert.equal(meta.word,word);assert.equal(meta.textHash,crypto.createHash('sha256').update(word).digest('hex'));assert.match(meta.configurationHash,/^[a-f0-9]{64}$/);assert.equal(meta.voice,'en-GB-SoniaNeural');assert.equal(meta.durationSeconds,entry.durationSeconds);assert.equal(meta.synthetic,true);}
 const bad=D.create({entries:[{word:'unsafe',meaning:'test'}],audioData:{items:{unsafe:{audio:'https://untrusted.test/x.mp3'}}}});assert.equal(bad.lookup('unsafe').audio,'');
});
