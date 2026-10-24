@echo off
chcp 65001 >nul
title IELTS Learning - Local Service
setlocal
set "NODE_EXE=node"
where node >nul 2>nul
if not errorlevel 1 goto run
set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if exist "%NODE_EXE%" goto run
echo Please install Node.js 22 or a newer LTS version, then reopen this file.
echo https://nodejs.org/
pause
exit /b 1
:run
echo Checking the local learning service and opening the home page...
"%NODE_EXE%" "%~dp0tools\start-learning.cjs"
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
