'use strict';
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module'),file=path.join(__dirname,'lexical-retention-v88.test.cjs'),raw=fs.readFileSync(file,'utf8'),box={exports:{}},nativeRequire=createRequire(file),register=()=>{};
register.skip=register;register.only=register;
new Function('require','__dirname','module',raw+'\nmodule.exports={setup,dueFixture,initial,trainCorrect,openFirst,answerRetention,retentionRows,nativeRecords,readySource,H,A,M,Records,Year,D,Data,HOUR,DAY,copy};')(name=>name==='node:test'?register:nativeRequire(name),__dirname,box);
module.exports={...box.exports,root:path.resolve(__dirname,'..')};
