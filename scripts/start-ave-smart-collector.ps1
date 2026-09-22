$ErrorActionPreference = "Stop"
if (-not $env:AVE_COLLECTOR_PROFILE_DIR) { throw "请将 AVE_COLLECTOR_PROFILE_DIR 设置为仓库外的本机目录" }
if (-not $env:AVE_COLLECTOR_SITE_URL) { throw "请设置 AVE_COLLECTOR_SITE_URL" }
if (-not $env:MONITOR_SECRET) { throw "请在本机环境变量中设置 MONITOR_SECRET，不要写入脚本" }
node "$PSScriptRoot\ave-smart-collector.mjs"
