import { expect, test, type Page } from "@playwright/test";

const BONK_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const evidenceLabel = process.env.E2E_EVIDENCE_LABEL || "local";
const productionEvidence = process.env.E2E_REQUIRE_REAL_MARKET === "1";

type Signal = { id: number; tokenAddress: string; symbol: string; createdAt: string };

async function signalForDetail(page: Page) {
  const response = await page.request.get("/api/signals");
  expect(response.ok()).toBeTruthy();
  const payload = await response.json() as { signals: Signal[] };
  const signal = productionEvidence ? payload.signals.find((item) => item.tokenAddress === BONK_MINT) : payload.signals[0];
  expect(signal, productionEvidence ? "production data must include the verified BONK mint" : "a signal is required").toBeTruthy();
  return { signal: signal!, signals: payload.signals };
}

async function overflowReport(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const offenders = [...document.querySelectorAll<HTMLElement>("main, main section, main aside, main article, main > div, [data-testid='live-market-grid'], [data-testid='live-market-grid'] > div")]
      .filter((element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && (rect.left < -1 || rect.right > root.clientWidth + 1); })
      .map((element) => ({ tag: element.tagName, className: element.className, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right }));
    return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, offenders };
  });
}

for (const viewport of [{ width: 375, height: 812 }, { width: 390, height: 844 }]) {
  test(`list and detail fit ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const { signal } = await signalForDetail(page);
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    let overflow = await overflowReport(page);
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    expect(overflow.offenders).toEqual([]);
    if (viewport.width === 390) await page.screenshot({ path: `docs/screenshots/${evidenceLabel}-list-mobile-390x844.png`, fullPage: true });

    await page.goto(`/signal/${signal.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: signal.symbol })).toBeVisible();
    await expect(page.getByText(signal.tokenAddress)).toBeVisible();
    await expect(page.getByTestId("live-market-grid")).toBeVisible();
    if (productionEvidence) await expect(page.getByTestId("live-market-grid").locator(":scope > div").first().locator("div").nth(1)).not.toHaveText("--", { timeout: 20_000 });
    overflow = await overflowReport(page);
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    expect(overflow.offenders).toEqual([]);
    if (viewport.width === 390) await page.screenshot({ path: `docs/screenshots/${evidenceLabel}-detail-mobile-390x844.png`, fullPage: true });
  });
}

test("desktop screenshots, relative signal time, navigation fallback and cached Kline periods", async ({ page, context }) => {
  const { signal, signals } = await signalForDetail(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("价格", { exact: true })).toHaveCount(0);
  if (signals.length > 1 && signals[0].createdAt !== signals[1].createdAt) {
    const timeCells = page.getByText(/刚刚|分钟前|小时前|天前|\d{4}-\d{2}-\d{2}/);
    expect(new Set(await timeCells.allTextContents()).size).toBeGreaterThan(1);
  }
  await page.screenshot({ path: `docs/screenshots/${evidenceLabel}-list-desktop-1440x1000.png`, fullPage: true });
  await page.getByRole("link", { name: `查看 ${signal.symbol} 详情` }).first().click();
  await expect(page).toHaveURL(new RegExp(`/signal/${signal.id}$`));
  await page.getByRole("link", { name: "返回预警列表" }).click();
  await expect(page).toHaveURL(/\/$/);

  const direct = await context.newPage();
  await direct.goto(`/signal/${signal.id}`, { waitUntil: "domcontentloaded" });
  await direct.screenshot({ path: `docs/screenshots/${evidenceLabel}-detail-desktop-1440x1000.png`, fullPage: true });
  let klineRequests = 0;
  direct.on("request", (request) => { if (request.url().includes("/api/market/kline")) klineRequests += 1; });
  for (const label of ["5分钟", "1小时", "4小时", "1天"]) {
    await direct.getByRole("button", { name: label, exact: true }).click();
    await expect.poll(() => direct.locator("[data-kline-request-count]").getAttribute("data-kline-request-count")).not.toBeNull();
    await expect(direct.getByText(/该链暂不支持此周期|GeckoTerminal|Ave\.ai/).last()).toBeVisible();
  }
  expect(klineRequests).toBe(4);
  await direct.getByRole("button", { name: "5分钟", exact: true }).click();
  expect(klineRequests).toBe(4);
  await direct.evaluate(() => sessionStorage.clear());
  await direct.reload({ waitUntil: "domcontentloaded" });
  await direct.getByRole("link", { name: "返回预警列表" }).click();
  await expect(direct).toHaveURL(/\/$/);
});

test("production BONK uses real market data and refreshes at 3 seconds", async ({ page }) => {
  test.skip(!productionEvidence, "production-only evidence");
  const { signal } = await signalForDetail(page);
  const response = await page.request.post("/api/market/batch", { data: { tokens: [{ chain: "sol", address: BONK_MINT }] } });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json() as { items: Array<{ address: string; source: string; price: number; marketCap: number; liquidity: number; volume24h: number }> };
  expect(payload.items[0]).toMatchObject({ address: BONK_MINT });
  expect(payload.items[0].source).not.toBe("unavailable");
  expect(payload.items[0].price).toBeGreaterThan(0);
  expect(payload.items[0].marketCap).toBeGreaterThan(0);
  expect(payload.items[0].liquidity).toBeGreaterThan(0);
  expect(payload.items[0].volume24h).toBeGreaterThan(0);
  let batchRequests = 0;
  page.on("request", (request) => { if (request.url().includes("/api/market/batch")) batchRequests += 1; });
  await page.goto(`/signal/${signal.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(10_000);
  expect(batchRequests).toBeGreaterThanOrEqual(3);
  await expect(page.getByText("数据源不可用")).toHaveCount(0);
  await expect(page.getByText("Solana", { exact: true })).toBeVisible();
});
