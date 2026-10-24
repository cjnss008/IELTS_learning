'use strict';
// Authoring-only wrapper. Standard learning/build/check operations use Node alone.
const {spawn}=require('node:child_process'),path=require('node:path');
const argv=process.argv.slice(2),index=argv.indexOf('--python');
let python='python';if(index!==-1){if(!argv[index+1])throw Error('--python requires an executable path');python=argv[index+1];argv.splice(index,2);}
const child=spawn(python,[path.join(__dirname,'synthesize-independent-bank.py'),...argv],{cwd:path.join(__dirname,'..'),stdio:'inherit',windowsHide:true});
child.on('error',error=>{console.error('Authoring Python could not start: '+error.message);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
