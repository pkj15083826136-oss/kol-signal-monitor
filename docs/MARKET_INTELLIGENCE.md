# 交易所动态与大额资金流向

这两个模块与 KOL 监控、土狗雷达完全隔离，不读取 GMGN、Ave、钱包池、土狗评分或 6/18/38/58 阈值。它们只复用页面风格、北京时间格式和企业微信 HTTP 发送底层。

## 交易所动态

- 初始名单：Binance、Coinbase、Upbit、OKX、Bybit、Kraken、Bitget、Gate、MEXC、HTX；这是产品监控名单，不是实时排名。
- 每家都通过官方公开交易对接口建立现货快照；有公开接口的交易所同时建立合约快照。
- 首次快照只建立基线，不产生上币事件和通知。之后的集合差异保存为实际开通/停止时间。
- 官方公告以交易所自己的公告页或公告 JSON 为第一来源。无法稳定读取的来源必须在 `exchange_collector_state` 标为失败，不得用媒体转载替代。
- 公告身份为 `exchange + official announcement id`；标题或内容变化追加 `exchange_event_revisions`，不创建第二条事件。
- 高优先事件进入 `exchange_alert_deliveries`。只有可确认未送达的失败才重试；网络结果未知转为 `manual_review`，避免重试造成重复发送。

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
| Whale Alert Alerts API | 交易双方归属、美元价格；能排除内部/同实体 | WebSocket 实时，官方称覆盖 100+ 资产、14 条链 | 需 API key；Alerts 计划公开价 USD 29.95/月，100 alerts/hour，明确标注 personal use only | 可验证个人使用场景；当前站点公开展示和群推送涉及再分发，须先取得适用授权，不能仅购买个人计划就发布 |
| Nansen API | 5 亿+ 标签地址、交易所流和 Smart Money | 25+ 链，REST；免费层 100 credits + 每日补充 | 免费试用，Pro USD 49/月 | 适合作为机构可验证成交与标签补充；本期未启用，避免未经批准产生费用 |
| Arkham Intel API | 实体、地址、标签、置信度 | 生产级链上情报，API 接入制 | 需申请访问，按 credits | 可作为标签复核源；当前缺访问权 |
| Bitquery | 多链转账、Money Flow、地址标签 | 40+ 链；实时流需付费档 | 标签 add-on USD 99/月；Scale 才有链上实时流 | 成本高于首期需求，未启用 |

任何付费方案都必须由所有者显式决定；密钥只放 Sites/GitHub 环境变量或 Secret。
上线公开资金流页面前，须确认供应商许可覆盖公开展示与企业微信提醒；不要把购买个人计划的密钥当作公开使用授权。官方 WebSocket 的 `amounts[]` 允许一笔交易包含多种资产，必须逐资产去重并验收真实格式。
