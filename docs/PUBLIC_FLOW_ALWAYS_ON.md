# 免费资金流生产采集器运行手册

## 生产拓扑与发布闸门

生产方案为 `GitHub Actions 标准 Ubuntu runner → Site /api/fund-flows/collect → 生产 D1 → /flows`。主工作流是 `.github/workflows/public-flow-continuous.yml`，准确定位为**定时接棒＋游标补采**，不依赖所有者电脑；电脑关闭后仍可由 GitHub 托管 runner 运行，但不承诺全天无空窗或稳定一分钟发现。仓库为 public，GitHub 官方当前说明 public repository 的 standard GitHub-hosted runners 免费且不限分钟，预计增量运行费用为 0 美元。默认使用无需注册或密钥的 Tenderly 公共 Ethereum 网关，费用 0 美元；该匿名端点没有公开固定配额或 SLA，因此任何失败都会保留游标并在页面显式降级。生产 D1 是否产生增量费用取决于 Site 所在 Cloudflare 账户用量，免费层为每天 500 万行读取、10 万行写入和总计 5 GB 存储，超限时请求会失败而不是伪造零结果。

本分支尚未迁移生产 D1、合并或发布，因此该拓扑当前是“代码与本地真实数据已验证、生产链路待发布”。本地数据库的记录不能称为生产数据。只有完成项目规定回归、所有者亲自完成 EVM/Solana 只读连接烟测、迁移 `0020`—`0024`、发布同一个 Site 并启用 `PUBLIC_FLOW_ENABLED=true` 后，才能把它称为线上定时接棒采集。

## 单实例、重启与补采

- 工作流固定 concurrency group `public-flow-production-singleton`，`cancel-in-progress: false`，同一时间只有一个生产采集任务。
- 每 5 分钟产生一个接棒调度；每个 runner 持续轮询约 340 分钟并在 GitHub-hosted runner 的 6 小时上限前主动退出。GitHub 官方明确说明定时任务在高负载时会延迟，负载足够高时部分排队任务可能被丢弃；因此接棒空窗没有可保证的上限。
- 同一 concurrency group 默认最多一个运行中和一个等待中任务；新的等待任务会取消并替换旧的等待任务。`cancel-in-progress: false` 只保护正在运行的任务，不等于保留所有五分钟触发。被替换或丢弃的调度不会丢链上事件，因为下一次成功任务从生产 D1 游标补采，但会增加发现延迟。
- 采集器每 60 秒获取已确认区块，D1 中 `fund_flow_collector_state.cursor` 是唯一续跑游标。只有传输事件、铸造事件和健康状态全部写入成功后才推进；RPC、Site API 或 D1 失败会从旧游标重扫。地址集合指纹发生变化时，游标自动回退并重扫最近 7,200 个确认区块；事件唯一键保证补采和重试不会重复入库。
- 2026-09-25 实测 Tenderly 对高流量 `eth_getLogs` 查询返回 `-32602` 并注明“超过 20,000 条结果”及建议子区间。采集器现会递归二分该区块范围并合并结果，不推进游标直到全部子区间成功；修复后从旧游标补采 1,015 个区块并恢复健康。该结果上限不是匿名请求配额，Tenderly 仍未公布匿名 429 阈值。
- 连续失败按 1、2、4 分钟退避，最多 5 分钟；默认连续 5 轮失败后进程以失败退出，GitHub Actions 标记 failed 并按账户通知设置发出失败通知。工作流超时或进程崩溃也会失败，下一轮调度自动重启。
- `/api/fund-flows` 暴露最近心跳、成功时间、游标、错误和覆盖 JSON；网页在最近心跳或最近成功时间超过 3 分钟、或采集状态不是健康时显示“数据已陈旧”。Tenderly 返回 HTTP 429/限流时显示“公共 RPC 触发限流，正在退避并从游标补采”；超时时显示对应中文提示。陈旧期间列表只代表上次成功前的历史数据，空结果不解释为零流量。
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
- 增发：USDT `Issue(uint256)` 与 USDC `Mint(address,address,uint256)` 原生合约事件，必须严格大于 1 亿美元；还必须核对交易直接调用代币合约、函数选择器、区块前后 `totalSupply` 等额增量，USDC 另核对同笔零地址 Transfer。与普通 Transfer 分流去重。链上铸造不等于已进入流通，库存状态保持待核实。
- 明确不覆盖：未披露充值地址、其他链、无可靠事件时价格的代币、合约路由及链下内部账务。OKX 仅覆盖上述 20 地址子集；Coinbase、Upbit、Kraken、Bitget、Gate、MEXC、HTX 当前地址数为 0，网页显示覆盖不足。

## 故障恢复步骤

1. 查看 Actions 的 `Public fund-flow scheduled handoff collector` 失败步骤和 Site `/api/fund-flows` 健康状态。
2. 不手工跳过 D1 游标；确认 RPC 与 Site API 恢复后，重新运行失败工作流或等待下一次调度。
3. 若官方地址列表异常缩减到上次 Binance 数量的 70% 以下，采集器拒绝推进游标；先核对官方 PoR 响应。
4. 若心跳过期但工作流仍显示运行，取消异常任务；concurrency 队列中的下一任务会接棒并从 D1 游标补采。
5. 若匿名 RPC 持续失败，保持失败可见并等待下一次退避重试；不要自动切到条款不适合自动采集的公共源，也不要清空游标。
6. 若免费 D1 达到每日限制，保持失败可见，等 UTC 00:00 重置或评估 Cloudflare Workers Paid（官方最低月费 5 美元）；不要清空游标或写零值。

## 发布前准备与发布后真实链路验收（当前不得执行）

1. 所有者亲自完成钱包断开、EVM 只读连接、Solana 只读连接烟测；不提交助记词、私钥或签名。
2. 确认分支测试、构建、旧列表/详情、信号边界与生产错误日志全部通过，并再次确认当前生产仍为 Version 87。
3. 保留原 `.openai/hosting.json`、原 Site、原 D1 绑定和公开访问范围；先备份生产 D1，再按顺序迁移 `0020`—`0024`。迁移后只检查新表/新列，不写入本地验收数据。
4. 先发布同一 Site，验证生产 `/api/fund-flows` 返回真实生产 D1 的空状态或已有真实记录、中文陈旧提示和覆盖说明；此时 `PUBLIC_FLOW_ENABLED` 仍为 `false`。
5. 配置 GitHub Actions 的 `SITE_URL`、与 Site 一致的 `MONITOR_SECRET`，最后才把 repository variable `PUBLIC_FLOW_ENABLED` 改为 `true`；手动运行一次并核对生产 D1 游标、健康时间、事件键和来源链接。
6. 至少观察一次 340 分钟任务结束后的自然接棒，并记录结束到下一任务首次成功写入的实际空窗；不能用 cron 配置推断为零空窗。
7. 人为让测试运行遇到一次 RPC 429/超时，确认页面在 3 分钟内显示“数据已陈旧”、保留历史记录、不显示零流量；恢复后确认从旧游标补采且事件唯一键无重复。
8. 用生产 D1 中新采集的真实链上交易验收 Binance/Bybit/OKX 已知地址样本；UNI ≥1,000 万美元和尚无样本的交易所保持“待验证”，不得用任何本地测试 D1 计数代替。
9. 对任何 USDT/USDC 铸造逐条核对直接合约调用、原生事件、零地址 Transfer（适用时）、`totalSupply` 增量、唯一事件键和 Etherscan 链接；未通过则不展示为新增铸造。
10. 回滚只关闭 `PUBLIC_FLOW_ENABLED` 并保留游标/D1 数据；不得删除表或清空游标。页面应转为陈旧/覆盖不足状态，原 KOL、土狗雷达与企微链路保持不变。

调度与并发语义依据：GitHub 官方 [Troubleshooting workflows](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows) 与 [Workflow syntax for GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)。
