# Radar market enrichment and source status

## Scope

This release separates collector lifecycle, provider API health, and the GMGN Tianyan webpage automation status. It adds read-only candidate enrichment only. It never connects a wallet, requests a signature, creates an order, or broadcasts a transaction.

## Data model

- `radar_ingest_events` records created, merged, duplicate, parse-failed, unsupported, and invalid source events.
- `radar_enrichment_state` stores field-level status, provenance, checked time, block number, retry state, and last-known-good values.
- `radar_pool_candidates` stores discovered and independently verified pools. DEX labels are never accepted as pool addresses.
- `radar_readonly_quotes` stores the four read-only $10/$50/$100/$500 round-trip quote bands.
- `dex_registry` contains reviewed factory/router/quote-token entries. The initial registry only enables PancakeSwap BSC V2/V3 entries whose addresses have been checked against official deployments.

## Feature flag

`FEATURE_RADAR_READONLY_ENRICHMENT=true` enables the authenticated collector/backfill enrichment path. All wallet, Paper auto-buy, testnet, mainnet, and per-chain transaction flags remain false.

## Provider and RPC configuration

GMGN and OKX credentials remain server-only. The enrichment path uses GMGN token metadata and OKX Basic token search; it does not use OKX Premium `price-info`.

Deterministic BSC factory/pair/reserve/route checks require `BSC_RPC_URL`. Without it, the UI reports `RPC_ERROR` and schedules a retry; it does not claim the Pair or quote is verified. Other chains remain explicit `UNSUPPORTED_DEX` until a reviewed registry and chain-specific verifier are added.

## Avatar safety

Remote avatar URLs must be HTTPS and match an allowlisted provider host. The same-origin proxy rejects redirects, SVG/HTML, unknown MIME types, and bodies over 1 MiB. Missing or rejected images use a deterministic local, script-free identicon.

## Backfill

`POST /api/radar/enrich` requires `MONITOR_SECRET`, respects the feature flag, processes at most ten due records per request, and uses the shared provider cache, negative cache, concurrent request coalescing, budget guards, and exponential retry timestamps. It does not invoke Grok/X Search.

## Rollback

1. Set `FEATURE_RADAR_READONLY_ENRICHMENT=false`.
2. Redeploy the prior Sites version.
3. Keep migration 0019 in place; it is additive and old application versions ignore the new tables/columns.
4. Do not delete enrichment or ingest history. It is audit evidence and is safe to retain.
