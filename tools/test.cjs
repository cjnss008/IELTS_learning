'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..');
const files=fs.readdirSync(path.join(root,'tests')).filter(n=>n.endsWith('.test.cjs')).sort().map(n=>'tests/'+n);
const result=spawnSync(process.execPath,['--test',...files],{cwd:root,stdio:'inherit'});
process.exitCode=result.status??1;
