'use strict';
const fs=require('node:fs'),path=require('node:path');
function transform(source){
 source=source.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,(whole,attrs,body)=>{
  if(/\bsrc\s*=\s*["']assets\/user-data-bootstrap\.js["']/i.test(attrs))return whole;
  const type=attrs.match(/\btype\s*=\s*(["'])(.*?)\1/i);if(type&&!['text/javascript','application/javascript','module'].includes(type[2].toLowerCase()))return whole;
  const clean=attrs.replace(/\btype\s*=\s*(["'])(.*?)\1/i,'').replace(/\bsrc\s*=/i,'data-src=');
  return '<script type="application/x-ielts-pending" data-ielts-script="1"'+(type?' data-ielts-type="'+type[2]+'"':'')+clean+'>'+body+'</script>';
 });
 if(!/<\/head>/i.test(source))throw Error('Page has no head');
 return source.includes('src="assets/user-data-bootstrap.js"')?source:source.replace(/<\/head>/i,'<script src="assets/user-data-bootstrap.js" defer></script></head>');
}
if(require.main===module){const folder=path.join(__dirname,'..');let count=0;for(const name of fs.readdirSync(folder).filter(n=>n.endsWith('.html')&&!n.endsWith('前备份.html'))){const file=path.join(folder,name),old=fs.readFileSync(file,'utf8'),next=transform(old);if(old!==next){fs.writeFileSync(file,next,'utf8');count++;}}console.log('Installed guarded user-data startup on '+count+' pages; historical backup files preserved.');}
module.exports={transform};
