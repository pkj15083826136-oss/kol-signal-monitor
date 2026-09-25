# PublicNode 授权询问草稿（仅供项目所有者审核，未发送）

提交入口：<https://www.publicnode.com/contact>

主题：Permission request for automated Ethereum RPC collection and public derived dashboard

```text
Hello PublicNode team,

We are evaluating the keyless Ethereum JSON-RPC endpoint for KOL Signal Monitor, a publicly accessible, read-only market-intelligence website. Before enabling production collection, we request written clarification and approval for this specific use.

Proposed use
1. One collector instance calls eth_blockNumber, eth_getLogs and eth_getBlockByNumber once per minute, with retries and backoff. It reads confirmed Ethereum mainnet USDT/USDC Transfer logs involving a limited set of Binance addresses published by Binance Proof of Reserves.
2. The collector filters for individual nominal stablecoin transfers of at least USD 10,000,000. It does not send transactions, expose an RPC proxy or bypass rate limits, access controls or IP blocks.
3. A public webpage displays only normalized blockchain facts: chain, token, amount, nominal USD estimate, transaction hash, sender/receiver addresses, direction relative to the disclosed addresses, block time, discovery time and source links.
4. We retain normalized qualifying events and a block cursor for deduplication, outage recovery and audit. We keep only the minimum RPC response fields needed to produce those records; there is no raw bulk RPC download or public bulk export.
5. The webpage clearly states that coverage is limited to the disclosed address sample and is not an exchange-wide net-flow measure. No WeCom, email, push or other notification delivery is included.
6. We can attribute the RPC transport to “PublicNode” with a link if required.

Expected load
- One Ethereum collector and one public IP.
- Normal polling interval: 60 seconds.
- eth_blockNumber: about 1,440 calls/day.
- eth_getLogs: four calls per scanned block range (USDT/USDC, inbound/outbound), normally about 5,760 calls/day at one range per minute; more during bounded outage catch-up.
- eth_getBlockByNumber: only for blocks containing qualifying transfers, batched where supported.
- Initial catch-up: at most 7,200 confirmed blocks, split into ranges of no more than 500 blocks.

Please confirm in writing:
A. Whether automated RPC polling at the above volume is permitted under your Terms of Service.
B. Whether public display of the normalized blockchain facts and derived 1-hour/24-hour aggregates is permitted.
C. Whether limited caching and retention of normalized events, block timestamps and the recovery cursor is permitted, and whether you require a retention limit.
D. Any rate, concurrency, batch, archive-range, commercial/public-site, attribution or IP-identification requirements we must follow.
E. Whether the keyless endpoint may be used for this production workload or a different/free account endpoint is required.

We will keep production collection disabled unless the permitted scope is clear. We will not treat silence as approval.

Thank you.
```

## 当前判断

PublicNode 的 Ethereum 页面明确提供免费、免密钥 RPC endpoint，但通用条款同时限制未经书面批准的复制、公开展示、发布、数据挖掘和自动抓取。条款没有明确区分“调用为开发者提供的 JSON-RPC”与“自动提取后公开展示链上衍生记录”。因此，本地验证可保留，公开生产采集继续视为授权不明确，等待书面澄清或更换为条款明确的 RPC。
