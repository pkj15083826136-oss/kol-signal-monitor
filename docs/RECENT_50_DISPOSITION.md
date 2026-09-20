# 最近50条市场数据审查与处理

生成时间：2026-09-20T00:35:10.504Z。输入为 `docs/RECENT_50_MARKET_AUDIT.json` 的生产采样；Ave列是当次成功取得且身份匹配的token-level结果。GMGN在审计窗口受到IP rate limit，因此不得将空值写成“已多源确认”。

统计：共50条；超过30%误差9条；超过3倍7条；超过10倍4条。确认需要历史抑制的合约为GLDx、SPCXx、WBTC、CARDS以及此前已处理的HYPE。DOGE、ABS、智脑、PEPE虽然历史展示值偏差明显，但修正后仍不满足“成熟高市值且超过10天”的排除结论，因此保留并只修正展示值。上游当时不可用的记录进入data_review结论，不凭缺失数据反推误报。

| ID | 链 | 符号 | 完整合约 | 当时网站市值 | Ave市值 | 比率 | GMGN市值 | 差异原因 | 最终处理 |
|---:|---|---|---|---:|---:|---:|---|---|---|
| 65 | sol | DOGE | `DoGEV7LASBkQbibMc5k5vKnTZoMg423GpJ5QtJEGfm7R` | $273 | $938,806 | 3438.85x | GMGN审计期受限流，未宣称多源确认 | 历史快照字段与Ave token-level市值偏差 | 保留，修正历史展示值 |
| 64 | sol | GLDx | `Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re` | $10,953,099 | $46,806,911 | 4.27x | GMGN审计期受限流，未宣称多源确认 | token-level市值证明为成熟高市值资产 | suppressed + invalid_market_data |
| 63 | sol | HYPE | `98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g` | $71,175,701 | $65,360,200 | 1.09x | GMGN审计期受限流，未宣称多源确认 | token-level市值证明为成熟高市值资产 | suppressed + invalid_market_data |
| 62 | bsc | Czar | `0x9e03db0bd6570ab21759729b41503e5ae4307777` | $47,991 | $44,674 | 1.07x | GMGN审计期受限流，未宣称多源确认 | 误差在30%内 | 保留 |
| 61 | sol | Noah | `GJhdayjFhGDxssqNfDX8DCpap1yNfjjrg8ASwBNdHBJS` | $2,678 | $2,625 | 1.02x | GMGN审计期受限流，未宣称多源确认 | 误差在30%内 | 保留 |
| 60 | sol | SPCXx | `Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8` | $1,537,839,095 | $84,919,991 | 18.11x | GMGN审计期受限流，未宣称多源确认 | token-level市值证明为成熟高市值资产 | suppressed + invalid_market_data |
| 59 | sol | WBTC | `3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh` | $1,458,146,751,324 | $202,512,469 | 7200.28x | GMGN审计期受限流，未宣称多源确认 | wrapped成熟资产且历史口径错误 | suppressed + invalid_market_data |
| 58 | sol | WOW | `72yxYmhLgDGwdyi2b9GjDynBB6VuG3kDxNKqDbzXh5bi` | $4,427,923 | $4,122,864 | 1.07x | GMGN审计期受限流，未宣称多源确认 | 误差在30%内 | 保留 |
| 57 | sol | AMI | `G6QxupyViE4exEDYSVcERE2EidxhYJ86kRGa4syL9Mu2` | $3,416 | $3,411 | 1.00x | GMGN审计期受限流，未宣称多源确认 | 误差在30%内 | 保留 |
| 56 | bsc | ABS | `0x459c0e0ef66da505b2459610aca1db41031ca898` | $36,593 | $7,434 | 4.92x | GMGN审计期受限流，未宣称多源确认 | 历史快照字段与Ave token-level市值偏差 | 保留，修正历史展示值 |
| 55 | sol | WBTC | `3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh` | $1,458,146,751,324 | $202,512,469 | 7200.28x | GMGN审计期受限流，未宣称多源确认 | wrapped成熟资产且历史口径错误 | suppressed + invalid_market_data |
| 54 | bsc | SI | `0x68ee6cdf9b1121357f50419368128f2d243b7777` | $5,029 | $5,044 | 1.00x | GMGN审计期受限流，未宣称多源确认 | 误差在30%内 | 保留 |
| 53 | sol | CARDS | `CARDSccUMFKoPRZxt5vt3ksUbxEFEcnZ3H2pd3dKxYjp` | $68,698,657 | $344,154,552 | 5.01x | GMGN审计期受限流，未宣称多源确认 | token-level市值证明为成熟高市值资产 | suppressed + invalid_market_data |
| 52 | bsc | 智脑 | `0xd49362ce2750f3c9e34863d23217e6050e005076` | $23,471 | $9,762 | 2.40x | GMGN审计期受限流，未宣称多源确认 | 历史快照字段与Ave token-level市值偏差 | 保留，修正历史展示值 |
| 51 | sol | BB | `BBosJLw8ZzoATiEyywiifx7AgmrD2Cm3XjFWbhbRhChy` | $621,709 | $634,284 | 1.02x | GMGN审计期受限流，未宣称多源确认 | 误差在30%内 | 保留 |
| 50 | bsc | SI | `0x5018fec719e0ee7d2460dbd0c3a9d105ab147777` | $71,456 | $73,904 | 1.03x | GMGN审计期受限流，未宣称多源确认 | 误差在30%内 | 保留 |
| 49 | sol | PEPE | `PEPEqnuuCDbBC89p1u9vpnP1KQ2oj1xTcQBsjt9X55m` | $622,155 | $1,171,964 | 1.88x | GMGN审计期受限流，未宣称多源确认 | 历史快照字段与Ave token-level市值偏差 | 保留，修正历史展示值 |
| 48 | robinhood | 9e9 | `0x385307be7df9b45f55f8be72e0cf8b36466813ee` | $446,744 | $459,010 | 1.03x | GMGN审计期受限流，未宣称多源确认 | 误差在30%内 | 保留 |
| 47 | bsc | UrAnus | `0x7db2f0c15f74ab0dc0d4f49650dd60c45ffb7777` | $136,211 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 46 | sol | SPCX | `SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb` | $6,634,630 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 45 | sol | MCDx | `XsqE9cRRpzxcGKDXj1BJ7Xmg4GRhZoyY1KpmGSxAWT2` | $2,017,754 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 44 | sol | BCC | `4ijnHeHgNnXmg45rhUV6aETFSbTwvjJG2Zmd1MePMevW` | $71,518 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 43 | bsc | 我们好像在哪见过 | `0xbda5f5ff5bda595b8b19381335fb8a1f18637777` | $11,183 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 42 | bsc | 天才 | `0xd6adb6633352a7b4b21ca0261b0431fadde32a70` | $43,875 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 41 | sol | MSFTx | `XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX` | $497,213 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 40 | sol | WETH | `7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs` | $229,845,152 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 39 | sol | PEPE | `PEPEqnuuCDbBC89p1u9vpnP1KQ2oj1xTcQBsjt9X55m` | $622,155 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 38 | sol | COST | `CZEB3WNZuF2Yz1z2H81RcCk8T7fsw82KB33zqamASVsg` | $169,901 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 37 | sol | CHURRO | `EgHxCq3aytsF38DGqdZuw8wPZM7wfaebtDvMXCvj5G8g` | $4,514 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 36 | sol | CYPH | `CYPHuMmCL1GxJWa2tsPhLKykC7GrHJTCHwbXD4g5uawK` | $469,215 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 35 | sol | OPENAI | `PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF` | $1,931,333 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 34 | sol | STONK | `6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx` | $255,834,480 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 33 | bsc | BNBS | `0xefd9440be6f0e612daaa2be235fbe9654c3c31c0` | $828,238 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 32 | sol | SPYx | `XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W` | $65,262,267 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 31 | sol | SNAP | `SNAPcESrvnH8yUdgeMF6xm1hym9b6hW6s8YeqeHdZFz` | $173,572 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 30 | sol | Bonk | `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` | $270,852,887 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 29 | sol | HYPE | `98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g` | $71,175,701 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 28 | sol | TIGRINO | `91ryaCo5yGpYZM3bs6GUPs97VWJQj7RozBmqPULgpump` | $2,097,830 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 27 | bsc | BNCB | `0x4902c5ebc598265ed2212b559b042de8a5eeec3f` | $23,586,745 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 26 | bsc | GENIX | `0x250a2718a1a625d1bf4d4794621fd34f1ae2738e` | $61,181 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 25 | bsc | CZ | `0x9e6547082525e5c86902d26cffd81785f9047777` | $8,231 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 24 | bsc | NAILOOOONG | `0x30e00bcee679a13340c42e1f0dcc392246037777` | $7,643 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 23 | bsc | PAID | `0xc31ae677e52d8c4d3def6b00affc9c3c19577777` | $109,903 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 22 | bsc | SHIELD | `0xa8c63cf6e2a80c24661603bed32fb3919353a74b` | $3,458 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 21 | bsc | bBALL | `0x649496f233a731be61d223d6a12507f3f0da7777` | $5,627 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 20 | bsc | bBALL | `0xed7e361f70ce5670f92eed4ce0dc520660677777` | $123,463 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 19 | bsc | FLNC | `0x90219e6c26a593ad74612ff663fbda1ae3d07777` | $3,375 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 18 | sol | USEFUL | `32dBiQZShRmCacE8U5tnBtHPYbZgqgEZWeMwXH5Hbonk` | $8,578 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 17 | sol | KNOB | `7P48QkgheGNX4X5yZM8JCi4bzEyxQf8xE6juCdDau9rw` | $19,890 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |
| 16 | bsc | SHAMMY | `0x008cf7440c69999740efd540ad986a915368666d` | $8,655 | 不可用 | -- | GMGN审计期受限流，未宣称多源确认 | 审计时上游未返回可核验token-level市值 | data_review（保留历史，不公开判错） |

## 数据处理

- 不删除任何signals记录；公开列表继续排除 `alert_status='suppressed'`。
- 迁移只对已确认的历史错误做状态/市值修正，不发送企业微信更正消息。
- 无Ave结果的条目只记录为待复核，不把0当成真实市值。
- HYPE仅保护精确地址 `98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g`；错误字符地址不再存在于生产保护集合。

