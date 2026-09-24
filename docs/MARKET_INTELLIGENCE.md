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
| Coinbase | 官方指定的 `@CoinbaseMarkets` | 0 / 0 | 现货 514 | BLOCKED；缺 `COINBASE_X_BEARER_TOKEN`，不得以非官方转载替代；当前只可核验实际交易对 |
| Upbit | 官方 Private Announcement WebSocket | 0 / 0 | 现货 855 | BLOCKED；缺 `UPBIT_ACCESS_KEY`、`UPBIT_SECRET_KEY`；官方只提供实时 CREATED/UPDATED，不提供历史重放 |
| OKX | 官方 New listings、Delistings、Trading updates | 20 / 20 | 现货 1415、合约 492 | PASS；三类页面合并去重 |
| Bybit | 官方公告 API | 9 / 9 | 现货 530、合约 885 | PASS；已排除 Token Splash/奖池活动误判为上币 |
| Kraken | 官方 Asset Listings WordPress JSON | 20 / 20 | 现货 1368 | PASS；使用官方分类 JSON 和文章 ID，公告与交易对分别保存 |
| Bitget | 官方公告 API 三分类 | 14 / 14 | 现货 3169、合约 805 | PASS；coin listings、symbol delisting、product updates |
| Gate | 官方公告 POST API | 7 / 7 | 现货 2222、合约 1013 | PASS；官方 ID 作为事件身份 |
| MEXC | 官方公告页 | 1 / 1 | 现货 1956、合约 1194 | PASS；页面结构为空或变化时显式报错 |
| HTX | 官方公告页 | 16 / 16 | 现货 608、合约 361 | PASS；官方链接、公告 ID、修订记录保留 |

连续观测窗口内 8 个已接通公告源的 `changed=0`，所有交易对源 `created=0`，通知队列 `queued=0/sent=0`，证明同一官方内容不会重复入库或进入通知队列。没有在验收窗口刻意制造真实新公告，因此“真实企业微信成功送达”仍须在合法生产链路出现首个新高优先事件后验证，不能用测试消息冒充。

调度器使用单调的 60 秒计划点；接口超时时跳过已错过的计划点并记录 `schedule_lag`，不会补发一串并发请求。官方 HTTP 每次最多三次、指数退避重试，失败写入健康表，下轮从官方历史列表与交易对快照重新核对。GitHub Actions 每 30 分钟启动一次 55 分钟轮询作业以容忍调度漂移。Upbit 保持一个连接到作业交接，仅在断线时指数退避；两个 33 分钟作业有约 3 分钟交接重叠。由于 Upbit 官方明确只有实时流且无 replay，极端的双连接同时中断仍可能漏掉公告；发布前需用官方 key 连续观测，不能把它宣称为绝对不漏。

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
| Nansen API | 交易、flows、counterparty 可公开再分发但须按 endpoint 标注；原始 `/label` 与 Smart Money 多项禁止或受限 | 25+ 链，REST | Free 100 credits + 每日 10；Pro USD 49/月含 2000 credits；额外 credits 官方示例 USD 10/10,000 | 可考虑 `tgm/transfers`/`tgm/flows` 并显示 Powered by Nansen；**不能**把禁止再分发的原始标签或 Smart Money 实时流直接放到公开页面/企微。API Terms 对公共应用组合数据另有书面许可要求，采购前需 Nansen 书面确认具体 endpoint |
| Arkham Intel API | 实体标签、交易与资金流 | 实时 API，地址情报更新为游标续跑 | 按申请开放，官方未公布自助价格 | 候选；须申请 key、报价并取得公开 dashboard/告警使用条款。未获批前 BLOCKED |
| Bitquery | 实时 transfers、美元值；地址标签覆盖 Ethereum、BNB、Tron、Bitcoin、Solana、Arbitrum、Base 等 12 链 | WebSocket 约 1 秒；自助实时覆盖 9 条核心链；Kafka offset replay 仅 Enterprise | Pro 商用 USD 79/月（年付价；月付页面价会更高）；Scale 商用 USD 239/月（年付）；地址标签 add-on USD 99/月或年付 USD 79.20/月；Kafka/40+ 链/完整回放需询价 | 最可落地的公开商用候选，但若要标签至少 Pro + 标签；要可靠断线回放与 40+ 链需 Enterprise 报价。购买前仍应书面确认企微再分发 |

任何付费方案都必须由所有者显式决定；密钥只放 Sites/GitHub 环境变量或 Secret。
上线公开资金流页面前，须确认供应商许可覆盖公开展示与企业微信提醒；不要把购买个人计划的密钥当作公开使用授权。官方 WebSocket 的 `amounts[]` 允许一笔交易包含多种资产，必须逐资产去重并验收真实格式。

当前确需所有者提供/决定的外部项：

1. 选择资金流供应商并提供覆盖公开网页与企业微信的书面许可；不要先购买 Whale Alert Personal。
2. 若走 Whale Alert：向官方询价并取得明确的 public display + alert redistribution 授权，再提供 `WHALE_ALERT_API_KEY`。
3. 若走 Bitquery：最低候选为商用 Pro + Address Labels（按官网年付展示价约 USD 178/月），提供 API key；需要可靠 replay/40+ 链时先取得 Enterprise 报价。
4. 若走 Nansen：先确认允许公开展示的具体 transfers/flows endpoint、归属字段和企微告警权，再提供 `NANSEN_API_KEY`；禁止 endpoint 不接入。
5. Coinbase 需要 X Developer bearer token：`COINBASE_X_BEARER_TOKEN`。X 当前费用以 Developer Console 的按量报价为准，代码不会自动购买。
6. Upbit 需要无额外 scope 的只读式 API key/secret 用于 Private Announcement WebSocket：`UPBIT_ACCESS_KEY`、`UPBIT_SECRET_KEY`；代码不调用订单、余额或提现 API。
