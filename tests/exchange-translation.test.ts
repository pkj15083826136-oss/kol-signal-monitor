import { describe, expect, it, vi } from "vitest";
import { deterministicExchangeTitle, translateExchangeTitle } from "@/lib/exchange-translation";

describe("exchange title translation", () => {
  it("translates standard Alpha removal titles without changing symbols or dates", () => {
    expect(deterministicExchangeTitle("Binance Alpha Will Remove MTP, BDXN, TALE and BOS (2026-09-04)"))
      .toBe("Binance Alpha 将移除 MTP、BDXN、TALE、BOS (2026-09-04)");
  });

  it("translates common listing and delisting templates deterministically", () => {
    expect(deterministicExchangeTitle("TREAD is available for trading!")).toBe("TREAD 已开放交易！");
    expect(deterministicExchangeTitle("Notice of Removal of Spot Trading Pairs - 2026-09-25")).toBe("现货交易对下架公告 - 2026-09-25");
    expect(deterministicExchangeTitle("Binance Will List HYPE with Seed Tag Applied")).toBe("Binance 将上线 HYPE 并添加种子标签");
  });

  it("localizes standard contract and launchpool wording without changing pairs", () => {
    expect(deterministicExchangeTitle("HTX Launches NIL/USDT and POLYMARKET/USDT Perpetual Futures")).toBe("HTX 上线 NIL/USDT 和 POLYMARKET/USDT 永续合约");
    expect(deterministicExchangeTitle("Gate Launchpool Project Tether Gold or USDT")).toBe("Gate Launchpool 项目 Tether Gold 或 USDT");
    expect(deterministicExchangeTitle("[Important] Bitget to delist STGUSDT futures and related services")).toBe("[重要] Bitget 将下架 STGUSDT 合约及相关服务");
    expect(deterministicExchangeTitle("Binance Exchange Adds CEA Industries (BNCB) bStocks Trading Pair on Binance Spot/Convert - 2026-09-14")).toBe("Binance 交易所新增 CEA Industries (BNCB) bStocks 交易对至 Binance 现货/闪兑 - 2026-09-14");
    expect(deterministicExchangeTitle("Binance Will List 牛来 (牛来) with Seed Tag Applied")).toBe("Binance 将上线 牛来 (牛来) 并添加种子标签");
    expect(deterministicExchangeTitle("[Important] Bitget Announcement on Listing QLDUSDT and CLSKUSDT Stock Perps")).toBe("[重要] Bitget 上线公告： QLDUSDT 和 CLSKUSDT 股票永续合约");
    expect(deterministicExchangeTitle("Notice on New Trading Pairs & Trading Bots Services on Binance Spot - 2026-09-22")).toBe("公告： 新增交易对及交易机器人服务至 Binance 现货 - 2026-09-22");
    expect(deterministicExchangeTitle("Binance Will Close UAH Deposits and Withdrawals via Fiat Trade UAH and Delist USDT/UAH Spot Trading Pair")).toBe("Binance 将停止 UAH 充值和提现通过法币交易 UAH 并下架 USDT/UAH 现货交易对");
  });

  it("keeps already-Chinese titles and leaves unknown text pending while paid translation is disabled", async () => {
    expect(deterministicExchangeTitle("MEXC 已实际停止 BUN-USDT 合约")).toBe("MEXC 已实际停止 BUN-USDT 合约");
    const result = await translateExchangeTitle({ title: "An unfamiliar announcement phrase", exchange: "coinbase" });
    expect(result).toMatchObject({ titleZh: null, status: "pending", provider: null, charCount: 0 });
  });

  it("enforces the monthly character ceiling before calling Google", async () => {
    const request = vi.spyOn(globalThis, "fetch");
    const result = await translateExchangeTitle({ title: "An unfamiliar announcement phrase", exchange: "coinbase", googleEnabled: true, googleApiKey: "test", monthlyCharactersUsed: 449_990, monthlyCharacterLimit: 450_000 });
    expect(result).toMatchObject({ titleZh: null, status: "pending", provider: "google", error: "monthly_character_limit" });
    expect(request).not.toHaveBeenCalled();
    request.mockRestore();
  });

  it("rejects a machine translation that changes protected symbols", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { translations: [{ translatedText: "某资产现已上线" }] } }), { status: 200 }));
    const result = await translateExchangeTitle({ title: "XYZQ receives support today", exchange: "coinbase", googleEnabled: true, googleApiKey: "test" });
    expect(result).toMatchObject({ titleZh: null, status: "error", error: "protected_fragment_mismatch", charCount: 0 });
    request.mockRestore();
  });
});
