'use strict';

// Authored locally: requiring this file performs no network request or file write.
// Keep answer (letter key) and answers (the full choice used by AssessmentCore)
// together. Only transcript is sent to speech synthesis; options contain IPA.
const numberNames = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const sharedInstructions = '这是原创基础听辨练习，不是官方雅思考试。它只核对听辨选项，不能从文字答案判断或评分你的发音。先隐藏原文，听每题的两遍口播再选择；听到 Choose your answer now（现在选择答案）后可主动暂停，选好再继续。提交后看解析并重听，错题隔天闭卷再做。';

function item(cue, a, b, answer, explanation, prompt) {
  return {cue, a, b, answer, explanation, prompt};
}

function makeMaterial(week, title, topic, focus, prompt, items) {
  const questions = items.map((raw, index) => {
    const options = ['A. ' + raw.a, 'B. ' + raw.b];
    if (!['A', 'B'].includes(raw.answer)) throw new Error('Invalid listening answer key');
    return {
      id: 'q' + (index + 1),
      type: 'single',
      prompt: '第 ' + (index + 1) + ' 题：' + (raw.prompt || prompt),
      options,
      answer: raw.answer,
      answers: [options[raw.answer === 'A' ? 0 : 1]],
      explanation: raw.explanation,
      evidence: raw.cue
    };
  });
  return {
    id: 'sounds-' + String(week).padStart(2, '0'),
    week,
    level: week === 1 ? 'A0' : 'A1',
    version: '1',
    skill: 'listening',
    pool: 'training',
    type: 'sounds',
    variant: 1,
    fullTest: false,
    title,
    topic,
    estimatedMinutes: 20,
    questionCount: questions.length,
    instructions: sharedInstructions + ' ' + focus,
    passage: '',
    transcript: 'Listen and choose. Each item is repeated. You can pause after each item.\n\n' +
      questions.map((question, index) =>
        'Number ' + numberNames[index] + '. Listen carefully.\n' +
        question.evidence + '\nAgain.\n' + question.evidence +
        '\nChoose your answer now. Take your time before the next item.'
      ).join('\n\n') + '\n\nThis is the end of the listening practice.',
    questions,
    rubric: {taskType: 'listening'},
    source: {
      kind: 'original',
      rights: '项目原创基础听辨题、口播与解析，可随本学习包使用；无外部试题或录音摘录。',
      verification: 'reviewed',
      method: '逐题核对口播文字、唯一答案、中文解析和必要词性语境；自动检查编号、选项、答案兼容与证据。合成音频仍须生成后试听；未经真人考生难度标定，不评价学习者发音。'
    },
    audio: '',
    audioVoice: '',
    audioSynthetic: true
  };
}

const materials = [
  makeMaterial(
    1, 'Letter Names: A, E, I, G and J', '字母名称 A / E / I / G / J',
    '本单元听字母名称，不是字母在单词里的读音。口播中的 capital 表示“大写字母”，只判断它后面的字母；有两个字母时按听到的先后顺序选择。A 的名称是 /eɪ/，E 是 /iː/，I 是 /aɪ/，G 是 /dʒiː/，J 是 /dʒeɪ/。斜杠内是辅助音标，不会出现在口播中。',
    '听字母名称，选出听到的字母或字母顺序。',
    [
      item('Capital E.', 'A', 'E', 'B',
        '听到的是字母 E 的名称 /iː/。A 的名称是 /eɪ/，开头和结尾的元音变化不同。'),
      item('Capital A.', 'A', 'I', 'A',
        '听到的是 A /eɪ/，不是 I /aɪ/。两者都是变化中的元音，但起始声音不同。'),
      item('Capital J.', 'G', 'J', 'B',
        '听到 J /dʒeɪ/。G /dʒiː/ 和 J 的开头相同，要继续听末尾的 /eɪ/ 与 /iː/。'),
      item('Capital I.', 'I', 'E', 'A',
        '听到 I /aɪ/，声音有明显变化；E 的名称 /iː/ 不含这个变化。'),
      item('Capital G.', 'J', 'G', 'B',
        '听到 G /dʒiː/。结尾是 /iː/，因此不选结尾为 /eɪ/ 的 J。'),
      item('Capital A. Capital E.', 'A — E', 'E — A', 'A',
        '先听到 A /eɪ/，再听到 E /iː/；两个字母都要记录，不能把顺序颠倒。'),
      item('Capital I. Capital G.', 'I — J', 'I — G', 'B',
        '第一个是 I /aɪ/，第二个是 G /dʒiː/。第二个字母末尾不是 J 的 /eɪ/。'),
      item('Capital J. Capital A.', 'J — A', 'G — A', 'A',
        '顺序是 J /dʒeɪ/、A /eɪ/。第一项的两个字母都与口播相符。')
    ]
  ),
  makeMaterial(
    2, 'Numbers: Fifteen or Fifty?', '数字与 -teen / -ty 对比',
    '选项同时给出数字和拼写。句末的 -teen 通常有较突出的 /tiːn/，-ty 结尾没有 /n/；同时注意整个词的重音。不能只凭“听起来更长”作答，数字在不同句子中的重音会变化。',
    '听数字，选出对应的一项。',
    [
      item('The number is fifteen.', '15 — fifteen', '50 — fifty', 'A',
        '口播是 fifteen（15），结尾可听到 /n/，本句末尾的 -teen 较突出；fifty（50）没有这个 /n/。'),
      item('The number is thirty.', '13 — thirteen', '30 — thirty', 'B',
        '听到 thirty（30），重音在前，结尾没有 thirteen（13）的 /tiːn/。'),
      item('The number is forty.', '40 — forty', '14 — fourteen', 'A',
        '听到 forty（40），不是 fourteen（14）。注意 forty 的结尾没有 /n/，拼写中也没有 u。'),
      item('The number is sixteen.', '60 — sixty', '16 — sixteen', 'B',
        '听到 sixteen（16），句末 -teen 的 /tiːn/ 包含 /n/；sixty（60）的末尾不是这个声音。'),
      item('The number is seventy.', '17 — seventeen', '70 — seventy', 'B',
        '听到 seventy（70），重音在前，末尾没有 seventeen（17）的 /n/。'),
      item('The number is eighteen.', '18 — eighteen', '80 — eighty', 'A',
        '听到 eighteen（18），末尾是 /tiːn/；eighty（80）没有结尾 /n/。'),
      item('The number is nineteen.', '90 — ninety', '19 — nineteen', 'B',
        '听到 nineteen（19），需要保留结尾 /n/ 这一条线索；ninety（90）的末尾不同。'),
      item('The number is twenty.', '20 — twenty', '12 — twelve', 'A',
        '听到 twenty（20），是两个音节；twelve（12）通常是一个音节，结尾有 /v/。')
    ]
  ),
  makeMaterial(
    3, 'Short and Long Vowels: Ship or Sheep?', '/ɪ/ 与 /iː/ 最小音对',
    '只判断 The word is（单词是）后面的目标词。/ɪ/ 如 ship，/iː/ 如 sheep；两者不仅有时长差别，也有舌位和音质差别。选项中的中文帮助理解词义，斜杠内的音标只作辅助。',
    '听目标单词，选出对应的词。',
    [
      item('The word is sheep.', 'ship — 船', 'sheep — 羊', 'B',
        '听到 sheep /ʃiːp/，中间是 /iː/；ship /ʃɪp/ 的元音较短且音质不同。'),
      item('The word is sit.', 'sit — 坐', 'seat — 座位', 'A',
        '听到 sit /sɪt/，中间是 /ɪ/；seat /siːt/ 的元音是 /iː/。'),
      item('The word is beat.', 'beat — 击打', 'bit — 一小块', 'A',
        '听到 beat /biːt/，中间是 /iː/；bit /bɪt/ 用 /ɪ/。'),
      item('The word is fill.', 'feel — 感觉', 'fill — 填满', 'B',
        '听到 fill /fɪl/，不是 feel /fiːl/。把注意力放在中间元音，不要只看拼写。'),
      item('The word is lip.', 'lip — 嘴唇', 'leap — 跳跃', 'A',
        '听到 lip /lɪp/，中间是 /ɪ/；leap /liːp/ 的中间元音为 /iː/。'),
      item('The word is leak.', 'lick — 舔', 'leak — 漏出', 'B',
        '听到 leak /liːk/，中间是 /iː/；lick /lɪk/ 的元音不同。'),
      item('The word is bean.', 'bin — 垃圾箱', 'bean — 豆子', 'B',
        '听到 bean /biːn/，不是 bin /bɪn/。两个词首尾辅音相同，区别在中间元音。'),
      item('The word is hill.', 'hill — 小山', 'heel — 脚后跟', 'A',
        '听到 hill /hɪl/，中间是 /ɪ/；heel /hiːl/ 的元音是 /iː/。')
    ]
  ),
  makeMaterial(
    4, 'Vowel Contrast: Bed or Bad?', '/e/ 与 /æ/ 最小音对',
    '只判断 The word is 后面的词。/e/ 如 bed，/æ/ 如 bad，后者通常张口更大。音标 /e/ 在这里表示 bed 的单元音，不是字母 A 名称中的 /eɪ/。本题只测能否听出两类声音。',
    '听目标单词，选出对应的词。',
    [
      item('The word is bed.', 'bed — 床', 'bad — 坏的', 'A',
        '听到 bed /bed/，不是 bad /bæd/。两词首尾辅音相同，中间元音不同。'),
      item('The word is pan.', 'pen — 钢笔', 'pan — 平底锅', 'B',
        '听到 pan /pæn/，中间是 /æ/；pen /pen/ 的中间元音为 /e/。'),
      item('The word is man.', 'man — 一个男人', 'men — 多个男人', 'A',
        '听到 man /mæn/，不是复数 men /men/。这里根据声音辨认词，不从人数语境猜测。'),
      item('The word is said.', 'sad — 难过的', 'said — 说过', 'B',
        '听到 said /sed/，中间是 /e/；sad /sæd/ 用 /æ/。said 的拼写不能直接推出字母 ai 的常见读音。'),
      item('The word is pat.', 'pet — 宠物', 'pat — 轻拍', 'B',
        '听到 pat /pæt/，不是 pet /pet/；区别在中间的 /æ/ 与 /e/。'),
      item('The word is head.', 'head — 头', 'had — 曾有', 'A',
        '听到 head /hed/，中间是 /e/；had 在本题的重读读法是 /hæd/。'),
      item('The word is sand.', 'sand — 沙子', 'send — 发送', 'A',
        '听到 sand /sænd/，不是 send /send/；两个词的 /s/ 和 /nd/ 相同。'),
      item('The word is lend.', 'land — 陆地', 'lend — 借出', 'B',
        '听到 lend /lend/，中间是 /e/；land /lænd/ 的中间元音为 /æ/。')
    ]
  ),
  makeMaterial(
    5, 'TH and Its Neighbours', 'thin / then 与 th 辅音对比',
    '/θ/ 如 thin，是不振动声带的 th；/ð/ 如 then，是振动声带的 th。它们分别不同于 /t/、/d/、/s/、/f/。thin /θɪn/ 与 then /ðen/ 的辅音、元音都不同，不把它们称为只差一个音的最小音对。只需听词选择，不需要提交录音。',
    '听目标单词，选出对应的词。',
    [
      item('The word is thin.', 'thin — 瘦的', 'then — 然后', 'A',
        '听到 thin /θɪn/，开头是无声 /θ/，中间是 /ɪ/；then /ðen/ 的两个声音都不同。'),
      item('The word is then.', 'thin — 瘦的', 'then — 然后', 'B',
        '听到 then /ðen/，开头是有声 /ð/，中间是 /e/；不能只凭看到 th 就认为它与 thin 同音。'),
      item('The word is three.', 'tree — 树', 'three — 三', 'B',
        '听到 three /θriː/，开头有 /θ/；tree /triː/ 的开头是短促的 /t/，不是同一个音。'),
      item('The word is tin.', 'tin — 锡', 'thin — 瘦的', 'A',
        '听到 tin /tɪn/，起音是短促的 /t/；thin /θɪn/ 的开头有持续摩擦声。'),
      item('The word is think.', 'think — 思考', 'sink — 下沉', 'A',
        '听到 think /θɪŋk/，不是 sink /sɪŋk/；要区分开头的 /θ/ 和 /s/。'),
      item('The word is they.', 'day — 一天', 'they — 他们', 'B',
        '听到 they /ðeɪ/，开头为有声 /ð/；day /deɪ/ 则以 /d/ 起音。'),
      item('Open your mouth.', 'mouse — 老鼠', 'mouth — 嘴', 'B',
        'Open your mouth 是“张开你的嘴”，其中 mouth 是名词 /maʊθ/，词尾为 /θ/；mouse /maʊs/ 的词尾是 /s/。',
        '听短句中最后一个词，选出对应的词。'),
      item('The word is free.', 'free — 自由的', 'three — 三', 'A',
        '听到 free /friː/，起音是 /f/；three /θriː/ 的起音是 /θ/，后面的 /riː/ 相同。')
    ]
  ),
  makeMaterial(
    6, 'Hear the Main Stress', '双音节词重音与名词／动词语境',
    '选项用连字符分音节，用大写表示重读，例如 TA-ble 表示第一音节重读，不是拼写差别。前六题只判断 The word is 后面的词；第七、八题听完整句，只判断 record。record 作名词和动词时常用重音不同，须结合句中词性。本单元不能用文字选项评价你的实际发音。',
    '听目标单词，选择主要重音位置；大写部分表示重读。',
    [
      item('The word is table.', 'TA-ble（第一音节）', 'ta-BLE（第二音节）', 'A',
        'table 的主要重音在第一音节：TA-ble。重读通常结合音高、清晰度、时长和力度判断，不只听音量。'),
      item('The word is about.', 'A-bout（第一音节）', 'a-BOUT（第二音节）', 'B',
        'about 的主要重音在第二音节，开头 a 通常弱读为 /ə/，所以选 a-BOUT。'),
      item('The word is teacher.', 'tea-CHER（第二音节）', 'TEA-cher（第一音节）', 'B',
        'teacher 的主要重音在第一音节：TEA-cher，第二音节较弱。'),
      item('The word is begin.', 'be-GIN（第二音节）', 'BE-gin（第一音节）', 'A',
        'begin 的主要重音在第二音节：be-GIN。不要因为第一个字母在句首大写就把它当重音。'),
      item('The word is window.', 'win-DOW（第二音节）', 'WIN-dow（第一音节）', 'B',
        'window 的主要重音在第一音节：WIN-dow。两项拼写代表同一个词，只比较重音位置。'),
      item('The word is hotel.', 'HO-tel（第一音节）', 'ho-TEL（第二音节）', 'B',
        '本题常用英式读法 hotel 的主要重音在第二音节：ho-TEL。听第二音节的突出程度。'),
      item('This is a record.', 'RE-cord（第一音节）', 're-CORD（第二音节）', 'A',
        '句子 This is a record 中，a 后面的 record 是名词（记录／唱片），常用读法 /ˈrekɔːd/ 重读第一音节。',
        '听完整句，只判断 record 的主要重音；大写部分表示重读。'),
      item('Please record the song.', 're-CORD（第二音节）', 'RE-cord（第一音节）', 'A',
        'Please record the song 是请求“请录下这首歌”；record 是动词，常用读法 /rɪˈkɔːd/ 重读第二音节。',
        '听完整句，只判断 record 的主要重音；大写部分表示重读。')
    ]
  ),
  makeMaterial(
    7, 'Hear the Endings', '复数 -s 与过去式 -ed 词尾',
    '前四题只判断名词复数 -s 添加的词尾，后四题只判断过去式 -ed 添加的词尾。/s/ 不振动声带，/z/ 振动声带；/t/ 与 /d/ 也是一组无声／有声对比。/ɪz/、/ɪd/ 各增加一个弱读音节；弱读元音也可接近 /ə/，题中把这类变体归为同一项。只判断录音，不要求模仿录音来取得分数。',
    '听名词复数，选择 -s 添加的词尾声音。',
    [
      item('The word is cats.', '/s/（不加音节）', '/z/（不加音节）', 'A',
        'cats 中，cat 的末音 /t/ 是无声辅音，所以复数词尾读 /s/，整词仍为一个音节。'),
      item('The word is dogs.', '/s/（不加音节）', '/z/（不加音节）', 'B',
        'dogs 中，dog 的末音 /ɡ/ 是有声辅音，所以复数词尾读 /z/，不增加音节。'),
      item('The word is buses.', '/ɪz/ 或 /əz/（增加一个弱读音节）', '/z/（不加音节）', 'A',
        'bus 以 /s/ 结尾，buses 的复数词尾要加一个弱读音节，通常记作 /ɪz/；不是只在 bus 后接 /z/。'),
      item('The word is books.', '/ɪz/ 或 /əz/（增加一个弱读音节）', '/s/（不加音节）', 'B',
        'book 的末音 /k/ 是无声辅音，books 的复数词尾读 /s/，不会增加一个弱读音节。'),
      item('The word is worked.', '/d/（不加音节）', '/t/（不加音节）', 'B',
        'work 以无声 /k/ 结尾，所以 worked 中 -ed 读 /t/，不是单独读出字母 e、d，也不增加音节。',
        '听过去式，选择 -ed 添加的词尾声音。'),
      item('The word is played.', '/d/（不加音节）', '/t/（不加音节）', 'A',
        'play 以元音结尾，played 中 -ed 读 /d/，不是 /t/，整词仍为一个音节。',
        '听过去式，选择 -ed 添加的词尾声音。'),
      item('The word is wanted.', '/d/（不加音节）', '/ɪd/ 或 /əd/（增加一个弱读音节）', 'B',
        'want 以 /t/ 结尾，wanted 中 -ed 增加一个弱读音节，通常记作 /ɪd/；所以 wanted 为两个音节。',
        '听过去式，选择 -ed 添加的词尾声音。'),
      item('The word is watched.', '/t/（不加音节）', '/ɪd/ 或 /əd/（增加一个弱读音节）', 'A',
        'watch 以无声 /tʃ/ 结尾，所以 watched 中 -ed 读 /t/，不增加音节。判断依据是末音，不是末尾字母 h。',
        '听过去式，选择 -ed 添加的词尾声音。')
    ]
  ),
  makeMaterial(
    8, 'Connected Phrases and Meaning', '辅音接元音、弱读与短语辨义',
    '英语词与词之间常没有停顿，前词末辅音会接向后词开头元音，例如 pick it up；a、of、can 等词也常弱读。按完整短语和句意选择，不能假设每个词之间都有空白。选项有英文和中文，不使用需要额外语境才能区分的同音短语。',
    '听完整短句，选出听到的短语及其意思。',
    [
      item('Please pick it up.', 'pick it up — 把它拿起来', 'put it down — 把它放下', 'A',
        '听到 pick it up，意思是“把它拿起来”。pick 的 /k/ 接向 it，it 的 /t/ 又接向 up，不能按书面空格寻找停顿。'),
      item('Turn it off, please.', 'turn it on — 把它打开', 'turn it off — 把它关掉', 'B',
        '录音中的完整短语是 turn it off，“把它关掉”。it 与 off 可接在一起，末尾的 off 与 on 区别明确。'),
      item('She gets up at eight.', 'gets up at eight — 八点起床', 'goes out at eight — 八点出门', 'A',
        '听到 gets up at eight，“八点起床”。gets 的末辅音接向 up，up 又可接向 at；口播没有说 goes out。'),
      item('Put it on the desk.', 'put it by the door — 把它放在门边', 'put it on the desk — 把它放在书桌上', 'B',
        '听到 put it on the desk。put、it、on 之间可连起来，地点明确是 the desk（书桌），不是 the door（门）。'),
      item('I need a cup of tea.', 'a cup of tea — 一杯茶', 'a glass of milk — 一杯牛奶', 'A',
        '听到 a cup of tea。a 常弱读为 /ə/，of 常弱读为 /əv/；但 cup 和 tea 仍给出“一杯茶”的明确意思。'),
      item('Please take a seat.', 'take a walk — 散步', 'take a seat — 坐下', 'B',
        '听到 take a seat，是“坐下”的礼貌说法。take 的末辅音可接向弱读的 a，目标词是 seat，不是 walk。'),
      item('Can I have it?', 'Can I give it? — 我可以把它给出去吗', 'Can I have it? — 我可以要它吗', 'B',
        '听到 Can I have it?，意思是“我可以要它吗”。can 与 I、have 与 it 可连起来；have 与 give 是不同的词。'),
      item('We have a lot of time.', 'a lot of time — 很多时间', 'a little time — 一点时间', 'A',
        '听到 a lot of time，“很多时间”。lot 的末辅音可接向弱读的 of；录音说的是 lot，不是 little。')
    ]
  )
];

module.exports = {materials};
