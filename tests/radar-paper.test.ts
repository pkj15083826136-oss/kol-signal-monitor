import { describe, expect, it } from "vitest";
import { applyPaperFill, evaluatePaperExit, paperOrderIdempotencyKey, type PaperPositionState } from "@/lib/radar/paper";

const B = BigInt;
function position(patch: Partial<PaperPositionState> = {}): PaperPositionState { return { id: "p1", entryQuantity: B(1000), remainingQuantity: B(1000), netCostUsdMicros: B(100_000_000), realizedUsdMicros: B(0), peakExecutableValueUsdMicros: B(100_000_000), currentExecutableValueUsdMicros: B(100_000_000), nextTakeProfitMultiple: B(2), takeProfitCount: 0, status: "open", ...patch }; }

describe("paper trading exit state machine", () => {
  it("sells half at 2x then advances idempotently to 4x and 8x", () => {
    const first = evaluatePaperExit(position(), B(200_000_000));
    expect(first).toMatchObject({ type: "SELL", reason: "TAKE_PROFIT", quantity: B(500), ladderMultiple: B(2) });
    if (first.type !== "SELL") throw new Error("expected sell");
    const after = applyPaperFill(position(), first, B(500), B(100_000_000), B(100_000_000));
    expect(after.nextTakeProfitMultiple).toBe(B(4));
    const second = evaluatePaperExit(after, B(400_000_000));
    expect(second).toMatchObject({ type: "SELL", quantity: B(250), ladderMultiple: B(4) });
    expect(paperOrderIdempotencyKey("p1", "TAKE_PROFIT", "4")).toBe(paperOrderIdempotencyKey("p1", "TAKE_PROFIT", "4"));
  });
  it("closes on -50%, 50% peak drawdown, or emergency", () => {
    expect(evaluatePaperExit(position(), B(50_000_000))).toMatchObject({ reason: "STOP_LOSS", quantity: B(1000) });
    expect(evaluatePaperExit(position({ peakExecutableValueUsdMicros: B(400_000_000) }), B(200_000_000))).toMatchObject({ reason: "TRAILING_DRAWDOWN" });
    expect(evaluatePaperExit(position(), B(100_000_000), true)).toMatchObject({ reason: "EMERGENCY_CLOSE" });
  });
  it("does not advance a take-profit rung on partial fill", () => {
    const action = evaluatePaperExit(position(), B(200_000_000));
    if (action.type !== "SELL") throw new Error("expected sell");
    const after = applyPaperFill(position(), action, B(100), B(20_000_000), B(180_000_000));
    expect(after.nextTakeProfitMultiple).toBe(B(2));
    expect(after.remainingQuantity).toBe(B(900));
  });
});
