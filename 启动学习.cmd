@echo off
chcp 65001 >nul
title IELTS Learning - Local Service
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22 or a newer LTS version, then reopen this file.
  echo https://nodejs.org/
  pause
  exit /b 1
)
echo Checking the local learning service and opening the home page...
node "%~dp0tools\start-learning.cjs"
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
