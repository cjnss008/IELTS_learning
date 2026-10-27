# 普通来源 v92 独立审查

本次只审固定来源包 `326c470151e2440bd002680d63e53ea9288f5ec12010057b8e8c2642acb53233`。六篇阅读适合继续编写普通理解练习；来源与工程核验未发现新增许可阻断或隐式激活。它们还不是可安装课程、独立储备卷或经过校准的测评。四个音文配对的官方许可证据支持按实际范围署名再用，听审、逐词对齐与音频切段仍待核。0 激活、0 掌握。

## 先冻独立阅读笔记

已在任何未来题目、题钥匙或解析进入本审查前，读完六份选定全文并冻结 `blind-reading-notes.json`（SHA256 `d3ca8c809850c493802ea6b1a8b2aed36a1abf4884115b34482801aa810a566d`）及可读版。第一阶段 manifest 为 `3690e4e79ad31afdb795d69ca0de692a733a5b3169483a59be2cb2715987f776`。48 项事实/因果、19 项指代均有精确原句、UTF16区间与句hash；另列每篇不能由本文判定的信息、词义边界与编辑风险。这些笔记没有因后来题目调整。未来题目/答案/详解尚未审查。

## 六篇真实正文与可教学范围

词数按包中明示的英文词 tokenizer 复算（字母词，可含撇号和连字符），不把数字单独算英文词。`engineering-audit.json` 同时留了简单空格词数供比较；不把某个词数定义当难度标定。

| 原始来源 | 选文词数 | 真实文本学习段词数 | 建议study分钟 | 可教的理解结构与边界 |
|---|---:|---|---:|---|
| [BLS Athletes](https://www.bls.gov/ooh/entertainment-and-sports/athletes-and-sports-competitors.htm) | 1100 | 445 / 370 / 285 | 30 | 比赛与日常工作的反差，训练—竞争—工作不稳定的因果，学历与经验的区别。保留了 About this section 与无表格的 largest employers 引导句，不能出雇主份额题；individual sports 列举 racecar driver 是原文表达问题。发布需另做显式编辑版本或避开该表达。 |
| [BLS Musicians](https://www.bls.gov/ooh/entertainment-and-sports/musicians-and-singers.htm) | 1114 | 444 / 411 / 259 | 30 | 表演场景、专业分工、兼职与找工压力、学历/持续训练/职业发展。雇主表未包含；不推出全体古典音乐家必有学位、每人必有代理。 |
| [NIMH Psychotherapies](https://www.nimh.nih.gov/health/topics/psychotherapies) | 676 | 407 / 269 | 25 | 定义—目标—方法例子，药物的 alternative/alongside，证据与审批的区别。只选三个主题；不借后文服务目录作答案，不要求学习者自诊或披露隐私。 |
| [NHGRI DNA](https://www.genome.gov/about-genomics/fact-sheets/Deoxyribonucleic-Acid-Fact-Sheet) | 870 | 426 / 444 | 30 | 位置/组成/功能、转录翻译次序、互补配对与模板比喻。原文 Scientist use 数一致错误尚在；六碱基示意眼色不能升级成真实人类眼色决定规律；蛋白编码基因与母系线粒体叙述有科普简化。按文理解与领域科学事实须分开，编辑必须新hash。 |
| [NIST Atomic Television](https://www.nist.gov/news-events/news/2022/08/watch-nists-atomic-television-live-and-color) | 485 | 412 / 73 | 25 | 原型的目的、信号链、光束大小/停留时间/带宽的因果。铷的本次实验与铯的旧实验、潜在用途与商业成品不可混同。保留2022报道时间语境。 |
| [CBO FY2025](https://www.cbo.gov/publication/61307) | 364 | 364 | 20 | 数量与百分比、赤字与债务、支付时点和数据修订的影响。是2025历史摘要，next calendar year 指2026；没有后续预测表与各税完整金额。是一篇短学习材料，不是完整Academic卷。 |

六篇合计4609词。选文是原文精确子串按顺序拼接，不是自编改写；DNA明确去掉响应式重复及未选择的历史节，NIMH截取首三个主题。六篇共155个自然段均能在保留官方raw页找到（仅移除Markdown显示语法、NIST的`(link is external)`界面文字并折叠空白）；10包 publisherBody→selected 的14条映射（其中6R为10条）则逐字节、UTF16和hash严格验证，未靠这种规范化放行正文改写。

两篇BLS的网页残留不需要虚构缺失的表来“补完整”；Root若清理必须生成新展示版本，保持原始来源与旧绑定可追溯。当前冻结原件不改。六份材料的B2/C1等标签是作者估计，没有标定结果；来源级别也不是其中某个词的CEFR。

## 许可范围与原音

2026-10-27通过Firecrawl以`maxAge:0`读取八份官方政策，均HTTP200。精确保存件、条款UTF16/hash与逐节目关联见 `rights-audit.json`。采用实际官方声明和具体作品credit，没有因未知的私人guest release或music cue sheet一律追加阻断。

- [BLS政策](https://www.bls.gov/opub/copyright-information.htm)支持机构原作再用并署名，另有版权照片/插图和标志商标排除。[NIMH政策](https://www.nimh.nih.gov/site-info/policies)允许文字复制和不误导的编辑，图片不可再用，也不支持将出版物呈现为个别医疗建议或商业背书。
- [NHGRI政策](https://www.genome.gov/about-nhgri/Policies-Guidance/Copyright)允许默认机构原作使用/分发并署名回链，另署名版权及外链需另核。[NIST政策](https://www.nist.gov/copyrights-disclaimers)允许未标版权公共网页信息复制/分发，本稿不借软件/SRD/Technical Series的特殊条款。[CBO政策](https://www.cbo.gov/about/privacy)明示机构职务原作的公共领域状态，另有版权资产和logo不在本次许可内。
- [VOA声明](https://learningenglish.voanews.com/p/6861.html)明确包括Learning English原作文本与MP3的署名教育/商业再用，另有版权新闻机构作品排除。Air Travel保留页明确Alice Bryant原创、George Grow编辑，并有指向该原MP3的下载链接；没有发现该音频的具体第三方限制。
- [NOAA FAQ](https://oceanservice.noaa.gov/about/faq.html)采用机构默认再用、具体credit/caption例外的规则；不得冒称版权、政府背书或把修改内容当官方原文。[NOAA Library](https://library.noaa.gov/blogs/news-research-highlights/question-of-the-quarter-noaacopyright)进一步给出NOAA-only作品的原作判断与其他作者例外。三份节目保留官方出品、机构主持/受访者介绍及原下载关联，没有识别出实际第三方音频版权限制。Troy Kitch/artist/制作软件tag不是单独的限制条款。以上不扩到节目图片、外链或任意第三方材料，也不新增全球法域保证。

| 音文候选 | 原文件秒数 | 文本词数 / 文本学习段数 | study估计 | 本次独审边界 |
|---|---:|---|---:|---|
| [VOA Air Travel](https://learningenglish.voanews.com/a/the-language-of-air-travel/4871734.html) | 542.64 | 1136 / 1 | 30 | 原文件SHA与官方直接链接核对；一整文本学习段，未切音频。 |
| [NOAA Corals](https://oceanservice.noaa.gov/podcast/dec15/dd64-hawaii-corals.html) | 1329.08405 | 3856 / 23 | 60 | 文本按问答结构分组；主持/两位受访者是官方署名线索，非本次声学识别。 |
| [NOAA Microplastics](https://oceanservice.noaa.gov/podcast/june16/dd66-microplastics.html) | 936.20245 | 2332 / 13 | 45 | 正文与MP3同节目原始引用，不以解码证明逐词可听。 |
| [NOAA Invasive Species](https://oceanservice.noaa.gov/podcast/feb15/dd59-invasivespecies.html) | 1158.11275 | 2856 / 10 | 50 | 含702、560词的完整自然问答组，没有硬剪成短文或冒充新来源。 |

四文件合计3966.03925秒（约66.10分钟）、transcript共10180词。重新核对其实际文件字节/hash，引用作者已有解码证据；没有再下载、再解码、ASR或试听。全部音频开始/结束切点为null，没有逐词/回合对齐批准。60个文本学习段（R13、L47）只是在10个来源内续学，不是60个新来源或独立成绩。NOAA两个节目共享Amy与主持角色，也不是无限不同说话者。

## 词形和容量核验

611处命中的原文/展示文surface、quote双坐标与句hash全一致；233处登记屈折关系逐项对ECDICT form索引，3处specialise→specialize对显式spellingVariants核验。187个有literal词头、41个只有登记其他形式/变体，共228个不同规范目标，均只是位置候选。97处仍held；killer两处都为killer green algae俗名成分，不是“杀人者”义，未计入228。即使位置合格，也必须另审实际义/POS；例如abrasive blast的blast不能仅借规范卡“一阵风”义通过。

各包均未分配课程日、未授词义批准、未新增原稿或掌握。旧源索引639项中没有相同保留正文hash或规范化publisher URL匹配，是元数据检查，不是学习者未见证据。未读取真实档案，不能据此授fresh资格或替代保留卷。

十包建议study合计345分钟，需要多个课程单元。以真实旧公开Planner和StudyTimer核心复算，fresh默认25/5/15每4轮：285 study+75休息=360，15分钟订正/到期预留已含study中。候选30分钟时其余必做study上限240；60分钟时210。没有把预留或休息重复加减。

**这不是动态准入上限。** 实际Timer在第4轮只余1分钟专注、或已处15分钟长休息时，同样285 study预测90休息、总375。当前包只给静态例子，`dayAssigned:null`、actualCapacity pending，未调用真实Load准入，因此不是新运行时预算漏洞。后续排课必须继续由真实Load/Timer读取当前原稿、必做、due、订正、自然日、已用时间和结束今日状态；不够则续学/carry，不能删旧必做或用285静态值重签准入。

## 本阶段结论与边界

来源包128文件、153000294字节逐项精确hash已验；14条原文映射、60段、155个阅读段、611位置及冻结盲笔记67条证据复算通过。许可核验支持候选范围内后续署名再用，没有新增实际许可阻断。发布仍需Root审定具体release，处理已列编辑问题，审题/详解，按能力与真实时间准入；音频另需实际听审和准确边界。本报告没有把待核项目计作错误/通过成绩，没有声学、真人Band标定或教学效果结论。

所有输出只写本独立目录。未写产品、Root候选、NAS或旧冻结包，未读真实档案、配置/凭据、真实录音；未进行浏览器权限重试或任何新ASR/TTS。复算脚本仅使用固定公开文件与合成Timer状态，不启动真实服务。
