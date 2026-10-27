# 六篇48题：固定作者 v1 对照

48个独立盲答主项与作者v1钥匙一致，未发现答案钥匙错误。v1仍有一处范围措辞需澄清、一处解析代词笔误，因此本轮不称v1完全无缺陷。Root已同意以独立derived v2处理，两份冻结v1包均不改。

盲作答先冻：`3bed6cab04ce27eed4f9dc2254b23a611c353b4748f5b5df4a69ddd10276a55a`，第一阶段manifest `7fdc4c27fec24ab959bea68b4565adec5201c8442c961b11b552afb63f0d96ca`。之后获Root明确开放，才读作者material、钥匙/详解及contexts。作者v1 freeze `481410315f1822a40cabf5dded07efcad2a42fbb9eb2f5c2279c253db76ebde4` 的68文件、index `5e2f52ebde356921eb34673f33d64fbfd91464dec7e8c6c0179584ec1b80d015` 逐项精确核验通过。

## 两处最小修订

1. **Athletes q4**：v1为“Some **professional** athletes may have to travel internationally for competitions.”，证据句的主语为athletes总体：`many athletes must travel to sporting events`，后接`in some cases, international travel`。在本职业篇语境下TRUE是预期读法，我的盲答也选TRUE，但更窄的professional子集没有在该旅行证据中单独限定；不应要求学习者借背景常识补子集归属。最小改法删除professional，保持TRUE和原证据。没有声称v1的TRUE钥匙必然错误。
2. **CBO q3**：题干问`Those increases`，选项2中文错因写“该句没有把两个年度GDP增长列为**These**的先行内容”。应改为`Those increases`并同步解释内的相同文本。此为解析笔误，不改答案/证据/原正文。

两项均是内容/语言复核发现，不伪造Node“语义断言红例”。原v1题干/解析及SHA在`author-v1-comparison.json`中保留，可与derived v2逐字段比较。没有实际学员作答或成绩可回改。

## 合理短答、解析与语法

独立盲答预先提出的三个同指称形式都已在作者v1的answers中：NIMH q7 `CBT`、DNA q8 `mRNA`、NIST q7 `An analog-to-digital converter`。它们和全称对应同一对象，并在各题NO MORE THAN THREE WORDS内。真实Assessment.gradeQuestion对48主答+3别名全部正确且withinLimit；没有以当前hash拒收这些实质合理形式。另7个超限写法被真实评分模块拒绝，不改变产品评分逻辑。

48题完整英文题干/全部选项、中文主解析与各项错因已人工式逐项阅读；引用均精确绑定教学文UTF16/sha。三选判断题的NOT GIVEN已结合全文检查：高中训练时数、音乐/商科学费、会谈时长、每小时复制频率、装置重量、平均家庭税额均不能由相邻其他群体/总量/物理量推导。FALSE题则有直接相反关系，未把未提及误判为FALSE。

12个语法样例的原句、tag与解释均可接受，逐条意见在JSON：让步、have+宾语+分词的遭遇义、目的不定式/宾补、动名词主语/形式it/get被动、情态/被动、并列原因、When时间过程、比较/潜力、transform X into Y、财政增幅/部分抵消、过去反事实。未发现需要新增修改的语法错误；不据此授CEFR或Band。

27个词头↔surface位置与原文/教学文映射、quote hash、登记form关系全部核准为位置候选。它们仍`selectedMeaning:null`、未作词义/POS准入、未生成词卡/掌握，不能用这27处顶替8000义项教学。`receipt`此处税收收入、`trainer`具体职业等仍须后续按语境审义。

## 版本和范围

Root将对全六份derived source使用`verification:reviewed`和`normalization.officialVerbatim:false`，明确教学节选/编辑与审定范围；我未改原作者JSON。单个original-substring映射经核确实为原句，并不使整份经过清理/节选的教学材料成为官方逐字全文。所有教学文本26处已披露编辑在盲答阶段已精确重放，来源原件不变。

这批是六份普通阅读，每份8题，主旨/因果或目的/指代/TRUE-FALSE-NOT GIVEN/短答与填空的教学结构较统一；不是新完整保留卷，没有陌生题、真人分数标定或学习效果信用。没有进行浏览器、实际听审、真实服务或原稿提交，也没有修改作者包、Root候选、NAS或真实档案。0激活、0掌握。最终批准待derived v2的两题/元信息闭包增补核验。
