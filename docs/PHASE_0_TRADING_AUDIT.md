# Phase 0：钱包与手动交易升级审计和实施方案

审计日期：2026-09-19（Asia/Shanghai）  
审计基线：生产 Sites 版本 21，Git 提交 `3d725585752f0173357016d836014ea898e39a1d`  
工作分支：`codex/trading-phase-0`；修复分支：`codex/phase-0-1-remediation`

## 1. 结论

当前项目可以作为交易升级的 UI 与数据基座，但**尚不具备进入 Phase 1 的质量门槛**。钱包/报价/交易依赖和 Feature Flag 均未安装；自动化测试为空；生产监控存在稳定复现的 D1 写入失败；调度鉴权错误地复用了 GMGN API key。必须先修复 P0/P1 基线问题并补齐回归测试，再引入钱包 SDK。

本阶段没有创建 Site、数据库或 D1 表，没有变更生产环境变量，没有发布，也没有启用任何交易或主网广播。

## 2. 已核验基线

### Git、部署与运行

- 本地 `main` 原始工作树干净，生产版本 21 的 commit 与仓库 HEAD 一致。
- Sites 项目仍为 `.openai/hosting.json` 指向的既有项目；生产 URL、公开访问范围、`DB` 绑定均未改变。
- 最新生产部署状态为 `succeeded`；首页、`/api/signals` 和 `/signal/4` 均返回 HTTP 200。
- `/api/signals` 返回 40 条记录，最后一次记录的 monitor run 为 success；但这会掩盖相邻链轮次的失败，不能代表四链全部健康。
- 生产环境存在 6 个既有变量：`GMGN_API_KEY`、`AVE_API_KEY`、`XAI_API_KEY`、`WECOM_WEBHOOK_URL`、`MONITOR_SECRET`、`PUBLIC_SITE_URL`。未读取或复制任何 secret 值。

### 依赖与构建

- Node 要求 `>=22.13.0`，锁定 pnpm `11.25.0`；本地核验使用 Node `24.19.0`、pnpm `11.19.0`。
- 当前没有 Reown、Wagmi、Viem、Solana wallet adapter、Lightweight Charts 或高精度交易金额依赖。
- `pnpm build`：通过。
- `pnpm lint`：失败，详情页两个内部导航使用原生 `<a>`；另有两个 `<img>` 性能警告。
- 测试：没有 `test` 脚本、测试框架或测试文件；生产 `/api/monitor/self-test` 是会写 D1 并发送企业微信的破坏性链路测试，不能代替自动化测试。
- `pnpm audit --prod`：2 high、1 moderate、1 low，均为 Next 间接依赖链（Browserslist、baseline-browser-mapping、Babel）；升级前需验证兼容性并重新审计。

### 数据库

生产 D1 绑定名为 `DB`，现有表与源码一致：

| 表 | 关键字段 | 结论 |
| --- | --- | --- |
| `trades` | 交易 ID、链、钱包、代币、方向、金额、原始 JSON | 监控采集表，不可与用户交易混用 |
| `token_wallets` | 链/代币/钱包复合主键、累计余额 | `REAL` 适合估算，不适合签名交易金额 |
| `signals` | 阈值、行情、AI、钱包列表 | 唯一索引防止相同阈值重复 |
| `hot_posts` | 信号、排名、作者、内容 | 保持 6/38 阶段行为 |
| `snapshots` | 人数、数量、估值、时间 | 趋势数据 |
| `monitor_runs` | 状态、数量、错误、时间 | 当前只展示最后一次状态，无法表达逐链健康 |

生产尚无 `user_trades`；Phase 0 不创建该表。Phase 4 才通过独立 migration 新增，金额字段全部使用最小单位文本，EVM 地址规范化为小写，Solana 地址保留原始 base58。

## 3. 代码审计发现

### P0：进入钱包开发前必须处理

1. **四链监控并非健康。** 近期 Solana/BSC 轮次持续写入 `D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'`，而 Base/Robinhood 轮次成功。行情合并函数的返回类型声明为必填，但全源缺值时会实际返回 `undefined`；随后 monitor 更新语句直接 `.bind()`，与生产错误高度吻合。修复时必须增加默认值和失败用例，不能靠吞错。
2. **调度鉴权与密钥职责混淆。** `scripts/collect-gmgn.mjs` 向监控 API 发送 `GMGN_API_KEY`，服务端也把它接受为 bearer；应只允许 `MONITOR_SECRET`。GMGN key 只用于访问 GMGN，不能兼任站点写接口凭证。
3. **无自动化回归测试。** `signal-policy` 边界、列表 API、详情页、monitor 主流程、阈值幂等、企业微信重试均无保护。
4. **通知失败会永久漏报。** signal 先落库，企业微信发送错误被吞掉；下一轮因唯一信号已存在而不会补发。需要可重试的 outbox/alert 状态，但必须保持企业微信消息内容和触发阶段不变。
5. **BONK 纠错键与真实合约不一致。** `token-identity.ts` 的 override 地址并非生产测试信号使用的 BONK 合约，因此所谓身份修正不会命中；同时 Solana 地址不应按 EVM 规则统一小写存储或比较。

### P1：Phase 1 前纳入基线修复

- `GET /api/monitor/run` 会执行写操作；应保留 POST，GET 不得产生副作用。
- `due` 只选择当前最高阈值；钱包数跨级跃迁时可能跳过 6/18 等阶段，需用测试确认并定义补齐顺序。
- monitor 多表写入不是原子流程；signal、hot posts、snapshot 与通知可能部分成功。
- `monitorOk` 只看全局最后一条 run，某一链失败会被下一条成功覆盖；应按链记录/展示健康度。
- 工作流文档与实际不一致：文档称每五分钟、每 60 秒 5 次，实际为每小时启动、每 48 秒循环 75 次。
- `/api/signals` 会在读请求中写回行情，内存 Map 不是跨 Worker 实例的可靠限流；Phase 2 应拆出纯批量行情 API。
- 详情页每次 SSR 同时请求行情和两组 K 线，外部请求延迟/额度会直接影响页面；需缓存、超时和部分降级。
- 监控金额大量使用 JS number、SQLite `REAL`/`INTEGER`；它们只能保留在监控估算域，交易域必须完全隔离。

## 4. 目标技术方案

### 边界与模块

```text
浏览器钱包
  ├─ Reown AppKit + Wagmi/Viem（BSC/Base/Robinhood）
  ├─ Reown Solana Adapter（Solana）
  └─ 每笔 approval / swap 由钱包确认和签名
          │
          ├─ GET /api/market/batch      只读、批量、可缓存
          ├─ POST /api/trade/quote      只读报价代理、校验、限流
          ├─ POST /api/trade/status     只读链上状态
          └─ GET/POST /api/trades       只存公共地址、哈希和状态

服务端绝不接收 signer、私钥、助记词或完整签名材料
现有 monitor → signals/snapshots → 企业微信链路保持独立
```

### Feature Flags（全部默认 false）

| Flag | 最早阶段 | 作用 |
| --- | --- | --- |
| `FEATURE_WALLET_CONNECT` | 1 | 显示连接、切链、余额 |
| `FEATURE_LIVE_MARKET` | 2 | 3 秒批量行情与新版 K 线 |
| `FEATURE_TRADE_QUOTE` | 3 | 只读报价 |
| `FEATURE_TRADE_TESTNET` | 4 | 测试网/模拟签名与广播 |
| `FEATURE_TRADE_MAINNET` | 4 | 全局主网广播总开关 |
| `FEATURE_TRADE_MAINNET_{CHAIN}` | 4 | 单链主网开关，必须与总开关同时为真 |

客户端只接收布尔开关；聚合器 key、RPC key 和风控上限留在服务端。即使 UI 被绕过，quote/broadcast 相关 API 也必须服务端二次拒绝。

### 报价与交易校验

- 以 allowlist 定义 chain、输入/输出 token、spender、router/to、原生包装币、稳定币和浏览器。
- 每次报价验证 chainId、token address、decimals、最小单位数量、taker、slippage、expiry、minimum received、price impact、gas/priority fee、spender、to、value、calldata/instructions。
- 默认精确额度 approval；approval receipt 成功后才允许 swap。无限授权不提供默认入口。
- sell 前重新读取链上余额；高税、honeypot、不可卖、黑名单、模拟失败、极端价格影响或数据不确定时默认阻止。
- pending 先本地显示；只有拿到 tx hash 后才写公共交易记录，receipt/confirmation 后更新终态。

### UI 布局草图

桌面：

```text
┌ 顶栏：站点状态                         [连接钱包/网络/余额] ┐
├───────────────────────────┬──────────────────────────────┤
│ 代币头部 + 动态行情        │ Buy / Sell（吸顶，约 35%）   │
│ K 线 5m / 15m（约 65%）    │ 数量、快捷值、滑点、倒计时   │
│ KOL 趋势 / 热门帖子         │ 路由、费用、风险、确认摘要   │
│                             │ 本钱包交易记录               │
└───────────────────────────┴──────────────────────────────┘
```

移动端：顶部钱包按钮 → 代币/行情 → K 线 → 交易面板 → 趋势 → 帖子 → 记录。所有合约、哈希和错误文本使用 `overflow-wrap:anywhere`，页面不得横向滚动；列表页不放交易按钮。

## 5. 项目所有者需申请/确认的外部配置

| 项目 | 所有者动作 | 保存位置/备注 |
| --- | --- | --- |
| Reown projectId | 在 Reown Dashboard 创建项目，配置生产域名与本地开发域名 | projectId 可公开给客户端，但不能与服务端 secret 混用 |
| 0x API key | 创建 Swap API v2 应用，确认 BSC、Base、Robinhood Chain 配额 | Sites secret；当前官方支持链 ID 56、8453、4663 |
| Jupiter API key | 为 Solana Swap API 创建应用/额度 | Sites secret；若改用 0x Solana，需另行申请 priority access |
| 专用 RPC | 为每条主网和测试网申请有 SLA/限流说明的 endpoint | Sites secret；不要以公共 RPC 承担生产交易 |
| 风控参数 | 批准每链单笔上限、日上限、滑点上限、价格影响上限、报价 TTL、限流 | 服务端配置，默认最保守 |
| 资产 allowlist | 确认各链原生币、wrapped native、USDT/USDC 的官方合约与 decimals | 由项目所有者/安全评审双人核对 |
| 合约 allowlist | 确认 0x/Jupiter 返回的 spender/router/program ID 集合和升级流程 | 不允许盲信第三方 calldata |
| 浏览器链接 | 确认 Solana、BscScan、BaseScan、Robinhood Blockscout 的主/测试网 URL | 仅公开配置 |
| 安全评审 | 指定独立评审人、测试钱包和每链小额主网验收预算 | 主网 Flag 开启前必需 |

经官方资料核验的网络基线（实施时仍需再次核验）：

| 链 | 主网 | 测试网 | 原生币 |
| --- | --- | --- | --- |
| Solana | CAIP-2 `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | Devnet `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` | SOL |
| BSC | chainId `56` | testnet `97` | BNB / tBNB |
| Base | chainId `8453` | Base Sepolia `84532` | ETH |
| Robinhood Chain | chainId `4663` | testnet `46630` | ETH |

参考：[Reown 多链 AppKit](https://docs.reown.com/appkit/next/core/multichain)、[0x 支持链](https://docs.0x.org/docs/introduction/supported-chains)、[Solana clusters](https://solana.com/docs/references/clusters)、[BSC RPC](https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/)、[Base chainId](https://docs.base.org/base-chain/api-reference/ethereum-json-rpc-api/eth_chainId)、[Robinhood Chain 网络配置](https://docs.robinhood.com/chain/connecting/)。

## 6. 详细验收清单

### Phase 0 出口条件

- [x] 四份要求文档已完整阅读，并区分“附件背景”与项目所有者本次明确授权。
- [x] Git、依赖、D1 表、生产版本、环境变量名称、访问范围和 Worker 错误已核验。
- [x] 未创建 Site/数据库/表，未读取或提交 secret，未发布。
- [x] 生产 commit 已记录，可作为后续 diff 基线。
- [x] 构建通过；首页、列表 API、详情页生产只读检查通过。
- [x] lint 全绿（0 error / 0 warning）。
- [x] `pnpm test` 已建立并通过（6 个文件、13 项测试）。
- [ ] 四链 monitor 最近连续窗口无失败：D1 根因已用回归测试复现并修复；按“不经确认不发布”要求，生产连续窗口留待获批部署后验证。
- [x] `MONITOR_SECRET` 成为 monitor API 唯一鉴权凭证，调度脚本也不再使用 GMGN key 调站点写接口。
- [x] signal policy、独立钱包去重、四阶段幂等、D1 边界、通知重试和 monitor 鉴权回归测试已补齐；页面相关 lint/build 回归通过。

Phase 0.1 的本地代码门禁已关闭，详情见 `docs/PHASE_0_1_REMEDIATION.md`。在项目所有者确认迁移和发布前，**Phase 1 仍不准入**；发布后还必须完成四链连续运行窗口验收。

### 后续阶段统一回归门槛

- 原监控：四链、884 钱包、6/18/38/58、去重、归零退出、20M/10 天规则、成熟资产排除、BONK 身份、6/38 X 搜索均无回归。
- 企业微信：相同阈值只发一次；失败可重试且不重复；消息不包含交易执行指令。
- 钱包安全：DOM、请求、D1、日志和错误追踪中均无私钥/助记词/签名材料；拒签不留下 pending 交易。
- 网络：地址与 chainId 必须匹配；错链只显示切链；不支持网络不能报价或广播。
- 金额：最小单位字符串往返无精度损失；max/百分比卖出考虑 decimals 与手续费。
- 报价：过期、篡改、spender/to 不在 allowlist、模拟失败、风险超限均服务端拒绝。
- 授权：默认精确额度；approval 与 swap 两次确认清晰；授权失败不继续 swap。
- 状态：Pending/Confirmed/Failed 与链上 receipt 一致，区块浏览器链接链别正确。
- 行情：单页一个 batch 请求，无 N+1；可见 3 秒、隐藏 15 秒、恢复立即刷新；超过 15 秒标记延迟。
- 图表/时区：5m/15m 可切换，所有显式时间为 Asia/Shanghai。
- 响应式：375px 起无横向滚动，长合约/哈希/错误可换行，桌面面板吸顶不遮挡。
- Feature Flag：所有 flag 缺失时 fail closed；关闭主网 flag 后直接请求 API 也不能广播；逐链开关隔离。
- 发布：复用原 Sites project_id、`DB` 和公开访问范围；构建、lint、测试、API、详情页和 Worker 日志全部通过。

### Phase 4 主网单链放行清单

- [ ] 测试网或等价无价值模拟覆盖 connect、switch、quote、reject、approve、swap、timeout、reorg/failure。
- [ ] 聚合器与 RPC 健康，返回 allowlist 校验通过。
- [ ] 独立安全评审无未关闭 high/critical。
- [ ] 项目所有者书面确认该链、单笔上限、测试钱包和预算。
- [ ] 仅开启该链的 mainnet flag；其他链保持关闭。
- [ ] 第一笔小额交易由所有者在钱包中人工核对 token、amount、recipient、minimum received、fee 后确认。
- [ ] receipt、数据库记录、浏览器链接和监控日志一致；失败可恢复且不会自动重试下单。
