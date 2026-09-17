# KOL Signal Monitor

The hosted application stores token signals and charts in D1. A scheduler calls
`POST /api/monitor/run` with `Authorization: Bearer <MONITOR_SECRET>`.

## GitHub Actions secrets

- `SITE_URL`: the deployed site origin
- `MONITOR_SECRET`: the same secret configured in the hosted runtime

The workflow starts every five minutes and polls nine times at 30-second
intervals. Its concurrency group prevents overlapping monitor jobs.

## Alert stages

- 6 wallets: first alert and X analysis
- 18 wallets: alert, reuse the first analysis
- 38 wallets: alert and refresh the X analysis
- 58 wallets: final alert, reuse the 38-wallet analysis

Only three relevant popular X posts are stored for the 6- and 38-wallet stages.
