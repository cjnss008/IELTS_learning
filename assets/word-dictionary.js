(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.IELTSWordDictionary = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const normalize = value => typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';
  const clean = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '';
  const validWord = value => typeof value === 'string' && value.length <= 100 && /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’ ().-]*$/.test(value.trim());
  const American = root.IELTSAmericanPronunciations || (typeof require === 'function' ? require('./american-pronunciations.js') : null);
  // Legacy bridge transcriptions are source hints only. Verified American source
  // variants replace them at lookup; no spelling-to-IPA approximation is used.
  const BRIDGE = [
    ['hello','/həˈləʊ/','你好','Hello. I am a student.'],
    ['student','/ˈstjuːdənt/','学生','I am a student.'],
    ['class','/klɑːs/','班级；课','We are in the same class.'],
    ['classmate','/ˈklɑːsmeɪt/','同学','She is my classmate.'],
    ['teacher','/ˈtiːtʃə/','老师','He is a teacher.'],
    ['too','/tuː/','也','I am happy too.'],
    ['same','/seɪm/','相同的','We are in the same class.'],
    ['say','/seɪ/','说','Please say your name.'],
    ['friend','/frend/','朋友','She is my friend.'],
    ['happy','/ˈhæpi/','高兴的','I am happy.'],
    ['room','/ruːm/','房间','This is my room.'],
    ['good','/ɡʊd/','好的','This is a good book.'],
    ['first','/fɜːst/','第一；最初的','This is my first day.'],
    ['English','/ˈɪŋɡlɪʃ/','英语；英语的','I study English.'],
    ['day','/deɪ/','天；白天','Have a good day.'],
    ['language','/ˈlæŋɡwɪdʒ/','语言','English is a language.'],
    ['school','/skuːl/','学校','I walk to school.'],
    ['kind','/kaɪnd/','友善的；种类','My teacher is kind.'],
    ['club','/klʌb/','俱乐部','I am in the English club.'],
    ['Monday','/ˈmʌndeɪ/','星期一','We have class on Monday.'],
    ['morning','/ˈmɔːnɪŋ/','早晨','Good morning.'],
    ['team','/tiːm/','团队','We are a good team.'],
    ['ready','/ˈredi/','准备好的','I am ready for class.'],
    ['learn','/lɜːn/','学习','I learn English at school.'],
    ['from','/frɒm/','来自；从','I am from China.'],
    ['China','/ˈtʃaɪnə/','中国','I am from China.'],
    ['UK','/ˌjuː ˈkeɪ/','英国（缩写）','She is from the UK.'],
    ['yes','/jes/','是；对','Yes, I am ready.'],
    ['one','/wʌn/','一','I have one pen.'],
    ['two','/tuː/','二','I have two books.'],
    ['no','/nəʊ/','不；没有','No, I am not tired.'],
    ['new','/njuː/','新的','This is my new book.'],
    ['welcome','/ˈwelkəm/','欢迎','Welcome to our school.'],
    ['sorry','/ˈsɒri/','抱歉的','I am sorry.'],
    ['goodbye','/ˌɡʊdˈbaɪ/','再见','Goodbye. See you tomorrow.'],
    ['OK','/ˌəʊˈkeɪ/','好的；可以的','OK, I am ready.'],
    ['desk','/desk/','书桌','A pen is on the desk.'],
    ['small','/smɔːl/','小的','This room is small.'],
    ['pen','/pen/','钢笔；笔','This is my pen.'],
    ['book','/bʊk/','书','I have a book.'],
    ['cat','/kæt/','猫','The cat is on the chair.'],
    ['bag','/bæɡ/','包','This is my bag.'],
    ['on','/ɒn/','在……上面','The book is on the desk.'],
    ['chair','/tʃeə/','椅子','The chair is red.'],
    ['lamp','/læmp/','灯','The lamp is on the table.'],
    ['phone','/fəʊn/','电话','This is my phone.'],
    ['office','/ˈɒfɪs/','办公室','She is in the office.'],
    ['key','/kiː/','钥匙','I lost my key.'],
    ['neighbor','/ˈneɪbə/','邻居（美式拼写）','My neighbor is kind.'],
    ['son','/sʌn/','儿子','He is my son.'],
    ['doctor','/ˈdɒktə/','医生','My father is a doctor.'],
    ['dog','/dɒɡ/','狗','This is my dog.'],
    ['white','/waɪt/','白色的','The cup is white.'],
    ['ruler','/ˈruːlə/','尺子','I have a ruler.'],
    ['cup','/kʌp/','杯子','The cup is on the table.'],
    ['clock','/klɒk/','时钟','The clock is on the wall.'],
    ['brown','/braʊn/','棕色的','The bag is brown.'],
    ['table','/ˈteɪbəl/','桌子','The book is on the table.'],
    ['red','/red/','红色的','The bag is red.'],
    ['blue','/bluː/','蓝色的','The pen is blue.'],
    ['black','/blæk/','黑色的','The cat is black.'],
    ['hat','/hæt/','帽子','This is my hat.'],
    ['umbrella','/ʌmˈbrelə/','伞','I have an umbrella.'],
    ['lost','/lɒst/','丢失的；lose的过去式','I lost my bag.'],
    ['found','/faʊnd/','找到；find的过去式','I found a key.'],
    ['watch','/wɒtʃ/','手表；观看','I have a watch.'],
    ['big','/bɪɡ/','大的','This is a big room.'],
    ['this','/ðɪs/','这；这个','This is my book.'],
    ['that','/ðæt/','那；那个','That is my school.'],
    ['family','/ˈfæməli/','家庭','This is my family.'],
    ['father','/ˈfɑːðə/','父亲','My father is a doctor.'],
    ['mother','/ˈmʌðə/','母亲','My mother is a teacher.'],
    ['sister','/ˈsɪstə/','姐妹','This is my sister.'],
    ['bike','/baɪk/','自行车','I have a bike.'],
    ['car','/kɑː/','汽车','The car is blue.'],
    ['people','/ˈpiːpəl/','人；人们','Many people are in the park.'],
    ['house','/haʊs/','房屋','This is my house.'],
    ['nurse','/nɜːs/','护士','She is a nurse.'],
    ['doll','/dɒl/','玩偶','The doll is on the chair.'],
    ['parents','/ˈpeərənts/','父母','My parents are at home.'],
    ['brother','/ˈbrʌðə/','兄弟','This is my brother.'],
    ['uncle','/ˈʌŋkəl/','叔叔；伯伯；舅舅等','My uncle is a driver.'],
    ['aunt','/ɑːnt/','阿姨；姑姑；婶婶等','My aunt is a teacher.'],
    ['cousin','/ˈkʌzən/','堂兄弟姐妹；表兄弟姐妹','My cousin is a student.'],
    ['grandparents','/ˈɡrænpeərənts/','祖父母；外祖父母','My grandparents live near us.'],
    ['photo','/ˈfəʊtəʊ/','照片','This is a family photo.'],
    ['kitchen','/ˈkɪtʃɪn/','厨房','My father is in the kitchen.'],
    ['pet','/pet/','宠物','A dog can be a pet.'],
    ['dogs','/dɒɡz/','狗（复数）','I have two dogs.'],
    ['children','/ˈtʃɪldrən/','孩子们','The children are happy.'],
    ['cousins','/ˈkʌzənz/','堂表兄弟姐妹（复数）','My cousins are students.'],
    ['gate','/ɡeɪt/','大门','Meet me at the gate.'],
    ['early','/ˈɜːli/','早的；早地','I get up early.'],
    ['late','/leɪt/','迟的；晚的','I am late for class.'],
    ['clean','/kliːn/','干净的；清洁','The room is clean.'],
    ['young','/jʌŋ/','年轻的','My teacher is young.'],
    ['worker','/ˈwɜːkə/','工人；工作者','He is a worker.'],
    ['favorite','/ˈfeɪvərɪt/','最喜欢的（美式拼写）','Blue is my favorite colour.'],
    ['subject','/ˈsʌbdʒɪkt/','科目；主题','English is my favourite subject.'],
    ['math','/mæθ/','数学（美式）','I study math at school.'],
    ['free','/friː/','空闲的；免费的','I am free this afternoon.'],
    ['busy','/ˈbɪzi/','忙碌的','I am busy today.'],
    ['name','/neɪm/','名字','My name is Anna.'],
    ['home','/həʊm/','家；在家','I am at home.'],
    ['work','/wɜːk/','工作','I work in an office.'],
    ['green','/ɡriːn/','绿色的','The book is green.'],
    ['library','/ˈlaɪbrəri/','图书馆','I read in the library.'],
    ['classroom','/ˈklɑːsruːm/','教室','Our classroom is clean.'],
    ['Chinese','/ˌtʃaɪˈniːz/','汉语；中国的','I speak Chinese.'],
    ['woman','/ˈwʊmən/','女人','The woman is a doctor.'],
    ['librarian','/laɪˈbreəriən/','图书馆员','The librarian helps me find a book.'],
    ['floor','/flɔː/','地板；楼层','The library is on the first floor.'],
    ['cook','/kʊk/','做饭；厨师','I cook dinner at home.'],
    ['driver','/ˈdraɪvə/','司机','My uncle is a driver.'],
    ['breakfast','/ˈbrekfəst/','早餐','I have breakfast at seven.'],
    ['walk','/wɔːk/','步行','I walk to school.'],
    ['lunch','/lʌntʃ/','午餐','I have lunch at school.'],
    ['dinner','/ˈdɪnə/','晚餐','We cook dinner together.'],
    ['homework','/ˈhəʊmwɜːk/','家庭作业','I do my homework after school.'],
    ['weekend','/ˌwiːkˈend/','周末','I visit my family at the weekend.'],
    ['visit','/ˈvɪzɪt/','拜访；参观','I visit my friend.'],
    ['football','/ˈfʊtbɔːl/','足球','I play football at school.'],
    ['start','/stɑːt/','开始','The class starts at nine.'],
    ['finish','/ˈfɪnɪʃ/','结束；完成','I finish my homework.'],
    ['study','/ˈstʌdi/','学习','I study English every day.'],
    ['always','/ˈɔːlweɪz/','总是','I always have breakfast.'],
    ['sometimes','/ˈsʌmtaɪmz/','有时','I sometimes walk to school.'],
    ['bus','/bʌs/','公共汽车','I go to school by bus.'],
    ['run','/rʌn/','跑','I run in the park.'],
    ['usually','/ˈjuːʒuəli/','通常','I usually get up at seven.'],
    ['often','/ˈɒfən/','经常','I often read at home.'],
    ['read','/riːd/','阅读（原形；过去式读 /red/）','I read a book every day.'],
    ['I','/aɪ/','我','I am a student.'],
    ['you','/juː/','你；你们','You are my friend.'],
    ['we','/wiː/','我们','We are students.'],
    ['he','/hiː/','他','He is a teacher.'],
    ['she','/ʃiː/','她','She is a student.'],
    ['it','/ɪt/','它','It is a book.'],
    ['they','/ðeɪ/','他们；她们；它们','They are friends.'],
    ['am','/æm/','是（用于I）','I am happy.'],
    ['are','/ɑː/','是（用于you/we/they等）','You are ready.'],
    ['is','/ɪz/','是（用于he/she/it等）','She is a teacher.'],
    ['a','/ə/','一个（不定冠词，弱读）','I have a pen.'],
    ['the','/ðə/','这／那（定冠词，常见弱读）','The book is on the desk.'],
    ['and','/ænd/','和','Anna and Li Ming are friends.'],
    ['in','/ɪn/','在……里面','I am in the room.'],
    ['my','/maɪ/','我的','This is my book.'],
    ['your','/jɔː/','你的；你们的','What is your name?']
  ].map(([word, ipa, meaning, example]) => ({word, ipa, meaning, example, source:'bridge'}));

  function isAmericanIpa(word,ipa) {
    const choices=American?.variants(word) || [];
    return Boolean(ipa && (choices.includes(ipa) || choices.length > 1 && choices.join(' · ') === ipa));
  }
  function safeAudioPath(value) {
    if (typeof value !== 'string' || value.length > 200) return '';
    const audio=value.trim();
    return /^audio\/(?:words|vocabulary)\/[A-Za-z0-9._-]+\.mp3$/.test(audio) && !audio.includes('..') ? audio : '';
  }
  function senseLabels(value) { return String(value || '').split(/[;；、\n]/).map(label=>label.replace(/^(?:v|vt|vi|adj|adv|n)\.\s*/i,'').trim()).filter(Boolean); }
  function singlePos(value) {
    const aliases={v:'verb',vt:'verb',vi:'verb',verb:'verb',adj:'adjective',adjective:'adjective',n:'noun',noun:'noun',adv:'adverb',adverb:'adverb'},values=new Set((String(value||'').toLowerCase().match(/[a-z]+/g)||[]).map(key=>aliases[key]).filter(Boolean));
    return values.size===1?[...values][0]:'';
  }
  function indexedAudioChoice(word,ipa,supplied,hint={}) {
    const data=supplied || root.IELTSVocabularyAudio || (typeof require==='function'?require('./vocabulary-audio.js'):{}),entry=data?.items?.[normalize(word)];
    if(!entry || typeof entry!=='object' || Array.isArray(entry))return{audio:'',blocked:false,status:'missing'};
    const base=safeAudioPath(entry.audio),fallback=()=>({audio:base,blocked:!base,status:base?'default':'invalid-default',source:base?entry:null});
    if(entry.senseVariants===undefined)return fallback();
    const variants=entry.senseVariants,verified=American?.variants(word)||[],seenIpa=new Set(),seenAudio=new Set();
    if(!Array.isArray(variants)||variants.length>32)return{audio:'',blocked:true,status:'invalid-variant-registry'};
    for(const item of variants){
      const audio=safeAudioPath(item?.audio),valid=item&&typeof item==='object'&&!Array.isArray(item)&&typeof item.ipa==='string'&&verified.includes(item.ipa)&&audio&&audio!==base&&!seenIpa.has(item.ipa)&&!seenAudio.has(audio)&&(!item.locale||item.locale==='en-US')&&(!item.voice||typeof item.voice==='string'&&/^en[-_]US(?:[-_]|$)/i.test(item.voice))&&(item.senseLabels===undefined||Array.isArray(item.senseLabels)&&item.senseLabels.length<=24&&item.senseLabels.every(label=>typeof label==='string'&&label.trim()&&label.length<=800));
      if(!valid)return{audio:'',blocked:true,status:'invalid-or-duplicate-variant'};
      seenIpa.add(item.ipa);seenAudio.add(audio);
    }
    const chosen=item=>({audio:safeAudioPath(item.audio),ipa:item.ipa,blocked:false,status:'sense-variant',source:item});
    const hints=typeof hint==='string'?{meaning:hint}:hint||{},labels=senseLabels(hints.meaning),pos=singlePos(hints.pos);
    const matchesSense=item=>{const itemPos=singlePos(item.pos),labelsMatch=labels.some(label=>[...(item.senseLabels||[]),...senseLabels(item.meaning)].includes(label));return labelsMatch&&(!pos||!itemPos||pos===itemPos)||!labels.length&&pos&&itemPos===pos;};
    const primary=American?.lookup(word)?.ipa,primaryIpa=verified.includes(primary)?primary:'';
    if(hints.preferSense){const matches=variants.filter(matchesSense);if(matches.length===1)return chosen(matches[0]);if(matches.length>1)return{audio:'',blocked:true,status:'ambiguous-sense'};const result=fallback();if(primaryIpa)result.ipa=primaryIpa;return result;}
    const matches=variants.filter(item=>ipa&&item.ipa===ipa&&isAmericanIpa(word,ipa));
    if(matches.length===1)return chosen(matches[0]);
    if(ipa&&verified.includes(ipa)&&primaryIpa&&ipa!==primaryIpa)return{audio:'',blocked:true,status:'unregistered-pronunciation'};
    return fallback();
  }

  function safeEntry(value, options = {}) {
    if (!value || !validWord(value.word)) return null;
    const audio = safeAudioPath(value.audio);
    const sourceIpa = clean(value.ipa || value.phonetic,160);
    const sense=!sourceIpa?indexedAudioChoice(value.word,'',options.audioData,{meaning:value.meaning,pos:value.pos,preferSense:true}):null;
    const pronunciation = American?.lookup(value.word,sense?.ipa || sourceIpa);
    const labelledAmerican = value.ipaAccent === 'en-US' || value.accent === 'en-US';
    const ipa = pronunciation?.ipa || (labelledAmerican ? sourceIpa : American ? '' : sourceIpa);
    return {word:clean(value.word,100), meaning:clean(value.meaning,800), ipa, ipaAccent:ipa && (pronunciation || labelledAmerican) ? 'en-US' : '', ipaVariants:pronunciation?.ipaVariants || (ipa ? [ipa] : []), ipaSource:pronunciation?.ipaSource || (labelledAmerican ? 'provided-American-supplement' : ''), example:clean(value.example || value.context,1600), exampleTranslation:clean(value.exampleTranslation,1600), audio, materialId:clean(value.materialId,160), source:clean(value.source,80)};
  }
  function indexedAudioFor(word, ipa, supplied, hint = {}) { return indexedAudioChoice(word,ipa,supplied,hint).audio; }
  // Only the current public curriculum's fully frozen JSON graph may supply a
  // reusable sub-index. Course entries are indexed on every call; custom
  // entries use the original path. Audio and user state are never cached here.
  const frozenPublicIndexes = new WeakMap();
  const indexMapConstructor = Map;
  const indexMapSizeGetter = Object.getOwnPropertyDescriptor(Map.prototype,'size')?.get;
  const indexMapIterator = Object.getPrototypeOf(new Map().keys());
  const indexMapIteratorNext = Object.getOwnPropertyDescriptor(indexMapIterator,'next')?.value;
  const indexPrototypeMethods = [
    [Array.prototype,'forEach',Array.prototype.forEach],
    [Array.prototype,'push',Array.prototype.push],
    [Array.prototype,'pop',Array.prototype.pop],
    [Array.prototype,'concat',Array.prototype.concat],
    [Object.prototype,'hasOwnProperty',Object.prototype.hasOwnProperty],
    [Map.prototype,'get',Map.prototype.get],
    [Map.prototype,'set',Map.prototype.set],
    [Map.prototype,'has',Map.prototype.has],
    [Map.prototype,'keys',Map.prototype.keys],
    [String.prototype,'trim',String.prototype.trim],
    [String.prototype,'toLowerCase',String.prototype.toLowerCase],
    [String.prototype,'replace',String.prototype.replace],
    [RegExp.prototype,'test',RegExp.prototype.test]
  ];
  const indexInheritedFields = ['materials','vocab','vocabulary','word','pos','partOfSpeech','id','entries','courseData','curriculumData','toJSON'];
  function stableIndexPrototypes() {
    if (Map!==indexMapConstructor) return false;
    if (Object.getOwnPropertyDescriptor(Map.prototype,'size')?.get!==indexMapSizeGetter || Object.getOwnPropertyDescriptor(indexMapIterator,'next')?.value!==indexMapIteratorNext) return false;
    if (Object.getOwnPropertyDescriptor(Object.prototype,Symbol.isConcatSpreadable) || Object.getOwnPropertyDescriptor(Array.prototype,Symbol.isConcatSpreadable)) return false;
    for (let i=0;i<indexPrototypeMethods.length;i++) {
      const row=indexPrototypeMethods[i], descriptor=Object.getOwnPropertyDescriptor(row[0],row[1]);
      if (!descriptor || descriptor.value!==row[2]) return false;
    }
    for (let i=0;i<indexInheritedFields.length;i++) {
      const key=indexInheritedFields[i];
      if (Object.getOwnPropertyDescriptor(Object.prototype,key) || key!=='entries' && Object.getOwnPropertyDescriptor(Array.prototype,key)) return false;
    }
    return true;
  }
  function deeplyFrozenJSON(value) {
    const pending=[value], seen=new WeakSet();
    while (pending.length) {
      const item=pending.pop(), type=typeof item;
      if (item===null || type==='string' || type==='boolean' || type==='number' && Number.isFinite(item)) continue;
      if (type!=='object' || !Object.isFrozen(item)) return false;
      if (seen.has(item)) continue;
      seen.add(item);
      const array=Array.isArray(item), proto=Object.getPrototypeOf(item);
      if (array ? proto!==Array.prototype : proto!==Object.prototype && proto!==null) return false;
      const keys=Reflect.ownKeys(item);
      if (array) {
        if (keys.length!==item.length+1) return false;
        for (let i=0;i<item.length;i++) if (!Object.prototype.hasOwnProperty.call(item,i)) return false;
      }
      for (const key of keys) {
        if (array && key==='length') continue;
        const descriptor=Object.getOwnPropertyDescriptor(item,key);
        if (typeof key!=='string' || key==='toJSON' || !descriptor?.enumerable || !('value' in descriptor)) return false;
        pending.push(descriptor.value);
      }
    }
    return true;
  }
  function publicIndexEligible(curriculum,options) {
    if (!curriculum || !Object.isFrozen(curriculum) || Object.getPrototypeOf(options)!==Object.prototype || !stableIndexPrototypes()) return false;
    const entry=Object.getOwnPropertyDescriptor(options,'entries');
    if (entry && (!('value' in entry) || entry.value!=null)) return false;
    const publicData=Object.getOwnPropertyDescriptor(root,'IELTSCurriculumData');
    const materials=Object.getOwnPropertyDescriptor(curriculum,'materials');
    return Boolean(publicData && 'value' in publicData && publicData.value===curriculum && materials && 'value' in materials && Array.isArray(materials.value) && Object.isFrozen(materials.value));
  }
  function create(options = {}) {
    const index = new Map(), resolved = new Map();
    const audioData = options.audioData || root.IELTSVocabularyAudio || (typeof require === 'function' ? require('./vocabulary-audio.js') : {});
    const audioItems = audioData.items || {};
    function add(raw, metadata, target = index) {
      const value={...raw,...metadata};if(!validWord(value.word))return;
      const key = normalize(clean(value.word,100)), values = target.get(key) || [];
      values.push({value,pos:clean(raw.pos||raw.partOfSpeech,120)});target.set(key,values);
    }
    BRIDGE.forEach(item => add(item));
    const course = options.courseData || root.IELTSCourse || root.IELTSCourseData || {};
    const old = Array.isArray(course.vocab) ? course.vocab : Object.values(course.vocab || {}).flat();
    old.forEach(item => add(item,{source:'course'}));
    const curriculum = options.curriculumData || root.IELTSCurriculumData || {};
    const eligible = publicIndexEligible(curriculum,options);
    let publicIndex = eligible && frozenPublicIndexes.get(curriculum);
    if (!publicIndex && eligible && deeplyFrozenJSON(curriculum)) {
      const built = new Map();
      (curriculum.materials || []).forEach(material => (material.vocabulary || []).forEach(item => add(item,{materialId:material.id,source:'curriculum'},built)));
      frozenPublicIndexes.set(curriculum,built);
      publicIndex = built;
    } else if (!publicIndex) {
      (curriculum.materials || []).forEach(material => (material.vocabulary || []).forEach(item => add(item,{materialId:material.id,source:'curriculum'})));
    }
    (options.entries || []).forEach(item => add(item));
    function lookup(word, context = '', materialId = '') {
      const key = normalize(word);let values=resolved.get(key);
      if(!values){const prefix=index.get(key)||[],rows=publicIndex?prefix.concat(publicIndex.get(key)||[]):prefix;values=rows.map(row=>{const item=safeEntry(row.value,{audioData});if(item&&row.pos)item.pos=row.pos;return item;}).filter(Boolean);resolved.set(key,values);}
      if (!values.length) return {...safeEntry({word:clean(word,100)}),word:clean(word,100),meaning:'',example:'',exampleTranslation:'',audio:'',materialId:'',source:'missing',complete:false};
      const text = normalize(context);
      const score = item => (materialId && item.materialId === materialId ? 1000 : 0) + (item.source === 'curriculum' ? 10 : item.source === 'course' ? 5 : 0) + (item.example && text.includes(normalize(item.example)) ? 100 : 0);
      const sorted = values.slice().sort((a,b) => score(b)-score(a));
      const result = {...sorted[0]};
      result.contextBound=Boolean(materialId&&result.materialId===materialId);
      result.meaningScope=result.contextBound?'material-context':'general-reference';
      for (const field of ['meaning','ipa','example','exampleTranslation']) if (!result[field]) result[field] = sorted.find(item => item[field])?.[field] || '';
      // Keep a pronunciation explicitly bound to the current material; otherwise
      // use the verified word index before an unrelated legacy audio file.
      const boundAudio = materialId ? values.find(item => item.materialId === materialId && item.audio)?.audio : '';
      const indexed = indexedAudioChoice(result.word,result.ipa,audioData,{meaning:result.meaning});
      result.audio = boundAudio || indexed.audio || (indexed.blocked ? '' : result.audio || sorted.find(item => item.audio)?.audio || '');
      result.complete = Boolean(result.meaning && result.ipa && result.example);
      return result;
    }
    let size=index.size;
    if (publicIndex) {
      size=publicIndex.size;
      for (const key of index.keys()) if (!publicIndex.has(key)) size++;
    }
    return {lookup, size};
  }
  function mergeAI(local, result) {
    const item = safeEntry(result?.entry || result?.glossary || result);
    if (!item || normalize(item.word) !== normalize(local.word)) throw Error('查词结果与当前单词不一致。');
    if (!item.ipa && !item.meaning && !item.example) throw Error('查词服务未返回可用释义。');
    const merged = {...local};
    // The existing course sense and its example are retained; AI only fills gaps.
    for (const field of ['meaning','ipa','example','exampleTranslation']) if (!merged[field]) merged[field] = item[field];
    if (merged.ipa === item.ipa && item.ipaAccent) { merged.ipaAccent=item.ipaAccent; merged.ipaVariants=item.ipaVariants; merged.ipaSource=item.ipaSource; }
    merged.source = 'ai-supplement';
    merged.aiChecked=true;
    merged.contextualAI={meaning:item.meaning,example:item.example,exampleTranslation:item.exampleTranslation,ipa:item.ipa,ipaSource:item.ipaSource,pos:clean((result?.entry||result?.glossary||result)?.pos,120)};
    merged.complete = Boolean(merged.meaning && merged.ipa && merged.example);
    return merged;
  }
  function mergeReference(local,reference){
    const item=safeEntry(reference);if(!item||normalize(item.word)!==normalize(local.word))throw Error('本地参考词条与当前单词不一致。');
    const merged={...local};for(const field of ['meaning','ipa','example','exampleTranslation'])if(!merged[field])merged[field]=item[field];
    if(!merged.pos&&reference.pos)merged.pos=clean(reference.pos,120);
    if(local.source==='missing')merged.source='essential-reference';
    if(!merged.ipaSource&&item.ipaSource)merged.ipaSource=item.ipaSource;
    if(!merged.ipaAccent&&item.ipaAccent)merged.ipaAccent=item.ipaAccent;
    merged.referenceSource='existing-8000-wordlist';if(!local.example)merged.exampleSource=reference.exampleSource||'existing-wordlist-example';merged.meaningScope=merged.contextBound?'material-context':'general-reference';merged.complete=Boolean(merged.meaning&&merged.ipa&&merged.example);return merged;
  }
  return {normalize, validWord, safeEntry, isAmericanIpa, safeAudioPath, indexedAudioChoice, indexedAudioFor, create, mergeAI, mergeReference, bridge:BRIDGE.map(safeEntry)};
});
