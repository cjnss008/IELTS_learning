# 私人评分参考资料

本目录只分发来源、参考分、页码及哈希索引，不分发第三方完整作文。完整原稿进入个人档案的 `calibration-sample` 媒体记录，逐轮反馈进入 `calibration-round`，汇总进入 `calibration`；它们不应计入学习作品达标。

## 已核实来源

[IELTS 官方 Academic Writing Sample Tasks 2023](https://ielts.org/cdn/Sample-tests/ielts-academic-writing-sample-tasks-2023.pdf) 中四份 Task 2 响应的任务 Band 为 6.5（2A B）、8.5（2A C）、5.5（2B A）、7.5（2B B）。页码、原件 SHA-256 及转录 SHA-256 见 [official-sample-index.json](official-sample-index.json)。核实日期 2026-10-25。原件只公布每篇任务分，四维数字未公布，不能补填。

新增六份参考于 **2026-10-25T07:26:19.544Z**、新原稿首次模型评阅前冻结，见 [预注册清单](reference-preregistration-v60.json)。旧四份保持唯一开发集；新增全部为 holdout，不按模型输出挑选。

| 原始出版包 | 新参考 | 完整题目与评分位置 |
| --- | --- | --- |
| [UCLES 2009 Task 2 Activity](https://www.cambridgeenglish.org/images/ielts-academic-writing-task-2-activity.pdf) | 核能 Script A **5**、B **7** | 第15页题；A第16–17页、评分第17页；B第18–19页、评分第19页 |
| [IELTS 电脑样题候选答卷与考官评语](https://ielts.org/cdn/computer-delivered-sample-tests-academic-writing/ielts-academic-writing-example-responses-to-parts-1-and-2-with-band-scores-and-examiner-comments.pdf) | 上学交通 Task 1 **6／4**；健康 Task 2 **5.5／7.5** | 第1页确认考官评阅与任务分；第2–5页每页一稿和评分；完整题另见[官方练习页](https://ielts.org/take-a-test/preparation-resources/sample-test-questions/academic-test)所链 Inspera 样题 |

六稿覆盖 **两个新出版家族、三道题**，其中 Task 1 两稿、Task 2 四稿。IELTS 与 British Council 的电脑样题镜像只算同一个出版家族；共同 IELTS 合作者、未知考官身份和未知更早出版史意味着它们不能当作六道独立题、两个独立考官组或模型预训练未见数据。UCLES 2009 是历史考官教学参考，不能说已用当前量表重新评分。总目录现为10份完整答卷、5道题、3个出版家族；来源扩充本身不证明评分偏低已解决。

电脑 Task 1 已核对完整原图：5–12岁、1990／2010、五种交通方式、百万次／年单位、0–14每2递增坐标和黑柱／斜线柱图例。评分接口使用完整文字等价图表；全部柱高注明为图上近似读取，原图没有精确数据标签。本项验证文字评分，不验证模型直接读图。原 SVG 字节哈希、题目链接与编码说明均在索引，原图和完整题只保存在私有工作目录。

UCLES 原件页脚许可不改写、免费课堂复印分发；[现行网站条款](https://www.cambridge.org/legal/website-terms-of-use)另列个人非商业用途及限制。它不是开放数据集或模型训练／公开再分发许可。Cambridge 预览不含评分原稿的文件、未明确实际候选奖分的 IDP “Band 7”示范文，以及重印旧稿的 IDP 手册均未作为新增真值。来源选择与排除理由的私有证据随原件留存。

[官方使用条款](https://ielts.org/legal/ielts-copyright-and-trade-mark-statement)允许遵守原件限制、保留署名的个人非商业复制；商业使用、另站发布、改写等需书面许可。索引不是正文再分发许可。将正文发送给自选 AI 前，使用者确认自己有权这样使用。保留 `© IELTS Partners` 及原始链接，不公开提交个人转录或导出报告。

题目取原件第6／7页完整评分要求，省略40分钟的时间建议。原稿逐页核对手写原图，省略明确划掉的文字、保留最终添字、原错和抄题，保留段落。哈希允许空白与弯引号差异，保留大小写、所有词语、拼写及其他标点；这是经核对的本地转录身份，不是官方电子原稿。手写辨认仍可能有误，报告应回看原图，不宣称考官认证。

## 从自己有权使用的文件导入

在“评分校准”选择本地 JSON。导入只到本机核验接口，不请求 AI；选中已保存样本后再盲评。基本格式如下；占位符须换成完整内容，不能将模板本身当作可靠样本：

```json
{
  "format": "ielts-calibration-samples",
  "version": 1,
  "samples": [{
    "id": "my-authorized-sample-a",
    "name": "我有权使用的完整作文 A",
    "mode": "writing",
    "task": "academic_task2",
    "level": "B2",
    "prompt": "完整题目和任务要求",
    "text": "完整、未经订正的原始回答",
    "sourceKind": "user_authorized",
    "sourceUrl": "https://example.org/specific-original-source",
    "note": "实际评阅者、原件位置和分数依据；未公布的维度留空",
    "rightsConfirmed": true,
    "completeResponse": true,
    "completePrompt": true,
    "reference": {"overall": 6.5, "bands": {}}
  }]
}
```

用户参考分与官方核实参考分分别统计。仅有总任务分时 `bands` 为 `{}`；确实有四维原始参考时，写作键只可为 `task`、`coherence`、`lexical`、`grammar`，各值须为0–9、0.5步长。口语文字只可参考 `lexical`、`grammar`，不能填写完整口语总分、流利或发音。未知键直接拒绝，不会静默丢弃后显示已校准。未确认完整回答／完整题目、短摘及证据不足的用户短文不进入 Band 误差统计。

官方索引导入另用 `sourceKind: "official_verified"`、索引中对应 `id` 和该样本来源的 `sourceDocumentSha256`；完整原稿及题目必须匹配索引哈希。参考任务分由服务端索引取值，伪造四维或改分会被拒绝。官方完整低分样例可不足150／250词；只有哈希核实后的内部标记允许评此完整短原稿，普通接口传布尔字段不能绕过长度门槛。

目录保留旧 `source` 全部原值，通过 `sources` 对象和每条 `sourceId` 绑定新来源。旧四条固定原 `verificationVersion`／`verifiedAt`，目录增加不改变其已存 SHA 身份；开发／留出和出版家族是展示元数据，不送入模型。重复身份依据原稿与题目内容，不能靠改名、换URL或重复运行扩大独立样本数。

## 本地核对工具

工具只读明确传入的文件，不读取服务配置、不调用模型，也不覆盖既有输出。

```powershell
node tools/import-calibration.cjs --catalog
node tools/import-calibration.cjs --input C:\private\samples.json --source-pdf C:\private\official.pdf --output C:\private\verified-samples.json
node tools/import-calibration.cjs --sample ielts-academic-2023-2a-b --text C:\private\answer.txt --prompt C:\private\question.txt --source-pdf C:\private\official.pdf --output C:\private\one-verified.json
node tools/import-calibration.cjs --input C:\private\holdout-input.json --source-pdfs C:\private\source-pdfs.json --output C:\private\holdout-verified.json
node tools/validate-calibration-references.cjs
node tools/validate-calibration-references.cjs --input C:\private\holdout-verified.json --source-pdfs C:\private\source-pdfs.json --chart C:\private\school-chart.svg
```

多原件批次使用 `--source-pdfs` JSON 对象，如 `{"cambridge-ucles-2009-task2":"cambridge.pdf","ielts-computer-writing-samples":"computer.pdf"}`。路径相对于映射文件所在目录；每个选中来源都须提供且字节哈希匹配，不能用一份旧 PDF 核实其他出版包。单原件 `--source-pdf` 保持兼容。

`validate-calibration-references` 默认只核对公开索引和预注册身份／页码／覆盖规则；传私有完整六稿、两份原 PDF 和原 SVG 后再核对实际字节与导入资格。它不调用模型，规则通过不等于逐稿教师审题、量表等值或教学成效。原件与逐页 PNG、完整题／稿文本、UI 导入包及人工核对局限保存在被忽略的 `work/calibration-v60`，不得提交。日常使用不依赖 Python。

从官方原页取得完整题目和响应，按转录规则对照后保存 UTF-8 文本。手写页不可只依靠 OCR；漏段、先订正或误认会造成哈希不符，须回看原页。工具核验原 PDF 字节、正文及题目哈希后输出 UI 可导入的 JSON；仅导入一个文件时不必先调用命令行。正文输出只允许仓库外个人目录或被忽略的 `用户数据`／`work`，不要加入 Git。

## 统计与可重复比较

每轮请求只含相同原题、原稿、阶段及公开维度规则；不含参考分、名称、来源或另一轮评分。模型、服务域名、提示版本和轮角色均保存。首次分析与反例复核是不同提示角色；比较模型归因时应交换两个模型再跑同组样本，而不是把角色差异全归因于模型。

官方只给任务分时，只比较四维均有证据的未舍入等权平均。缺维度则任务估计缺失，模型维度分不能反过来充当参考维度分。统计同时列出独立样本数、观测数、缺分、分数／任务覆盖、有向偏差、MAE、逐项分歧。网络失败及未尝试项计缺失，不填0、不丢掉失败样本；报告不自动修正模型输出。四篇同源 Task 2 样例不覆盖 Task 1、完整口语或全部分数，模型一致也不证明准确。

新留出首次运行也须保留缺维度、失败与未尝试项；预注册比较按来源、任务、模型和轮角色报告偏差、MAE、±0.5内占比及完整可比数。若根据这六稿结果改提示，它们随即成为已用验证资料；后续准确率结论须再取未见独立参考。反序、改名或重印不能恢复留出身份。评分异常不能通过统一加分、挑高轮或丢弃不利样本“修复”。

每份原稿与逐轮原文引证分开保存在现有媒体库，汇总用媒体ID关联，避免批量报告超过单条150KB上限。备份须包含相关媒体记录；关联依据缺失时界面明确提示，不能把只有分数的旧汇总当完整校准证据。预览与正式档案继续由现有媒体库隔离。
