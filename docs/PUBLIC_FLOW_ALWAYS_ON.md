# 免费资金流单实例采集器运行手册

## 结论

现有 Windows 常开机器具备 Node.js、仓库 checkout 和可访问本地/远端 Site API 的运行条件，可以独立运行 `scripts/collect-public-stablecoin-flows.mjs`。脚本使用 `.sites-runtime/public-flow-collector.lock` 做同一 checkout、同一机器上的单实例保护；崩溃遗留且 PID 已不存在的锁会在下次启动时清理。它不是跨机器分布式锁，因此不要同时启用 GitHub job 与常开机器实例。

BlockPI 官方提供无需账户或密钥的公共 Ethereum 端点，并明确供开发者构建应用；采集器只读取公开链上数据，不代理 RPC。`PUBLIC_FLOW_ENABLED` 目前仍保持关闭，因为本分支没有通过最终生产发布验收，而不是等待所有者注册、购买或写授权邮件。

## 必需配置

| 变量 | 值 / 说明 |
| --- | --- |
| `SITE_URL` | 目标 Site 根 URL；本地预览为 `http://127.0.0.1:8787` |
| `MONITOR_SECRET` | 既有采集 API 只读写入鉴权；只放受保护的机器环境，不写脚本、任务参数或日志 |
| `ETHEREUM_RPC_URL` | 可选；不配置时使用 BlockPI 公共 Ethereum endpoint，无需注册或密钥 |
| `PUBLIC_FLOW_CONTINUOUS` | 常驻单实例设为 `true` |
| `PUBLIC_FLOW_POLL_MS` | 默认 `60000`；不得为规避限流而开多个进程 |
| `PUBLIC_FLOW_INITIAL_BACKFILL_BLOCKS` | 默认 `7200` |
| `PUBLIC_FLOW_CONFIRMATIONS` | 默认 `12` |
| `PUBLIC_FLOW_BLOCK_CHUNK` | 默认 `100`、最大 `500`；公共端点超时则调小 |
| `PUBLIC_FLOW_ADDRESS_BATCH` | 默认 `8`、最大 `16`；控制单次日志主题中的已知地址数 |
| `PUBLIC_FLOW_RPC_BATCH_SIZE` | 默认且最大 `10`，符合 BlockPI 公共端点 batch 限制 |
| `PUBLIC_FLOW_LOCK_FILE` | 可选；默认在当前 checkout 的 `.sites-runtime` 下 |

## 启动与守护

1. 用专用、非管理员 Windows 用户运行，仓库目录只授予该用户所需权限。
2. 将环境变量配置到该用户的受保护运行环境；不要把 `MONITOR_SECRET` 放入 Git、聊天、计划任务命令行或桌面快捷方式。
3. 在该 checkout 中先运行一次非连续模式，确认页面健康状态、D1 游标和真实交易链接均正确。
4. 创建“系统启动或用户登录时”运行的 Windows 计划任务，操作仅为 Node 执行采集脚本，工作目录固定为仓库根目录；勾选“若任务已运行则不启动新实例”和失败后 1、5、15 分钟重启。
5. 设置 `PUBLIC_FLOW_CONTINUOUS=true` 后启动。脚本每轮一分钟；连续失败按 1、2、4 分钟递增并封顶 5 分钟。下一次成功从 Site D1 保存的区块游标继续，失败分片不会推进游标。
6. 不要同时启用 `.github/workflows/market-intelligence.yml` 的 public-flow job。若迁移运行机器，先停旧任务并确认锁文件释放，再启动新任务。

## 故障恢复

- 正常重启：停止计划任务，等待 Node 进程退出；锁文件会释放。重启后从 D1 游标继续。
- 进程崩溃：计划任务按退避重启；新进程确认旧 PID 不存在后清理陈旧锁。
- RPC 失败或部分响应：健康状态变为 `degraded/reconnecting`，当前分片游标不推进；恢复后重扫并由事件键去重。
- Site API/D1 不可用：不推进游标；恢复后从上次成功区块补采。
- 地址披露异常缩减：当 Binance PoR 地址数量低于上次 70% 时停止推进并显示错误，避免把部分地址响应当完整覆盖。
- 长时间停机：默认按游标补采；若 RPC 不支持所需历史范围，保持失败可见，不手动跳过游标，也不把缺口显示为零流量。
- 双实例：第二个进程在取得 RPC 数据前直接失败并报告现有 PID。只在确认该 PID 已不存在时才删除锁；不要以复制 checkout 的方式规避锁。
