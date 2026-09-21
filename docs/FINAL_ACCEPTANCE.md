# Phase 0.1—4 最终验收记录（Phase 0 生产门禁已关闭）

## 2026-09-20 K线历史、微小价格与钱包/测试网准入复核

- 生产发布：原 Sites 项目 Version 48，提交 `e8e7c06529dc90fb0586dee2f027e8fcb8441a77`；Version 47 / `e6b70d6d102f7f3e1ca24add347bb6754961eb04` 完成K线数据模型与动态价格精度，Version 48修复顶部微小价格被截断。Site、D1及binding均未更换。
- 根因：`app/api/market/kline/route.ts` 对缺失的 `limit` 执行 `Number(null)` 得到 `0`，随后被夹到最小值2，导致首次周期加载误用2根窗口；前端旧实现又没有把完整历史与实时尾部作为两个缓存区管理。现在缺失limit保持`undefined`并使用周期默认完整窗口，缓存键严格为`chain + tokenAddress + interval`，状态分别保存`historyBars/liveTailBars/mergedBars/lastFullFetchAt/lastIncrementalFetchAt/isHistoryLoaded/isLive`。
- 增量行为：相同timestamp更新、更新的timestamp追加、更旧timestamp就地替换；空响应或失败保留既有历史。完整历史加载前不启动5根尾部轮询，尾部响应不会调用`setData(lastFiveBars)`覆盖历史。
- WOJAK生产证据：1m完整首载481根，20秒后仍481根（1次全量、2次增量）；切换5m得到121根，再切回1m立即恢复481根且全量请求计数不增加。独立两分钟Playwright用例最终显示483根，证明新蜡烛可追加且历史没有降为5根。
- 六周期生产首载（WOJAK）：1m 481、5m 121、15m 121、1h 169、4h 181、1d 181。四链各3个真实代币抽样结果按真实创建时长保留：Solana的GMEx为481/121/121/169/181/43、DJT为481/121/121/169/63/12；BSC的BIAOGE为481/121/121/169/112/33、Czar为481/121/41/11/3/2、ABS为111/53/上游瞬时空响应/12/3/2；Base两个成熟样本分别为481/121/121/169/181/32与481/121/121/169/181/64，年轻样本为21/14/12/11/6/3；Robinhood的URANUS为480/120/109/37/13/5、9e9为480/120/87/22/5/1、JERRY为480/120/120/42/11/2。顺序均为1m/5m/15m/1h/4h/1d；年轻币少量历史是上游真实可用量，不补假K线。
- 微小价格：统一格式化覆盖顶部、图表轴/最新价/OHLC与交易面板。八组断言分别为`$1,234.56`、`$92.1549`、`$0.2946`、`$0.0021481`、`$0.00002246`、`$0.00000029913`、`$0`、`--`。WOJAK当前图表轴显示8位小数，`precision=8`、`minMove=0.00000001`，不再显示`0.00`。
- 自动化：lint通过；TypeScript通过；Vitest 18文件/73项通过；build通过。生产Playwright 5/5通过，覆盖375×812、390×844、六周期缓存、3秒行情刷新以及两分钟历史保持。`pnpm audit --prod`仍为1 high + 3 moderate，均为钱包依赖的传递告警；钱包开关关闭，未用override强行跨主版本。
- 截图：`docs/screenshots/production-v48-list-desktop-1440x1000.png`、`production-v48-list-mobile-390x844.png`、`production-v48-detail-desktop-1440x1000.png`、`production-v48-detail-mobile-390x844.png`、`production-v48-wojak-small-price-axis.png`。
- 钱包准入：代码层Reown AppKit、Wagmi/Viem、Solana Adapter以及连接拒绝、切链失败、余额读取、断开清理的mock测试通过；生产缺少`REOWN_PROJECT_ID`和Reown允许域名确认，因此`FEATURE_WALLET_CONNECT`仍为false，未伪称真实Phantom/Solflare/MetaMask/WalletConnect验收通过。
- 测试网准入：状态机mock覆盖精确额度授权、授权与交易分次确认、用户拒签、报价过期、余额不足、RPC/授权/交易/确认失败、记录边界禁止私钥/助记词/签名材料；D1通过`UNIQUE(chain, tx_hash)`和upsert实现幂等。0x官方明确不支持测试网，所以BSC Testnet、Base Sepolia及Robinhood Testnet不能使用0x完成真实聚合器验收；Solana Jupiter也没有取得可核验的Devnet聚合路由。未配置获批测试Router/program与专用测试钱包前，`FEATURE_TRADE_TESTNET`保持false。
- 最终开关：`FEATURE_LIVE_MARKET=true`；`FEATURE_WALLET_CONNECT=false`、`FEATURE_TRADE_QUOTE=false`、`FEATURE_TRADE_TESTNET=false`、`FEATURE_TRADE_MAINNET=false`，以及SOL/BSC/Base/Robinhood逐链主网开关全部false。没有真实买卖、授权、签名或资金操作。

## 2026-09-20 UI 与实时行情升级（生产已发布）

- GitHub `main` 已同步检查并确认采集器基准为 `a54110ce544cf379ef873744635eb229bba725ca`；Sites 仓库与 GitHub 仓库历史独立，因此按内容核对，未用强制合并覆盖现有 Phase 1—4 代码。`MONITOR_SECRET`、GMGN 鉴权、企业微信、6/18/38/58 规则、钱包/报价/交易开关均未修改。
- UI 主提交：`bf3e982b4edd3e40e8a473159907002e3ba4d390`；返回导航最终修复：`b251912127b32c45d13dded3f4e47574833d4ce3`。
- 生产：原项目 `appgprj_6aab63edac688191ba19edf4d8b85582`，Sites version 35（归档源码 `4498fd60373241d6cae25604de3c5a6853028efc`），部署成功，URL 仍为 `https://kol-signal-monitor.pkj15083826136.chatgpt.site`，环境变量修订仍为 16，未创建 Site、数据库或 binding。
- 列表页已移除价格列，固定为身份、AI 分析、KOL人数、持币地址、市值、流动性、24H交易额、预警时间和详情箭头；`createdAt` 与行情 `updatedAt` 在 API、类型和组件中分离。生产浏览器验证不同记录显示了不同的分钟/小时/天级预警时间，行情轮询不会改写它。
- 列表每 15 秒增量刷新；后台恢复时立即刷新；筛选、搜索和滚动位置保存在 sessionStorage。详情返回使用原生 GET 表单作为 WebView 可靠回退，回到 `/` 后由列表恢复原状态；有列表来源与直接打开详情两条路径均由生产 E2E 验证。
- 详情行情卡和 K 线摘要复用同一个实时状态；前台 3 秒、隐藏 15 秒、恢复立即刷新。首次没有真实值时显示 `--/数据源不可用`，超过 30 秒显示“行情延迟”，没有生产 fixture 回填。
- 生产 BONK 三次动态行情采样（北京时间）：`01:03:20` / `01:03:24` / `01:03:28`；价格 `0.0000030699` / `0.0000030721` / `0.0000030721`，市值 `270134174.14` / `270327761.94` / `270327761.94`，流动性 `1567875.56` / `1567807.00` / `1567806.99`，24H `2386058.65` / `2386085.30` / `2386085.30`，来源均为真实 `Ave/GMGN fallback`，合约为 `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263`。
- K 线支持 5m/15m/1h/4h/1d，分别请求 120/120/168/180/180 根，默认仅服务端获取 15m。生产 E2E 依次切换其余四周期时 API 请求计数为 4，再切回 5m 请求数保持 4，证明缓存生效；有数据时展示 Ave/Gecko 来源，无数据时展示“该链暂不支持此周期”，不画假 K 线。
- 移动端 375×812、390×844 均验证 `document.documentElement.scrollWidth <= clientWidth` 且关键容器无越界；桌面保持约 65/35，手机顺序为代币信息/K线/交易面板/KOL趋势/建仓账户/热门评论。

生产截图：

- [桌面列表 1440×1000](/C:/Users/15083/Documents/ChatGPT/链上早期信号/docs/screenshots/production-ui-v34-list-desktop-1440x1000.png)
- [手机列表 390×844](/C:/Users/15083/Documents/ChatGPT/链上早期信号/docs/screenshots/production-ui-v34-list-mobile-390x844.png)
- [桌面详情 1440×1000](/C:/Users/15083/Documents/ChatGPT/链上早期信号/docs/screenshots/production-ui-v34-detail-desktop-1440x1000.png)
- [手机详情 390×844](/C:/Users/15083/Documents/ChatGPT/链上早期信号/docs/screenshots/production-ui-v34-detail-mobile-390x844.png)

验收结果：`pnpm lint` 0 error/0 warning；`pnpm exec tsc --noEmit --incremental false` 通过；`pnpm test` 16 文件 50 项通过；`pnpm build` 通过；生产 Playwright 覆盖 4 项（375/390 溢出、返回两路径、五周期与缓存、BONK 真实行情和至少三次轮询）。`pnpm audit --prod` 仍为钱包依赖链 1 high + 3 moderate，依赖链和暂缓原因见下文；交易功能保持关闭，因此本次不强制跨主版本 override。

本次没有数据库迁移。回滚时在 Sites 将生产版本切回 version 29（提交 `942460f`）即可；D1 无需回滚。Feature Flags 保持：仅 `FEATURE_LIVE_MARKET=true`，钱包、报价、测试网、主网及所有逐链主网开关均为 `false`。

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

---

# 2026-09-20 市场数据完整性收尾（取代上方旧生产门禁结论）

## 发布与根因

- 原 Site：`https://kol-signal-monitor.pkj15083826136.chatgpt.site`，未更换项目、D1 或 binding。
- v41 / `21675f34b95381f8b70a20900ad52165fe69d564`：统一 MarketSnapshot、字段级 last-known-good、K线增量、24H涨跌、历史异常迁移。
- v42 / `b21996a6489f62ccc439c83af5db0f796e6f7b49`：GMGN 从按代币退避改为数据源全局指数退避。
- v43 / `837fadf15b7289580de5643f5f88cdf7e51e06be`：市场源健康状态写入。
- v44 / `c58445b3275db642e2092954f0045139f627261b`：每轮按来源聚合健康状态，避免后续局部响应覆盖健康结果。
- v45 / `9070479007732dc10f05791a3e2905a9fdca9094`：每条链每轮最多执行一次真实 Ave token-detail 健康采样；已发布到原 Site，部署成功。
- v46 / `6ed2f84f3d774535d9d3c66e9095cf11efe133b5`：陈旧 `sending` 通知转入 `manual_review`，发送结果未知时禁止自动重发；已发布到原 Site，部署成功。
- SPYx/SPN500 根因精确定位在 `lib/batch-market.ts`、`app/api/market/batch/route.ts` 与 `lib/market-live.ts`：Ave `/v2/tokens/price` 是局部行情，旧代码把缺失市值强制成0并整体替换SSR token-detail；Dex pair价格也可在局部刷新中进入同一对象。现在必须通过chain+完整tokenAddress身份校验，Solana大小写敏感；pairAddress不能充当tokenAddress；按字段合并并保留独立来源/时间戳；请求序号、AbortController和receivedAt阻止旧响应回写。

## SPYx/SPN500 生产20次采样

- 合约始终为 `XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W`，pair始终为 `6truu3rZuiB9rKQg4VYC3Dt3QwV7DgwGqXrYUcrvnDDE`，symbol始终为 `SPN500`，identityVerified始终为true。
- 价格范围 `$767.49469–$769.15266`；市值范围 `$73.0897M–$73.2476M`；holders `75,372–75,373`；20/20没有市值或holders丢失，未复现`$0.2946`数量级错误。
- 一次批量源退化为 `Ave/GMGN fallback`，完整token-detail字段仍保持；staleFields/conflictFields均为空。

## 四链12个真实合约抽样

每个合约执行3次生产刷新。SPN500、DJT、Czar、ABS、SI、gKIRK、AI、9e9三次均保持有效市值和holders。HYPE、HYDX、COBIE、JERRY各有一次上游token-detail瞬时缺失；接口如实返回局部快照，浏览器字段级LKG不会让已显示的有效市值/holders变成`--`。COBIE一次完整身份数据不可用，未合并到既有快照。

- Solana：SPN500、HYPE（真实精确地址含`RQi5`）、DJT。
- BSC：Czar、ABS、SI。
- Base：HYDX、gKIRK、COBIE。
- Robinhood：9e9、JERRY、AI。

## K线实时更新和API负担

- 六周期均由生产Ave返回真实OHLCV；对SPN500的`1m/5m/15m/1h/4h/1d`短窗口请求均成功，每次只请求最近5根（上游实际返回6点）。
- timestamp相同更新当前蜡烛，出现新timestamp时追加；切换代币/周期会取消旧请求，失败保留现有图表；缓存避免切回周期再次全量请求。
- 前台：1m每7.5秒（8次/分钟）；5m/15m每12秒（5次/分钟）；1h/4h/1d每25秒（2.4次/分钟）。后台统一60秒（1次/分钟）；每周期首次仅一次全量请求，之后仅增量5根。

## 简介和24H涨跌

- 已实现GMGN优先、launchpad其次、Ave再次的简介选择，解析Ave appendix，清理HTML/script并限制1200字符；官方简介独立保存到`official_description/description_source/description_updated_at`，不会再写入`gmgn_theme`，AI分析不会冒充官方简介。
- 生产抽样20个当前公开信号：GMGN市场metadata处于IP rate-limit，Ave对这20个合约均未返回可核验简介，因此GMGN 0、Ave 0、默认提示20。该结果明确是上游限制，不宣称多源确认，也不生成简介。
- 价格卡使用真实`price_change_24h`，正/负/零分别绿/红/中性；与短暂价格跳动颜色分离。生产截图中可见`+0.74%`。

## 最近50条与HYPE

- 完整逐条处置见 `docs/RECENT_50_DISPOSITION.md`：超过30%误差9条、超过3倍7条、超过10倍4条。
- 已确认抑制：GLDx、SPCXx、WBTC、CARDS以及此前已抑制的HYPE；DOGE、ABS、智脑、PEPE修正历史展示值但因修正后仍不满足成熟高市值结论而保留。未删除signals记录，未发送企业微信更正。
- 成熟资产集合只保留真实HYPE `98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g`。错误字符`...RQj5...`已从生产集合和market_reviews移除，只作为不匹配单元测试。

## D1迁移与恢复

- 迁移前只读备份位于忽略提交的 `outputs/d1-backup-pre-v41.json`：signals 72、market_reviews 11、source_health 8、monitor_runs 882行。
- `0006_abnormal_charles_xavier.sql`仅新增signals简介字段、monitor_runs审核计数、source_health重试/影响字段，并对已确认历史误报做可审计UPDATE；不删除signals、旧列、Site、数据库或binding。
- 迁移后signals 74行（期间监控新增2条），重复`chain+token_address+threshold`为0；最终outbox为sent 67、suppressed 7，无pending/retry/failed/manual_review积压。迁移回滚优先使用部署前D1 Time Travel/备份；代码可回滚到Sites v40 / `31b8830468842aa73a45aaf28d58b1c0c2818194`。

## 四链连续生产轮次

GitHub Actions Run #27（`35482576316`，GitHub提交`b4db2cf`）调用生产v46。以下为v46发布后每链三轮连续success；时间为北京时间，feed_errors均为空，market_conflict均为0。

| 链 | run id | 开始—结束 | 抓取 | 匹配 | 新交易 | 新信号 | data_review | 错误 |
|---|---:|---|---:|---:|---:|---:|---:|---|
| Solana | 939 | 10:06:48—10:07:09 | 200 | 72 | 58 | 0 | 1 | 无 |
| Solana | 943 | 10:10:58—10:11:17 | 200 | 79 | 36 | 0 | 1 | 无 |
| Solana | 947 | 10:15:08—10:15:29 | 200 | 83 | 41 | 0 | 0 | 无 |
| BSC | 936 | 10:03:50—10:04:05 | 200 | 106 | 22 | 0 | 0 | 无 |
| BSC | 940 | 10:08:01—10:08:16 | 200 | 103 | 18 | 0 | 0 | 无 |
| BSC | 944 | 10:12:07—10:12:25 | 200 | 113 | 36 | 0 | 0 | 无 |
| Base | 937 | 10:04:56—10:05:01 | 120 | 115 | 0 | 0 | 0 | 无 |
| Base | 941 | 10:09:06—10:09:11 | 120 | 115 | 0 | 0 | 0 | 无 |
| Base | 945 | 10:13:15—10:13:19 | 120 | 115 | 0 | 0 | 0 | 无 |
| Robinhood | 938 | 10:05:51—10:05:57 | 200 | 101 | 1 | 0 | 0 | 无 |
| Robinhood | 942 | 10:10:01—10:10:07 | 200 | 101 | 3 | 0 | 0 | 无 |
| Robinhood | 946 | 10:14:10—10:14:17 | 200 | 100 | 9 | 0 | 0 | 无 |

12轮均无HTTP 401、D1_TYPE_ERROR、undefined bind或重复阶段预警。企业微信仅处理真实业务信号；没有发送测试消息，未发现同阶段重复发送。历史`id=51`的未知投递结果已隔离为manual_review，未自动重发。

该窗口中Ave在Solana、BSC、Robinhood的真实token采样均为healthy；Base本窗口没有达到门禁或48小时活跃条件的token，因此没有生成伪造的market-source健康记录。Base的采集源仍为healthy，且前述3个真实Base合约的API抽样通过。GMGN采集feed四链healthy；GMGN市场metadata继续rate_limited，系统使用全局退避，Ave/Dex继续工作。

## 最终验证与截图

- lint：0 error / 0 warning；TypeScript通过；Vitest 18文件/72项全部通过；build通过。
- 生产Playwright：4/4通过，覆盖375×812、390×844、1440×1000无横向溢出、返回按钮、六周期缓存、SPYx真实API以及前台3秒刷新。
- `pnpm audit --prod`仍为1 high + 3 moderate，全部在Feature Flag关闭的钱包依赖链；详情和暂缓原因沿用上方依赖审计，未为消除告警强制跨主版本override。
- 截图：`docs/screenshots/production-v46-list-desktop-1440x1000.png`、`production-v46-list-mobile-390x844.png`、`production-v46-detail-desktop-1440x1000.png`、`production-v46-detail-mobile-390x844.png`。
- v46生产Playwright再次4/4通过；SPN500详情显示真实价格、市值、holders和24H涨跌，桌面与390px手机截图均无重复行情摘要或横向溢出。
- 交易相关Feature Flag继续全部false；未连接真实钱包、未真实报价、未测试网/主网签名或广播。

## 通知投递与调度收尾

- 生产复核发现历史信号 `id=51` 自 2026-09-19 起停留在 `sending`，且没有 `alert_sent_at`；由于无法证明企业微信是否已经接收，v46 将超过10分钟的陈旧发送claim隔离为 `manual_review`，错误原因为“delivery outcome unknown…automatic retry suppressed”。该处理没有发消息，也不会自动重发造成重复预警。
- GitHub Actions 每小时任务原为75次轮询并设置90分钟超时，按生产实际单轮耗时存在超时或与下次调度重叠的风险。GitHub `main` 提交 `b4db2cf14804446efeaabd4536d7022069793ea8` 将单次窗口改为40次（每链10次）、60分钟超时，保留失败累计和连续3次失败提前停止；未更改鉴权、数据源或6/18/38/58规则。
- GitHub Actions Run #27（`35482576316`）于北京时间09:54:08开始、10:35:19结束，40/40轮成功，最终结论`success`；末四轮run 963–966仍全部success。v46发布后45分钟Worker错误日志没有非客户端取消类错误。

## 尚存上游限制

- GMGN市场metadata当前为`rate_limited`，全局指数退避并带抖动；Ave和Dex继续提供行情。当前20个简介样本无可核验文本，因此简介功能代码完成但真实内容命中率尚不能验收为通过。
- 生产`market_reviews`当前共11条，其中data_review仅2条（`token_identity_unverified` 1、`market_cap_unknown` 1），其余9条为成熟资产抑制；样本不足20，不能伪造“随机抽查20条”。当前两条均是关键字段无法验证后的预期门禁，不是已知字段解析错误。达到20条后再做人工抽样；门禁原因仍区分market_cap_unknown、creation_time_unknown、identity unverified和conflict。

---

# 2026-09-21 OKX Onchain Stage A

生产实时行情和六周期K线已由OKX Onchain接管，Ave退出公开页面高频行情和K线路径，仅保留监控任务显式触发的低频影子健康采样。四链12个真实合约市场字段全部通过身份校验，72个六周期组合在两次429冷却重试后全部取得真实结果；生产Playwright 6/6通过。

本次为Stage A，不是7天SLA结论。Stage B从北京时间2026-09-21 00:46开始，由“OKX 7天影子采样汇总”每日检查；GMGN metadata 20个样本命中0，真实钱包插件/扫码切链仍需项目所有者批准，均明确保留为未通过/待人工项。完整证据、迁移、风险和回滚见 `docs/OKX_STAGE_A_ACCEPTANCE.md`。

---

# 2026-09-21 土狗雷达 Phase 1

已在原 Site 源码中新增独立 `/radar` 页面、确定性硬过滤、100分评分、Grok严格结构化审核、受保护候选入口、原 signals 安全同步、Paper退出状态机、训练数据导出和钱包/KMS禁用骨架。Ave Smart 没有可验证公开接口，状态明确为 `BLOCKED_EXTERNAL_ENDPOINT`；当前备用来源是现有 GMGN KOL 聚集，缺少安全证据时默认 `HOLD`。

新增迁移只增加15张表和3个signals标签列，不删除或覆盖生产数据。钱包、雷达钱包登录、自动交易、报价、测试网、主网及所有逐链广播开关均为false。完整范围、测试、审计告警和回滚见 `docs/RADAR_PHASE_1_ACCEPTANCE.md`；生产版本、截图和生产浏览器结果在发布完成后补记。
