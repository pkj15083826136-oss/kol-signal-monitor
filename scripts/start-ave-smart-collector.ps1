$ErrorActionPreference = "Stop"
$stateRoot = Join-Path $env:LOCALAPPDATA "KOLSignalMonitor"
$profileDir = Join-Path $stateRoot "AveSmartProfile"
$secretFile = Join-Path $stateRoot "ave-collector-secret.dpapi"
$siteUrl = "https://kol-signal-monitor.pkj15083826136.chatgpt.site"

function Write-Step([string]$message) {
  Write-Host "[Ave Smart] $message" -ForegroundColor Cyan
}

Write-Step "正在检查 Node.js、pnpm、Playwright 和 Microsoft Edge…"
$nodeVersion = (& node --version 2>$null)
if (-not $nodeVersion) { throw "未找到 Node.js，请先安装项目要求的 Node.js 版本。" }
$major = [int](($nodeVersion -replace '^v', '').Split('.')[0])
if ($major -lt 22) { throw "Node.js 版本过低：$nodeVersion，需要 22 或更高版本。" }
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { throw "未找到 pnpm。" }
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  & node -e "import('@playwright/test').then(()=>process.exit(0)).catch(()=>process.exit(1))"
  if ($LASTEXITCODE -ne 0) { throw "Playwright 未安装，请先运行 pnpm install。" }
} finally {
  Pop-Location
}
$edgePath = Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path -LiteralPath $edgePath)) {
  $edgePath = Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"
}
if (-not (Test-Path -LiteralPath $edgePath)) { throw "未找到 Microsoft Edge。" }

New-Item -ItemType Directory -Force -Path $stateRoot, $profileDir | Out-Null
$secureSecret = $null
if (Test-Path -LiteralPath $secretFile) {
  Write-Step "正在读取仅限当前Windows用户的加密采集凭据…"
  $secureSecret = Get-Content -Raw -LiteralPath $secretFile | ConvertTo-SecureString
} else {
  Write-Host "尚未配置本机采集凭据。请在此窗口粘贴 AVE_COLLECTOR_SECRET；输入不会显示，也不会写入仓库。" -ForegroundColor Yellow
  $secureSecret = Read-Host -AsSecureString "AVE_COLLECTOR_SECRET"
  $secureSecret | ConvertFrom-SecureString | Set-Content -LiteralPath $secretFile -Encoding UTF8
}

$plainSecret = [System.Net.NetworkCredential]::new('', $secureSecret).Password
if ([string]::IsNullOrWhiteSpace($plainSecret)) { throw "采集凭据为空。" }

Write-Step "正在验证生产采集端点…"
$headers = @{ Authorization = "Bearer $plainSecret" }
$body = @{
  source = "ave_smart_browser"
  status = "degraded"
  error = "collector_preflight"
  collector = @{
    instanceId = "preflight"
    connectionStatus = "starting"
    loginStatus = "unknown"
    websocketStatus = "unknown"
    capturedCount = 0
    uploadedCount = 0
    dedupCount = 0
  }
  candidates = @()
} | ConvertTo-Json -Depth 4
try {
  Invoke-RestMethod -Uri "$siteUrl/api/radar/collect" -Method Post -Headers $headers -ContentType "application/json" -Body $body | Out-Null
} catch {
  throw "生产采集端点自检失败。请确认网络和本机加密凭据后重试。"
}

$env:AVE_COLLECTOR_SITE_URL = $siteUrl
$env:AVE_COLLECTOR_SECRET = $plainSecret
$env:AVE_COLLECTOR_PROFILE_DIR = $profileDir
$env:AVE_COLLECTOR_STATE_DIR = $stateRoot
Write-Step "自检通过。即将打开可见的 Ave Smart 浏览器；如页面要求登录，请只在浏览器内亲自完成。"
Write-Host "关闭此窗口会停止采集器；本机会话保存在 $profileDir。" -ForegroundColor Gray
try {
  & node "$PSScriptRoot\ave-smart-collector.mjs"
} finally {
  Remove-Item Env:\AVE_COLLECTOR_SECRET -ErrorAction SilentlyContinue
  $plainSecret = $null
  $secureSecret = $null
}
