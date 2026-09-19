import { expect, test } from "@playwright/test";

const BONK_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const evidenceLabel = process.env.E2E_EVIDENCE_LABEL || "local";

for (const viewport of [{ width: 375, height: 812 }, { width: 390, height: 844 }]) {
  test(`detail fits ${viewport.width}x${viewport.height}`, async ({ page, request }) => {
    const signalsResponse = await request.get("/api/signals");
    expect(signalsResponse.ok()).toBeTruthy();
    const payload = await signalsResponse.json() as { signals: Array<{ id: number; tokenAddress: string; symbol: string }> };
    const bonk = payload.signals.find((signal) => signal.tokenAddress === BONK_MINT);
    expect(bonk, "production data must include the verified BONK mint").toBeTruthy();

    await page.setViewportSize(viewport);
    await page.goto(`/signal/${bonk!.id}`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "BONK" })).toBeVisible();
    await expect(page.getByText(BONK_MINT)).toBeVisible();
    await expect(page.getByTestId("live-market-grid")).toBeVisible();

    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      const offenders = [...document.querySelectorAll<HTMLElement>("main, main section, main aside, main article, main > div, [data-testid='live-market-grid'], [data-testid='live-market-grid'] > div")]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && (rect.left < -1 || rect.right > root.clientWidth + 1);
        })
        .map((element) => ({ tag: element.tagName, className: element.className, rect: element.getBoundingClientRect().toJSON() }));
      return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, offenders };
    });
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    expect(overflow.offenders).toEqual([]);

    await page.screenshot({ path: `docs/screenshots/${evidenceLabel}-mobile-${viewport.width}x${viewport.height}.png`, fullPage: true });
  });
}

test("production BONK uses real batch market data and 3 second polling", async ({ page, request }) => {
  test.skip(process.env.E2E_REQUIRE_REAL_MARKET !== "1", "production-only evidence");
  let payload: { items: Array<{ address: string; source: string; price: number; marketCap: number; liquidity: number; volume24h: number }> } | undefined;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await request.post("/api/market/batch", { data: { tokens: [{ chain: "sol", address: BONK_MINT }] } });
    expect(response.ok()).toBeTruthy();
    payload = await response.json();
    if (payload!.items[0]?.source !== "unavailable") break;
    await page.waitForTimeout(3_000);
  }
  expect(payload).toBeTruthy();
  const livePayload = payload!;
  expect(livePayload.items).toHaveLength(1);
  expect(livePayload.items[0].address).toBe(BONK_MINT);
  expect(livePayload.items[0].source).not.toBe("unavailable");
  expect(livePayload.items[0].price).toBeGreaterThan(0);
  expect(livePayload.items[0].marketCap).toBeGreaterThan(0);
  expect(livePayload.items[0].liquidity).toBeGreaterThan(0);
  expect(livePayload.items[0].volume24h).toBeGreaterThan(0);

  const signals = await (await request.get("/api/signals")).json() as { signals: Array<{ id: number; tokenAddress: string }> };
  const bonk = signals.signals.find((signal) => signal.tokenAddress === BONK_MINT)!;
  let batchRequests = 0;
  await page.addInitScript(() => {
    let simulatedHidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => simulatedHidden });
    Object.defineProperty(window, "__setSimulatedHidden", { value: (value: boolean) => { simulatedHidden = value; document.dispatchEvent(new Event("visibilitychange")); } });
  });
  page.on("request", (req) => { if (req.url().includes("/api/market/batch")) batchRequests += 1; });
  await page.goto(`/signal/${bonk.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(12_500);
  expect(batchRequests).toBeGreaterThanOrEqual(3);
  const visibleCount = batchRequests;
  await page.evaluate(() => (window as unknown as { __setSimulatedHidden(value: boolean): void }).__setSimulatedHidden(true));
  await page.waitForTimeout(4_000);
  expect(batchRequests).toBe(visibleCount);
  await page.evaluate(() => (window as unknown as { __setSimulatedHidden(value: boolean): void }).__setSimulatedHidden(false));
  await expect.poll(() => batchRequests, { timeout: 2_000 }).toBeGreaterThan(visibleCount);
  for (let attempt = 0; attempt < 3 && await page.getByRole("img", { name: "15分钟K线图" }).count() === 0; attempt += 1) await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("img", { name: "15分钟K线图" })).toBeVisible();
  await page.getByRole("button", { name: "5分钟", exact: true }).click();
  await expect(page.getByRole("img", { name: "5分钟K线图" })).toBeVisible();
  await expect(page.getByText("数据源不可用")).toHaveCount(0);
});
