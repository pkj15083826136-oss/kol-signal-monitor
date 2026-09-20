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
  it("uses one OKX batch response for token-level metrics without treating pair FDV as market cap", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => String(url).includes("web3.okx.com")
      ? new Response(JSON.stringify({ code: "0", data: [{ chainIndex: "8453", tokenContractAddress: "0xaaaaaaaaaa", time: "1789950000000", price: "3", priceChange24H: "2.5", marketCap: "120", liquidity: "90", volume24H: "45", holders: "9" }] }), { status: 200 })
      : new Response(JSON.stringify([{ baseToken: { address: "0xaaaaaaaaaa" }, priceUsd: "2", fdv: 999, liquidity: { usd: 50 }, volume: { h24: 30 } }]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const [result] = await getBatchMarketData([{ chain: "base", address: "0xaaaaaaaaaa" }], { apiKey: "key", secretKey: "secret", passphrase: "pass", projectId: "project" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ price: 3, priceChange24h: 2.5, marketCap: 120, marketCapKind: "market_cap", liquidity: 90, volume24h: 45, holders: 9, source: "OKX Onchain" });
  });
});
