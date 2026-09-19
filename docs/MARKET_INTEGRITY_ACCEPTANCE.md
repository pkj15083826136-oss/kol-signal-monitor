# 行情完整性修复验收

## 根因与修复

- 动态批量行情曾直接读取 DexScreener pair 响应中的 `pair.marketCap || pair.fdv`，把 pair 口径/FDV 当成 token 市值；HYPE 因而曾显示约 `$101K`。现在 pair 响应只用于价格、流动性和成交额，不再提供市值。
- 监控首次预警原先用 `liveMarket.marketCap || 0`，未知市值会落入“低于 $20M”的允许分支；后续写库又把 GMGN `fdv` 当 `market_cap`，并可能使用未规范化 supply 计算。现在首次预警前强制获取 token-level 行情；身份、市值、创建时间任一未知进入 `data_review`，冲突也不发送首次预警。
- 统一解析器只接受 token 对象的 `market_cap`，其次 `price × circulating_supply`；只有市值缺失时才把 `fdv` 作为独立口径显示。无效、零、负数、NaN 和空值不能覆盖有效值。
- Ave `data.token.holders` 原本只作为普通数字字段合并，批量 fallback 的 `0` 又同时表示未知；现在统一为 nullable holder、来源与更新时间，字符串数字可解析，空值不会覆盖有效正整数。
- Solana 地址比较改为大小写敏感，EVM 地址仍按大小写不敏感比较。生产 HYPE 实际地址是 `98s...RQi5...`；需求文本中的 `98s...RQj5...` 也保留为成熟资产保护别名。

## HYPE 生产对比

| 字段 | 修复前历史记录 | 2026-09-20 02:37（北京时间）Ave token-level |
| --- | ---: | ---: |
| 价格 | $92.58 | $92.50134 |
| 市值 | $102,148（错误 pair 口径） | $65,360,200.24 |
| 流动性 | $3,062,825 | $9,921,945.88 |
| 24H 成交额 | $1,453,968 | $18,315,344.73 |
| 持币地址 | 51,254 / 页面曾显示 `--` | 51,953 |
| 主池 | 未可靠区分 | `81GpCm4d13y8TozYtThabuSCLQN2o3bbrvDogXFPn8sA` |

Ave 原始 token 字段为 `current_price_usd`、`market_cap`、`fdv`、`total`、`decimal`、`tvl`、`tx_volume_u_24h`、`holders`、`main_pair`。GMGN OpenAPI 在取证时返回“IP temporarily banned due to repeated rate limit violations”，公开 token/pair 端点返回 HTML 限流页；因此本次没有伪造 GMGN 数值，冲突判断仅采用成功且身份校验通过的来源。脱敏响应见 `HYPE_MARKET_SOURCE_AUDIT.json`。

历史 HYPE 信号保留原 ID，状态改为 `suppressed`，错误原因标记 `invalid_market_data`，并在后续迁移中按上述 token-level 快照修正行情字段；没有发送企业微信更正。

## 最近 50 条交叉核验

生产取证覆盖最近 50 条信号：9 条与当前 token-level 值偏差超过 30%，其中 7 条超过 3 倍、4 条超过 10 倍。完整逐条结果见 `RECENT_50_MARKET_AUDIT.json`。

显著异常包括：DOGE（3438.85 倍）、GLDx（4.27 倍）、SPCXx（18.11 倍）、WBTC（7200.28 倍，两条历史阈值记录）、ABS（4.92 倍）、CARDS（5.01 倍）、智脑（2.40 倍）和 PEPE（1.88 倍）。这些记录证明问题不是 HYPE 特例；新建信号已统一走 token-level 解析与强制验证。除 HYPE 外的既有记录未批量删除或自动发送更正，后续应按身份与创建时间复核后再决定是否抑制。

## 四链持币地址真实样本

Ave 生产响应验证了 12 个真实合约，均通过 token 身份校验并返回正整数：Solana 1,018,259 / 107,767 / 13,692；BSC 1,420 / 1,770 / 289；Base 150,632 / 13 / 38,769；Robinhood 1,051 / 469 / 715。合约、简称、采集时间和来源见 `HOLDER_12_CHAIN_AUDIT.json`。

## 数据库与回滚

- `0004_lethal_nova.sql`：新增 `market_reviews`；将 HYPE 历史信号标记为 `suppressed`，不删除数据。
- `0005_hype_market_correction.sql`：用已记录的 Ave token-level 响应修正 HYPE 历史行情字段，并补齐复核记录。
- 回滚应用代码可重新部署上一 Sites 版本；数据回滚时保留 `market_reviews` 表，按审计 JSON 恢复 HYPE 旧字段并将状态改回原值即可。由于旧值已证明错误，正常回滚不建议恢复其公开展示。

## 安全状态

本次未修改 `MONITOR_SECRET`、GMGN 鉴权、企业微信 Webhook、6/18/38/58 阈值、Site/D1 binding 或任何钱包/交易 Feature Flag。没有发送真实企业微信测试消息，也没有启用钱包、报价、测试网或主网交易。

## 生产 UI 与 K 线验收

- 最终生产版本：Sites v38，提交 `00112a2655dd94e12967b06e1531bfb6f1484a13`。
- 375×812、390×844 与 1440×1000 Playwright 验收通过，`scrollWidth <= clientWidth`，没有越界元素。
- K 线上方重复的“价格 · 市值 · 流动性 · 24H · 持币 · 北京时间”摘要已删除；顶部五指标卡片是唯一行情区域。
- HYPE 的 1m/5m/15m/1h/4h/1d 生产响应分别返回 481/121/121/169/181/181 根 Ave K 线。默认仍为 15m；E2E 验证五个非默认周期只各请求一次，再次切回 1m/5m 不增加请求，总计 5 次。
- 生产 E2E：4/4 通过，覆盖两种手机视口、列表/详情、返回按钮、六周期、缓存、BONK 真实行情和至少 3 次 3 秒刷新。
- 截图：`screenshots/prod-v38-list-desktop-1440x1000.png`、`screenshots/prod-v38-list-mobile-390x844.png`、`screenshots/prod-v38-hype-detail-desktop-1440x1000.png`、`screenshots/prod-v38-hype-detail-mobile-390x844.png`。

## 自动化结果

- `pnpm lint`：通过。
- `pnpm exec tsc --noEmit --incremental false`：通过。
- `pnpm test`：17 个测试文件、62 项测试全部通过。
- `pnpm build`：通过。
- `pnpm audit --prod`：仍报告 1 high + 3 moderate，全部来自当前关闭状态的钱包依赖树（Reown → Solana/WalletConnect 的 `bigint-buffer`、`uuid`、`decode-uri-component`、`stream-json`）；没有来自本次行情解析代码的新告警。钱包和交易 Feature Flag 均保持关闭，升级需等待上游兼容版本，不能通过强制覆盖破坏 Solana SDK 依赖。
