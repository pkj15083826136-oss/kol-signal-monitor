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
