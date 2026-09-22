import { NARRATIVE_STATUSES, RADAR_DECISIONS, type NarrativeEvidence, type NarrativeStatus, type RadarAiReview } from "@/lib/radar/types";

export const RADAR_MODEL_VERSION = "grok-radar-narrative-v2";
export const RADAR_PROMPT_VERSION = "radar-narrative-2026-09-22-v2";

function strings(value: unknown, limit = 10) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 500)).slice(0, limit) : [];
}
function bounded(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : null;
}
function isoOrNull(value: unknown) {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
function narrativeEvidence(value: unknown, cutoff: string) {
  const cutoffMs = Date.parse(cutoff);
  const rows = Array.isArray(value) ? value : [];
  return rows.flatMap((item): NarrativeEvidence[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const publishedAt = isoOrNull(row.published_at);
    const publishedMs = publishedAt ? Date.parse(publishedAt) : NaN;
    const relation = row.relation === "support" || row.relation === "oppose" || row.relation === "context" ? row.relation : "context";
    const available = Boolean(publishedAt && Number.isFinite(cutoffMs) && publishedMs <= cutoffMs);
    if (!available) return [];
    const url = typeof row.url === "string" && /^https:\/\//i.test(row.url) ? row.url.slice(0, 1_000) : null;
    return [{ url, title: String(row.title || "未命名证据").slice(0, 300), published_at: publishedAt, relation, reason: String(row.reason || "").slice(0, 500), available_at_signal: true }];
  }).slice(0, 8);
}

export function radarAiFallback(status: NarrativeStatus = "PENDING", errorCode: string | null = null, cutoff = ""): RadarAiReview {
  return {
    status,
    decision: "HOLD",
    confidence: 0,
    narrative_score: null,
    risk_score: null,
    stage: "unknown",
    summary: status === "NOT_CONFIGURED" ? "Grok未配置" : status === "INSUFFICIENT_EVIDENCE" ? "叙事证据不足，暂不评分。" : status === "FAILED" ? "AI叙事暂时失败，请稍后重试。" : "AI叙事分析中",
    freshness_score: null,
    sentiment_score: null,
    lead_score: null,
    positive_reasons: [],
    negative_reasons: [],
    invalidators: [],
    recommended_action: "HOLD",
    model_version: RADAR_MODEL_VERSION,
    evidence_refs: [],
    evidence: [],
    prompt_version: RADAR_PROMPT_VERSION,
    input_cutoff_at: cutoff,
    analysis_at: null,
    attempt_count: 0,
    error_code: errorCode,
    input_tokens: null,
    output_tokens: null,
    cost_microusd: null,
  };
}

export function parseRadarAiReview(raw: unknown, options: { inputCutoffAt?: string; analysisAt?: string; attemptCount?: number; usage?: Record<string, unknown> } = {}): RadarAiReview {
  const cutoff = options.inputCutoffAt || "";
  let value = raw;
  if (typeof raw === "string") {
    const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    try { value = JSON.parse(clean); } catch { return { ...radarAiFallback("FAILED", "JSON_INVALID", cutoff), attempt_count: options.attemptCount || 1 }; }
  }
  if (!value || typeof value !== "object") return { ...radarAiFallback("FAILED", "SCHEMA_INVALID", cutoff), attempt_count: options.attemptCount || 1 };
  const row = value as Record<string, unknown>;
  const requestedStatus = typeof row.status === "string" && NARRATIVE_STATUSES.includes(row.status as NarrativeStatus) ? row.status as NarrativeStatus : "COMPLETED";
  const evidence = narrativeEvidence(row.evidence, cutoff);
  const usage = options.usage || {};
  const shared = {
    prompt_version: RADAR_PROMPT_VERSION,
    input_cutoff_at: cutoff,
    analysis_at: options.analysisAt || new Date().toISOString(),
    attempt_count: options.attemptCount || 1,
    input_tokens: bounded(usage.input_tokens, 0, Number.MAX_SAFE_INTEGER),
    output_tokens: bounded(usage.output_tokens, 0, Number.MAX_SAFE_INTEGER),
    cost_microusd: bounded(usage.cost_microusd, 0, Number.MAX_SAFE_INTEGER),
  };
  if (requestedStatus === "INSUFFICIENT_EVIDENCE" || evidence.length === 0) {
    return { ...radarAiFallback("INSUFFICIENT_EVIDENCE", null, cutoff), ...shared, summary: String(row.summary || "没有找到信号时点之前可核验的叙事证据，暂不评分。").slice(0, 800), stage: typeof row.stage === "string" ? row.stage.slice(0, 60) : "unknown", evidence };
  }
  const decision = typeof row.decision === "string" && RADAR_DECISIONS.includes(row.decision as RadarAiReview["decision"]) ? row.decision as RadarAiReview["decision"] : null;
  const confidence = bounded(row.confidence, 0, 1);
  const narrative = bounded(row.narrative_score, 0, 100);
  const risk = bounded(row.risk_score, 0, 100);
  const freshness = bounded(row.freshness_score, 0, 100);
  const sentiment = bounded(row.sentiment_score, 0, 100);
  const lead = bounded(row.lead_score, 0, 100);
  if (!decision || confidence === null || narrative === null || risk === null || freshness === null || sentiment === null || lead === null || typeof row.stage !== "string" || typeof row.summary !== "string") {
    return { ...radarAiFallback("FAILED", "SCHEMA_INVALID", cutoff), ...shared };
  }
  return {
    status: "COMPLETED",
    decision,
    confidence,
    narrative_score: narrative,
    risk_score: risk,
    stage: row.stage.slice(0, 60),
    summary: row.summary.slice(0, 800),
    freshness_score: freshness,
    sentiment_score: sentiment,
    lead_score: lead,
    positive_reasons: strings(row.positive_reasons),
    negative_reasons: strings(row.negative_reasons),
    invalidators: strings(row.invalidators),
    recommended_action: String(row.recommended_action || "HOLD").slice(0, 120),
    model_version: RADAR_MODEL_VERSION,
    evidence_refs: evidence.flatMap((item) => item.url ? [item.url] : []),
    evidence,
    error_code: null,
    ...shared,
  };
}

export function radarAiPrompt(inputSummary: Record<string, unknown>) {
  return `你是加密资产叙事研究员，只负责叙事分析，不负责放宽交易安全门。仅使用发布时间不晚于 input_cutoff_at 的可核验信息；禁止把信号后的信息冒充为信号当时已知信息，禁止编造事件、新闻、账号或链接。可以使用一次X搜索寻找历史帖子。没有信号时点前的可核验证据时，status必须为INSUFFICIENT_EVIDENCE且所有分数为null。\n判断叙事主题、真实催化剂、新鲜度、情绪强度、传播速度、社区参与、名称/形象与热点匹配度、旧梗换皮、是否提前上涨、机器人宣传、传播阶段、短期传播理由和叙事风险。\n严格只输出JSON：{"status":"COMPLETED或INSUFFICIENT_EVIDENCE","decision":"APPROVE/HOLD/REJECT","confidence":0到1,"narrative_score":0到100或null,"risk_score":0到100或null,"freshness_score":0到100或null,"sentiment_score":0到100或null,"lead_score":0到100或null,"stage":"萌芽/扩散/高潮/退潮/unknown","summary":"2至4行中文，说明叙事、当前关注原因、阶段、亮点、问题和结论","positive_reasons":[],"negative_reasons":[],"invalidators":[],"recommended_action":"HOLD","evidence":[{"url":"https链接或空","title":"标题","published_at":"ISO时间","relation":"support/oppose/context","reason":"理由"}]}。\n冻结输入：${JSON.stringify(inputSummary)}`;
}
