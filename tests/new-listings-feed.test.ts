import { describe, expect, it } from "vitest";
import { normalizeNewListingsFeed, normalizeNewListingsFeedBatch } from "@/lib/new-listings-feed";

describe("New Listings Feed v2/full contract", () => {
  it("normalizes Coinbase discovery while preserving third-party timing", () => {
    const event = normalizeNewListingsFeed({
      id: 10,
      type: "tweet",
      url: "https://x.com/CoinbaseMarkets/status/10",
      content: { text: "Coinbase will add support for BLUECHIP. Trading will begin later today." },
      parser: { exchange: "coinbase", classification: { event: "listing", type: "spot", category: "crypto" }, assets: [{ symbol: "BLUECHIP" }], display: "$BLUECHIP listed on Coinbase spot" },
      detected_time_us: 1789574043308603,
      sent_time_us: 1789574046308603,
    });
    expect(event).toMatchObject({ exchange: "coinbase", eventType: "first_spot_listing", marketType: "spot", assets: ["BLUECHIP"], pairs: ["BLUECHIP-USD"], sourceUrl: "https://x.com/CoinbaseMarkets/status/10" });
    expect(Date.parse(event!.sentAt!) - Date.parse(event!.detectedAt!)).toBe(3000);
  });

  it("keeps Upbit quote markets independent and rejects unsupported exchanges", () => {
    const upbit = { type: "announcement", url: "https://upbit.com/service_center/notice?id=1", content: { title: "테스트(TEST) 신규 거래지원 안내 (KRW, USDT 마켓)" }, parser: { exchange: "upbit", classification: { event: "listing", type: "spot", category: "crypto", markets: ["krw", "usdt"] }, assets: [{ symbol: "TEST" }] } };
    expect(normalizeNewListingsFeed(upbit)?.pairs).toEqual(["KRW-TEST", "USDT-TEST"]);
    expect(normalizeNewListingsFeedBatch([upbit, { ...upbit, parser: { ...upbit.parser, exchange: "binance" } }])).toHaveLength(1);
  });

  it("does not accept malformed source links or unclassified content", () => {
    expect(normalizeNewListingsFeed({ url: "javascript:alert(1)", parser: { exchange: "coinbase", classification: { event: "listing", type: "spot" }, display: "ABC listing" } })).toBeNull();
    expect(normalizeNewListingsFeed({ url: "https://example.com", parser: { exchange: "upbit", classification: { event: "listing", type: "spot" }, display: "ABC listed" } })).toBeNull();
    expect(normalizeNewListingsFeed({ url: "https://x.com/CoinbaseMarkets/status/2", parser: { exchange: "coinbase", classification: { event: "listing", type: "roadmap" }, display: "ABC added to roadmap" } })).toBeNull();
  });
});
