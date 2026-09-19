# 外部配置清单

所有配置必须通过 Sites 环境变量提供，不写入源码、测试、日志或提交。客户端钱包连接所需的 projectId 和 RPC URL 本质上会发送到浏览器，应使用仅限允许域名、有限额的前端凭据。

## 钱包（Phase 1）

- `REOWN_PROJECT_ID`：Reown Cloud 项目 ID；允许域名至少包含生产域名和本地验收域名。
- `FEATURE_WALLET_CONNECT=true`：仅在 projectId 和允许域名完成后开启。默认关闭。
- 四链专用 RPC：Solana mainnet、BSC 56、Base 8453、Robinhood Chain 4663；建议配置各供应商域名限制、速率限制和独立的测试网端点。Robinhood 官方公共 RPC 仅作为只读回退。
- Sites 变量名：`SOLANA_RPC_URL`、`BSC_RPC_URL`、`BASE_RPC_URL`、`ROBINHOOD_RPC_URL`。测试网端点应使用独立变量/凭据，避免与主网混用。

## 行情与报价（Phase 2/3）

- 现有 GMGN/Ave 凭据保持不变。
- `ZEROX_API_KEY`：0x Swap API，限制服务端来源和配额。
- `JUPITER_API_KEY`：Jupiter API（如所选套餐要求）；无 key 时只运行 fixture/mock。
- 报价 allowlist：每链允许的聚合器 `to`、spender、路由合约和稳定币地址，由项目所有者/安全审核人签字确认。

## 广播（Phase 4）

- `FEATURE_TRADE_QUOTE`、`FEATURE_TRADE_TESTNET`：分别控制只读报价和测试网交易。
- `FEATURE_TRADE_MAINNET` 及逐链主网开关：全部默认关闭；首次开启必须由项目所有者确认。
- 逐链变量：`FEATURE_TRADE_MAINNET_SOL`、`FEATURE_TRADE_MAINNET_BSC`、`FEATURE_TRADE_MAINNET_BASE`、`FEATURE_TRADE_MAINNET_ROBINHOOD`；总开关和对应逐链开关必须同时为 `true`。
- 测试网钱包与水龙头资产：仅由用户钱包保管和签名，系统不接收私钥或助记词。
- 主网交易风险参数：最大滑点、最大价格影响、最高手续费/优先费、最小流动性与高税阈值。

## 最终人工验收

- 企业微信群只发送一条明确标记“系统链路测试”的消息，执行前单独确认。
- 测试网和主网均由用户逐笔检查钱包弹窗并签名；主网广播开关在验收前保持关闭。
- GitHub Actions 仓库 secret `MONITOR_SECRET` 必须与现有 Sites secret 同值。当前生产调度请求返回 401，因此四链连续三轮生产验证在该配置修复前无法完成；不得改回 `GMGN_API_KEY`。
