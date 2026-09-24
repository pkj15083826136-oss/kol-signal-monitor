$ErrorActionPreference = "Stop"
$stateRoot = Join-Path $env:LOCALAPPDATA "KOLSignalMonitor"
$secretFile = Join-Path $stateRoot "ave-collector-secret.dpapi"
if (-not (Test-Path -LiteralPath $secretFile)) { throw "请先运行一次 启动-Ave-Smart采集器.bat 完成本机加密凭据配置。" }
$supervisor = Join-Path $PSScriptRoot "run-ave-smart-supervisor.ps1"
$nodePath = (Get-Command node -ErrorAction Stop).Source
$taskLog = Join-Path $stateRoot "ave-task.log"
$taskCommand = "& '$supervisor' -NodePath '$nodePath' -StateRoot '$stateRoot' *>> '$taskLog'"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command `"$taskCommand`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName "KOLSignalMonitor-AveSmart" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$runCommand = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$supervisor`" -NodePath `"$nodePath`" -StateRoot `"$stateRoot`""
New-Item -Path $runKey -Force | Out-Null
Set-ItemProperty -Path $runKey -Name "KOLSignalMonitorAveSmart" -Value $runCommand
Write-Host "Ave Smart已设置为当前Windows用户登录后自动启动，并在异常退出后自动重启。"
