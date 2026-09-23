import { narrativePlanningPrompt, parseNarrativeSearchPlan, parseRadarAiReview, radarAiFallback, radarAiPrompt } from "@/lib/radar/ai";
import type { NarrativeSearchPlan, RadarAiReview, RadarCandidate, XaiUsageEvent } from "@/lib/radar/types";

function extractResponseText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    if (!item || typeof item !== "object") continue;
    for (const part of Array.isArray((item as Record<string, unknown>).content) ? (item as Record<string, unknown>).content as unknown[] : []) {
      if (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string") return String((part as Record<string, unknown>).text);
    }
  }
  return "";
}
function errorCode(error: unknown) { if (error instanceof DOMException && error.name === "TimeoutError") return "TIMEOUT"; if (error instanceof Error && /timeout|aborted/i.test(error.message)) return "TIMEOUT"; return "NETWORK_ERROR"; }
function numeric(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null; }
function usageOf(payload: Record<string, unknown>) {
  const usage = payload.usage && typeof payload.usage === "object" ? { ...(payload.usage as Record<string, unknown>) } : {};
  const server = payload.server_side_tool_usage && typeof payload.server_side_tool_usage === "object" ? payload.server_side_tool_usage as Record<string, unknown> : {};
  const xCalls = Object.entries(server).reduce((sum, [key, value]) => /x_search/i.test(key) ? sum + (numeric(value) || 0) : sum, 0);
  usage.x_search_calls = numeric(usage.x_search_calls) ?? xCalls;
  return usage;
}
function fetchClass(posts: number | null): XaiUsageEvent["fetch_status"] { if (posts === null) return "UNKNOWN"; if (posts <= 5) return "NORMAL"; if (posts <= 10) return "ACCEPTABLE"; if (posts <= 20) return "FETCH_WARNING"; return "EXCESSIVE_X_FETCH"; }
function usageEvent(payload: Record<string, unknown> | null, taskType: XaiUsageEvent["task_type"], entryPoint: string, attempt: number, status: string): XaiUsageEvent {
  const usage = payload ? usageOf(payload) : {}; const details = usage.server_side_tool_usage_details && typeof usage.server_side_tool_usage_details === "object" ? usage.server_side_tool_usage_details as Record<string, unknown> : {};
  const posts = numeric(details.x_posts_fetched ?? usage.x_posts_fetched); const responseId = payload && typeof payload.id === "string" ? payload.id : null;
  const searched = taskType === "RADAR_NARRATIVE_SEARCH" || (numeric(usage.x_search_calls) || 0) > 0;
  return { request_id: responseId || crypto.randomUUID(), response_id: responseId, task_type: taskType, entry_point: entryPoint, attempt, status, input_tokens: numeric(usage.input_tokens), output_tokens: numeric(usage.output_tokens), x_search_calls: searched ? numeric(usage.x_search_calls) : 0, x_posts_fetched: searched ? posts : 0, x_users_fetched: searched ? numeric(details.x_users_fetched ?? usage.x_users_fetched) : 0, cost_in_usd_ticks: numeric(usage.cost_in_usd_ticks), fetch_status: searched ? fetchClass(posts) : "NOT_APPLICABLE" };
}
function dateOnly(value: number) { return new Date(value).toISOString().slice(0, 10); }

export function radarReviewSummary(candidate: RadarCandidate) {
  return { input_cutoff_at: candidate.firstSeenAt, source: candidate.source, source_event_id: candidate.sourceEventId, chain: candidate.chain, token_address: candidate.tokenAddress, token_name: candidate.name, symbol: candidate.symbol, known_project_account: candidate.knownProjectAccount || null, source_project_description: candidate.sourceProjectDescription || candidate.sourceDescriptionRaw || null, source_description_at: candidate.sourceDescriptionAt || candidate.firstSeenAt, source_description_source: candidate.sourceDescriptionSource || candidate.source, pair_address: candidate.pairAddress, dex_id: candidate.dexId || null, pool_created_at: candidate.poolCreatedAt, market_cap: candidate.marketCap, liquidity: candidate.liquidity, volume_24h: candidate.volume24h, holders: candidate.holders, buyers: candidate.buyers, sellers: candidate.sellers, smart_money_count: candidate.smartMoneyCount, source_conflict: candidate.sourceConflict, data_fetched_at: candidate.dataFetchedAt };
}

function fallbackPlan(candidate: RadarCandidate): NarrativeSearchPlan {
  const description = candidate.sourceProjectDescription || candidate.sourceDescriptionRaw || candidate.name;
  return { narrative_hypothesis: `来源页面声称：${description}。该说法尚未被外部证实。`, core_entities: [candidate.name, candidate.symbol].filter(Boolean), event_entities: [], cultural_reference: null, token_identity_terms: [candidate.tokenAddress, candidate.name, candidate.symbol].filter(Boolean), primary_query: `"${candidate.tokenAddress}" OR "${candidate.name}" OR "$${candidate.symbol}"`, fallback_topic_query: `${candidate.name} ${candidate.symbol} ${description}`.slice(0, 500), expected_evidence_types: ["TOKEN_DIRECT", "PROJECT_OFFICIAL", "THEME_CONTEXT", "COUNTER_EVIDENCE"], ambiguity_warning: "语义规划响应无效，已退回身份优先的窄范围查询。" };
}

async function callXai(apiKey: string, body: Record<string, unknown>, fetcher: typeof fetch, timeoutMs: number) {
  const response = await fetcher("https://api.x.ai/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  let payload: Record<string, unknown> | null = null; try { payload = await response.json() as Record<string, unknown>; } catch { payload = null; }
  return { response, payload };
}

export async function reviewRadarCandidate(candidate: RadarCandidate, apiKey: string | undefined, fetcher: typeof fetch = fetch, options: { timeoutMs?: number; entryPoint?: string; claimFingerprint?: string; maxAttempts?: number } = {}): Promise<RadarAiReview> {
  const cutoff = candidate.firstSeenAt; const entryPoint = options.entryPoint || "radar_first_discovery"; const timeoutMs = options.timeoutMs ?? 20_000; const events: XaiUsageEvent[] = [];
  const planTask: XaiUsageEvent["task_type"] = entryPoint === "radar_backfill" ? "RADAR_BACKFILL" : "RADAR_NARRATIVE_PLAN";
  const searchTask: XaiUsageEvent["task_type"] = entryPoint === "radar_backfill" ? "RADAR_BACKFILL" : "RADAR_NARRATIVE_SEARCH";
  if (!apiKey) return radarAiFallback("NOT_CONFIGURED", "XAI_NOT_CONFIGURED", cutoff);
  const summary = radarReviewSummary(candidate); let plan: NarrativeSearchPlan | null = null;
  try {
    const planned = await callXai(apiKey, { model: "grok-4.20-0309-non-reasoning", input: narrativePlanningPrompt(summary), max_output_tokens: 700, temperature: 0.1 }, fetcher, timeoutMs);
    events.push(usageEvent(planned.payload, planTask, entryPoint, 1, planned.response.ok ? "SUCCESS" : `HTTP_${planned.response.status}`));
    if (planned.response.ok && planned.payload) plan = parseNarrativeSearchPlan(extractResponseText(planned.payload));
  } catch (error) { events.push(usageEvent(null, planTask, entryPoint, 1, errorCode(error))); }
  plan ||= fallbackPlan(candidate);
  try {
    const cutoffMs = Date.parse(cutoff); const now = Date.now();
    const searched = await callXai(apiKey, { model: "grok-4.20-0309-non-reasoning", input: radarAiPrompt(summary, plan), tools: [{ type: "x_search", from_date: dateOnly(Number.isFinite(cutoffMs) ? cutoffMs - 3 * 86_400_000 : now - 3 * 86_400_000), to_date: dateOnly(now), enable_image_understanding: false, enable_video_understanding: false }], max_tool_calls: 1, max_output_tokens: 1_800, temperature: 0.1 }, fetcher, timeoutMs);
    const searchUsage = searched.payload ? usageOf(searched.payload) : {};
    events.push(usageEvent(searched.payload, searchTask, entryPoint, 1, searched.response.ok ? "SUCCESS" : `HTTP_${searched.response.status}`));
    if (!searched.response.ok || !searched.payload) return { ...radarAiFallback("FAILED", `HTTP_${searched.response.status}`, cutoff), discovery_plan: plan, claim_fingerprint: options.claimFingerprint || null, usage_events: events, attempt_count: 1 };
    const responseId = typeof searched.payload.id === "string" ? searched.payload.id : null; const raw = extractResponseText(searched.payload);
    let parsed = parseRadarAiReview(raw, { inputCutoffAt: cutoff, analysisAt: new Date().toISOString(), attemptCount: 1, usage: searchUsage, plan, claimFingerprint: options.claimFingerprint || null, responseId, usageEvents: events });
    if (parsed.error_code !== "JSON_INVALID") return parsed;
    try {
      const repaired = await callXai(apiKey, { model: "grok-4.20-0309-non-reasoning", input: `只修复下面文本为合法JSON，不联网、不调用工具、不增加新事实：\n${raw.slice(0, 12_000)}`, max_output_tokens: 1_800, temperature: 0 }, fetcher, timeoutMs);
      events.push(usageEvent(repaired.payload, "JSON_REPAIR", entryPoint, 1, repaired.response.ok ? "SUCCESS" : `HTTP_${repaired.response.status}`));
      if (repaired.response.ok && repaired.payload) parsed = parseRadarAiReview(extractResponseText(repaired.payload), { inputCutoffAt: cutoff, analysisAt: new Date().toISOString(), attemptCount: 1, usage: searchUsage, plan, claimFingerprint: options.claimFingerprint || null, responseId, usageEvents: events });
    } catch (error) { events.push(usageEvent(null, "JSON_REPAIR", entryPoint, 1, errorCode(error))); }
    return { ...parsed, usage_events: events };
  } catch (error) { events.push(usageEvent(null, searchTask, entryPoint, 1, errorCode(error))); return { ...radarAiFallback("FAILED", errorCode(error), cutoff), discovery_plan: plan, claim_fingerprint: options.claimFingerprint || null, usage_events: events, attempt_count: 1 }; }
}
