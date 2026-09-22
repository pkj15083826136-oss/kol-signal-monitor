# 土狗雷达 Phase 1.1 / Phase 2 基础验收

日期：2026-09-22。生产基线：Sites Version 60 / `cdca8aed5109bcef0328367fdc505ea7dcfd4ec1`。

## 已实现

- `KOL_ALERT_MAX_MARKET_CAP` 默认 20,000,000 美元。达到或超过上限的候选在叙事分析、热门信号和企业微信入队前被后端拦截；空市值进入复核，不按低市值处理。
- 首页 API 改为 20 条游标分页；搜索和链筛选由服务端重建游标。实时行情只请求浏览器当前可见的卡片，非可见历史记录沿用 D1 快照。
- 原 KOL 聚集不再作为雷达备用来源，也不再显示为 GMGN 天眼。
- GMGN 天眼真实浏览器审计结果：`GMGN_TIAN_YAN_BLOCKED`。当前自动化会话访问目标页时被 Cloudflare 403 阻断，没有发现可合法稳定复用的结构化天眼请求。
- Ave Smart 真实浏览器审计结果：页面路由本身返回 404，但前端可正常加载，并通过结构化 `fetch`、`WebSocket` 获取信号。已提供仓库外持久浏览器会话采集器；会话不导出 Cookie，不写入 D1/日志/Git，候选通过 `MONITOR_SECRET` 保护的接口发送。
- 雷达新增叙事学习菜单、冻结样本/收益分组/证据时间边界/Prompt版本状态机基础；市场价格倍数明确标记 `UNVERIFIED_MARKET_MULTIPLE`。
- 可信发射器策略首个白名单为 Pump 官方 Solana 程序。仅在链、官方程序、Token/曲线关系、流动性、买卖路径、价格冲击和新鲜度均通过时适用；传统税率、LP锁定和普通EVM Owner权限显示为不适用，确定性恶意证据仍硬拒绝。
- 雷达返回按钮使用明确的同源 `/` 导航；钱包开关关闭时显示“钱包未启用”，不加载 Reown 运行时。
- 数据源健康状态只统计启用项并可展开查看；雷达源单独展示连接/阻断状态。
- 结果调度覆盖 5m、30m、1h、4h、24h、7d，保存市场表现和数据新鲜度；在可执行报价缺失时只写 `NOT_QUOTED`，不生成虚假 Paper 成交。

## 外部采集器

Windows 一键入口：`scripts/start-ave-smart-collector.ps1`。运行前仅在本机进程环境中设置 `AVE_COLLECTOR_SITE_URL`、`MONITOR_SECRET` 和仓库外的 `AVE_COLLECTOR_PROFILE_DIR`。首次打开后由项目所有者在正常浏览器中自行完成登录；脚本不接收账号密码，不绕过验证码、登录、反机器人或付费权限。

## 待处理通知审计

生产中唯一的“待处理 1”是 signals id 51、阈值 6、状态 `manual_review`。原因是一次发送 claim 过期后结果未知；自动重试已被抑制以避免重复企业微信预警。它不是雷达 threshold=0 记录，不应直接清空或自动重发。雷达同步记录使用 `radar_visible`，不进入企业微信 outbox。

## 数据库迁移

`0013_conscious_kat_farrell.sql` 只增加设置、API用量、叙事样本、Prompt版本、人工案例表，并为 `trade_outcomes` 追加市场结果字段；没有删除、重命名或回填生产数据。

## 回滚

代码可回滚到 Version 60 或已确认的 Version 58。迁移为前向兼容：旧代码会忽略新增表和新增列，不需要逆向删除数据库对象。
