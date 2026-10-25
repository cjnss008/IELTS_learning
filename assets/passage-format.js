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
  function dialogue(input){
    if(typeof input!=='string')return[];
    const roles=new Set("mia|tom|tutor|ben|mei|woman|man|anna|leo|maya|daniel|li wei|sarah|maria|host|guide|david|receptionist|caller|lisa|owen|sam|liam|james|librarian|reader|nina|mark|li ming|lily|student|li|rosa|dan|visitor|wang|jo|jun|grandma|lecturer|chair|ana|lucy|teacher|omar|leah|curator|eli|ravi|lena|jon|alex|iris|noah|adviser|laura|john|dad|sara|learner|speaker|leila|marcus|priya|chen|lin|claire|mary|grandpa|question|answer|male|female".split('|'));
    const isRole=label=>{const key=label.toLowerCase().replace(/[.\s]+/g,' ').trim();return roles.has(key)||/^(?:narrator|narration|a|b|m|w|f|(?:student|speaker) [a-z0-9]+|(?:dr|mr|mrs|ms|prof) [a-z]+(?: [a-z]+)?)$/.test(key);};
    const marks=[...input.matchAll(/(^|\s)((?:Dr|Mr|Mrs|Ms|Prof)\.?[ \t]+[A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+)?|(?:Student|Speaker|STUDENT|SPEAKER)[ \t]+[A-Z0-9]+|[A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+)?|[A-Z]{1,16}):[ \t]*(?=\S)/g)].filter(match=>{if(!isRole(match[2]))return false;const before=input.slice(0,match.index+match[1].length),line=before.slice(Math.max(before.lastIndexOf('\n'),before.lastIndexOf('\r'))+1);return /^[ABMWF]$/.test(match[2])||!line.trim()||/[.!?]["')\]]*\s*$/.test(before);}).map(match=>({start:match.index+match[1].length,end:match.index+match[0].length,speaker:match[2]}));
    if(marks.length<2||marks[0].start!==input.search(/\S/)||new Set(marks.map(mark=>mark.speaker)).size<2)return[];
    const turns=marks.map((mark,index)=>({speaker:mark.speaker,text:input.slice(mark.end,marks[index+1]?.start??input.length).trim()}));
    return turns.every(turn=>turn.text)?turns:[];
  }
  const api=Object.freeze({split,paragraphs,dialogue});root.IELTSPassageFormat=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
