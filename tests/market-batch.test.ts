import { afterEach, describe, expect, it, vi } from "vitest";
import { getBatchMarketData } from "@/lib/batch-market";

afterEach(() => vi.unstubAllGlobals());

describe("batch market source", () => {
  it("groups tokens into one upstream request per chain and selects the deepest pool", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([
      { baseToken: { address: "0xaaaaaaaaaa" }, priceUsd: "1", marketCap: 10, liquidity: { usd: 5 }, volume: { h24: 3 } },
      { baseToken: { address: "0xaaaaaaaaaa" }, priceUsd: "2", marketCap: 20, liquidity: { usd: 50 }, volume: { h24: 30 } },
      { baseToken: { address: "0xbbbbbbbbbb" }, priceUsd: "4", marketCap: 40, liquidity: { usd: 25 }, volume: { h24: 12 } },
    ]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getBatchMarketData([{ chain: "base", address: "0xaaaaaaaaaa" }, { chain: "base", address: "0xbbbbbbbbbb" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result[0]).toMatchObject({ price: 2, liquidity: 50 });
    expect(result[0].marketCap).toBe(0);
    expect(result[1]).toMatchObject({ price: 4, liquidity: 25 });
  });
  it("does not call OKX Premium price-info and never treats pair FDV as market cap", async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => { requestedUrls.push(String(input)); return new Response(JSON.stringify([{ baseToken: { address: "0xaaaaaaaaaa" }, priceUsd: "2", fdv: 999, liquidity: { usd: 50 }, volume: { h24: 30 } }]), { status: 200 }); });
    vi.stubGlobal("fetch", fetchMock);
    const [result] = await getBatchMarketData([{ chain: "base", address: "0xaaaaaaaaaa" }], { apiKey: "key", secretKey: "secret", passphrase: "pass", projectId: "project" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestedUrls[0]).not.toContain("price-info");
    expect(result).toMatchObject({ price: 2, marketCap: 0, marketCapKind: null, liquidity: 50, volume24h: 30, holders: null, source: "DexScreener" });
  });
});
