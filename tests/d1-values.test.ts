import { describe, expect, it } from "vitest";
import { SIGNAL_MARKET_UPDATE_SQL, signalMarketUpdateBindings } from "@/lib/d1-values";

function fakeD1Bind(values: unknown[]) {
  const invalid = values.find((value) => value === undefined);
  if (invalid === undefined && values.some((value) => value === undefined)) throw new TypeError("D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'");
}

describe("D1 market update boundary", () => {
  it("reproduces the production bind failure and normalizes the exact missing fields", () => {
    const partial = { name: undefined, symbol: undefined, logo: undefined, description: undefined, marketCap: 0, liquidity: 0, holders: 0, volume24h: 0, price: 0 };
    expect(() => fakeD1Bind([partial.name, partial.symbol, partial.logo, partial.description])).toThrow("D1_TYPE_ERROR");
    const values = signalMarketUpdateBindings(partial, "sol", "mint");
    expect(SIGNAL_MARKET_UPDATE_SQL).toContain("UPDATE signals SET");
    expect(values).not.toContain(undefined);
    expect(() => fakeD1Bind(values)).not.toThrow();
    expect(values.slice(0, 6)).toEqual(["", "", "", "", "", ""]);
  });
});
