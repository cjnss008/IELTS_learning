# 独立开发与稳定发布

正式目录 `\\mynas\family\IELTS_52篇学习包` 固定使用 `main`，保留家人的现有学习数据与端口 `8765`。开发目录 `\\mynas\family\IELTS_learning开发` 使用 `develop`，开发服务固定为 `127.0.0.1:18765`。不要切换正式工作树的分支。

## 首次准备

开发工具需要 Node.js 22 或更新版本。使用本机磁盘上全新、项目外的专用目录；不得复制正式用户数据或凭据。PowerShell 示例：

```powershell
Set-Location -LiteralPath '\\mynas\family\IELTS_learning开发'
$devData = Join-Path $env:LOCALAPPDATA 'IELTS-learning-development\family-synthetic'
node tools/start-development.cjs --data-dir $devData --init --check
node tools/start-development.cjs --data-dir $devData --init
```

`--check` 只核对启动条件，不创建目录、不启动服务。`--init` 只接受不存在或空的目录；成功后写入项目身份标记。再次启动使用同一个明确路径：

```powershell
node tools/start-development.cjs --data-dir $devData
```

服务在当前终端前台运行，Ctrl+C 停止它。工具不会打开浏览器，也不会接管、停止或重启端口上的其他服务。端口被占用时会明确失败；请关闭自己先前的开发终端。运行时不采纳环境变量 `IELTS_PORT` 或 `IELTS_DATA_DIR` 的值。

开发目录的普通 `启动学习.cmd` 在创建默认数据目录之前拒绝执行，直接运行 `tools/start-learning.cjs` 也会拒绝。正式目录的普通入口保持不变。

## 数据与配置隔离

开发数据目录必须是本机明确绝对路径，不能是 NAS UNC、代码目录、其父目录或任何名为 `用户数据` 的路径。目录联接和符号链接也不接受。已存在且未带正确开发标记的非空目录不会被采用；其它项目的开发目录不会复用。

开发服务显式关闭旧用户数据、教材副本和 LOCALAPPDATA 凭据迁移；配置路径只指向开发目录，默认不持久保存凭据。现有正式记录与密文不读、不复制。自动测试继续使用临时目录、合成配置和模拟上游；真实服务验证另行明确安排，不能把模拟测试记成真实服务验证。

CLI 启动不执行浏览器操作。后续人工验收开发页面时应确认使用开发端口，保持开发缓存与正式学习记录分离，不从正式浏览器导入记录。

## develop → main 发布节奏

1. 在 `develop` 完成每个独立补丁，按既有约定更新 VERSION、变更说明和相关测试，保留每个补丁提交。临时数据、配置和测试输出不进入提交。
2. 从稳定基线 `0.0.70` 起，常规合并检查点为 `0.0.80`、`0.0.90`，之后每 10 个补丁一次。正式目录在其间继续使用已验收稳定版。
3. 检查点运行 `node tools/test.cjs`、`node tools/check.cjs`、正式课程构建、课程与题质审计，以及获授权的受影响页面验收。检查未通过则继续修复；版本数不替代验收。
4. 若 `main` 有已授权的紧急修复，先将 `main` 合回 `develop`，解决冲突并重跑验证。再由发布负责人审查精确差异、数据兼容、资源完整性和回退依据。
5. 在正式工作树仅执行已审核的 `develop` 合并，优先 `git merge --ff-only develop` 保留全部补丁历史；不能快进时先回开发树处理历史，不对正式树强制重置。正式用户目录、配置与浏览器记录保持原位，不复制开发数据。
6. 当前用户已授权按上述常规检查点，在完整验证通过后合并、创建对应版本的注释标签并推送，无须重复请求同一发布授权。不要 squash 小版本历史，不强制推送。

本文件描述操作流程；开发启动工具本身不会执行任何 Git 操作、版本修改、合并或发布。
