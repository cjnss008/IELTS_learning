# 本机英文识别依赖

本目录只含公开程序、模型及许可证，不含学习者录音或密钥。

- whisper.cpp v1.8.2，提交4979e04f5dcaccb36057e059bbaed8a2f5288315，MIT。静态构建程序、可复现构建脚本、最小源码补丁及许可证位于zip内。
- OpenAI Whisper base.en，模型来源和许可见model-card.txt及LICENSES/openai-whisper-MIT.txt。
- 固定大小和SHA-256见server/local-asr-lock.json。安装前、安装后均校验；模型和程序包均通过Git LFS保存。ZIP采用保守CPU指令集和静态C++运行库，使用Windows系统自带UCRT，不要求额外安装VC++运行库。

课程服务在已配置的用户文件夹/runtime/local-asr-v1准备运行副本；隔离开发及测试使用自己的用户文件夹。不会迁移旧配置或打开麦克风。原音仅在用户运行目录的单任务临时文件中处理，结束或取消后清理；中断遗留目录在确认不属于活动进程且超过24小时后保守回收。正式录音仍按原用户数据协议保存。

支持Windows 10/11 x64。已用公开英语样本在当前Windows ACP936的中文、空格及NAS UNC路径进行真实CPU识别；没有验证家人麦克风、所有Windows代码页或教学评分准确性。程序的路径元数据编码兼容处理不会改写实际识别文本。自动转写可能漏词或改写，不是发音诊断或雅思成绩。

程序来源：https://github.com/ggml-org/whisper.cpp/tree/v1.8.2
模型来源：https://huggingface.co/ggerganov/whisper.cpp/blob/main/ggml-base.en.bin
模型原始项目：https://github.com/openai/whisper
