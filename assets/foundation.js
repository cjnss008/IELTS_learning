(function (root) {
  'use strict';
  function question(prompt, answer, wrongA, wrongB, explanation) {
    return {prompt: prompt, answer: answer, options: [answer, wrongA, wrongB], explanation: explanation};
  }
  const units = [
    {
      week: 1, title: '字母、声音与自我介绍', goal: '认读字母名，区分字母名与单词中的声音；用 I am / You are 写出姓名和身份。',
      lessons: [
        {title: '先分清字母名字与词里的声音', text: '英语有 26 个字母，分大小写。字母 A 的名字是 /eɪ/，但在 cat 中常读 /æ/。字母名用于拼写姓名；读单词要学该词的发音，不能把字母名直接连起来。下面的音标是发音提示，不是要求本周背完的术语。', examples: [['My name is Anna.', '我的名字是 Anna。字母 A 与 a 是同一个字母的大小写。'], ['A, B, C, D, E, F, G.', '先认字母顺序，再尝试打乱顺序认读。'], ['cat, name', 'cat 中 a 常读 /æ/；name 中 a 常读 /eɪ/。同一个字母可有不同声音。']]},
        {title: '26 个字母名与短数字', text: '英式字母名提示：A /eɪ/；B /biː/；C /siː/；D /diː/；E /iː/；F /ef/；G /dʒiː/；H /eɪtʃ/；I /aɪ/；J /dʒeɪ/；K /keɪ/；L /el/；M /em/；N /en/；O /əʊ/；P /piː/；Q /kjuː/；R /ɑː/；S /es/；T /tiː/；U /juː/；V /viː/；W /ˈdʌbəl juː/；X /eks/；Y /waɪ/；Z /zed/。先分组认读，重点比较 E / I、B / V、G / J。', examples: [['zero, one, two, three, four, five, six, seven, eight, nine, ten', '0—10：先跟读，再遮住文字按乱序辨认。'], ['eleven, twelve, thirteen, fourteen, fifteen, sixteen, seventeen, eighteen, nineteen, twenty', '11—20：注意 fifteen 的拼写，不写 fiveteen。']]},
        {title: '谁 + 是什么：I am / You are', text: 'I 表“我”，you 表“你／你们”。am / are 是 be 动词的形式，连接身份或状态。I 用 am，you 用 are；不要在两者之间再加 is。英文 I 永远大写，句首大写，句末加句号。', examples: [['I am Anna.', '我是 Anna。I 是主语，am 连接姓名。'], ['You are a student.', '你是一名学生。a student 表一名学生。'], ["I am ready. I'm ready.", '两句都表示“我准备好了”。I’m 是 I am 的缩写。']]}
      ], readingTitle: '第一次见面', reading: [['Hello. I am Anna.', '你好。我是 Anna。'], ['Hello, Anna. I am Ben.', '你好，Anna。我是 Ben。'], ['I am a student.', '我是一名学生。'], ['You are a student. I am a student, too.', '你是学生。我也是学生。']],
      practice: ['抄写 26 个大小写字母，遮住范例后再写一次。', '拼读自己的名字；将姓名中的字母乱序认读。', '用 I am… 写两句，再用 You are… 写一句。先读懂每句，再重复跟读。'],
      questions: [
        question('I ____ Anna.', 'am', 'are', 'is', '主语 I 与 am 搭配，表达“我是 Anna”。'),
        question('You ____ a student.', 'are', 'am', 'is', 'you 与 are 搭配，不因中文“你”是一个人就用 is。'),
        question('哪一句大小写正确？', 'I am Ben.', 'i am Ben.', 'I am ben.', '代词 I 永远大写，姓名 Ben 的首字母也要大写。'),
        question('字母 A 的名字是什么？', '/eɪ/', '/biː/', '/siː/', 'A 的字母名是 /eɪ/；B 为 /biː/，C 为 /siː/。字母名不等于它在所有词里的发音。'),
        question('字母 A 在每个单词中都读同一个音吗？', '不是，要结合单词学习', '是，永远读字母名', '只要大写就不发音', '例如 cat 和 name 中 a 的声音不同；不要把字母名直接拼成单词发音。'),
        question('数字 12 的英文是：', 'twelve', 'twenty', 'two', 'twelve 是 12；twenty 是 20；two 是 2。'),
        question('I’m 是什么的缩写？', 'I am', 'I are', 'I is', '撇号替代被省去的字母，I’m = I am。'),
        question('根据小对话，Anna 和 Ben 都是：', 'students', 'teachers', 'doctors', 'Anna 说 I am a student；Ben 也说 I am a student, too，too 表“也”。')
      ]
    },
    {
      week: 2, title: '身边的人与物', goal: '用 he / she / it 与 is 介绍人物和物品；认识 this / that 及 a / an。',
      lessons: [
        {title: 'he / she / it 都可以和 is 搭配', text: 'he 常指男性，she 常指女性，it 常指物品或动物。它们在这里都用 is。姓名也可作主语：Mia is a student。先看句子在说谁／什么，再选代词。', examples: [['He is Ben. She is Mia.', '他是 Ben。她是 Mia。'], ['It is a book.', '它是一本书。it 指物品，is 连接说明。']]},
        {title: 'a / an 表一个，先听后面的声音', text: '一个未特指的可数名词常用 a / an。辅音音素开头通常用 a，元音音素开头通常用 an。判断依据是声音，不只是字母。先掌握 a book、an apple；以后再学 an hour、a university 等例外拼写。', examples: [['This is a book.', '这是一本书。book 以 /b/ 开头。'], ['That is an apple.', '那是一个苹果。apple 以元音 /æ/ 开头。']]},
        {title: 'this 与 that：指近处和远处', text: 'this 常指较近的一件东西，that 常指较远的一件。都可接 is。名词前的形容词描述特点：a red bag 是一个红色的包，red 不需要因 bag 单数而变化。', examples: [['This is a red bag.', '这是一个红色的包。'], ['That is a small desk.', '那是一张小桌子。']]}
      ], readingTitle: 'Mia 的书桌', reading: [['This is Mia. She is a student.', '这是 Mia。她是一名学生。'], ['This is a book. It is new.', '这是一本书。它是新的。'], ['That is an apple. It is red.', '那是一个苹果。它是红色的。'], ['Ben is here. He is Mia’s friend.', 'Ben 在这里。他是 Mia 的朋友。']],
      practice: ['为身边五件物品写 a / an 标签，并读出名称。', '用 This is… 和 That is… 分别介绍近处和远处物品。', '用 he / she / it 改写三个已经读懂的介绍句。'],
      questions: [
        question('Mia is a student. ____ is a student.', 'She', 'He', 'It', '对话中 Mia 是女性，用 she 指代。'),
        question('It ____ a book.', 'is', 'am', 'are', 'it 在基础现在时介绍句中与 is 搭配。'),
        question('This is ____ apple.', 'an', 'a', 'are', 'apple 以元音音素 /æ/ 开头，用 an。'),
        question('That is ____ book.', 'a', 'an', 'is', 'book 以辅音音素 /b/ 开头，用 a。'),
        question('通常介绍手里这件东西时，可以说：', 'This is a bag.', 'Those are bags.', 'They am a bag.', 'this 常指近处的单个对象；本周先掌握 this is。'),
        question('Ben 是男性，用哪个词替代 Ben？', 'he', 'she', 'it', 'he 常指男性；she 常指女性；it 在本单元主要指物品。'),
        question('“一个红色的包”的正常词序是：', 'a red bag', 'a bag red', 'red a bag', '形容词 red 在名词 bag 前，冠词 a 位于整个名词短语前。'),
        question('小短文中 apple 是什么颜色？', 'red', 'blue', 'green', 'That is an apple. It is red. 中 it 指 apple，所以苹果是红色的。')
      ]
    },
    {
      week: 3, title: '家庭、数量与拥有', goal: '区分一个与多个，用 we / they、are、have / has 及 my / your / his / her 写家庭和物品信息。',
      lessons: [
        {title: '多个对象：we / they + are', text: 'we 表“我们”，they 表“他们／她们／它们”。两者都用 are。多数可数名词复数加 -s；以 -s、-sh 等结尾常加 -es。先熟记 book → books、box → boxes，不把这一条套到所有名词。', examples: [['We are students. They are friends.', '我们是学生。他们是朋友。'], ['one book, two books; one box, two boxes', '一本书，两本书；一个盒子，两个盒子。']]},
        {title: '谁拥有：have 与 has', text: 'I / you / we / they 用 have；he / she / it 在一般现在时肯定句中用 has。my / your / his / her 放在名词前说明“谁的”，例如 her book，而不是 her a book。', examples: [['I have two books. She has one book.', '我有两本书。她有一本书。'], ['This is my bag. That is her book.', '这是我的包。那是她的书。']]},
        {title: '年龄和数量：把数字放回句子', text: '整十数：twenty 20、thirty 30、forty 40、fifty 50、sixty 60、seventy 70、eighty 80、ninety 90；one hundred 是 100。21 可写 twenty-one。年龄用 be：He is twenty；英语不说 He has twenty 表年龄。', examples: [['My father is forty. My mother is thirty-nine.', '我父亲四十岁，母亲三十九岁。'], ['We have twenty books.', '我们有二十本书。']]}
      ], readingTitle: '一家人的学习用品', reading: [['We are a family of three.', '我们一家有三个人。'], ['My mother has a blue bag.', '我妈妈有一个蓝色的包。'], ['My father has two books.', '我爸爸有两本书。'], ['I have three pens. They are black.', '我有三支笔。它们是黑色的。']],
      practice: ['写一份五项学习用品清单，给每项加数量。', '用 my / his / her 介绍两位家人拥有的东西。', '读出 20—100 的整十数，再练习 21、34、48 等组合。'],
      questions: [
        question('We ____ students.', 'are', 'is', 'am', 'we 为复数人称代词，搭配 are。'),
        question('She ____ one book.', 'has', 'have', 'having', '一般现在时肯定句中 she 用 has。'),
        question('They ____ two bags.', 'have', 'has', 'is', 'they 用 have；has 对应 he / she / it 等第三人称单数。'),
        question('two ____', 'boxes', 'box', 'boxs', 'box 的规则复数是 boxes，需加 -es。'),
        question('“她的书”应写：', 'her book', 'she book', 'her a book', 'her 放在名词前表所属；she 是主语形式；这里不同时加 a。'),
        question('数字 40 的标准拼写是：', 'forty', 'fourty', 'fourteen', '40 拼作 forty；fourteen 是 14，不是 40。'),
        question('表达“他二十岁”应选：', 'He is twenty.', 'He has twenty.', 'He are twenty.', '英语描述年龄用 be，这里 he 配 is。'),
        question('根据短文，谁有三支笔？', '叙述者 I', '母亲', '父亲', 'I have three pens. 明确说明是叙述者有三支笔。')
      ]
    },
    {
      week: 4, title: '基础回顾与简单问答', goal: '把 be 陈述句改为否定和疑问；用 what / who 提问，并给简短回答。',
      lessons: [
        {title: '否定：在 be 后加 not', text: 'I am not…；you are not…；he / she / it is not…。is not 可缩写 isn’t，are not 可缩写 aren’t。不要在这个结构中插入 do。', examples: [['I am not a teacher.', '我不是老师。'], ['She is not tired. She isn’t tired.', '她不累。两句含义相同。']]},
        {title: '一般疑问：把 be 放到主语前', text: 'You are a student. → Are you a student? 问句把 are 前移，其他内容保持。简短回答用 Yes, I am. 或 No, I am not. 注意询问 you，回答自己时改为 I。', examples: [['Is he a student? Yes, he is.', '他是学生吗？是的。'], ['Are they ready? No, they aren’t.', '他们准备好了吗？没有。']]},
        {title: 'what 问什么，who 问谁', text: 'What is this? 问东西是什么；Who is she? 问人物是谁。What is your name? 问姓名。问句末尾用问号。回答要对应信息，不把 who 问句回答成物品。', examples: [['What is this? It is a book.', '这是什么？这是一本书。'], ['Who is she? She is my sister.', '她是谁？她是我姐姐／妹妹。']]}
      ], readingTitle: '教室门口的问答', reading: [['Are you a teacher?', '你是老师吗？'], ['No, I am not. I am a student.', '不，我不是。我是一名学生。'], ['Who is she?', '她是谁？'], ['She is my teacher. Her name is Lin.', '她是我的老师。她叫 Lin。'], ['Is she tired?', '她累了吗？'], ['No, she isn’t. She is ready.', '不，她不累。她准备好了。']],
      practice: ['把五句 be 陈述句分别改成否定句和疑问句。', '遮住回答，自己回答本页三组问题，再对照检查。', '更换姓名和身份写新对话，避免只记原题答案。'],
      questions: [
        question('She is a teacher. 的否定句是：', 'She is not a teacher.', 'She not is a teacher.', 'She does not is a teacher.', 'be 否定直接在 is 后加 not，不用 does。'),
        question('You are ready. 改为一般疑问句：', 'Are you ready?', 'You are ready.', 'Do you are ready?', '将 are 放到主语 you 前，句尾用问号。'),
        question('回答 Are you a student?（是的）', 'Yes, I am.', 'Yes, you am.', 'Yes, I is.', '别人问 you，自己回答时用 I；I 搭配 am。'),
        question('回答 Is he a teacher?（不是）', 'No, he isn’t.', 'No, he aren’t.', 'No, he not.', '简短否定保留 be，he 用 is not / isn’t。'),
        question('问“她是谁？”', 'Who is she?', 'What she is?', 'Who she are?', 'who 问人；be 问句将 is 放在 she 前。'),
        question('What is this? 最贴切的回答：', 'It is a book.', 'He is my brother.', 'I am twenty.', 'what is this 问物品是什么，回答它是一本书。'),
        question('aren’t 的完整形式是：', 'are not', 'am not', 'is not', 'aren’t = are not；isn’t = is not。'),
        question('根据对话，Lin 的身份是：', 'teacher', 'doctor', 'driver', 'She is my teacher. Her name is Lin. 把身份与姓名对应起来。')
      ]
    },
    {
      week: 5, title: '日常安排与习惯', goal: '用 I / you / we / they + 动词描述习惯；读懂简单时间表，并使用钟点与频率表达。',
      lessons: [
        {title: '一般现在时：说习惯，不是只说现在', text: 'I study English every day. 表示日常习惯。I / you / we / they 后通常用动词原形。不要机械插入 am：I am study 不正确。be 句和实义动词句要分开认识。', examples: [['I study English every day.', '我每天学英语。study 是主要动作。'], ['We read in the evening.', '我们晚上阅读。']]},
        {title: '时间表达：at + 钟点，on + 星期', text: 'at seven 表七点；on Monday 表星期一；in the morning / afternoon / evening 表早上／下午／晚上。at night 是常用搭配。每天、每周等 every… 短语通常不另加 in。', examples: [['I get up at seven.', '我七点起床。'], ['We study on Monday. We read every day.', '我们星期一学习。我们每天阅读。']]},
        {title: '频率词：事情多久发生一次', text: 'always 总是、usually 通常、sometimes 有时、never 从不。入门先将频率词放在一般实义动词前：I usually read…。它们在 be 句里常放在 be 后，以后再逐步比较。', examples: [['I usually study at nine.', '我通常九点学习。'], ['I sometimes walk after lunch.', '我有时午饭后散步。']]}
      ], readingTitle: '一个普通学习日', reading: [['I get up at seven. I eat breakfast at eight.', '我七点起床，八点吃早饭。'], ['I study English at nine.', '我九点学英语。'], ['In the afternoon, we read together.', '下午，我们一起阅读。'], ['I usually walk after dinner. I sleep at ten.', '我通常晚饭后散步，十点睡觉。']],
      practice: ['写自己的三项日常活动，分别标上时间。', '给同一个动作加 always / sometimes / never，观察意义变化。', '不看短文，说出叙述者的早上安排，再与文字核对。'],
      questions: [
        question('I ____ English every day.', 'study', 'am study', 'studies', 'I 在一般现在时习惯句中用 study；不能把 am 和原形 study 直接并用。'),
        question('I get up ____ seven.', 'at', 'on', 'in', '具体钟点用 at：at seven。'),
        question('We study ____ Monday.', 'on', 'at', 'to', '星期或具体某天常用 on，所以这里是 on Monday；at 通常搭配钟点。'),
        question('____ the morning, I read.', 'In', 'At', 'On', '固定时间表达 in the morning；具体日期的早上另有用法，本题不涉及。'),
        question('“我通常晚上阅读”的自然词序是：', 'I usually read in the evening.', 'I read usually am in the evening.', 'I am usually read in the evening.', '一般实义动词前可放 usually，句中不需要额外加 am。'),
        question('never 的意思是：', '从不', '总是', '通常', 'never 表频率为零或强烈否定习惯；不要误当作 usually。'),
        question('表达“每天”时本题应选：', 'every day', 'in every day', 'at every day', 'every day 通常直接作时间状语，不再加 in / at。'),
        question('根据短文，叙述者什么时候学习英语？', 'at nine', 'at seven', 'at ten', 'I study English at nine. 九点学习；七点起床，十点睡觉。')
      ]
    },
    {
      week: 6, title: '食物、喜好与能力', goal: '掌握 likes 与 does 问答；用 can / cannot 描述能力，用 and / but 连接信息。',
      lessons: [
        {title: '第三人称单数：肯定句的动词变化', text: 'I like rice. → She likes rice. 一般现在时中 he / she / it 常使动词加 -s；有些词需特殊变化，例如 go → goes。先记常见例句。', examples: [['I like rice. Ben likes bread.', '我喜欢米饭。Ben 喜欢面包。'], ['She goes to school at eight.', '她八点去学校。']]},
        {title: 'do / does 帮助问答，后面回到原形', text: 'Do you like rice? 用 do 提问 I / you / we / they；Does she like rice? 用 does 提问第三人称单数。does 已承担变化，like 不再加 -s。否定：I do not like…；She does not like…。', examples: [['Do you like tea? Yes, I do.', '你喜欢茶吗？是的。'], ['Does Ben like milk? No, he doesn’t.', 'Ben 喜欢牛奶吗？不喜欢。']]},
        {title: 'can 与连接词：能力也可以有限', text: 'can + 动词原形表示能做；cannot / can’t 表示不能。即使 he / she 作主语，can 后也不加 -s，不加 to。and 加相关信息；but 表转折。', examples: [['She can swim. She cannot drive.', '她会游泳，不会开车。'], ['I like tea and milk, but I do not like coffee.', '我喜欢茶和牛奶，但不喜欢咖啡。']]}
      ], readingTitle: 'Ben 的午餐与爱好', reading: [['Ben likes rice and vegetables.', 'Ben 喜欢米饭和蔬菜。'], ['He does not like coffee, but he likes tea.', '他不喜欢咖啡，但喜欢茶。'], ['Can he cook? Yes, he can.', '他会做饭吗？会。'], ['His sister can swim, but she cannot drive.', '他的姐姐／妹妹会游泳，但不会开车。']],
      practice: ['询问一位家人喜欢什么，再用 he / she 转述。', '写两项自己能做的事和一项还不会做的事。', '用 and / but 将两组句子连起来，检查逻辑关系。'],
      questions: [
        question('Ben ____ bread.', 'likes', 'like', 'liking', 'Ben 是第三人称单数，肯定句动词为 likes。'),
        question('Does she ____ tea?', 'like', 'likes', 'to like', 'does 已表示第三人称单数，后面的主要动词回到原形 like。'),
        question('____ you like rice?', 'Do', 'Does', 'Are', '实义动词 like 的一般现在时问句，you 用 Do。'),
        question('She ____ not like coffee.', 'does', 'do', 'is', '第三人称单数否定用 does not + 动词原形。'),
        question('He can ____.', 'swim', 'swims', 'to swim', '情态动词 can 后用原形，不能加 -s 或 to。'),
        question('cannot 表示：', '不能／不会', '总是会', '刚刚做完', 'cannot 是 can 的否定，可缩写 can’t。'),
        question('I like tea, ____ I do not like coffee.', 'but', 'because of', 'am', '前后喜好对比，用 but；and 是添加，本题用 but 最清楚。'),
        question('短文中 Ben 的姐姐／妹妹不会做什么？', 'drive', 'swim', 'read', 'she can swim, but she cannot drive，否定信息对应 drive。')
      ]
    },
    {
      week: 7, title: '地点、方向与正在发生的事', goal: '用 there is / are 介绍地点；用地点介词和现在进行时描述眼前画面；理解简短路线指令。',
      lessons: [
        {title: '某处有：there is / there are', text: 'there is + 一个可数单数或不可数名词；there are + 可数复数。和 have 的角度不同：I have a book 说我拥有；There is a book on the desk 说桌上有一本书。', examples: [['There is a book on the desk.', '桌上有一本书。'], ['There are two chairs in the room.', '房间里有两把椅子。']]},
        {title: '位置与路线：把词对应到空间', text: 'in 在里面，on 在表面上，under 在下面，next to 在旁边。祈使句可直接从动词原形开始：Turn left. 通常省略听话者 you。路线指令要顺序清晰。', examples: [['The bag is under the desk.', '包在桌子下面。'], ['Go straight. Turn left. The library is next to the school.', '直走。左转。图书馆在学校旁边。']]},
        {title: '正在做：am / is / are + doing', text: 'I am reading 表“我正在阅读”。句中不能丢掉 be；也不能在 is 后仍用原形 read。常见变化：read → reading；write → writing（去末尾不发音 e）；sit → sitting（双写 t）。', examples: [['I am reading. She is writing.', '我正在读书。她正在写字。'], ['They are sitting near the window.', '他们正坐在窗边。']]}
      ], readingTitle: '安静的阅览室', reading: [['There are two tables in the room.', '房间里有两张桌子。'], ['A bag is under one table.', '一只包在其中一张桌子下面。'], ['Ben is reading a book. Mia is writing.', 'Ben 正在读书，Mia 正在写字。'], ['The door is next to the window.', '门在窗户旁边。']],
      practice: ['用三个介词描述眼前的物品位置，并让他人按描述寻找。', '描述一幅图片中的三个人正在做什么。', '为一张简单手绘地图写两到三条路线指令。'],
      questions: [
        question('There ____ two chairs in the room.', 'are', 'is', 'am', 'two chairs 是复数，所以用 there are。'),
        question('There ____ a book on the desk.', 'is', 'are', 'have', 'a book 是单数，使用 there is。'),
        question('“包在桌子下面”中的“下面”是：', 'under', 'on', 'in front', 'under 表在……下面；on 表在表面上。'),
        question('She ____ writing.', 'is', 'does', 'can', '现在进行时为 is + writing；can 后则必须用原形 write。'),
        question('They are ____ near the window.', 'sitting', 'sit', 'siting', 'sit 的 -ing 形式双写 t：sitting。'),
        question('write 的 -ing 形式是：', 'writing', 'writeing', 'writting', '去掉不发音的末尾 e，再加 -ing，得到 writing。'),
        question('“向左转”的简短指令是：', 'Turn left.', 'Turning left is.', 'You is left.', '祈使句可直接用动词原形 Turn，省略 you。'),
        question('根据短文，Mia 正在做什么？', 'writing', 'reading', 'driving', 'Mia is writing. Ben 才是在 reading a book。')
      ]
    },
    {
      week: 8, title: '过去、计划与入门复测', goal: '用 was / were 和常见过去式说昨天；用 be going to 说计划；用 because 解释简单原因。',
      lessons: [
        {title: '过去的状态：was / were', text: 'was 是 am / is 常见的过去形式，were 是 are 的过去形式：I / he / she / it 用 was，you / we / they 用 were。时间词 yesterday 表昨天。不要同时使用 was 和 am。', examples: [['I was tired yesterday.', '我昨天很累。'], ['We were at home last night.', '我们昨晚在家。']]},
        {title: '过去的动作：常见规则与不规则', text: '不少动作过去式加 -ed，如 walk → walked；常见不规则词要与例句一起记：go → went、eat → ate、have → had。一般过去谈结束的过去，不需要每个动作都加 was。', examples: [['I walked to the park yesterday.', '我昨天走路去了公园。'], ['She went home and ate dinner.', '她回家并吃了晚饭。']]},
        {title: '未来计划与原因：be going to / because', text: 'be going to + 动词原形表达计划：I am going to study。根据主语选 am / is / are。because 后接完整原因句；中文的“因为……所以……”不必在英语中同时写 because 和 so。', examples: [['We are going to study tomorrow.', '我们计划明天学习。'], ['I study English because I want to travel.', '我学英语，因为我想旅行。']]}
      ], readingTitle: '昨天与明天', reading: [['Yesterday, I was at home. I read a short book.', '昨天我在家。我读了一本短书。这里 read 是过去形式，通常读 /red/。'], ['My sister went to the park.', '我的姐姐／妹妹去了公园。'], ['Tomorrow, we are going to visit our teacher.', '明天，我们计划拜访老师。'], ['We are going to practise English because we want to learn together.', '我们计划练习英语，因为我们想一起学习。']],
      practice: ['写两句昨天的状态或活动，再写两句明天计划；标明时间词。', '用 because 给一个学习安排补充原因，检查原因中是否有主语和谓语。', '换用未练过的人物与时间信息完成新问答；重做错误类型，基础自检不能替代阶段能力测评。'],
      questions: [
        question('I ____ tired yesterday.', 'was', 'were', 'am was', 'I 的过去状态用 was，不与 am 同时出现。'),
        question('They ____ at home last night.', 'were', 'was', 'is', 'they 在过去 be 句中用 were。'),
        question('go 的常见过去式是：', 'went', 'goed', 'gone is', 'go 的过去式是不规则形式 went；gone 是过去分词，以后在完成结构中学习。'),
        question('I ____ to the park yesterday.（walk）', 'walked', 'was walk', 'walking', '一般过去的规则形式为 walked；不需要额外添加 was。'),
        question('She is going to ____ tomorrow.', 'study', 'studies', 'studying', 'be going to 后接动词原形 study。'),
        question('We ____ going to visit our teacher.', 'are', 'is', 'am', 'be going to 中的 be 随主语变化，we 对应 are。'),
        question('I study English ____ I want to travel.', 'because', 'because of', 'so because', 'because 后接完整原因句 I want to travel；because of 通常后接名词短语。'),
        question('根据短文，明天的计划是：', 'visit their teacher', 'go to the park alone', 'stay at home yesterday', 'Tomorrow, we are going to visit our teacher. 明确指明未来计划；去公园属于姐姐／妹妹的过去活动。')
      ]
    }
  ];

  units.forEach(function (unit) {
    unit.questions.forEach(function (item, index) {
      item.id = 'f' + unit.week + '-' + (index + 1);
      const shift = (unit.week + index) % 3;
      item.options = item.options.slice(shift).concat(item.options.slice(0, shift));
    });
  });
  const bank = new Map(units.flatMap(function (unit) { return unit.questions.map(function (item) { return [item.id, item]; }); }));
  function deepFreeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; }
  deepFreeze(units);
  function plain(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    return Object.values(Object.getOwnPropertyDescriptors(value)).every(function (d) { return !d.get && !d.set; });
  }
  function createState() { return {schema: 1, selectedWeek: 1, answers: {}}; }
  function parseState(raw) {
    if (typeof raw === 'string' && raw.length > 131072) throw new Error('基础入门记录过大。');
    let value;
    try { value = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { throw new Error('基础入门记录不是有效 JSON。'); }
    if (!plain(value) || Object.keys(value).some(function (key) { return !['schema', 'selectedWeek', 'answers'].includes(key); }) || value.schema !== 1 || !Number.isInteger(value.selectedWeek) || value.selectedWeek < 1 || value.selectedWeek > 8 || !plain(value.answers)) {
      throw new Error('基础入门记录结构或版本无效。');
    }
    const answers = {};
    Object.entries(value.answers).forEach(function (entry) {
      const item = bank.get(entry[0]);
      if (!item || typeof entry[1] !== 'string' || !item.options.includes(entry[1])) throw new Error('基础入门记录包含未知题目或无效答案。');
      answers[entry[0]] = entry[1];
    });
    return {schema: 1, selectedWeek: value.selectedWeek, answers: answers};
  }
  function grade(item, answer) { return Boolean(item && typeof answer === 'string' && item.answer === answer); }
  function persistState(storage, key, expectedRaw, candidate) {
    const next = parseState(candidate);
    if (storage.getItem(key) !== expectedRaw) throw new Error('其他页面已更新基础入门记录，请刷新后再保存。');
    const raw = JSON.stringify(next);
    storage.setItem(key, raw);
    return {state: next, raw: raw};
  }

  function init() {
    const doc = root.document;
    const app = doc && doc.getElementById('foundationApp');
    if (!app) return;
    const $ = function (id) { return doc.getElementById(id); };
    const parameters = new URLSearchParams(root.location.search);
    const preview = parameters.get('preview') === '1';
    const key = preview ? 'ielts52-foundation-preview-v1' : 'ielts52-foundation-v1';
    let storage = null, raw = null, state = createState(), blocked = false;
    let voice = null, speech = null;
    function status(message, warning) { $('foundationStorage').textContent = message; $('foundationStorage').className = 'foundation-storage' + (warning ? ' is-warning' : ''); }
    try {
      storage = preview ? root.sessionStorage : root.localStorage;
      raw = storage.getItem(key);
      if (raw !== null) state = parseState(raw);
    } catch (_) { blocked = true; status('无法读取已有记录，原记录未覆盖。可以继续练习，但本页的新答案仅临时保留；请通过数据备份检查后再刷新。', true); }
    const requestedWeek = parameters.get('week');
    if (/^[1-8]$/.test(requestedWeek || '')) state.selectedWeek = Number(requestedWeek);
    function save(candidate) {
      const next = parseState(candidate);
      if (!blocked) {
        try { const saved = persistState(storage, key, raw, next); state = saved.state; raw = saved.raw; status(preview ? '已保存到本次预览会话。' : '已保存到当前浏览器。', false); return true; }
        catch (_) { blocked = true; status('保存失败或其他页面已更新记录。原记录未被本页覆盖；新答案仅临时保留，请先备份现有记录再刷新。', true); }
      }
      state = next;
      return false;
    }
    function node(tag, className, text) { const element = doc.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; }
    function stopSpeech() { if (speech) speech.cancel(); }
    try { speech = root.speechSynthesis || null; } catch (_) { speech = null; }
    function refreshVoices() {
      let voices = [];
      try { voices = speech ? speech.getVoices() : []; } catch (_) { voices = []; }
      voice = voices.find(function (v) { return /^en-GB$/i.test(v.lang); }) || voices.find(function (v) { return /^en(?:-|$)/i.test(v.lang); }) || null;
      const available = Boolean(voice && typeof root.SpeechSynthesisUtterance === 'function');
      app.querySelectorAll('.foundation-speak').forEach(function (button) { button.disabled = !available; });
      $('foundationStop').disabled = !available;
      $('foundationVoice').textContent = available ? '已找到英语合成声音。朗读仅作听读辅助，不评测发音。' : '当前没有可用的英语合成声音。可继续阅读与答题；在系统安装英语声音或更换支持的浏览器后重试。';
    }
    function example(line) {
      const box = node('div', 'foundation-example');
      const en = node('span', 'foundation-example-en', line[0]); en.lang = 'en';
      const cn = node('span', 'foundation-example-cn', line[1]);
      const button = node('button', 'foundation-speak', '合成朗读'); button.type = 'button';
      button.setAttribute('aria-label', '合成朗读：' + line[0]);
      button.addEventListener('click', function () {
        if (!voice || !speech || typeof root.SpeechSynthesisUtterance !== 'function') return;
        try {
          speech.cancel();
          const utterance = new root.SpeechSynthesisUtterance(line[0]); utterance.voice = voice; utterance.lang = voice.lang; utterance.rate = 0.85;
          utterance.onerror = function () { $('foundationVoice').textContent = '合成朗读未能播放。文字与答题仍可使用；请检查系统声音设置。'; };
          speech.speak(utterance);
        } catch (_) { $('foundationVoice').textContent = '合成朗读不可用，文字与答题仍可使用。'; }
      });
      box.append(en, cn, button); return box;
    }
    function updateProgress() {
      const entries = Object.entries(state.answers);
      const correct = entries.filter(function (entry) { return grade(bank.get(entry[0]), entry[1]); }).length;
      $('foundationProgress').textContent = '已核对 ' + entries.length + ' / 64 题；当前答案正确 ' + correct + ' 题。';
      const unit = units[state.selectedWeek - 1];
      const submitted = unit.questions.filter(function (item) { return Object.hasOwn(state.answers, item.id); });
      const local = $('foundationQuizStatus');
      if (local) local.textContent = '本单元已核对 ' + submitted.length + ' / 8 题；当前答案正确 ' + submitted.filter(function (item) { return grade(item, state.answers[item.id]); }).length + ' 题。';
    }
    function render() {
      stopSpeech();
      const unit = units[state.selectedWeek - 1];
      const target = $('foundationUnit'); target.replaceChildren();
      const heading = node('header', 'foundation-unit-heading');
      heading.append(node('p', 'eyebrow', 'WEEK ' + String(unit.week).padStart(2, '0')), node('h2', '', unit.title), node('p', '', unit.goal));
      target.append(heading);
      unit.lessons.forEach(function (lesson, index) {
        const section = node('section', 'foundation-section'); section.append(node('h3', '', (index + 1) + '. ' + lesson.title), node('p', '', lesson.text));
        lesson.examples.forEach(function (line) { section.append(example(line)); }); target.append(section);
      });
      const reading = node('section', 'foundation-section'); reading.append(node('h3', '', '把句子放进情境：' + unit.readingTitle));
      unit.reading.forEach(function (line) { reading.append(example(line)); }); target.append(reading);
      const apply = node('section', 'foundation-section'); apply.append(node('h3', '', '离开答案，再试一次')); const list = node('ul');
      unit.practice.forEach(function (instruction) { list.append(node('li', '', instruction)); }); apply.append(list); target.append(apply);
      const quiz = node('section', 'foundation-section foundation-quiz'); quiz.append(node('h3', '', '8 道基础自检：先选，再核对'));
      const quizStatus = node('p', 'foundation-quiz-status'); quizStatus.id = 'foundationQuizStatus'; quizStatus.setAttribute('role', 'status'); quiz.append(quizStatus);
      unit.questions.forEach(function (item, index) {
        const form = node('form'); const fieldset = node('fieldset'); fieldset.append(node('legend', '', (index + 1) + '. ' + item.prompt));
        const radios = [];
        item.options.forEach(function (option, optionIndex) {
          const label = node('label', 'foundation-option'); const input = node('input'); input.type = 'radio'; input.name = item.id; input.id = item.id + '-' + optionIndex; input.value = option;
          input.checked = state.answers[item.id] === option; radios.push(input); label.append(input, node('span', '', option)); fieldset.append(label);
        });
        const controls = node('div', 'foundation-controls');
        const check = node('button', 'button primary', '核对并保存'); check.type = 'submit';
        const reveal = node('button', 'button secondary', '查看答案与解析'); reveal.type = 'button'; controls.append(check, reveal);
        const feedback = node('p', 'foundation-feedback'); feedback.id = 'feedback-' + item.id; feedback.setAttribute('aria-live', 'polite'); fieldset.setAttribute('aria-describedby', feedback.id);
        function show(choice) { const correct = grade(item, choice); feedback.className = 'foundation-feedback ' + (correct ? 'is-correct' : 'is-error'); feedback.textContent = (correct ? '答对了。' : '正确答案：' + item.answer + '。') + '解析：' + item.explanation; }
        if (Object.hasOwn(state.answers, item.id)) show(state.answers[item.id]);
        form.addEventListener('submit', function (event) {
          event.preventDefault(); const selected = radios.find(function (radio) { return radio.checked; });
          if (!selected) { feedback.textContent = '先选择一个答案。'; return; }
          const candidate = parseState(state); candidate.answers[item.id] = selected.value; save(candidate); show(selected.value); updateProgress();
        });
        reveal.addEventListener('click', function () { feedback.className = 'foundation-feedback'; feedback.textContent = '答案：' + item.answer + '。解析：' + item.explanation + '（仅查看，不记录作答。）'; });
        radios.forEach(function (radio) { radio.addEventListener('change', function () { feedback.className = 'foundation-feedback'; feedback.textContent = '选择已更改，尚未核对。统计保留上次主动核对的答案。'; }); });
        form.append(fieldset, controls, feedback); quiz.append(form);
      });
      quiz.append(node('p', 'foundation-finish', '这些题只检查本页内容。答对后，请换一个人名、物品、时间或情境重新说写；若只能复述原题，继续练习，不把熟悉答案当作已掌握。'));
      target.append(quiz); updateProgress(); refreshVoices();
    }
    units.forEach(function (unit) { const option = node('option', '', '第 ' + unit.week + ' 周 · ' + unit.title); option.value = String(unit.week); $('foundationWeek').append(option); });
    $('foundationWeek').value = String(state.selectedWeek);
    $('foundationWeek').addEventListener('change', function () { const candidate = parseState(state); candidate.selectedWeek = Number($('foundationWeek').value); save(candidate); render(); });
    $('foundationStop').addEventListener('click', stopSpeech);
    $('foundationPreview').hidden = !preview;
    if (preview) doc.querySelectorAll('a[href$=".html"]').forEach(function (link) { link.href += '?preview=1'; });
    if (speech && typeof speech.addEventListener === 'function') speech.addEventListener('voiceschanged', refreshVoices);
    root.addEventListener('pagehide', stopSpeech);
    root.addEventListener('storage', function (event) { if (!preview && event.key === key && event.newValue !== raw) { blocked = true; status('其他页面已更改基础入门记录。为避免覆盖，请先备份现有记录再刷新；此页新答题仅临时保留。', true); } });
    render();
  }
  const api = Object.freeze({units: units, createState: createState, parseState: parseState, grade: grade, persistState: persistState});
  root.IELTSFoundation = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.document && root.document.getElementById('foundationApp')) init();
})(typeof window !== 'undefined' ? window : globalThis);
