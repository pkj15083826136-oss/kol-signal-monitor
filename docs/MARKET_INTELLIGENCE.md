# 交易所动态与大额资金流向

这两个模块与 KOL 监控、土狗雷达完全隔离，不读取 GMGN、Ave、钱包池、土狗评分或 6/18/38/58 阈值。它们只复用页面风格和北京时间格式。当前产品范围为**仅公开网页展示**：两个新模块不写入、不消费各自历史通知队列，也不调用企业微信发送底层；原 KOL 信号与土狗雷达的企微行为不变。

## 仅网页版本验收门槛

- 两个新采集路由不得导入 `lib/wecom.ts`，不得写入或消费 `exchange_alert_deliveries`、`fund_flow_alert_deliveries`；API 返回 `notifications.enabled=false` 与 `mode=web_only`。
- 原 `app/api/monitor/run/route.ts` 的 KOL `sendWeComAlert` 调用、6/18/38/58 阈值和土狗雷达隔离状态必须继续通过回归。
- 页面明确说明“仅网页展示，不发送企业微信通知”；数据源许可只评估自动采集、公开网页、有限缓存、历史保留和衍生汇总。
- 生产资金流的 `PUBLIC_FLOW_ENABLED`、`WHALE_ALERT_ENABLED`、`BITQUERY_ENABLED` 均保持关闭；Whale Alert 与 Bitquery 还须各自的公开展示批准变量，单有 API key 不得启动。
- 发布前仍需真实数据链路、移动端无横向滚动、失败状态、游标恢复、去重、原功能回归与最终钱包只读烟测；通知送达不再是两个新栏目的验收项。

## 交易所动态

- 初始名单：Binance、Coinbase、Upbit、OKX、Bybit、Kraken、Bitget、Gate、MEXC、HTX；这是产品监控名单，不是实时排名。
- 每家都通过官方公开交易对接口建立现货快照；有公开接口的交易所同时建立合约快照。
- 首次快照只建立基线，不产生上币事件。之后的集合差异保存为实际开通/停止时间。
- 官方公告以交易所自己的公告页或公告 JSON 为第一来源。无法稳定读取的来源必须在 `exchange_collector_state` 标为失败，不得用媒体转载替代。
- 公告身份为 `exchange + official announcement id`；标题或内容变化追加 `exchange_event_revisions`，不创建第二条事件。
- 所有事件只写 `exchange_events` 与修订记录。`exchange_alert_deliveries` 为兼容既有本地迁移而保留表结构，但新代码不入队、也不消费历史行。

### 2026-09-24 本地真实链路验收

本地测试 D1 首轮只建立基线，第二轮及连续三轮均未把既有公告或交易对当成新事件。以下数量来自官方端点的当次响应，不是 fixture；页面 `/exchanges` 直接读取这些 D1 行。

| 交易所 | 官方公告源 | 当次解析/入库 | 交易对核验 | 状态与实际覆盖 |
| --- | --- | ---: | --- | --- |
| Binance | 官方公告分类 API | 24 / 24 | 现货 3713、合约 907 | PASS；上币、交易对、合约、Alpha、活动、下架标题分类 |
| Coinbase | 官方指定的 `@CoinbaseMarkets` | 0 / 0 | 现货 514 | PARTIAL；官方提前公告未接通，但官方公开交易对快照继续运行，不能删除该交易所或把缺少公告误写成没有实际交易对监控 |
| Upbit | 官方 Private Announcement WebSocket | 0 / 0 | 现货 855 | PARTIAL；官方提前公告未接通，但官方公开交易对快照继续运行；不绕过公告网页限制，也不要求交易或提现权限 |
| OKX | 官方 New listings、Delistings、Trading updates | 20 / 20 | 现货 1415、合约 492 | PASS；三类页面合并去重 |
| Bybit | 官方公告 API | 9 / 9 | 现货 530、合约 885 | PASS；已排除 Token Splash/奖池活动误判为上币 |
| Kraken | 官方 Asset Listings WordPress JSON | 20 / 20 | 现货 1368 | PASS；使用官方分类 JSON 和文章 ID，公告与交易对分别保存 |
| Bitget | 官方公告 API 三分类 | 14 / 14 | 现货 3169、合约 805 | PASS；coin listings、symbol delisting、product updates |
| Gate | 官方公告 POST API | 7 / 7 | 现货 2222、合约 1013 | PASS；官方 ID 作为事件身份 |
| MEXC | 官方公告页 | 1 / 1 | 现货 1956、合约 1194 | PASS；页面结构为空或变化时显式报错 |
| HTX | 官方公告页 | 16 / 16 | 现货 608、合约 361 | PASS；官方链接、公告 ID、修订记录保留 |

连续观测窗口内 8 个已接通公告源的 `changed=0`，所有交易对源 `created=0`，证明同一官方内容不会重复入库。当前验收另要求两个新采集路由均不引用企微发送函数或通知表；不再把通知送达作为发布门槛。

12 分钟故障观测实际执行 11 轮：前 10 轮计划启动漂移为 2–15ms，单轮 24–39 秒；第 11 轮遇到多个官方端点同时变慢，串行版本耗时 174.254 秒，调度器记录 `schedule_lag skipped=2`，没有重叠执行或并发补跑。修复为“交易所之间并发、同一交易所内公告/现货/合约有序”后连续 5 轮均按 60 秒计划点启动，漂移 0–12ms，单轮 34.5–52.0 秒，无跳点、无任务重叠；8 家公告源每轮均成功，首轮因补齐可验证公告时间产生一次原事件修订，随后 4 轮 `changed=0`，队列始终 `queued=0/sent=0`。

Binance 现货 `exchangeInfo` 完整响应约 17.6MB，经 Worker 中转会在读取响应体时持续超时。现由既有 Node/GitHub 采集器直接读取 Binance 官方 `data-api.binance.vision`，使用 `showPermissionSets=false` 保留相同 symbol 集合并把响应降至约 6.7MB，再只把规范化交易对数组提交给独立 API；API 仍执行完整性比例检查、连续两快照确认和 D1 去重，并与其余九家并发采集。为保证单轮在分钟目标内收敛，官方 HTTP 每轮最多两次、单次 20 秒并在两次间退避；失败写健康状态，下一分钟从官方列表和最近完整快照继续，而不是在同一轮无限重试。失败期间保留最近完整快照且页面显示源错误。

既有构建实跑一轮：Node 侧 Binance 完整现货快照为 3,713 对，保留官方非拉丁 symbol；API 内 8 家已接通公告源全部成功且 `changed=0`，全部 25 个已配置公告/交易对源为 healthy，只有 Coinbase、Upbit 公告保持预期 blocked/error。API 用时 41.862 秒，包含 Node 预取后端到端约 44.4 秒，在 60 秒计划间隔内。Unicode 校验缺陷在本地测试 D1 产生的 7 条关闭及 7 条重开误报已全部清理，生产 D1 从未迁移或写入。

## 钱包与发布门槛

本分支没有修改钱包、报价、授权、交易历史或广播代码；钱包和全部交易 Feature Flag 保持原值。当前无需真实钱包即可完成单元测试、类型检查、构建、页面隔离和钱包 mock 回归。依据 `AGENTS.md` 第 16 条，真正发布前仍必须由所有者在浏览器中完成钱包断开、EVM 连接和 Solana 连接烟测；仅连接和只读校验，不索要或接收助记词、私钥、签名，不发起报价、授权或交易。该人工烟测是发布硬门槛，不是本地开发阻塞。

调度器使用单调的 60 秒计划点；接口超时时跳过已错过的计划点并记录 `schedule_lag`，不会补发一串并发请求。官方 HTTP 每次最多三次、指数退避重试，失败写入健康表，下轮从官方历史列表与交易对快照重新核对。GitHub Actions 每 30 分钟触发一次，单次采集最长 25 分钟，并用 workflow concurrency 串行化同一分支的运行，避免原先 55 分钟作业跨批重叠。交易对响应少于上一完整快照 70% 时按部分响应失败处理并保留原快照；单个交易对须连续两个完整快照都缺失才确认关闭，避免临时部分数据误报批量下架。

上述修复解决重叠和补跑风暴，但 GitHub 托管调度仍可能迟到，且两次 25 分钟会话之间存在计划空窗，因此不能把它表述为严格的全天分钟级服务。发布前若要求连续分钟级目标，仍需把同一采集脚本放到单实例常驻采集机，并保留 Site 端事件键、游标和告警队列去重作为第二道保护。

Upbit 单次连接内仅在断线、错误或 30 秒收不到 pong 时指数退避重连；工作流已取消跨批连接重叠。由于 Upbit 官方明确只有实时流且无 replay，调度空窗或连接中断仍可能漏掉公告；断线后只能用公开交易对快照补发现“实际开通/停止”，无法补回公告正文和修订历史。发布前需用官方 key 在常驻单实例采集机连续观测，不能把它宣称为绝对不漏。

Coinbase X 采集只使用 app-only read bearer，不请求发帖、私信或账号写权限。首次解析 `@CoinbaseMarkets` 后把 user id 保存在独立采集器游标，后续每分钟只读最多 25 条 timeline，避免每轮重复计费的用户查询。按 X 公开 pay-per-use 单价（Post read USD 0.005、User read USD 0.010）及同一 UTC 日重复资源通常不重复收费估算，静态 25 条窗口约 USD 3.75/月，另加当天新增帖子；建议先设置 USD 5–10/月 spending limit，以控制台实际账单为准。X 未要求本方案配置 IP 白名单。

Upbit Announcement WebSocket 文档明确该功能“不属于任何权限组”，因此 key 不应勾选资产、订单、提现等权限。Upbit key 创建要求固定公网 IPv4，可白名单至多 10 个地址；GitHub hosted runner 出口不固定，生产应使用固定出口 IPv4 的专用采集机或 self-hosted runner，仅在该机器的 secret/env 中配置 `UPBIT_ACCESS_KEY` 与 `UPBIT_SECRET_KEY`，不放到 Sites。单连接只在建立时订阅并维持心跳，远低于官方每 IP 每秒 5 次连接、每连接每秒 5/每分钟 100 条消息限制。

### New Listings Feed 免费档评估

- 官方产品文档声称免费 `/v2/full` 同时覆盖 Coinbase 与 Upbit，并提供原始来源 URL、分类、ticker、`detected_time_us` 和 `sent_time_us`。免费档固定延迟为 3 秒，不含链上增强和历史接口。
- WebSocket 没有 replay，供应商也明确不保证完整覆盖。断线后只能依靠本项目持续运行的 Coinbase/Upbit 官方交易对快照补发现“已实际开通/关闭”，无法补回所有提前公告正文或第三方发现时刻。
- 产品页称免费档可用于 monitoring，自动转发时要求注明 New Listings Feed；未找到一份更完整、可下载的再分发许可文本。因此当前只完成适配器与官方文档格式契约测试，`NEW_LISTINGS_FEED_ENABLED` 默认 `false`，尚未用真实免费 key 实测，不把它写成已接通。
- 一旦实测，事件 `source_kind` 固定为 `third_party_discovery`，页面显示“第三方发现 · New Listings Feed”，绝不称为官方直采。事件身份使用 `exchange + 原始来源 URL + 事件/市场类型`，不使用供应商明确声明跨边缘不稳定的 `id`。

### 公告中文化与翻译费用

- `title` 永久保存官方原文；`title_zh`、翻译状态、供应商、原文哈希、错误、翻译时间和计费字符数单独保存。公告修订导致原文哈希变化时，旧译文会被清除并重新生成，不能继续展示旧版本翻译。
- 标准上币、下架、交易对、永续合约及 Binance Alpha 标题优先使用确定性短语规则，交易所名、代币简称、交易对、合约地址、日期和数字不改写。没有可靠规则时显示原文和“暂未翻译”。搜索同时匹配 `title` 与 `title_zh`。
- 已实现但默认关闭 Google Cloud Translation Basic v2 适配器。官方价格为每月前 500,000 字符免费额度（以每月 USD 10 credit 形式），之后 USD 20/百万字符；本项目硬上限固定不超过 450,000 字符/月，并只对新标题或原文修订调用一次。启用时页面必须显示“由 Google 自动翻译”，遵守 Google 归因要求。
- 适配器会验证交易所名、全大写币种/交易对、地址和数字仍原样存在；验证失败不保存译文。`EXCHANGE_GOOGLE_TRANSLATION_ENABLED` 默认 `false`，密钥只允许放 `GOOGLE_TRANSLATE_API_KEY` 环境变量，未经项目所有者决定不会启用计费服务。
- 官方依据：<https://cloud.google.com/products/translate/pricing>、<https://docs.cloud.google.com/translate/docs/reference/rest/v2/translate>、<https://docs.cloud.google.com/translate/attribution>、<https://cloud.google.com/terms/service-terms/index-20230524>。
- 参考：<https://newlistings.pro/docs/v2/full>、<https://newlistings.pro/docs/faq>、<https://newlistings.pro/exchanges/coinbase>、<https://newlistings.pro/exchanges/upbit>、<https://newlistings.pro/websocket>。

## 大额资金流向

### 免费公开链上有限覆盖（2026-09-25 本地验收）

- 新增 `scripts/collect-public-stablecoin-flows.mjs` 和独立提供商身份 `public_rpc`。该链路不读取 Whale Alert、Bitquery 或其他付费标签；付费适配器及其许可闸门保持默认关闭。
- 当前范围严格限定为 Ethereum mainnet 的 USDT、USDC、UNI，以及三组官方披露地址：Binance PoR API 32 个直接 ETH 地址、Bybit PoR 审计文件 7 个 Ethereum 地址、OKX 2026-09-08 PoR CSV 中按披露 ETH 余额排序的前 20 个 Ethereum 地址。Ceffu 等第三方托管地址不归为 Binance；OKX 的 20 个地址只是官方文件 8,817 个 ETH 地址中的明确子集。
- USDT/USDC 采用 `1 token = USD 1` 的**名义估值**；UNI 必须读取交易发生区块的 Chainlink UNI/USD 喂价并校验更新时间。价格不可核验、过期或异常时只累计“估值不足”，不入库、不生成达标事件，也不推断机构买卖。
- 初次运行只回补最近 7,200 个已确认区块，随后按 D1 游标续跑。默认每 100 区块、每 8 个已知地址一组查询日志，每批最多 5 项区块时间查询。每个分片必须完整取得三种代币、转入/转出日志、增发日志和区块时间并成功写入后才推进游标；HTTP/RPC/部分响应失败写 `degraded/reconnecting`，不推进游标。地址集合指纹变化时自动回退 7,200 区块补采；事件键为链、交易哈希、日志索引和币种，重试不会重复入库。资金流事件不进入任何企微队列。
- 本地真实闭环当前累计 63 条 ≥USD 10m USDT/USDC 事件（35 USDT、28 USDC）及 1 条 USDC 真正合约铸造事件；铸造样本 `0x531e8900af6d11459e9e03f77573091facd59d18999bc9a9abe112b8dfa59cb0` 为 199,231,181.85 USDC。复投已验证为去重，不重复入库。UNI 逻辑和历史价格读取已通过真实 RPC，但尚未捕获达到门槛的真实 UNI 样本，因此状态仍为待验证。
- 页面只称“已知地址样本转入/转出/净额”。未披露充值地址、其他链、未配置可靠价格源的资产、合约路由和链下内部账务均不覆盖；不能称为交易所全部净流入，空列表也不能解释为零流量。

#### 免费 RPC、条款与运行成本

| 候选 | 免费额度 / 条件 | 条款与可靠性结论 | 当前使用 |
| --- | --- | --- | --- |
| Tenderly 公共主网网关 | `https://gateway.tenderly.co/public/mainnet` 无需账户或密钥；匿名端点没有公开固定配额 | 2026-09-25 实测区块高度、历史 `eth_getLogs`、5 项批量区块时间及历史 Chainlink `eth_call` 均成功；官方材料明确将 Node 用作 dApp 的生产 JSON-RPC。匿名端点无 SLA，失败必须可见且不推进游标 | **当前默认来源**；费用 0 美元，按 100 区块分片保守使用 |
| BlockPI 公共 Ethereum endpoint | 无需账户或密钥，技术上可完成历史补采 | 服务条款禁止 bots/automated means，并将材料限制为个人、内部、非商业且不得分发；不适合本站自动采集与公开展示 | 已换下 |
| dRPC 公共 Ethereum endpoint | 无需账户；文档称公共节点永久免费，batch 最多 3 项、最长 2 秒 | 近链头查询成功，但同日实测历史日志请求返回无法路由，不能满足断线补采 | 已换下 |
| PublicNode Ethereum | 无密钥且宣传为免费公共 RPC | 通用条款明确禁止 robots/data gathering/scraping，不能作为本站常驻采集默认源 | 已换下 |
| Ankr Public/Freemium | 官方服务计划称 Public 免费约 1,800 请求/分钟，Freemium 每月 200M credits | 当前官方 API 参考及实测端点要求免费账户 API key；不符合本轮“不要提供 key”的条件 | 未接入 |
| Cloudflare Ethereum Gateway | 官方文档提供公共 Ethereum Gateway，并支持 `eth_getLogs` | 2026-09-25 对公开端点实测 `eth_blockNumber` 返回 `-32046 Cannot fulfill request`，当前不可用 | 已换下 |

代码不需要免费 API key，RPC 费用为 USD 0。以 59 地址、8 地址一组、三种代币和两个方向估算，每个 100 区块分片约 50 次 RPC；正常链头每分钟通常只新增约 5 个区块，常态请求量远低于补采阶段。请求串行发送，不靠并发冲击端点。生产常驻由 GitHub-hosted runner 工作流承担，不依赖所有者电脑；脚本支持 `PUBLIC_FLOW_CONTINUOUS=true`、本机锁、失败退避和 D1 游标恢复，配置见 `docs/PUBLIC_FLOW_ALWAYS_ON.md`。生产 `PUBLIC_FLOW_ENABLED` 仍保持 `false`，原因是本分支尚未完成最终验收和发布。

官方依据：Binance Proof of Reserves <https://www.binance.com/en/proof-of-reserves>；Binance 官方披露接口 <https://www.binance.com/bapi/apex/v1/public/apex/market/por/address>；Bybit PoR 说明 <https://www.bybit.com/en/help-center/article/How-to-Verify-Bybit-Ownership-of-Wallet-Addresses-and-Their-Balances>；OKX PoR 下载页 <https://www.okx.com/en-us/proof-of-reserves/download>；Ethereum `eth_getLogs` <https://ethereum.org/developers/docs/apis/json-rpc/>；Tenderly Node <https://tenderly.co/blog/getting-started-with-tenderly-web3-gateway/>；BlockPI 条款 <https://blockpi.io/terms-of-use/>；PublicNode 条款 <https://www.publicnode.com/terms>；dRPC 限制 <https://drpc.org/docs/howitworks/ratelimiting>；Ankr 计划 <https://www.ankr.com/docs/rpc-service/service-plans/>；Cloudflare Gateway <https://developers.cloudflare.com/web3/ethereum-gateway/>。

- 默认提供商适配为 Whale Alert Alerts WebSocket，最低美元门槛固定为 `10,000,000`。官方告警结构为 `amounts[]`、`transaction.hash` 和 `transaction.sub_transactions[]`；每个资产单独应用门槛，不能按顶层 `amount_usd/hash` 解析。
- GitHub Secret `WHALE_ALERT_API_KEY` 缺失时，采集器把状态写为 `blocked/not_configured` 后失败退出；页面显示“覆盖不足”，不会生成零值或样例数据。
- 同一 WebSocket 订阅使用稳定 ID `kol-flow-10m-v1`。五分钟内重连时由提供商补发遗漏事件，D1 再以链、交易哈希、子索引和币种去重。
- 交易所转入计为 inflow（潜在卖压），交易所转出计为 outflow。净额定义为 `outflow - inflow`；正数代表净流出交易所，负数代表净流入交易所。
- 交易所内部、同实体和跨链桥转账不计入净额。未标注地址、缺美元估值或覆盖不足必须原样显示未知。
- 转账流不推断机构买入/卖出。`institution_trade_side` 只有在后续接入可验证成交源时才能填写，机构净买卖与交易所净流入必须分别汇总。

## 提供商评估（2026-09-24）

| 服务 | 地址标签与价格 | 链与时效 | 配额/费用 | 本项目结论 |
| --- | --- | --- | --- | --- |
| Whale Alert Alerts API | 交易双方归属、美元价格；能排除内部/同实体 | WebSocket 实时，100+ 资产、14 条链；同订阅 ID 在 5 分钟内重连可补发 | Alerts USD 29.95/月、100 alerts/hour，明确 personal use only；Business Enterprise API USD 699/月 | **BLOCKED**。通用条款禁止公开、传播或写入第三方可访问系统，除非取得书面许可；即使 USD 699 Business 也必须先书面确认本 Site 的公开网页展示、缓存与衍生汇总权 |
| Nansen API | `tgm/transfers`、`tgm/flows` 可按再分发指南公开并须署名；原始 `/label` 与 Smart Money 多项禁止或受限 | 约 25 条链，REST | Free 100 credits + 每日 10；Pro USD 49/月含 2,000 credits；额外 credits USD 100/100,000 | 对少量指定币种可行，但要按分钟全局扫描会按链×币种线性耗费。示例 10 币×8 链×每分钟约 345.6 万次/月，即约 USD 3,456 credits + USD 49，仍不是完整覆盖；API Terms 对公共第三方应用另有许可要求 |
| Arkham Intel API | 实体标签、交易与资金流 | 实时 API，地址情报更新为游标续跑 | 按申请开放，官方未公布自助价格 | 候选；须申请 key、报价并取得公开 dashboard/告警使用条款。未获批前 BLOCKED |
| Bitquery | 实时 Transfers、`AmountInUSD`；Metadata.Labels 覆盖 12 条链 | GraphQL WebSocket；自助实时 10 条核心链的 Transfers 窗口仅 EVM/Tron 4 小时、Solana 8 小时；原生 Bitcoin 实时需另行确认 | Pro USD 99/月含 100k stream-min + 5GB + 1M points；Labels USD 99/月；额外 200k stream-min / 5GB / 1M points 各 USD 50/月 | **BLOCKED**。10 条链连续订阅为 446,400 stream-min/月，Pro 基础并不够；月付基线约 USD 298（Pro 99 + Labels 99 + 两个 stream-min 包 100），且 GB、长中断补采、原生 Bitcoin 和授权都可能追加费用 |

### Bitquery 默认关闭适配器

`scripts/collect-bitquery.mjs` 已实现 10 条自助核心链的独立 Transfers 订阅：Ethereum、BNB Chain、Base、Arbitrum、Optimism、Polygon、Robinhood、Arc、Tron、Solana。服务端 GraphQL 先按 `AmountInUSD >= 10,000,000` 过滤；事件再查询 `Metadata.Labels`，并保留地址、标签类型、标签值和记录时间。API 以 `chain + tx hash/signature + transfer id + symbol` 去重，机构买卖字段始终为 `null`。断线指数退避，重连时从上次 `Block.Time` 减 5 秒在 realtime 窗口补采；返回达到 5,000 行上限时显式报错，不能宣称补采完整。

采集器、GitHub job 和 Site API 有三重默认关闭：`BITQUERY_ENABLED != true` 不连接；`BITQUERY_PUBLIC_DISTRIBUTION_APPROVED != true` 时 job 不运行；即使错误启动，Site API 仍拒绝 Bitquery 事件写入。两个新栏目均无企微入口或队列消费。当前未配置 key、未获得许可、未读取真实 Bitquery 数据，资金流付费扩展维持 BLOCKED。

#### 自助方案用量模型（31 天月，购买前必须用试用期实测替换估算）

每条链需要 1 个连续 GraphQL subscription，即每链 44,640 stream-minutes。GB 估算假设每条已过滤事件含协议开销平均 2.5KB；标签查询量采用保守上界“每个合格事件一次 Metadata.Labels 批量请求（同一次查两端地址）”，实际 24 小时缓存会更低。事件率不是实测值，只是容量情景，不得作为覆盖证明。

| 链 | 订阅数 | stream-min/月 | 假设 ≥$10m 事件/日 | 预计流量 GB/月 | 标签查询/月上界 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ethereum | 1 | 44,640 | 500 | 0.039 | 15,500 |
| Tron | 1 | 44,640 | 500 | 0.039 | 15,500 |
| Solana | 1 | 44,640 | 250 | 0.019 | 7,750 |
| BNB Chain | 1 | 44,640 | 100 | 0.008 | 3,100 |
| Base | 1 | 44,640 | 50 | 0.004 | 1,550 |
| Arbitrum | 1 | 44,640 | 50 | 0.004 | 1,550 |
| Optimism | 1 | 44,640 | 25 | 0.002 | 775 |
| Polygon | 1 | 44,640 | 50 | 0.004 | 1,550 |
| Robinhood | 1 | 44,640 | 10 | 0.001 | 310 |
| Arc | 1 | 44,640 | 10 | 0.001 | 310 |
| **合计** | **10** | **446,400** | **1,545** | **约 0.120** | **47,895** |

公开价格按每次实时 API 调用约 5 points 估算，47,895 次标签调用约 239,475 points，低于 Pro 的 1M points；即使事件/流量为上表 10 倍，约 1.2GB 仍低于 5GB。真正的主要确定性超额是 stream-minutes：446,400 - 100,000 = 346,400，需向上购买两个 200k 包，月付 USD 100。由此月付容量基线为 **USD 298/月**；年付折合为 Pro 79 + Labels 79.20 + 两个 40 美元 stream 包 = **USD 238.20/月，预付 USD 2,858.40/年**。超过 5GB 后每额外 5GB 为 USD 50/月；超过 1M points 后每 1M points 为 USD 50/月。

这仍不包含：原生 Bitcoin 实时流、书面第三方应用授权、Enterprise Kafka/SLA、超过实时窗口的可靠历史补采。若为全部 10 链购买自助 Transfers 历史包，公开月付价粗算为 8 条常规 EVM/Tron各 USD 150 + Arc USD 100 + Solana USD 500 = **USD 1,800/月额外费用**；这不是建议购买方案，只证明长中断全链补采不能算在 USD 298 内。供应商授权询问草稿见 `docs/BITQUERY_AUTHORIZATION_DRAFT.md`。

任何付费方案都必须由所有者显式决定；密钥只放 Sites/GitHub 环境变量或 Secret。
上线公开资金流页面前，须确认供应商许可覆盖公开网页展示、有限缓存、历史保留和衍生汇总；不要把购买个人计划的密钥当作公开使用授权。官方 WebSocket 的 `amounts[]` 允许一笔交易包含多种资产，必须逐资产去重并验收真实格式。

外部项以本次交付报告中的最小阻塞表为准。不要一次配置多家资金流供应商，也不要先购买 Whale Alert Personal。任何供应商 key 均只配置在实际运行其采集器的固定采集机/CI secret，不进入源码、日志、浏览器或聊天记录。

## 官方证据链接

- Coinbase：<https://www.coinbase.com/en-br/blog/Coinbase-Markets-on-X-Your-New-Home-for-All-Listings>
- X API 计费：<https://docs.x.com/x-api/getting-started/pricing>
- Upbit Announcement WebSocket：<https://docs.upbit.com/kr/reference/websocket-announcement>
- Upbit API key 与固定 IP：<https://docs.upbit.com/kr/docs/api-key>
- Whale Alert 条款：<https://whale-alert.io/terms-and-conditions.html>
- Nansen 再分发指南：<https://docs.nansen.ai/guides/redistribution-guide>
- Bitquery Data Streams / Address Labels / 条款：<https://www.bitquery.io/products/data-streams>、<https://www.bitquery.io/products/address-labels-api>、<https://www.bitquery.io/terms-of-service>
