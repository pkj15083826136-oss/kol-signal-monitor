# 外部配置清单

所有配置必须通过 Sites 环境变量提供，不写入源码、测试、日志或提交。客户端钱包连接所需的 projectId 和 RPC URL 本质上会发送到浏览器，应使用仅限允许域名、有限额的前端凭据。

## 配置入口（项目所有者）

| 项目 | 官方入口 | 需要保存到 Sites 的变量/资料 |
| --- | --- | --- |
| Reown AppKit | <https://dashboard.reown.com> | `REOWN_PROJECT_ID`；生产域名与本地验收域名 allowlist |
| Jupiter | <https://portal.jup.ag>、<https://dev.jup.ag> | `JUPITER_API_KEY`（若所选接口/套餐要求）；允许的 program/route 清单 |
| 0x | <https://dashboard.0x.org>、<https://docs.0x.org/docs/introduction/quickstart/getting-started> | `ZEROX_API_KEY`；逐链 `to`、spender 与 token allowlist |
| Solana RPC | <https://solana.com/docs/references/clusters> | `SOLANA_RPC_URL`；mainnet-beta，生产使用专用/受限 RPC，不使用公开端点承载交易 |
| BSC RPC | <https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/> | `BSC_RPC_URL`；mainnet chain id `56` |
| Base RPC | <https://docs.base.org/base-chain/api-reference/ethereum-json-rpc-api/eth_chainId> | `BASE_RPC_URL`；mainnet chain id `8453` |
| Robinhood Chain RPC | <https://docs.robinhood.com/chain/connecting/> | `ROBINHOOD_RPC_URL`；mainnet `4663`、testnet `46630`；生产优先专用 provider |

上述入口只用于准备配置。当前 `FEATURE_WALLET_CONNECT`、`FEATURE_TRADE_QUOTE`、`FEATURE_TRADE_TESTNET`、`FEATURE_TRADE_MAINNET` 及全部逐链主网开关继续保持 `false`。

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

- 监控 Secret 同步：在本地密码管理器生成同一个高强度随机值；先到原 Sites 项目 **Settings → Environment variables** 替换 secret `MONITOR_SECRET`，再到 GitHub 仓库 `pkj15083826136-oss/kol-signal-monitor` 的 **Settings → Secrets and variables → Actions → Repository secrets** 更新同名 `MONITOR_SECRET`。不要在聊天、终端、截图或文档中粘贴该值。两端完成后从 **Actions → KOL Signal Monitor → Run workflow** 手动触发一次，再检查四链各三轮。
- 企业微信群只发送一条明确标记“系统链路测试”的消息，执行前单独确认。
- 测试网和主网均由用户逐笔检查钱包弹窗并签名；主网广播开关在验收前保持关闭。
- GitHub Actions 仓库 secret `MONITOR_SECRET` 已与现有 Sites secret 同步；Actions Run #27为40/40成功，四链连续三轮生产门禁已完成。不得改回 `GMGN_API_KEY`。

## 钱包与测试网下一步（2026-09-20）

- Reown：在 Dashboard 为现有生产域名 `https://kol-signal-monitor.pkj15083826136.chatgpt.site`、`http://localhost:3000` 和本地实际验收源配置 allowlist，并把projectId作为 Sites secret `REOWN_PROJECT_ID` 保存。不要在聊天、源码或日志中粘贴私钥、助记词或钱包签名。
- 只读钱包通过真实验收后才可把`FEATURE_WALLET_CONNECT`单独改为true；报价、测试网、主网及逐链主网开关仍保持false。
- 0x官方当前明确不支持测试网；BSC Testnet（97）、Base Sepolia（84532）和Robinhood Testnet（46630）需要项目所有者/安全审核人批准的测试Router与测试代币，不能把0x主网报价当作测试网验收。
- Solana Devnet需要经审核的测试交换program、测试mint和专用测试钱包；没有可核验的Jupiter Devnet聚合路由时只运行确定性mock状态机，不广播主网交易。
- 测试网仅使用专门钱包和水龙头资产，由用户逐笔确认；服务端不接收私钥、助记词、签名或完整signed transaction。
