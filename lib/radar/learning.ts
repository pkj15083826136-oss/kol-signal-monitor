export type OutcomeGroup = "A" | "B" | "C" | "D" | "UNKNOWN";
export function classifyOutcome(multiple: number | null, failed = false): OutcomeGroup {
  if (failed) return "D"; if (multiple === null || !Number.isFinite(multiple)) return "UNKNOWN";
  if (multiple >= 5) return "A"; if (multiple >= 2) return "B"; if (multiple >= 1) return "C"; return "D";
}
export function evidenceAvailableAtSignal(signalAt: string, publishedAt: string) {
  const signal = Date.parse(signalAt); const published = Date.parse(publishedAt);
  return Number.isFinite(signal) && Number.isFinite(published) && published <= signal;
}
export type PromptState = "draft" | "shadow" | "published" | "rolled_back";
export function transitionPromptVersion(current: PromptState, action: "shadow" | "publish" | "rollback"): PromptState {
  if (action === "shadow" && current === "draft") return "shadow";
  if (action === "publish" && current === "shadow") return "published";
  if (action === "rollback" && current === "published") return "rolled_back";
  throw new Error("INVALID_PROMPT_VERSION_TRANSITION");
}
export function frozenNarrativeInput<T extends { capturedAt: string }>(signalAt: string, events: T[]) { return events.filter((event) => evidenceAvailableAtSignal(signalAt, event.capturedAt)); }

export type LearningSummary = {
  sampleCount: number;
  completeSampleCount: number;
  groups: Record<OutcomeGroup, number>;
  manualCaseCount: number;
  promptVersions: Array<{ version: string; status: PromptState; createdAt: string; publishedAt: string | null }>;
};

export function emptyLearningSummary(): LearningSummary {
  return { sampleCount: 0, completeSampleCount: 0, groups: { A: 0, B: 0, C: 0, D: 0, UNKNOWN: 0 }, manualCaseCount: 0, promptVersions: [] };
}

export function collectorDisplayState(row: Record<string, unknown> | null, now = Date.now()) {
  if (!row) return "BLOCKED_EXTERNAL_ENDPOINT";
  if (row.login_status === "required") return "LOGIN_EXPIRED";
  const heartbeat = row.last_heartbeat_at ? Date.parse(String(row.last_heartbeat_at)) : Number.NaN;
  if (row.connection_status === "connected" && Number.isFinite(heartbeat) && now - heartbeat <= 5 * 60_000) return "CONNECTED";
  return "BLOCKED_EXTERNAL_ENDPOINT";
}
