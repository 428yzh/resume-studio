import { test, expect } from "@playwright/test";

const API = "http://localhost:8001";

test.describe("Resume CRUD", () => {
  const createdIds: number[] = [];

  test.afterEach(async () => {
    for (const id of createdIds) {
      try {
        await fetch(`${API}/api/resumes/${id}`, { method: "DELETE" });
      } catch {
        // ignore cleanup errors
      }
    }
    createdIds.length = 0;
  });

  test("creates a new resume", async ({ page }) => {
    const title = `E2E-简历-${Date.now()}`;

    await page.goto("/resumes", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "新建简历" }).first().click();
    await expect(page.locator('input[placeholder="简历名称"]')).toBeVisible({ timeout: 5000 });
    await page.locator('input[placeholder="简历名称"]').fill(title);
    await page.locator('input[placeholder="例如：高级前端工程师"]').fill("前端工程师");
    await page.locator("textarea").first().fill("负责公司前端项目的开发和维护");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("保存成功")).toBeVisible({ timeout: 5000 });

    // Extract resume ID from URL for API cleanup
    const url = page.url();
    const match = url.match(/\/resumes\/(\d+)/);
    if (match) createdIds.push(Number(match[1]));
  });

  test("displays resume in list and deletes it", async ({ page }) => {
    const title = `E2E-删除-${Date.now()}`;

    // Create a resume via API
    const res = await fetch(`${API}/api/resumes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const resume = await res.json();
    createdIds.push(resume.id);

    // Verify it shows in the list
    await page.goto("/resumes", { waitUntil: "networkidle" });
    const card = page.locator(`//h3[contains(text(),"${title}")]/../..`);
    await expect(card).toBeVisible({ timeout: 5000 });

    // Delete via UI（需确认弹窗）。等 DELETE 真的返回，别只断言卡片没了 ——
    // 卡片可能只是重渲染瞬间不在，断言立刻通过、用例结束，在途请求被掐断，数据留在库里
    const deleted = page.waitForResponse(
      (r) => r.url().includes(`/api/resumes/${resume.id}`) && r.request().method() === "DELETE",
      { timeout: 5000 },
    );
    await card.getByRole("button", { name: "删除" }).click({ force: true });
    await page.getByRole("button", { name: "确认删除" }).click();
    expect((await deleted).status()).toBe(204);
    await expect(card).not.toBeVisible({ timeout: 5000 });

    // API cleanup: remove from tracking since UI delete succeeded
    const idx = createdIds.indexOf(resume.id);
    if (idx > -1) createdIds.splice(idx, 1);
  });
});
