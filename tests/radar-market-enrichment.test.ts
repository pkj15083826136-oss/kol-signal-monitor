import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collectorDisplayState } from "@/lib/radar/learning";
import { chooseAvatar, dexRegistryFor, extractActivity, extractPoolCandidates, extractTokenCreatedAt, fieldState, leadTimingFromScore, marketConflict, normalizePropagationStage, safeAvatarUrl, selectPrimaryPool, tradeDataStage, validAvatarContentType } from "@/lib/radar/enrichment";
import { publicCollectorStatus, publicEnrichmentStatus } from "@/lib/radar/public-status";
import { parseOkxTokenSearch } from "@/lib/providers/okx";

const now = Date.parse("2026-09-24T10:00:00.000Z");

describe("radar market enrichment and source status", () => {
  it("separates collector lifecycle states", () => {
    expect(collectorDisplayState(null, now)).toBe("NOT_STARTED");
    expect(collectorDisplayState({ login_status: "expired", last_heartbeat_at: "2026-09-24T09:59:00Z" }, now)).toBe("LOGIN_REQUIRED");
    expect(collectorDisplayState({ login_status: "ok", connection_status: "connected", websocket_status: "connected", last_heartbeat_at: "2026-09-24T09:59:00Z" }, now)).toBe("CONNECTED");
    expect(collectorDisplayState({ login_status: "ok", connection_status: "connected", websocket_status: "idle", last_heartbeat_at: "2026-09-24T09:59:00Z" }, now)).toBe("IDLE");
    expect(collectorDisplayState({ login_status: "ok", connection_status: "connected", last_heartbeat_at: "2026-09-24T09:40:00Z" }, now)).toBe("STALE");
    expect(collectorDisplayState({ login_status: "ok", connection_status: "error", last_heartbeat_at: "2026-09-24T09:59:00Z", last_error: "closed" }, now)).toBe("COLLECTOR_ERROR");
  });

  it("accepts only allowlisted https avatar URLs and raster MIME types", () => {
    expect(safeAvatarUrl("https://static.okx.com/a.png")).toContain("static.okx.com");
    expect(safeAvatarUrl("javascript:alert(1)")).toBeNull();
    expect(safeAvatarUrl("https://evil.example/a.png")).toBeNull();
    expect(validAvatarContentType("image/png; charset=binary")).toBe(true);
    expect(validAvatarContentType("image/svg+xml")).toBe(false);
  });

  it("uses Ave, GMGN, OKX then identicon avatar priority", () => {
    expect(chooseAvatar({ ave: { logo: "https://assets.ave.ai/a.png" }, gmgn: { logo: "https://gmgn.ai/b.png" }, chain: "bsc", address: "0x1" }).avatar_source).toBe("ave");
    expect(chooseAvatar({ ave: {}, gmgn: { logo: "https://gmgn.ai/b.png" }, chain: "bsc", address: "0x1" }).avatar_source).toBe("gmgn");
    expect(chooseAvatar({ okx: { logoUrl: "https://static.okx.com/c.webp" }, chain: "bsc", address: "0x1" }).avatar_source).toBe("okx");
    expect(chooseAvatar({ chain: "bsc", address: "0x1" }).avatar_source).toBe("identicon");
  });

  it("keeps exact DEX aliases and never treats a label as a pair address", () => {
    expect(dexRegistryFor("bsc", "cakev2").map((row) => row.dexId)).toEqual(["cakev2"]);
    expect(dexRegistryFor("bsc", "pancake-clamm").map((row) => row.dexId)).toEqual(["pancakev3"]);
    expect(extractPoolCandidates([{ source: "ave", payload: { pair_address: "cakev2" } }], "bsc", "0x0000000000000000000000000000000000000001")).toEqual([]);
  });

  it("requires token/pair relation before provider pool verification", () => {
    const token = "0x0000000000000000000000000000000000000001"; const pair = "0x0000000000000000000000000000000000000002";
    const unverified = extractPoolCandidates([{ source: "gmgn", payload: { pair_address: pair, liquidity: 1000 } }], "bsc", token);
    const verified = extractPoolCandidates([{ source: "gmgn", payload: { pair_address: pair, token0: token, token1: "0x0000000000000000000000000000000000000003", liquidity: 1000 } }], "bsc", token);
    expect(unverified[0].status).toBe("DISCOVERED"); expect(verified[0].status).toBe("VERIFIED"); expect(selectPrimaryPool(unverified)).toBeNull(); expect(selectPrimaryPool(verified)?.pairAddress).toBe(pair);
  });

  it("does not overwrite verified field state with missing data", () => {
    const verified = fieldState("VERIFIED", 123, { source: "gmgn" }); const missing = fieldState<number>("UNAVAILABLE", null);
    expect(missing.value ?? verified.value).toBe(123);
  });

  it("detects market conflicts and distinguishes activity semantics", () => {
    expect(marketConflict([100, 151])).toBe(true); expect(marketConflict([100, 130])).toBe(false);
    expect(extractActivity([{ buyers_24h: "8", sellers_24h: 5, buy_tx_24h: 20, sell_tx_24h: 11 }])).toEqual({ uniqueBuyers24h: 8, uniqueSellers24h: 5, buyTx24h: 20, sellTx24h: 11 });
  });

  it("keeps token creation time separate from pool time", () => {
    expect(extractTokenCreatedAt([{ token_create_time: "2026-09-01T00:00:00Z", pair_create_time: "2026-09-23T00:00:00Z" }])).toBe("2026-09-01T00:00:00.000Z");
  });

  it("uses canonical propagation and lead enums", () => {
    expect(normalizePropagationStage("萌芽", "COMPLETED", 2)).toBe("EMERGING"); expect(normalizePropagationStage("unknown", "COMPLETED", 0)).toBe("NO_PROPAGATION_EVIDENCE"); expect(normalizePropagationStage("扩散", "FAILED", 2)).toBe("ANALYSIS_FAILED");
    expect(leadTimingFromScore(90, "COMPLETED", 2)).toBe("VERY_EARLY"); expect(leadTimingFromScore(null, "COMPLETED", 2)).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("advances deterministic trade-data stages without implying executable trade", () => {
    expect(tradeDataStage({ pairDiscovered: false, pairVerified: false, liquidityVerified: false, buyRouteVerified: false, sellRouteVerified: false, quoteBandsReady: 0 })).toBe("PAIR_DISCOVERY_PENDING");
    expect(tradeDataStage({ pairDiscovered: true, pairVerified: true, liquidityVerified: true, buyRouteVerified: true, sellRouteVerified: true, quoteBandsReady: 4 })).toBe("TRADE_DATA_READY");
  });

  it("parses OKX token search without using premium price-info", () => {
    expect(parseOkxTokenSearch({ code: "0", data: [{ tokenContractAddress: "0x1", logoUrl: "https://static.okx.com/a.png" }] })).toHaveLength(1);
    const source = readFileSync("lib/radar/enrichment.ts", "utf8"); expect(source).toContain("tokenSearch("); expect(source).not.toContain("priceInfo(");
  });

  it("keeps enrichment read-only and feature-gated", () => {
    const source = readFileSync("app/api/radar/enrich/route.ts", "utf8"); expect(source).toContain("FEATURE_RADAR_READONLY_ENRICHMENT"); expect(source).not.toMatch(/sendTransaction|writeContract|signTransaction|privateKey|mnemonic/);
    const collector = readFileSync("app/api/radar/collect/route.ts", "utf8"); expect(collector).toContain("PARSE_FAILED"); expect(collector).toContain("DUPLICATE");
    const runner = readFileSync("scripts/run-radar-enrichment.mjs", "utf8"); expect(runner).toContain("limit: 5"); expect(runner).not.toMatch(/GMGN_API_KEY|price-info|privateKey|signedTransaction/);
  });

  it("maps internal collector and provider states to safe Chinese copy", () => {
    expect(publicCollectorStatus("CONNECTED")).toBe("运行正常");
    expect(publicCollectorStatus("IDLE")).toBe("暂无新信号");
    expect(publicCollectorStatus("STALE")).toBe("连接中断");
    expect(publicCollectorStatus("LOGIN_REQUIRED")).toBe("需要登录");
    expect(publicEnrichmentStatus("RATE_LIMITED")).toBe("数据更新中");
    expect(publicEnrichmentStatus("IP_TEMPORARILY_BANNED")).toBe("数据源暂时繁忙");
    expect(publicEnrichmentStatus("RPC_ERROR")).toBe("链上数据暂不可用");
  });

  it("keeps internal enrichment diagnostics out of the public radar card", () => {
    const source = readFileSync("app/radar/radar-dashboard.tsx", "utf8");
    expect(source).not.toContain("头像 {row.avatarStatus}");
    expect(source).not.toContain("补全 {row.enrichmentStatus}");
    expect(source).not.toContain("补全原因：{row.enrichmentError}");
    expect(source).not.toContain('label="Pair / 流动性"');
    expect(source).not.toContain('label="Token年龄"');
    expect(source).toContain("publicCollectorStatus");
  });

  it("captures Ave avatars before provider enrichment and keeps uploads durable", () => {
    const collector = readFileSync("scripts/ave-smart-collector.mjs", "utf8");
    const ingest = readFileSync("app/api/radar/collect/route.ts", "utf8");
    expect(collector).toContain("avatar_url");
    expect(collector).toContain("upload-queue.json");
    expect(collector).toContain("appendFile");
    expect(collector).toContain("30_000");
    expect(collector).toContain("timeout: 45_000");
    expect(ingest).toContain("persistAveSignalAvatar");
  });

  it("opens a GMGN provider cooldown after rate limiting or a temporary IP ban", () => {
    const source = readFileSync("lib/gmgn.ts", "utf8");
    expect(source).toContain("readProviderCooldown");
    expect(source).toContain("storeProviderCooldown");
    expect(source).toContain("IP_TEMPORARILY_BANNED");
    expect(source).not.toContain("response.json()) as");
  });

  it("ships a single-instance Windows supervisor with automatic restart", () => {
    const supervisor = readFileSync("scripts/run-ave-smart-supervisor.ps1", "utf8");
    const installer = readFileSync("scripts/install-ave-smart-autostart.ps1", "utf8");
    expect(supervisor).toContain("ave-supervisor.pid");
    expect(supervisor).toContain("ave-supervisor.lock");
    expect(supervisor).toContain("ave-supervisor.log");
    expect(supervisor).toContain("Stop-StaleCollectorBrowsers");
    expect(supervisor).toContain("ProtectedData]::Unprotect");
    expect(supervisor).not.toContain("ConvertTo-SecureString");
    expect(supervisor).toContain("Start-Process");
    expect(supervisor).toContain("-WindowStyle Hidden");
    expect(supervisor).not.toContain("-NoNewWindow");
    expect(installer).toContain("Get-Command node");
    expect(installer).toContain("-NodePath");
    expect(installer).toContain("-StateRoot");
    expect(installer).toContain("ave-task-launcher.ps1");
    expect(installer).toContain("-Encoding Unicode");
    expect(installer).toContain("CurrentVersion\\Run");
    expect(installer).toContain("KOLSignalMonitorAveSmart");
    expect(installer).toContain("Unregister-ScheduledTask");
  });
});
