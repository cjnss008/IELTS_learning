@echo off
chcp 65001 >nul
title IELTS Learning - Local Service
setlocal
set "BOOTSTRAP_PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%BOOTSTRAP_PS%" (
  echo [ERROR] Windows PowerShell 5.1 is required but could not be found.
  goto failed
)
echo Checking dependencies and starting the learning service...
"%BOOTSTRAP_PS%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\bootstrap-runtime.ps1" -ProjectRoot "%~dp0."
if errorlevel 1 goto failed
exit /b 0
:failed
echo.
echo Startup failed. The error is shown above. This window will remain open.
pause
exit /b 1
