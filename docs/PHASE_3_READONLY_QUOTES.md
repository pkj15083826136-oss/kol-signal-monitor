# Phase 3：聚合器适配与只读报价

## 完成范围

- 统一 `QuoteAdapter`：Solana 使用 Jupiter，EVM 使用 0x AllowanceHolder v2。
- 无真实 API key 时用官方响应结构 fixture 覆盖解析、路由、最少获得、Gas/优先费、滑点、价格影响及有效期。
- 服务端代理 API 不向浏览器暴露聚合器密钥；`FEATURE_TRADE_QUOTE` 默认关闭。
- 详情页增加约 65%/35% 布局和吸顶交易面板，手机端自动单列；买卖、资产类型、快捷金额/比例、滑点和确认摘要均有明确位置。
- 报价进入下一步前校验 chainId、买卖代币、spender、to、value、calldata、minimum received 和过期时间。
- honeypot、高税、不可卖、价格影响过高、模拟失败/不完整全部进入阻止状态。

## 外部限制

- 0x 与 Jupiter API key、0x 逐链目标合约 allowlist 尚未配置，生产只读报价保持关闭。
- Robinhood Chain 4663 已进入统一 EVM 请求模型，但是否受 0x 当前生产 API 支持需用真实 key 验证；不支持时必须保持阻止状态，不可静默换链。

## 回滚

无数据库迁移。关闭 `FEATURE_TRADE_QUOTE` 可即时停用；代码回滚本提交并重新发布即可。
