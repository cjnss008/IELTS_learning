# 公开材料理解题（staged）

首批17源、99题：14份VOA Conversation文字源和3份NASA最终v2正文。每篇4–6题；题干、选项英文，解释中文，连续原文evidence与UTF-16 offsets可复算。未更改源文章或原始音频。

题组版本、源版本与textSHA独立绑定；`source.exposureGroup=public-source:<sourceId>`不含版本。读过同文后听力不成为新未见材料，修正标点或更新题目也不能洗掉已见。同group实际曝光由course-player适配器处理，gate/final/fullTest/independent继续分池。

99题已由另一Codex代理仅凭源全文与题干/选项独立作答，作者方核对99/99一致；blindInputSha256与reviewSha256记录在每包review.blindComparison。本步骤不等于真人考官、心理计量标定、实际听音或版权审核。

构建只输出显式work/staging目录：

```text
node tools/build-public-supplement-materials.cjs --output-root work/staging/public-comprehension --require-complete
node --test tests/public-supplement-materials.test.cjs
```

`load()`返回`materials`、`blockedMaterials`及`audit`，不会修改主课程bundle、日快照、记录或配置。默认读取canonical `curriculum/public-supplement-catalog.json`与本目录17包，实际源文仅从`materials/public/`读取；公开MP3限`audio/public/`或`materials/public/`。未完成的未来源不硬接生产。

阅读题通过正文和独立文字盲解后可以生成兼容reading材料。真实week/day/budget由独立版本的未来课程方案指定，不编造周次。所有材料是普通训练、非完整IELTS卷，不按99题换算Band。

VOA听力候选还须：实际音频SHA匹配、原话evidence确实可听、独立声源权利通过。provider-linked不是独立听审。当前13份普通Conversation原音必须在本地且hash正确；24仅在canonical audio.usage的eligibleForPractice和redistributionAllowed同时false时可在Git clone缺失，已有文件仍验SHA，始终不可用。24外景第三方背景声未审，不打包传播或用TTS代替。

可选`curriculum/public-supplements/audio-review.json`的sources对象按sourceId登记实际审核证据，工具才可能生成可用listening材料。每项须含`sourceTextSha256`、本工具audit给出的`questionContractHash`、`audioPath`、`audioSha256`、实际`durationSeconds`、`allQuestionEvidenceAudible:true`、`rightsCleared:true`、`reviewMethod`、`reviewedAt`。这是记录真实核查的合同，不得用占位值声称核查已完成。canonical usage禁用或sourceIssues未解决仍优先block。

静默舞台/镜头说明不能作为spokenEvidence；每段原话必须落在角色台词范围内，跨说话人时分别列quote。NASA只产生reading；没有授权对应原音，不自动转成认证听力。最终public runtime仍需完整集成、保存恢复与预算验证后另行发布。
