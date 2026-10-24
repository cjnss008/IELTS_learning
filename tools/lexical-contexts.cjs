'use strict';
const crypto=require('node:crypto');
const origins=require('../curriculum/sources/lexical-context-candidates.json').items;
// Original learning sentences and different application contexts. IPA is British citation-form guidance.
const rows=[
 ['do homework','做作业','/duː ˈhəʊmwɜːk/','After dinner, I do homework at the kitchen table.','I need to ____ because my English exercise is due tomorrow.',['have breakfast','go to bed'],'要完成明天交的英语练习，应是做作业。'],
 ['cake','蛋糕','/keɪk/','We share a small cake on her birthday.','For his birthday, we put six candles on the ____.',['soup','rice'],'插生日蜡烛的食物在这些选项中是蛋糕。'],
 ['tomato','西红柿','/təˈmɑːtəʊ/','I put one red tomato in the salad.','The recipe needs one ripe ____ for its red juice.',['potato','onion'],'红色果汁与成熟西红柿相符；土豆和洋葱不符。'],
 ['carrot','胡萝卜','/ˈkærət/','She cuts an orange carrot into thin sticks.','This orange root vegetable is a ____.',['cucumber','cabbage'],'橙色根菜指胡萝卜，另外两项不是根菜。'],
 ['potato','土豆','/pəˈteɪtəʊ/','I bake a potato and serve it with beans.','A ____ grows underground and can be mashed after boiling.',['lettuce','grape'],'地下生长、煮后可做泥的选项是土豆。'],
 ['toilet','卫生间','/ˈtɔɪlət/','The public toilet is beside the ticket office.','I need to use the ____ before we start the long journey.',['suitcase','platform'],'长途出发前使用的设施是卫生间。'],
 ['snack','零食；小吃','/snæk/','A banana is my usual afternoon snack.','Lunch is still two hours away, so I will have a small ____.',['feast','appointment'],'正餐前的小份食物是snack，feast是盛宴。'],
 ['check into','登记入住','/tʃek ˈɪntə/','We will check into the hotel after lunch.','On arrival, before receiving your room key, show your passport when you ____ the guesthouse.',['check out of','walk past'],'到达后、取得房间钥匙前明确是办理入住；check out of是退房。'],
 ['correct','改正','/kəˈrekt/','Please correct the date on this form.','The address is wrong; please ____ it before posting the letter.',['repeat','ignore'],'寄信前应改正错误地址，而非重复或忽略。'],
 ['move','搬家','/muːv/','Our family will move to a larger flat in June.','We will ____ next week and start living in our new home.',['commute','visit'],'start living in our new home明确为迁居，不是通勤或短暂拜访。'],
 ['keep in touch','保持联系','/kiːp ɪn tʌtʃ/','We keep in touch by sending an email every month.','Although we now live far apart, let us ____ by video call.',['lose contact','stand in line'],'相隔远仍通过视频联系，用keep in touch。'],
 ['pass','通过考试','/pɑːs/','I hope to pass the driving test this month.','You need at least sixty points to ____ this exam.',['fail','postpone'],'达到分数线可通过考试；fail为不通过，postpone为推迟。'],
 ['teach','教','/tiːtʃ/','Can you teach me how to use this machine?','The instructor will ____ beginners how to swim.',['borrow','learn'],'instructor向初学者传授技能，用teach；learn主语是学习者。'],
 ['plug in','插上电源','/plʌɡ ɪn/','Please plug in the lamp before you switch it on.','The battery is empty, so ____ the charger.',['unplug','fold up'],'电池用尽应接上充电器，不是拔掉或折叠。'],
 ['flash','闪烁','/flæʃ/','The warning light will flash when the battery is low.','The indicator does not stay on steadily; it will ____ every second.',['remain dark','break permanently'],'每秒间歇亮起是flash，不是一直熄灭或永久损坏。'],
 ['dumpling','饺子','/ˈdʌmplɪŋ/','Each dumpling contains vegetables inside a thin wrapper.','She folds a thin wrapper around the filling to make a ____.',['sandwich','pancake'],'薄皮包住馅料的选项是dumpling。'],
 ['rice cake','米糕；年糕','/raɪs keɪk/','This steamed rice cake is made from rice flour.','For this dessert, press the cooked rice flour mixture into a ____.',['bread roll','cheese omelette'],'米粉混合物制成rice cake，非面包或煎蛋。'],
 ['dragon dance','舞龙','/ˈdræɡən dɑːns/','Ten performers carry the long figure during the dragon dance.','Several people lift one long dragon figure for the ____.',['solo song','bicycle race'],'多人举长龙表演指舞龙。'],
 ['extend','延长','/ɪkˈstend/','The library agreed to extend my loan by one week.','The deadline is too soon; could you ____ it until Friday?',['shorten','cancel'],'把截止日推后是延长，不是缩短或取消。'],
 ['allow','允许','/əˈlaʊ/','The rules allow visitors to take photographs without flash.','The rule gives children permission to enter alone: it will ____ them to enter without an adult.',['require','forbid'],'gives permission明确为允许；require是要求，forbid是禁止。'],
 ['integrate','整合','/ˈɪntɪɡreɪt/','The report will integrate survey results with interview findings.','We need to ____ the two datasets into one coherent analysis.',['separate','discard'],'合成一个连贯分析用integrate，非拆分或丢弃。'],
 ['argument','论点；论证','/ˈɑːɡjumənt/','Her argument is that longer opening hours would improve access.','State your main ____ and support it with relevant evidence.',['greeting','decoration'],'需用证据支持的是论点，不是问候或装饰。'],
 ['supporting sentence','支持句','/səˈpɔːtɪŋ ˈsentəns/','A supporting sentence gives an example that develops the paragraph’s main claim.','After the topic sentence, add a ____ that explains the evidence.',['title page','closing signature'],'主题句后展开证据应加支持句。'],
 ['allocation','分配','/ˌæləˈkeɪʃn/','The budget allocation gives each team enough money for equipment.','The committee will review the ____ of funds between the two projects.',['publication','disappearance'],'两项目之间资金的分配用allocation。'],
 ['plank','木板','/plæŋk/','A narrow wooden plank forms a temporary bridge across the ditch.','The carpenter cut a long, flat ____ of solid wood for the shelf.',['brick','pipe'],'长而扁平的实木板是plank；brick是砖，pipe是管状物。'],
 ['objection','反对意见','/əbˈdʒekʃn/','Her objection concerns the noise the proposal could create.','Residents raised an ____ to the plan because deliveries would block the entrance.',['invitation','agreement'],'提出阻碍理由为反对意见objection，与an搭配。'],
 ['process','处理','/ˈprəʊses/','The office will process your application within five days.','Staff will ____ the forms and check that every field is complete.',['decorate','misplace'],'核对并办理表格用process，此处为动词。'],
 ['hack','非法侵入计算机系统；黑客攻击','/hæk/','Criminals may try to hack an account protected by a weak password.','The attackers attempted to ____ the network and steal its files.',['repair','authorise'],'为窃取文件非法入侵是hack；此处不教授攻击方法。'],
 ['private car','私家车','/ˌpraɪvət ˈkɑː/','Taking a private car costs more than sharing the bus on this route.','He drives his own ____ to work instead of taking public transport.',['city bus','shared tram'],'自己的汽车而非公共交通是private car。'],
 ['bike lane','自行车道','/ˈbaɪk leɪn/','The bike lane is separated from traffic by low barriers.','Cyclists should use the marked ____ rather than the pedestrian pavement.',['loading bay','taxi rank'],'自行车专用标线通道是bike lane。'],
 ['cyclist','骑自行车的人','/ˈsaɪklɪst/','The cyclist stopped to repair a flat tyre.','A person travelling by bicycle is a ____.',['motorist','pedestrian'],'骑车者cyclist，motorist开机动车，pedestrian步行。'],
 ['accident','事故','/ˈæksɪdənt/','A minor accident closed the junction for an hour.','Two cars collided in an ____ near the crossing.',['exhibition','appointment'],'车辆碰撞属于accident。'],
 ['commuter','通勤者','/kəˈmjuːtə/','A commuter travels regularly between home and work.','She takes the same train to her office each weekday, so she is a ____.',['tourist','spectator'],'日常往返住所和工作地者是commuter。'],
 ['halve','减半','/hɑːv/','The new timetable could halve the wait from twenty minutes to ten.','To reduce the cost from eighty pounds to forty is to ____ it.',['double','triple'],'80降至40是halve，不是两倍或三倍。'],
 ['triple','增至三倍','/ˈtrɪpl/','A rise from ten users to thirty would triple the total.','If production rises from four units to twelve, it will ____.',['halve','remain unchanged'],'12为4的三倍，动作是triple。'],
 ['concern','担忧','/kənˈsɜːn/','Her main concern is the lack of safe crossing points.','The patients became worried: the long delay in their results caused ____.',['relief','certainty'],'became worried明确为担忧；relief是宽慰，certainty是确定。'],
 ['repaint','重新粉刷','/ˌriːˈpeɪnt/','We will repaint the door because the old colour is fading.','The walls already have paint, but we need to ____ them in a lighter colour.',['demolish','measure'],'已有漆墙换色是repaint，非拆除或测量。'],
 ['compass','指南针','/ˈkʌmpəs/','Use a compass to check which direction is north.','Without a clear view of the sun, a ____ can help us find north.',['thermometer','calendar'],'指示方向用compass；温度计和日历功能不同。'],
 ['acquire','获得；习得','/əˈkwaɪə/','Learners acquire new skills through guided practice.','The training gives staff time to ____ practical skills.',['abandon','forget'],'训练中获得技能是acquire。'],
 ['alchemist','炼金术士','/ˈælkəmɪst/','The fictional alchemist dreams of turning common metal into gold.','In this historical story, an ____ tries to transform lead into gold.',['astronomer','cartographer'],'炼普通金属为金的历史角色为alchemist，句中明确是故事。'],
 ['determiner','限定词','/dɪˈtɜːmɪnə/','In the phrase this book, this is a determiner.','In “these chairs”, “these” functions as a ____.',['main verb','preposition'],'these置于名词前限定所指，功能为determiner。'],
 ['misunderstand','误解','/ˌmɪsʌndəˈstænd/','People may misunderstand a sign if its wording is unclear.','If you take “optional” to mean “compulsory”, you ____ the instruction.',['clarify','follow exactly'],'把可选理解为必须，属于misunderstand。'],
 ['respondent','问卷回答者；受访者','/rɪˈspɒndənt/','Each respondent can skip any question they do not wish to answer.','A person who completes our survey is a ____.',['publisher','spectator'],'回答调查问卷者为respondent。'],
 ['generalize','概括；推广','/ˈdʒenrəlaɪz/','We cannot generalize from one small class to all adult learners.','Do not ____ the findings to all cities when only one district was studied.',['restrict','withdraw'],'从一地区推广到所有城市是generalize，句中告诫不可无依据推广。'],
 ['limitation','局限性','/ˌlɪmɪˈteɪʃn/','The small sample is a limitation of this pilot study.','A weakness that restricts what a study can show is a ____.',['guarantee','benefit'],'限制可得结论的弱点为limitation。'],
 ['fern','蕨类植物','/fɜːn/','A fern grows in the shaded corner of our demonstration garden.','This non-flowering plant has fronds and is labelled as a ____.',['rose','sunflower'],'有蕨叶、不以花繁殖的选项是fern。'],
 ['hosta','玉簪','/ˈhɒstə/','The hosta has broad leaves and grows in our shady border.','The garden label identifies this broad-leaved shade plant as a ____.',['cactus','pine'],'题设标签与宽叶阴生花园植物相符的是hosta。'],
 ['weed','除草','/wiːd/','Volunteers weed the vegetable beds by pulling out unwanted plants.','Please ____ the bed by removing plants that should not be growing there.',['water','fertilise'],'移除非目标植物是weed，此处为动词。'],
 ['apply','适用','/əˈplaɪ/','The same safety rules apply to visitors and staff.','These restrictions ____ to every vehicle entering the site.',['belong','differ'],'规则适用于对象用apply to，注意不是申请含义。'],
 ['participant','参与者','/pɑːˈtɪsɪpənt/','Every participant in the workshop receives a materials pack.','Each person taking part in the trial is a ____.',['bystander','reviewer'],'实际参加试验的人是participant，旁观者不参加。'],
 ['quantifier','量词；数量限定词','/ˈkwɒntɪfaɪə/','Many is a quantifier in the phrase many visitors.','In “several books”, “several” is a ____.',['tense marker','personal pronoun'],'several表达数量，属于quantifier。'],
 ['self-correction','自我纠正','/ˌself kəˈrekʃn/','Her self-correction changed Tuesday to Thursday before she finished speaking.','The speaker notices his own error and repairs it; this is ____.',['peer correction','external assessment'],'本人发现并修复错误是self-correction，与他人纠正不同。'],
 ['framework','框架；体系','/ˈfreɪmwɜːk/','The team uses a common framework to compare all proposals.','A shared set of principles for organising the analysis is a ____.',['receipt','fragment'],'组织分析的共同原则结构是framework。'],
 ['cloakroom','衣帽间','/ˈkləʊkruːm/','Visitors leave coats in the cloakroom before entering the gallery.','Please leave your coat at the staffed ____ beside the entrance.',['laboratory','kitchen'],'入口存外套处为cloakroom。'],
 ['compact','压实','/kəmˈpækt/','Heavy vehicles can compact wet soil and reduce the spaces between particles.','The roller will ____ the loose surface by pressing it firmly.',['loosen','scatter'],'通过压力使表面紧密是动词compact，重音在第二音节。'],
 ['persistent','持续的；不轻易消失的','/pəˈsɪstənt/','A persistent noise continued throughout the afternoon.','The fault returns after every repair, so it is a ____ problem.',['temporary','one-off'],'反复存在、修后仍返的故障称persistent。'],
 ['advocacy','倡导；拥护','/ˈædvəkəsi/','The group’s advocacy helped draw attention to accessible public spaces.','Public support for a policy or cause is called ____.',['indifference','concealment'],'公开支持某事业或政策是advocacy。'],
 ['autonomy','自主权','/ɔːˈtɒnəmi/','Staff have autonomy to choose how they organise their work.','The team can make its own decisions without constant approval; it has ____.',['dependency','supervision'],'自主决策权限是autonomy。'],
 ['presenteeism','出勤主义；在岗但效率或状态不佳','/ˌpreznˈtiːɪzəm/','The fictional survey examines presenteeism: staff attend work despite being too unwell to work effectively.','Working while ill and being unable to function effectively is an example of ____.',['absenteeism','annual leave'],'到岗但因健康无法有效工作是presenteeism，不是缺勤或年假。'],
 ['biodiversity','生物多样性','/ˌbaɪəʊdaɪˈvɜːsəti/','The garden team records different species to describe local biodiversity.','The variety of living species in an area contributes to its ____.',['air pressure','population density'],'物种种类多样性对应biodiversity，不只是总数量。'],
 ['forage','觅食','/ˈfɒrɪdʒ/','Bees forage for nectar among the flowers.','Birds search for food in the soil when they ____.',['hibernate','migrate'],'寻找食物用forage；冬眠和迁徙不是同义。'],
 ['ecosystem','生态系统','/ˈiːkəʊsɪstəm/','The pond ecosystem includes organisms and the physical conditions around them.','Living things and their non-living surroundings form an interacting ____.',['instrument','specimen'],'生物与非生物环境相互作用形成ecosystem。'],
 ['sediment','沉积物','/ˈsedɪmənt/','Fine sediment settled at the bottom of the jar.','Particles carried by water and deposited on the bed are ____.',['vapour','sunlight'],'被水搬运并沉下的颗粒为sediment。'],
 ['subsidise','补贴；资助','/ˈsʌbsɪdaɪz/','The council may subsidise evening bus services so fares remain affordable.','The city will cover part of the operating cost with public funds: in other words, it will ____ the route.',['privatise','penalise'],'公款承担部分营运成本是subsidise；不是改变所有权或处罚。'],
 ['dismantle','拆卸；拆除','/dɪsˈmæntl/','The engineer will dismantle the pump before replacing its internal parts.','We must ____ the machine into separate components before moving it.',['assemble','seal'],'分解成部件用dismantle，assemble为组装。'],
 ['reassemble','重新组装','/ˌriːəˈsembl/','After cleaning the parts, we reassemble the pump.','The components have been repaired; now ____ them into a working machine.',['discard','dismantle'],'修好零件后重新装成机器是reassemble。'],
 ['peer reviewer','同行评审人','/ˌpɪə rɪˈvjuːə/','A peer reviewer evaluates a manuscript in the same field before publication.','An independent expert asked to assess this research manuscript is a ____.',['ticket inspector','job applicant'],'相关领域专家评审研究稿件为peer reviewer。'],
 ['approve','批准','/əˈpruːv/','The committee must approve the final design before construction begins.','To give final permission for payment, the authorised manager must ____ this spending request.',['submit','question'],'give final permission for payment明确为批准；提交或质疑请求并不表示付款获准。'],
 ['criterion','标准；准则（单数）','/kraɪˈtɪəriən/','Cost is one criterion used to assess each proposal.','Reliability is one standard used to judge the device, or a single ____.',['criteria','assumption'],'standard used to judge定义为criterion；single要求单数，criteria是复数。'],
 ['gentrification','绅士化；中产阶级化','/ˌdʒentrɪfɪˈkeɪʃn/','The fictional case describes gentrification, in which neighbourhood investment accompanies rising rents and the displacement of some lower-income residents.','Investment brings wealthier residents, rents rise and some poorer tenants are displaced; this pattern is ____.',['desertification','depopulation'],'题设为社区阶层和租金变化，不是土地荒漠化或单纯人口减少。']
];
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function build(){
 if(rows.length!==70||origins.length!==70)throw Error('Expected the frozen 70 lexical candidates.');
 const materials=[],assignments=[],byWeek=new Map();
 for(const row of rows){const origin=origins.find(v=>v.word===row[0]);if(!origin)throw Error('Unknown lexical candidate.');if(!byWeek.has(origin.earliestWeek))byWeek.set(origin.earliestWeek,[]);byWeek.get(origin.earliestWeek).push(row);}
 const groups=[...byWeek].sort((a,b)=>a[0]-b[0]).flatMap(([,group])=>Array.from({length:Math.ceil(group.length/4)},(_,i)=>group.slice(i*4,i*4+4)));
 for(const [index,group] of groups.entries()){
  const origin=group.map(r=>origins.find(v=>v.word===r[0]));
  const week=Math.min(52,Math.max(...origin.map(v=>v.earliestWeek))+1),suffix=String(index+1).padStart(2,'0'),contextId='lexical-context-'+suffix,packId='lexical-context-'+suffix+'-vocabulary';
  const level=week<=8?'A1':week<=14?'A2':week<=20?'B1':'B2';
  const vocabulary=group.map((r,i)=>({word:r[0],meaning:r[1],ipa:r[2],example:r[3],sourceQuote:r[3],sourceMaterialId:contextId,candidateOriginIds:origin[i].sourceIds,candidateOriginWeek:origin[i].earliestWeek}));
  const questions=group.map((r,i)=>{const options=[r[0],...r[5]],offset=(i+index)%3;return{id:'q'+(i+1),type:'single',prompt:r[4],options:options.slice(offset).concat(options.slice(0,offset)),answers:[r[0]],evidence:r[4].replace('____',r[0]),explanation:r[6],lexeme:r[0]};});
  const source={schemaVersion:3,kind:'original-lexical-context',rights:'项目原创语境例句与应用题，AI辅助编写；保留候选来源，不伪称旧文本精确含该基本词形',verification:'reviewed',method:'逐词检查词义、词性、引用形音标和新句用法；evidence是完整参考句，不冒充外部原文引文。',originIds:[...new Set(origin.flatMap(v=>v.sourceIds))]};
  const base={version:'1',week,level,pool:'training',fullTest:false,lexicalContext:true,source};
  const context={...base,id:contextId,skill:'grammar',type:'lexical-context',title:'语境用词迁移 · 小组 '+suffix,estimatedMinutes:10,instructions:'先学习同组词，再独立完成新的语境用词题。根据句意和词性选择；不要只凭中文词义猜。提交原始答案后再对照完整句和解释，错误进入统一错题本。',passage:'每题采用不同于学习例句的新语境。请选择最合适的英文词或短语；完整参考句只在提交后用于订正。',questions,vocabulary,contextPassage:group.map(r=>r[3]).join('\n'),source:{...source,contentHashFields:['contextPassage','questions','vocabulary']}};
  context.source.contentHash=digest(Object.fromEntries(context.source.contentHashFields.map(k=>[k,context[k]])));
  const pack={...base,id:packId,skill:'vocabulary',type:'vocabulary',title:'五词以内语境补组 '+suffix,estimatedMinutes:15,instructions:'本组补齐此前尚未排课的候选词。每词完成三遍正确英文输入、三次独立真实跟读与专业结果，再做补全、中文写英文和听写；之后进入同组新句迁移题。词形覆盖与真正掌握分开判断。',passage:vocabulary.map(v=>v.word+' — '+v.meaning+'\n'+v.example).join('\n\n'),questions:[],vocabulary,sourceMaterialId:contextId,contextMaterialId:contextId,source:{...source,contentHashFields:['passage','vocabulary']}};
  pack.source.contentHash=digest(Object.fromEntries(pack.source.contentHashFields.map(k=>[k,pack[k]])));
  materials.push(context,pack);assignments.push({week,packId,contextId,words:vocabulary.map(v=>v.word)});
 }
 return{materials,assignments,audit:{candidateCount:70,coveredWords:rows.map(r=>r[0]),groups:assignments.length,contextQuestions:70,method:'70候选在新原创真实训练中覆盖；来源形态不一致和旧例句未入原文的情形不强行计为旧正文精确覆盖。',sourceSnapshot:'curriculum/sources/lexical-context-candidates.json'}};
}
module.exports={build,rows};
