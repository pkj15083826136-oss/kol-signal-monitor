$ErrorActionPreference = "Stop"
$stateRoot = Join-Path $env:LOCALAPPDATA "KOLSignalMonitor"
$pidFile = Join-Path $stateRoot "ave-collector.pid"
if (Test-Path -LiteralPath $pidFile) { throw "请先运行 停止-Ave-Smart采集器.ps1。" }
$answer = Read-Host "将删除当前Windows用户的Ave浏览器会话和加密采集凭据；输入 DELETE 确认"
if ($answer -ne "DELETE") { Write-Host "已取消。"; exit 0 }
$profileDir = Join-Path $stateRoot "AveSmartProfile"
$secretFile = Join-Path $stateRoot "ave-collector-secret.dpapi"
if (Test-Path -LiteralPath $profileDir) { Remove-Item -LiteralPath $profileDir -Recurse -Force }
if (Test-Path -LiteralPath $secretFile) { Remove-Item -LiteralPath $secretFile -Force }
Write-Host "Ave本机会话和采集凭据已清除。"
