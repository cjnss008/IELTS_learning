# 独立陌生材料与原创语境补组

本目录保存31份独立分科短测：A1/A2/B1/B2各两篇阅读、四段不同地域合成听力；另有七类Academic Task 1原创模拟图表。24个独立正文共192道客观题。它们不是40题完整试卷、官方试题或已经实测定级的材料。

权威作者源是 `tools/independent-bank.cjs`。`materials/` 是构建产物；不要只改JSON而遗忘作者源。`catalog.json` 仅含简介元数据，`audit.json` 记录证据和可重算内容哈希。新库使用 `pool=independent`、`independentBank=true`，不会排入365天核心课、普通追加练习、关卡或末期保留卷。正文与答案在本机静态资产中可技术性读取；目录不预览内容并不意味着这里是安全考试密库。

16段音频全部明确标为合成。GB/US/AU/IN标签按微软官方声音地域元数据核实；没有声称真人口音听审。音频的 `transcriptHash` 对应完整精确UTF-8原文，`audioHash` 对应MP3原始字节。多人对话按明确角色切换同地域声音。没有伪造字幕时间轴。

此前70个未排课候选另由 `tools/lexical-contexts.cjs` 编写完整新例句、IPA和不同语境用词题。冻结候选来源见 `curriculum/sources/lexical-context-candidates.json`。32组每组不超过4词，排课从候选出现的下一周起寻找普通日，同日词汇总量不超过12；对应语境题替换一次重复语法练习。旧源中的屈折形、插入词和未进入旧正文的例句不会被冒称为精确原句。词汇排课不等于掌握。

标准构建与离线审计只需Node：

```text
node tools/build-independent-bank.cjs
node tools/build-curriculum.cjs
node tools/audit-independent-bank.cjs
node tools/audit-curriculum.cjs
node tools/audit-curriculum-growth.cjs
node --test tests/independent-bank.test.cjs tests/vocabulary-audio.test.cjs tests/curriculum-growth.test.cjs
```

首次作者生成音频时先用 `node tools/build-independent-bank.cjs --text-only` 产出已审文本。音频作者工具可选使用Python、`edge-tts`、ffmpeg和ffprobe；它们不进入学习运行时。依赖只安装在Git忽略的 `work/authoring-python`：

```text
<authoring-python> -m pip install --target work/authoring-python edge-tts==7.3.1
node tools/synthesize-independent-bank.cjs --python <authoring-python> --vocabulary --concurrency 3
node tools/build-curriculum.cjs
node tools/audit-independent-audio.cjs
```

单独重做一段可用 `--id independent-a2-listen-au`；单独生成词音可用 `--vocabulary-only --word compact`。声音配置或原文变化时须重做音频并重新构建。动词 `compact` 用原创祈使句合成后按服务真实WordBoundary取出目标词，完整语境音源和剪辑范围保存在词音元数据，避免孤立词可能采用的形容词重音。完整源音仍保留，剪辑过程可核验。

`audio-audit.json` 是16段音轨与70个词音的实际ffprobe格式/时长、ffmpeg完整解码和非静音检查；这不能替代独立ASR核稿、真人试听、专业发音评测或长期教学效果验证。来源与许可边界见 `sources.json`，交叉内容核对范围见 `semantic-review.json`。
