# Phase 0.1—4 最终验收记录

日期：2026-09-19（Asia/Shanghai）

## 阶段提交

| 阶段 | 提交 | 结果 |
| --- | --- | --- |
| Phase 0.1 | `1c49ccc`（含 `cceef46`、`c4f6e55`） | D1 边界规范化、MONITOR_SECRET 鉴权、企业微信幂等 outbox、测试与受控发布完成 |
| Phase 0.2 | `2a17db1` | 四链与数据源健康、最近监控时间、通知待处理/失败/人工复核管理视图 |
| Phase 1 | `0a5f777` | Reown AppKit + Wagmi 2 + Viem + Solana Adapter，只读钱包抽象/UI/mock |
| Phase 2 | `ceec0a2` | 批量动态行情、3s/15s 调度、北京时间/陈旧状态、Lightweight Charts 5m/15m |
| Phase 3 | `5bd079b` | Jupiter/0x 只读报价适配、fixture、allowlist 与风险阻止 |
| Phase 4 | `6ea42c7` | 交易状态机、精确授权、钱包签名/广播接口、receipt、记录与默认关闭的双重主网门禁 |

## 数据库迁移

- `0001_previous_nextwave.sql`：通知 outbox 状态、错误、重试和确认字段；已在既有 D1 应用。
- `0002_naive_solo.sql`：`source_health` 与逐链 monitor run 维度；增量、可回滚。
- `0003_common_shinko_yamashiro.sql`：`user_trades`，金额均为最小单位文本，`(chain, tx_hash)` 唯一；增量、可回滚。
- 未创建新 Site、数据库或 D1 binding。生产回滚基准为 D1 Time Travel `2026-09-19T06:38:47.7514293Z`；代码可回滚到 `1c49ccc`。

## 自动化与构建

- `pnpm lint`：通过，0 error / 0 warning。
- `pnpm exec tsc --noEmit --incremental false`：通过。
- `pnpm test`：13 个文件、39 项测试全部通过。
- `pnpm build`：通过；存在 Reown 依赖导致的客户端 chunk 大小提示，不影响构建。
- 覆盖原监控规则、BONK 身份、成熟资产过滤、独立钱包去重、6/18/38/58 幂等、D1 规范化、企业微信重试、调度鉴权、钱包拒签/切链失败、余额不足、报价过期/篡改、滑点边界、授权/交易/RPC 失败和第三方降级。

## 依赖审计

`pnpm audit --prod` 剩余 4 项间接依赖：1 high、3 moderate。

- `bigint-buffer@1.1.5`：来自 Reown Solana → SPL Token；公告要求 `1.1.6`，但 npm registry 尚无该版本，无法安全升级。
- `uuid@8/9`：来自 Solana `jayson` 与 Wagmi/MetaMask；安全版本是 11.1.1+，强制跨主版本 override 可能破坏钱包连接，暂缓至上游升级。
- `decode-uri-component@0.2.2`：来自 WalletConnect `query-string`；虽然 registry 有更新主/次版本，直接 override 会改变上游解析契约，暂缓至 WalletConnect/Reown 升级。
- `stream-json@1.9.1`：来自 Solana `jayson`；修复位于 3.x，跨主版本强制替换风险高，且浏览器交易输入不直接进入其流式解析器。

已安全升级/覆盖 `axios@1.18.0` 与 `ws@8.21.0`，审计由 16 项降至 4 项。剩余项不应在独立安全评审前开启主网。

## 四链状态

| 链 | 监控 | 钱包只读 | 行情/K线 | 报价 | 交易准备 |
| --- | --- | --- | --- | --- | --- |
| Solana | 保持原链路 | Reown Solana Adapter | 批量行情 + Ave/Gecko 回退 | Jupiter fixture/适配完成 | 待签名交易准备 + 用户钱包执行接口 |
| BSC 56 | 保持原链路 | Wagmi/Viem | 同上 | 0x v2 fixture/适配完成 | EVM 精确授权与钱包执行接口 |
| Base 8453 | 保持原链路 | Wagmi/Viem | 同上 | 0x v2 fixture/适配完成 | EVM 精确授权与钱包执行接口 |
| Robinhood 4663 | 保持原链路 | Wagmi/Viem + 官方链参数 | 同上 | 0x 适配层完成，需供应商账户确认实际覆盖 | EVM 精确授权与钱包执行接口 |

## 页面验收

- 桌面 1440px：左右约 65/35，交易面板吸顶；`scrollWidth <= innerWidth`。
- 手机 375px：单列，交易面板位于 K 线之后、趋势/帖子之前；`scrollWidth <= innerWidth`，长地址和错误可换行。
- 截图：[桌面](/C:/Users/15083/Documents/ChatGPT/链上早期信号/docs/screenshots/phase4-desktop.png)；[手机](/C:/Users/15083/Documents/ChatGPT/链上早期信号/docs/screenshots/phase4-mobile.png)。截图使用本地 fixture 数据，不包含密钥、真实钱包或真实资金。

## Feature Flag 状态

以下均默认关闭/缺失即关闭：`FEATURE_WALLET_CONNECT`、`FEATURE_LIVE_MARKET`、`FEATURE_TRADE_QUOTE`、`FEATURE_TRADE_TESTNET`、`FEATURE_TRADE_MAINNET` 及四条 `FEATURE_TRADE_MAINNET_{CHAIN}`。主网必须同时满足总开关和对应逐链开关。

## 尚需外部配置与人工验收

1. 修正 GitHub Actions 仓库 `MONITOR_SECRET`，使其与 Sites 的同名 secret 一致；当前生产调度 401，四链连续三轮成功仍未完成。
2. 提供 Reown projectId、Jupiter/0x key、四链受限 RPC、聚合器 target/spender/token allowlist 与风险上限；详见 `EXTERNAL_SETUP.md`。
3. 获得确认后，仅发送一条标记“系统链路测试”的真实企业微信消息。
4. 使用项目所有者控制的测试钱包和水龙头资产，逐笔验收 connect、switch、quote、reject、approve、swap、timeout、失败和 receipt；系统不得接触私钥/助记词。
5. 独立安全评审关闭 high/critical 后，书面确认单链、单笔上限、测试钱包和预算；只开启该链主网开关并人工核对第一笔小额交易。其余链继续关闭。

## 风险与回滚

- 调度鉴权配置错误是当前生产阻塞，不应降低接口鉴权或复用 `GMGN_API_KEY` 绕过。
- Reown 依赖体积较大且存在上游审计项；钱包功能保持关闭可隔离运行风险。
- 第三方行情/报价/RPC 都可能限流或降级；失败时 UI 必须显示不可用并阻止交易，不自动重试下单。
- 代码回滚：将既有 Site 部署回上一个成功版本或 commit `1c49ccc`。
- D1 回滚：优先使用发布前 Time Travel；若只撤销 Phase 4，可停止交易 flag 后删除空的 `user_trades` 表。存在记录时先导出再由所有者确认，不自动删除。
