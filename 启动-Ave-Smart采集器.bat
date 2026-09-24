@echo off
chcp 65001 >nul
title KOL Signal Monitor - Ave Smart Collector
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-ave-smart-supervisor.ps1"
if errorlevel 1 (
  echo.
  echo 启动失败，请查看上方错误信息。
  pause
)
