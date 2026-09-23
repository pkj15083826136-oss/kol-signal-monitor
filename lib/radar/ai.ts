import { RADAR_DECISIONS, type NarrativeEvidence, type NarrativeSearchPlan, type NarrativeStatus, type RadarAiReview, type XaiUsageEvent } from "@/lib/radar/types";

export const RADAR_MODEL_VERSION = "grok-radar-narrative-v3";
export const RADAR_PROMPT_VERSION = "radar-narrative-2026-09-23-v3";
export const RADAR_ANALYSIS_STAGE = "NARRATIVE_DISCOVERY";

function strings(value: unknown, limit = 10) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 500)).filter(Boolean).slice(0, limit) : []; }
function bounded(value: unknown, min: number, max: number) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : null; }
function isoOrNull(value: unknown) { if (!value) return null; const parsed = new Date(String(value)); return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null; }
function text(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }

export function sourceDescriptionFingerprint(value: string | null | undefined) {
  const normalized = String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) { hash ^= normalized.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `${normalized.length.toString(36)}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function safeXPostUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim()); const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.protocol !== "https:" || !["x.com", "twitter.com"].includes(host) || !/^\/[^/]+\/status\/\d+\/?$/i.test(url.pathname)) return null;
    url.search = ""; url.hash = ""; return url.toString().slice(0, 1_000);
  } catch { return null; }
}
export function isSearchActionDescription(value: unknown) { return /^(x\s+)?(keyword|semantic|user|thread)\s+search|search results?|搜索动作|关键词搜索|语义搜索/i.test(String(value || "").trim()); }

function relation(value: unknown): NarrativeEvidence["evidence_relation"] {
  const allowed: NarrativeEvidence["evidence_relation"][] = ["TOKEN_DIRECT", "PROJECT_OFFICIAL", "CATALYST_PRIMARY", "THEME_CONTEXT", "COMMUNITY_PROPAGATION", "COUNTER_EVIDENCE", "LOOKALIKE_OLD_MEME"];
  const normalized = String(value || "").toUpperCase();
  if (allowed.includes(normalized as NarrativeEvidence["evidence_relation"])) return normalized as NarrativeEvidence["evidence_relation"];
  if (normalized === "SUPPORT") return "COMMUNITY_PROPAGATION";
  if (normalized === "OPPOSE") return "COUNTER_EVIDENCE";
  return "THEME_CONTEXT";
}
function metrics(value: unknown) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => { const parsed = Number(item); return Number.isFinite(parsed) && parsed >= 0 ? [[key.slice(0, 40), parsed]] : []; }).slice(0, 8));
}
function narrativeEvidence(value: unknown, cutoff: string) {
  const cutoffMs = Date.parse(cutoff); const rows = Array.isArray(value) ? value : [];
  return rows.flatMap((item): NarrativeEvidence[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>; const summary = text(row.short_summary ?? row.reason ?? row.title, 500);
    if (!summary || isSearchActionDescription(summary)) return [];
    const publishedAt = isoOrNull(row.published_at); const publishedMs = publishedAt ? Date.parse(publishedAt) : NaN; const sourceUrl = safeXPostUrl(row.source_url ?? row.url);
    const postId = text(row.x_post_id, 40) || sourceUrl?.match(/\/status\/(\d+)/i)?.[1] || null;
    return [{ source_url: sourceUrl, x_post_id: postId, author_handle: text(row.author_handle, 80).replace(/^@/, "") || null, author_name: text(row.author_name, 120) || null, published_at: publishedAt, short_summary: summary, evidence_relation: relation(row.evidence_relation ?? row.relation), relevance_score: bounded(row.relevance_score, 0, 100) ?? 0, engagement_metrics: metrics(row.engagement_metrics), before_signal_cutoff: Boolean(publishedAt && Number.isFinite(cutoffMs) && publishedMs <= cutoffMs) }];
  }).sort((a, b) => b.relevance_score - a.relevance_score).slice(0, 5);
}

export function parseNarrativeSearchPlan(raw: unknown): NarrativeSearchPlan | null {
  let value = raw;
  if (typeof raw === "string") { try { value = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()); } catch { return null; } }
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const plan = { narrative_hypothesis: text(row.narrative_hypothesis, 800), core_entities: strings(row.core_entities, 8), event_entities: strings(row.event_entities, 8), cultural_reference: text(row.cultural_reference, 300) || null, token_identity_terms: strings(row.token_identity_terms, 8), primary_query: text(row.primary_query, 500), fallback_topic_query: text(row.fallback_topic_query, 500), expected_evidence_types: strings(row.expected_evidence_types, 8), ambiguity_warning: text(row.ambiguity_warning, 500) || null };
  return plan.narrative_hypothesis && plan.primary_query ? plan : null;
}
function fetchStatus(posts: number | null): XaiUsageEvent["fetch_status"] { if (posts === null) return "UNKNOWN"; if (posts <= 5) return "NORMAL"; if (posts <= 10) return "ACCEPTABLE"; if (posts <= 20) return "FETCH_WARNING"; return "EXCESSIVE_X_FETCH"; }

export function radarAiFallback(status: NarrativeStatus = "PENDING", errorCode: string | null = null, cutoff = ""): RadarAiReview {
  return { status, decision: "HOLD", confidence: 0, narrative_score: null, meme_potential_score: null, catalyst_evidence_score: null, risk_score: null, stage: "unknown", summary: status === "NOT_CONFIGURED" ? "Grok未配置" : status === "INSUFFICIENT_EVIDENCE" ? "未发现Token直接证据；主题传播潜力尚待分析。" : status === "FAILED" ? "AI叙事暂时失败，请稍后重试。" : "AI叙事分析中", freshness_score: null, sentiment_score: null, lead_score: null, positive_reasons: [], negative_reasons: [], invalidators: [], recommended_action: "HOLD", model_version: RADAR_MODEL_VERSION, evidence_refs: [], evidence: [], prompt_version: RADAR_PROMPT_VERSION, input_cutoff_at: cutoff, analysis_at: null, attempt_count: 0, error_code: errorCode, input_tokens: null, output_tokens: null, cost_microusd: null, cost_in_usd_ticks: null, discovery_plan: null, claim_fingerprint: null, analysis_stage: RADAR_ANALYSIS_STAGE, x_search_calls: null, x_posts_fetched: null, x_users_fetched: null, fetch_status: "UNKNOWN", response_id: null, usage_events: [] };
}

export function parseRadarAiReview(raw: unknown, options: { inputCutoffAt?: string; analysisAt?: string; attemptCount?: number; usage?: Record<string, unknown>; plan?: NarrativeSearchPlan | null; claimFingerprint?: string | null; responseId?: string | null; usageEvents?: XaiUsageEvent[] } = {}): RadarAiReview {
  const cutoff = options.inputCutoffAt || ""; let value = raw;
  if (typeof raw === "string") { try { value = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()); } catch { return { ...radarAiFallback("FAILED", "JSON_INVALID", cutoff), attempt_count: options.attemptCount || 1, discovery_plan: options.plan || null, usage_events: options.usageEvents || [] }; } }
  if (!value || typeof value !== "object") return { ...radarAiFallback("FAILED", "SCHEMA_INVALID", cutoff), attempt_count: options.attemptCount || 1, discovery_plan: options.plan || null, usage_events: options.usageEvents || [] };
  const row = value as Record<string, unknown>; const usage = options.usage || {}; const details = usage.server_side_tool_usage_details && typeof usage.server_side_tool_usage_details === "object" ? usage.server_side_tool_usage_details as Record<string, unknown> : {};
  const posts = bounded(details.x_posts_fetched ?? usage.x_posts_fetched, 0, Number.MAX_SAFE_INTEGER); const users = bounded(details.x_users_fetched ?? usage.x_users_fetched, 0, Number.MAX_SAFE_INTEGER); const calls = bounded(usage.x_search_calls, 0, Number.MAX_SAFE_INTEGER); const ticks = bounded(usage.cost_in_usd_ticks, 0, Number.MAX_SAFE_INTEGER); const evidence = narrativeEvidence(row.evidence, cutoff);
  const decision = typeof row.decision === "string" && RADAR_DECISIONS.includes(row.decision as RadarAiReview["decision"]) ? row.decision as RadarAiReview["decision"] : null;
  const confidence = bounded(row.confidence, 0, 1); const narrative = bounded(row.narrative_score, 0, 100); const meme = bounded(row.meme_potential_score, 0, 100); const catalyst = bounded(row.catalyst_evidence_score, 0, 100); const risk = bounded(row.risk_score, 0, 100); const freshness = bounded(row.freshness_score, 0, 100); const sentiment = bounded(row.sentiment_score, 0, 100); const lead = bounded(row.lead_score, 0, 100); const summary = text(row.summary, 1_000);
  const valid = decision && confidence !== null && narrative !== null && meme !== null && catalyst !== null && risk !== null && freshness !== null && sentiment !== null && lead !== null && typeof row.stage === "string" && summary;
  const common = { prompt_version: RADAR_PROMPT_VERSION, input_cutoff_at: cutoff, analysis_at: options.analysisAt || new Date().toISOString(), attempt_count: options.attemptCount || 1, input_tokens: bounded(usage.input_tokens, 0, Number.MAX_SAFE_INTEGER), output_tokens: bounded(usage.output_tokens, 0, Number.MAX_SAFE_INTEGER), cost_microusd: ticks === null ? null : Math.round(ticks / 10_000), cost_in_usd_ticks: ticks, discovery_plan: options.plan || null, claim_fingerprint: options.claimFingerprint || null, analysis_stage: RADAR_ANALYSIS_STAGE, x_search_calls: calls, x_posts_fetched: posts, x_users_fetched: users, fetch_status: fetchStatus(posts), response_id: options.responseId || null, usage_events: options.usageEvents || [] };
  if (!valid) return { ...radarAiFallback("FAILED", "SCHEMA_INVALID", cutoff), ...common };
  return { status: "COMPLETED", decision, confidence, narrative_score: narrative, meme_potential_score: meme, catalyst_evidence_score: catalyst, risk_score: risk, stage: String(row.stage).slice(0, 60), summary, freshness_score: freshness, sentiment_score: sentiment, lead_score: lead, positive_reasons: strings(row.positive_reasons), negative_reasons: strings(row.negative_reasons), invalidators: strings(row.invalidators), recommended_action: String(row.recommended_action || "HOLD").slice(0, 120), model_version: RADAR_MODEL_VERSION, evidence_refs: evidence.flatMap((item) => item.source_url ? [item.source_url] : []), evidence, error_code: null, ...common };
}

export function narrativePlanningPrompt(inputSummary: Record<string, unknown>) {
  return `你是叙事检索规划器。不要联网，不调用任何工具。先理解来源页面给出的初始简介；它只是待验证线索，不是事实，也不能整段机械复制成关键词。结合Token名称、symbol、合约、链、首次发现时间、已知项目账号和行情，生成精准检索计划。primary_query优先包含Token身份信息；fallback_topic_query用于没有Token直接结果时验证主题传播背景，禁止仅搜索CZ、AI、BSC等宽泛单词。严格只输出JSON：{"narrative_hypothesis":"","core_entities":[],"event_entities":[],"cultural_reference":null,"token_identity_terms":[],"primary_query":"","fallback_topic_query":"","expected_evidence_types":[],"ambiguity_warning":null}。冻结输入：${JSON.stringify(inputSummary)}`;
}
export function radarAiPrompt(inputSummary: Record<string, unknown>, plan: NarrativeSearchPlan) {
  return `你是加密资产叙事研究员，只负责叙事判断，不得放宽确定性交易安全门。来源页面的初始简介只是待验证线索。只进行一次精准X搜索：先查合约、Token名称、symbol和项目账号的直接帖子；没有直接结果时再用计划中的主题查询评价传播潜力。日期范围围绕首次信号。禁止主动展开thread、禁止搜索用户profile、禁止图片或视频理解、禁止连续更换大量关键词、禁止宽泛搜索CZ/AI/BSC等单词。最多选择5条真正有判断价值的帖子；没有可靠结果时停止，不得为凑数扩大搜索。搜索动作描述不是证据。每条证据区分TOKEN_DIRECT、PROJECT_OFFICIAL、CATALYST_PRIMARY、THEME_CONTEXT、COMMUNITY_PROPAGATION、COUNTER_EVIDENCE、LOOKALIKE_OLD_MEME。THEME_CONTEXT不能证明Token与事件有关。没有Token直接证据时，summary明确写出“未发现与该Token直接相关的可靠帖子。以下证据仅用于评价初始简介所描述主题的传播潜力。”，仍评估meme_potential_score，但降低catalyst_evidence_score和confidence。严格只输出JSON：{"status":"COMPLETED","decision":"APPROVE/HOLD/REJECT","confidence":0到1,"narrative_score":0到100,"meme_potential_score":0到100,"catalyst_evidence_score":0到100,"risk_score":0到100,"freshness_score":0到100,"sentiment_score":0到100,"lead_score":0到100,"stage":"萌芽/扩散/高潮/退潮/unknown","summary":"中文结论","positive_reasons":[],"negative_reasons":[],"invalidators":[],"recommended_action":"HOLD","evidence":[{"source_url":"真实x.com状态链接或空","x_post_id":"","author_handle":"","author_name":"","published_at":"ISO时间或空","short_summary":"","evidence_relation":"TOKEN_DIRECT等枚举","relevance_score":0到100,"engagement_metrics":{"likes":0,"reposts":0,"replies":0}}]}。冻结输入：${JSON.stringify(inputSummary)}\n检索计划：${JSON.stringify(plan)}`;
}
