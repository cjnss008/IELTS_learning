# GitHub 英语学习项目调研与改进路线

核查日期：2026-10-24。按五类选取 12 个代表性仓库，阅读官方 README、实际许可证和维护信息；这是有重点的调研，不是对 GitHub 的穷尽检索。学习效果没有因项目流行或更新活跃而得到验证。

## 功能选择

### [Anki](https://github.com/ankitects/anki)

- 分类：SRS 词汇；[许可证](https://github.com/ankitects/anki/blob/HEAD/LICENSE)：AGPL-3.0-or-later；部分贡献 BSD-3-Clause，vendored 组件另列许可。
- 可借鉴：基于间隔重复的长期复习流程；单词卡与日常复习工具的职责分离。
- 本项目的取舍：先新增独立词卡数据与 CSV/TSV 导出，让学习者可把文章词汇送入 Anki；本项目保留到期任务与答题记录。不要嵌入桌面端源码。
- 限制：Anki 是桌面学习工具，不能替代课程或听说读写评估；本次 README 仅确认 spaced repetition 定位，未把第三方插件能力算作内置能力。
- 维护信号：最近推送 2026-10-23，核查时未归档；这不代表稳定版日期或教学有效性。

### [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)

- 分类：SRS 词汇；[许可证](https://github.com/open-spaced-repetition/ts-fsrs/blob/HEAD/LICENSE)：MIT。
- 可借鉴：Again / Hard / Good / Easy 复习反馈；保存 card 与 review log，按目标保持率安排下次复习；较高保持率伴随较高复习负荷。
- 本项目的取舍：为每个词卡保存稳定 ID、到期时间、复习日志，首页先处理到期卡；在验证运行环境后锁定 scheduler 版本并本地打包。首版可先搭好可替换调度接口。
- 限制：当前 v6 README 要求 Node >=24，项目现有 Node22 不可直接跟随 latest；浏览器打包也须验证。保持率是记忆概率目标，不是 IELTS 得分保证；不能靠简单固定间隔冒称 FSRS。
- 维护信号：最近推送 2026-10-24，核查时未归档；这不代表稳定版日期或教学有效性。

### [Lute v3](https://github.com/LuteOrg/lute-v3)

- 分类：阅读与词汇上下文；[许可证](https://github.com/LuteOrg/lute-v3/blob/HEAD/LICENSE.txt)：MIT。
- 可借鉴：读文本时建立词条和多词词组；父词条关联词形变化；从相关词形回看例句。
- 本项目的取舍：给 52 篇文章加可选择的词/短语，存 lemma、原句、文章号、释义、学习状态；点击词条可回到出现位置。由作者审核词组和基础释义。
- 限制：本体为 Python/Flask 应用；适合借鉴交互，不需要为现有静态页面迁移整个技术栈。词形与词组关系仍需内容质量控制。
- 维护信号：最近推送 2026-09-05，核查时未归档；这不代表稳定版日期或教学有效性。

### [LinguaCafe](https://github.com/simjanos-dev/LinguaCafe)

- 分类：阅读与词汇上下文；[许可证](https://github.com/simjanos-dev/LinguaCafe/blob/HEAD/LICENSE)：GPL-3.0。
- 可借鉴：阅读、查未知词、稍后复习形成连续流程；英语在支持语言列表中；单词库与阅读进度视图。
- 本项目的取舍：文章页增加“认识/待学/需复习”状态与正文覆盖率；把查词结果保存到同一个复习词库。优先使用课程已有授权释义和本地数据。
- 限制：README 明示仍在开发且一台服务只支持一个用户；词典等资源具有各自许可证；复杂自托管应用不宜整站搬入当前项目。
- 维护信号：最近推送 2026-08-09，核查时未归档；这不代表稳定版日期或教学有效性。

### [VocabSieve](https://github.com/FreeLanguageTools/vocabsieve)

- 分类：阅读与词汇上下文；[许可证](https://github.com/FreeLanguageTools/vocabsieve/blob/HEAD/LICENSE)：GPL-3.0。
- 可借鉴：从文本、字幕、电子书标注提取原句词卡；词形还原和已知词追踪；保存原句、词、释义、发音并导出 Anki。
- 本项目的取舍：给文章选词操作附上原句与音频片段位置；以词元去重，导出自己的学习卡片；用已知词覆盖率提示下一篇阅读难度。
- 限制：README 面向中级学习者且标记 beta；最近仓库推送在 2025 年。零基础阶段应先有分级词汇和示例句，避免自动挖掘大量过难词卡；外部词典/音频授权另查。
- 维护信号：最近推送 2025-08-15，核查时未归档；这不代表稳定版日期或教学有效性。

### [asbplayer](https://github.com/asbplayer/asbplayer)

- 分类：精听、字幕与听写；[许可证](https://github.com/asbplayer/asbplayer/blob/HEAD/LICENSE)：AGPL-3.0。
- 可借鉴：可导航的字幕列表与逐句跳转；句首/句尾自动暂停、重复播放；字幕和多媒体词卡关联。
- 本项目的取舍：为现有 MP3 建立经人工复核的句级时间戳；播放器提供逐句循环、语速、遮字幕听写、提交后逐词差异和错句重练。先使用本地文章音频。
- 限制：本体是浏览器播放器与扩展；字幕时间戳需先准备。README 的未来计划不应当作已实现功能；不接入未经授权的视频抓取。
- 维护信号：最近推送 2026-10-24，核查时未归档；这不代表稳定版日期或教学有效性。

### [whisper.cpp](https://github.com/ggml-org/whisper.cpp)

- 分类：语音转写；[许可证](https://github.com/ggml-org/whisper.cpp/blob/HEAD/LICENSE)：MIT。
- 可借鉴：本地运行 Whisper 自动语音识别；Windows、CPU 推理和 WebAssembly 支持；可选 VAD，输出转写供复核。
- 本项目的取舍：后续通过本地 Node 后端调用受控离线转写进程；上传短录音并返回转写文本，与参考句对照漏词/多词。先作为可选诊断模块。
- 限制：需要下载模型及转换音频；模型容量和机器速度影响体验。ASR 的文字相似度不等于发音准确率，不能据此产生雅思口语 band 或音素正确率。
- 维护信号：最近推送 2026-10-19，核查时未归档；这不代表稳定版日期或教学有效性。

### [WhisperX](https://github.com/m-bain/whisperX)

- 分类：语音转写与时间对齐；[许可证](https://github.com/m-bain/whisperX/blob/HEAD/LICENSE)：BSD-2-Clause。
- 可借鉴：ASR 加词级时间戳；基于 wav2vec2 的强制对齐；可选说话人区分。
- 本项目的取舍：开发阶段离线批处理课程自有音频，生成 word/segment 时间戳 JSON，经人工修正后供静态播放器使用；不要求每位学习者安装 Python/GPU。
- 限制：README 明示部分数字/符号不能对齐、重叠语音较差、说话人区分不完美；依赖语言模型和较重运行环境。对齐时间点不证明发音正确。
- 维护信号：最近推送 2026-10-22，核查时未归档；这不代表稳定版日期或教学有效性。

### [Montreal Forced Aligner](https://github.com/MontrealCorpusTools/Montreal-Forced-Aligner)

- 分类：语音时间对齐；[许可证](https://github.com/MontrealCorpusTools/Montreal-Forced-Aligner/blob/HEAD/LICENSE)：MIT。
- 可借鉴：利用现有转录稿对齐语音数据集；为语音研究和课程音频预处理提供命令行工作流。
- 本项目的取舍：当文章准确文本与配套音频齐备时，批量预生成对齐结果并转换为本站句级时间戳；静态站只消费审核后的 JSON。
- 限制：需 Kaldi/Conda 等依赖与适配的字典/声学模型；文本错误会影响对齐。它是强制对齐工具，不是发音评分器；模型许可证另核实。
- 维护信号：最近推送 2026-10-22，核查时未归档；这不代表稳定版日期或教学有效性。

### [Azure Speech SDK 官方样例](https://github.com/Azure-Samples/cognitive-services-speech-sdk)

- 分类：专业发音评测；[许可证](https://github.com/Azure-Samples/cognitive-services-speech-sdk/blob/HEAD/LICENSE.md)：样例代码 MIT；Speech SDK 与云服务另有条款。
- 可借鉴：参考文本朗读评测；词/音节/音素粒度准确度及流利度、完整度、韵律反馈；官方 Node.js 发音评测样例。
- 本项目的取舍：在既有本地后端增加独立 speech provider；用户另配 Speech 服务凭据，前端录制 10–30 秒参考句，展示错误词及音素诊断。凭据仍只保留服务端内存。
- 限制：需要独立语音服务，DeepSeek 文本 API key 不能替代；云服务计费与语言/地区/功能限制需配置时核实。超过 30 秒官方要求连续模式，遗漏/插入需额外比较。0–100 诊断分不能直接换算 IELTS band。
- 维护信号：最近推送 2026-10-23，核查时未归档；这不代表稳定版日期或教学有效性。

### [FreeLingo](https://github.com/artcc/freelingo)

- 分类：AI 学习助手；[许可证](https://github.com/artcc/freelingo/blob/HEAD/LICENSE)：AGPL-3.0；README 另提商业授权渠道。
- 可借鉴：CEFR 能力与先修关系组织课程；语法、词汇、阅读、写作、复习按顺序推进；上下文 AI 导师与复习/语音练习记录。
- 本项目的取舍：让已接入 AI 接收当前文章、目标语法、学习者答案，返回结构化讲解、纠错依据与下一题；先做人工编写课程边界，AI 不决定整个 52 周课程。
- 限制：本体是 Next.js/FastAPI/PostgreSQL/Redis 重型架构；README 的学习效果描述是项目自身描述，不是独立验证。生成内容需可追溯、可纠正，不能承担考试达标保证。
- 维护信号：最近推送 2026-10-24，核查时未归档；这不代表稳定版日期或教学有效性。

### [Companion](https://github.com/shakedzy/companion)

- 分类：AI 学习助手；[许可证](https://github.com/shakedzy/companion/blob/HEAD/LICENSE)：CC BY-NC 4.0（非商业限制；不等于可任意商用的开源许可证）。
- 可借鉴：文本与语音对话组合；母语/目标语切换与纠错反馈；LLM、STT、TTS 分离。
- 本项目的取舍：借鉴“解释→改写→再次回答”互动；在现有 AI 设置中把文本模型与将来语音服务分开。只参考产品思路，不引入它的源代码。
- 限制：最近仓库推送为 2024-12-03，未归档但不代表当前活跃；依赖多种外部 API 且可能收费。CC BY-NC 限制非商业使用，不能当 MIT 库直接复制。
- 维护信号：最近推送 2024-12-03，核查时未归档；这不代表稳定版日期或教学有效性。

## 本轮实施与后续边界

本轮用原生浏览器技术补齐日程、基础桥梁、逐句听写、语法练习、语境生词本、到期复习、口语录音与可选专业发音服务、写作反馈和备份。保留旧学习记录与离线音频，不引入重型框架。所有新增模块自行实现，未复制上述项目代码。

间隔复习首版使用透明的固定规则，不冒称 FSRS。后续可在验证依赖兼容性后替换调度器；必须保留稳定词卡 ID 和历史。ASR/对齐用于转写和时间点，发音诊断使用独立语音服务，不能混同。

下一轮重点是补足更长学术阅读、多口音听力、地图与流程图 Task 1、外部评阅校准和学习数据实测；现有短文加工具仍不是完整的零基础到雅思四项 6.5 课程。52 周每日 6 小时提供训练预算，达标证据来自多次独立四项测评。

评分设计参照 [IELTS 官方评分说明](https://ielts.org/take-a-test/your-results/ielts-scoring-in-detail) 和 [Academic 考试格式](https://ielts.org/organisations/ielts-for-organisations/test-types/ielts-academic-test)。自动反馈须复核；每项按 7.0 训练留出余量，不承诺所有学习者一定达到固定分数。
