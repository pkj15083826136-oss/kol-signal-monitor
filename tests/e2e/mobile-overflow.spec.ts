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
  const response = await request.post("/api/market/batch", { data: { tokens: [{ chain: "sol", address: BONK_MINT }] } });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json() as { items: Array<{ address: string; source: string; price: number; marketCap: number; liquidity: number; volume24h: number }> };
  expect(payload.items).toHaveLength(1);
  expect(payload.items[0].address).toBe(BONK_MINT);
  expect(payload.items[0].source).not.toBe("unavailable");
  expect(payload.items[0].price).toBeGreaterThan(0);
  expect(payload.items[0].marketCap).toBeGreaterThan(0);
  expect(payload.items[0].liquidity).toBeGreaterThan(0);
  expect(payload.items[0].volume24h).toBeGreaterThan(0);

  const signals = await (await request.get("/api/signals")).json() as { signals: Array<{ id: number; tokenAddress: string }> };
  const bonk = signals.signals.find((signal) => signal.tokenAddress === BONK_MINT)!;
  let batchRequests = 0;
  page.on("request", (req) => { if (req.url().includes("/api/market/batch")) batchRequests += 1; });
  await page.goto(`/signal/${bonk.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7_200);
  expect(batchRequests).toBeGreaterThanOrEqual(3);
  await expect(page.getByRole("img", { name: "15分钟K线图" })).toBeVisible();
  await page.getByRole("button", { name: "5分钟" }).click();
  await expect(page.getByRole("img", { name: "5分钟K线图" })).toBeVisible();
  await expect(page.getByText("数据源不可用")).toHaveCount(0);
});
