'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
test('browser entrypoints provide the American dictionary before consumers run',()=>{
 for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.html'))){const html=fs.readFileSync(path.join(root,file),'utf8'),dictionary=html.indexOf('assets/word-dictionary.js');if(dictionary<0)continue;const american=html.indexOf('assets/american-pronunciations.js');assert.ok(american>=0&&american<dictionary,file+' must not rely on Node require fallback');}
 const context={};context.globalThis=context;vm.runInNewContext(fs.readFileSync(path.join(root,'assets/american-pronunciations.js'),'utf8'),context);vm.runInNewContext(fs.readFileSync(path.join(root,'assets/word-dictionary.js'),'utf8'),context);
 const word=context.IELTSWordDictionary.create().lookup('class');assert.ok(word);assert.match(word.ipa,/æ/,'browser lookup should use verified American class pronunciation');assert.equal(typeof context.require,'undefined');
});
