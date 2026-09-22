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
function wait(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function errorCode(error: unknown) {
  if (error instanceof DOMException && error.name === "TimeoutError") return "TIMEOUT";
  if (error instanceof Error && /timeout|aborted/i.test(error.message)) return "TIMEOUT";
  return "NETWORK_ERROR";
}

export function radarReviewSummary(candidate: RadarCandidate) {
  return {
    input_cutoff_at: candidate.firstSeenAt,
    source: candidate.source,
    source_event_id: candidate.sourceEventId,
    source_narrative: candidate.name,
    chain: candidate.chain,
    token_address: candidate.tokenAddress,
    pair_address: candidate.pairAddress,
    dex_id: candidate.dexId || null,
    source_pair_label: candidate.sourcePairLabel || null,
    symbol: candidate.symbol,
    pool_created_at: candidate.poolCreatedAt,
    market_cap: candidate.marketCap,
    liquidity: candidate.liquidity,
    volume_24h: candidate.volume24h,
    holders: candidate.holders,
    buyers: candidate.buyers,
    sellers: candidate.sellers,
    smart_money_count: candidate.smartMoneyCount,
    source_conflict: candidate.sourceConflict,
    data_fetched_at: candidate.dataFetchedAt,
  };
}

export async function reviewRadarCandidate(candidate: RadarCandidate, apiKey: string | undefined, fetcher: typeof fetch = fetch, options: { maxAttempts?: number; timeoutMs?: number } = {}): Promise<RadarAiReview> {
  const cutoff = candidate.firstSeenAt;
  if (!apiKey) return radarAiFallback("NOT_CONFIGURED", "XAI_NOT_CONFIGURED", cutoff);
  const maxAttempts = Math.max(1, Math.min(3, options.maxAttempts ?? 3));
  let lastCode = "UNKNOWN";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetcher("https://api.x.ai/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "grok-4.20-0309-non-reasoning", input: radarAiPrompt(radarReviewSummary(candidate)), tools: [{ type: "x_search" }], max_tool_calls: 1, max_output_tokens: 1_400, temperature: 0.1 }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
      });
      if (!response.ok) {
        lastCode = response.status === 429 ? "RATE_LIMITED" : response.status >= 500 ? `HTTP_${response.status}` : `HTTP_${response.status}`;
        if ((response.status === 429 || response.status >= 500) && attempt < maxAttempts) { await wait(250 * 2 ** (attempt - 1)); continue; }
        return { ...radarAiFallback("FAILED", lastCode, cutoff), attempt_count: attempt };
      }
      const payload = await response.json() as Record<string, unknown>;
      const parsed = parseRadarAiReview(extractResponseText(payload), { inputCutoffAt: cutoff, analysisAt: new Date().toISOString(), attemptCount: attempt, usage: payload.usage && typeof payload.usage === "object" ? payload.usage as Record<string, unknown> : undefined });
      return parsed;
    } catch (error) {
      lastCode = errorCode(error);
      if (attempt < maxAttempts) { await wait(250 * 2 ** (attempt - 1)); continue; }
      return { ...radarAiFallback("FAILED", lastCode, cutoff), attempt_count: attempt };
    }
  }
  return { ...radarAiFallback("FAILED", lastCode, cutoff), attempt_count: maxAttempts };
}
