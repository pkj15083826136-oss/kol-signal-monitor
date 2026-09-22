$ErrorActionPreference = "Stop"
$pidFile = Join-Path $env:LOCALAPPDATA "KOLSignalMonitor\ave-collector.pid"
if (-not (Test-Path -LiteralPath $pidFile)) {
  Write-Host "Ave Smart采集器当前未运行。"
  exit 0
}
$collectorPid = [int](Get-Content -Raw -LiteralPath $pidFile)
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $collectorPid" -ErrorAction SilentlyContinue
if (-not $process -or $process.CommandLine -notmatch 'ave-smart-collector\.mjs') {
  Remove-Item -LiteralPath $pidFile -Force
  throw "PID文件不是当前采集器进程，已安全清理；未终止任何进程。"
}
Stop-Process -Id $collectorPid
Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
Write-Host "Ave Smart采集器已停止。"
