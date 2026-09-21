import { parseRadarAiReview, radarAiFallback, radarAiPrompt } from "@/lib/radar/ai";
import type { RadarAiReview, RadarCandidate } from "@/lib/radar/types";

function extractResponseText(payload: Record<string, unknown>) {
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    if (!item || typeof item !== "object") continue;
    for (const part of Array.isArray((item as Record<string, unknown>).content) ? (item as Record<string, unknown>).content as unknown[] : []) {
      if (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string") return String((part as Record<string, unknown>).text);
    }
  }
  return "";
}

export function radarReviewSummary(candidate: RadarCandidate) {
  return { chain: candidate.chain, token_address: candidate.tokenAddress, pair_address: candidate.pairAddress, name: candidate.name, symbol: candidate.symbol, pool_created_at: candidate.poolCreatedAt, market_cap: candidate.marketCap, liquidity: candidate.liquidity, volume_24h: candidate.volume24h, holders: candidate.holders, buyers: candidate.buyers, sellers: candidate.sellers, smart_money_count: candidate.smartMoneyCount, source_conflict: candidate.sourceConflict, data_fetched_at: candidate.dataFetchedAt };
}

export async function reviewRadarCandidate(candidate: RadarCandidate, apiKey: string | undefined, fetcher: typeof fetch = fetch): Promise<RadarAiReview> {
  if (!apiKey) return radarAiFallback();
  try {
    const response = await fetcher("https://api.x.ai/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "grok-4.20-0309-non-reasoning", input: radarAiPrompt(radarReviewSummary(candidate)), max_output_tokens: 900, temperature: 0.1 }) });
    if (!response.ok) return radarAiFallback();
    return parseRadarAiReview(extractResponseText(await response.json() as Record<string, unknown>));
  } catch { return radarAiFallback(); }
}
