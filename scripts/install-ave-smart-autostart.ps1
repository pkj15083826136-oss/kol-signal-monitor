$ErrorActionPreference = "Stop"
$stateRoot = Join-Path $env:LOCALAPPDATA "KOLSignalMonitor"
$secretFile = Join-Path $stateRoot "ave-collector-secret.dpapi"
if (-not (Test-Path -LiteralPath $secretFile)) { throw "请先运行一次 启动-Ave-Smart采集器.bat 完成本机加密凭据配置。" }
$supervisor = Join-Path $PSScriptRoot "run-ave-smart-supervisor.ps1"
$nodePath = (Get-Command node -ErrorAction Stop).Source
$launcher = Join-Path $stateRoot "ave-task-launcher.ps1"
$escapedSupervisor = $supervisor.Replace("'", "''")
$escapedNode = $nodePath.Replace("'", "''")
$escapedState = $stateRoot.Replace("'", "''")
Set-Content -LiteralPath $launcher -Encoding Unicode -Value "& '$escapedSupervisor' -NodePath '$escapedNode' -StateRoot '$escapedState'"
if (Get-ScheduledTask -TaskName "KOLSignalMonitor-AveSmart" -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName "KOLSignalMonitor-AveSmart" -Confirm:$false
}
$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$runCommand = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""
New-Item -Path $runKey -Force | Out-Null
Set-ItemProperty -Path $runKey -Name "KOLSignalMonitorAveSmart" -Value $runCommand
Write-Host "Ave Smart已设置为当前Windows用户登录后自动启动；内部守护会在子进程异常退出后自动重启。"
