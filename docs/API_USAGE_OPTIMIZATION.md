# API usage optimization acceptance

Updated: 2026-09-23 (Asia/Shanghai)

## Narrative sample prerequisite

- `NARRATIVE_SAMPLE_PIPELINE`: **VERIFIED** against natural scheduled run #45 (`schedule`, not `workflow_dispatch`).
- Run #45 started at `2026-09-23T05:49:56Z` and completed successfully at `2026-09-23T06:48:54Z` on source `c6ad418f0360fcf23e2fba8e5f602359e81a9a30`.
- Production `narrative_samples` changed from zero to more than one page of real rows.
- Immediate Ave intake was observed: new samples were created at intake time before run #45.
- Historical backfill was observed during run #45. For `radar_signal_id=2`, the frozen snapshot and `first_signal_at` match the earliest `radar_signal_sources` row (`observed_at=2026-09-22T08:20:05.000Z`) rather than the later source row at `08:33:35Z`. The `ON CONFLICT DO NOTHING` path therefore retains the first frozen input while later outcome updates only change learning outcome fields.

## Optimization controls

- Public list/detail polling reads D1-backed aggregate snapshots only. It no longer invokes provider enrichment.
- Routine market collection no longer calls OKX Premium `/api/v6/dex/market/price-info`.
- GMGN `/v1/token/info` uses a six-hour positive cache, 30-minute negative cache, 24-hour last-known-good window, cross-Worker lease and `chain + token` key normalization.
- OKX Kline responses use persistent cross-Worker caches in addition to in-process request coalescing.
- A true outbound HTTP attempt creates exactly one `external_api_usage` row. Batch token count is metadata on that row and is not copied into per-token request counters.
- Outcome tracking frequency is tiered: AI-selected candidates keep all six horizons; ordinary rejects use 1h/24h/7d; invalid assets use 24h/7d.
- Circuit budgets: OKX Premium 90/day and 2,500/month; OKX Basic 3,000/day and 90,000/month; GMGN Basic 2,500/day and 75,000/month.
- Cache records retain hit, negative-hit and coalescing counters without logging credentials, signatures, cookies or personal data.

## Acceptance state

- `API_USAGE_OPTIMIZATION`: **LOCAL VERIFIED / PRODUCTION NOT VERIFIED** until the additive D1 migrations and source version are deployed and production smoke checks pass.
- `24H_USAGE_ACCEPTANCE`: **NOT VERIFIED** until 24 continuous hours have elapsed after production deployment. Required evidence: real HTTP counts by endpoint/tier/task, cache hit ratio, 429 ratio, Premium daily total, and GMGN token/info reduction against the pre-deployment baseline.
- Holder, Top Trader and Advanced Info remain out of scope until 24-hour acceptance completes.
- Wallet, quote, testnet and every mainnet trading feature flag must remain false.
