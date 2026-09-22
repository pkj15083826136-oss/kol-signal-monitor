import { RADAR_PROMPT_VERSION } from "@/lib/radar/ai";
import { normalizeRadarCandidate, persistRadarCandidate } from "@/lib/radar/intake";
import { reviewRadarCandidate } from "@/lib/radar/reviewer";

function parseObject(value: unknown) { try { const parsed = JSON.parse(String(value || "{}")); return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {}; } catch { return {}; } }

export async function repairLegacyPairLabels(db: D1Database) {
  return db.prepare(`UPDATE radar_signals SET dex_id=COALESCE(dex_id,LOWER(pair_address)),source_pair_label=COALESCE(source_pair_label,pair_address),pair_address=NULL,identity_status='PARTIAL_VERIFIED',updated_at=updated_at WHERE pair_address IS NOT NULL AND ((chain='sol' AND (LENGTH(pair_address)<32 OR LENGTH(pair_address)>44)) OR (chain<>'sol' AND (LENGTH(pair_address)<>42 OR LOWER(SUBSTR(pair_address,1,2))<>'0x')))`)
    .run();
}

export async function backfillRadarNarratives(db: D1Database, apiKey: string | undefined, limit = 50) {
  await repairLegacyPairLabels(db);
  const boundedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const rows = await db.prepare(`SELECT r.*,COALESCE((SELECT source FROM radar_signal_sources s WHERE s.radar_signal_id=r.id ORDER BY observed_at ASC LIMIT 1),'radar_backfill') source_name,COALESCE((SELECT source_event_id FROM radar_signal_sources s WHERE s.radar_signal_id=r.id ORDER BY observed_at ASC LIMIT 1),'backfill:'||r.id) source_event_id FROM radar_signals r WHERE NOT EXISTS (SELECT 1 FROM radar_narrative_analysis n WHERE n.radar_signal_id=r.id AND n.prompt_version=? AND n.status='COMPLETED') ORDER BY r.first_seen_at DESC LIMIT ?`).bind(RADAR_PROMPT_VERSION, boundedLimit).all<Record<string, unknown>>();
  const summary = { requested: boundedLimit, selected: rows.results.length, completed: 0, failed: 0, insufficientEvidence: 0, notConfigured: 0, skipped: 0, results: [] as Array<{ id: number; symbol: string; status: string; score: number | null; error: string | null }> };
  for (const row of rows.results) {
    const raw = parseObject(row.raw_input_json);
    const candidate = normalizeRadarCandidate({
      source: row.source_name, sourceEventId: row.source_event_id, chain: row.chain, tokenAddress: row.token_address, pairAddress: row.pair_address, dexId: row.dex_id, routerId: row.router_id, launchpadId: row.launchpad_id, factoryAddress: row.factory_address, sourcePairLabel: row.source_pair_label,
      name: row.name, symbol: row.symbol, firstSeenAt: row.first_seen_at, poolCreatedAt: row.pool_created_at, price: row.price, marketCap: row.market_cap, liquidity: row.liquidity, volume24h: row.volume_24h, holders: row.holders, buyers: row.buyers, sellers: row.sellers, smartMoneyCount: row.smart_money_count, dataFetchedAt: row.updated_at, identityVerified: row.identity_status === "VERIFIED", sellSimulationPassed: null, honeypot: null, mintable: null, freezable: null, blacklistable: null, taxModifiable: null, buyTaxBps: null, sellTaxBps: null, lpLocked: null, topHolderPct: raw.top10_ratio, developerRisk: "unknown", priceImpactBps: null, sourceConflict: false, rawSnapshot: raw,
    });
    if (!candidate) { summary.skipped += 1; continue; }
    const review = await reviewRadarCandidate(candidate, apiKey);
    await persistRadarCandidate(db, candidate, review);
    if (review.status === "COMPLETED") summary.completed += 1;
    else if (review.status === "INSUFFICIENT_EVIDENCE") summary.insufficientEvidence += 1;
    else if (review.status === "NOT_CONFIGURED") summary.notConfigured += 1;
    else summary.failed += 1;
    summary.results.push({ id: Number(row.id), symbol: String(row.symbol), status: review.status, score: review.narrative_score, error: review.error_code });
  }
  return summary;
}
