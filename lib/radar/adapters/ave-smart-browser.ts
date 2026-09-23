import type { RadarCandidate, RadarChain } from "@/lib/radar/types";
import { normalizeDexLabel, normalizeVerifiedRadarAddress } from "@/lib/radar/identity";

export type AveCollectorState = "connected" | "disconnected" | "login_expired" | "error";
export class AveSmartEventBuffer {
  private seen = new Set<string>();
  state: AveCollectorState = "disconnected";
  cursor: string | null = null;
  connect() { this.state = "connected"; }
  disconnect() { this.state = "disconnected"; }
  loginExpired() { this.state = "login_expired"; }
  ingest(rows: unknown[], observedAt = new Date().toISOString()) {
    const candidates: RadarCandidate[] = [];
    for (const value of rows) {
      const row = value && typeof value === "object" ? value as Record<string, unknown> : {}; const id = String(row.id || ""); const token = String(row.token || ""); const chain = normalizeAveChain(row.chain);
      if (!id || !token || !chain || this.seen.has(id)) continue; this.seen.add(id); this.cursor = id;
      const signalTime = iso(row.signal_time ?? row.first_signal_time, observedAt);
      const pairAddress = normalizeVerifiedRadarAddress(chain, row.pair_address ?? row.pair ?? row.lp_address);
      const dexId = normalizeDexLabel(row.amm ?? row.dex ?? row.dex_id);
      const sourceDescription = String(row.headline || row.description || row.token_tag || row.tag || "").trim() || null;
      candidates.push({ source: "ave_smart_browser", sourceEventId: id, chain, tokenAddress: token, pairAddress, dexId, sourcePairLabel: dexId, routerId: null, factoryAddress: normalizeVerifiedRadarAddress(chain, row.factory_address), name: String(row.token_name || row.symbol || "Unknown"), symbol: String(row.symbol || "—"), firstSeenAt: signalTime, poolCreatedAt: isoOrNull(row.token_create_time), price: numericString(row.current_price_usd), marketCap: numeric(row.mc_cur ?? row.mc), liquidity: null, volume24h: numeric(row.tx_volume_u_24h), holders: numeric(row.holders_cur ?? row.holders), buyers: null, sellers: null, smartMoneyCount: Math.max(0, Math.round(numeric(row.action_count) || 0)), dataFetchedAt: observedAt, identityVerified: false, sellSimulationPassed: null, honeypot: null, mintable: null, freezable: null, blacklistable: null, taxModifiable: null, buyTaxBps: null, sellTaxBps: null, lpLocked: null, topHolderPct: numeric(row.top10_ratio), developerRisk: "unknown", priceImpactBps: null, sourceConflict: false, sourceProjectDescription: sourceDescription, sourceDescriptionRaw: sourceDescription, sourceDescriptionAt: signalTime, sourceDescriptionSource: "ave_smart_browser", knownProjectAccount: typeof row.twitter === "string" ? row.twitter : null, rawSnapshot: { id, token, chain: row.chain, signal_time: row.signal_time, first_signal_time: row.first_signal_time, signal_type: row.signal_type, headline: row.headline, tag: row.tag, token_tag: row.token_tag, issue_platform: row.issue_platform, amm: row.amm, pair_address: row.pair_address, factory_address: row.factory_address, first_signal_mc: row.first_signal_mc, mc_cur: row.mc_cur, holders_cur: row.holders_cur, top10_ratio: row.top10_ratio, current_price_usd: row.current_price_usd } });
    }
    return candidates;
  }
}
function numeric(value: unknown) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function numericString(value: unknown) { const n = numeric(value); return n === null ? null : String(n); }
function iso(value: unknown, fallback: string) { return isoOrNull(value) ?? fallback; }
function isoOrNull(value: unknown) { if (value == null || value === "") return null; const n = Number(value); const date = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(String(value)); return Number.isFinite(date.getTime()) ? date.toISOString() : null; }
function normalizeAveChain(value: unknown): RadarChain | null { const text = String(value || "").toLowerCase(); if (text.includes("sol")) return "sol"; if (text.includes("bsc") || text.includes("bnb")) return "bsc"; if (text.includes("base")) return "base"; if (text.includes("robinhood")) return "robinhood"; return null; }
