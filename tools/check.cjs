'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const pages=['今日学习.html','开始学习.html','每日学习计划.html','AI设置.html','生词复习.html','写作与AI辅导.html','口语练习.html','基础入门.html','备份中心.html','学习课程.html','本地教材.html','单词分组学习.html','30分钟能力测试.html'];
let references=0,scripts=0;
for(const name of pages){const source=fs.readFileSync(path.join(root,name),'utf8');assert.ok(source.includes('charset="utf-8"')||source.includes('charset="UTF-8"'),name+' charset');for(const match of source.matchAll(/(?:src|href)="([^"]+)"/g)){const url=match[1];if(/^(https?:|#|data:)/.test(url)||url.includes('${')||url.includes("'+"))continue;let local=url.split(/[?#]/)[0];if(!local)continue;assert.ok(fs.existsSync(path.join(root,decodeURIComponent(local))),name+': missing '+local);references++;}for(const m of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){if(m[1].trim()){new vm.Script(m[1],{filename:name});scripts++;}}}
for(const name of fs.readdirSync(path.join(root,'assets')).filter(n=>n.endsWith('.js'))){new vm.Script(fs.readFileSync(path.join(root,'assets',name),'utf8'),{filename:name});scripts++;}
const course=require('../assets/course-data.js');assert.equal(course.lessons.length,52);assert.equal(course.vocab.length,360);
for(let i=1;i<=52;i++)for(const type of ['normal.mp3','slow.mp3','slow.srt'])assert.ok(fs.existsSync(path.join(root,'audio',`Day${String(i).padStart(2,'0')}_${type}`)));
for(const c of course.vocab)assert.ok(fs.existsSync(path.join(root,c.audio)),c.word+' audio');
const main=fs.readFileSync(path.join(root,'开始学习.html'),'utf8');const original=JSON.parse(main.match(/^const LESSONS=(.*);\r?$/m)[1]);for(const l of course.lessons)assert.equal(l.text,original[l.day-1].text,'generated data stale');
console.log(`Checked ${pages.length} pages, ${references} local links/assets, ${scripts} scripts, 52 lessons and 360 vocabulary audio files.`);
