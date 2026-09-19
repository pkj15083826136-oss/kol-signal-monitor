# Phase 0.2 可观测性验收

日期：2026-09-19（Asia/Shanghai）

## 完成范围

- `monitor_runs` 持久化链、抓取行数、匹配行数和 feed 错误 JSON；历史行通过默认值保持兼容。
- 新增 `source_health`，按链保存 GMGN KOL/Smart Money 的最近尝试、成功/失败、连续失败数和延迟。
- 首页和 `/api/signals` 展示脱敏的四链状态、数据源健康数量和企业微信待处理数量。
- 公开响应不包含 feed 错误、企业微信错误、堆栈、密钥或 webhook。
- `pending`、`retry`、`manual_review` 只以聚合数量展示，不暴露消息内容或内部错误。

## 数据库迁移

`drizzle/0002_naive_solo.sql`：新增 `source_health` 表，并向 `monitor_runs` 追加四个带默认值字段。迁移不修改信号、交易、钱包或通知历史记录。

## 验收

- 四条链始终有独立状态；未有新格式运行记录时显示 `unknown`。
- 最近成功超过 10 分钟显示 `stale`；最近失败显示 `degraded`。
- 数据源状态同样执行 10 分钟陈旧判断。
- 自动化测试验证失败、陈旧、未知和公开脱敏行为。
- 回滚优先回退应用；新增表和追加列可保留，旧版本不会访问它们。
