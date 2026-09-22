import { expect, test } from "@playwright/test";

test("radar navigation and disabled wallet remain operable", async ({ page }) => {
  await page.goto("/radar");
  await expect(page.getByRole("button", { name: "返回 KOL Signal" })).toBeVisible();
  await expect(page.getByText("钱包与自动交易尚未启用，当前仅模拟交易")).toBeHidden();
  await page.getByRole("button", { name: "返回 KOL Signal" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("钱包未启用")).toBeVisible();
  await page.getByRole("link", { name: /土狗雷达/ }).click();
  await expect(page).toHaveURL(/\/radar$/);
});

for (const viewport of [{ width: 375, height: 812 }, { width: 390, height: 844 }]) {
  test(`radar has no horizontal overflow at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport); await page.goto("/radar");
    const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  });
}
