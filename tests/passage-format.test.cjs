'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),format=require('../assets/passage-format.js'),oral=require('../assets/oral-practice.js');
test('first-day source already has three single newlines and renders A B C as separate labelled paragraphs',()=>{
 const source=require('../assets/curriculum-data.js').materials.find(m=>m.id==='w01-read-1').passage;
 assert.equal((source.match(/\n/g)||[]).length,2);assert.equal(source.includes('\n\n'),false);
 const paragraphs=format.paragraphs(source);assert.equal(paragraphs.length,3);assert.deepEqual(paragraphs.map(p=>p.slice(0,2)),['A.','B.','C.']);
 assert.equal(paragraphs.join('\n'),source);assert.deepEqual(oral.splitReference(source),paragraphs);
});
test('unambiguous consecutive flattened section labels become paragraphs without dropping the labels or sentences',()=>{
 const source='A. This is the first part. B. This is the second part. C. This is the third part.';
 assert.deepEqual(format.paragraphs(source),['A. This is the first part.','B. This is the second part.','C. This is the third part.']);
 assert.equal(format.split(source)[1].breakBefore,'section');assert.equal(format.split(source).map(p=>p.text+p.separatorAfter).join(''),source);
});
test('honorifics, country abbreviations, single initials and ordinary letter mentions are not paragraph boundaries',()=>{
 for(const source of ['Mr. Wang meets Dr. Lee in the U.S. every week.','I chose option A. It was the easiest answer.','A. Brown met B. Green and C. White at the station.','A. B. C. are letters of the alphabet.','The choices are A. first B. second C. third.'])assert.deepEqual(format.paragraphs(source),[source]);
 assert.deepEqual(format.paragraphs('A. I met Mr. B. Green yesterday. B. He teaches English. C. We study together.'),['A. I met Mr. B. Green yesterday.','B. He teaches English.','C. We study together.']);
});
test('single and blank newline boundaries are retained distinctly, including CRLF and whitespace',()=>{
 const source='First line.\nSecond line.\n\nThird paragraph.\r\nFourth line.\r\n\r\nFifth paragraph.\n';
 const parts=format.split(source);assert.equal(parts.length,5);assert.deepEqual(parts.map(p=>p.breakBefore),['start','line','blank-line','line','blank-line']);
 assert.equal(parts[1].separatorBefore,'\n');assert.equal(parts[2].separatorBefore,'\n\n');assert.equal(parts[3].separatorBefore,'\r\n');assert.equal(parts[4].separatorBefore,'\r\n\r\n');assert.equal(parts.map(p=>p.text+p.separatorAfter).join(''),source);
});
test('oral recording preserves independent short source paragraphs and subdivides long paragraphs without joining adjacent sections',()=>{
 const source='A. Hello.\nB. '+Array(140).fill('word').join(' ')+'.\nC. Thank you.';
 const parts=oral.splitReference(source);assert.equal(parts[0],'A. Hello.');assert.equal(parts.at(-1),'C. Thank you.');assert.ok(parts.every(p=>p.split(/\s+/).length<=65));
 assert.ok(parts.every(p=>!/^([A-Z])\.$/.test(p)),'a paragraph label cannot become its own model recording');
 assert.equal(parts.join(' ').replace(/\s+/g,' '),source.replace(/\s+/g,' '));
 const letters='A\nHello. My name is Anna.\n\nB\nThis is my book.';
 assert.deepEqual(oral.splitReference(letters),['A\nHello. My name is Anna.','B\nThis is my book.']);
});
test('all training speaking references avoid empty label-only recording tasks while retaining source words',()=>{
 const data=require('../assets/curriculum-data.js');
 for(const material of data.materials.filter(m=>m.skill==='speaking'&&m.pool==='training')){
  const source=data.materials.find(m=>m.id===material.id.replace(/-speaking$/,'')).passage,parts=oral.splitReference(source);
  assert.ok(parts.every(p=>!/^([A-Z])\.?$/.test(p)),material.id);assert.ok(parts.every(p=>p.split(/\s+/).length<=65),material.id);
  assert.equal(parts.join(' ').replace(/\s+/g,' '),source.replace(/\s+/g,' '),material.id);
 }
});
test('separate B and C display paragraphs retain canonical offsets for word and sentence AI selection',()=>{
 const source=require('../assets/curriculum-data.js').materials.find(m=>m.id==='w01-read-1').passage,selection=require('../assets/selection-ai.js'),paragraphs=format.paragraphs(source),data={materialId:'w01-read-1',mode:'practice',lesson:{title:'First Day',text:source},groups:paragraphs.map((text,i)=>({index:i+1,text}))};
 for(const [index,value]of[[2,'Anna'],[3,'Mr. Wang']]){const from=paragraphs[index-1].indexOf(value),snapshot=selection.makeSnapshot(data,index,from,from+value.length);assert.ok(snapshot);assert.equal(source.slice(snapshot.start,snapshot.end),value);assert.equal(selection.matches(snapshot,data),true);}
});
