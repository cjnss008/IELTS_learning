 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Coach=require('../server/daily-coach.cjs'),course=require('../assets/course-data.js'),curriculum=require('../assets/curriculum-data.js');
test('glossary accepts every bound course word and phrase including Latin accents and acronym parentheses',()=>{
 const words=new Set([...course.vocab.map(item=>item.word),...curriculum.materials.flatMap(material=>(material.vocabulary||[]).map(item=>item.word))]);
 for(const word of words)assert.equal(Coach.glossary({word}).word,word.toLowerCase(),word);
 assert.equal(Coach.glossary({word:'  get   up  '}).word,'get up');
 assert.equal(Coach.glossary({word:'café'}).word,'café');assert.equal(Coach.glossary({word:'augmented reality (AR)'}).word,'augmented reality (ar)');
});
test('glossary rejects markup, paths, invalid types and overlong words without silently truncating',()=>{
 for(const word of ['',null,{},'x'.repeat(101),'x'.repeat(301),'<script>alert(1)</script>','../private/key','cat; whoami','cat\0dog','12345'])assert.throws(()=>Coach.glossary({word}),/英文词|字符/);
 const result=Coach.glossary({word:'student',context:'x'.repeat(2000),level:'A0'});assert.equal(result.context.length,1600);assert.equal(result.level,'A0');
});
