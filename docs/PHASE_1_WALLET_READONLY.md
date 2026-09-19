# Phase 1：只读钱包连接

## 完成范围

- Reown AppKit 统一连接入口，接入 Wagmi 2 + Viem 与 Reown Solana Adapter。
- 支持 Solana、BSC（56）、Base（8453）、Robinhood Chain（4663）网络定义。
- AppKit 提供二维码、浏览器扩展、余额、切链和断开；应用层状态机覆盖拒绝连接与切链失败。
- 内置 Swap、On-ramp、邮箱及社交登录明确关闭，未实现报价、授权、签名或广播。
- `FEATURE_WALLET_CONNECT` 默认关闭；缺少 `REOWN_PROJECT_ID` 时显示不可操作的配置提示入口。

## 依赖审计

引入钱包 SDK 后，生产依赖审计最初报告 16 项（3 high、13 moderate）。已用兼容补丁覆盖 `ws` 8.21.0 与 `axios` 1.18.0，降至 4 项（1 high、3 moderate）。剩余项均位于 Reown Solana/WalletConnect 间接依赖链：

- `bigint-buffer` 1.1.5：公告声称 1.1.6 修复，但注册表尚无该版本；当前仅用于 Solana 序列化间接路径。
- `uuid`：修复需要跨主版本强制覆盖 `jayson` 的依赖，存在运行时兼容风险，暂缓至上游升级。
- `decode-uri-component` 0.4.2：公告修复版本 0.4.3 尚未发布。
- `stream-json`：公告修复版本 3.4.1 尚未发布。

钱包功能默认关闭，且本阶段不处理不可信服务端流或交易广播，降低了当前可达风险；上游发布兼容修复后应立即升级并重新审计。

## 回滚

回滚本阶段提交并重新构建、发布即可；无数据库迁移。Feature Flag 保持关闭可即时停用钱包入口而不影响监控、D1 或企业微信。
