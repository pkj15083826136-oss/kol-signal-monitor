import { describe, expect, it } from "vitest";
import { AveSmartSignalAdapter } from "@/lib/radar/adapters/ave-smart";
import { existingSignalCandidate } from "@/lib/radar/adapters/existing-signals";
import { AveSmartEventBuffer } from "@/lib/radar/adapters/ave-smart-browser";

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
  it("deduplicates Ave browser events and exposes disconnect/login expiry", () => {
    const buffer = new AveSmartEventBuffer(); buffer.connect();
    const event = { id: "signal-1", token: "So11111111111111111111111111111111111111112", chain: "solana", symbol: "TEST", signal_time: 1_758_499_200, current_price_usd: "0.01", mc_cur: "100000", holders_cur: "123" };
    expect(buffer.ingest([event])).toHaveLength(1); expect(buffer.ingest([event])).toHaveLength(0);
    buffer.loginExpired(); expect(buffer.state).toBe("login_expired"); buffer.disconnect(); expect(buffer.state).toBe("disconnected");
  });
});
