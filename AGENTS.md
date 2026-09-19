# Codex development rules

1. Read `README.md` and `docs/CODEX_HANDOFF.md` before changing behavior.
2. Preserve the existing Sites project in `.openai/hosting.json`; never create a replacement Site.
3. Treat `lib/signal-policy.ts` as the single source of truth for signal admission rules.
4. Never commit API keys, webhook URLs, wallet private keys, deployment credentials, or copied production responses containing secrets.
5. The owner has opened a separate reviewed wallet-and-manual-trading scope documented in `docs/TRADING_UPGRADE.md`. Never add automatic trading, server-side signing, custody, or private-key/seed-phrase input or storage. Keep mainnet broadcast behind a feature flag until explicitly approved after testing.
6. Preserve the four chains and the 6/18/38/58 alert stages unless the owner changes them explicitly.
7. Token identity must prefer contract-matched GMGN/Dex metadata over Ave aliases. Market metrics may prefer Ave.
8. Token introduction must use official metadata only. Keep X/AI narrative in the AI analysis field; never substitute it as the official introduction.
9. All explicit timestamps shown to users must use `Asia/Shanghai`; relative times are timezone-independent.
10. Mobile layouts must tolerate unbroken contract addresses and must not introduce horizontal scrolling.
11. Before publishing, build successfully and verify at least the list API, one detail page, signal-policy boundary cases, and worker error logs.
12. Keep the existing public audience unless the owner asks to change it.
13. Before changing wallet, quote, approval, swap, or transaction-history behavior, read `docs/TRADING_UPGRADE.md` and preserve its phased rollout and safety requirements.
