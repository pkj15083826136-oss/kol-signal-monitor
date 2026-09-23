import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { radarAiFallback } from "@/lib/radar/ai";
import { AveSmartEventBuffer } from "@/lib/radar/adapters/ave-smart-browser";
import { hardFilter } from "@/lib/radar/policy";
import type { RadarCandidate } from "@/lib/radar/types";

function incompleteCandidate(): RadarCandidate {
  return {
    source: "ave_smart_browser",
    sourceEventId: "harvest-1",
    chain: "bsc",
    tokenAddress: "0x542bc840e65b199428c36042d27a0f3c69127777",
    pairAddress: null,
    name: "项目源于Harvest农场游戏与多版本社区叙事",
    symbol: "HARVEST",
    firstSeenAt: "2026-09-22T09:46:50.000Z",
    poolCreatedAt: null,
    price: "0.00022162",
    marketCap: 221_620,
    liquidity: null,
    volume24h: 223_265,
    holders: 566,
    buyers: null,
    sellers: null,
    smartMoneyCount: 3,
    dataFetchedAt: "2026-09-22T09:46:51.000Z",
    identityVerified: false,
    sellSimulationPassed: null,
    honeypot: null,
    mintable: null,
    freezable: null,
    blacklistable: null,
    taxModifiable: null,
    buyTaxBps: null,
    sellTaxBps: null,
    lpLocked: null,
    topHolderPct: null,
    developerRisk: "unknown",
    priceImpactBps: null,
    sourceConflict: false,
    rawSnapshot: {},
  };
}

describe("radar narrative and trade integrity regressions", () => {
  it("does not encode an unrun narrative review as a real zero score", () => {
    expect(radarAiFallback().narrative_score).toBeNull();
  });

  it("does not put Ave DEX labels into pairAddress", () => {
    const [candidate] = new AveSmartEventBuffer().ingest([{
      id: "harvest-1",
      chain: "bsc",
      token: "0x542bc840e65b199428c36042d27a0f3c69127777",
      amm: "cakev2",
      symbol: "HARVEST",
    }], "2026-09-22T09:46:51.000Z");
    expect(candidate.pairAddress).toBeNull();
    expect(candidate.dexId).toBe("cakev2");
  });

  it("keeps missing trade evidence UNKNOWN instead of claiming verified failures", () => {
    const result = hardFilter(incompleteCandidate(), undefined, Date.parse("2026-09-22T09:46:52.000Z"));
    expect(result.status).toBe("UNKNOWN");
    expect(result.reasons.join(" ")).not.toMatch(/疑似貔貅|税异常|流动性不足|开发者历史风险/);
  });

  it("runs narrative analysis even when trade eligibility is blocked or incomplete", () => {
    const source = readFileSync(new URL("../app/api/radar/collect/route.ts", import.meta.url), "utf8");
    expect(source).not.toContain("gate.passed ? await reviewRadarCandidate");
    expect(source).toContain("reviewRadarCandidate(frozenCandidate");
  });

  it("does not coerce nullable narrative scores to zero in the API view", () => {
    const source = readFileSync(new URL("../lib/radar/view.ts", import.meta.url), "utf8");
    expect(source).not.toContain("narrativeScore: Number(row.narrative_score || 0)");
  });

  it("keeps detailed risk and evidence sections collapsed by default", () => {
    const source = readFileSync(new URL("../app/radar/radar-dashboard.tsx", import.meta.url), "utf8");
    for (const label of ["查看交易检查", "查看风险评论", "查看叙事证据", "查看原始数据"]) {
      expect(source).toContain(label);
    }
  });
});
