# KOL Signal Monitor

面向 Solana、BSC、Base、Robinhood 四条链的 KOL/聪明钱包聚集预警系统。系统持续读取 GMGN 交易流，按独立钱包首次建仓人数聚合代币，在 6、18、38、58 人阶段触发预警，并把代币行情、X 热门帖子和简短中文 AI 分析发送到企业微信群，同时在网页保留信号和趋势图。

生产网站：<https://kol-signal-monitor.pkj15083826136.chatgpt.site>

## 当前功能

- 固定监控钱包池加 GMGN 动态 KOL 数据源
- 四链轮询：`sol`、`bsc`、`base`、`robinhood`
- 独立钱包去重，重复加仓只计一人
- 预警阈值：6 / 18 / 38 / 58 人
- 6 人首次执行 X 搜索与 AI 分析；38 人重新搜索并更新叙事
- 企业微信机器人预警
- GMGN、Ave.ai、DexScreener、GeckoTerminal 行情回退
- 代币头像、市值、流动性、持币地址、24H成交额
- 5分钟/15分钟 K 线
- KOL 持仓人数、代币数量和估算价值趋势
- 列表首屏20条、游标无限滚动；仅可见记录每15秒刷新，新信号置顶并短暂高亮
- 四链运行状态、数据源健康度与通知待处理聚合状态
- 全部显式时间使用北京时间

## 核心信号规则

1. 统计被监控钱包中当前余额大于零的钱包数。
2. 达到 6、18、38、58 人之一且该阶段未预警时，生成一次信号。
3. 首次信号过滤：
   - WETH、WBTC、USDT、USDC 等成熟基础资产直接排除；
   - 市值不高于 2000 万美元时可以进入；
   - 市值高于 2000 万美元且创建超过 10 天时排除；
   - 市值高于 2000 万美元但无法验证创建时间时，按保守策略排除。
4. 已经有信号的代币仍继续采样持仓快照，但不会重复相同阈值。
5. 每轮最多生成一个需要 AI 搜索的新信号，避免阻塞采集。

规则的唯一实现位置是 `lib/signal-policy.ts`。修改阈值时不要在页面或 API 中复制数字。

## 数据源职责

| 数据源 | 用途 |
| --- | --- |
| GMGN OpenAPI | KOL、聪明钱包交易流和代币资料 |
| Ave.ai Data API | 持币数、TVL、市值、价格、头像、5/15分钟K线 |
| DexScreener | 合约身份校验、主池、价格、流动性、创建时间回退 |
| GeckoTerminal | K线回退 |
| xAI | 最近48小时X搜索、三条热门原创帖子、中文AI分析 |
| 企业微信机器人 | 阶段预警推送 |

代币名称和简称优先以 GMGN/主流动池为准。Ave 曾把 BONK 合约错误标为 TOGETHER，因此不可把 Ave 作为身份字段最高优先级。

## 主要目录

```text
app/
  api/monitor/run/route.ts   采集、聚合、过滤、预警主流程
  api/signals/route.ts       列表实时数据与旧数据补全
  dashboard.tsx              列表、筛选、自动刷新
  signal/[id]/               详情页、K线、趋势图、复制按钮
lib/
  gmgn.ts                    GMGN API 封装
  market.ts                  多行情源合并与K线
  signal-policy.ts           新币信号准入规则
  token-identity.ts          已确认的数据源错名修正
  wallets.ts                 监控钱包加载与去重
  wecom.ts                   企业微信消息
  xai.ts                     X搜索和AI结构化输出
data/wallets.json            监控钱包数据
db/schema.ts                 D1表结构
drizzle/                     生产数据库迁移
docs/                        运行说明与Codex交接资料
scripts/collect-gmgn.mjs     GitHub Actions侧采集器
```

## 运行环境

- Node.js `>=22.13.0`
- 包管理器：pnpm（以 `pnpm-lock.yaml` 为准）
- 框架：Vinext / React / TypeScript
- 托管：ChatGPT Sites / Cloudflare Worker
- 数据库：D1，绑定名固定为 `DB`

生产环境变量只配置在 Sites，不写入仓库：

| 变量 | 作用 |
| --- | --- |
| `GMGN_API_KEY` | GMGN 只读接口 |
| `AVE_API_KEY` | Ave.ai Data API |
| `XAI_API_KEY` | X搜索和AI分析 |
| `WECOM_WEBHOOK_URL` | 企业微信群机器人 |
| `MONITOR_SECRET` | 监控接口鉴权 |
| `MONITOR_PAUSED` | 受控迁移/维护期间暂停监控写入，默认 `false` |
| `PUBLIC_SITE_URL` | 详情页公开地址 |
| `REOWN_PROJECT_ID` | Reown AppKit 前端项目 ID；需要域名限制 |
| `FEATURE_WALLET_CONNECT` | 只读钱包连接开关，默认 `false` |
| `KOL_ALERT_MAX_MARKET_CAP` | KOL首次与升级预警的市值上限，默认 `20000000` |

## 本地开发与验证

```bash
pnpm install
pnpm dev
pnpm build
```

Sites 环境应优先使用 Sites 技能提供的配置、构建、打包和发布脚本，不要自行创建第二个 Site。

发布前至少确认：

- 构建成功；
- `/api/signals` 返回时间倒序数据；
- 详情页 5/15 分钟K线可以切换；
- 手机端无横向滚动；
- 企业微信只在新阈值触发一次；
- 没有把密钥写进源码、日志或提交历史。

## 数据表

- `trades`：去重后的钱包交易
- `token_wallets`：钱包对代币的累计持仓
- `signals`：阶段预警
- `hot_posts`：6人/38人阶段保存的X热门帖子
- `snapshots`：人数、数量和估算价值趋势
- `monitor_runs`：每轮采集结果与错误

## 已知约束

- 第三方 API 可能缺失或返回错误元数据，必须保留多源回退和身份校验。
- Ave API 按 CU 计费；常规持仓快照不应每次调用 Ave。
- GitHub Actions 调度不是秒级实时系统；后续若要求更低延迟，应迁移到常驻 Worker/队列或独立服务器 WebSocket/RPC 采集器。
- 当前站点只做监控和通知，不包含自动买入、私钥保存或交易签名。

详细接管说明见 `docs/CODEX_HANDOFF.md`，开发约束见 `AGENTS.md`。

交易所动态与大额资金流向的独立架构、方向定义、数据源和密钥阻塞见 `docs/MARKET_INTELLIGENCE.md`。

钱包连接、动态行情、K 线升级与用户逐笔确认的手动交易范围见 `docs/TRADING_UPGRADE.md`。生产版本尚未开启交易广播，实施时必须按 Phase 0—5 分阶段并使用默认关闭的 Feature Flag。

阶段记录见 `docs/PHASE_0_1_REMEDIATION.md`、`docs/PHASE_0_2_OBSERVABILITY.md`、`docs/PHASE_1_WALLET_READONLY.md`、`docs/PHASE_2_LIVE_MARKET.md`、`docs/PHASE_3_READONLY_QUOTES.md` 和 `docs/PHASE_4_TRANSACTION_FLOW.md`；待项目所有者配置的外部项集中记录在 `docs/EXTERNAL_SETUP.md`。
