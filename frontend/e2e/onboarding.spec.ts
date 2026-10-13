import { test, expect } from "@playwright/test";

// 首访导览：全新 localStorage（Playwright 默认每个 test 一个干净 context）→ 落地页自动弹一次
test.describe("First-visit onboarding tour", () => {
  test("shows once, then never again", async ({ page }) => {
    await page.goto("/resumes", { waitUntil: "networkidle" });

    await expect(page.locator(".driver-popover-title")).toHaveText("欢迎使用 Resume Pro", { timeout: 10000 });

    // 跳过 = 也算看过（driver.js 的 onDestroyed 只在关闭时触发一次）
    await page.locator(".driver-popover-close-btn").click();
    expect(await page.evaluate(() => localStorage.getItem("onboarding__tour_seen"))).toBe("1");

    // 刷新后不再弹。AppTour 有 400ms 延迟，等够时间再断言为 0 ——
    // 否则「还没弹」会被误当成「不弹了」
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    await expect(page.locator(".driver-popover")).toHaveCount(0);
  });
});
