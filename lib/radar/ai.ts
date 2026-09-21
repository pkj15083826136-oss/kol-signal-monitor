import { RADAR_DECISIONS, type RadarAiReview } from "@/lib/radar/types";

export const RADAR_MODEL_VERSION = "grok-radar-review-v1";
const HOLD: RadarAiReview = { decision: "HOLD", confidence: 0, narrative_score: 0, risk_score: 100, stage: "unknown", positive_reasons: [], negative_reasons: ["证据不足或AI输出无效"], invalidators: ["数据不足"], recommended_action: "HOLD", model_version: RADAR_MODEL_VERSION, evidence_refs: [] };

function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 10) : []; }
function bounded(value: unknown, min: number, max: number) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : NaN; }

export function radarAiFallback(): RadarAiReview { return { ...HOLD, negative_reasons: [...HOLD.negative_reasons], invalidators: [...HOLD.invalidators] }; }

export function parseRadarAiReview(raw: unknown): RadarAiReview {
  let value = raw;
  if (typeof raw === "string") {
    const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    try { value = JSON.parse(clean); } catch { return radarAiFallback(); }
  }
  if (!value || typeof value !== "object") return radarAiFallback();
  const row = value as Record<string, unknown>;
  const decision = typeof row.decision === "string" && RADAR_DECISIONS.includes(row.decision as RadarAiReview["decision"]) ? row.decision as RadarAiReview["decision"] : null;
  const confidence = bounded(row.confidence, 0, 1); const narrative = bounded(row.narrative_score, 0, 100); const risk = bounded(row.risk_score, 0, 100);
  if (!decision || !Number.isFinite(confidence) || !Number.isFinite(narrative) || !Number.isFinite(risk) || typeof row.stage !== "string" || typeof row.recommended_action !== "string" || typeof row.model_version !== "string") return radarAiFallback();
  return { decision, confidence, narrative_score: narrative, risk_score: risk, stage: row.stage.slice(0, 60), positive_reasons: strings(row.positive_reasons), negative_reasons: strings(row.negative_reasons), invalidators: strings(row.invalidators), recommended_action: row.recommended_action.slice(0, 120), model_version: row.model_version.slice(0, 80), evidence_refs: strings(row.evidence_refs) };
}

export function radarAiPrompt(inputSummary: Record<string, unknown>) {
  return `你是新币风险与叙事审核器。确定性安全硬过滤已在外部执行，你不得要求跳过。只能输出JSON，字段为decision, confidence, narrative_score, risk_score, stage, positive_reasons, negative_reasons, invalidators, recommended_action, model_version, evidence_refs。decision只能为APPROVE/HOLD/REJECT/EMERGENCY_CLOSE。证据不足时必须HOLD。\n输入摘要：${JSON.stringify(inputSummary)}`;
}
