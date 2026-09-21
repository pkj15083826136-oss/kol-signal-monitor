import { describe, expect, it } from "vitest";
import { AveSmartSignalAdapter } from "@/lib/radar/adapters/ave-smart";
import { existingSignalCandidate } from "@/lib/radar/adapters/existing-signals";

describe("radar source adapters", () => {
  it("fails closed when Ave Smart has no documented public endpoint", async () => {
    const result = await new AveSmartSignalAdapter().discover({ chains: ["sol", "bsc"] });
    expect(result.status).toBe("BLOCKED_EXTERNAL_ENDPOINT");
    expect(result.candidates).toEqual([]);
  });
  it("labels the existing KOL stream as a fallback rather than Ave Smart", () => {
    const candidate = existingSignalCandidate({ id: 7, chain: "sol", token_address: "So1", symbol: "T", holder_count: 6, alerted_at: "2026-09-21T00:00:00Z" });
    expect(candidate.source).toBe("gmgn_kol_aggregation");
    expect(candidate.sellSimulationPassed).toBeNull();
    expect(candidate.rawSnapshot).toEqual({ signalId: 7, source: "existing_signals" });
  });
});
