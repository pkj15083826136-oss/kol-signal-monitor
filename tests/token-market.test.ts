import { describe, expect, it } from "vitest";
import hypeAve from "./fixtures/hype-ave.json";
import { parseAveToken, parseGmgnToken, resolveTokenMarket, tokenAddressEquals } from "@/lib/token-market";

const address = "98sMhvDwXj1RQj5c5Mndm3vPe9cBqPrbLaufMXFNMh5g";

describe("token-level market normalization", () => {
  it("parses HYPE market cap above $20M and holders as a positive integer", () => {
    const parsed = parseAveToken(hypeAve, "sol", address)!;
    expect(parsed.marketCap).toBeGreaterThan(20_000_000);
    expect(parsed.holderCount).toBe(51_970);
    expect(parsed.identityVerified).toBe(true);
  });

  it("never treats pair liquidity or pair market cap as token market cap", () => {
    const parsed = parseAveToken({ data: { token: { token: address, chain: "solana", current_price_usd: "92", tvl: "3380000" }, pairs: [{ market_cap: 101000, liquidity: 2600000 }] } }, "sol", address)!;
    const resolved = resolveTokenMarket([parsed]);
    expect(resolved.marketCap).toBeNull();
    expect(resolved.liquidity).toBe(3_380_000);
  });

  it("does not let empty values overwrite valid market cap or holders", () => {
    const ave = parseAveToken(hypeAve, "sol", address)!;
    const gmgn = parseGmgnToken({ data: { token: { address, chain: "sol", market_cap: null, holders: null } } }, "sol", address)!;
    const result = resolveTokenMarket([ave, gmgn]);
    expect(result.marketCap).toBe(65_320_000);
    expect(result.holderCount).toBe(51_970);
  });

  it("marks verified source market caps differing by more than 3x", () => {
    const ave = parseAveToken(hypeAve, "sol", address)!;
    const gmgn = parseGmgnToken({ data: { token: { address, chain: "sol", market_cap: 10_000_000 } } }, "sol", address)!;
    const result = resolveTokenMarket([ave, gmgn]);
    expect(result.marketDataConflict).toBe(true);
    expect(result.filterMarketCap).toBe(65_320_000);
  });

  it.each([
    ["sol", { data: { token: { token: address, chain: "solana", holders: "51970" } } }, 51970],
    ["bsc", { data: { token: { address: "0xabc", chain: "bsc", holder_count: "1200" } } }, 1200],
    ["base", { data: { token: { address: "0xabc", chain: "base", holders_count: 333 } } }, 333],
    ["robinhood", { data: { token: { address: "0xabc", chain: "robinhood", holder_count: 12 } } }, 12],
  ])("parses %s holder fields", (chain, payload, expected) => {
    const expectedAddress = chain === "sol" ? address : "0xabc";
    const parsed = chain === "sol" ? parseAveToken(payload, chain, expectedAddress) : parseGmgnToken(payload, chain, expectedAddress);
    expect(parsed?.holderCount).toBe(expected);
  });
  it("keeps Solana addresses case-sensitive while normalizing EVM addresses", () => {
    expect(tokenAddressEquals("sol", "AbCi", "AbCJ")).toBe(false);
    expect(tokenAddressEquals("base", "0xAbC", "0xabc")).toBe(true);
  });
});
