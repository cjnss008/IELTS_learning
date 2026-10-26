'use strict';
const esc = s => [...s].map(ch => '[]{}().*+?^$|'.includes(ch) || ch.charCodeAt(0) === 92 ? String.fromCharCode(92) + ch : ch).join('');
function quote(source, value) {
  if (typeof value !== 'string') return null;
  if (source.includes(value)) return value;
  for (const v of [value, value.replace(/^[A-Z][A-Za-z .'-]{0,35}:\s*/, '')]) {
    const tokens = v.match(/[A-Za-z0-9]+(?:['’][A-Za-z]+)*/g) || [];
    if (!tokens.length) continue;
    const pattern = tokens.map(esc).join('[\\s\\p{P}]*');
    const match = source.match(new RegExp('(?<![A-Za-z0-9])' + pattern + '(?![A-Za-z0-9])', 'iu'));
    if (match) return match[0];
  }
  return null;
}
function contains(source, word) { return new RegExp('(?:^|[^a-z0-9])' + esc(word) + '(?:$|[^a-z0-9])', 'i').test(source); }
function forms(word) {
  const irregular = {forget:['forgot','forgotten'],leave:['left'],buy:['bought'],teach:['taught'],pay:['paid'],take:['took','taken'],go:['went','gone'],give:['gave','given'],make:['made'],find:['found'],bring:['brought'],write:['wrote','written'],speak:['spoke','spoken'],eat:['ate','eaten'],see:['saw','seen'],choose:['chose','chosen'],send:['sent'],spend:['spent'],get:['got','gotten'],run:['ran'],child:['children'],person:['people'],man:['men'],woman:['women'],foot:['feet'],tooth:['teeth']};
  const first = word.split(' ')[0], tail = word.slice(first.length);
  return [...(irregular[first] || []), first+'s',first+'es',first+'ed',first+'ing',first.endsWith('y')?first.slice(0,-1)+'ies':'',first.endsWith('e')?first+'d':'',first.endsWith('e')?first.slice(0,-1)+'ing':'',first+first.slice(-1)+'ed',first+first.slice(-1)+'ing'].filter(Boolean).map(x => x+tail);
}
function repair(job, d) {
  const source = d.passage || d.transcript;
  if (typeof source !== 'string') return d;
  for (const q of d.questions || []) { const exact=quote(source,q.evidence); if(exact) q.evidence=exact; }
  for (const v of d.vocabulary || []) {
    if (typeof v.word !== 'string') continue;
    const candidate=[v.word,...forms(v.word.toLowerCase())].find(word=>contains(source,word));
    if (!candidate) continue;
    v.word=quote(source,candidate)||candidate;
    const prior=quote(source,v.example);
    if (prior && contains(prior,v.word)) v.example=prior;
    else { const sentence=source.split(/(?<=[.!?])\s+/).find(s=>contains(s,v.word)); if(sentence) v.example=sentence; }
  }
  if (job.id==='expand-w01-read-1') {
    const q=d.questions?.find(x=>x.id==='q6');
    if(q && q.prompt.includes('I am ____') && q.answers?.includes('happy')) q.prompt='How does Anna feel after speaking to Ms. Lee? Complete her sentence with ONE WORD from the passage: "I am ____."';
  }
  return d;
}
module.exports={repair,quote,forms};
