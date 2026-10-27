# 六篇普通阅读：最终独立内容审查

六篇48题的普通阅读内容及详解在本次固定derived版本可接受。48个独立盲答主项与作者一致；v1的两处语言问题和后续发现的来源payload哈希问题均已另版修复。原v1/盲答不改，不能把旧v1追称完全无缺陷。这里只批准内容审查范围，不是Root发布、实际课程准入、陌生证据或真人标定。0激活、0掌握。

## 先盲答，后对照

先冻六篇全文事实笔记（d3ca8c…），再只读无key题包a76e3113…作答；盲答SHA `3bed6cab04ce27eed4f9dc2254b23a611c353b4748f5b5df4a69ddd10276a55a`、manifest `7fdc4c27fec24ab959bea68b4565adec5201c8442c961b11b552afb63f0d96ca`。此后获Root开放才读作者钥匙与全部中文错因；作者68文件freeze `48141031…` 及Root内68原件副本精确未变。独审是AI工程/语言复核，非真人试验。

48题全选项/详解均已阅读，12个语法例句与说明可接受，27处仅核原文位置/词形/登记关系；它们仍是selectedMeaning:null，不授新词义/POS、CEFR或掌握。实际Assessment对48主答+3合理别名（CBT、mRNA、An analog-to-digital converter）均接受，并拒7个超词数输入；作者v1已收全三别名，没有漏收合理形式。

## 三项发现与已核修复

1. Athletes q4删professional，让主语范围与原旅行证据句的athletes一致，TRUE/key不改。最初按职业篇语境盲答TRUE，同时明确保留子集范围歧义，未伪称钥匙必错。
2. CBO q3的解释及对应选项错因，将These改成Those increases，对应原题指代词；钥匙/证据不改。
3. 最初derived四份未改题材料沿用作者Assessment深排序payload hash，而既有compiler的contentHashFields契约用普通JSON序列。精确红观察`hash-closure.red.json`（8c9a94e0…）保留四处不一致；Root将全六份derived统一重算，并在load加明确声明fields/问题与内容闭包校验。原探针`--green`复核六份全部闭合、0处不一致（28fa593e…）。不修改作者原件，也不涉及用户原稿/成绩。

只复核改动两题的实际评分矩阵：7个选项中2个正确、5个错误均符合钥匙；另两种已改变作者前提的输入被纯derive guard拒绝。独立按允许字段构造expected，再与真实deriveAuthorMaterial及每份derived JSON全对象深等；不是仅信任Root索引标签。六份正文、全部answers、12语法与27位置的作者副本不变。两份q2更新材料/题组版本与问答hash；其余四份题组和问题不变，仅来源批准/节选标志与来源payload声明hash改变。

## 最终精确pin

Root derived index：`fd6800ea2e8f72e91a6edb460c30996ba29211f2bb3176d174b4d312e9b45eab`；loader：`696e7005bc10f8a640233061ae095577107010222f824210bf8ad213358ca5ed`。每份文件SHA、Assessment整体hash、questionsSHA、声明source hash及contextSHA详见final-review-receipt.json。

| 来源 | 版本 | 当前材料文件SHA256 |
|---|---|---|
| bls-athletes | t1-q2 | ae61c417928a0a58841278c91d8df674caf77af798904ef1982c48528c24ff53 |
| bls-musicians | t1-q1 | 429218dba000d56e4e18741bc206087257698c239659fbee836affe52946cc12 |
| nimh-psychotherapies | t1-q1 | 28a0f82a8ca3e78aa99c563e120ea16d3cd0543fdb26c725b440385ece0ded50 |
| nhgri-dna | t1-q1 | 31fc7ce24941ed5effc165c1e5bf189742e8ea0d82456e49211ab4d331044261 |
| nist-atomic-television | t1-q1 | 9da1bc5ba48453325e0c51ed4d3def0368b1728dbe6de0784b2d3c23a9ab93ba |
| cbo-budget-2025 | t1-q2 | 35051aeeaa965d97d3ba29f26f10272c953767335ea6785b58ae07857905aaa6 |

全6 verification为reviewed、normalization.officialVerbatim为false，明确整份教学文是节选/编辑。保留原文/编辑映射，不因单个映射是原句而冒称官方全文。

## 范围与未执行部分

没有Root正式release，未调用load/append/build准入、未启动真实服务或浏览器。当前核对的是6材料及author-v1内的已审contexts副本；没有声称Root最终合成context catalog、80→86真实排课、52组件运行时契约或NAS安装已通过。本轮内容收据供Root绑定后进行正式构建/验证。Root另交代理复核loader的负索引界限；本报告不冒领该测试结论。

六篇仍是普通阅读练习，结构相近的8题不替代完整Academic保留卷。四个音文来源另有政策与文件证据，未在本题包内授听力/声学批准。所有源级别/分钟是未标定作者估计，真实能力、历史原稿/冻结日与360分钟含休息仍须走既有运行时准入。原题与旧成绩不回写。所有输出仅本独立目录，产品/Root候选/NAS/旧冻结包零写，未读真实学习档案。
