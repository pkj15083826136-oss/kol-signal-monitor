# Bitquery 授权询问草稿（仅供项目所有者审核，未发送）

收件人：`hello@bitquery.io`

抄送：`legal@bitquery.io`
主题：Written consent request for public derived fund-flow dashboard

```text
Hello Bitquery team,

We are evaluating a paid Bitquery API plan plus the multi-chain Address Label Data add-on for KOL Signal Monitor, a publicly accessible, read-only market-intelligence website. Before purchasing or enabling the integration, we request your prior written consent under Sections 2 and 3 of the Bitquery Terms of Service for the following third-party application and data use.

Proposed use
1. Consume real-time Transfers subscriptions on the self-service core chains, filtered server-side to individual transfers with AmountInUSD >= USD 10,000,000.
2. Query Metadata.Labels for the sender and receiver addresses, including exchange, bridge, hot/cold/deposit/withdrawal and other entity labels.
3. Publish a public webpage that shows only qualifying event-level fields: chain, asset, amount, estimated USD value and price timestamp, transaction hash, sender and receiver addresses, entity labels, label source/confidence, on-chain timestamp and discovery timestamp.
4. Cache normalized events, address-label results and source timestamps in our private database for deduplication, outage recovery, audit and correction history.
5. Retain normalized event records and revision/audit history for up to 24 months. Raw API responses would be retained only in restricted operational logs for up to 7 days, unless a longer period is required to investigate a data-quality incident.
6. Publish derived 1-hour and 24-hour aggregates by asset, exchange/entity and chain: inflow, outflow and net flow. We define net flow as exchange outflow minus exchange inflow. Bridge, same-entity and exchange-internal transfers are excluded from net flow.
7. Attribute displayed labels and event data to “Bitquery” and link to Bitquery where reasonably practical. We will not expose our API token, provide a query proxy, redistribute the full label dataset, provide bulk downloads, or offer a substitute for the Bitquery service.
8. We will not send these events through WeCom, email, push notifications or another notification channel under the proposed scope.

Interpretation safeguards
- A transfer to an exchange is displayed only as “transfer to exchange / potential sell pressure”; a withdrawal is displayed only as “transfer from exchange”.
- We do not infer institutional buys or sells from transfers. Any future institutional buy/sell metric would require verifiable trade execution data and a separate review.
- Unknown ownership, missing USD valuation and incomplete coverage remain explicitly marked as unverified or insufficient.

Please confirm in writing:
A. Whether the above public webpage, caching, 24-month normalized retention and derived aggregation are permitted on a self-service paid plan plus Address Label Data.
B. Whether event-level transaction hashes, addresses, USD values and individual Bitquery label values may be displayed as described, or whether any field must be suppressed, delayed, aggregated or limited.
C. The required attribution wording and link placement.
D. Whether the proposed use requires Pro, Scale or an Enterprise/custom license.
E. Whether GraphQL subscription delivery includes replay or guaranteed delivery. If not, please confirm the supported recovery path after outages longer than the 4-hour EVM/Tron or 8-hour Solana real-time window.
F. Whether native Bitcoin real-time transfers and address labels can be included under self-service plans, and the exact product, interface, latency and price required.
G. Whether any additional usage, storage, geography, user-count, public-audience or notification-channel restrictions apply.

Please treat silence or a general product-page statement as no consent; we will not enable public display until we receive direct written approval that covers these uses.

Thank you.
```

## 审核要点

- 本草稿只评估公开网页展示、缓存、24 个月历史保留和衍生聚合；明确排除企微及其他推送渠道。
- 不请求转售、原始数据下载、完整标签库再分发或查询代理权。
- 要求供应商明确自助套餐是否足够，避免先购买后发现必须使用 Enterprise。
- 条款要求书面同意，且未回复不代表同意；因此在得到明确回复前，`BITQUERY_PUBLIC_DISTRIBUTION_APPROVED` 必须保持 `false`。
