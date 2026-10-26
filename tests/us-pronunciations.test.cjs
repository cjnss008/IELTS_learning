'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),U=require('../tools/build-us-pronunciations.cjs');
test('US ARPAbet conversion preserves rhotic consonants/vowels, source stress and vowel reductions',()=>{
 assert.equal(U.arpabetToIpa('K AA1 R'),'/kɑɹ/');assert.equal(U.arpabetToIpa('W ER1 K'),'/wɝk/');assert.equal(U.arpabetToIpa('T IY1 CH ER0'),'/ˈtitʃɚ/');assert.equal(U.arpabetToIpa('AH0 B AW1 T'),'/əˈbaʊt/');assert.equal(U.arpabetToIpa('IH0 G Z AE1 K T L IY0'),'/ɪɡˈzæktli/');assert.equal(U.arpabetToIpa('S K EH1 JH UW0 L'),'/ˈskɛdʒul/');assert.throws(()=>U.arpabetToIpa('UNKNOWN1'));
});
test('source-verified compound boundaries keep classmate and bedroom stress on the lexical component',()=>{
 const cmu=U.parseCmu('class K L AE1 S\nmate M EY1 T\nclassmate K L AE1 S M EY2 T\nbed B EH1 D\nroom R UW1 M\nbedroom B EH1 D R UW2 M\n'),policy={compoundBoundaries:{classmate:['class','mate'],bedroom:['bed','room']}};
 const c=cmu.get('classmate')[0].arpabet,b=cmu.get('bedroom')[0].arpabet;
 assert.equal(U.arpabetToIpa(c,{boundaries:U.sourceBoundaries('classmate',c,cmu,policy)}),'/ˈklæsˌmeɪt/');assert.equal(U.arpabetToIpa(b,{boundaries:U.sourceBoundaries('bedroom',b,cmu,policy)}),'/ˈbɛdˌɹum/');assert.deepEqual(U.sourceBoundaries('classmate','K L AE1 S M AE2 T',cmu,policy),[]);
});
test('all actual source variants survive and a common-sense primary choice never fabricates phonemes',()=>{
 const cmu=U.parseCmu('read(2) R IY1 D\nread R EH1 D\n'),seed={target:1,entries:[{word:'read',spellingVariants:[],source:{sourcePhonetic:'ri:d'},ipa:'/riːd/'}]},policy={spellingAliases:{},primaryVariants:{read:{variant:2,reason:'present-tense headword'}}},source={revision:'test-source'};
 const built=U.build(seed,cmu,{preferredVariantSets:[]},policy,{entries:{}},source);assert.equal(built.data.entries.read.ipa,'/ɹid/');assert.deepEqual(built.data.entries.read.ipaVariants,['/ɹid/','/ɹɛd/']);assert.deepEqual(built.data.entries.read.source.variants.map(v=>v.arpabet),['R EH1 D','R IY1 D']);assert.equal(built.data.entries.read.source.variant,2);
 assert.throws(()=>U.build({...seed,entries:[{word:'unlisted',source:{sourcePhonetic:'x'}}]},cmu,{preferredVariantSets:[]},policy,{entries:{}},source),/Missing verified/);
});
