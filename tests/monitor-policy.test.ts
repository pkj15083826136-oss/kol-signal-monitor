import { describe, expect, it } from "vitest";
import { countIndependentWallets, dueAlertThreshold, normalizeAddress } from "@/lib/monitor-policy";

describe("monitor policy", () => {
  it("deduplicates independent wallets with chain-aware addresses", () => {
    expect(countIndependentWallets("bsc", [{ wallet: "0xAbC", balance: 1 }, { wallet: "0xabc", balance: 2 }, { wallet: "0xdef", balance: 0 }])).toBe(1);
    expect(countIndependentWallets("sol", [{ wallet: "AbC", balance: 1 }, { wallet: "abc", balance: 1 }])).toBe(2);
    expect(normalizeAddress("sol", " AbC ")).toBe("AbC");
    expect(normalizeAddress("Solana", " AbC ")).toBe("AbC");
  });
  it.each([6, 18, 38, 58])("emits stage %i once", (stage) => {
    expect(dueAlertThreshold(stage, [])).toBe(stage);
    expect(dueAlertThreshold(stage, [stage])).toBeUndefined();
  });
});
