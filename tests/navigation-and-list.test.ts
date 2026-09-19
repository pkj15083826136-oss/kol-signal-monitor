import { describe, expect, it } from "vitest";
import { hasValidListHistory } from "@/app/signal/[id]/back-to-signals";
import { LIST_METRIC_LABELS } from "@/app/dashboard";
import { chainLabel } from "@/lib/chains";

describe("list and detail navigation contracts", () => {
  it("uses same-origin list history and rejects missing or external history", () => {
    expect(hasValidListHistory("https://example.com/?chain=sol", "https://example.com", false, 2)).toBe(true);
    expect(hasValidListHistory("", "https://example.com", false, 1)).toBe(false);
    expect(hasValidListHistory("https://evil.example/", "https://example.com", false, 2)).toBe(false);
    expect(hasValidListHistory("", "https://example.com", true, 2)).toBe(true);
  });
  it("removes price from list metrics and retains all requested columns", () => {
    expect(LIST_METRIC_LABELS).toEqual(["KOL人数", "持币地址", "市值", "流动性", "24H交易额", "预警时间"]);
    expect(LIST_METRIC_LABELS).not.toContain("价格");
  });
  it("renders the correct primary chain label", () => {
    expect(chainLabel("sol")).toBe("Solana");
    expect(chainLabel("bsc")).toBe("BSC");
    expect(chainLabel("base")).toBe("Base");
    expect(chainLabel("robinhood")).toBe("Robinhood");
  });
});
