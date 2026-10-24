(function(root){
  'use strict';
  function inlineRanges(line){
    const markers=[...line.matchAll(/(^|[ \t]+)([A-Z])\.(?=[ \t]+\S)/g)].map(m=>({index:m.index+m[1].length,label:m[2]}));
    if(!markers.length||markers[0].index!==line.search(/\S/))return[[0,line.length]];
    const starts=[markers[0].index];let previous=markers[0],expected=previous.label.charCodeAt(0)+1;
    for(const marker of markers.slice(1)){
      if(marker.label.charCodeAt(0)!==expected)continue;
      const before=line.slice(previous.index+2,marker.index).trim();
      // An initial inside an ordinary sentence is not a section boundary.
      // A flattened, ascending section sequence must also end its prior text.
      if(!/[A-Za-z0-9]/.test(before)||!/[.!?]["')\]]*$/.test(before)||/\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St)\.$/i.test(before))continue;
      starts.push(marker.index);previous=marker;expected++;
    }
    if(starts.length<2)return[[0,line.length]];
    return starts.map((start,i)=>[i===0?0:start,starts[i+1]??line.length]);
  }
  function split(input){
    if(typeof input!=='string')return[];
    const spans=[];let lineStart=0;
    for(const match of input.matchAll(/\r\n|\r|\n/g)){
      spans.push([lineStart,match.index]);lineStart=match.index+match[0].length;
    }
    spans.push([lineStart,input.length]);const out=[];
    for(const [start,end]of spans){
      const line=input.slice(start,end);
      for(const [from,to]of inlineRanges(line)){
        const raw=line.slice(from,to),text=raw.trim();if(!text)continue;
        const sourceStart=start+from+raw.indexOf(text),sourceEnd=sourceStart+text.length;
        const separatorBefore=input.slice(out.at(-1)?.sourceEnd??0,sourceStart),newlines=(separatorBefore.match(/\r\n|\r|\n/g)||[]).length;
        out.push({text,label:/^([A-Z])\.[ \t]+/.exec(text)?.[1]||'',sourceStart,sourceEnd,separatorBefore,breakBefore:out.length?(newlines>1?'blank-line':newlines?'line':'section'):'start'});
      }
    }
    out.forEach((part,i)=>{part.separatorAfter=input.slice(part.sourceEnd,out[i+1]?.sourceStart??input.length);});return out;
  }
  function paragraphs(input){return split(input).map(part=>part.text);}
  const api=Object.freeze({split,paragraphs});root.IELTSPassageFormat=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
