import { describe, expect, it, vi } from "vitest";
import {
  OKX_CHAIN_INDEX,
  OKX_KLINE_BAR,
  OkxMarketClient,
  parseOkxCandles,
  parseOkxPriceInfo,
  signOkxRequest,
  type OkxCredentials,
} from "@/lib/providers/okx";

const credentials: OkxCredentials = { apiKey: "key", secretKey: "secret", passphrase: "pass", projectId: "project" };

describe("OKX Onchain market provider", () => {
  it("maps every supported chain and all six chart intervals", () => {
    expect(OKX_CHAIN_INDEX).toEqual({ sol: "501", bsc: "56", base: "8453", robinhood: "4663" });
    expect(OKX_KLINE_BAR).toEqual({ 1: "1m", 5: "5m", 15: "15m", 60: "1H", 240: "4H", 1440: "1Dutc" });
  });

  it("signs the exact timestamp + method + path/query + body prehash", async () => {
    await expect(signOkxRequest("secret", "2026-09-21T00:00:00.000Z", "POST", "/api/v6/dex/market/price-info", '[{"chainIndex":"501"}]'))
      .resolves.toBe("UzvUs96eJzEnkz6hETvU2o6CPCZIBNF4wMo83C0WMGk=");
  });

  it("normalizes token-level fields and rejects a mismatched identity", () => {
    const parsed = parseOkxPriceInfo({ code: "0", data: [{ chainIndex: "501", tokenContractAddress: "SoLExact", time: "1789950000000", price: "0.0021481", priceChange24H: "-1.25", marketCap: "21000000", circSupply: "9776104133", liquidity: "500000", volume24H: "300000", holders: "51970" }] }, [{ chain: "sol", address: "SoLExact" }]);
    expect(parsed.get("sol:SoLExact")).toMatchObject({ price: 0.0021481, priceChange24h: -1.25, marketCap: 21_000_000, liquidity: 500_000, volume24h: 300_000, holderCount: 51_970, identityVerified: true });
    expect(parseOkxPriceInfo({ code: "0", data: [{ chainIndex: "501", tokenContractAddress: "solexact", price: "1" }] }, [{ chain: "sol", address: "SoLExact" }]).size).toBe(0);
  });

  it("parses, sorts and deduplicates OHLCV candles", () => {
    const result = parseOkxCandles({ code: "0", data: [["2000", "2", "3", "1", "2.5", "8", "20", "0"], ["1000", "1", "2", "0.5", "1.5", "6", "9", "1"], ["2000", "2", "4", "1", "3", "9", "27", "1"]] });
    expect(result).toEqual([{ time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 6 }, { time: 2, open: 2, high: 4, low: 1, close: 3, volume: 9 }]);
  });

  it("deduplicates concurrent requests and opens a bounded circuit after repeated 429 responses", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ code: "0", data: [] }), { status: 200 }));
    const client = new OkxMarketClient(credentials, { fetcher, now: () => 1_000, sleep: async () => {} });
    await Promise.all([client.priceInfo([{ chain: "base", address: "0xabc0000000" }]), client.priceInfo([{ chain: "base", address: "0xabc0000000" }])]);
    expect(fetcher).toHaveBeenCalledTimes(1);

    const limited = vi.fn(async () => new Response(JSON.stringify({ code: "50011", msg: "rate limit" }), { status: 429 }));
    const blocked = new OkxMarketClient(credentials, { fetcher: limited, now: () => 2_000, sleep: async () => {} });
    await expect(blocked.priceInfo([{ chain: "bsc", address: "0xdef0000000" }])).rejects.toMatchObject({ kind: "rate_limited" });
    expect(limited).toHaveBeenCalledTimes(2);
    await expect(blocked.priceInfo([{ chain: "bsc", address: "0xdef0000001" }])).rejects.toMatchObject({ kind: "circuit_open" });
  });

  it("paginates a full 1 minute history window instead of initializing with a short tail", async () => {
    const row = (second: number) => [String(second * 1000), "1", "2", "0.5", "1.5", "6", "9", "1"];
    const newest = Array.from({ length: 299 }, (_, index) => row(1_000 + index));
    const older = Array.from({ length: 181 }, (_, index) => row(819 + index));
    const fetcher = vi.fn(async (input: string | URL | Request) => new Response(JSON.stringify({ code: "0", data: String(input).includes("after=") ? older : newest }), { status: 200 }));
    const client = new OkxMarketClient(credentials, { fetcher, now: () => 1_000, sleep: async () => {} });
    const first = await client.candles("sol", "SoLExact", 1, 480);
    const cached = await client.candles("sol", "SoLExact", 1, 480);
    expect(first.value).toHaveLength(480);
    expect(first.value[0].time).toBe(819);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(cached.value).toHaveLength(480);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
