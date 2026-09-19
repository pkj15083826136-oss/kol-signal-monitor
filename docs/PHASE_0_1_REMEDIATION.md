# Phase 0.1 修复与发布前验收报告

日期：2026-09-19（Asia/Shanghai）  
分支：`codex/phase-0-1-remediation`  
范围：仅修复 Phase 0 五项门禁；未增加钱包、报价、授权或交易代码，未发布生产。

## 1. 变更清单

### D1 写入边界

- 根因字段：`liveMarket.name`、`symbol`、`logo`、`description`。三路行情均缺值时，`getMarketData()` 曾实际返回 `undefined`。
- 根因 SQL：monitor 的 `UPDATE signals SET name = CASE WHEN ? ... gmgn_theme = CASE WHEN ? ...`，上述值直接进入 `.bind()` 后触发 `D1_TYPE_ERROR`。
- `getMarketData()` 现在保证全部 `MarketData` 字段为确定的字符串或有限数字。
- 新增 `lib/d1-values.ts`，所有监控写入在 D1 边界按字段规范化，并以 SQL 名和字段名校验绑定值。
- 可复现测试先用原始缺失字段触发同文案的 `D1_TYPE_ERROR`，再验证修复后的同一 SQL 绑定值不含 `undefined`。
- Solana 地址保留 base58 大小写；EVM 地址统一小写。钱包计数基于链别规范化后的唯一地址。

### 调度鉴权

- `/api/monitor/run` 只接受 `MONITOR_SECRET`，不再读取或接受 `GMGN_API_KEY`。
- `scripts/collect-gmgn.mjs` 的站点写请求只发送 `MONITOR_SECRET`；GMGN key 仅用于 GMGN 上游请求。
- `GET /api/monitor/run` 改为 405，不再允许 GET 产生写副作用。

### 企业微信可靠投递

- `signals` 增加投递状态、尝试次数、错误、最后/下次尝试时间、成功时间和固定消息载荷。
- 新信号与消息载荷先入库为 `pending`；发送前条件更新为 `sending` 并原子增加尝试次数；只有企业微信明确返回成功才记为 `sent`。
- 企业微信明确拒绝进入 `retry` 并指数退避；网络超时、无效响应等“可能已送达但无法确认”的结果进入 `manual_review`，不自动重发，避免重复预警。
- `sent` 状态永不再次选取；并发 Worker 通过条件 claim 防止同时发送同一条预警。
- 没有发送真实群消息；测试全部使用 mock sender。

### 规则与质量

- 阈值仍为 6/18/38/58，选取逻辑保持原有“当前最高已达阶段”，唯一信号和状态共同保证幂等。
- BONK 修正为真实 Solana mint：`DezXAZ8z7PnrnRJjz3wXBoRgixCa6hBA2iKeiYCp`；移除错误地址，且不再对 Solana 地址统一小写。
- 增加 `pnpm test` 和 13 项自动化测试，覆盖要求中的全部场景。
- 内部导航和远程头像改用 Next 组件，lint 错误与警告清零。

## 2. 数据库迁移影响

迁移：`drizzle/0001_previous_nextwave.sql`。仅向既有 `signals` 表追加 7 列，不新建数据库、Site、D1 binding 或业务表：

| 列 | 默认值/用途 |
| --- | --- |
| `alert_status` | 历史行默认 `sent`，避免部署后补发旧信号 |
| `alert_attempts` | 默认 0，累计发送尝试 |
| `alert_error` | 最近错误，最多由应用写入 1000 字符 |
| `alert_last_attempt_at` | 最近尝试时间 |
| `alert_next_attempt_at` | 明确失败后的退避时间 |
| `alert_sent_at` | 成功确认时间 |
| `alert_payload_json` | 创建信号时冻结的消息载荷 |

迁移为追加列操作；现有查询继续兼容。部署顺序必须是先执行迁移、再发布应用，否则新代码会因缺列失败。

## 3. 测试与依赖

- `pnpm lint`：通过，0 error / 0 warning。
- `pnpm exec tsc --noEmit`：通过。
- `pnpm test`：6 个文件、13 项测试全部通过。
- `pnpm build`：通过。
- `pnpm audit --prod`：0 个已知漏洞。
- 安全补丁覆盖：`browserslist 4.28.8`、`baseline-browser-mapping 2.11.1`、`@babel/core 7.29.7`；均满足仓库 7 天最短发布时间策略。未做业务依赖大版本升级。
- 安装器仍提示 `eslint 9.39.4` 已停止支持，以及两个仅用于工具链的 deprecated 子依赖；当前无对应安全告警。为避免在修复门禁时引入 ESLint 10/工具链大版本兼容风险，本阶段暂缓，后续单独升级并重跑全套验证。

## 4. 发布与回滚方案

本分支未发布。获得项目所有者确认后：

1. 备份/导出生产 D1，并记录当前生产版本 21 和 commit `3d725585752f0173357016d836014ea898e39a1d`。
2. 对既有 `DB` 执行 `0001_previous_nextwave.sql`，不得创建新数据库或 binding。
3. 发布当前提交，保持所有交易 Feature Flag 关闭；不调用 self-test，不发送真实企业微信测试消息。
4. 用只含 mock feed 的鉴权请求验证 401/200，再观察 Solana、BSC、Base、Robinhood 至少两个完整调度窗口：无 `D1_TYPE_ERROR`，且通知状态可追踪。
5. 如需真实企业微信链路测试，另行取得确认后只发送一条明确标记“系统链路测试”的消息。

调度暂停通过 `MONITOR_PAUSED=true` 实现，接口在鉴权后返回 503；迁移和发布完成后恢复为 `false`。该开关不包含密钥，也不改变调度器或信号规则。

回滚时先把应用回退到版本 21；新增列对旧代码无害，可保留以避免破坏性 D1 操作。若项目所有者要求物理回退 schema，应先导出 D1，再在维护窗口通过建临时表、复制原字段、校验行数、换表的方式移除新增列，不在故障窗口直接执行不可逆删列。

## 5. 尚需生产确认的唯一项目

代码、测试、构建和迁移门禁已关闭；“四链最近连续窗口无失败”只能在经确认发布后观测，当前因禁止发布而保持待验。未进入 Phase 1。
