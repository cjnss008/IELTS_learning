'use strict';
// Authored original focused assessments. Scenarios and figures are simulated.
const crypto=require('node:crypto');
const materials=[];
const levels={a1:{week:5,level:'A1'},a2:{week:12,level:'A2'},b1:{week:20,level:'B1'},b2:{week:32,level:'B2'}};
const locales={gb:{locale:'en-GB',label:'英国英语（合成）',voice:'en-GB-SoniaNeural'},us:{locale:'en-US',label:'美国英语（合成）',voice:'en-US-AriaNeural'},au:{locale:'en-AU',label:'澳大利亚英语（合成）',voice:'en-AU-NatashaNeural'},in:{locale:'en-IN',label:'印度英语（合成）',voice:'en-IN-NeerjaNeural'}};
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function single(prompt,answer,wrong,evidence,explanation){return{type:'single',prompt,options:[answer,...wrong],answers:[answer],evidence,explanation};}
function fill(prompt,answer,evidence,explanation,maxWords=2){return{type:'fill',prompt,answers:Array.isArray(answer)?answer:[answer],maxWords,evidence,explanation};}
function add(level,skill,suffix,title,text,questions){
 const id='independent-'+level+'-'+suffix;
 const key=skill==='reading'?'passage':'transcript';
 const q=questions.map((item,i)=>{if(item.type==='single'){const options=[...item.options],shift=(i+title.length)%options.length;item={...item,options:options.slice(shift).concat(options.slice(0,shift))};}return{...item,id:'q'+(i+1)};});
 materials.push({id,version:'1',...levels[level],skill,type:skill,pool:'independent',independentBank:true,fullTest:false,title,instructions:'原创模拟情境，非官方试题；这是独立分科短测，不是40题完整试卷。开始前不看正文、原音、词表或答案。先独立完成8题并保存原始答案，提交后再核对依据。难度是编写目标，尚未经真实考生标定。',estimatedMinutes:skill==='reading'?({a1:12,a2:18,b1:25,b2:30}[level]):15,timeLimitSeconds:skill==='reading'?({a1:720,a2:1080,b1:1500,b2:1800}[level]):900,[key]:text,questions:q,source:{schemaVersion:3,kind:'original',rights:'项目原创，AI辅助编写；模拟场景与数据，无外部文章改编',verification:'reviewed',method:'Codex逐题对照完整原文并核对答案、干扰项和词数；规则检查另列；未经过真人考生难度标定。',contentHash:hash(JSON.stringify({title,[key]:text,questions:q})),contentHashFields:['title',key,'questions']}});
 if(skill==='listening'){const voice=locales[suffix.split('-')[1]];Object.assign(materials.at(-1),{audio:'',audioSynthetic:true,audioLocale:voice.locale,audioAccent:voice.label,audioVoice:voice.voice,audioProvider:'Microsoft online TTS',audioVoiceSource:'https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts',captionFile:''});}
}

// READINGS
add('a1','reading','read-1','A Saturday at the community room',
`My name is Mina. I help at the community room on Saturdays. The room is behind the library. We open at nine and close at one. Our first group is for children. They draw animals with Sam. The second group is for adults. They make small bags with me. A class costs five pounds. Tea is free, but food is not. Please bring your own lunch. There are twelve chairs in the room. You can leave your coat next to the door. There is no car park. The number six bus stops outside the library. On wet days, please wait inside the library before the room opens.`,[
 single('活动室在哪里？','Behind the library',['Inside the school','Next to the station'],'The room is behind the library.','behind 表示在……后面，图书馆不是活动室内部。'),
 fill('活动室几点关门？写原文中的一个英文单词。','one','We open at nine and close at one.','九点是开门时间，一点才是关门时间。',1),
 single('儿童在第一组做什么？','Draw animals',['Make bags','Cook lunch'],'They draw animals with Sam.','儿童组跟 Sam 画动物；做包是成人组的活动。'),
 fill('成人组做的小物品是 small ____。','bags','They make small bags with me.','保留原文复数 bags。',1),
 single('哪一样免费？','Tea',['Food','A class'],'Tea is free, but food is not.','茶免费，食物和课程都不是免费项目。'),
 fill('房间里有多少把椅子？写一个英文单词。','twelve','There are twelve chairs in the room.','人数没有说明；这里问的是椅子数。',1),
 single('外套可以放在哪里？','Next to the door',['On a chair outside','In the car park'],'You can leave your coat next to the door.','可把外套放在门边。'),
 single('下雨且活动室还没开门时，应在哪里等？','Inside the library',['At the bus stop','Outside the community room'],'On wet days, please wait inside the library before the room opens.','原文要求在图书馆里面等候。')
]);
add('a1','reading','read-2','A note for a new flatmate',
`Hi Leo,
Welcome to our flat. Your room is the small room on the left. The blue key is for the front door. The red key is for your room. We eat dinner at seven, but on Friday we eat at eight. There is milk in the fridge for everyone. Please write your name on your other food. We wash clothes on Sunday. The machine is in the bathroom. Please keep your bike in the garden. Bikes cannot stay in the hall. I work in a shop in the morning. If you need help before lunch, please send me a text. My phone is quiet at work, so do not call.
Anna`,[
 single('Leo 的房间是哪间？','The small room on the left',['The large room on the right','The room next to the garden'],'Your room is the small room on the left.','small 和 on the left 都是房间信息。'),
 fill('前门用什么颜色的钥匙？写一个英文单词。','blue','The blue key is for the front door.','red 是房间钥匙，前门是 blue。',1),
 single('星期五晚饭几点？','Eight',['Seven','Six'],'We eat dinner at seven, but on Friday we eat at eight.','Friday 是七点惯例的例外。'),
 single('哪一样食物供大家共用？','Milk',['All food in the fridge','Food with Anna’s name'],'There is milk in the fridge for everyone.','只有牛奶明确是大家共用；其他食物要署名。'),
 fill('洗衣日是星期几？写原文英文。','Sunday','We wash clothes on Sunday.','机器位置是 bathroom，洗衣日是 Sunday。',1),
 single('洗衣机在哪里？','In the bathroom',['In the kitchen','In the garden'],'The machine is in the bathroom.','machine 指前句所说洗衣服的机器。'),
 fill('自行车应停在什么地方？写一个英文单词。','garden','Please keep your bike in the garden.','hall 是禁止停放处，garden 才是指定位置。',1),
 single('午饭前需要帮助，Leo 应怎样联系 Anna？','Send a text',['Call her phone','Visit her at home'],'If you need help before lunch, please send me a text.','工作时手机静音，因此应发短信而不是打电话。')
]);
add('a2','reading','read-1','The mobile library changes its route',
`The yellow library bus visits four villages. Last winter, the driver often arrived late in Brook End because the bridge was closed. The bridge is open again, but the library is keeping its new route. Most passengers said the new stop near the bakery was easier to reach than the old stop by the river.

From next Monday, the bus will visit Brook End on Tuesday instead of Thursday. It will stay from 10.30 until 12.00. Readers can borrow six books for three weeks. Children do not need to pay for a library card. Adults pay two pounds for a first card, but replacing a lost card costs one pound for everyone.

The bus carries some large-print books. If readers want a book that is not on the bus, they should request it by telephone by Friday. The staff will bring it the following week if it is available. The bus has no printer, so printing still requires a visit to the main library. People returning books do not have to wait in the borrowing queue. They can put their books in the green box beside the driver's seat. The box is inside the bus and is only available during the visit.`,[
 single('Why did the bus often arrive late last winter?','A bridge was closed.',['The driver changed every week.','The library had too few books.'],'Last winter, the driver often arrived late in Brook End because the bridge was closed.','晚到的明确原因是桥梁关闭，不是停靠点偏好。'),
 single('Why is the new stop being kept?','Most passengers find it easier to reach.',['The bridge is still closed.','The bakery pays for the bus.'],'Most passengers said the new stop near the bakery was easier to reach than the old stop by the river.','桥已重开，保留新站的原因是更容易到达；没有 bakery 资助的信息。'),
 fill('On which day will the bus visit Brook End? Write ONE WORD.','Tuesday','the bus will visit Brook End on Tuesday instead of Thursday.','instead of 表示原来的 Thursday 被 Tuesday 取代。',1),
 fill('For how many weeks can readers keep books? Write ONE WORD.','three','Readers can borrow six books for three weeks.','six 是可借册数，three 是借期。',1),
 single('Who pays one pound for a replacement card?','Anyone who loses a card',['Only adult readers','Only children'],'replacing a lost card costs one pound for everyone.','首次办卡费用按年龄不同，补卡费用则适用于所有人。'),
 fill('Requests for books must be made by which day? Write ONE WORD.','Friday','they should request it by telephone by Friday.','by Friday 是申请截止时间，而非领书日期。',1),
 single('Which service is unavailable on the bus?','Printing',['Borrowing large-print books','Returning books'],'The bus has no printer, so printing still requires a visit to the main library.','车上有大字书与还书箱，但没有打印机。'),
 single('How can people return books without joining the queue?','Use a box inside the bus',['Leave books beside the bakery','Use the driver’s seat as a shelf'],'They can put their books in the green box beside the driver\'s seat.','还书箱位于车内、驾驶座旁，不能在营业时间之外把书留在外面。')
]);
add('a2','reading','read-2','Borrowing tools from the workshop',
`A residents' group has opened a tool room in an empty shop. Members can borrow equipment instead of buying things that they may use only once. The room opens on Wednesday evenings and Saturday mornings. New members must visit on a Saturday for a short safety introduction. After that visit, they can borrow tools on either opening day.

The annual membership fee is twelve pounds. Members also leave a ten-pound deposit when they take a tool away. This deposit is returned when the tool comes back undamaged. Ordinary tools can be borrowed for four days. A ladder has a shorter limit of two days because there is only one ladder in the room. It cannot be reserved more than a week ahead.

People can check the online list before visiting, but the list is updated only at the end of each opening session. A tool shown as available might already have been borrowed that evening. To avoid a wasted journey, members should phone the volunteer at the room before setting out. The volunteers explain how tools work, but they do not carry out repairs in members' homes. Please clean tools before returning them. If a tool stops working, tell the volunteer what happened. Do not try to repair it yourself, even if you think the problem is small.`,[
 single('What is the main purpose of the tool room?','To let residents borrow equipment',['To sell used tools','To offer home repair visits'],'Members can borrow equipment instead of buying things that they may use only once.','借用减少偶尔使用工具的购买需求。'),
 single('When must a new member make their first visit?','On a Saturday',['On a Wednesday','On any weekday morning'],'New members must visit on a Saturday for a short safety introduction.','周六首次安全介绍是借用前的要求。'),
 fill('How much is the annual membership fee? Write ONE WORD.','twelve','The annual membership fee is twelve pounds.','ten 是押金而不是年费。',1),
 single('When is the deposit returned?','When an undamaged tool is returned',['At the end of the year','Immediately after booking'],'This deposit is returned when the tool comes back undamaged.','押金能否返还取决于工具归还时没有损坏。'),
 fill('The borrowing limit for the ladder is ____ days. Write ONE WORD.','two','A ladder has a shorter limit of two days because there is only one ladder in the room.','普通工具是四天，梯子只有两天。',1),
 single('Why might the online list be inaccurate during an opening session?','It is updated after the session ends.',['Members can change it themselves.','Only new tools appear on it.'],'the list is updated only at the end of each opening session.','实时借出未即时更新，因此 displayed available 不是保证。'),
 single('What should members do before travelling to collect a tool?','Telephone the volunteer',['Pay for a repair visit','Reserve every tool a month ahead'],'members should phone the volunteer at the room before setting out.','打电话可确认实时可借状态，减少白跑。'),
 single('What should a member do if a tool stops working?','Report the problem to a volunteer',['Repair it before returning it','Leave it outside the shop'],'If a tool stops working, tell the volunteer what happened.','必须报告；紧接着明确禁止自行维修，即使认为问题很小。')
]);
add('b1','reading','read-1','A quieter bus, a different measure',
`A fictional town called Merrow tested a new evening bus service for six weeks. The transport team wanted to know whether making journeys quieter would attract passengers who usually avoided buses after work. On three routes, drivers played no radio, phone calls were discouraged, and notices asked passengers to speak softly. The service used the same vehicles and charged the same fares as the ordinary service. No tickets were sold under a special quiet-service brand.

At first, the team counted all evening passengers. Numbers rose by twelve per cent compared with the previous six weeks. A manager called this a success, but an analyst noticed that a nearby road had been closed during most of the trial. People who normally drove had fewer alternatives. Passenger growth therefore could not by itself show that quieter conditions caused a change in travel habits.

The team then examined a different record: short surveys completed by people who had travelled on the routes both before and during the trial. Of the eighty repeat passengers who answered, fifty-eight said the journey felt less tiring. This was useful information about their experience, but the survey excluded people who never tried the service. It could not explain why non-users stayed away. Nor did the team know whether the respondents were more interested in quiet travel than the passengers who ignored the survey.

Drivers described another problem. A notice that sounded polite to one passenger could sound unfriendly to someone else. Parents sometimes worried that a young child would be unwelcome, although the notices did not ban children. Rather than asking drivers to judge acceptable noise, the team replaced the general request for quiet with two concrete requests: use headphones and keep phone calls brief. Drivers were asked to record complaints without arguing about personal behaviour.

The council extended the trial, but it delayed any permanent change. It planned to compare quiet and ordinary journeys on the same routes after the road reopened. The analyst argued that a modest improvement in passenger comfort could still matter, even if the total passenger count did not rise. The aim of the next comparison was to separate that experience from changes caused by the temporary road closure.`,[
 single('Which feature stayed the same during the first trial?','The fare',['The number of routes in the town','The wording of all notices'],'The service used the same vehicles and charged the same fares as the ordinary service.','明确保持不变的是票价与车辆；全镇路线总数未给出。'),
 fill('Passenger numbers rose by ____ per cent. Write ONE WORD.','twelve','Numbers rose by twelve per cent compared with the previous six weeks.','这是观察到的增长，不是安静政策的已证实效果。',1),
 single('Why did the analyst question the manager’s conclusion?','A road closure offered another explanation for passenger growth.',['Fares had fallen during the trial.','All surveys had been lost.'],'People who normally drove had fewer alternatives.','道路关闭使开车者替代选择减少，形成竞争解释。'),
 fill('How many repeat passengers said the journey was less tiring? Write NO MORE THAN TWO WORDS.','fifty-eight','Of the eighty repeat passengers who answered, fifty-eight said the journey felt less tiring.','eighty 是答卷人数，fifty-eight 是认为没那么累的人数。'),
 single('Which group was excluded from the repeat-passenger survey?','People who never used the trial service',['Passengers who travelled before the trial','Passengers who found journeys tiring'],'the survey excluded people who never tried the service.','研究对象是前后都乘车且答卷者；没有接触服务的人不在其中。'),
 single('Why were the general quiet notices replaced?','People interpreted them in different ways.',['They explicitly banned children.','They advertised a cheaper fare.'],'A notice that sounded polite to one passenger could sound unfriendly to someone else.','解释差异使笼统要求难执行；原文明确没有禁止儿童。'),
 fill('The new requests tell people to use ____ and keep calls brief. Write ONE WORD.','headphones','use headphones and keep phone calls brief.','新要求具体到耳机和通话长度。',1),
 single('What will the next comparison help the team do?','Distinguish comfort effects from the road closure’s effects',['Prove that passenger numbers must rise','Find out whether drivers can sell branded tickets'],'The aim of the next comparison was to separate that experience from changes caused by the temporary road closure.','路重开后在相同路线比较，可减少道路关闭带来的混淆。')
]);
add('b1','reading','read-2','Who is missing from the archive?',
`When the invented Harbour Street Museum began collecting residents' memories, volunteers placed a recording booth in the entrance hall. Visitors could record a five-minute account of their first job. The project was advertised as a way to preserve ordinary working lives rather than only the careers of famous local people. In its first month, it collected sixty recordings, which was twice the organisers' original target.

Listening to the recordings, curator Lila noticed that many speakers had worked in the old shipyard. Their memories were detailed, and their voices would make an attractive exhibition. However, she did not want visitors to assume that shipyard work represented every local person's experience. The booth was beside a display of large model ships, and most of the volunteers who introduced the project were retired shipyard workers. This setting may have encouraged some residents to speak while making others feel that their stories were irrelevant.

The museum moved the booth to a public library for two afternoons. It also invited shop assistants, cleaners and delivery workers through local community groups. The team did not discard the first recordings. Instead, it kept a record of where and how each contribution had been collected. That record would allow future researchers to examine the collection process rather than treating every recording as if it had arrived under identical conditions.

Another issue concerned editing. A volunteer wanted to remove pauses so that the exhibition would move faster. Lila agreed to shorten long silences in the public version, but she insisted on preserving unedited files. A pause might be unimportant, or it might show that a speaker was searching for a word or deciding whether to continue. Future users should be able to make their own judgement. Speakers could withdraw permission before the exhibition opened; they could also allow museum storage while refusing public playback.

The final display included fewer recordings than planned because each voice needed context. A label explained that the collection was an evolving set of personal accounts, not a complete statistical picture of employment. The museum considered the booth a starting point. The number of recordings showed how much had been collected, while the variety of lives represented remained a separate question.`,[
 fill('Each visitor could record an account lasting ____ minutes. Write ONE WORD.','five','Visitors could record a five-minute account of their first job.','five-minute 对应五分钟，不能填首月录音数量。',1),
 single('What did the initial number of recordings show?','The collection target had been exceeded.',['Every local occupation was represented.','The public exhibition was complete.'],'it collected sixty recordings, which was twice the organisers\' original target.','达到目标的两倍只说明数量超过预期，不能推定代表性。'),
 single('Why might shipyard workers have been especially likely to contribute?','The booth’s setting and its volunteers made the project familiar to them.',['The museum refused recordings about other jobs.','Only former shipyard workers could enter the building.'],'The booth was beside a display of large model ships, and most of the volunteers who introduced the project were retired shipyard workers.','场所暗示和志愿者身份可能形成选择偏差，未有职业限制。'),
 fill('To reach other contributors, the booth was moved to a public ____. Write ONE WORD.','library','The museum moved the booth to a public library for two afternoons.','library 是改变后的收集地点。',1),
 single('Why did the team record how each contribution was collected?','To make the collection process open to later examination',['To give every speaker the same job title','To replace the original recordings with labels'],'That record would allow future researchers to examine the collection process','记录收集过程为日后的判断提供上下文。'),
 single('Why were unedited recordings retained?','Future users might interpret pauses differently.',['Silences were always evidence of distress.','The museum could not edit audio files.'],'Future users should be able to make their own judgement.','停顿有多种可能意义，保存原音让后人自己判断，不能断言全是痛苦。'),
 single('Which permission choice was available to speakers?','Storage without public playback',['Public playback was compulsory after recording','Withdrawal only after the exhibition opened'],'they could also allow museum storage while refusing public playback.','存储和公开播放可以分别授权。'),
 single('Which statement best expresses the final label’s purpose?','To prevent a partial collection being mistaken for a complete picture',['To claim the collection represented all local employment','To explain why personal memories were unusable'],'the collection was an evolving set of personal accounts, not a complete statistical picture of employment.','标签提醒观众，个人叙述集不是全体就业的统计图景。')
]);
add('b2','reading','read-1','The roof that seemed to cool a district',
`A fictional housing partnership in the city of Selborne painted the roof of one warehouse with a pale coating. The project was intended to test whether a surface that reflected more sunlight could reduce the building's cooling demand. An enthusiastic press release later described it as evidence that the entire surrounding district had become cooler. The measurements supported a narrower conclusion.

Before the coating was applied, the project team attached temperature sensors to the warehouse roof and to an untreated roof across the street. They also placed sensors in the top-floor rooms of both buildings. On sunny afternoons after treatment, the coated roof was substantially cooler than it had been before, while the reduction inside the treated warehouse was smaller. Electricity bills also fell, but during the same month the warehouse operator replaced several old lamps with more efficient lighting. The bills therefore combined at least two changes rather than isolating the roof's contribution.

The comparison building appeared to solve this problem, yet it introduced another. It was occupied mainly in the morning, whereas the treated warehouse stayed open until late evening. Staff in the latter building had also begun closing loading doors during hot weather. Differences in occupation and door use could affect indoor temperatures independently of roof colour. The untreated roof remained useful for understanding how surfaces responded to the same weather, but the two buildings were not interchangeable laboratories.

The team considered adding more instruments. A contractor proposed a sensor on the pavement outside each building. These would provide information at pedestrian height, which was absent from the original design. However, two points would still not establish a district-wide change. A cool reading in a shaded doorway could reflect the doorway's position rather than a general benefit. A district-level claim would require a broader sampling plan that included both exposed and shaded public spaces, measured under comparable conditions.

Residents raised a further question: who would pay for maintaining the coating? The manufacturer expected the surface to remain reflective for several years, but the trial had lasted only one summer. Dust and leaf debris might alter its performance. The partnership therefore agreed to inspect the roof annually and to record cleaning costs rather than treating the installation price as the entire cost of the intervention. The inspection programme was a plan for collecting future evidence, not proof that maintenance would be cheap.

In its revised report, the team separated three scales of claim: the roof surface, the rooms below it and the district beyond the building. It retained the strong surface-temperature result, described the indoor result with qualifications, and withdrew the district-cooling statement. The revision did not make the experiment worthless. It made clear which questions had actually been investigated and which would need a different design. The partnership still had to decide whether the observed building benefit justified a larger trial. That decision could take account of cost, occupant comfort and uncertainty without pretending that every uncertainty had already been removed.`,[
 single('What was the original project designed to test?','Whether a reflective roof could reduce one building’s cooling demand',['Whether every street in Selborne became cooler','Whether residents preferred pale buildings'],'The project was intended to test whether a surface that reflected more sunlight could reduce the building\'s cooling demand.','原定范围是一座楼的制冷需求；新闻稿扩大成全区降温。'),
 single('Why do the lower electricity bills not isolate the roof’s effect?','The lighting was changed during the same period.',['The bills referred only to the untreated building.','No roof temperatures were measured.'],'the warehouse operator replaced several old lamps with more efficient lighting.','同期节能照明也会影响电费，因此账单无法单独分离屋顶贡献。'),
 single('For which purpose was the untreated roof still useful?','Comparing surface responses to shared weather conditions',['Proving that the two interiors operated identically','Measuring all pedestrians’ thermal comfort'],'The untreated roof remained useful for understanding how surfaces responded to the same weather','表面在同一天气下的响应仍可比，但室内使用方式不同。'),
 single('What limitation would remain with only two pavement sensors?','Their locations might not represent conditions across the district.',['They could measure only roof surfaces.','They would remove the need to record shade.'],'two points would still not establish a district-wide change.','局部测点可能受位置与阴影影响，不能代表全区。'),
 fill('A broader sampling plan should cover exposed and ____ public spaces. Write ONE WORD.','shaded','included both exposed and shaded public spaces','阴影是需要纳入的空间条件，而不是排除的误差。',1),
 single('Why was annual roof inspection added?','Longer-term performance and maintenance costs were still uncertain.',['One summer had already proved that cleaning was cheap.','The coating had been removed after a year.'],'the trial had lasted only one summer.','使用期限与维护成本尚无长期证据，因此要继续跟踪。'),
 single('Which claim was withdrawn from the revised report?','That the surrounding district had been cooled',['That the roof surface became cooler','That indoor results needed qualifications'],'withdrew the district-cooling statement.','撤回的是全区效果，强的屋顶表面证据保留。'),
 single('What is the writer’s main position?','A useful result should be stated at the scale the evidence supports.',['A trial is useless unless it removes every uncertainty.','A manufacturer’s expectation is equivalent to long-term observation.'],'It made clear which questions had actually been investigated and which would need a different design.','全文强调结论的范围应与研究设计相符，而非要求所有不确定性先消失。')
]);
add('b2','reading','read-2','What a seed collection can preserve',
`In the invented northern valley of Carven, a school and a gardening association established a seed collection for vegetables that local families had grown for many years. Its organisers were interested in preserving options for future gardeners. They were careful to distinguish that aim from a claim that every saved variety was superior to commercial alternatives. A collection could keep choices available without ranking all those choices in advance.

At the start, contributors labelled envelopes with familiar local names. Problems emerged when two families supplied beans under the same name but with different colours. Elsewhere, seeds with different names produced plants that looked almost identical. The coordinator decided to retain both the supplied name and a unique accession number. The number allowed a packet's identity to remain stable even if its name was later corrected. It was a tracking device, not a certificate that the seed represented a genetically distinct variety.

Storing packets was only part of the work. A small sample had to be grown periodically to check whether the seeds would still germinate. If viability fell, fresh seed could be collected from newly grown plants. Yet regeneration itself could change what was being preserved. When only a few plants contributed to the next generation, less common characteristics might disappear by chance. Growing compatible varieties too close together could also permit unwanted crossing. The association therefore documented how many plants were grown and how they were separated, rather than assuming that a new packet was an exact copy of the old one.

These precautions created a practical tension. The school wanted pupils to grow a wide variety of seeds in a small demonstration plot. The association needed enough space and attention to regenerate fewer varieties carefully. They resolved the conflict by giving the activities different purposes. The school plot would introduce pupils to variation and record observations. The main regeneration work would take place on members' larger plots. Seeds from the demonstration plot would not automatically be returned to the main collection as replacement stock.

The organisers also debated information access. Publishing a catalogue could help gardeners find useful plants, but a contributor might have supplied a story about a family member without expecting that story to appear online. Consent to store seeds did not automatically include consent to publish the accompanying personal account. The catalogue therefore separated agronomic descriptions from personal narratives, and contributors could approve the two uses independently. An anonymous account could still contain details that made a person recognisable in a small community, so removing names was not treated as a complete solution.

After two seasons, the collection contained fewer packets than the original publicity had promised. The coordinator regarded the shortfall as a reason to explain the work more clearly. Counting packets was easy; keeping reliable identities, documenting regeneration and respecting contributors' choices required continuing effort. A large total achieved by merging uncertain labels or replacing seed without a record would have created an appearance of security while reducing the collection's future usefulness. The project chose to publish its incomplete inventory together with the uncertainties, allowing later users to decide which material was suitable for their purposes.`,[
 single('How did the organisers define the collection’s purpose?','Keeping future choices available',['Proving that local varieties always outperform commercial seed','Replacing all commercial vegetables in the valley'],'A collection could keep choices available without ranking all those choices in advance.','保存选项不等于宣称所有地方品种更优。'),
 single('What was the purpose of the accession number?','Maintaining a stable identity when a name changed',['Guaranteeing genetic uniqueness','Showing how many families used the seed'],'The number allowed a packet\'s identity to remain stable even if its name was later corrected.','编号用于追踪身份，原文明确不是遗传独特性的证书。'),
 fill('Periodic growing checks whether stored seeds can still ____. Write ONE WORD.','germinate','A small sample had to be grown periodically to check whether the seeds would still germinate.','germinate 指发芽，是活力检测目的。',1),
 single('What risk results from regenerating seed from too few plants?','Uncommon characteristics may be lost by chance.',['All plants must cross with neighbouring varieties.','Accession numbers become unnecessary.'],'When only a few plants contributed to the next generation, less common characteristics might disappear by chance.','少量亲本带来随机丢失稀有特征的风险；与邻种杂交是另一个条件下的风险。'),
 single('How was the conflict over the school plot resolved?','Education and careful regeneration were assigned different sites and purposes.',['The school was required to stop growing seeds.','All demonstration seed became replacement stock.'],'The main regeneration work would take place on members\' larger plots.','学校保留展示教学，主再生工作用更大地块；展示种子不会自动回库。'),
 single('Which consent distinction did the catalogue preserve?','Seed storage and publication of personal stories were approved separately.',['All anonymous stories could be published without checking.','Seed contributors could approve publication only if they supplied names.'],'contributors could approve the two uses independently.','两种用途分别同意，匿名化也不能自动消除可识别风险。'),
 single('What attitude did the coordinator take to the smaller inventory?','It justified a clearer explanation of the ongoing work.',['It proved that documenting regeneration was unnecessary.','It required uncertain packets to be merged to meet the target.'],'the shortfall as a reason to explain the work more clearly.','未达数量宣传目标促使说明工作复杂性，未用合并不明来源来凑数。'),
 single('Why publish uncertainties with the inventory?','Users can judge fitness for their own purposes.',['Uncertainty guarantees that every seed is reliable.','The collection will no longer need regeneration.'],'allowing later users to decide which material was suitable for their purposes.','公开边界支持适用性判断，不能使不确定性自动消失。')
]);

// LISTENINGS
add('a1','listening','listen-gb','A ticket for the garden bus',
`Clerk: Good morning. Where do you want to go?
Mara: To Hill Garden, please.
Clerk: The next bus leaves at ten. It is the number four.
Mara: Is the ticket three pounds?
Clerk: That is a child's ticket. An adult ticket is five pounds.
Mara: One adult ticket, please. Where do I wait?
Clerk: At the stop beside the bank. The journey takes twenty minutes.
Mara: Can I buy food at the garden?
Clerk: There is a café, but it is closed today. Please take a sandwich. The garden closes at six. The last bus back is at half past five.
Mara: Thank you. I have my lunch with me.`,[
 single('乘客要去哪里？','Hill Garden',['The bank','A school'],'To Hill Garden, please.','目的地是 Hill Garden，银行是候车点附近的地标。'),
 fill('下一班车几点开？写一个英文单词。','ten','The next bus leaves at ten.','ten 是发车时间。',1),
 fill('应乘几路车？写一个英文单词。','four','It is the number four.','four 是路线编号，不是票价。',1),
 single('成人票多少钱？','Five pounds',['Three pounds','Four pounds'],'An adult ticket is five pounds.','三镑是儿童票，成人票五镑。'),
 single('应该在哪里候车？','Beside the bank',['Inside the café','At the garden gate'],'At the stop beside the bank.','银行旁的站点是起点。'),
 fill('车程是多少分钟？写一个英文单词。','twenty','The journey takes twenty minutes.','twenty 是车程而不是发车钟点。',1),
 single('为什么要自带食物？','The café is closed today.',['There is no café at the garden.','All food is too expensive.'],'There is a café, but it is closed today.','有咖啡馆，但当天不营业；没有价格信息。'),
 single('最后一班返程巴士几点？','Half past five',['Six','Half past six'],'The last bus back is at half past five.','花园六点关门，但末班车五点半。')
]);
add('a1','listening','listen-us','An announcement at Pine Pool',
`Hello, everyone. Welcome to Pine Pool. We open at eight on weekdays. On Sunday we open at ten. The small pool is for children, and the large pool is for adults. You need a yellow ticket for today's swimming lesson. Please give it to your teacher, Rosa. The lesson starts at eleven and lasts thirty minutes. You can leave your shoes in the box under the bench. Please bring your own towel. We sell water at the front desk, but we do not sell towels. Today the shower in room two is broken. Please use the shower in room three. Thank you, and enjoy your swim.`,[
 single('泳池周日几点开门？','Ten',['Eight','Eleven'],'On Sunday we open at ten.','周日与平日开门时间不同。'),
 single('儿童应使用哪个池？','The small pool',['The large pool','Both pools are only for adults'],'The small pool is for children','小池供儿童使用。'),
 fill('今天游泳课需要什么颜色的票？写一个英文单词。','yellow','You need a yellow ticket for today\'s swimming lesson.','课程票是黄色。',1),
 fill('老师叫什么？写原文中的名字。','Rosa','Please give it to your teacher, Rosa.','票要交给老师 Rosa。',1),
 single('游泳课持续多久？','Thirty minutes',['Eleven minutes','An hour'],'The lesson starts at eleven and lasts thirty minutes.','十一点是开始钟点，三十分钟是课长。'),
 single('鞋子放在哪里？','In a box under the bench',['On the front desk','In the large pool'],'You can leave your shoes in the box under the bench.','注意 box under the bench。'),
 single('必须自带什么？','A towel',['Water','A yellow box'],'Please bring your own towel.','前台卖水，不卖毛巾。'),
 fill('今天应使用几号房间的淋浴？写一个英文单词。','three','Please use the shower in room three.','二号房的淋浴坏了，改用三号房。',1)
]);
add('a1','listening','listen-au','Collecting a vegetable box',
`Farmer: Hello. Are you here for a vegetable box?
Nina: Yes. My name is Nina Chen. I have a small box.
Farmer: Here it is. The small box is twelve dollars. The large one is twenty.
Nina: Can I pay by card?
Farmer: Yes. Please collect your box on Friday next week, not Saturday. We are at a market on Saturday.
Nina: What time can I come on Friday?
Farmer: After two. Please bring a bag. We need the box here for the next person. Today you have beans, carrots and potatoes. There are no onions this week.
Nina: That is fine. Where can I put my car?
Farmer: Behind the green shed.`,[
 single('Nina 预订的是哪种箱子？','A small box',['A large box','Two small boxes'],'I have a small box.','数量是一份 small box。'),
 fill('小箱蔬菜多少钱？写一个英文单词。','twelve','The small box is twelve dollars.','大箱 twenty，不是 Nina 所取的箱子。',1),
 single('能否刷卡？','Yes',['No, cash only','Only on Saturday'],'Can I pay by card?\nFarmer: Yes.','Yes 回应刷卡付款问题。'),
 fill('下周应在星期几领取？写一个英文单词。','Friday','Please collect your box on Friday next week, not Saturday.','明确改成 Friday，不是 Saturday。',1),
 single('下周五几点以后可以来？','After two',['Before two','After twelve'],'After two.','回答针对周五领取时间。'),
 single('为什么要自带袋子？','The box is needed for another customer.',['Bags are sold only at the market.','The vegetables are too hot.'],'We need the box here for the next person.','箱子留在农场周转，因此带袋子装菜。'),
 fill('这周没有哪种蔬菜？写一个英文单词。','onions','There are no onions this week.','beans、carrots 和 potatoes 有，onions 没有。',1),
 single('汽车应停在哪里？','Behind the green shed',['In front of the market','Next to the red house'],'Behind the green shed.','停在绿色棚屋后方。')
]);
add('a1','listening','listen-in','Your first visit to the computer room',
`Welcome to our computer room. My name is Anil. I am here to help you. There are ten computers. Please use computer seven today. Its screen is next to the window. Your class starts at nine thirty. We learn to send an email today. You need your phone for the class, but you do not need a book. You can get paper from the cupboard by the door. The printer costs two rupees for one page. Please ask me before you print. You can drink water here, but please eat your food outside. The room closes at four. If you leave before then, please turn off your screen.`,[
 fill('帮助大家的人叫什么？写原文中的名字。','Anil','My name is Anil.','这是帮助者的名字。',1),
 single('今天应使用几号电脑？','Seven',['Ten','Four'],'Please use computer seven today.','ten 是电脑总数，seven 是指定电脑编号。'),
 single('指定电脑的屏幕在哪里？','Next to the window',['By the door','Behind the cupboard'],'Its screen is next to the window.','Its 指 computer seven。'),
 single('课程几点开始？','Nine thirty',['Nine','Ten thirty'],'Your class starts at nine thirty.','听清九点半而非九点整。'),
 single('今天课程学习做什么？','Send an email',['Print a book','Make a phone'],'We learn to send an email today.','手机是要带的工具，发送邮件才是学习任务。'),
 fill('上课必须带什么？写一个英文单词。','phone','You need your phone for the class, but you do not need a book.','phone 必需，book 不需要。',1),
 fill('打印一页要多少卢比？写一个英文单词。','two','The printer costs two rupees for one page.','two 是每页打印费用。',1),
 single('离开时应做什么？','Turn off the screen',['Eat food in the room','Leave the phone in the cupboard'],'If you leave before then, please turn off your screen.','离开要关屏幕；食物应到室外吃。')
]);
add('a2','listening','listen-gb','A parcel at the collection office',
`Clerk: Good afternoon. Can I help?
Elliot: I have a card saying there is a parcel for me. I tried the post office on King Street, but they sent me here.
Clerk: Yes, this is the collection office. What is your surname?
Elliot: Parker. P A R K E R.
Clerk: Thank you. Do you have photo identification?
Elliot: I have my driving licence. Is that all right?
Clerk: Yes. The address matches, so that is fine. Your parcel arrived yesterday. It is quite large. Did you come by car?
Elliot: No, by bicycle. Can you keep it until tomorrow?
Clerk: Certainly. We can keep it free for seven days. After that it goes back to the sender. We close at five today, but tomorrow is Saturday, so we close at noon.
Elliot: I will come at ten with my sister's car. Is there a car park?
Clerk: Use the spaces behind this building. The front spaces belong to the dentist. Bring this card again. Your sister can collect the parcel for you, but she will need your written permission as well as the card.
Elliot: I will come myself. Thanks for explaining.`,[
 single('Why did Elliot leave the King Street post office?','He was directed to this collection office.',['It had already closed.','It had lost his identity card.'],'they sent me here.','另一处邮局把他转到领取中心，没有说该邮局停业。'),
 fill('What is Elliot’s surname? Write ONE WORD.','Parker','Parker. P A R K E R.','姓名有逐字母拼写佐证。',1),
 single('Which identification does he show?','A driving licence',['A passport','A student card'],'I have my driving licence.','所持证件是驾照；不是提问中举例的别种证件。'),
 single('Why does he leave without the parcel?','It is large and he has come by bicycle.',['His address is incorrect.','The parcel has not arrived.'],'It is quite large. Did you come by car?\nElliot: No, by bicycle.','地址通过核对，包裹已到；运输不便才决定明日来取。'),
 fill('How many days can the office keep the parcel free? Write ONE WORD.','seven','We can keep it free for seven days.','超过七天退给寄件人，不是开始收费。',1),
 fill('At what time does the office close on Saturday? Write ONE WORD.','noon','tomorrow is Saturday, so we close at noon.','今天五点、周六中午，应区分。',1),
 single('Where should Elliot park tomorrow?','Behind the collection-office building',['In the spaces at the front','Behind the King Street post office'],'Use the spaces behind this building.','前面车位归牙医，后面才可停车。'),
 single('What additional item would his sister need to collect the parcel?','His written permission',['Her bicycle receipt','A payment for storage'],'she will need your written permission as well as the card.','妹妹代取除卡片外还要书面授权；Elliot 最后选择本人来。')
]);
add('a2','listening','listen-us','Training for new library volunteers',
`Hello, and thank you for volunteering at Westfield Library. This is a training session for our Saturday reading club. Children arrive at ten, but please be here at nine forty-five so that we can arrange the chairs. The club meets in the room upstairs. We used the children's area last month, but it was too noisy for reading aloud.

Each volunteer will work with three children. The children choose their own story, and your job is to help them understand it. Please do not turn the session into a spelling test. If a child does not want to read aloud, you can read a page first and then invite the child to join in. Do not insist.

There is a break after forty minutes. Water is available in the room. Snacks are not allowed there because a child in the club has a serious food allergy. Parents collect the children at eleven thirty. If a parent is late, tell the librarian at the front desk. Never leave a child waiting alone. You will receive a blue volunteer badge today. Please return it to the desk when you leave; we use the same badges each week. If you cannot attend a future session, email me by Thursday evening.`,[
 fill('Volunteers should arrive at ____. Write NO MORE THAN TWO WORDS.','nine forty-five','please be here at nine forty-five','十点是孩子到达时间，志愿者应提前十五分钟。'),
 single('Where will the club meet?','In the upstairs room',['In the children’s area','At the front desk'],'The club meets in the room upstairs.','儿童区是上个月使用的地点，现改到楼上。'),
 fill('How many children will each volunteer work with? Write ONE WORD.','three','Each volunteer will work with three children.','每位志愿者三名孩子。',1),
 single('What should a volunteer do if a child is reluctant to read aloud?','Read first and invite the child to join in',['Insist that the child finishes a page','Give the child a spelling test'],'you can read a page first and then invite the child to join in.','引导而不强迫，且不做拼写测验。'),
 single('Why are snacks prohibited in the room?','A child has a food allergy.',['The break is too short.','The librarian sells food downstairs.'],'because a child in the club has a serious food allergy.','明确原因是食品过敏，不是卫生或付费安排。'),
 single('What should a volunteer do when a parent is late?','Tell the librarian at the front desk',['Send the child home alone','Wait outside without telling anyone'],'If a parent is late, tell the librarian at the front desk.','通知管理员且不得让孩子独自等待。'),
 fill('What colour is the volunteer badge? Write ONE WORD.','blue','You will receive a blue volunteer badge today.','徽章是蓝色。',1),
 single('By when should an absence be reported?','Thursday evening',['Saturday morning','Friday noon'],'email me by Thursday evening.','通过电子邮件，截止周四晚。')
]);
add('a2','listening','listen-au','Booking a coast walk',
`Guide: Coast Walks, this is Rachel.
Owen: I would like to book two places for the walk on Sunday. I saw that it starts at the beach café.
Guide: We have changed the meeting point. The café is being painted, so please meet at the bus shelter opposite it. The start time is still eight thirty.
Owen: Is it a difficult walk?
Guide: The whole route is six kilometres. The first part is flat, but there are steps near the lighthouse. We stop for a short rest at the top. Allow three hours, including the break.
Owen: What do we need to bring?
Guide: Water and a hat. There is very little shade. Wear shoes with a good grip. We do not recommend sandals. I can lend you a rain jacket if the weather changes.
Owen: How much is it?
Guide: Eighteen dollars per adult. That includes a bus ticket back to the starting point. You can pay me on the day. Please send your mobile number by email today so I can contact you if the walk is cancelled.
Owen: Does light rain mean it is cancelled?
Guide: No, but we cancel for thunderstorms. We never take a group onto the exposed path when there is lightning.`,[
 single('What is the new meeting point?','The bus shelter opposite the café',['Inside the beach café','Beside the lighthouse'],'please meet at the bus shelter opposite it.','it 指前文咖啡馆，集合点在其对面公交候车亭。'),
 fill('What time does the walk start? Write NO MORE THAN TWO WORDS.','eight thirty','The start time is still eight thirty.','集合点变更，时间未变。'),
 fill('How long is the whole route in kilometres? Write ONE WORD.','six','The whole route is six kilometres.','三小时是含休息的时间，不是距离。',1),
 single('Which part has steps?','The part near the lighthouse',['The entire first section','The path inside the café'],'there are steps near the lighthouse.','开头路段平坦，灯塔附近有台阶。'),
 single('Why does the guide advise bringing a hat?','There is little shade.',['Rain jackets are unavailable.','All walkers must wear a uniform.'],'There is very little shade.','帽子应对少树荫；雨衣另可借。'),
 single('What is included in the adult price?','The return bus ticket',['A pair of walking shoes','Lunch at the café'],'That includes a bus ticket back to the starting point.','费用包括回起点的巴士，不含其他物品。'),
 single('What must Owen email today?','His mobile number',['Proof of payment','A weather forecast'],'Please send your mobile number by email today','留下手机号码供取消时联系，不要求提前付款。'),
 single('Which weather causes cancellation?','Thunderstorms',['All light rain','Cloudy weather'],'we cancel for thunderstorms.','小雨不会自动取消，雷暴才会。')
]);
add('a2','listening','listen-in','Borrowing a recorder for fieldwork',
`Student: Hello. I need to borrow a recorder for a college interview project.
Technician: Have you completed the equipment form?
Student: I filled it in online last night. My student number ends in six two one.
Technician: I can see it. You asked for a camera as well.
Student: That was a mistake. We only need sound, not video.
Technician: Fine. The recorder is available from Wednesday. You must return it by four on Friday. We are closed at the weekend.
Student: Does it need batteries?
Technician: It has a rechargeable battery. Charge it with this cable. A full charge lasts about eight hours, but check the battery before every interview. There is a spare memory card in the case.
Student: Can we record in the street?
Technician: You can, but traffic may hide people's voices. Try a quiet room first. Always ask people for permission before you record them.
Student: How can I learn to use it?
Technician: Watch the short training video on the college website. Then make a test recording here before you leave. Headphones are provided so you can check it. If there is a problem later, email the technical team. Do not post the college equipment number on a public forum.`,[
 single('What equipment does the student actually need?','A sound recorder',['A video camera only','Both a camera and a projector'],'We only need sound, not video.','申请相机是误填，实际只需录音。'),
 fill('The student number ends in ____. Write THREE DIGITS.','621','My student number ends in six two one.','按拼读顺序写621；允许数字等价答案。',1),
 fill('From which day is the recorder available? Write ONE WORD.','Wednesday','The recorder is available from Wednesday.','Wednesday 是起借日，Friday 是截止归还日。',1),
 single('By when must the recorder be returned?','Four on Friday',['Friday evening after six','Monday morning'],'You must return it by four on Friday.','周末关门，因此周五四点前还。'),
 single('How is the recorder powered?','By a rechargeable battery',['By disposable batteries only','By a cable that must stay plugged in while recording'],'It has a rechargeable battery.','附线用于充电，未说录音时必须一直插电。'),
 single('Why is a quiet room suggested?','Traffic could make voices hard to hear.',['Street interviews are forbidden.','The memory card cannot be used outside.'],'traffic may hide people\'s voices.','街访允许，但噪音可能掩盖人声。'),
 single('What must happen before recording another person?','The person must give permission.',['The equipment number must be posted online.','The person must watch the training video.'],'Always ask people for permission before you record them.','先征得被录者许可。'),
 single('What should the student do before leaving the equipment room?','Make and listen to a test recording',['Buy headphones from the technician','Send an interview to a public forum'],'Then make a test recording here before you leave.','提供耳机以检查试录，先当场验证设备。')
]);
materials.at(-1).questions[1]=single('Which digits are at the end of the student number?','621',['612','216'],'My student number ends in six two one.','按 six、two、one 的顺序选择621。');materials.at(-1).questions[1].id='q2';
add('b1','listening','listen-gb','Planning a pottery workshop',
`Coordinator: Thanks for helping with next month's pottery workshop, Ben. The original plan was to use the upstairs studio, but the lift will be serviced that week. We have booked the ground-floor dining room instead. We can move the tables, and everyone will be able to get in without using stairs.
Ben: Are we keeping the original date?
Coordinator: Yes, Saturday the fourteenth. The session starts at ten, but helpers should arrive at nine to protect the floor. Please bring old towels. Plastic sheets slide too easily on this surface.
Ben: How many people can attend?
Coordinator: The room can hold twenty, but the tutor wants a maximum of twelve beginners so that she can check everyone's technique. We have nine bookings so far. Do not advertise twenty places just because we have twenty chairs.
Ben: What will people make?
Coordinator: A small bowl. We considered mugs, but handles need more time than we have. The tutor will demonstrate first, and then people will work on their own pieces. They must wear closed shoes. We provide aprons.
Ben: Can they take the bowls home that day?
Coordinator: No. They need to dry and then go into the kiln at the tutor's workshop. Participants can collect them from the library two weeks later. If a bowl cracks during firing, the tutor will explain what happened, but we cannot promise a replacement.
Ben: What about payment?
Coordinator: The fee includes clay and firing. The café is closed, so tea is included too. We will ask people to bring lunch. If someone cancels at least three days before the session, we can return the fee. Later cancellations receive a refund only if another person takes the place.
Ben: I will put those details in the confirmation email.`,[
 single('Why has the venue moved to the ground floor?','The lift will be out of use.',['The upstairs studio has fewer tables.','The tutor wants to use a kiln in the dining room.'],'the lift will be serviced that week.','电梯维护使楼上不便，换到无需楼梯的地点。'),
 fill('What should helpers bring to protect the floor? Write NO MORE THAN TWO WORDS.','old towels','Please bring old towels.','塑料布容易滑，旧毛巾才是要求。'),
 single('What is the maximum number of participants?','Twelve',['Twenty','Nine'],'the tutor wants a maximum of twelve beginners','二十是房间容量、九是当前报名，教学上限十二。'),
 single('Why will participants make bowls rather than mugs?','Handles would require too much time.',['Bowls do not need firing.','Mugs cannot be made from the supplied clay.'],'handles need more time than we have.','时间不足以做杯把，未说杯子材料不适合。'),
 fill('Participants must wear ____ shoes. Write ONE WORD.','closed','They must wear closed shoes.','围裙由主办方提供，但鞋应为包脚款。',1),
 single('Where will finished pieces be collected?','At the library',['At the dining room that afternoon','At the tutor’s workshop'],'Participants can collect them from the library two weeks later.','烧制在老师工坊，领取在图书馆，二者不同。'),
 single('What does the fee include?','Clay, firing and tea',['Clay and a replacement for every cracked bowl','Firing and lunch'],'The fee includes clay and firing. The café is closed, so tea is included too.','包括泥、烧制和茶；午饭自备，不保证裂损替换。'),
 single('When can a late cancellation receive a refund?','When another participant takes the place',['Whenever the bowl cracks','Only when the dining room is full'],'Later cancellations receive a refund only if another person takes the place.','不足提前三天的取消，需要有人补位才退款。')
]);
add('b1','listening','listen-us','A student project on package instructions',
`Tutor: Tell me about your study, Maya.
Maya: We want to know whether clearer instructions help people put a flat-pack box together. We made two instruction sheets. One has paragraphs, and the other has numbered drawings. We will give everyone the same set of cardboard parts.
Tutor: Good. How will you divide participants?
Maya: We thought people could choose the sheet they prefer.
Tutor: That would make the result difficult to interpret. People who choose drawings might already be better at this kind of task. Allocate the sheets at random instead. Record whether participants have assembled similar boxes before, too.
Maya: Should we time how quickly they finish?
Tutor: Yes, but speed alone is not enough. A box assembled quickly may fall apart. Check whether each finished box can hold a standard weight. Use the same weight for everyone, and decide the checking procedure before you start.
Maya: We have twenty-four volunteers. Half can come on Monday and half on Wednesday. Could we use the paragraph sheet on Monday and the drawings on Wednesday?
Tutor: Avoid that. A difference between days could become a difference between instruction types. Use both types on each day. Keep the room arrangement and the time allowed the same.
Maya: What about helping someone who gets stuck?
Tutor: Explain the safety rules to everyone beforehand, but do not give extra assembly hints during the independent task. If someone decides to stop, record that choice. Do not invent a finishing time for them or delete them because they were slow.
Maya: We will also ask which sheet they liked.
Tutor: That can be useful, as long as you report preference separately from successful assembly. A person might enjoy a sheet that does not help them make a stronger box. With a small volunteer sample, treat the project as an initial comparison rather than a conclusion about all consumers.`,[
 single('What is kept identical for all participants?','The cardboard parts',['The instruction format','Their previous experience'],'We will give everyone the same set of cardboard parts.','零件一致，指引形式是要比较的变量。'),
 single('Why does the tutor reject letting participants choose instructions?','The groups could differ in relevant ability before the task.',['All participants prefer paragraphs.','Drawings are unsafe.'],'People who choose drawings might already be better at this kind of task.','自选可能与能力相关，随机分配减少这种偏差。'),
 fill('What previous experience should be recorded? Assembling similar ____. Write ONE WORD.','boxes','Record whether participants have assembled similar boxes before, too.','记录相近任务经验用于解释结果。',1),
 single('What outcome should supplement completion speed?','Whether the box supports the standard weight',['Whether participants bring their own cardboard','Whether the tutor likes the final colour'],'Check whether each finished box can hold a standard weight.','速度不等于组装质量，标准承重提供另一个指标。'),
 single('How should the instruction types be distributed across test days?','Use both types on both days',['Use paragraphs only on Monday','Use drawings only on Wednesday'],'Use both types on each day.','避免日期差异和指引类型混在一起。'),
 single('What assistance is permitted before the task?','Explaining safety rules',['Showing each participant how to finish','Correcting all assembly errors'],'Explain the safety rules to everyone beforehand','事前统一安全说明允许；独立任务中额外组装提示不允许。'),
 single('How should an unfinished attempt be handled?','Record that the participant stopped',['Assign a very slow finishing time','Remove it from the record without explanation'],'If someone decides to stop, record that choice.','保留停止事实，不捏造完成时间、不无说明剔除。'),
 single('How should participants’ preferences be reported?','Separately from assembly success',['As proof that the preferred sheet makes stronger boxes','As a conclusion about every consumer'],'report preference separately from successful assembly.','偏好与客观组装成功是不同结果。')
]);
add('b1','listening','listen-au','Preparing a dune-monitoring visit',
`Leader: Before Saturday's visit, I want to explain our dune-monitoring plan. We are not planting anything this month. We are taking photographs and recording where people leave the boardwalk. That will help us choose places for future signs.
Volunteer: Last year we counted footprints. Are we doing that again?
Leader: No. Footprints can remain for several days, so one busy afternoon can affect several counts. This time we will observe actual movements during fixed periods. Each pair will watch one access point for twenty minutes, followed by a ten-minute break. We will use the same periods at all three access points.
Volunteer: Should we tell people to stay on the path?
Leader: A ranger will deal with safety. Your job is to observe without starting conversations about the research. If we remind people while counting, their behaviour may change because we are there. Of course, tell the ranger immediately if someone is in danger.
Volunteer: Where should we take photographs?
Leader: Use the painted post as your starting point. Hold the camera at chest height and face north. The pictures are for comparing the visible area over time. They are not measurements of the amount of sand. Please avoid identifiable faces; wait a moment if someone is directly in front of you.
Volunteer: Do we enter the dune to get a better view?
Leader: No. Stay on the boardwalk. The western access point is closed because a section is damaged, so we will replace it with the central one. The weather forecast is dry, but if the wind becomes strong enough to blow loose sand into our equipment, we will stop and note the time. We will not record a stopped session as zero visitors.
Volunteer: When do you need the forms?
Leader: Upload them by Sunday evening, including any difficulties. A form with a clear note about missing observations is more useful than a form that looks complete but contains guesses.`,[
 single('What is the purpose of this month’s visit?','Collect information to plan future signs',['Plant new vegetation','Measure the depth of the sand'],'That will help us choose places for future signs.','拍照和观察离开栈道行为，支持标识规划；非种植或沙量测定。'),
 single('Why are footprints no longer being counted?','They can remain across several observation days.',['They are always hidden by vegetation.','The volunteers can no longer reach the beach.'],'Footprints can remain for several days','旧足迹可能反复进入多次计数。'),
 fill('Each observation period lasts ____ minutes. Write ONE WORD.','twenty','Each pair will watch one access point for twenty minutes','十分钟是休息，二十分钟是观察段。',1),
 single('Why should volunteers avoid reminding visitors during the count?','The reminders might alter the behaviour being observed.',['The ranger has forbidden all safety reports.','Visitors must be photographed before speaking.'],'their behaviour may change because we are there.','测量时干预会影响行为；危险仍须报告。'),
 fill('In which direction should the camera face? Write ONE WORD.','north','Hold the camera at chest height and face north.','相机固定方向有助跨时比较。',1),
 single('Which access point replaces the damaged western point?','The central point',['The eastern point','The northern point'],'we will replace it with the central one.','西侧损坏，改用中央点。'),
 single('What should happen when loose sand threatens the equipment?','Stop and record when observation ended',['Enter the dune to shelter','Record the rest of the period as having no visitors'],'we will stop and note the time.','中断段缺数据，不能写成零人。'),
 single('What kind of form does the leader prefer?','One that explains missing observations honestly',['One filled with guesses to avoid blanks','One without any account of difficulties'],'A form with a clear note about missing observations is more useful','完整外观不能替代可靠记录。')
]);
add('b1','listening','listen-in','Reviewing a campus café trial',
`Manager: We need to review the smaller-plate trial before deciding whether to continue it. What did your student group find, Rani?
Rani: We weighed food left on returned plates for five lunch services. Plate waste fell from an average of thirty kilograms a day in the previous week to twenty-two during the trial. However, fewer meals were served during the trial because a department was away on a field trip.
Manager: So the daily total is not a fair comparison?
Rani: Not on its own. We need the waste per meal as well. We have meal counts from the till, so we can calculate that. We did not weigh food left in the kitchen. Our figures concern returned plates only.
Manager: Did customers like the smaller plates?
Rani: The comment cards were mixed. Some liked being able to take a small portion first and come back for more. Others thought the change was a way to raise prices, although prices stayed the same. The sign explaining free second helpings was behind the water machine, where it was easy to miss.
Manager: We can move that sign. Did second helpings create a queue?
Rani: We observed the serving area on two days. The longest queue was at twelve fifteen, but there was only one server then because another staff member was unloading deliveries. We cannot attribute the queue entirely to plate size.
Manager: What would you recommend next?
Rani: Keep recording for two more weeks with normal attendance, display the second-helping information clearly and note staffing levels. Also ask customers a specific question about whether the portions meet their needs. A general satisfaction question might not tell us why someone is unhappy.
Manager: And what about the price rumours?
Rani: Put the unchanged prices where customers collect plates. Clear information may solve a misunderstanding, but we should still check whether people find repeated trips inconvenient.`,[
 fill('During the trial, average daily plate waste was ____ kilograms. Write ONE WORD.','twenty-two','to twenty-two during the trial.','三十是前一周水平，试验周二十二。',1),
 single('Why should waste per meal be calculated?','Fewer meals were served during the trial.',['Meal prices increased.','Kitchen waste was included twice.'],'fewer meals were served during the trial because a department was away on a field trip.','总份数下降可能解释每日垃圾减少，应使用同口径每餐指标。'),
 single('What is excluded from the waste figures?','Food remaining in the kitchen',['Food on returned plates','All meals recorded by the till'],'We did not weigh food left in the kitchen.','测量范围只含退回盘中的食物。'),
 single('Why did some customers misunderstand the trial?','Information about free second helpings was hard to see.',['Prices were higher on trial days.','The café refused second helpings.'],'The sign explaining free second helpings was behind the water machine','价格不变、允许免费添餐，但告示被遮挡。'),
 fill('At what time was the longest queue observed? Write NO MORE THAN TWO WORDS.','twelve fifteen','The longest queue was at twelve fifteen','原文具体观察到十二点十五分队伍最长。'),
 single('What other factor could explain the long queue?','Reduced staffing at that time',['A new charge for water','Customers arriving from the field trip'],'there was only one server then because another staff member was unloading deliveries.','当时只有一名服务员，排队不能全归因于小盘。'),
 single('Why ask a specific question about portions?','General satisfaction may conceal the reason for dissatisfaction.',['Customers cannot answer general questions.','It will prove all customers prefer large plates.'],'A general satisfaction question might not tell us why someone is unhappy.','更具体的问题有助区分份量与其他不满意原因。'),
 single('What concern remains even after clearer information is displayed?','Some customers may find repeated trips inconvenient.',['Prices may secretly double.','The till cannot record meal counts.'],'we should still check whether people find repeated trips inconvenient.','解决误解后仍应检查真实不便，不能用宣传替代体验证据。')
]);
add('b2','listening','listen-gb','Discussing a public-art consultation',
`Chair: Our task today is to design the consultation for the station-square artwork. We have funding for a sculpture, but we have not chosen a design. The sponsor offered three proposals, and the council wants residents to comment before it selects one.
Planner: We could simply put the images online and count votes. That would be quick, but people who use the square without following council websites might never hear about it. I suggest an exhibition at the station as well as the online survey.
Chair: Would that solve the representation problem?
Planner: It would reach some additional users, especially commuters. It would not automatically include residents who avoid the station. We should record how people encountered the consultation and describe that limitation in the report. Calling every response a vote from the whole community would overstate what we know.
Chair: The sponsor prefers the tallest proposal. It says that would create the clearest landmark.
Planner: Height is relevant, but the artwork also has to leave a clear route through the square. The access team has asked for a turning space beside the bus entrance. A photograph from one angle may not show whether that route is blocked. We should provide a simple ground plan with dimensions for each design.
Chair: Some comments may be about the whole square rather than the sculpture. Should we exclude them?
Planner: Keep them, but label them separately. A complaint about poor lighting is relevant to the place, though it does not necessarily express opposition to a particular sculpture. We should not code every negative comment as a rejection of art. Also, a preference between three designs does not tell us whether someone wanted a sculpture in the first place.
Chair: The installation budget is fixed. Can we ignore costs in the survey?
Planner: We need not ask residents to invent prices, but maintenance should be part of the information. The metal proposal needs annual inspection, while the timber proposal has a scheduled protective treatment. We need estimates for those activities before comparing the whole-life cost. The lowest initial price may not remain the lowest over time.
Chair: When will the decision be published?
Planner: After the access review and cost estimates are complete. We should publish the reasons alongside the selected design, including where the council has departed from the most popular response. Consultation informs the decision; unless we promise a binding vote, popularity is one input among several.`,[
 single('What has already been decided before the consultation?','Funding is available for a sculpture.',['The tallest design will be installed.','The online survey result will be binding.'],'We have funding for a sculpture, but we have not chosen a design.','资金已到位，具体设计未选。'),
 single('Why is a station exhibition proposed?','To reach users who may miss an online-only consultation',['To replace every other consultation method','To prove that all residents commute by train'],'people who use the square without following council websites might never hear about it.','现场展览补充触达人群，未声称全面代表。'),
 single('What limitation would still remain?','People who avoid the station might be underrepresented.',['Commuters would be barred from responding.','The survey could no longer record response sources.'],'It would not automatically include residents who avoid the station.','站内展览仍不能自动覆盖不去车站的人。'),
 fill('What should accompany images to assess access? A ground plan with ____. Write ONE WORD.','dimensions','a simple ground plan with dimensions for each design.','尺寸平面图帮助判断通行空间，单一角度照片可能不够。',1),
 single('How should complaints about lighting be handled?','Retain them in a separate category',['Count them as opposition to every sculpture','Delete them as irrelevant to the place'],'Keep them, but label them separately.','保留场所意见但不混成对雕塑的反对票。'),
 single('What cannot be concluded from a choice among the three designs?','That the respondent wanted a sculpture at all',['That one design was preferred to another','That three designs were presented'],'a preference between three designs does not tell us whether someone wanted a sculpture in the first place.','限定选项中的偏好无法回答是否想要雕塑的前置问题。'),
 single('Why obtain maintenance estimates?','Initial price does not establish total cost over time.',['Residents must calculate the sponsor’s profit.','Both materials require identical treatment.'],'The lowest initial price may not remain the lowest over time.','维护不同会改变生命周期成本比较。'),
 single('What is the planner’s view of the consultation result?','It should inform a decision considered alongside other evidence.',['It must override access requirements.','It can be withheld if the council disagrees.'],'popularity is one input among several.','并非承诺约束性投票，应结合可达性和成本且公开理由。')
]);
add('b2','listening','listen-us','A proposal for library occupancy sensors',
`Researcher: We would like to evaluate whether the library's new study area is used as intended. The building team has offered occupancy sensors for each desk. They detect whether a seat is occupied but do not record images or sound.
Ethics Adviser: What question would the data answer?
Researcher: We could calculate the proportion of available desk time that is occupied. The team initially wanted to describe that as student engagement, but we cannot tell whether a seated person is studying, resting or waiting for a friend. I have changed the term to desk occupancy.
Ethics Adviser: Good. What about the sensors' accuracy?
Researcher: We will compare a sample of sensor readings with brief manual counts. A bag left on a chair might be detected as a person, while someone standing beside a desk might not register. We need to estimate these errors before treating every signal as exact. The checking observers will count occupied seats, without recording names or screen content.
Ethics Adviser: How will you compare the old and new layouts?
Researcher: We have records from the previous month, but that month included examinations. A direct comparison could confuse the layout effect with seasonal demand. We therefore plan to compare matching weeks next term and note any closures or changes in opening hours. That does not remove every difference, but it makes the comparison more interpretable.
Ethics Adviser: Are you going to publish a live display of empty desks?
Researcher: That is a separate proposal. The research dataset will be grouped into hourly summaries, with no individual desk history released publicly. Even without names, an exact sequence at one desk might reveal someone's routine when combined with other observations. We are not claiming that removing names makes every use risk-free.
Ethics Adviser: Who can access the raw records?
Researcher: Only the named project analysts, for a checking period of six months. After that, the raw records will be deleted and the aggregated results retained. The retention schedule will be in the information notice. Staff should not promise immediate deletion if an equipment fault delays the process; they must document the delay and notify the data manager.
Ethics Adviser: And how will students be informed?
Researcher: Notices at the entrance and in the study area will explain what is collected, why and for how long. We will provide a contact for questions. A small link hidden on the library website would not be enough for people who enter without visiting that page.`,[
 single('What do the proposed sensors directly measure?','Whether desk seats are occupied',['How engaged each student is','What is displayed on computer screens'],'They detect whether a seat is occupied but do not record images or sound.','直接观察量是占座信号，不能推断学习投入。'),
 single('Why was “student engagement” replaced with “desk occupancy”?','The signal cannot distinguish studying from other seated activities.',['The library no longer allows studying.','The sensors identify every student by name.'],'we cannot tell whether a seated person is studying, resting or waiting for a friend.','命名应与测量范围一致。'),
 fill('Sensor readings will be checked against brief manual ____. Write ONE WORD.','counts','compare a sample of sensor readings with brief manual counts.','人工计数作为部分抽查，不记录个人屏幕内容。',1),
 single('What weakens a direct comparison with the previous month?','It included an examination period.',['The old layout had no desks.','Every manual count was wrong.'],'that month included examinations.','考试期需求可能不同，不能把全部差异归因于布局。'),
 single('What level of data will be available in the public research dataset?','Hourly summaries',['Exact public histories of individual desks','Names linked to sensor signals'],'The research dataset will be grouped into hourly summaries','只公开分时汇总，不公开单桌精确序列。'),
 single('Why could an unnamed desk history still pose a privacy issue?','It might reveal a routine when linked with other observations.',['It necessarily contains a student’s screen image.','Anonymous records can never be analysed.'],'an exact sequence at one desk might reveal someone\'s routine when combined with other observations.','组合其他观察可能重新关联个体作息，去名不是完整保证。'),
 fill('How long is the raw-record checking period? Write NO MORE THAN TWO WORDS.','six months','for a checking period of six months.','这是原始记录核对保留期，之后留汇总数据。'),
 single('Why are notices required in the building?','Some users will not have seen the website.',['The library wants to conceal the retention period.','Only staff can read the online notice.'],'people who enter without visiting that page.','现场通知覆盖未先浏览网页的进入者。')
]);
add('b2','listening','listen-au','Evaluating a neighbourhood rain garden',
`Lecturer: Today we will use a fictional rain-garden project to examine how performance claims depend on measurement choices. A rain garden is a planted depression designed to receive runoff from nearby hard surfaces. In our example, a council installed one beside a car park. Water enters through a lowered section of kerb, passes through the planted soil and can leave through an overflow when the system is full.

The project report first stated that the garden could hold forty cubic metres. That was a design-capacity estimate based on the proposed geometry. It was not an observation that forty cubic metres had been retained during a storm. Construction changed the final shape slightly, so the team surveyed the completed basin before using the capacity estimate in a performance calculation.

For the first three storms, staff recorded the depth of water in the garden at the end of each event. Those readings showed water level at particular moments, but not the total volume of runoff treated. Water could infiltrate while new water entered, meaning that flow over the whole event might exceed the water stored at any single moment. Conversely, a deep pool that remained for a long time could indicate slow drainage rather than successful rapid treatment. Depth alone did not answer every question.

The engineers added measurements at the inlet and overflow. These helped estimate how much water entered and how much bypassed treatment. They also recorded rainfall near the site. Using a distant airport's rainfall total had seemed convenient, but short storms could differ across the area. A site could appear unusually effective simply because it had received less rain than the reference station.

Maintenance created another source of variation. Leaves sometimes blocked the kerb opening, so less runoff entered the garden. If the report counted only water reaching the inlet sensor, that blockage could disappear from the performance story. The council therefore kept a separate maintenance log and recorded when the entrance was obstructed. A system that treats incoming water well may still perform poorly for the car park if much of the runoff cannot enter.

Finally, the team distinguished drainage performance from ecological value. They counted plant survival and observed insect visits, but they did not convert those observations into a claim about the health of the whole local ecosystem. The garden might provide several benefits, each requiring suitable evidence. One attractive summary score would be easier to advertise, but it could hide a failure that mattered for a particular purpose. The revised report kept separate indicators and explained which conclusions each indicator could support.`,[
 single('What is the purpose of the overflow in the example?','To let water leave when the system is full',['To prevent any water entering the soil','To measure every insect visit'],'can leave through an overflow when the system is full.','溢流口在系统满时导出水，不是入口或生物指标。'),
 single('What did forty cubic metres initially represent?','Estimated capacity from the proposed design',['Observed retention in every storm','The volume of rain at the airport'],'a design-capacity estimate based on the proposed geometry.','设计容量不是已测得的实际处理量。'),
 single('Why can total treated flow exceed water stored at one moment?','Water can infiltrate while further water enters.',['The garden creates additional rain.','Overflow water always returns to the inlet.'],'Water could infiltrate while new water entered','连续进出使事件累计流量不同于瞬时存量。'),
 single('What might a deep pool remaining for a long time indicate?','Slow drainage',['Guaranteed rapid treatment','An empty overflow channel'],'could indicate slow drainage rather than successful rapid treatment.','长时间深积水也可能是排水慢，不能只看水深判成功。'),
 single('Why was local rainfall recorded?','Short storms might differ from those at the distant airport.',['Airport rain always falls into the car park.','Rainfall totals cannot be measured near a garden.'],'short storms could differ across the area.','远站数据可能不代表场地实际降雨。'),
 fill('What sometimes blocked the kerb opening? Write ONE WORD.','Leaves','Leaves sometimes blocked the kerb opening','落叶堵入口，使径流难以进入。',1),
 single('Why keep the maintenance log separate?','Inlet measurements could overlook runoff prevented from entering.',['Blocked entrances prove the soil is ineffective.','Maintenance must never appear in a performance report.'],'that blockage could disappear from the performance story.','仅计算成功入园水会漏掉入口堵塞造成的整体服务失败。'),
 single('Why did the revised report retain separate indicators?','Different benefits and failures require different supporting evidence.',['A single score would necessarily be mathematically wrong.','Plant survival alone measures the whole ecosystem.'],'each requiring suitable evidence.','没有断言所有综合分数学错误，重点在多目标证据与缺陷不被隐藏。')
]);
add('b2','listening','listen-in','A student team studies walking routes',
`Supervisor: You are proposing a study of walking routes to the new campus. How will you collect the information?
Student: We planned to ask volunteers to upload their routes using a phone app. The map would show which streets are used most, and we thought the busiest streets should receive safety improvements first.
Supervisor: That conclusion needs care. A street could have many walkers because it is convenient, while a dangerous street could have few because people avoid it. Recorded use and unmet need are not the same thing. What would help you see the missing journeys?
Student: We could ask people which routes they avoid and why. We should also include people who do not use the app. The first invitations went through the cycling society, so our sample may already favour people comfortable with digital route recording.
Supervisor: Exactly. How will you broaden recruitment?
Student: We will visit the evening classes and the accessibility office, as well as advertising in the cafeteria. We will record which invitation channel each participant used. That will not make the sample statistically representative, but it will show who our recruitment reached.
Supervisor: Are you collecting exact home addresses?
Student: We do not need them. We will remove the first and last sections of each uploaded route before analysis. A route beginning at a residence could reveal where a participant lives even without a name attached. We will also combine routes into street-level counts before presenting them publicly.
Supervisor: What about comparing journey times?
Student: The app gives a total time, but it may include a stop at a shop. We will ask participants to flag pauses and report moving time separately from total journey time. We do not want to label someone as a slow walker because they bought groceries on the way.
Supervisor: And the safety observations?
Student: A small team will audit a selection of crossings using a fixed checklist. They will record visibility, kerb access and waiting time. We will keep those observations separate from people's reports of feeling safe. Both can inform decisions, but they describe different things and may disagree.
Supervisor: What would a disagreement mean?
Student: It would be a reason to investigate. For instance, a crossing could meet the checklist during daylight but feel uncomfortable after dark. We should not delete the report just because it differs from the audit. Our final map will show evidence gaps as well as current observations, so that the campus team can decide what to check next.`,[
 single('Why might prioritising only the busiest streets be misleading?','Danger may suppress use on a street that needs improvement.',['Every busy street is already unsafe.','The app records only bicycle journeys.'],'a dangerous street could have few because people avoid it.','避行造成未满足需求可能在实际使用计数中不可见。'),
 single('What is a limitation of the first recruitment channel?','It may favour people comfortable with route-recording technology.',['It guarantees every walker is included.','It excludes all cyclists from the study.'],'our sample may already favour people comfortable with digital route recording.','骑行社团渠道可能形成数字技术使用偏向。'),
 single('Why record the invitation channel?','To document which groups the recruitment reached',['To guarantee a statistically representative sample','To identify exact home addresses'],'it will show who our recruitment reached.','改善招募并记录覆盖，不宣称统计代表性。'),
 single('Why remove the ends of uploaded routes?','They could reveal participants’ residences.',['They always contain app errors.','They are needed only for cycling maps.'],'A route beginning at a residence could reveal where a participant lives even without a name attached.','去姓名仍可能由路线起点泄露住址。'),
 fill('What level will public route counts use? Write NO MORE THAN TWO WORDS.','street-level','combine routes into street-level counts','发布街道层汇总而不是个体全路线。'),
 single('Why report moving time separately?','A pause for shopping could inflate total journey time.',['The app cannot measure any total time.','All stops indicate difficulty walking.'],'it may include a stop at a shop.','途中活动会增加总时长，不能自动解释为行走慢。'),
 single('How should checklist audits and perceived safety be treated?','As distinct forms of evidence that may disagree',['As identical measurements that must always match','As mutually exclusive sources, only one of which can be kept'],'Both can inform decisions, but they describe different things and may disagree.','客观清单和主观体验都有用，但反映不同方面。'),
 single('What should the team do with a report that conflicts with the daylight audit?','Investigate contextual differences',['Delete it as an error','Assume the checklist proves safety at all times'],'It would be a reason to investigate.','昼夜条件等可能不同，冲突是进一步检查的线索。')
]);

// FIGURES
function writing(kind,title,prompt,figure){
 const m={id:'independent-task1-'+kind,version:'1',week:32,level:'B2',skill:'writing',type:'academic_task1',figureType:kind,pool:'independent',independentBank:true,fullTest:false,title,estimatedMinutes:20,timeLimitSeconds:1200,minWords:150,maxWords:300,instructions:'本题图表、地点与数据均为项目原创模拟，不是官方雅思试题。独立用20分钟完成至少150词的首稿；先不看示范或提示。提交后再进行真实AI评阅和订正，证据不足保持待评。',prompt:prompt+'\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.',questions:[],rubric:{taskType:'academic_task1'},figure,source:{schemaVersion:3,kind:'original',rights:'项目原创，AI辅助编写；全部数据、地点与流程为模拟，无外部图表复制',verification:'reviewed',method:'Codex核对图表与题意、单位、年份、数据一致性与渲染字段；无范文提前显示，未经过真实考生难度标定。',contentHashFields:['title','prompt','figure']}};
 materials.push(m);
}
writing('table','Training places at three technical colleges',
 'The table shows the numbers of students who enrolled in three evening courses at three technical colleges in 2025. Figures are numbers of students.',
 {type:'table',title:'Evening-course enrolments, 2025 (students)',labels:['Electrical skills','Food preparation','Digital design'],series:[{name:'Alder College',values:[140,80,180]},{name:'Birch College',values:[90,160,120]},{name:'Cedar College',values:[110,100,210]}],units:'students',year:2025});
writing('line','Average waiting times at two clinics',
 'The line graph shows average waiting times, in minutes, for non-emergency appointments at two clinics between 2020 and 2025.',
 {type:'line',title:'Average appointment wait, 2020–2025 (minutes)',labels:['2020','2021','2022','2023','2024','2025'],series:[{name:'Harbour Clinic',values:[42,46,40,32,26,22]},{name:'Meadow Clinic',values:[28,30,34,31,29,27]}],units:'minutes',xLabel:'Year',yLabel:'Average wait (minutes)'});
writing('bar','How residents travelled to a sports centre',
 'The bar chart compares the percentages of visits to a town sports centre made by four modes of transport in 2015 and 2025. Each visit is assigned to one transport mode.',
 {type:'bar',title:'Visits to the sports centre by mode (%)',labels:['Car','Bus','Bicycle','On foot'],series:[{name:'2015',values:[52,24,8,16]},{name:'2025',values:[38,26,18,18]}],units:'percentage of visits',yLabel:'Visits (%)'});
writing('pie','Two community-centre budgets',
 'The pie charts show how a community centre allocated its annual expenditure in 2015 and 2025. Both charts show percentages of each year’s total expenditure; the total amounts were £200,000 in 2015 and £300,000 in 2025.',
 {type:'pie',title:'Annual community-centre expenditure (%) · totals: 2015 £200,000; 2025 £300,000',labels:['Staff','Building costs','Activities','Equipment'],series:[{name:'2015',values:[45,30,15,10]},{name:'2025',values:[40,25,20,15]}],units:'percentage of annual expenditure',totals:[{year:2015,currency:'GBP',amount:200000},{year:2025,currency:'GBP',amount:300000}]});
writing('map','Changes to Fernside Park',
 'The maps show Fernside Park in 2005 and in 2025. North is at the top of both maps. The park boundary and the entrance on the south side are unchanged. Describe the main changes to the park.',
 {type:'map',title:'Fernside Park: 2005 and 2025 · north at top · schematic, not to scale',map:{beforeYear:'2005',afterYear:'2025',northUp:true,coordinateSystem:'x east, y south, top-left origin; coordinates and sizes 0–100',before:[{name:'Tree grove',x:5,y:8,w:27,h:25},{name:'Pond',x:62,y:8,w:29,h:25},{name:'Open lawn',x:8,y:43,w:25,h:29},{name:'Tennis courts',x:63,y:43,w:28,h:29},{name:'Main path',x:44,y:5,w:10,h:82},{name:'South entrance',x:41,y:90,w:16,h:8}],after:[{name:'Tree grove (retained)',x:5,y:8,w:27,h:25},{name:'Pond (retained)',x:62,y:8,w:29,h:25},{name:'Playground',x:8,y:43,w:25,h:29},{name:'Community garden',x:63,y:43,w:28,h:29},{name:'Main path (retained)',x:44,y:5,w:10,h:82},{name:'Café',x:62,y:78,w:29,h:15},{name:'South entrance (unchanged)',x:41,y:90,w:16,h:8}]} });
writing('process','Making seed-paper cards',
 'The diagram shows the process used by a small workshop to make greeting cards from recycled paper and flower seeds. Describe the stages in the process.',
 {type:'process',title:'Workshop production of seed-paper cards · one-way process',steps:['Sort used paper and remove plastic or metal','Tear the paper and soak it in water for 12 hours','Blend the soaked paper into pulp','Stir flower seeds into the pulp by hand','Spread the mixture over a mesh frame','Press out excess water and lift the wet sheet','Dry the sheet on a rack for 24 hours','Cut and fold the dry sheet into greeting cards'],units:'hours where stated',sequence:'linear'});
const mixedLine={type:'line',title:'Annual bicycle rentals, 2021–2025 (thousand rentals)',labels:['2021','2022','2023','2024','2025'],series:[{name:'Annual rentals',values:[80,95,120,150,180]}],units:'thousand rentals',xLabel:'Year',yLabel:'Rentals (thousands)'};
const mixedTable={type:'table',title:'Membership plans in 2025',rows:[['Plan','Members','Annual fee (£)'],['Standard','2400','40'],['Student','1800','25'],['Family','800','70']],units:'members and GBP annual fee'};
writing('mixed','Bicycle rentals and membership plans',
 'The line graph shows the annual number of bicycle rentals, in thousands, in a town from 2021 to 2025. The table gives the numbers of members and the annual fees for three membership plans in 2025. Rentals count separate trips, and each membership is counted once in the table.',
 {type:'mixed',title:'Town bicycle scheme: annual rentals and 2025 membership',labels:mixedLine.labels,series:mixedLine.series,rows:mixedTable.rows,parts:[mixedLine,mixedTable],units:'chart: thousand rentals; table: members and GBP annual fee'});

for(const m of materials){const fields=m.source.contentHashFields; m.source.contentHash=hash(JSON.stringify(Object.fromEntries(fields.map(key=>[key,m[key]]))));}

module.exports={materials,locales,levels,hash};
