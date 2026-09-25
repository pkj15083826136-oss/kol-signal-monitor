# 免费资金流生产采集器运行手册

## 生产拓扑与发布闸门

生产方案为 `GitHub Actions 标准 Ubuntu runner → Site /api/fund-flows/collect → 生产 D1 → /flows`。主工作流是 `.github/workflows/public-flow-continuous.yml`，不依赖所有者电脑；电脑关闭后仍会由 GitHub 托管 runner 运行。仓库为 public，GitHub 官方当前说明 public repository 的 standard GitHub-hosted runners 免费且不限分钟，预计增量运行费用为 0 美元。默认使用无需注册或密钥的 Tenderly 公共 Ethereum 网关，费用 0 美元；该匿名端点没有公开固定配额或 SLA，因此任何失败都会保留游标并在页面显式降级。生产 D1 是否产生增量费用取决于 Site 所在 Cloudflare 账户用量，免费层为每天 500 万行读取、10 万行写入和总计 5 GB 存储，超限时请求会失败而不是伪造零结果。

本分支尚未迁移生产 D1、合并或发布，因此该拓扑当前是“代码与本地真实数据已验证、生产链路待发布”。只有完成项目规定回归、所有者亲自完成 EVM/Solana 只读连接烟测、迁移 `0020`—`0023`、发布同一个 Site 并启用 `PUBLIC_FLOW_ENABLED=true` 后，才能把它称为线上持续采集。

## 单实例、重启与补采

- 工作流固定 concurrency group `public-flow-production-singleton`，`cancel-in-progress: false`，同一时间只有一个生产采集任务。
- 每 5 分钟产生一个接棒调度；每个 runner 持续轮询约 340 分钟并在 GitHub-hosted runner 的 6 小时上限前主动退出。排队和调度没有服务等级保证，接棒可能延迟数分钟。
- 采集器每 60 秒获取已确认区块，D1 中 `fund_flow_collector_state.cursor` 是唯一续跑游标。只有传输事件、铸造事件和健康状态全部写入成功后才推进；RPC、Site API 或 D1 失败会从旧游标重扫。地址集合指纹发生变化时，游标自动回退并重扫最近 7,200 个确认区块；事件唯一键保证补采和重试不会重复入库。
- 连续失败按 1、2、4 分钟退避，最多 5 分钟；默认连续 5 轮失败后进程以失败退出，GitHub Actions 标记 failed 并按账户通知设置发出失败通知。工作流超时或进程崩溃也会失败，下一轮调度自动重启。
- `/api/fund-flows` 暴露最近心跳、成功时间、游标、错误和覆盖 JSON；网页在心跳超过 3 分钟时显示“采集心跳已过期”，空结果不解释为零流量。
- 脚本仍保留 checkout 内 `.sites-runtime/public-flow-collector.lock`，用于本地验收防重复；跨机器的生产单实例由 Actions concurrency 保证。

## 生产配置

| 配置 | 位置 | 说明 |
| --- | --- | --- |
| `SITE_URL` | GitHub Actions secret | 原 Site 根地址；不得指向 `127.0.0.1` |
| `MONITOR_SECRET` | GitHub Actions secret 与 Site secret | 采集写入鉴权；两端值一致，不写日志或仓库 |
| `PUBLIC_FLOW_ENABLED` | GitHub Actions repository variable | 最终验收前保持 `false`，发布后才改为 `true` |
| `ETHEREUM_RPC_URL` | 可选 GitHub Actions secret/variable | 默认 Tenderly 公共主网网关；不需要为默认值注册 |
| `PUBLIC_FLOW_CONTINUOUS` | 工作流固定 | `true` |
| `PUBLIC_FLOW_POLL_MS` | 工作流固定 | `60000` |
| `PUBLIC_FLOW_RPC_BATCH_SIZE` | 可选工作流变量 | 默认及硬上限 `5`；已实测默认网关接受 5 项批量区块查询 |
| `COLLECTOR_DURATION_MS` | 工作流固定 | `20400000`，约 340 分钟后正常交棒 |
| `PUBLIC_FLOW_MAX_FAILURES` | 工作流固定 | `5` |

## 当前真实覆盖

- 链：Ethereum mainnet。
- 地址：Binance 官方 PoR API 当前 32 个直接 ETH 地址；Bybit 官方 PoR 审计文件 7 个 Ethereum 地址；OKX 官方 2026-09-08 PoR 储备 CSV 中按 ETH 余额排序的前 20 个 Ethereum 地址（快照区块 25,926,528，官方文件共披露 8,817 个 ETH 地址）。
- 资产：USDT、USDC；UNI 已完成事件时 Chainlink UNI/USD 历史区块估值，但尚未捕获达到 1,000 万美元门槛的真实样本。
- 增发：USDT `Issue(uint256)` 与 USDC `Mint(address,address,uint256)` 原生合约事件，必须严格大于 1 亿美元；与普通 Transfer 分流去重。链上铸造不等于已进入流通，库存状态保持待核实。
- 明确不覆盖：未披露充值地址、其他链、无可靠事件时价格的代币、合约路由及链下内部账务。OKX 仅覆盖上述 20 地址子集；Coinbase、Upbit、Kraken、Bitget、Gate、MEXC、HTX 当前地址数为 0，网页显示覆盖不足。

## 故障恢复步骤

1. 查看 Actions 的 `Public fund-flow continuous collector` 失败步骤和 Site `/api/fund-flows` 健康状态。
2. 不手工跳过 D1 游标；确认 RPC 与 Site API 恢复后，重新运行失败工作流或等待下一次调度。
3. 若官方地址列表异常缩减到上次 Binance 数量的 70% 以下，采集器拒绝推进游标；先核对官方 PoR 响应。
4. 若心跳过期但工作流仍显示运行，取消异常任务；concurrency 队列中的下一任务会接棒并从 D1 游标补采。
5. 若匿名 RPC 持续失败，保持失败可见并等待下一次退避重试；不要自动切到条款不适合自动采集的公共源，也不要清空游标。
6. 若免费 D1 达到每日限制，保持失败可见，等 UTC 00:00 重置或评估 Cloudflare Workers Paid（官方最低月费 5 美元）；不要清空游标或写零值。
