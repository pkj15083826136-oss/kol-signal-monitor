# 交易所动态与大额资金流向

这两个模块与 KOL 监控、土狗雷达完全隔离，不读取 GMGN、Ave、钱包池、土狗评分或 6/18/38/58 阈值。它们只复用页面风格、北京时间格式和企业微信 HTTP 发送底层。

## 交易所动态

- 初始名单：Binance、Coinbase、Upbit、OKX、Bybit、Kraken、Bitget、Gate、MEXC、HTX；这是产品监控名单，不是实时排名。
- 每家都通过官方公开交易对接口建立现货快照；有公开接口的交易所同时建立合约快照。
- 首次快照只建立基线，不产生上币事件和通知。之后的集合差异保存为实际开通/停止时间。
- 官方公告以交易所自己的公告页或公告 JSON 为第一来源。无法稳定读取的来源必须在 `exchange_collector_state` 标为失败，不得用媒体转载替代。
- 公告身份为 `exchange + official announcement id`；标题或内容变化追加 `exchange_event_revisions`，不创建第二条事件。
- 高优先事件进入 `exchange_alert_deliveries`。只有可确认未送达的失败才重试；网络结果未知转为 `manual_review`，避免重试造成重复发送。

### 2026-09-24 本地真实链路验收

本地测试 D1 首轮只建立基线，第二轮及连续三轮均未把既有公告或交易对当成新事件。以下数量来自官方端点的当次响应，不是 fixture；页面 `/exchanges` 直接读取这些 D1 行。

| 交易所 | 官方公告源 | 当次解析/入库 | 交易对核验 | 状态与实际覆盖 |
| --- | --- | ---: | --- | --- |
| Binance | 官方公告分类 API | 24 / 24 | 现货 3713、合约 907 | PASS；上币、交易对、合约、Alpha、活动、下架标题分类 |
| Coinbase | 官方指定的 `@CoinbaseMarkets` | 0 / 0 | 现货 514 | BLOCKED；Coinbase 已于 2025-09-08 把新上币、期货和永续公告集中到该 X 账号，未找到等价的稳定公开结构化公告流；当前只可核验实际交易对 |
| Upbit | 官方 Private Announcement WebSocket | 0 / 0 | 现货 855 | BLOCKED；公开公告网页对采集器返回 403，不能绕过；官方 WebSocket 需要 key、只提供实时 CREATED/UPDATED 且不提供历史重放；当前只可核验实际交易对 |
| OKX | 官方 New listings、Delistings、Trading updates | 20 / 20 | 现货 1415、合约 492 | PASS；三类页面合并去重 |
| Bybit | 官方公告 API | 9 / 9 | 现货 530、合约 885 | PASS；已排除 Token Splash/奖池活动误判为上币 |
| Kraken | 官方 Asset Listings WordPress JSON | 20 / 20 | 现货 1368 | PASS；使用官方分类 JSON 和文章 ID，公告与交易对分别保存 |
| Bitget | 官方公告 API 三分类 | 14 / 14 | 现货 3169、合约 805 | PASS；coin listings、symbol delisting、product updates |
| Gate | 官方公告 POST API | 7 / 7 | 现货 2222、合约 1013 | PASS；官方 ID 作为事件身份 |
| MEXC | 官方公告页 | 1 / 1 | 现货 1956、合约 1194 | PASS；页面结构为空或变化时显式报错 |
| HTX | 官方公告页 | 16 / 16 | 现货 608、合约 361 | PASS；官方链接、公告 ID、修订记录保留 |

连续观测窗口内 8 个已接通公告源的 `changed=0`，所有交易对源 `created=0`，通知队列 `queued=0/sent=0`，证明同一官方内容不会重复入库或进入通知队列。没有在验收窗口刻意制造真实新公告，因此“真实企业微信成功送达”仍须在合法生产链路出现首个新高优先事件后验证，不能用测试消息冒充。

12 分钟故障观测实际执行 11 轮：前 10 轮计划启动漂移为 2–15ms，单轮 24–39 秒；第 11 轮遇到多个官方端点同时变慢，串行版本耗时 174.254 秒，调度器记录 `schedule_lag skipped=2`，没有重叠执行或并发补跑。修复为“交易所之间并发、同一交易所内公告/现货/合约有序”后连续 5 轮均按 60 秒计划点启动，漂移 0–12ms，单轮 34.5–52.0 秒，无跳点、无任务重叠；8 家公告源每轮均成功，首轮因补齐可验证公告时间产生一次原事件修订，随后 4 轮 `changed=0`，队列始终 `queued=0/sent=0`。

Binance 现货 `exchangeInfo` 完整响应约 17.6MB，经 Worker 中转会在读取响应体时持续超时。现由既有 Node/GitHub 采集器直接读取 Binance 官方 `data-api.binance.vision`，使用 `showPermissionSets=false` 保留相同 symbol 集合并把响应降至约 6.7MB，再只把规范化交易对数组提交给独立 API；API 仍执行完整性比例检查、连续两快照确认、D1 去重和通知状态，并与其余九家并发采集。为保证单轮在分钟目标内收敛，官方 HTTP 每轮最多两次、单次 20 秒并在两次间退避；失败写健康状态，下一分钟从官方列表和最近完整快照继续，而不是在同一轮无限重试。失败期间保留最近完整快照且页面显示源错误。

最终构建实跑一轮：Node 侧 Binance 完整现货快照为 3,713 对，保留官方非拉丁 symbol；API 内 8 家已接通公告源全部成功且 `changed=0`，全部 25 个已配置公告/交易对源为 healthy，只有 Coinbase、Upbit 公告保持预期 blocked/error。API 用时 41.862 秒，包含 Node 预取后端到端约 44.4 秒，在 60 秒计划间隔内，通知队列 `queued=0/sent=0`。Unicode 校验缺陷在本地测试 D1 产生的 7 条关闭及 7 条重开误报和对应未发送通知已全部清理，生产 D1 从未迁移或写入。

## 钱包与发布门槛

本分支没有修改钱包、报价、授权、交易历史或广播代码；钱包和全部交易 Feature Flag 保持原值。当前无需真实钱包即可完成单元测试、类型检查、构建、页面隔离和钱包 mock 回归。依据 `AGENTS.md` 第 16 条，真正发布前仍必须由所有者在浏览器中完成钱包断开、EVM 连接和 Solana 连接烟测；仅连接和只读校验，不索要或接收助记词、私钥、签名，不发起报价、授权或交易。该人工烟测是发布硬门槛，不是本地开发阻塞。

调度器使用单调的 60 秒计划点；接口超时时跳过已错过的计划点并记录 `schedule_lag`，不会补发一串并发请求。官方 HTTP 每次最多三次、指数退避重试，失败写入健康表，下轮从官方历史列表与交易对快照重新核对。GitHub Actions 每 30 分钟启动一次 55 分钟轮询作业以容忍调度漂移。交易对响应少于上一完整快照 70% 时按部分响应失败处理并保留原快照；单个交易对须连续两个完整快照都缺失才确认关闭，避免临时部分数据误报批量下架。

Upbit 保持一个连接到作业交接，仅在断线、错误或 30 秒收不到 pong 时指数退避重连；两个 33 分钟作业有约 3 分钟交接重叠。由于 Upbit 官方明确只有实时流且无 replay，极端的双连接同时中断仍可能漏掉公告；断线后只能用公开交易对快照补发现“实际开通/停止”，无法补回公告正文和修订历史。发布前需用官方 key 连续观测，不能把它宣称为绝对不漏。

Coinbase X 采集只使用 app-only read bearer，不请求发帖、私信或账号写权限。首次解析 `@CoinbaseMarkets` 后把 user id 保存在独立采集器游标，后续每分钟只读最多 25 条 timeline，避免每轮重复计费的用户查询。按 X 公开 pay-per-use 单价（Post read USD 0.005、User read USD 0.010）及同一 UTC 日重复资源通常不重复收费估算，静态 25 条窗口约 USD 3.75/月，另加当天新增帖子；建议先设置 USD 5–10/月 spending limit，以控制台实际账单为准。X 未要求本方案配置 IP 白名单。

Upbit Announcement WebSocket 文档明确该功能“不属于任何权限组”，因此 key 不应勾选资产、订单、提现等权限。Upbit key 创建要求固定公网 IPv4，可白名单至多 10 个地址；GitHub hosted runner 出口不固定，生产应使用固定出口 IPv4 的专用采集机或 self-hosted runner，仅在该机器的 secret/env 中配置 `UPBIT_ACCESS_KEY` 与 `UPBIT_SECRET_KEY`，不放到 Sites。单连接只在建立时订阅并维持心跳，远低于官方每 IP 每秒 5 次连接、每连接每秒 5/每分钟 100 条消息限制。

## 大额资金流向

- 默认提供商适配为 Whale Alert Alerts WebSocket，最低美元门槛固定为 `10,000,000`。官方告警结构为 `amounts[]`、`transaction.hash` 和 `transaction.sub_transactions[]`；每个资产单独应用门槛，不能按顶层 `amount_usd/hash` 解析。
- GitHub Secret `WHALE_ALERT_API_KEY` 缺失时，采集器把状态写为 `blocked/not_configured` 后失败退出；页面显示“覆盖不足”，不会生成零值或样例数据。
- 同一 WebSocket 订阅使用稳定 ID `kol-flow-10m-v1`。五分钟内重连时由提供商补发遗漏事件，D1 再以链、交易哈希、子索引和币种去重。
- 交易所转入计为 inflow（潜在卖压），交易所转出计为 outflow。净额定义为 `outflow - inflow`；正数代表净流出交易所，负数代表净流入交易所。
- 交易所内部、同实体和跨链桥转账不计入净额。未标注地址、缺美元估值或覆盖不足必须原样显示未知。
- 转账流不推断机构买入/卖出。`institution_trade_side` 只有在后续接入可验证成交源时才能填写，机构净买卖与交易所净流入必须分别汇总。

## 提供商评估（2026-09-24）

| 服务 | 地址标签与价格 | 链与时效 | 配额/费用 | 本项目结论 |
| --- | --- | --- | --- | --- |
| Whale Alert Alerts API | 交易双方归属、美元价格；能排除内部/同实体 | WebSocket 实时，100+ 资产、14 条链；同订阅 ID 在 5 分钟内重连可补发 | Alerts USD 29.95/月、100 alerts/hour，明确 personal use only；Business Enterprise API USD 699/月 | **BLOCKED**。通用条款禁止公开、传播或写入第三方可访问系统，除非取得书面许可；即使 USD 699 Business 也必须先书面确认本 Site 与企业微信再分发权 |
| Nansen API | `tgm/transfers`、`tgm/flows` 可按再分发指南公开并须署名；原始 `/label` 与 Smart Money 多项禁止或受限 | 约 25 条链，REST | Free 100 credits + 每日 10；Pro USD 49/月含 2,000 credits；额外 credits USD 100/100,000 | 对少量指定币种可行，但要按分钟全局扫描会按链×币种线性耗费。示例 10 币×8 链×每分钟约 345.6 万次/月，即约 USD 3,456 credits + USD 49，仍不是完整覆盖；API Terms 对公共第三方应用另有许可要求 |
| Arkham Intel API | 实体标签、交易与资金流 | 实时 API，地址情报更新为游标续跑 | 按申请开放，官方未公布自助价格 | 候选；须申请 key、报价并取得公开 dashboard/告警使用条款。未获批前 BLOCKED |
| Bitquery | 实时 transfers、美元值；地址标签覆盖 Ethereum、BNB、Tron、Bitcoin、Solana、Arbitrum、Base 等 12 链 | WebSocket 约 1 秒；自助实时覆盖 10 条核心链；Kafka offset replay 仅 Enterprise | Pro USD 99/月（或年付折合 USD 79/月）+ Address Labels USD 99/月（或年付折合 USD 79.20/月）；Kafka/40+ 链/完整回放需询价 | 当前最低可落地候选：月付合计 USD 198，或年付 USD 1,898.40（折合 USD 158.20/月）。条款虽允许付费计划公开披露数据，但第三方应用仍要求事先书面同意，因此必须先取得覆盖公开网页和企微推送的书面确认；可靠 Kafka replay 另需 Enterprise |

任何付费方案都必须由所有者显式决定；密钥只放 Sites/GitHub 环境变量或 Secret。
上线公开资金流页面前，须确认供应商许可覆盖公开展示与企业微信提醒；不要把购买个人计划的密钥当作公开使用授权。官方 WebSocket 的 `amounts[]` 允许一笔交易包含多种资产，必须逐资产去重并验收真实格式。

外部项以本次交付报告中的最小阻塞表为准。不要一次配置多家资金流供应商，也不要先购买 Whale Alert Personal。任何供应商 key 均只配置在实际运行其采集器的固定采集机/CI secret，不进入源码、日志、浏览器或聊天记录。

## 官方证据链接

- Coinbase：<https://www.coinbase.com/en-br/blog/Coinbase-Markets-on-X-Your-New-Home-for-All-Listings>
- X API 计费：<https://docs.x.com/x-api/getting-started/pricing>
- Upbit Announcement WebSocket：<https://docs.upbit.com/kr/reference/websocket-announcement>
- Upbit API key 与固定 IP：<https://docs.upbit.com/kr/docs/api-key>
- Whale Alert 条款：<https://whale-alert.io/terms-and-conditions.html>
- Nansen 再分发指南：<https://docs.nansen.ai/guides/redistribution-guide>
- Bitquery Data Streams / Address Labels / 条款：<https://www.bitquery.io/products/data-streams>、<https://www.bitquery.io/products/address-labels-api>、<https://www.bitquery.io/terms-of-service>
