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
    expect(result[1]).toMatchObject({ price: 4, liquidity: 25 });
  });
});
