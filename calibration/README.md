# 私人评分参考资料

本目录只分发来源、参考分、页码及哈希索引，不分发第三方完整作文。完整原稿进入个人档案的 `calibration-sample` 媒体记录，逐轮反馈进入 `calibration-round`，汇总进入 `calibration`；它们不应计入学习作品达标。

## 已核实来源

[IELTS 官方 Academic Writing Sample Tasks 2023](https://ielts.org/cdn/Sample-tests/ielts-academic-writing-sample-tasks-2023.pdf) 中四份 Task 2 响应的任务 Band 为 6.5（2A B）、8.5（2A C）、5.5（2B A）、7.5（2B B）。页码、原件 SHA-256 及转录 SHA-256 见 [official-sample-index.json](official-sample-index.json)。核实日期 2026-10-25。原件只公布每篇任务分，四维数字未公布，不能补填。

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

官方索引导入另用 `sourceKind: "official_verified"`、索引中对应 `id` 和 `sourceDocumentSha256`；完整原稿及题目必须匹配索引哈希。参考任务分由服务端索引取值，伪造四维或改分会被拒绝。官方完整低分样例可不足250词；只有哈希核实后的内部标记允许评此完整短原稿，普通接口传布尔字段不能绕过长度门槛。

## 本地核对工具

工具只读明确传入的文件，不读取服务配置、不调用模型，也不覆盖既有输出。

```powershell
node tools/import-calibration.cjs --catalog
node tools/import-calibration.cjs --input C:\private\samples.json --source-pdf C:\private\official.pdf --output C:\private\verified-samples.json
node tools/import-calibration.cjs --sample ielts-academic-2023-2a-b --text C:\private\answer.txt --prompt C:\private\question.txt --source-pdf C:\private\official.pdf --output C:\private\one-verified.json
```

从官方原页取得完整题目和响应，按转录规则对照后保存 UTF-8 文本。手写页不可只依靠 OCR；漏段、先订正或误认会造成哈希不符，须回看原页。工具核验原 PDF 字节、正文及题目哈希后输出 UI 可导入的 JSON；仅导入一个文件时不必先调用命令行。正文输出只允许仓库外个人目录或被忽略的 `用户数据`／`work`，不要加入 Git。

## 统计与可重复比较

每轮请求只含相同原题、原稿、阶段及公开维度规则；不含参考分、名称、来源或另一轮评分。模型、服务域名、提示版本和轮角色均保存。首次分析与反例复核是不同提示角色；比较模型归因时应交换两个模型再跑同组样本，而不是把角色差异全归因于模型。

官方只给任务分时，只比较四维均有证据的未舍入等权平均。缺维度则任务估计缺失，模型维度分不能反过来充当参考维度分。统计同时列出独立样本数、观测数、缺分、分数／任务覆盖、有向偏差、MAE、逐项分歧。网络失败及未尝试项计缺失，不填0、不丢掉失败样本；报告不自动修正模型输出。四篇同源 Task 2 样例不覆盖 Task 1、完整口语或全部分数，模型一致也不证明准确。

每份原稿与逐轮原文引证分开保存在现有媒体库，汇总用媒体ID关联，避免批量报告超过单条150KB上限。备份须包含相关媒体记录；关联依据缺失时界面明确提示，不能把只有分数的旧汇总当完整校准证据。预览与正式档案继续由现有媒体库隔离。
