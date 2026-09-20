import { describe, expect, it } from "vitest";
import { hasValidListHistory } from "@/app/signal/[id]/back-to-signals";
import { LIST_METRIC_LABELS } from "@/app/dashboard";
import { chainLabel } from "@/lib/chains";
import { readFileSync } from "node:fs";

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
  it("keeps the wallet menu and contract copy controls operable", () => {
    const wallet = readFileSync(new URL("../components/wallet/wallet-button.tsx", import.meta.url), "utf8");
    const bridge = readFileSync(new URL("../components/wallet/wallet-bridge.tsx", import.meta.url), "utf8");
    const dashboard = readFileSync(new URL("../app/dashboard.tsx", import.meta.url), "utf8");
    const copy = readFileSync(new URL("../app/signal/[id]/copy-address.tsx", import.meta.url), "utf8");
    expect(wallet).toContain('aria-controls={menuId}');
    for (const label of ["当前网络", "复制钱包地址", "切换网络", "断开并重新连接", "断开钱包"]) expect(wallet).toContain(label);
    expect(bridge).toContain("void closeRef.current().catch");
    expect(dashboard).toContain('className="inline-flex min-w-0 items-center gap-1.5"');
    expect(copy).toContain("event.stopPropagation()");
  });
});
