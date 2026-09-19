# Phase 0.1—4 最终配置前验收记录（Phase 0 生产门禁未关闭）

日期：2026-09-19（Asia/Shanghai）

## 阶段提交

| 阶段 | 提交 | 结果 |
| --- | --- | --- |
| Phase 0.1 | `1c49ccc`（含 `cceef46`、`c4f6e55`） | D1 边界规范化、MONITOR_SECRET 鉴权、企业微信幂等 outbox 已实现；生产调度鉴权仍待配置闭环 |
| Phase 0.2 | `2a17db1` | 四链与数据源健康、最近监控时间、通知待处理/失败/人工复核管理视图 |
| Phase 1 | `0a5f777` | Reown AppKit + Wagmi 2 + Viem + Solana Adapter，只读钱包抽象/UI/mock |
| Phase 2 | `ceec0a2` | 批量动态行情、3s/15s 调度、北京时间/陈旧状态、Lightweight Charts 5m/15m |
| Phase 3 | `5bd079b` | Jupiter/0x 只读报价适配、fixture、allowlist 与风险阻止 |
| Phase 4 | `6ea42c7` | 交易状态机、精确授权、钱包签名/广播接口、receipt、记录与默认关闭的双重主网门禁 |

本轮最终配置前修复提交：`8faabaf`（BONK 身份、真实数据语义、移动端 E2E）、`114d82e`（行情上游标识）、`74d522c`（批量行情真实回退）、`4182007`（K 线重试与生产证据）、`942460f`（降级时保留最后真实报价并标记陈旧）。生产当前为 Sites version 29，对应 `942460f`。

GitHub Actions `main` 已增加“采集失败必须使 workflow 失败”及“连续 3 次失败提前停止”保护，远端提交为 `919ed3b`、`e549823`。这两项只修正 CI 结果语义和故障收敛，不改变 6/18/38/58 规则、数据源或 Site 运行代码。

## 2026-09-19 生产监控复验

- 项目所有者报告使用新凭据直接请求生产 Monitor API 返回 HTTP 200；D1 记录 `monitor_runs.id=592` 为 Base 成功，开始时间 `2026-09-19T14:59:54.051Z`，抓取 0、匹配 0、新交易 0、新信号 0、错误为空。该记录证明生产端接受该次直接调用，但不能证明 GitHub Actions Secret 已生效，也不能计作四链各三轮。
- 新配置后的 GitHub Actions Run #20（`35451317872`，提交 `e549823`）在 `2026-09-19T15:17:17Z`、`15:18:07Z`、`15:18:58Z` 分别执行 Solana、BSC、Base，三次均由生产 Monitor API 返回 HTTP 401；工作流随后按连续失败保护正确以 failure 结束。Robinhood 未执行，D1 未新增对应记录。
- 因请求在鉴权边界被拒绝，上述三次没有进入 D1 写入路径；不能据此完成 D1 规范化的四链生产回归，但日志中没有出现 `D1_TYPE_ERROR` 或 `undefined bind`。
- 生产 `signals` 表全量 31 条记录均为 `alert_status=sent`，`pending=0`、`failed=0`、`manual_review=0`；未发现相同 `chain + token_address + threshold` 的重复阶段记录。未发送真实企业微信测试消息。
- 结论：GitHub Actions 在 Run #20 中读取的 `MONITOR_SECRET` 仍与当前生产 Site 不一致。四链每链连续三轮成功为 **0/3、0/3、0/3、0/3**，Phase 0 生产门禁保持打开，不得判定通过。

## 数据库迁移

- `0001_previous_nextwave.sql`：通知 outbox 状态、错误、重试和确认字段；已在既有 D1 应用。
- `0002_naive_solo.sql`：`source_health` 与逐链 monitor run 维度；增量、可回滚。
- `0003_common_shinko_yamashiro.sql`：`user_trades`，金额均为最小单位文本，`(chain, tx_hash)` 唯一；增量、可回滚。
- 未创建新 Site、数据库或 D1 binding。生产回滚基准为 D1 Time Travel `2026-09-19T06:38:47.7514293Z`；代码可回滚到 `1c49ccc`。

## 自动化与构建

- `pnpm lint`：通过，0 error / 0 warning。
- `pnpm exec tsc --noEmit --incremental false`：通过。
- `pnpm test`：13 个文件、40 项测试全部通过。
- `pnpm build`：通过；存在 Reown 依赖导致的客户端 chunk 大小提示，不影响构建。
- `pnpm test:e2e`（生产）：3 项全部通过；覆盖 375×812、390×844 无横向溢出、真实 BONK 行情、前台轮询、隐藏降频/恢复刷新和 5m/15m K 线。
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

- 桌面 1440px：fixture 布局检查；左右约 65/35，交易面板吸顶。
- 手机生产 375×812 与 390×844：`document.documentElement.scrollWidth <= clientWidth`，关键父容器边界检查无越界；合约行、两列行情卡、简介、AI、K 线、趋势和交易区均在视口内。
- 生产截图：[375×812](/C:/Users/15083/Documents/ChatGPT/链上早期信号/docs/screenshots/production-mobile-375x812.png)；[390×844](/C:/Users/15083/Documents/ChatGPT/链上早期信号/docs/screenshots/production-mobile-390x844.png)。

## 生产真实性分层

- fixture 验证：Jupiter/0x 报价适配、交易风险与失败分支、桌面布局旧截图；不能作为生产行情或真实交易证据。
- mock 钱包验证：连接/拒签/切链/余额不足/授权失败/交易失败/RPC 失败状态机；未使用真实钱包或资金。
- 生产真实 API 验证：BONK mint `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263`；2026-09-19 21:25:50 北京时间批量 API 返回 price `0.0000029913`、market cap `263217817.04`、liquidity `1514264.45`、24h volume `4747914.73`，来源 `Ave/GMGN fallback`。生产 E2E 验证 5m/15m K 线可见。
- 尚待外部配置验证：真实 Reown 钱包、Jupiter/0x 真实报价、测试网签名、任何主网广播，以及企业微信真实群消息。
- 上游瞬时不可用时，首次无真实值显示“暂无数据/数据源不可用”；已有真实值保留原时间戳并标记降级，超过 30 秒显示“数据陈旧”，不回填 fixture。

## Feature Flag 状态

生产当前仅 `FEATURE_LIVE_MARKET=true`。`FEATURE_WALLET_CONNECT`、`FEATURE_TRADE_QUOTE`、`FEATURE_TRADE_TESTNET`、`FEATURE_TRADE_MAINNET` 及四条 `FEATURE_TRADE_MAINNET_{CHAIN}` 均显式为 `false`。主网必须同时满足总开关和对应逐链开关。

## 尚需外部配置与人工验收

1. 再次更新 GitHub Actions 仓库 `pkj15083826136-oss/kol-signal-monitor` 的 repository secret `MONITOR_SECRET`，确保目标确为该仓库、名称没有前后空格，且保存发生在 Run #20 启动之后；生产 Site 端不要再次单边轮换。当前工具可提交/读取仓库内容，但不能读取或写 Actions Secret，浏览器也未登录。更新后重新运行 workflow，并以 D1 新增四链各三条 success 记录为唯一通过依据。
2. 提供 Reown projectId、Jupiter/0x key、四链受限 RPC、聚合器 target/spender/token allowlist 与风险上限；详见 `EXTERNAL_SETUP.md`。
3. 获得确认后，仅发送一条标记“系统链路测试”的真实企业微信消息。
4. 使用项目所有者控制的测试钱包和水龙头资产，逐笔验收 connect、switch、quote、reject、approve、swap、timeout、失败和 receipt；系统不得接触私钥/助记词。
5. 独立安全评审关闭 high/critical 后，书面确认单链、单笔上限、测试钱包和预算；只开启该链主网开关并人工核对第一笔小额交易。其余链继续关闭。

## 风险与回滚

- 调度鉴权配置错误是当前生产阻塞；Run #20 已证明 Actions 仍返回 401，不应降低接口鉴权或复用 `GMGN_API_KEY` 绕过。
- Reown 依赖体积较大且存在上游审计项；钱包功能保持关闭可隔离运行风险。
- 第三方行情/报价/RPC 都可能限流或降级；失败时 UI 必须显示不可用并阻止交易，不自动重试下单。
- 代码回滚：将既有 Site 部署回上一个成功版本或 commit `1c49ccc`。
- D1 回滚：优先使用发布前 Time Travel；若只撤销 Phase 4，可停止交易 flag 后删除空的 `user_trades` 表。存在记录时先导出再由所有者确认，不自动删除。
