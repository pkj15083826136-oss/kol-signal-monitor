# Precise Narrative Discovery and Evidence Links

## Production contract

- A first-seen radar candidate is keyed by `chain + normalized_token + radar_signal_id + prompt_version + source_description_fingerprint + analysis_stage`.
- The first source description is immutable. Later Ave events may refresh market and momentum snapshots, but cannot overwrite the frozen description or enqueue another narrative discovery.
- Discovery has two calls: a no-tool semantic planning call and one X Search-enabled call with `max_tool_calls=1`. JSON repair never has tools.
- A candidate that is already `RUNNING`, `COMPLETED`, `INSUFFICIENT_EVIDENCE`, or `FAILED` is not searched again automatically. A fetch above 20 posts is terminal and recorded as `EXCESSIVE_X_FETCH`.
- At most five evidence rows are retained. Saved evidence and provider-side fetched-post counts are measured separately.
- Paper eligibility remains the intersection of `AI APPROVE` and deterministic trade eligibility `PASS`. This release does not enable a wallet, quote, paper auto-buy, testnet, or mainnet feature flag.

## Evidence rules

Evidence relations are `TOKEN_DIRECT`, `PROJECT_OFFICIAL`, `CATALYST_PRIMARY`, `THEME_CONTEXT`, `COMMUNITY_PROPAGATION`, `COUNTER_EVIDENCE`, and `LOOKALIKE_OLD_MEME`.

Only HTTPS links on `x.com` or `twitter.com` with a `/status/<id>` path are clickable. Search-action descriptions are discarded. Missing legacy URLs are displayed as missing rather than fabricated.

## Database migration

Migration `0018_serious_archangel.sql` is additive. It adds immutable description fields to `radar_signals`, planning/evidence-usage fields to `radar_narrative_analysis`, and the request-level `xai_request_usage` table. It does not delete or rewrite historical rows.

Rollback the application by deploying the preceding Site version. The additive columns and table may safely remain unused; do not drop them during an incident rollback.

## 24-hour acceptance

Start the window at the production deployment timestamp. Report only rows produced by real production candidates in that window:

- distinct candidates and discovery searches;
- duplicate events blocked;
- posts fetched per search and evidence retained per candidate;
- evidence with a valid source URL;
- `TOKEN_DIRECT` and `THEME_CONTEXT` counts;
- mean, median, and P95 fetched-post count;
- `EXCESSIVE_X_FETCH` count and per-candidate cost;
- `APPROVE`, `HOLD`, and `REJECT` counts;
- deterministic trade-ready and combined paper-ready counts.

No candidate volume means the corresponding production behavior is `NOT VERIFIED`, even when automated tests pass. Provider-side fetch counts must come from xAI response usage fields; the number of displayed evidence links is not a substitute.
