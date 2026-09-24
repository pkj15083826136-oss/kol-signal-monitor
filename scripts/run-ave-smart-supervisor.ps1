$ErrorActionPreference = "Stop"
$stateRoot = Join-Path $env:LOCALAPPDATA "KOLSignalMonitor"
$profileDir = Join-Path $stateRoot "AveSmartProfile"
$secretFile = Join-Path $stateRoot "ave-collector-secret.dpapi"
$supervisorPidFile = Join-Path $stateRoot "ave-supervisor.pid"
$siteUrl = "https://kol-signal-monitor.pkj15083826136.chatgpt.site"
$projectRoot = Split-Path $PSScriptRoot -Parent

New-Item -ItemType Directory -Force -Path $stateRoot, $profileDir | Out-Null
if (Test-Path -LiteralPath $supervisorPidFile) {
  $existingPid = [int](Get-Content -Raw -LiteralPath $supervisorPidFile)
  $existing = Get-CimInstance Win32_Process -Filter "ProcessId = $existingPid" -ErrorAction SilentlyContinue
  if ($existing -and $existing.CommandLine -match 'run-ave-smart-supervisor\.ps1') { Write-Host "Ave Smart守护进程已在运行。"; exit 0 }
  Remove-Item -LiteralPath $supervisorPidFile -Force -ErrorAction SilentlyContinue
}
Set-Content -LiteralPath $supervisorPidFile -Value $PID -Encoding ascii

try {
  if (-not (Test-Path -LiteralPath $secretFile)) {
    Write-Host "尚未配置本机采集凭据；输入仅由Windows当前用户加密保存。" -ForegroundColor Yellow
    $secure = Read-Host -AsSecureString "AVE_COLLECTOR_SECRET"
    $secure | ConvertFrom-SecureString | Set-Content -LiteralPath $secretFile -Encoding UTF8
  }
  $secureSecret = (Get-Content -Raw -LiteralPath $secretFile).Trim() | ConvertTo-SecureString
  $plainSecret = [System.Net.NetworkCredential]::new('', $secureSecret).Password
  if ([string]::IsNullOrWhiteSpace($plainSecret)) { throw "本机采集凭据为空。" }
  $env:AVE_COLLECTOR_SITE_URL = $siteUrl
  $env:AVE_COLLECTOR_SECRET = $plainSecret
  $env:AVE_COLLECTOR_PROFILE_DIR = $profileDir
  $env:AVE_COLLECTOR_STATE_DIR = $stateRoot
  while ($true) {
    $stalePid = Join-Path $stateRoot "ave-collector.pid"
    if (Test-Path -LiteralPath $stalePid) {
      $collectorPid = [int](Get-Content -Raw -LiteralPath $stalePid)
      if (-not (Get-Process -Id $collectorPid -ErrorAction SilentlyContinue)) { Remove-Item -LiteralPath $stalePid -Force -ErrorAction SilentlyContinue }
    }
    $process = Start-Process -FilePath "node" -ArgumentList @((Join-Path $PSScriptRoot "ave-smart-collector.mjs")) -WorkingDirectory $projectRoot -NoNewWindow -PassThru -Wait
    if ($process.ExitCode -eq 0) { break }
    Start-Sleep -Seconds 10
  }
} finally {
  Remove-Item Env:\AVE_COLLECTOR_SECRET -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $supervisorPidFile -Force -ErrorAction SilentlyContinue
  $plainSecret = $null
  $secureSecret = $null
}
