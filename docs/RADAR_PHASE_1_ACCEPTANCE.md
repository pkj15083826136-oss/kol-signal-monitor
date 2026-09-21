# 土狗雷达 Phase 1 验收

日期：2026-09-21（Asia/Shanghai）

## 范围与安全边界

- 在原 KOL Signal Monitor 内新增 `/radar` 独立页面和导航；没有新建 Site、D1 或 binding。
- 原四链 KOL 监控、企业微信、公开访问范围及 `6/18/38/58` 阶段未改变。
- 页面和数据模型只启用只读与 Paper 模式。钱包登录、托管钱包、自动交易、报价、测试网和主网广播均关闭。
- 不存在私钥、助记词、签名或 signed transaction 字段。`user_trading_wallets.key_reference` 仅预留不可逆的 KMS 外部引用；当前 provider 为 `NOT_PROVISIONED`，状态为 `disabled`。

## 数据源与延迟结论

- Ave 官方 V2 文档公开了 token、价格、K线、holders、交易与风险接口，但未发现可验证的 Ave Smart 信号接口。
- `https://ave.ai/smart` 在 2026-09-21 的公开请求返回 404。适配器因此明确返回 `BLOCKED_EXTERNAL_ENDPOINT`，没有使用私有接口、HTML 抓取或逆向协议。
- 页面备用候选只复用现有、合法接入的 GMGN KOL 聚集信号，并明确标注为“备用发现”；因为缺少 Pair、安全模拟、权限、税率、LP 和集中度证据，默认 `HOLD`，不会自动进入 Paper 仓位。
- 当前 GitHub 每分钟采集只能达到分钟级发现。未擅自引入收费队列或常驻服务；`/api/radar/collect` 是受 `MONITOR_SECRET` 保护的可替换采集入口，每次最多接收 30 个规范化候选。

## 决策链

1. 确定性硬门禁：身份、Token/Pair、可卖性、honeypot、流动性、价格冲击、权限、税率、LP、Top 持仓、开发者历史、买家/交易数、池龄、数据新鲜度、多源冲突及关键行情字段。
2. 版本化 100 分评分：安全 25、流动性 15、聪明钱 15、增长 10、量价 10、叙事 20、开发者 5。
3. Grok 严格 JSON 审核：仅允许 `APPROVE/HOLD/REJECT/EMERGENCY_CLOSE`；无 key、超时、HTTP 失败、JSON 错误或证据不足都降级为 `HOLD`。AI 不能绕过硬门禁。
4. 只有 `APPROVE` 才以 `threshold=0`、`alert_status=radar_visible` 同步到原 signals 展示。该行不会进入企业微信 outbox，也不会占用或改变 `6/18/38/58` 阶段；后续真实 KOL 阶段仍可独立创建。

## D1 前向迁移

- `0011_wonderful_may_parker.sql`：新增 `radar_signals`、`radar_signal_sources`、`radar_signal_snapshots`、`radar_analysis`、`narrative_events`、`strategy_settings`、`paper_positions`、`paper_orders`、`position_events`、`exit_ladders`、`execution_attempts`、`trade_outcomes`、`user_wallet_accounts`、`user_trading_wallets`、`wallet_auth_nonces`。
- `0012_flippant_leopardon.sql`：只为原 `signals` 增加 `signal_origin`、`radar_signal_id`、`radar_score` 三列。
- 两个迁移均为新增表/列，不含 `DROP`、`DELETE` 或数据重写。代码回滚不会删除这些兼容表/列；数据库物理回退应使用部署前 D1 Time Travel，不自动执行反向删除。

## Paper 交易状态机

- 已实现纯确定性退出内核和持久化模型：净可成交价值亏损 50% 清仓；2x/4x/8x 及后续翻倍卖出当时剩余仓位 50%；从历史最高净可成交价值回撤 50% 清仓；支持 `EMERGENCY_CLOSE`。
- 每个动作使用确定性 event/idempotency key；部分成交只减少实际成交数量，未完整成交不会推进下一止盈阶梯。
- 订单失败原因、尝试次数和 execution attempt 有专用字段。真实广播端口没有接通。
- 因生产候选目前没有经允许的可成交报价和完整安全字段，生产没有伪造 Paper 成交；页面会如实显示零 Paper 仓位。

## 学习数据

- `trade_outcomes` 可保存 5m、30m、1h、4h、24h、7d 的净收益、最大上涨、最大回撤、可卖性、撤池/归零和 Paper 结果。
- `/api/radar/training` 使用 `MONITOR_SECRET` 鉴权，最多导出 5000 行规则、模型、特征、决策与结果记录，不输出密钥。

## 本地门禁

- `pnpm lint`：通过，0 error / 0 warning。
- `pnpm exec tsc --noEmit --incremental false`：通过。
- `pnpm test`：28 个文件、120 项全部通过。
- `pnpm build`：通过，构建包含 `/radar`、`/api/radar/signals`、`/api/radar/collect`、`/api/radar/training`。
- `pnpm audit --prod`：1 high、3 moderate，均来自既有 Reown/Solana/WalletConnect 传递链（`bigint-buffer`、`uuid`、`decode-uri-component`、`stream-json`）。钱包及全部交易开关关闭；为避免跨版本破坏已验收钱包代码，本阶段不强制 override，后续在独立依赖升级分支处理。
- 本地 Playwright 开发服务器在 120 秒内未完成监听，结果为 `BLOCKED_LOCAL_PREVIEW_STARTUP`，不能写成通过；生产发布后必须重新执行 `/radar` 的 375、390 和桌面验证。

## 回滚

1. 将原 Site 重新部署到 Version 58，可立即移除新页面和 API。
2. 保持 `FEATURE_RADAR_WALLET_LOGIN=false`、`FEATURE_RADAR_AUTOTRADE=false` 及全部交易 flags 为 false。
3. 新表/列与旧代码兼容，不需要删除。若必须物理回退，使用部署前 D1 Time Travel；不得直接 DROP 表。

