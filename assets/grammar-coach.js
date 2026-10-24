(function (root) {
  'use strict';

  // Each row is tied to a source lesson/quote. Shared families explain the grammar;
  // the analysis and first exercise below are specific to that passage.
  const SOURCE = [{"day":1,"title":"A Journey across Canada","grammar":[{"quote":"the distance measuring approximately 5,000 kilometers","explain":"独立主格：名词 the distance 有自己的逻辑主语，measuring 描述伴随信息。可改为 and the distance measured approximately 5,000 kilometres。"},{"quote":"a city surrounded by mountains","explain":"过去分词作后置定语，相当于 a city that is surrounded by mountains；城市是“被群山环绕”的。"},{"quote":"Having a gift for communication, he started chatting","explain":"现在分词短语作原因状语，having 的逻辑主语是 he；此处 having 不是完成时。"}]},{"day":2,"title":"An Interesting Festival","grammar":[{"quote":"look forward to its arrival","explain":"to 是介词；换成动词应写 look forward to arriving，而非 arrive。"},{"quote":"as though they were never tired","explain":"as though 引导方式状语从句；were 在这里表达与实际不完全相符的假设。"},{"quote":"a beauty dressed up in lovely clothing","explain":"dressed up 是过去分词短语，修饰前面的名词；可展开为 who is dressed up。"}]},{"day":3,"title":"Balanced Diet","grammar":[{"quote":"by running a barbecue restaurant","explain":"by + 动名词表示手段：通过经营餐馆谋生。"},{"quote":"a barbecue restaurant, which served","explain":"非限制性定语从句补充说明 restaurant；逗号后的 which 在此不能改成 that。"},{"quote":"Your customers put on weight too easily, while Yong Hui’s lose weight too quickly","explain":"while 表对比，意为“而”；Yong Hui’s 省略了 customers。"}]},{"day":4,"title":"A Misunderstanding","grammar":[{"quote":"what those gestures really mean is subjective","explain":"what 引导主语从句，整个从句是 is 的主语；what 同时作 mean 的宾语。"},{"quote":"I saw a man looking around curiously","explain":"see + 宾语 + doing 强调看到正在进行的动作。"},{"quote":"On hearing that","explain":"on + doing 表示“一……就……”；hearing 的逻辑主语与后文 I 一致。"}]},{"day":5,"title":"A Unique Theme Park","grammar":[{"quote":"As soon as our shuttle got close","explain":"as soon as 引导时间状语从句；叙述过去，所以用 got。描述将来时，从句通常用一般现在时。"},{"quote":"Whichever we bought in the central shop was made of wood","explain":"whichever 引导名词性从句作主语，意为“无论我们买的是哪一样”。"},{"quote":"wherever we went we could see minority carpenters working","explain":"wherever 引导地点/让步意味的状语从句；see…working 表示看到正在工作。"}]},{"day":6,"title":"A Strange Disease","grammar":[{"quote":"a severe disease whose characteristic","explain":"whose 表所属关系，可以修饰非人的先行词 disease。"},{"quote":"the polluted paint was to blame","explain":"be to blame 是固定表达，主动形式具有“应受责备”的含义，不机械写成 was to be blamed。"},{"quote":"Exposed to radium…people absorbed radiation","explain":"过去分词作状语，people 与 expose 构成被动关系；可改为 When people were exposed…。"}]},{"day":7,"title":"Sightseeing in the United Kingdom","grammar":[{"quote":"Unwilling to leave out any attraction","explain":"形容词短语作状语，描述主语 my cousin 的状态与动机。"},{"quote":"collections consisting of statues","explain":"现在分词短语修饰 collections；consist of 通常不用被动形式。"},{"quote":"what they used to be","explain":"what 引导名词性从句，作介词 with 的宾语；used to 表过去的状态。"}]},{"day":8,"title":"An Air Crash","grammar":[{"quote":"couldn’t tolerate typing","explain":"tolerate 后接动名词，不接 to type。"},{"quote":"when speeding up","explain":"时间状语从句的省略形式，逻辑主语是 our jet；可展开为 when our jet was speeding up。"},{"quote":"guided by the smoke of our crashing jet","explain":"过去分词状语表被动；被烟雾引导的是后面的 some local citizens。"}]},{"day":9,"title":"An Amateur Journalist","grammar":[{"quote":"It is admirable that she is seldom accused of making mistakes","explain":"it 是形式主语，真正主语是 that 从句；of 后接 making。"},{"quote":"she assesses whether they are deliberately hiding the truth","explain":"whether 引导宾语从句，语序是陈述语序，不倒装。"},{"quote":"the senior chief editor, who polishes and approves every section","explain":"who 引导非限制性定语从句，补充编辑的工作。"}]},{"day":10,"title":"First Aid","grammar":[{"quote":"His organs were damaged","explain":"一般过去时被动：were + 过去分词，强调承受动作的对象。"},{"quote":"to stop bleeding","explain":"不定式作目的状语；stop doing 表“停止做”，与 stop to do“停下来去做”区分。"},{"quote":"the nurse who overcame a variety of barriers","explain":"who 引导限制性定语从句，在从句中作主语。"}]},{"day":11,"title":"Abstract Art","grammar":[{"quote":"sculptures carved out of marble","explain":"过去分词作后置定语：sculptures 被雕刻。"},{"quote":"neither art nor geometry","explain":"neither…nor…连接并列成分，表示“既不是……也不是……”。"},{"quote":"many who have a preference for abstract art","explain":"who 引导定语从句，先行词 many 在此指许多人。"}]},{"day":12,"title":"A Russian Poem","grammar":[{"quote":"he found writing poems the most appropriate way","explain":"find + 宾语 + 宾语补足语；writing poems 是动名词短语作宾语。"},{"quote":"Using concrete but flexible language and the minimum of words is his style","explain":"动名词短语作主语；这里把这一写作方式视为整体，谓语用 is。"},{"quote":"one of his works made up of 3 sections","explain":"made up of 作后置定语，说明这篇作品的组成。"}]},{"day":13,"title":"Let’s Help Adolescents","grammar":[{"quote":"Whether they are male or female","explain":"whether…or… 在这里引导让步状语从句，表示“不论……还是……”。"},{"quote":"feel like deciding on everything","explain":"feel like + doing；like 在此是介词，不写 feel like to decide。"},{"quote":"As long as we strengthen communication…we will…","explain":"as long as 引导条件状语从句，未来意义时通常主句 will、从句一般现在时。"}]},{"day":14,"title":"Refresh Our Environment","grammar":[{"quote":"it is humans’ existence…that result in this phenomenon","explain":"it is…that…是强调结构，强调原因部分；去掉强调框架后仍可还原基本句意。"},{"quote":"It is suggested that we use energy-saving appliances","explain":"建议类动词后 that 从句用动词原形，英式英语也可用 should use。"},{"quote":"even if our needs may be met","explain":"even if 引导让步状语从句；may be met 是情态动词被动结构。"}]},{"day":15,"title":"A Volcano Eruption","grammar":[{"quote":"when I was drawing…he was bathing","explain":"过去进行时表示当时正在进行的背景动作，随后 erupted 是打断背景的事件。"},{"quote":"I even noticed a rainbow appear","explain":"notice + 宾语 + 动词原形，可描述观察到某个事件的发生。"},{"quote":"How lucky we were","explain":"How + 形容词 + 主语 + 谓语构成感叹句，不使用疑问句倒装。"}]},{"day":16,"title":"Defeat Disability","grammar":[{"quote":"a tank…exploded, sending him flying","explain":"现在分词作结果状语，说明爆炸带来的结果；send + 宾语 + doing。"},{"quote":"so beneficial…that he adapted","explain":"so + 形容词 + that 从句，表示结果“如此……以至于……”。"},{"quote":"All you have is adequate","explain":"All 后省略了关系代词 that，you have 是定语从句；整句主语是 All you have。"}]},{"day":17,"title":"Happy Marriage Needs Fighting For","grammar":[{"quote":"was tired of being left alone","explain":"of 后接动名词的被动形式 being + 过去分词；她是“被留下”的人。"},{"quote":"He trimmed his fingernails short","explain":"动词 + 宾语 + 形容词宾补，short 描述修剪后的指甲状态。"},{"quote":"After being tested out for 3 months","explain":"after + 动名词被动形式，表示经过考验。"}]},{"day":18,"title":"Mark and a Seal","grammar":[{"quote":"a wound…caused by a shark","explain":"过去分词定语，伤口是被鲨鱼造成的。"},{"quote":"as if to urge him to help it","explain":"as if 后接不定式，表示“仿佛要催促他帮助它”。"},{"quote":"Every time he brought it tasty fish, it would…","explain":"every time 引导时间状语从句；would 表过去反复出现的行为。"}]},{"day":19,"title":"Helping the Remote Village","grammar":[{"quote":"they were shocked by what they saw","explain":"what 引导名词性从句作 by 的宾语；what 在从句中是 saw 的宾语。"},{"quote":"It was a privilege for them to be there","explain":"it 是形式主语，for them to be there 是真正主语。"},{"quote":"otherwise he would go","explain":"otherwise 表示“否则”，后接假设结果；语境暗示安排若能改变，他就会去。"}]},{"day":20,"title":"Study in America","grammar":[{"quote":"Having reached her destination","explain":"完成式分词状语，reached 先于主句 settled 发生。"},{"quote":"she found English idioms difficult to understand","explain":"find + 宾语 + 形容词 + 不定式；understand 的逻辑宾语是 idioms。"},{"quote":"What bothered her most was that…","explain":"what 主语从句 + was + that 表语从句；两个从句承担不同功能。"}]},{"day":21,"title":"Immigrate to America","grammar":[{"quote":"Attracted by the boom in America","explain":"过去分词作原因状语，my nephew 是被吸引的人。"},{"quote":"It occurred to my nephew that…","explain":"it 为形式主语；that 从句说明突然想到的内容。"},{"quote":"a small ferry called the North Pole Seagull","explain":"called 是过去分词后置定语，相当于 which was called。"}]},{"day":22,"title":"Be Careful about Cloning","grammar":[{"quote":"suggested the constitution include compulsory regulations","explain":"suggest 表建议时，宾语从句用动词原形 include；that 被省略。"},{"quote":"When interviewed","explain":"状语从句省略，相当于 When he was interviewed。"},{"quote":"undertaking cloning does differ","explain":"动名词短语作主语；does + 动词原形用于强调“确实不同”。"}]},{"day":23,"title":"Strange Patent Applications","grammar":[{"quote":"set about working","explain":"set about + doing；与 set out to do 区分。"},{"quote":"whether applications are valid and practical","explain":"whether 引导名词性从句，表达“申请是否有效且实用”。"},{"quote":"it was stable and convenient to use","explain":"形容词 + to do；不定式主动形式表示该物品用起来便利。"}]},{"day":24,"title":"Pronunciation and Status","grammar":[{"quote":"in need of being sent to a laundry","explain":"of 后接被动动名词 being sent，衣物是被送洗的对象。"},{"quote":"laughing and saying","explain":"并列现在分词作伴随状语，逻辑主语是 she。"},{"quote":"seemed to have betrayed me","explain":"seem + 不定式完成式 to have done；“暴露身份”发生在回顾它之前。"}]},{"day":25,"title":"A Sly Murder","grammar":[{"quote":"When giving a lecture","explain":"省略式时间状语从句，逻辑主语是 the professor。"},{"quote":"to avoid fortune division","explain":"不定式表目的；avoid 若接动词，需要动名词，例如 avoid making mistakes。"},{"quote":"Primitive and not ample as their alternative equipment was","explain":"形容词短语提前的 as 让步结构，意为“尽管设备简陋且不充足”。"}]},{"day":26,"title":"Fall in Love with English","grammar":[{"quote":"Hiding behind the loose dusty curtain","explain":"现在分词伴随状语，动作发出者是主句的 a teenager。"},{"quote":"what he was suffering from","explain":"what 引导宾语从句，what 是 from 的宾语；介词可留在末尾。"},{"quote":"he has recovered…and has fallen in love with English","explain":"现在完成时强调过去变化对现在的影响，与单纯叙述过去区分。"}]},{"day":27,"title":"Different Countries Have Different Kinds of Englishes","grammar":[{"quote":"English is frequently spoken","explain":"一般现在时被动，副词 frequently 位于 be 与过去分词之间。"},{"quote":"which country the foreigners of your block are from","explain":"嵌入式疑问从句使用陈述语序，不能写 which country are the foreigners from。"},{"quote":"while the latter suggests that he is British","explain":"while 表对比；the latter 指前面提到的两者中的后者。"}]},{"day":28,"title":"A Hard Trip","grammar":[{"quote":"Ever since graduating, she had been determined","explain":"ever since 引出过去起点；had been 表从更早的毕业持续到叙事中的过去时点。"},{"quote":"no one could persuade her to change her mind","explain":"persuade + 人 + to do；说服某人做某事。"},{"quote":"a river flowing from a high altitude","explain":"现在分词作后置定语，river 与 flow 是主动关系。"}]},{"day":29,"title":"A Horrible Earthquake","grammar":[{"quote":"It seemed as if the world was at an end","explain":"as if 引导表语从句；在 seem 后描述感觉或印象。"},{"quote":"With the reporters giving an outline","explain":"with + 名词 + doing 形成伴随结构，reporters 与 give 是主动关系。"},{"quote":"The injured were rescued and the dead were buried","explain":"the + 形容词指一类人，这里谓语用复数 were。"}]},{"day":30,"title":"The Great President","grammar":[{"quote":"those who were out of work","explain":"who 引导限制性定语从句，先行词 those 指“那些人”。"},{"quote":"devoted himself to stopping","explain":"to 为介词，后接动名词 stopping。"},{"quote":"couldn’t escape being sentenced","explain":"escape 后接动名词；being sentenced 是被动形式，表示被判刑。"}]},{"day":31,"title":"A Brave Maid","grammar":[{"quote":"The evidence they found showed that…","explain":"they found 是省略关系代词的定语从句；that 从句是 showed 的宾语，功能不同。"},{"quote":"how the vase survived","explain":"how 引导名词性从句，说明花瓶如何幸存，不使用疑问语序。"},{"quote":"It is worth giving this brave maid a fortune","explain":"be worth + doing，表达“值得做”；此句 it 可理解为形式主语。"}]},{"day":32,"title":"A Fair Competition","grammar":[{"quote":"Only when you win fairly will you…","explain":"only + 状语置于句首引发主句部分倒装；when 从句保持正常语序。"},{"quote":"the gymnastics event to be held","explain":"不定式被动形式作定语，表示将举办的项目。"},{"quote":"It is foolish to cheat","explain":"it 为形式主语，to cheat 是真正主语。"}]},{"day":33,"title":"Computers","grammar":[{"quote":"when connected by the network","explain":"省略式状语从句，表示被连接时；恢复完整句时要明确主语 computers。"},{"quote":"so helpful that they do bring happiness","explain":"so…that…表结果；do + 动词原形 bring 用于强调。"},{"quote":"computers are easily attacked by viruses","explain":"一般现在时被动；by 引出动作实施者 viruses。"}]},{"day":34,"title":"Wildlife Protection","grammar":[{"quote":"saw some monkeys rubbing themselves","explain":"see + 宾语 + doing，强调看到正在进行的动作。"},{"quote":"When told that it was a loss to humans","explain":"省略式被动状语从句，相当于 when the farmers were told…。"},{"quote":"Not until we succeed…can we smile","explain":"not until 状语前置时，主句部分倒装；until 从句不倒装。"}]},{"day":35,"title":"My First Band","grammar":[{"quote":"I was so confident that I never decreased my devotion","explain":"so + 形容词 + that 引导结果从句。"},{"quote":"musicians whom people were familiar with","explain":"whom 在定语从句中作 with 的宾语；口语中常用 who 或省略。"},{"quote":"A million or so copies were sold","explain":"or so 置于数量后表示“大约”；were sold 是过去时被动。"}]},{"day":36,"title":"Explore MKII","grammar":[{"quote":"the theory that its gentle climate…","explain":"that 从句解释 theory 的内容，是同位语从句；that 不在从句中作主语或宾语。"},{"quote":"Cheered up by this news","explain":"过去分词原因状语；biologists 是被这个消息鼓舞的人。"},{"quote":"prevented the spaceship from crashing","explain":"prevent + 宾语 + from doing；介词后使用动名词。"}]},{"day":37,"title":"Sailing Home","grammar":[{"quote":"who was brought up in America","explain":"who 引导定语从句；was brought up 为被动，表示被抚养长大。"},{"quote":"it was the fault of his skin colour that accounted for their rejection","explain":"it was…that…强调结构；这里表达人物对被拒原因的判断。"},{"quote":"he couldn’t think of a better one","explain":"否定词 + 比较级可传达最高程度的评价：“想不出更好的”，即认为这个最好。"}]},{"day":38,"title":"A Woman Doctor-Lina","grammar":[{"quote":"Born in a pigs’ nest","explain":"过去分词短语作状语，隐含被动；逻辑主语是 Lina。"},{"quote":"Her being outspoken and modest won respect for her","explain":"动名词短语作主语，Her 表示该动作或状态的逻辑主语。"},{"quote":"an audience crowding around her","explain":"现在分词后置定语，audience 与 crowd 是主动关系。"}]},{"day":39,"title":"A New Farming Way","grammar":[{"quote":"he had been struggling","explain":"过去完成进行时，强调在叙事中的过去时点之前长期持续的努力。"},{"quote":"He would rather have chosen another job","explain":"would rather + have done 表达对过去选择的不同愿望。"},{"quote":"He found the knowledge Yuan circulated very practical","explain":"find + 宾语 + 形容词宾补；Yuan circulated 是修饰 knowledge 的定语从句。"}]},{"day":40,"title":"Chaplin - A Great Master of Humour","grammar":[{"quote":"who starred in and directed many outstanding comedies","explain":"who 引导定语从句，并列谓语 starred 和 directed 共用主语。"},{"quote":"With all the porridge eaten up","explain":"with + 名词 + 过去分词，porridge 与 eat 构成被动关系，强调吃完的状态。"},{"quote":"so convincing and amusing that everybody couldn’t help bursting into laughter","explain":"so…that…表结果；can’t help 后接动名词。"}]},{"day":41,"title":"A Course That Opened a Door","grammar":[{"quote":"The college has introduced a small grant","explain":"现在完成时与一般过去时：has introduced 强调现有成果；completed ... last week 指明已经结束的过去时间。"},{"quote":"Mei has been helping new students","explain":"现在完成进行时：has been doing 强调从过去延续至今的活动，since September 给出起点。"},{"quote":"Each learner had a different timetable","explain":"数量词与不可数名词：each + 单数名词；much advice、little information。advice 和 information 通常不加 -s。"}]},{"day":42,"title":"Finding a Home Near Work","grammar":[{"quote":"The nearer he lived to work, the less he would spend","explain":"关联比较级：the + 比较级，the + 比较级，表示“越……越……”。"},{"quote":"There were fewer vacant flats","explain":"fewer 与 less：fewer 修饰可数名词复数 flats；less 修饰不可数的 money、space 等。"},{"quote":"Daniel accepted a job","explain":"冠词：a job 首次提到一份工作；the rent、the first flat 指语境中明确的租金或房子。复数或不可数名词泛指时常用零冠词，如 repairs、maintenance。"}]},{"day":43,"title":"A Different Working Week","grammar":[{"quote":"If the team works remotely, it will need a clear schedule","explain":"第一条件句：if + 一般现在时，主句用 will + 原形，讨论现实中的未来可能性。"},{"quote":"If everyone worked different hours, meetings would be difficult","explain":"第二条件句：if + 过去式，主句 would + 原形，讨论假设安排；过去式不一定指过去时间。"},{"quote":"although they could plan the rest of the day themselves","explain":"让步从句：although 后接完整句子，主句通常不再加 but。"}]},{"day":44,"title":"Before Clicking Agree","grammar":[{"quote":"The company said that it stored information securely","explain":"间接引语：主句 said 为过去时，从句可将现在时回移为过去时；若强调至今仍成立，也可能保留现在时。"},{"quote":"how long the records would be retained","explain":"间接问句与被动：how long + 主语 + would be + 过去分词；不写 how long would the records ...。"},{"quote":"Strong encryption might reduce some risks","explain":"情态动词与谨慎表达：might + 动词原形表示可能性，避免把未经证实的推测写成确定事实。"}]},{"day":45,"title":"A Town Plans Its Water Supply","grammar":[{"quote":"Water is collected, treated and distributed","explain":"流程被动语态：is + 三个并列过去分词；描述一般流程使用一般现在时。"},{"quote":"Some of those pipes had been installed","explain":"过去完成时被动：had been + 过去分词，安装发生在过去的会议或调查之前。"},{"quote":"Repairing the network would reduce waste","explain":"动名词作主语：Repairing the network 作为整体；would 在过去叙事中表示预期结果。"}]},{"day":46,"title":"A Healthier Lunch Break","grammar":[{"quote":"There were a few concerns","explain":"a few / few 与 a little / little：a few 修饰可数复数，表示“有一些”；little evidence 表示“证据很少”，偏不足。"},{"quote":"A sedentary routine may be associated with several difficulties","explain":"相关性与因果表达：may be associated with 只表示可能有关联，不等于 causes。"},{"quote":"so that a useful change would not depend on joining every activity","explain":"so that 引导目的从句；depend on 后接动名词 joining。"}]},{"day":47,"title":"The Bus Route That Almost Disappeared","grammar":[{"quote":"If the company had changed the timetable earlier, more people might have used the service","explain":"第三条件句：if + had done，主句 might / would have done，假设过去未发生的另一种情况。"},{"quote":"Had Ella accepted the original figures without question","explain":"省略 if 的条件倒装：Had + 主语 + 过去分词，相当于 If Ella had accepted；理解即可，不必刻意堆砌。"},{"quote":"the route had attracted more regular passengers","explain":"过去完成时：以过去的试行结束时点为参照，说明此前已发生的变化。"}]},{"day":48,"title":"Reading the Numbers Carefully","grammar":[{"quote":"visits to Centre A rose from forty thousand to fifty thousand","explain":"趋势中的介词：from ... to ... 写起止值；rise by 写增加量或幅度，rise to 写终点。"},{"quote":"The proportion of visitors arriving by bicycle also changed","explain":"主谓一致：中心词是单数 proportion，不能因 of 后的 visitors 是复数就误选复数谓语。"},{"quote":"a rise of five percentage points","explain":"百分比与百分点：10% 到 15% 增加5个百分点；相对增幅是 (15−10)/10 = 50%，两者不能混用。"}]},{"day":49,"title":"A Headline Worth Checking","grammar":[{"quote":"Although the report contained useful findings","explain":"although + 从句；despite + 名词或动名词。despite the wording 正确，despite of 错误。"},{"quote":"what the researchers had actually measured","explain":"what 宾语从句：what 同时作 measured 的宾语，从句采用陈述语序。"},{"quote":"the researchers had not compared every form of education","explain":"部分否定：not ... every 表示“并非每一种都……”，不等于“一种也没有”。"}]},{"day":50,"title":"Visitors and the Village","grammar":[{"quote":"The residents, whose homes stood near the main square","explain":"非限制性定语从句：whose 表所属，后接 homes；逗号中的从句补充说明。"},{"quote":"The harbour, where many visitors gathered","explain":"where 定语从句：相当于 at which，先行词 harbour 表地点；where 在从句中作地点状语。"},{"quote":"provided that the events respected their working hours","explain":"条件表达：provided that 意为“只要／条件是”，后接完整从句。"}]},{"day":51,"title":"Testing a New Packaging Idea","grammar":[{"quote":"whether the material could protect its contents ... and whether customers could reuse it","explain":"并列宾语从句：两个 whether 从句并列，分别表达需要查明的两个问题。"},{"quote":"the size of each container remained constant","explain":"主语中心词：size 为单数；of each container 修饰 size，不改变其单数性质。"},{"quote":"before making a broad commercial claim","explain":"介词 before + 动名词：making 的逻辑主语应与相应动作实施者一致；也可展开为 before they made ...。"}]},{"day":52,"title":"A Budget for Every Generation","grammar":[{"quote":"The number of requests was rising","explain":"the number of + 复数名词：中心词 number 为单数，谓语用 was；a number of requests 则通常接复数谓语。"},{"quote":"the amount of funding was limited","explain":"amount of 修饰不可数名词 funding；可数项目用 number of。limited 是被动／状态表达。"},{"quote":"funding one project meant delaying another","explain":"动名词与 mean：funding 作主语；mean doing 表示“意味着做……”，mean to do 表示“打算做……”。"}]}]; // SOURCE_DATA
  const families = {
    state: ['形容词短语：说明人物状态', '形容词短语，+ 主语 + 谓语', '先理解这个人处于什么状态，再看该状态如何解释主句动作。unwilling 表“不愿意”，本身不是动作分词。', '把每个句首短语都称为分词，或找错被描述的人。', '本句句首形容词短语在描述谁？', '主句中的人物', '它后面最近的任意物品', '没有任何描述对象', '状态短语应与主句人物对应；这里“不愿漏掉景点”的是 my cousin。'],
    with: ['with 复合结构：交代伴随背景', 'with + 名词 + doing / done 等补充成分', 'with 后的名词是该短语中动作或状态的主体；doing 常表示主动，done 常表示被动或完成状态。', '误把 with 后面的名词当作全句主语，或颠倒主动与被动。', '这里 with 后的 doing / done 主要与谁建立动作关系？', '紧跟 with 的名词', '任何距它最远的名词', '只与句子的标题有关', 'with 复合结构内部有自己的主体，先找出这个名词，再判断其主动或被动关系。'],
    asIf: ['as if / as though：仿佛、好像', 'as if / as though + 从句；也可接不定式等省略表达', '这类表达描述样子或印象，不自动证明内容属实。形式取决于语境是否把事情看作真实可能，或与事实有距离的假设。', '把“仿佛”改成已经证实的事实，或以为所有 as if 都只能用一种时态。', '理解本句 as if / as though 时，最应保留什么？', '原句的印象或假设语气', '把内容强化成已确认的事实', '把所有动词都改成将来式', '仿佛怎样不等于事实就是怎样；应保留作者表达的印象或假设。'],
    independent: ['独立主格：补充一件事', '名词（自己的主语）+ doing / done，补充主句背景。', '先找两组“谁做什么”。补充部分有自己的主语，不能直接当成主句主语的动作。', '把独立主格误当成带完整谓语的句子，或漏掉它自己的主语。', '独立主格与普通分词状语的关键区别是什么？', '独立主格有自己的逻辑主语', '独立主格一定表示将来', '独立主格必须含 have', '逻辑主语就是实际做动作或承受动作的对象；这里补充部分另有名词承担这个角色。'],
    modifier: ['分词短语：在名词后补充说明', '名词 + doing（主动）/ done（常表被动）', '先找被修饰的名词，再看该名词是做动作还是承受动作。常可改写成 who / which 引导的定语从句。', '只看时间就选 -ing 或过去分词；忽略名词和动作的关系。', '选择名词后 doing 或 done 时，首先判断什么？', '名词与该动作的主动或被动关系', '这段话是否在文章末尾', '名词的字母数', '分词在这里修饰名词；主动关系常用 doing，被动关系常用过去分词，不能只凭中文里有没有“了”。'],
    adverbial: ['分词短语：补充原因、背景或结果', 'doing / done 短语，+ 主语 + 谓语', '先还原主句，再用“谁做／谁被……”连接前后。分词不是这句话的完整谓语，通常与主句主语相联系；结果分词也可能说明整个事件的结果。', '分词的动作对象与主句主语对不上，造成悬垂分词。', '理解本句的分词短语时，最需要核对什么？', '动作与主句人物或事件的逻辑关系', '是否所有分词都能译成“正在”', '是否分词可以代替任意完整谓语', '分词可以说明原因、伴随、结果等关系。应结合语境还原关系，而非统一译成“正在”。'],
    gerund: ['动名词：把动作当作一件事', 'doing 可作主语、宾语或介词宾语；被动式为 being done', '动词加 -ing 后，可表示“做这件事”。它仍可带自己的宾语，例如 writing poems 是“写诗这件事”。', '看到动词就一律加 to；或把 being done 的被动关系遗漏。', '本句中动名词主要应怎样理解？', '把动作或状态当作一件事来谈', '一定是现在正在发生的谓语', '一定表示将来计划', '动名词的 -ing 形式不是现在进行时；进行时还需要相应的 be 作谓语的一部分。'],
    relative: ['定语从句：说明前面的名词', '先行词 + who / which / that / whose / where + 从句', '先行词就是被说明的人或物。关系词既连接从句，也在从句里承担主语、宾语、所属或地点等作用。', '把关系词当成只连接、不参与句意的词；或在逗号后的非限制性从句中误用 that。', '判断这处定语从句时，第一步是什么？', '找出它说明的先行词和关系词的作用', '把从句里的所有动词改成过去式', '删除所有逗号', '先找被修饰的名词，再判断从句缺主语、宾语还是需要所属／地点关系。'],
    nominal: ['名词性从句：整句话充当一个成分', '连接词 + 主语 + 谓语，整体作主语、宾语、表语，或说明名词的内容', '先把从句括起来，看整个括号在大句子里做什么。what 常兼有“所……的事物”含义；whether 表“是否”。', '照搬疑问句倒装；或把 what 与只连接、在从句中不作成分的 that 混用。', '本句里的名词性从句应怎样分析？', '先判断整个从句在大句中承担的成分', '只看从句中第一个名词', '把它一律视为修饰名词的定语', '从句可以整体作主语、宾语、表语，或说明名词内容；不要因为都有连接词就与定语从句混为一谈。'],
    time: ['时间关系：先后、同时或每次', '时间连接表达 + 从句／doing；再接主句', '用时间线确认哪件事先发生、是否反复发生，以及叙述的是过去还是未来。', '在表示未来的普通时间从句中机械使用 will，或忽略省略句中的动作主语。', '选择本句时间表达时，最可靠的依据是什么？', '上下文的时间先后和动作主语', '中文里出现“了”就用完成时', '句子长就必须用过去时', '时间形式与叙述参照点有关；中文“了”不能单独决定英语时态。'],
    verbal: ['动词搭配：后面接什么形式', '固定动词／介词搭配 + doing / to do / 动词原形', '先识别整个搭配，再选择后面的动词形式。to 有时是不定式标记，有时是介词；同一个动词接不同形式也可能改变意义。', '把所有 to 后面都写成动词原形，或把不同搭配互相套用。', '完成本句的动词搭配时，哪种方法可靠？', '确认整个搭配的结构和含义', '只要看到动词就加 to', '所有 -ing 都能换成原形', '动词形式由具体搭配和语义决定；应把搭配与例句一起记忆。'],
    contrast: ['连接词：看清前后关系', '分句 + while / neither…nor… 等连接表达', '先把前后的内容分别说清，再判断是对比、并列还是否定两个选项；同一连接词可有不同含义。', '把 while 永远理解成“当……时”，或忽略连接成分应保持平行。', '理解本处连接表达时，应先检查什么？', '两部分内容的逻辑关系', '连接词是否超过五个字母', '能否把全部连接词换成 and', '对比、并列、让步和时间关系并不相同，要根据前后内容判断。'],
    conditional: ['条件：如果／只要满足某件事', '条件从句 + 主句；形式取决于真实可能性和时间', '先判断是真实的未来可能性，还是与当前／过去不同的假设。形式中的过去式不总指过去时间。', '把所有条件句都写成 if + will，或混淆假设现在和假设过去。', '选择条件句形式前，需要先判断什么？', '假设的时间以及是否视为真实可能', '句子是否含长单词', '主句必须含 can', '现实未来、假设现在和假设过去使用不同形式；语义先于套公式。'],
    concession: ['让步：虽然／不论／即使', '让步表达 + 从句，主句仍然成立', '让步表示：某件事本来可能阻碍结果，但后面的结论仍成立。注意 although 接句子，despite 通常接名词或 doing。', 'although 和 but 在同一结构里重复连接；误写 despite of。', '让步关系的核心意思是什么？', '即使有前面的情况，主句仍成立', '前句必然导致后句', '两件事一定按时间先后发生', '让步表达保留一个障碍或相反情况，再说明主句仍成立。'],
    complement: ['宾语补足语：补充对象的状态或动作', '动词 + 宾语 + 形容词 / doing / 动词原形等', '宾语是被观察或被描述的对象；后面的成分进一步说明该对象“怎样”或“做什么”。', '把宾补误当成与宾语无关的新动作，或不区分看到过程与看到事件发生。', '本句的宾语补足语在说明什么？', '宾语的状态、性质或动作', '只说明主句动词的时态', '只用于修饰句首时间词', '宾补和宾语有明确的意义联系，如 find idioms difficult 中 difficult 说明 idioms。'],
    ellipsis: ['省略：把完整结构还原出来', 'when + doing / done；或省略作宾语的关系代词', '省略不是随意删词。先补回主语与 be，或补回被省略的关系词，再检查句意是否完整。', '省略前后主语不一致；或把所有关系代词都当成可省略。', '检查本句省略是否合理的有效方法是什么？', '还原完整结构并核对主语或关系词作用', '只要句子更短就接受', '把所有助动词都删掉', '还原后可以看清逻辑主语；关系代词能否省略还取决于从句类型和成分。'],
    formal: ['形式主语 it：先占位置，再说内容', 'It + 谓语／评价 + that 从句 / to do', '英语常把较长的真正主语放后面，用 it 占主语位置。可试着把后面的内容移到句首理解。', '把 it 误译成具体的“它”，或漏掉后面说明真正内容的部分。', '本句中的形式主语 it 主要起什么作用？', '先占主语位置，把较长内容放到后面', '指代前文每一个名词', '表示过去发生的动作', '形式主语本身不指某件具体物品；后面的从句或不定式才说明评价的内容。'],
    passive: ['被动语态：对象承受动作', '相应形式的 be + 过去分词（done）', '先找谁承受动作，再看 be 的形式表达现在、过去、完成或情态意义；动作实施者可由 by 引出。', '遗漏 be，或在 be 后继续用动词原形；把被动一律当作过去时。', '判断本句被动结构时，哪项正确？', 'be 的形式与过去分词共同构成被动', '过去分词单独总能作完整谓语', '被动语态只发生在过去', '被动表示主语承受动作；时间由 is / was / had been 等形式表达。'],
    purpose: ['目的：说明为什么做这件事', 'to + 动词原形；或 so that + 完整从句', '问主句动作“为了什么”。不定式目的短语通常与主句动作有明确的执行者关系；so that 后要有自己的主谓。', '把目的与已经发生的结果混淆，或在 to 后直接写 -ing。', '这里的目的成分主要回答哪一类问题？', '为了什么而做主句的动作', '主句动作发生在几点', '主语有多少个字母', '目的描述行动的意图；结果描述行动带来的后果，两者不能机械互换。'],
    focus: ['强调：突出信息或加强语气', 'It is / was…that…；或 do / does / did + 动词原形', '强调句可先去掉 It is / was 与 that，查看剩下的基本结构；助动词强调则把“确实”加到正常谓语上。', '强调用 does / did 后，仍把主要动词写成第三人称或过去式。', '分析强调表达时，哪一步有帮助？', '还原不带强调的基本句子', '删除所有名词只留下 that', '将强调结构一律视为疑问句', '先识别普通句的信息关系，再看强调的是哪一部分或哪一个动作。'],
    suggestion: ['建议内容：动词原形或 should + 原形', 'suggest / It is suggested + that + 主语 + (should) do', '这里讨论“建议做什么”，并非报告已经发生的事实。suggest 表“暗示／表明”时不应机械套这个结构。', '忽略 suggest 的具体含义，或在建议从句里因主语单数就添加 -s。', '本句采用建议类从句形式的原因是什么？', '这里表达建议采取的行动', '所有含 that 的句子都必须用原形', '主句有过去词就只能用过去式', '先确定 suggest 表“建议”；此类从句可用动词原形，英式英语也常用 should + 原形。'],
    tense: ['时态与体：放到时间线上理解', '先找助动词，再找动词形式，并确认参照时间', '一般过去叙述结束的过去；完成形式把动作与一个参照点联系；进行形式关注过程。先后关系与上下文一起决定选择。', '仅凭出现 have 就说“现在完成”，或不看参照点只凭中文译文选择时态。', '本句的时态应结合什么判断？', '助动词、动词形式和上下文的时间参照点', '文章标题的长短', '英语动词是否规则变化', 'has done、had done、has been doing 等结构不同；识别整个链条后再判断时间和侧重点。'],
    comparison: ['比较：方向、程度与范围', '比较级及其固定框架；注意比较的对象一致', '先找被比较的两个对象和比较方向。“越……越……”与普通比较不同；否定加比较级还可能表达很高的评价。', '只背比较级词尾，却忽略否定词、the… the… 等框架对意义的影响。', '解释本句比较表达时，应该优先核对什么？', '比较对象、方向和句式框架', '句子是否出现 than 才算比较', '所有比较级都表示数量增加', '比较结构既可能涉及大小，也可能涉及程度或评价；由整个句式判断。'],
    inversion: ['倒装：有限地调整语序', '触发成分置前 + 助动词／情态动词 + 主语 + 主要动词', '先写出普通语序，再识别触发倒装的 only / not until，或省略 if 后前置的 had。并非整句话都倒装。', '把从句也一起倒装，或把主要动词随意放在主语前。', '检查本句倒装时，哪种做法正确？', '确认触发条件并还原普通语序', '把每个动词都移到主语之前', '把所有从句都改成疑问句', '倒装有特定触发结构；应分清主句、从句以及前置的助动词。'],
    agreement: ['主谓一致：找主语的中心', '主语中心词 + 修饰部分 + 与中心匹配的谓语', '先圈出主语中心词，再暂时括起 of… 等修饰部分。不要被离动词最近的复数名词带偏。', '依据最近的名词选单复数；不区分 the number of 与 a number of。', '判断本句谓语的单复数应以什么为依据？', '整个主语的中心及其语法意义', '离动词最近的任何名词', '句子中名词总数', '修饰语里的复数名词不一定是主语中心；the number of 的中心是单数 number。'],
    quantity: ['数量词与冠词：先看名词类型', '可数单数／可数复数／不可数名词 + 合适限定词', 'a / an 通常引入一个未特指的可数单数；the 表明确所指。few / fewer 配可数复数，little / less 配不可数。', '把 advice / information 当普通可数词加 -s，或把 few 与 little 随意互换。', '选择这里的限定词前，应先检查什么？', '名词是否可数以及是否特指', '名词是不是课文中的生词', '句子是否使用过去时', '可数性、单复数和所指是否明确，共同影响冠词与数量表达。'],
    modal: ['情态表达：保留可能性与态度', 'may / might / would 等 + 动词原形（也可带完成／被动形式）', '这类词可以表示可能、意愿、假设或过去反复行为。要结合上下文，不能把 might 等同于已经证实。', '删掉情态词后把可能性写成确定结论，或在情态词后直接加第三人称 -s。', '保留本句的情态表达有什么作用？', '准确保留可能性、假设或说话人的态度', '自动证明结论为真实事实', '让所有动词都变成过去式', '情态表达改变断言强度或语气；翻译和改写时不应无故把它强化为事实。'],
    exclamation: ['感叹句：表达强烈评价', 'How + 形容词／副词 + 主语 + 谓语！', 'How 在这里引出感叹，不是询问“怎样”。主语和谓语仍用陈述顺序。', '把感叹句写成疑问倒装，如 How lucky were we。', '本句 How 后的主语谓语采用什么顺序？', '陈述语序：主语在谓语前', '疑问语序：必须倒装', '不用主语，删去全部名词', 'How lucky we were! 是感叹；How lucky were we? 则是提问语序。'],
    result: ['结果：如此……以至于……', 'so + 形容词／副词 + that + 结果从句', '先找程度词，再问“造成什么结果”。so…that 与 so that（常表目的）需要结合是否含程度成分区分。', '遗漏 so 后的程度成分，或将结果从句误解为动作的计划目的。', '本句 so…that 主要连接哪两层意思？', '程度和由此产生的结果', '两个互不相关的人名', '仅仅表达先后日期', 'so 修饰形容词或副词，that 从句说明达到该程度后产生的结果。'],
    reporting: ['转述：把别人的话放进句子', 'said that + 陈述内容；或疑问词 + 陈述语序', '从直接提问／原话转换成嵌入的内容时，保留信息但使用陈述语序。时态回移要看转述时间与事实是否仍成立。', '在间接问句中保留疑问倒装，或以为所有转述都必须机械回移时态。', '嵌入式疑问内容的基本语序是什么？', '疑问词之后采用陈述语序', '疑问词之后永远倒装', '必须把疑问词删掉', '直接问 Where is it?；嵌入句为 I know where it is，主语在谓语前。'],
    measurement: ['数据表达：分清终点、变化量与单位', 'from A to B；rise by 变化量；百分点与相对百分比不同', '先记原值和新值，再检查单位。10% 到15% 是增加5个百分点，相对原值增加50%。', '用 to 写变化量，或把百分比和百分点混为一谈。', '比较数据变化时，必须保持什么清楚？', '基准值、终点值以及变化的单位', '所有增加都写成同一个百分比', '只报数字而不说明单位', '终点、绝对差和相对变化回答不同问题；先确定计算基准再写句子。'],
    negation: ['否定范围：并非全部不等于全部没有', 'not + every / all 等通常表示部分否定', '找出否定作用于哪些词。“并非每一种都比较过”允许比较过其中一部分，不能改成“一种也没比较”。', '把 not every 直接改写成 no / none，导致结论过强。', 'not every 在本句中的意思是什么？', '不是每一个都……', '一个也没有……', '每一个都一定……', '部分否定只否定“全部成立”；它不等同于完全否定。']
  };

  // [family, sentence analysis, exercise stem, correct option, two distractors, explanation]
  const ROWS = [
    [
      ['independent', 'the distance＝距离（补充部分的主语）；measuring approximately 5,000 kilometers＝长约五千公里。还原：and the distance measured approximately 5,000 kilometers。', '独立主格补全：the distance ____ approximately 5,000 kilometers', 'measuring', 'measured is', 'measures', '本处是补充背景的非谓语结构，distance 与 measure（长达）为主动关系，所以用 measuring；measures 会成为完整谓语，需要另加连接结构。'],
      ['modifier', 'a city＝一座城市；surrounded by mountains＝被群山环绕。展开：a city that is surrounded by mountains。', 'a city ____ by mountains', 'surrounded', 'surrounding', 'surround', '城市承受 surround 这个动作，过去分词 surrounded 修饰 city；surrounding 表示城市去环绕其他东西，关系变了。'],
      ['adverbial', 'Having a gift for communication＝有沟通天赋；he＝他；started chatting＝开始聊天。可理解为 Because he had a gift for communication, he started chatting。', '这里的 Having a gift 表示什么？', '拥有天赋这一状态', '已经完成了 have 这个动作', '将来获得天赋', 'having 是 have 的 -ing 形式；没有 having + 过去分词，不能把它认作完成式分词。']
    ],
    [
      ['verbal', 'look forward to＝期待；its arrival＝它的到来。将名词 arrival 改为动作时，用 look forward to seeing the festival。', 'We look forward to ____ the festival.（期待观看）', 'seeing', 'see', 'to see', 'look forward to 中的 to 是介词，后接名词或 doing。原句的 its arrival 是名词短语。'],
      ['asIf', 'as though＝仿佛；they were never tired＝他们从不疲倦。were 在语境中表达与实际有距离的假设，而不是证明他们真的永不疲倦。', '原句 as though they were never tired 最合理的理解是：', '看起来仿佛永远不累', '已经证实他们从不疲倦', '他们答应未来不疲倦', 'as though 描述方式或印象；这里的假设语气不应被改写为已确认事实。'],
      ['modifier', 'a beauty＝一位美人；dressed up in lovely clothing＝穿着漂亮衣服。展开：a beauty who is dressed up in lovely clothing。', 'a beauty ____ up in lovely clothing', 'dressed', 'dress', 'dressing herself is', '这里用 dressed up 的状态短语修饰 beauty；完整从句才可以写 who is dressed up。']
    ],
    [
      ['gerund', 'by＝通过；running a barbecue restaurant＝经营一家烧烤店。by 说明谋生手段，running 带宾语 restaurant。', 'He earned a living by ____ a restaurant.', 'running', 'run', 'to run', 'by 是介词，后接动名词 running；run 在这里意为经营。'],
      ['relative', 'a barbecue restaurant 是先行词；逗号后的 which served… 补充该餐馆提供什么。which 在从句里作 served 的主语。', 'a barbecue restaurant, ____ served delicious food', 'which', 'that', 'what', '逗号后的非限制性定语从句用 which 指物，不能在这里用 that；what 不另接这种先行词。'],
      ['contrast', 'Your customers put on weight＝你的顾客增重；while＝而；Yong Hui’s [customers] lose weight＝永慧的顾客减重。', '原句 while 的意思是：', '而（对比两组顾客）', '直到', '因为', '两组顾客的体重变化相反，所以 while 表对比；Yong Hui’s 后省略了 customers。']
    ],
    [
      ['nominal', '[what those gestures really mean]＝那些手势真正表达的意思；整个括号是主语；is subjective＝是主观的。what 同时是 mean 的宾语。', '____ those gestures really mean is subjective.', 'What', 'That', 'Whether', 'what 表“所……的意思”，补足 mean 的宾语；that 在名词性从句里不承担这一成分。'],
      ['complement', 'I＝观察者；saw＝看见；a man＝宾语；looking around curiously＝补充那个人正在好奇张望。', '要突出“看到他正在张望”，应选：I saw a man ____ around.', 'looking', 'to look', 'looked', 'see + 宾语 + doing 突出看到的过程；see + 宾语 + 原形可描述观察到动作发生，但不在此强调正在进行。'],
      ['time', 'On hearing that＝一听到这件事；hearing 的动作人是后文 I。可展开为 As soon as I heard that…。', 'On ____ that, I understood his gesture.', 'hearing', 'hear', 'to hear', 'on + doing 可表示“一……就……”；听到的人应与主句 I 一致。']
    ],
    [
      ['time', 'As soon as＝一……就……；our shuttle＝主语；got close＝接近。原文在过去叙事，因此 got 不是将来形式。', '改为未来安排：As soon as our shuttle ____ close, we will get ready.', 'gets', 'will get', 'getting', '谈将来时，普通时间从句通常用一般现在时 gets，主句再用 will。'],
      ['nominal', '[Whichever we bought in the central shop]＝我们在中央商店买的无论哪件；整个从句作 was made 的主语。', '原句 Whichever we bought… 在大句里作什么？', '主语', '修饰 shop 的定语', 'was 的时间状语', '把整个从句替换成 The item 就能看见主干：The item was made of wood。'],
      ['concession', 'wherever we went＝无论走到哪里；we could see…＝都能看见……。后面的 carpenters working 表示木匠正在工作。', '____ we went, we could see carpenters working.（无论到哪里）', 'Wherever', 'Because', 'Unless', 'wherever 保留“不论哪个地点都如此”的含义；because 变成原因，unless 变成条件，均改变原意。']
    ],
    [
      ['relative', 'a severe disease＝一种严重疾病；whose characteristic＝这种疾病的特征。whose 不限于人，可表示事物的所属。', 'a disease ____ characteristic was unusual', 'whose', 'who', 'which', '后面紧跟名词 characteristic，需要所属关系 whose；which characteristic 在这里不是对应的关系结构。'],
      ['verbal', 'the polluted paint＝被污染的油漆；was to blame＝应负责任。这里把责任归因于油漆。', 'The polluted paint was ____.（应对此负责）', 'to blame', 'to be blame', 'blaming', 'be to blame 是固定表达，主动形式含“应负责任”的意义；不要机械补成被动。'],
      ['adverbial', 'Exposed to radium＝暴露于镭；people＝承受暴露的人；absorbed radiation＝吸收辐射。展开：When people were exposed to radium…。', '____ to radium, people absorbed radiation.', 'Exposed', 'Exposing', 'Expose', 'people 是被暴露于辐射环境的对象，所以用过去分词 Exposed，而不是主动 Exposing。']
    ],
    [
      ['state', 'Unwilling to leave out any attraction＝不愿漏掉任何景点；它描述主句 my cousin 的状态和动机。注意 unwilling 是形容词，不是现在分词。', 'Unwilling to leave out any attraction 在句中主要说明谁的状态？', 'my cousin', 'the attraction', 'the collection', '短语描述主句人物 my cousin 的意愿；不要将 unwilling 误当成 attraction 的性质。'],
      ['modifier', 'collections＝收藏品；consisting of statues＝由雕像组成。可展开为 collections that consist of statues。', 'collections ____ of statues', 'consisting', 'consisted by', 'being consisted', 'consist of 表“由……组成”，通常不用被动形式；现在分词 consisting of 修饰 collections。'],
      ['nominal', 'what they used to be＝它们过去的样子；整段作 with 的宾语。used to be 描述过去曾有的状态。', 'what they ____ be（它们过去的样子）', 'used to', 'are used to', 'use for', 'used to + 原形表示过去曾经；be used to + 名词/doing 则表示习惯于，两者不同。']
    ],
    [
      ['verbal', 'couldn’t tolerate＝不能忍受；typing＝打字这件事。typing 是 tolerate 的宾语。', 'He couldn’t tolerate ____.', 'typing', 'to type', 'type', 'tolerate 后接名词或动名词，不能在此直接接 to type。'],
      ['ellipsis', 'when speeding up＝当加速时；省去 our jet was。展开：when our jet was speeding up，动作人仍是飞机。', 'when speeding up 的完整形式是：', 'when our jet was speeding up', 'when speeding our jet was', 'when our jet speed up was', '省略前后主语一致，且从句含 be 时，才可在这个结构中省去主语和 be。'],
      ['adverbial', 'guided by the smoke＝受到烟雾指引；主句 some local citizens＝被指引的当地居民。', '____ by the smoke, some local citizens came to help.', 'Guided', 'Guiding', 'Guide', '当地居民受到烟雾的指引，所以用被动关系的过去分词 Guided。']
    ],
    [
      ['formal', 'It＝形式主语；is admirable＝令人钦佩；that she is seldom accused of making mistakes＝真正被评价的内容。of 后面的 making 是动名词。', 'It is admirable ____ she is seldom accused of making mistakes.', 'that', 'what', 'which', '后面的完整陈述说明被评价的事情，that 只连接；what 会额外要求在从句中承担成分。'],
      ['nominal', 'she assesses＝她评估；whether＝是否；they are deliberately hiding the truth＝他们是否故意隐瞒事实（陈述语序）。', '正确嵌入 assesses 后的是：', 'whether they are hiding the truth', 'whether are they hiding the truth', 'whether hiding they are the truth', 'whether 引导的宾语从句采用主语 they 在 are 前的陈述顺序。'],
      ['relative', 'the senior chief editor＝先行词；who＝指该编辑并作从句主语；polishes and approves＝两个并列动作。', 'the senior chief editor, ____ polishes and approves every section', 'who', 'that', 'which', '先行词是人，且逗号后是非限制性从句，用 who；that 不用于此处。']
    ],
    [
      ['passive', 'His organs＝承受损伤的器官；were＝过去时复数 be；damaged＝过去分词。', 'His organs ____ damaged in the accident.', 'were', 'was', 'have', 'organs 是复数，过去时被动需要 were damaged；have damaged 会成为主动完成结构。'],
      ['purpose', 'to stop＝为了停止；bleeding＝出血这件事。整个 to stop bleeding 说明急救动作的目的。', '“为了止血”应写：', 'to stop bleeding', 'to stop to bleed', 'for stop bleed', 'stop doing 是停止正在做的事；stop to do 是停下别的事转而去做，不能表达止血。'],
      ['relative', 'the nurse＝被说明的人；who＝从句主语；overcame a variety of barriers＝克服多种障碍。', 'the nurse ____ overcame a variety of barriers（选指人的关系代词）', 'who', 'which', 'whose', 'who 作 overcame 的主语；whose 后通常需接表示所属的名词。']
    ],
    [
      ['modifier', 'sculptures＝雕塑；carved out of marble＝用大理石雕成。展开：sculptures that were carved out of marble。', 'sculptures ____ out of marble', 'carved', 'carving', 'carve', '雕塑承受雕刻动作，因此用 carved。'],
      ['contrast', 'neither art nor geometry＝既不是艺术，也不是几何；art 和 geometry 是两个平行名词。', 'neither art ____ geometry', 'nor', 'or', 'but', '固定结构 neither…nor… 同时否定两项；either…or… 才表示二选一。'],
      ['relative', 'many＝许多人；who have a preference for abstract art＝喜欢抽象艺术的那些人。many 在此可独立指人。', 'many ____ have a preference for abstract art（选指人的关系代词）', 'who', 'which', 'whose', 'who 在从句里作 have 的主语，说明 many 所指的人。']
    ],
    [
      ['complement', 'he found＝他发现；writing poems＝宾语（写诗这件事）；the most appropriate way＝说明这件事是最合适的方式。', 'he found ____ poems the most appropriate way', 'writing', 'write', 'wrote', '动名词短语 writing poems 在 find 后作宾语；后面的名词短语说明它是什么方式。'],
      ['gerund', '[Using concrete but flexible language and the minimum of words]＝这种用词方式（完整主语）；is his style＝是他的风格。', 'Using concrete but flexible language ____ his style.', 'is', 'are', 'have', '将整个做法视为一件事，动名词短语主语搭配单数谓语 is。'],
      ['modifier', 'one of his works＝他的作品之一；made up of 3 sections＝由三部分组成。展开：one of his works that is made up of 3 sections。', 'one of his works ____ up of three sections', 'made', 'making', 'make', 'be made up of 表“由……组成”；作名词后定语时保留过去分词短语 made up of。']
    ],
    [
      ['concession', 'Whether they are male or female＝不论他们是男性还是女性；主句对两种情况都适用。', 'Whether they are male ____ female', 'or', 'nor', 'but', 'whether…or… 将两个可能情况并列，配合主句表达不论哪种情况。'],
      ['verbal', 'feel like＝想要；deciding on everything＝自己决定所有事情。like 在该搭配里是介词。', 'They feel like ____ on everything.', 'deciding', 'to decide', 'decide', 'feel like + doing，不是 feel like to do。'],
      ['conditional', 'As long as we strengthen communication＝只要加强沟通；we will…＝将会……。条件从句用现在形式表达将来条件。', 'As long as we ____ communication, we will understand each other better.', 'strengthen', 'will strengthen', 'strengthening', '普通未来条件中，as long as 从句通常用一般现在时，主句用 will。']
    ],
    [
      ['focus', '补足原文省略处：it is [humans’ existence and their randomly consuming energy] that result in this phenomenon。去框架：Humans’ existence and their randomly consuming energy result in this phenomenon。并列主语解释 result 的复数形式。', 'It is humans’ existence and their randomly consuming energy ____ result in this phenomenon.', 'that', 'what', 'where', 'It is…that… 强调原因部分；that 后保留原基本句谓语。原摘句省略了并列成分，不能据此误改为 results。'],
      ['suggestion', 'It is suggested＝有人建议；that we use…＝建议采取的行动。use 可理解为 should use。', 'It is suggested that we ____ energy-saving appliances.', 'use', 'uses', 'using', '建议类从句用动词原形 use；也可用 should use。'],
      ['concession', 'even if＝即使；our needs＝我们的需求；may be met＝可能被满足。即使满足需求，前述反对立场仍可成立。', 'our needs may be ____（需求可能得到满足）', 'met', 'meet', 'meeting', '情态动词被动为 may + be + 过去分词；meet 的过去分词是 met。']
    ],
    [
      ['tense', 'I was drawing 与 he was bathing 是当时的两个背景动作；erupted 是发生的事件。先区分背景过程和事件发生。', 'When I was drawing, he ____ bathing.', 'was', 'has', 'did', '过去进行时为 was / were + doing；he 配 was。'],
      ['complement', 'I noticed＝我注意到；a rainbow＝宾语；appear＝出现这一事件，作宾补。', '原句使用“观察到出现这一事件”的结构：I noticed a rainbow ____.', 'appear', 'to appear', 'appeared', 'notice + 宾语 + 动词原形可描述观察到事件发生；不能在本结构中写 to appear。'],
      ['exclamation', 'How lucky＝多么幸运；we＝主语；were＝谓语。感叹仍保留 we were 的陈述顺序。', '选择与原句一致的感叹语序：', 'How lucky we were!', 'How lucky were we!', 'How we lucky were!', '感叹结构为 How + 形容词 + 主语 + 谓语，不采用疑问倒装。']
    ],
    [
      ['adverbial', 'a tank exploded＝坦克爆炸；sending him flying＝使他被抛飞，说明爆炸造成的结果。send + him + flying 又是宾补结构。', 'A tank exploded, ____ him flying.', 'sending', 'sent', 'send', '分词 sending 补充前面事件的结果；若用 sent 作并列谓语，需要相应连接结构。'],
      ['result', 'so beneficial＝如此有益；that he adapted＝以至于他适应了。beneficial 是被 so 修饰的形容词。', 'so beneficial ____ he adapted to the change', 'that', 'what', 'than', 'so + 形容词 + that 从句表达程度导致的结果。'],
      ['ellipsis', 'All [you have]＝你拥有的一切，是整体主语；you have 前可补 that；is adequate＝已经足够。', 'All ____ you have is adequate.（补回省略的关系词）', 'that', 'what', 'who', 'all 后的关系从句中，that 作 have 的宾语可省略；what 不能再跟在 all 后作这种关系词。']
    ],
    [
      ['gerund', 'was tired of＝厌倦；being left alone＝被独自留下这件事。她承受 leave 的动作。', 'She was tired of ____ alone.', 'being left', 'be left', 'leaving her', 'of 后用动名词，被动形式是 being + left。'],
      ['complement', 'He trimmed＝他修剪；his fingernails＝宾语；short＝宾补，说明修剪后的指甲状态。', 'He trimmed his fingernails ____.（剪短）', 'short', 'shortly', 'shortness', '这里需要形容词 short 描述 fingernails 的结果状态；shortly 常指不久。'],
      ['gerund', 'After＝在……之后；being tested out＝被试用／考验；for 3 months＝持续三个月。', 'After ____ tested out for three months', 'being', 'be', 'been', '介词 after 后使用 being tested 的被动动名词结构。']
    ],
    [
      ['modifier', 'a wound＝一处伤口；caused by a shark＝被鲨鱼造成。展开：a wound that was caused by a shark。', 'a wound ____ by a shark', 'caused', 'causing', 'cause', '伤口是被造成的结果，所以用过去分词 caused 修饰 wound。'],
      ['asIf', 'as if＝仿佛；to urge him＝要催他；to help it＝去帮助它。此处是对动物意图的推想，不是确认它说出了请求。', 'as if ____ him to help it', 'to urge', 'urge', 'urged', 'as if 可后接不定式，表达“仿佛要……”；本句用 to urge 表似乎具有的意图。'],
      ['modal', 'Every time he brought it tasty fish＝每当他带来鲜鱼；it would…＝它总会……。would 在过去叙述中表示反复行为。', '本段 it would… 主要表示：', '过去每次都会出现的行为', '已经证明未来永远如此', '对过去的否定命令', '与 Every time 和过去式 brought 配合，would 表过去习惯性反应。']
    ],
    [
      ['nominal', 'they were shocked＝他们感到震惊；by [what they saw]＝因他们看到的东西。what 在小句中作 saw 的宾语。', 'They were shocked by ____ they saw.', 'what', 'that', 'which it', 'what 同时连接从句并补足 saw 的宾语，意思是“他们所看到的事情”。'],
      ['formal', 'It was a privilege＝是荣幸；for them to be there＝对他们来说能到那里。把后半部分移到句首可理解为 To be there was a privilege for them。', 'It was a privilege for them ____ there.', 'to be', 'being is', 'be', 'it 先占主语位置，for them to be there 说明被评价的具体事情。'],
      ['conditional', '他因政治和安全原因不能调整行程；otherwise he would go＝如果没有这些限制，他就会去。原文含隐含条件。', 'otherwise he would go 保留的语气是：', '若情况不同，他会去', '他已经去了', '他正在去且必然到达', 'otherwise 引出与现状不同的假设结果；不能把 would go 强化成已经发生。']
    ],
    [
      ['tense', 'Having reached her destination＝已经到达目的地后；再发生主句 settled。having + reached 表示分词动作先于主句。', '____ reached her destination, she settled into her new home.', 'Having', 'Has', 'Have', '完成式分词为 having + 过去分词；该短语不是独立的完整谓语。'],
      ['complement', 'she found＝她觉得；English idioms＝宾语；difficult to understand＝宾补。understand 的对象就是 idioms，不再重复加 them。', 'She found English idioms difficult ____.', 'to understand', 'to understand them', 'understand', 'idioms 已经是 understand 的逻辑宾语，to understand 后无需再放 them。'],
      ['nominal', '[What bothered her most]＝最困扰她的事（主语）；was＝系动词；[that…]＝说明具体内容的表语从句。', '____ bothered her most was that she could not follow the conversation.', 'What', 'That', 'Whether', 'what 在 bothered 前承担从句主语；that 不承担这个成分。后面的 that 从句另作表语。']
    ],
    [
      ['adverbial', 'Attracted by the boom＝被繁荣吸引；主句 my nephew＝受到吸引的人。可改为 Because my nephew was attracted by the boom…。', '____ by the boom in America, my nephew decided to move.', 'Attracted', 'Attracting', 'Attract', 'my nephew 承受 attract 的动作，过去分词短语表达原因。'],
      ['formal', 'It occurred to my nephew＝我侄子突然想到；that…＝他想到的具体内容。it 不指代一个物品。', 'It occurred ____ my nephew that he needed a new plan.', 'to', 'for', 'at', '固定表达 occur to somebody 表“某人想到”；that 从句补充想到的内容。'],
      ['modifier', 'a small ferry＝一艘小渡轮；called the North Pole Seagull＝名叫北极海鸥号。展开：a ferry which was called…。', 'a small ferry ____ the North Pole Seagull', 'called', 'calling', 'call', '渡轮是被命名的对象，所以用过去分词 called 修饰 ferry。']
    ],
    [
      ['suggestion', 'suggested＝建议；[the constitution include compulsory regulations]＝建议内容，that 省略。include 保留原形。', 'He suggested the constitution ____ compulsory regulations.', 'include', 'includes', 'including', 'suggest 表建议，宾语从句可用动词原形 include，也可用 should include。'],
      ['ellipsis', 'When interviewed＝受访时；展开为 When he was interviewed。被采访者是主句同一个 he。', 'When interviewed 可以还原为：', 'When he was interviewed', 'When he interviewed was', 'When interviewed he is doing', '过去分词 interviewed 保留被动意义；省去的是相同主语 he 和 be。'],
      ['focus', 'undertaking cloning＝开展克隆这件事（主语）；does differ＝确实不同。does 承担单数现在形式，differ 保持原形。', 'Undertaking cloning does ____ in important ways.', 'differ', 'differs', 'differed', '强调助动词 does 后用动词原形 differ，不能再次加 -s。']
    ],
    [
      ['verbal', 'set about＝着手；working＝工作这件事。与 set out to work 的形式不同。', 'He set about ____.', 'working', 'to work', 'work', 'set about 接 doing；set out 才与 to do 配合表示着手做。'],
      ['nominal', 'whether＝是否；applications＝主语；are valid and practical＝是否有效且实用。整体表达待判断的问题。', '正确表达“申请是否有效”的嵌入内容是：', 'whether applications are valid', 'whether are applications valid', 'whether valid applications are do', '名词性从句保持 applications are 的陈述语序。'],
      ['verbal', 'it＝产品；was stable and convenient＝稳定且便利；to use＝用起来。use 的逻辑宾语是 it。', 'The device was convenient ____.', 'to use', 'to use it', 'using it is', '形容词 + to do 中，主语已是 use 的逻辑宾语，不重复 it；本结构用主动形式表达“用起来”。']
    ],
    [
      ['gerund', 'in need of＝需要；being sent to a laundry＝被送到洗衣店。衣物承受 sent 的动作。', 'The clothes were in need of ____ to a laundry.', 'being sent', 'be sent', 'sending them', 'of 后接动名词；衣物是被送走的对象，使用 being sent。'],
      ['adverbial', 'laughing and saying＝一边笑一边说；两个 -ing 形式并列，共用主句的 she 作为动作人。', 'laughing and ____（保留并列的伴随动作）', 'saying', 'said', 'says', '两个伴随分词结构平行，都用 -ing 形式。'],
      ['tense', 'seemed＝似乎；to have betrayed me＝在此之前已暴露我的身份。完成不定式表示暴露先于当前的判断。', 'Her pronunciation seemed ____ betrayed her.', 'to have', 'to has', 'having is', 'seem 后接不定式；to have + 过去分词说明动作先于 seem 所对应的时间。']
    ],
    [
      ['ellipsis', 'When giving a lecture＝讲课时；展开为 When the professor was giving a lecture。give 的动作人是教授。', 'When giving a lecture 的隐含动作人是：', 'the professor', 'the equipment', 'the lecture', '省略从句的逻辑主语与主句 the professor 一致，不能把 lecture 当动作人。'],
      ['purpose', 'to avoid＝为了避免；fortune division＝财产分割。avoid 后这里接名词；换成动作要用 doing。', '为了避免犯错：to avoid ____ mistakes', 'making', 'to make', 'make', '外层 to avoid 表目的；avoid 自己后面接 doing，所以是 to avoid making。'],
      ['concession', '[Primitive and not ample]＝简陋而不充足；as their alternative equipment was＝尽管他们的替代设备如此。还原：Although their equipment was primitive and not ample…。', 'Primitive as their equipment was 的意思是：', '尽管设备简陋', '因为设备必定更先进', '设备越简陋越好', '形容词提前的 as 结构可表让步，不能按普通“因为”理解。']
    ],
    [
      ['adverbial', 'Hiding behind the loose dusty curtain＝躲在松垂落灰的窗帘后；动作人是主句 a teenager。', '____ behind the curtain, a teenager listened quietly.', 'Hiding', 'Hidden him', 'Hides', '此句表示少年主动躲藏，用 Hiding；短语与主句少年相联系。'],
      ['nominal', 'what he was suffering from＝他正在遭受的事情；he 是主语；what 是介词 from 的宾语，from 留在从句末尾。', 'what he was suffering ____', 'from', 'to', 'at', 'suffer from 是“遭受……”；what 提到从句开头，介词 from 可留在末尾。'],
      ['tense', 'he has recovered＝他已恢复；and has fallen in love with English＝并已喜欢上英语。两段完成形式强调变化与现在的联系。', 'He has recovered and has ____ in love with English.', 'fallen', 'fell', 'fall', '现在完成时 has + 过去分词；fall 的过去式是 fell，过去分词是 fallen。']
    ],
    [
      ['passive', 'English＝被说的语言；is＝一般现在时；frequently＝经常；spoken＝speak 的过去分词。', 'English is frequently ____.', 'spoken', 'spoke', 'speaking', '一般现在时被动为 is + spoken；频率副词 frequently 可置于二者之间。'],
      ['reporting', 'which country＝哪个国家；the foreigners of your block＝主语；are from＝来自。嵌入后仍是主语在 are 前。', 'I wonder ____ .', 'which country the foreigners are from', 'which country are the foreigners from', 'which country from are foreigners', 'wonder 后的间接疑问采用陈述语序，不保留直接问句的倒装。'],
      ['contrast', 'while＝而；the latter＝前面两个表达中的后者；suggests that he is British＝暗示他是英国人。此处 suggests 表暗示，不是建议。', '这里 while the latter… 中 while 表示：', '对比前后两种表达', '原因已经证实', '在未来某时', '两个表达暗示不同来源，所以 while 表对比；不能只按“当……时”翻译。']
    ],
    [
      ['tense', 'Ever since graduating＝从更早的毕业起；she had been determined＝一直下定决心，延续到叙述中的过去时点。', '在过去叙事参照点之前：Ever since graduating, she ____ been determined.', 'had', 'will', 'does', 'had been 把状态放在过去参照点之前；不是所有 since 都只能搭配现在完成时。'],
      ['verbal', 'persuade＝说服；her＝被说服的人；to change her mind＝改变想法。', 'No one could persuade her ____ her mind.', 'to change', 'changing', 'change', '固定结构 persuade somebody to do something。'],
      ['modifier', 'a river＝河流；flowing from a high altitude＝从高处流下。展开：a river that flows from a high altitude。', 'a river ____ from a high altitude', 'flowing', 'flowed by', 'flows is', '河流主动流动，用 flowing 修饰 river；不是 river 被 flow。']
    ],
    [
      ['asIf', 'It seemed＝看起来；as if the world was at an end＝仿佛世界到了尽头。这是灾难场景中的主观感受。', 'It seemed as if… 在此说明：', '一种强烈的感觉或印象', '世界结束的已核实事实', '一项准确的时间预测', 'as if 与 seemed 配合描述感受，不能当成事实证据。'],
      ['with', 'With＝引出伴随情况；the reporters＝此短语自己的主语；giving an outline＝记者正在概述。', 'With the reporters ____ an outline, people learned what happened.', 'giving', 'given', 'give', 'with + 名词 + doing 表主动关系；reporters 是 give 的执行者。'],
      ['agreement', 'The injured＝伤者这一类人；the dead＝死者这一类人。两者分别接复数谓语 were，不是单个形容词作普通物品名词。', 'The injured ____ rescued.', 'were', 'was', 'is', 'the + 形容词指一类人时，通常按复数理解；此处过去时用 were。']
    ],
    [
      ['relative', 'those＝那些人；who＝关系代词作从句主语；were out of work＝失业。', 'those ____ were out of work（选指人的关系代词）', 'who', 'which', 'whose', 'who 说明 those 所指的人，并在从句中承担主语。'],
      ['verbal', 'devoted himself to＝致力于；stopping＝阻止这件事。这里 to 是介词。', 'He devoted himself to ____ injustice.', 'stopping', 'stop', 'to stop', 'devote oneself to 中 to 为介词，后接 doing，不是 to + 原形的不定式。'],
      ['gerund', 'couldn’t escape＝无法逃避；being sentenced＝被判刑这件事。主语承受 sentence 的动作。', 'He couldn’t escape ____ sentenced.', 'being', 'be', 'been', 'escape 后接动名词；被动形式为 being sentenced。']
    ],
    [
      ['ellipsis', 'The evidence [they found]＝他们找到的证据；[they found] 修饰 evidence，省略宾语关系词；showed [that…] 的 that 从句是宾语。', 'The evidence ____ they found showed that…（补回关系词）', 'that', 'what', 'who', 'evidence 已是先行词，从句 they found 缺宾语，可用 that；后面 showed 的 that 引导另一种宾语从句。'],
      ['nominal', 'how＝如何；the vase＝主语；survived＝幸存。整段说明花瓶幸存的方式，在 Debates on… 后作介词宾语。', 'Debates on ____ continued.', 'how the vase survived', 'how did the vase survive', 'how survived the vase did', '介词 on 后的嵌入内容用陈述语序，不能带直接疑问句的 did 倒装。'],
      ['verbal', 'It is worth＝值得；giving this brave maid a fortune＝给这位勇敢女仆财富作为回报。关键搭配是 be worth doing。', 'It is worth ____ this brave maid a reward.', 'giving', 'to give', 'give', 'be worth + doing；这里不要套用 be worthy to be done 等其他结构。']
    ],
    [
      ['inversion', 'Only when you win fairly＝只有当你公平获胜时；will you…＝主句部分倒装。when 从句仍是 you win。', 'Only when you win fairly ____ be respected.', 'will you', 'you will', 'you do will', 'only + 状语位于句首时，主句将 will 提到主语前；从句不随之倒装。'],
      ['passive', 'the gymnastics event＝体操项目；to be held＝将要被举办。不定式被动修饰 event，带未来意味。', 'the gymnastics event ____ next week', 'to be held', 'to held', 'to be hold', '不定式被动为 to be + 过去分词 held；hold 的过去分词不是 hold。'],
      ['formal', 'It is foolish＝很愚蠢；to cheat＝作弊这件事。还原：To cheat is foolish。', 'It is foolish ____.', 'to cheat', 'cheat', 'to cheating', '不定式 to cheat 是真正主语；it 使较长的内容放后面。']
    ],
    [
      ['ellipsis', 'when connected by the network＝通过网络连接时；补回 when computers are connected…。computers 承受连接。', 'when connected by the network 可还原为：', 'when computers are connected by the network', 'when computers connecting by the network', 'when are computers connected by the network', '这里省略相同主语 computers 和 be，保留被动分词 connected；不是疑问语序。'],
      ['focus', 'so helpful that…＝如此有用以至于……；they do bring happiness＝它们确实带来幸福。do 是对 bring 的强调。', 'They do ____ happiness.', 'bring', 'brings', 'brought', '强调助动词 do 后，主要动词使用原形 bring。'],
      ['passive', 'computers＝承受攻击；are easily attacked＝很容易被攻击；by viruses＝攻击来自病毒。', 'Computers are easily ____ by viruses.', 'attacked', 'attacking', 'attack', '被动结构 are + attacked；by 后说明攻击者 viruses。']
    ],
    [
      ['complement', 'saw＝看到；some monkeys＝宾语；rubbing themselves＝猴子正在摩擦自己，作宾补。', '要突出看到正在发生的过程：She saw some monkeys ____ themselves.', 'rubbing', 'to rub', 'rubbed', 'see + 宾语 + doing 突出观察到动作过程。'],
      ['ellipsis', 'When told that…＝被告知……时；展开 When the farmers were told that…。接受信息的是 farmers。', 'When ____ that it was a loss, the farmers changed their minds.', 'told', 'telling', 'tell', '农民是被告知的人，用 told；这里省略 farmers were。'],
      ['inversion', 'Not until we succeed…＝直到成功才……；can we smile＝主句倒装。until 后仍是 we succeed。', 'Not until we succeed ____ smile.', 'can we', 'we can', 'we do can', 'not until 状语前置触发主句部分倒装 can we，不把 until 从句也倒装。']
    ],
    [
      ['result', 'I was so confident＝我如此自信；that I never decreased my devotion＝以至于从未减少投入。', 'I was ____ confident that I kept practising.', 'so', 'such', 'too', 'so 直接修饰形容词 confident；such 通常需要名词短语，too 常与 to do 配合且意义不同。'],
      ['relative', 'musicians＝先行词；whom people were familiar with＝人们熟悉的音乐家。whom 在从句中作 with 的宾语。', 'musicians ____ people were familiar with（选正式的宾格关系词）', 'whom', 'whose', 'which', '指人的介词宾语可用 whom；口语中常用 who 或在此省略，但此题要求正式宾格形式。'],
      ['passive', 'A million or so copies＝大约一百万份；were sold＝被卖出。or so 放在数量后表示约数。', 'A million or so copies ____ sold.', 'were', 'was', 'has', 'copies 是复数，过去被动用 were sold。or so 并不改变主语的复数性质。']
    ],
    [
      ['nominal', 'the theory＝理论；that its gentle climate and the pull of its gravity are similar to the earth’s＝解释理论的内容。that 不在内容中作主语／宾语。', '这里 theory 后的 that 从句主要作用是什么？', '说明这个理论的具体内容', 'that 代替 climate 作从句主语', '提供实际天文事实的保证', '这是同位语内容从句；该文章是练习文本，语法结构并不证明文中设定是真实科学事实。'],
      ['adverbial', 'Cheered up by this news＝受到这个消息鼓舞；biologists＝受到鼓舞的人；随后开始研究。', '____ up by this news, biologists began their research.', 'Cheered', 'Cheering', 'Cheer', 'biologists 被消息鼓舞，用过去分词 Cheered；主动 Cheering 会改变关系。'],
      ['verbal', 'prevented＝阻止；the spaceship＝被阻止发生危险的对象；from crashing＝避免坠毁。', 'They prevented the spaceship from ____.', 'crashing', 'crash', 'to crash', 'prevent + 宾语 + from doing，介词 from 后需要动名词。']
    ],
    [
      ['relative', 'who＝指前面的主人公；was brought up＝被养育长大；in America＝地点。who 在从句作主语。', 'who was ____ up in America', 'brought', 'bring', 'bringing', '被动用 was + 过去分词；bring 的过去分词为 brought。'],
      ['focus', 'It was [the fault of his skin colour] that [accounted for their rejection]。去框架：The fault of his skin colour accounted for their rejection。这是文中人物对歧视原因的判断；肤色本身不是人的过错。', 'It was the fault of his skin colour ____ accounted for their rejection.', 'that', 'what', 'where', 'It was…that… 强调原因部分。理解语法不等于认同把肤色说成过错的表述。'],
      ['comparison', 'couldn’t think of＝想不出；a better one＝一个更好的。意思是对当前选择评价很高，不是说所有选择都很差。', 'He couldn’t think of a better one 的含义接近：', '他觉得这个已经很好', '他确定这个最差', '他还没想过任何选择', '否定“存在更好的”可以表达很高程度的肯定；仍应根据上下文理解。']
    ],
    [
      ['adverbial', 'Born in a pigs’ nest＝出生在猪窝里；主句 Lina＝出生的人。还原为 Lina was born…。born 为 be born 的固定过去分词形式。', '____ in a pigs’ nest, Lina faced a difficult childhood.', 'Born', 'Bearing', 'Bore', '表示出生用 be born；短语作状语时省去 be，保留 Born。'],
      ['gerund', '[Her being outspoken and modest]＝她直率而谦逊这件事（整个主语）；won respect＝赢得尊重。Her 标明该状态属于她。', 'Her ____ outspoken and modest won respect for her.', 'being', 'be', 'is', 'being outspoken and modest 是动名词短语，Her 是其逻辑主语。'],
      ['modifier', 'an audience＝一群听众；crowding around her＝围在她周围。听众主动围拢，所以用 -ing。', 'an audience ____ around her', 'crowding', 'crowded by', 'crowd is', 'audience 与 crowd around 是主动关系，crowding 短语修饰 audience。']
    ],
    [
      ['tense', 'he had been struggling＝他此前一直在努力；had been + doing 连接更早开始的过程与叙事中的过去参照点。', 'He had been ____ for a long time.', 'struggling', 'struggled', 'struggle', '过去完成进行时结构为 had been doing，强调过去参照点之前持续的活动。'],
      ['modal', 'would rather＝宁愿；have chosen another job＝当初选择另一份工作。这里回看过去，表达不同选择的愿望。', 'He would rather have ____ another job.', 'chosen', 'chose', 'choose', 'would rather have + 过去分词表达对过去不同选择的愿望；choose 的过去分词为 chosen。'],
      ['complement', 'He found＝他觉得；the knowledge [Yuan circulated]＝宾语，括号修饰 knowledge；very practical＝宾补，说明知识实用。', 'He found the knowledge Yuan circulated very ____.', 'practical', 'practically', 'practice', '形容词 practical 补充描述 knowledge；practically 是副词，不适合这里的宾补意义。']
    ],
    [
      ['relative', 'who＝指卓别林；starred in and directed＝主演与执导两个并列谓语；many outstanding comedies＝共享的相关内容。', 'who starred in and ____ many outstanding comedies', 'directed', 'directing', 'to direct', '两个谓语 starred 与 directed 平行，共用主语 who；这里不能混成不定式或分词。'],
      ['with', 'With＝引出背景；all the porridge＝该短语的主语；eaten up＝被吃光后的状态。粥承受 eat 的动作。', 'With all the porridge ____ up, they were still hungry.', 'eaten', 'eating', 'eat', 'with + 名词 + 过去分词说明被动／完成状态；porridge 不能主动吃东西。'],
      ['result', 'so convincing and amusing＝如此可信又好笑；that…＝导致的结果；couldn’t help bursting into laughter＝忍不住大笑。', 'Everybody couldn’t help ____ into laughter.', 'bursting', 'to burst', 'burst', 'can’t help doing 表“忍不住做……”；整个结果由前面的 so…that 引出。']
    ],
    [
      ['tense', 'The college has introduced＝学院已经推出；a small grant＝一笔小额助学金。has introduced 关注现有成果；原文 completed…last week 则给出结束的过去时间。', '带 last week 时：She ____ her application last week.', 'completed', 'has completed', 'has been complete', '明确结束的过去时间 last week 通常搭配一般过去时 completed，不用现在完成时 has completed。'],
      ['tense', 'Mei has been helping＝Mei 一直在帮助；new students＝对象；原文 since September 给出活动的起点。', 'Since September, Mei has been ____ new students.', 'helping', 'helped', 'help', '现在完成进行时为 has been doing，突出从过去延续至今的活动。'],
      ['quantity', 'Each learner＝每一位学习者（单数）；had a different timetable＝有不同时间表。原文 advice 与 information 为不可数用法。', '选择与原文可数性一致的表达：', 'much advice', 'many advices', 'an information', 'advice、information 通常不可数，可说 much advice / a piece of information；each 后用单数 learner。']
    ],
    [
      ['comparison', 'The nearer he lived to work＝住得离工作地点越近；the less he would spend＝花费就越少。两个 the 都是关联比较结构的一部分。', 'The nearer he lived to work, ____ he would spend.', 'the less', 'less the', 'the least than', 'the + 比较级，the + 比较级表达“越……越……”。'],
      ['quantity', 'fewer vacant flats＝更少的空置公寓；flats 可数且复数，所以用 fewer。money 不可数时用 less。', 'There were ____ vacant flats.', 'fewer', 'less', 'little', '正式比较可数复数 flats 用 fewer；不可数 money / space 用 less。'],
      ['quantity', 'Daniel accepted a job＝首次提到一份工作；the rent＝语境中已明确的租金。冠词帮助读者判断是否特指。', '首次提到一份未特指的工作：Daniel accepted ____ job.', 'a', 'an', '不加冠词', 'job 是可数单数，首次非特指通常用 a；job 以辅音音素开头，不用 an。']
    ],
    [
      ['conditional', 'If the team works remotely＝如果团队远程工作；it will need a clear schedule＝将需要清晰安排。讨论现实的未来可能。', 'If the team ____ remotely, it will need a clear schedule.', 'works', 'will work', 'working', '第一条件句的普通 if 从句用一般现在时；team 在此按单数整体看，用 works。'],
      ['conditional', 'If everyone worked different hours＝假设每个人工作时间不同；meetings would be difficult＝会议会难安排。worked 不表示已经发生过。', 'If everyone worked different hours, meetings ____ difficult.', 'would be', 'will being', 'would been', '假设当前／未来的第二条件句常用 if + 过去式，主句 would + 原形。'],
      ['concession', 'although＝虽然；they could plan the rest of the day themselves＝他们能自行安排剩余时间。主句保留另一项限制。', '修正重复连接：Although they could plan their time, ____ they still had fixed meetings.', '去掉 but', '加上 but', '把 although 改成 because but', 'although 已引导让步从句，同一结构的主句通常不再用 but。']
    ],
    [
      ['reporting', 'The company said＝公司说；that it stored information securely＝转述其声称安全存储信息。过去式 stored 可由现在时回移，但说法不是事实核验。', '原话“We store information securely.”在过去转述中可写：', 'The company said that it stored information securely.', 'The company said that did it store information securely.', 'The company said that it storing information securely.', 'said 后可把 store 回移成 stored，并使用陈述语序；若强调仍然成立，也可能保留现在时。'],
      ['reporting', 'how long＝多久；the records＝主语；would be retained＝将被保留。间接问句与被动结构一起出现。', '选择嵌入式问句的正确顺序：', 'how long the records would be retained', 'how long would the records be retained', 'how long the records would retained be', '嵌入问句先放主语 the records，再放 would be retained。'],
      ['modal', 'Strong encryption＝强加密；might reduce＝可能减少；some risks＝部分风险。限定程度避免把可能性夸成零风险。', 'might reduce some risks 可合理改述为：', '可能降低部分风险', '一定消除全部风险', '已经证实没有风险', 'might 与 some 同时限制断言；改写时需要保留不确定性和范围。']
    ],
    [
      ['passive', 'Water＝处理对象；is＝三个过去分词共用；collected, treated and distributed＝收集、处理、分配。描述一般流程。', 'Water is collected, treated and ____.', 'distributed', 'distribute', 'distributing', '三个并列过去分词共享 is，共同构成一般现在时被动流程描述。'],
      ['passive', 'Some of those pipes＝部分管道；had been installed＝在过去调查前已经安装。had been + done 同时表达过去完成与被动。', 'Some pipes had been ____ before the inspection.', 'installed', 'install', 'installing', '过去完成被动结构为 had been + 过去分词 installed。'],
      ['gerund', 'Repairing the network＝维修管网这件事（主语）；would reduce waste＝预计可减少浪费。整段动作短语作主语。', '____ the network would reduce waste.', 'Repairing', 'Repair', 'Repaired is', '动名词短语 Repairing the network 可以整体作主语。']
    ],
    [
      ['quantity', 'a few concerns＝有一些担忧；concerns 可数复数。little evidence＝证据很少，突出不足；evidence 不可数。', 'There were ____ concerns.（有一些担忧）', 'a few', 'a little', 'much', 'a few 配可数复数 concerns；a little 配不可数名词。few 不带 a 时更强调几乎没有。'],
      ['modal', 'A sedentary routine＝久坐习惯；may be associated with＝可能与……有关；several difficulties＝一些困难。相关性没有直接证明因果。', 'may be associated with 能支持哪种表述？', '可能有关联', '已经证明是唯一原因', '必定导致每个人出现问题', 'may 限定可能性，associated with 描述关联；不能直接改为 causes。'],
      ['purpose', 'so that＝为了使；a useful change would not depend on…＝有用的改变不必依赖……；joining every activity 作 on 的宾语。', 'would not depend on ____ every activity', 'joining', 'join', 'to join', 'depend on 中 on 是介词，后接动名词；整个 so that 从句说明目的。']
    ],
    [
      ['conditional', 'If the company had changed the timetable earlier＝假设公司更早改了时刻表；more people might have used…＝可能会有更多乘客。两部分都回看过去。', 'If the company had changed the timetable earlier, more people might have ____ the service.', 'used', 'use', 'using', '第三条件句的结果可用 might have + 过去分词，保留“可能”而非保证。'],
      ['inversion', 'Had Ella accepted…＝If Ella had accepted…；省去 if 后，把 had 放到主语 Ella 前。其余 accepted… 不变。', 'Had Ella accepted… 等同于：', 'If Ella had accepted…', 'If had Ella accepted…', 'Ella accepts every time…', '省略 if 的过去假设条件倒装为 Had + 主语 + 过去分词。'],
      ['tense', 'the route had attracted＝该线路此前已吸引；more regular passengers＝更多固定乘客。过去试行结束时是参照点。', 'By the end of the trial, the route ____ attracted more passengers.', 'had', 'has now', 'did been', '过去参照点之前已发生的变化用 had attracted；这里不是以现在为参照。']
    ],
    [
      ['measurement', 'rose from forty thousand to fifty thousand＝由四万升至五万；to 标终点；差额为一万，写 rose by ten thousand。', 'Visits rose ____ forty thousand to fifty thousand.', 'from', 'by', 'at', 'from…to… 标起点与终点；by 后应给增加量，而非起点值。'],
      ['agreement', 'The proportion＝主语中心（比例，单数）；of visitors arriving by bicycle＝说明哪类访客的比例。原文 changed 的过去式不显单复数，改为现在描述时应看 proportion。', 'The proportion of visitors arriving by bicycle ____ changing.', 'is', 'are', 'have', '中心词 proportion 为单数；of 后 visitors 的复数不改变主语中心。'],
      ['measurement', '10% → 15%：15−10＝5 个百分点；(15−10)÷10＝50% 相对增幅。两种数字都可能正确，但单位不同。', '从10%升到15%，增加多少个百分点？', '5 percentage points', '50 percentage points', '5 per cent relative to the original value', '百分点是两个百分数直接相减，15−10＝5；相对增长才是50%。']
    ],
    [
      ['concession', 'Although the report contained useful findings＝虽然报告含有有用发现（完整从句）；despite the wording＝尽管这些措辞（名词短语）。', '把 although 后的完整句改为名词短语后，应选：____ the wording', 'despite', 'despite of', 'although', 'despite 直接接名词或 doing，不加 of；although 需要从句。'],
      ['nominal', 'what＝被测量的内容；the researchers＝从句主语；had actually measured＝此前实际上测量了。整体是“研究者实际测量的东西”。', 'what the researchers ____ actually measured', 'had', 'did have', 'were had', '过去完成时用 had + measured，且嵌入从句保持主语在 had 前。'],
      ['negation', 'had not compared every form of education＝并非每种教育方式都比较过；否定的是“全部都比较过”，没有断定一种都没比较。', 'not compared every form 的准确理解是：', '没有比较每一种', '一种都没有比较', '已经比较了每一种', 'not every 是部分否定；不能替换成 no forms 而不改变意思。']
    ],
    [
      ['relative', 'The residents＝居民；whose homes＝这些居民的家；stood near the main square＝位于主广场附近。whose 表所属。', 'The residents, ____ homes stood near the main square, raised concerns.', 'whose', 'who', 'which', 'homes 是后面的名词，需要 whose 表明“居民的家”；who 不能直接表达该所属关系。'],
      ['relative', 'The harbour＝港口（先行词）；where many visitors gathered＝许多游客在那里聚集。where 在从句作地点成分，相当于 at which。', 'The harbour, ____ many visitors gathered, was busy.', 'where', 'which', 'what', '从句 many visitors gathered 已有主语和谓语，这里需要“在那里”的地点关系 where。'],
      ['conditional', 'provided that＝条件是／只要；the events respected their working hours＝活动尊重他们的工作时间。该从句提出接受活动的条件。', 'provided that 在此意思是：', '只要／条件是', '虽然已经', '与此同时而已', 'provided that 引导条件，不能改译成让步或单纯同时发生。']
    ],
    [
      ['nominal', 'whether the material could protect its contents＝材料是否保护内容物；and whether customers could reuse it＝顾客是否可再利用。两个并列的待查问题。', 'whether the material could protect its contents and ____ customers could reuse it', 'whether', 'what', 'which', '第二个 whether 保持两个“是否”问题平行且清晰；不是询问什么东西或哪个对象。'],
      ['agreement', 'the size＝主语中心（尺寸，单数）；of each container＝说明哪个物体的尺寸；remained constant＝保持不变。', 'The size of each container ____ constant.', 'remains', 'remain', 'have remained', '主语中心 size 为单数，当前一般描述用 remains；container 的修饰部分不改变中心。'],
      ['gerund', 'before＝在……之前；making a broad commercial claim＝作出广泛商业宣称。动作主体须与相应研究／声明者一致，可展开 before they made…。', 'before ____ a broad commercial claim', 'making', 'make', 'to make', 'before 作介词后接 doing；若接完整从句则要补出 they made 等主谓结构。']
    ],
    [
      ['agreement', 'The number＝主语中心（数量，单数）；of requests＝申请的数量；was rising＝正在上升。a number of requests 则表示若干申请，通常配复数。', 'The number of requests ____ rising.', 'was', 'were', 'have', 'the number of 的中心是单数 number，过去进行时用 was rising。'],
      ['quantity', 'the amount of funding＝资金的量；funding 是不可数名词；was limited＝有限。数可数项目时用 number。', 'the ____ of funding was limited', 'amount', 'number', 'many', 'amount of 与不可数名词 funding 配合；number of 用于可数项目。'],
      ['verbal', 'funding one project＝资助一个项目这件事（主语）；meant＝意味着；delaying another＝推迟另一个。mean doing 与 mean to do 的意义不同。', 'Funding one project meant ____ another.', 'delaying', 'to delay', 'delay', 'mean doing 表“意味着”；mean to do 表“打算”，会改变原句的机会成本含义。']
    ]
  ]; // LESSON_ROWS

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function optionsFor(answer, wrongA, wrongB, seed) {
    const options = [answer, wrongA, wrongB];
    const shift = seed % options.length;
    return options.slice(shift).concat(options.slice(0, shift));
  }
  const data = freeze(SOURCE.map(function (lesson, li) {
    return {day: lesson.day, title: lesson.title, points: lesson.grammar.map(function (source, pi) {
      const row = ROWS[li][pi];
      const family = families[row[0]];
      const id = 'grammar-' + lesson.day + '-' + (pi + 1);
      return {
        id: id, quote: source.quote, sourceExplanation: source.explain, familyId: row[0],
        title: family[0], pattern: family[1], explanation: family[2], mistake: family[3], analysis: row[1],
        exercises: [
          {id: id + '-form', prompt: row[2], options: optionsFor(row[3], row[4], row[5], li + pi), answers: [row[3]], explanation: row[6]},
          {id: id + '-meaning', prompt: '结合本段原句：' + family[4], options: optionsFor(family[5], family[6], family[7], li + pi + 1), answers: [family[5]], explanation: family[8]}
        ]
      };
    })};
  }));

  function normalize(value) {
    return typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').replace(/[’‘]/g, "'").toLowerCase() : '';
  }
  function grade(exercise, answer) {
    if (!exercise || !Array.isArray(exercise.answers) || !exercise.answers.length) {
      return {answered: false, correct: false, answer: '', explanation: '无法判定这道练习。'};
    }
    const response = normalize(answer);
    return {
      answered: Boolean(response),
      correct: Boolean(response) && exercise.answers.some(function (accepted) { return response === normalize(accepted); }),
      answer: exercise.answers.join(' / '), explanation: exercise.explanation
    };
  }

  let mountSerial = 0;
  function mount(container, lesson) {
    if (!container || !container.ownerDocument || typeof container.replaceChildren !== 'function') {
      throw new TypeError('IELTSGrammar.mount 需要一个 DOM 容器。');
    }
    const doc = container.ownerDocument;
    const serial = ++mountSerial;
    const listeners = [];
    function node(tag, className, text) {
      const element = doc.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }
    function listen(element, type, handler) {
      element.addEventListener(type, handler);
      listeners.push(function () { element.removeEventListener(type, handler); });
    }
    const host = node('section', 'grammar-coach');
    host.setAttribute('aria-label', '本课语法精讲与练习');
    container.replaceChildren(host);
    function dispose() {
      listeners.forEach(function (remove) { remove(); });
      if (host.parentNode === container) host.remove();
    }
    const pack = lesson && data.find(function (entry) { return entry.day === Number(lesson.day); });
    if (!pack || !Array.isArray(lesson.grammar) || lesson.grammar.length !== pack.points.length ||
        pack.points.some(function (point, index) { return !lesson.grammar[index] || lesson.grammar[index].quote !== point.quote; })) {
      host.append(node('p', 'grammar-coach-notice', '本课语法内容尚未匹配。请检查课号及原句版本；此处不会套用其他课的答案。'));
      return dispose;
    }
    host.append(node('h3', '', '把长句拆成能理解的小块'));
    host.append(node('p', 'grammar-coach-intro', '每课 3 个语法点，每点 2 道练习。先读原句、找谁做什么，再完成形式选择与规则辨析。练习只反馈当前知识点，不代表雅思评分。'));
    const guide = node('details', 'grammar-coach-basics');
    guide.append(node('summary', '', '零基础先看：六个术语怎么理解'));
    const glossary = node('dl', 'grammar-coach-glossary');
    [
      ['主语', '句子主要在说谁／什么，例如 She reads 中的 She。'],
      ['谓语', '说明主语做什么或是什么，例如 She reads 中的 reads；is happy 的谓语含 is。'],
      ['宾语', '动作涉及的对象，例如 read a book 中的 a book。'],
      ['从句', '放在大句子里的小句子，通常有自己的主语和谓语。'],
      ['分词与动名词', '都可能出现 -ing；过去分词常见 -ed，也有 written 等不规则形式。先看它在句中做什么，别只看词尾。'],
      ['逻辑主语', '实际做或承受某个动作的对象。拆分短语时核对它与主句是否一致。']
    ].forEach(function (item) { glossary.append(node('dt', '', item[0]), node('dd', '', item[1])); });
    guide.append(glossary, node('p', '', '原课编号不是零基础学习顺序。前 8 周先按每日计划学习字母、基础句型和常用时态；遇到独立主格、倒装等结构，可先理解原句，再逐步练习，不要求立刻用于写作。'));
    host.append(guide);
    const results = new Map();
    const status = node('p', 'grammar-coach-progress', '本次已核对 0 / 6 题。');
    status.setAttribute('role', 'status');
    host.append(status);
    function updateProgress() {
      let right = 0;
      results.forEach(function (value) { if (value) right++; });
      status.textContent = '本次已核对 ' + results.size + ' / 6 题；答对 ' + right + ' 题。查看解析后，请回到原文找相同结构。';
    }
    pack.points.forEach(function (point, index) {
      const card = node('details', 'grammar-coach-point');
      card.open = index === 0;
      card.append(node('summary', '', (index + 1) + '. ' + point.title));
      const body = node('div', 'grammar-coach-body');
      const quote = node('blockquote', 'grammar-coach-quote', point.quote);
      quote.setAttribute('lang', 'en');
      body.append(quote, node('p', 'grammar-coach-source', '原句要点：' + point.sourceExplanation));
      const parts = node('dl', 'grammar-coach-analysis');
      [['一句话理解', point.explanation], ['结构', point.pattern], ['本句拆分', point.analysis], ['常见错因', point.mistake]]
        .forEach(function (item) { parts.append(node('dt', '', item[0]), node('dd', '', item[1])); });
      body.append(parts);
      point.exercises.forEach(function (exercise, exerciseIndex) {
        const evidence = root.IELTSLearningBridge?.create({materialId:exercise.id,materialVersion:"1",title:point.title+" · "+exercise.prompt,skill:"grammar",taskId:"grammar",source:"lesson-grammar",unit:"题"});
        const form = node('form', 'grammar-coach-exercise');
        const fieldset = node('fieldset');
        fieldset.append(node('legend', '', '练习 ' + (exerciseIndex + 1) + ' · ' + exercise.prompt));
        const radios = [];
        exercise.options.forEach(function (option, optionIndex) {
          const label = node('label', 'grammar-coach-option');
          const radio = node('input');
          radio.type = 'radio';
          radio.name = 'grammar-' + serial + '-' + exercise.id;
          radio.value = option;
          radio.id = radio.name + '-' + optionIndex;
          radios.push(radio);
          label.append(radio, node('span', '', option));
          fieldset.append(label);
        });
        const feedback = node('p', 'grammar-coach-feedback');
        feedback.id = 'grammar-feedback-' + serial + '-' + exercise.id;
        feedback.setAttribute('aria-live', 'polite');
        fieldset.setAttribute('aria-describedby', feedback.id);
        const controls = node('div', 'grammar-coach-controls');
        const check = node('button', 'grammar-coach-button', '核对答案');
        check.type = 'submit';
        const reveal = node('button', 'grammar-coach-button grammar-coach-secondary', '查看答案与解析');
        reveal.type = 'button';
        controls.append(check, reveal);
        form.append(fieldset, controls, feedback);
        listen(form, 'submit', function (event) {
          event.preventDefault();
          const selected = radios.find(function (radio) { return radio.checked; });
          const result = grade(exercise, selected ? selected.value : '');
          if (!result.answered) {
            feedback.className = 'grammar-coach-feedback';
            feedback.textContent = '先选择一个答案，再核对。';
            return;
          }
          results.set(exercise.id, result.correct);
          if(evidence)root.IELTSLearningBridge.report(evidence.submit({answer:selected.value,score:result.correct?1:0,feedback:result.explanation}),feedback);
          feedback.className = 'grammar-coach-feedback ' + (result.correct ? 'is-correct' : 'is-incorrect');
          feedback.textContent = (result.correct ? '答对了。' : '再看一遍句子。正确答案：' + result.answer + '。') + '解析：' + result.explanation;
          updateProgress();
        });
        listen(reveal, 'click', function () {
          evidence?.expose();
          feedback.className = 'grammar-coach-feedback';
          feedback.textContent = '答案：' + exercise.answers.join(' / ') + '。解析：' + exercise.explanation + '（查看答案不计为作答。）';
        });
        radios.forEach(function (radio) {
          listen(radio, 'change', function () {
            results.delete(exercise.id);
            feedback.textContent = '';
            feedback.className = 'grammar-coach-feedback';
            updateProgress();
          });
        });
        body.append(form);
      });
      card.append(body);
      host.append(card);
    });
    return dispose;
  }

  const api = Object.freeze({data: data, grade: grade, mount: mount});
  root.IELTSGrammar = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
