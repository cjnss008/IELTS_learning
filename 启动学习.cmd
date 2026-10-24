@echo off
chcp 65001 >nul
title IELTS Learning - 本地学习服务
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22 或更新的 LTS 版本，然后重新打开本文件。
  echo https://nodejs.org/
  pause
  exit /b 1
)
echo 正在启动本地学习服务。请保持此窗口打开。
echo 服务启动后，在浏览器打开显示的 Local 地址。
node "%~dp0server\server.cjs"
if errorlevel 1 pause
