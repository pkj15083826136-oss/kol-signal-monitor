# OKX Onchain Stage A 生产验收

验收时间：2026-09-21（北京时间）  
原 Site：`https://kol-signal-monitor.pkj15083826136.chatgpt.site/`  
Stage A 行情切换发布：Sites Version 57 / `4c73d976165c488c7ea03beb4754e208444f9952`  
当前生产（遥测聚合修复）：Sites Version 58 / `d7891abb3c7586a226d9eb824f75da7ac111f919`

## 已完成并通过

- OKX Onchain Market API 已成为生产实时价格、24H涨跌、市值、流动性、24H成交额、holders 与六周期K线的主源。
- 服务端运行时读取四项 OKX Secret；客户端、D1、日志、截图、测试及提交均不包含Secret或签名材料。
- 签名采用 UTC timestamp + uppercase method + path/query + body 的 HMAC-SHA256/Base64；发送官方访问头与Project ID头。
- 四链真实市场能力已由合约级响应验证：Solana、BSC、Base、Robinhood Chain 均为 `identityVerified=true`。
- 12个真实合约（每链3个）市场字段均成功：价格、市值、市值口径、流动性、成交额与holders均为真实OKX响应。
- 六周期为 `1m/5m/15m/1h/4h/1d`。1m通过分页获得最多480根；其他完整窗口分别为120/120/168/180/180。年轻代币按实际创建时间只返回真实可用数量，不补假K线。
- 72个“链+合约+周期”检查中，节流复测首轮70个成功，2个被明确识别为429；冷却后单独重试均为healthy，最终72/72取得真实结果。高并发压力结果不冒充正常负载成功率。
- Ave已从公开页面高频行情和全部K线路径移除；仅监控任务显式选择时每轮最多一次影子健康采样，环境变量暂留用于回滚。
- GMGN只调用正式 `openapi.gmgn.ai` 接口，继续承担KOL/聪明钱与metadata；不调用网页私有接口。
- 市值与FDV严格分开。FDV只保存在`fdv`，不能进入`marketCap`、首次信号市值门禁或页面“市值”。Pair级数据不能覆盖Token身份或市值。
- Token身份按 `chain + tokenAddress` 校验；Solana区分大小写，EVM地址比较统一小写。
- 页面字段级last-known-good仍有效；空值、0、NaN及失败响应不能清空已有有效字段。
- 钱包修复了“已连接即完成切链”的错误判断；EVM内部切换必须等待实际chainId等于目标链，旧异步响应仍由generation机制隔离。
- KOL快照新增仓位变化、采样覆盖率及缺口原因；无新交易的活跃信号仍写入持仓状态，真实缺口不插值。
- 生产Playwright 6/6通过：375×812、390×844、1440×1000、返回导航、六周期缓存、3秒行情轮询、钱包弹窗取消、WOJAK完整历史保留2分钟。

## 真实生产样本

| 链 | 市场样本 | 市场结果 | 1m | 5m | 15m | 1h | 4h | 1d |
|---|---:|---|---|---|---|---|---|---|
| Solana | 3 | 3/3 healthy | 480 | 120 | 120 | 40–168 | 11–180 | 2–180 |
| BSC | 3 | 3/3 healthy | 249–480 | 120 | 74–120 | 38–70 | 14–20 | 3–4 |
| Base | 3 | 3/3 healthy | 480 | 120 | 120 | 168 | 180 | 180 |
| Robinhood | 3 | 3/3 healthy | 480 | 120 | 120 | 36–52 | 10–18 | 2–6 |

K线较少的BSC/Robinhood样本均为年轻代币的真实历史长度。两次429分别发生在BSC 1d与Base 1h压力采样，冷却后返回3根与168根；页面失败语义为保留上次成功数据并显示中断，不会跨周期替代。

## 遥测与数据库迁移

- `0007_left_impossible_man.sql`：新增 `provider_samples` 及唯一桶索引/时间索引。
- `0008_volatile_madripoor.sql`：signals新增 `website`、`socials_json`，只追加列，不覆盖已有简介。
- `0009_strange_hellion.sql`：snapshots新增 `position_delta`、`coverage_ratio`、`missing_reason`。
- `0010_motionless_champions.sql`：provider_samples新增 `observation_count`；同15分钟桶改为幂等聚合请求数、成功数、缓存命中和429，不再丢弃重试。
- 迁移均为增量schema变更，无DELETE、DROP、历史signal重发或数据回填。

Stage A第一轮压力采样（修正遥测聚合前）产生116条桶样本。市场样本：Solana 20/21、BSC 11/11、Base 3/3、Robinhood 3/3；K线样本含故意并发压力造成的429与fallback失败，因此不能作为7天SLA。该批数据保留为压力基线，不写成Stage B通过。

Version 58生产复核：同一Base WETH市场桶连续两次观测后，`observation_count=2`、`request_count=2`、`success=2`、`rate_limited=0`，证明重试与重复观测会被聚合而非丢弃。

## 已实现但仍在采样

- Stage B起点：北京时间 `2026-09-21 00:46`。
- 已创建每日自动检查“OKX 7天影子采样汇总”；无实质变化时保持安静，严重回归立即提示，满7天后按门槛正式判定。
- 需要累计四链每链至少20个代币、最近50条信号、六周期请求、P50/P95、429率、字段缺失、1m延迟、身份错误和fallback次数。
- OKX接口未直接返回计费金额；实际成本/额度消耗只能由OKX控制台补充，代码只记录请求量。

## 未通过或需要上游/人工继续验证

- GMGN metadata真实抽查20个公开信号：可核验简介0/20、官网0/20、社交链接0/20。页面如实显示默认提示；该项未通过，不能用AI分析或KOL帖子填充。
- Binance公开价格交叉验证尚未进入生产选择路径；仅计划用于交易所已上线主流资产，绝不会用于任意链上合约。
- OKX交易明细未被当前页面或监控消费，未纳入本次生产切换；接入前需单独验证官方接口字段与额度。
- 真实OKX插件/WalletConnect的刷新恢复、BSC→Base→Robinhood及EVM↔Solana切换仍需要项目所有者在钱包内批准连接/切链。本次只完成自动化状态机、弹窗取消与无交易请求验证。
- Stage B不足7天，不能宣称OKX已达到正式切换SLA；Ave影子配置暂不删除。

## Feature Flags

- `FEATURE_LIVE_MARKET=true`
- `FEATURE_WALLET_CONNECT=true`
- `FEATURE_TRADE_QUOTE=false`
- `FEATURE_TRADE_TESTNET=false`
- `FEATURE_TRADE_MAINNET=false`
- `FEATURE_TRADE_MAINNET_SOL/BSC/BASE/ROBINHOOD=false`

未执行报价、授权、签名、广播或真实资金操作。

## 测试与依赖

- lint：通过，0 error / 0 warning。
- TypeScript：通过。
- Vitest：22个文件、103项通过。
- build：通过；保留既有chunk-size建议。
- Playwright：本地3项通过/3项生产专用跳过；生产6/6通过。
- `pnpm audit --prod`：1 high + 3 moderate，均在Reown/Solana/WalletConnect传递依赖链；交易Flag关闭，未用override强行替换不兼容版本，继续跟踪上游修复。
- Worker日志：验收窗口无异常堆栈；5条浏览器取消请求被Cloudflare标记为`canceled`，不是Worker异常。

## 回滚

1. Sites回滚到Version 56（commit `e578b4247a1ac6eaa8dfa806fc41a9d50cbc2648`）。
2. 保持所有交易Flag为false；无需改动任何Secret。
3. 新增列和`provider_samples`表可保留，不影响v56。若必须回滚数据库，使用发布前D1 Time Travel；不得直接DROP或删除历史signals。
4. Version 56仍保留Ave路径，适合短时回滚；Stage B完成前不删除 `AVE_API_KEY`。

## 截图

- `docs/screenshots/production-v57-list-desktop-1440x1000.png`
- `docs/screenshots/production-v57-list-mobile-390x844.png`
- `docs/screenshots/production-v57-detail-desktop-1440x1000.png`
- `docs/screenshots/production-v57-detail-mobile-390x844.png`
- `docs/screenshots/production-v57-wallet-mobile-390x844.png`
- `docs/screenshots/production-v57-wojak-small-price-axis.png`
