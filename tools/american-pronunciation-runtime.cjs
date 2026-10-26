'use strict';
// Runtime selection chooses an existing, attributed pronunciation. Normalizing a
// legacy hint is solely for matching; a normalized hint is never returned as IPA.
function factory(data) {
  const normalize=value=>typeof value==='string'?value.trim().toLowerCase().replace(/\s+/g,' '):'';
  const variants=word=>{const literal=typeof word==='string'?word.trim():'',raw=data.entries[literal]||data.entries[normalize(word)];return typeof raw==='string'?[raw]:Array.isArray(raw)?raw.slice():[];};
  const comparable=value=>String(value||'').replace(/[\/\s.ˌ]/g,'').replace(/ɜː|ɝ/g,'ɚ').replace(/əʊ/g,'oʊ').replace(/ɒ/g,'ɑ').replace(/ɛ/g,'e').replace(/[rɹ]/g,'').replace(/ː/g,'');
  function distance(left,right){
    const a=[...comparable(left)],b=[...comparable(right)],row=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){let diagonal=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const before=row[j],stress=a[i-1]==='ˈ'||b[j-1]==='ˈ',cost=a[i-1]===b[j-1]?0:stress?.65:1;row[j]=Math.min(row[j]+(a[i-1]==='ˈ'?.65:1),row[j-1]+(b[j-1]==='ˈ'?.65:1),diagonal+cost);diagonal=before;}}
    return row[b.length];
  }
  function lookup(word,hint=''){
    const choices=variants(word);if(!choices.length)return null;
    let ipa=choices[0],selection='source-primary';
    if(hint===choices.join(' · ')){ipa=hint;selection='all-context-dependent-source-variants';}
    else if(hint){const scored=choices.map((value,index)=>({value,index,score:distance(hint,value)})).sort((a,b)=>a.score-b.score||a.index-b.index);ipa=scored[0].value;selection='closest-existing-source-variant';}
    // Without a material-specific hint, show every verified reading for a
    // heteronym instead of silently assigning one grammatical sense.
    else if((data.heteronyms||[]).includes(normalize(word))){ipa=choices.join(' · ');selection='all-context-dependent-source-variants';}
    return{ipa,ipaVariants:choices,ipaAccent:'en-US',ipaSource:'cmudict-or-attributed-supplement',selection};
  }
  return{schema:data.schema,accent:data.accent,count:Object.keys(data.entries).length,source:data.source,variants,lookup};
}
module.exports=factory;
