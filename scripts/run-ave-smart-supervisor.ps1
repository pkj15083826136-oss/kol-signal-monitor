param([string]$NodePath = "node", [string]$StateRoot = "")
$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($StateRoot)) { $StateRoot = Join-Path $env:LOCALAPPDATA "KOLSignalMonitor" }
$stateRoot = $StateRoot
$profileDir = Join-Path $stateRoot "AveSmartProfile"
$secretFile = Join-Path $stateRoot "ave-collector-secret.dpapi"
$supervisorPidFile = Join-Path $stateRoot "ave-supervisor.pid"
$supervisorLogFile = Join-Path $stateRoot "ave-supervisor.log"
$supervisorLockFile = Join-Path $stateRoot "ave-supervisor.lock"
$siteUrl = "https://kol-signal-monitor.pkj15083826136.chatgpt.site"
$projectRoot = Split-Path $PSScriptRoot -Parent

New-Item -ItemType Directory -Force -Path $stateRoot, $profileDir | Out-Null
try { $supervisorLock = [System.IO.File]::Open($supervisorLockFile, 'OpenOrCreate', 'ReadWrite', 'None') }
catch { Write-Host "Ave Smart supervisor is already running."; exit 0 }
Set-Content -LiteralPath $supervisorPidFile -Value $PID -Encoding ascii

function Write-SupervisorLog([string]$Message) {
  Add-Content -LiteralPath $supervisorLogFile -Value "$(Get-Date -Format o) $Message" -Encoding UTF8
}

function Stop-StaleCollectorBrowsers {
  Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains("--user-data-dir=$profileDir") } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

try {
  if (-not (Test-Path -LiteralPath $secretFile)) {
    throw "Collector credential is not configured. Run the interactive launcher once."
  }
  $secureSecret = (Get-Content -Raw -LiteralPath $secretFile).Trim() | ConvertTo-SecureString
  $plainSecret = [System.Net.NetworkCredential]::new('', $secureSecret).Password
  if ([string]::IsNullOrWhiteSpace($plainSecret)) { throw "The local collector credential is empty." }
  $env:AVE_COLLECTOR_SITE_URL = $siteUrl
  $env:AVE_COLLECTOR_SECRET = $plainSecret
  $env:AVE_COLLECTOR_PROFILE_DIR = $profileDir
  $env:AVE_COLLECTOR_STATE_DIR = $stateRoot
  Write-SupervisorLog "supervisor_started pid=$PID"
  while ($true) {
    $stalePid = Join-Path $stateRoot "ave-collector.pid"
    if (Test-Path -LiteralPath $stalePid) {
      $collectorPid = [int](Get-Content -Raw -LiteralPath $stalePid)
      if (-not (Get-Process -Id $collectorPid -ErrorAction SilentlyContinue)) { Remove-Item -LiteralPath $stalePid -Force -ErrorAction SilentlyContinue }
    }
    $process = Start-Process -FilePath $NodePath -ArgumentList @((Join-Path $PSScriptRoot "ave-smart-collector.mjs")) -WorkingDirectory $projectRoot -NoNewWindow -PassThru -Wait
    Write-SupervisorLog "collector_exited pid=$($process.Id) exit=$($process.ExitCode)"
    Stop-StaleCollectorBrowsers
    if ($process.ExitCode -eq 0) { break }
    Start-Sleep -Seconds 10
  }
} finally {
  Write-SupervisorLog "supervisor_stopped pid=$PID"
  Remove-Item Env:\AVE_COLLECTOR_SECRET -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $supervisorPidFile -Force -ErrorAction SilentlyContinue
  $supervisorLock.Dispose()
  $plainSecret = $null
  $secureSecret = $null
}
