$ErrorActionPreference = "Stop"
$stateRoot = Join-Path $env:LOCALAPPDATA "KOLSignalMonitor"
$secretFile = Join-Path $stateRoot "ave-collector-secret.dpapi"
if (-not (Test-Path -LiteralPath $secretFile)) { throw "请先运行一次 启动-Ave-Smart采集器.bat 完成本机加密凭据配置。" }
$supervisor = Join-Path $PSScriptRoot "run-ave-smart-supervisor.ps1"
$nodePath = (Get-Command node -ErrorAction Stop).Source
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$supervisor`" -NodePath `"$nodePath`" -StateRoot `"$stateRoot`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName "KOLSignalMonitor-AveSmart" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "Ave Smart已设置为当前Windows用户登录后自动启动，并在异常退出后自动重启。"
