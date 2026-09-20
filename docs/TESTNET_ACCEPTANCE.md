# 测试网交易准入记录

更新时间：2026-09-20。本文区分自动化mock验收与真实钱包/测试链验收；二者不能互相替代。

## 当前结论

真实测试网广播尚未获准开启。生产缺少`REOWN_PROJECT_ID`与Reown域名allowlist确认，且尚未批准测试Router/program、测试mint和专用测试钱包。所有测试网与主网交易开关保持false，没有使用真实资金。

## 支持矩阵

| 链 | 测试网络 | 官方网络参数 | 聚合器事实 | 当前验收 |
| --- | --- | --- | --- | --- |
| Solana | Devnet | Reown Solana Adapter已接入代码 | 未取得可核验的Jupiter Devnet聚合路由；不得假定主网API可用于Devnet | mock状态机通过；真实连接/签名/receipt待外部配置 |
| BSC | BSC Testnet | chainId 97，BNB Chain官方测试RPC可用 | 0x官方明确不支持测试网 | mock状态机通过；需获批测试Router与测试代币 |
| Base | Base Sepolia | chainId 84532 | 0x官方明确不支持测试网 | mock状态机通过；需获批测试Router与测试代币 |
| Robinhood | Robinhood Chain Testnet | chainId 46630，官方测试RPC可用 | 0x支持Robinhood主网4663，但官方测试网不在0x支持表内 | mock状态机通过；需获批测试Router与测试代币 |

官方依据：

- 0x测试网政策：<https://help.0x.org/articles/6722655458-does-0x-support-testnets>
- 0x支持链：<https://docs.0x.org/docs/introduction/supported-chains>
- BSC Testnet：<https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/>
- Base Sepolia chainId：<https://docs.base.org/base-chain/api-reference/ethereum-json-rpc-api/eth_chainId>
- Robinhood测试网：<https://docs.robinhood.com/chain/connecting/>

## 已通过的确定性自动化

- 只读钱包：连接、余额、切链、断开、拒绝连接、切链失败。
- 交易守卫：测试网/主网fail-closed、总开关与逐链开关双门禁、余额不足、报价过期。
- 授权：只计算精确sell amount；已有足额allowance时不再授权；禁止无限授权。
- 签名与确认：授权和swap为两个钱包确认；用户拒签、授权revert、交易revert、RPC失败、Solana确认失败均进入失败状态。
- 记录：服务端拒绝私钥、助记词、签名和signed transaction；`user_trades`以`chain + tx_hash`唯一索引并upsert状态，刷新读取使用同一记录。

## 真实验收前置条件

1. 在Reown配置生产/本地域名并设置Sites secret `REOWN_PROJECT_ID`。
2. 使用仅持有水龙头资产的专用测试钱包；项目不接收其私钥或助记词。
3. 为每条链书面批准测试Router/program、spender、测试token与RPC；记录合约源码/验证状态。
4. 先只开启`FEATURE_WALLET_CONNECT=true`并完成四链只读验收。
5. 再单独开启`FEATURE_TRADE_TESTNET=true`，逐笔检查钱包弹窗并验证receipt与D1幂等记录。
6. `FEATURE_TRADE_MAINNET`和所有逐链主网开关在独立安全评审前持续保持false。
