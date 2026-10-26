# P4 练习档案底座：接口与后续迁移协议

状态：后端HTTP、完整迁移编解码、旧服务围栏及备份恢复已接入并做隔离验证，详见[长期档案接入进度](长期档案接入进度.md)。浏览器尚未采用新写入/同步，正式页面的 Records 上限仍为10000，未自动迁移家人档案。

## 模块接口

```js
const {createLearningArchive} = require('./server/learning-archive.cjs');
const archive = createLearningArchive({dataDir: explicitAbsoluteTestDirectory});

await archive.append('legacy', {
  dayKey: '2026-10-25',
  requestId: 'retry-stable-request-id', // 可选；重试保留它和原日期
  originals: [{record: completeOriginalJson, mediaRefs: completeMediaReferences}]
});
await archive.get('legacy', originalId);
await archive.list('legacy', {dayKey: '2026-10-25', limit: 50});
await archive.list('legacy', {from: '2026-10-01', through: '2026-10-31',
  order: 'desc', limit: 50, includeRecords: true, cursor});
await archive.verify('legacy');
await archive.recover('legacy', {rebuildIndexes: true});
```

`dataDir` 必须显式提供绝对路径；模块不读取环境变量、真实档案或配置，不猜测默认用户目录。它在指定目录下创建 `learning-archive-v1/profiles/<profileId>/`。`profileId` 接受当前 `legacy`／`p-…` 格式；未来 HTTP 层仍须鉴权和核验档案身份、创建时间、reset epoch，模块不提供身份认证。

`record` 是完整普通 JSON，保留原始 answer 字符串、材料绑定、评分、历史及未知兼容字段。它不通过新评分器重判旧记录。JSON 访问器、稀疏数组、undefined、Date、非有限数和循环结构被拒绝，避免序列化时静默丢字段。完整词汇证据、材料快照及媒体 ID 不因入档被简化。成功入档只说明保存完成，不说明练习通过、掌握或考试成绩。

`mediaRefs` 保留完整 JSON 元数据，至少包含唯一 `id`、小写 SHA-256、`size` 和 `mime`。`record.media` 中列出的 ID 必须提供完整引用。正文／answer 内嵌 JSON 中的其他媒体依赖仍须由未来迁移器解析并补齐，模块不猜测它们。模块不复制、删除或验证原音文件；读取和核验结果明确返回 `mediaAvailability: 'not-checked'`。

同 profile、ID、日期和内容完全一致时幂等；对象键顺序不影响 hash，数组顺序和原始字符串保留。相同 ID 的不同内容或日期整批拒绝。已用 requestId 的不同请求也拒绝；相同请求返回原 receipt，避免未知提交结果造成重复。日期由调用方根据原始真实日期与档案时区确定，重试不自动改成今天。

`get` 为未入档 ID 返回 null；已登记 ID 的日志、索引或校验损坏会报错，不降级为空／未学。`list` 默认只返回轻量元数据；`includeRecords` 才回读完整原稿。游标固定最初 sequence，期间新增的当天／旧日记录不混入已开始分页；日期、顺序、档案和游标 hash 受校验。默认每页 50，最多 200。

## 分段、提交与恢复

每个真实日期使用有界追加日志，默认每段最多 4MiB／256份新原稿，之后封段。每次逻辑提交是一帧，包含长度、SHA-256、前一帧 hash、完整原稿及匹配的 COMMIT 尾标记。已提交帧只追加；封段不再写入。由此文件数随分段增长，避免每次复习各建一个原稿文件和一个提交文件。

ID 索引按 SHA 前两位分为 256 桶，另有按日期分页索引及小检查点。普通追加只更新受影响桶和当日索引，不重写全部历史正文。启动核验逐段读取，保留轻量元数据，不把全部原稿正文缓存进内存。完整重建仍需要全量 ID／请求元数据与索引空间，不能称无限容量或已验证 NAS 性能。

写入先登记有校验的 pending 意图，再追加并 fsync 完整帧，随后原子替换派生索引与检查点，最后清除 pending。元数据采用同目录临时文件、fsync、rename。跨实例／进程按 profile 加排他锁；只回收可证明本机进程已退出的锁，远端锁不因年龄失效。

返回成功前检查点已完成。写入中断可能抛出 `commitOutcome: 'unknown'`，调用方保留输入并用同一 requestId／原日期重试或查 ID。完整帧已写但检查点未完成时，恢复可核验并重放。已确认保存的检查点必须在日志链中找到，缺失时拒绝重建成更少记录。

只有匹配已登记 pending、位于最后完整帧之后的不完整尾部，才先复制到 recovery 隔离文件并记录 hash，再截回最后完整边界。已保存帧截短、完整帧 hash 错误、来源不明追加、检查点损坏均报错，保留现有文件。派生索引损坏默认报错；显式 `recover({rebuildIndexes:true})` 仅在完整日志链核验后重建。它不能修复损坏正文或伪造缺失证据。

文件 fsync／原子 rename 已实现；目录 fsync 在 Windows／NAS 上为 best effort。进程突然退出的隔离测试不能替代设备断电、网络文件系统及真实 NAS 中断验收。

底座新增的有界限制：每份 record 1MiB、单帧 2MiB、每次 256份、分段 4MiB／256原稿、单索引文件 16MiB、检查点 8MiB、每份最多1000媒体引用、单媒体引用32MiB、JSON嵌套80层。这里没有10000总原稿数上限。超过限制时保留输入并明确拒绝；不能截断历史、评分或原音引用。合法大历史稿可能需要未来可验证的评价增量拆分，不能据此称已完成所有旧稿迁移。

## 后续迁移与集成门槛（本次未实现）

1. 只读取得一致的旧档案版本：记录 profile ID／创建时间／generation／reset epoch、原快照 revision、每个原稿 ID／内容 hash，以及全部评价修订和媒体依赖闭包。不能直接逐条读取一个正在变化的旧列表后假称一致。
2. 保留完整旧原件，按原日期和有界请求复制到新档案。迁移 requestId 可确定性生成；断点重试幂等。同 ID 不同内容进入冲突，不覆盖两边。旧记录内嵌修订若需拆为不可变 delta，必须有完整无损往返证明，不能只留最终评价。
3. 核对数量、ID、原始 answer、材料绑定／顺序、每次评价、hash 及全部媒体；旧格式回读／恢复与已知历史评分解释必须一致。大原稿不能以提高原上限或截短字段绕过验证。
4. 服务先明确声明新档案协议及 read-by-ID／pagination／migration capabilities；不支持的旧服务不得接受 archive-only 新任务。先完成可恢复备份，再以 CAS 原子切换迁移清单／轻量索引。所有浏览器收到 generation fence 后重新加载。原库在验证切换前保留，不能把已开始或已完成课程重置。
5. 浏览器近期窗口及跨全历史的去重、错题、个性化、延迟证据查询需要 archive ID 解析。暂不可读取的历史应保持“待解析”，不得变成未学、通过或无错误。新评价、订正与变更追加唯一 delta ID，不能就地修改不可变原稿。
6. 把新根目录、日期段、索引、检查点、pending／recovery及全部引用原音明确纳入完整备份与恢复围栏。在档案锁下取得已提交检查点和分段边界，封存或按该边界复制活动段，不能随意拷贝正在追加的文件。现有每日备份尚未纳入这套新布局。保留30个恢复点、原有媒体按 hash 去重；验证恢复后所有 archive ID 和音频都可回读。要计入当前100000文件、1TiB、64MiB manifest、单entry64MiB／profile256MiB，以及手工媒体导入500项限制。
7. 接入前测试至少100000次练习、8000×4卡、24000+原音引用、长期分页和去重、离线恢复、错 hash、磁盘满、跨标签旧写入、旧服务拒绝、NAS中断与重启；测峰值内存和实际字节／耗时，再决定分片大小。当前通过的10241条空临时目录用例不等于此规模或设备验证。

本次没有删除／迁移真实记录、改 Records 上限、修改 user-data/file-cache/server route、导入真实文件或浏览器生产测试。


## 后端集成补充（2026-10-26）

`server/learning-records-service.cjs`提供 `/api/learning-records/` 接口；`server/learning-archive-migration.cjs`保留完整原件与历史并进行可逆分片；`server/learning-records-descriptor.cjs`验证小型指针。首次采用时profile索引版本升为2，user-data协议为3，旧服务拒绝写入；普通未迁移档案协议继续为2。存储identity在迁移时冻结，当前请求的resetEpoch/generation单独围栏，恢复不能重新计算旧记录地址。

`archive.withSnapshot`/`withRestoreLease`/`validateRestored`已接入每日备份；正常备份必须使用核验后的提交边界，恢复可对损坏live做明确未验证的raw fingerprint以保留回退，但stage仍须严格校验。锁序为user-data→archive root→profile，恢复后新generation阻断旧实例。

上文“后续迁移与集成门槛”仍保留为整体要求清单；其中后端部分已实施，浏览器近期窗口、完整历史消费者、耐久待提交、启用前规模及浏览器检查尚未全部完成。
