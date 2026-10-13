import { test, expect } from "@playwright/test";

const API = "http://localhost:8001";

test.describe("Resume CRUD", () => {
  const createdIds: number[] = [];

  // 首访导览会在落地页 /resumes 自动弹出并盖住界面，先种上「已看过」标记（导览本身见 onboarding.spec.ts）
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("onboarding__tour_seen", "1"));
  });

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

  test("moves a section and persists the new order", async ({ page }) => {
    const title = `E2E-区块移动-${Date.now()}`;

    const res = await fetch(`${API}/api/resumes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        sections: {
          header: { name: "E2E", email: "", phone: "", location: "", title: "" },
          experience: [{ id: "1", company: "A 公司", position: "前端", start_date: "", end_date: "", current: false, description: "d" }],
          education: [{ id: "2", school: "S 大学", degree: "本科", major: "CS", start_date: "", end_date: "" }],
        },
      }),
    });
    const resume = await res.json();
    createdIds.push(resume.id);

    await page.goto(`/resumes/${resume.id}`, { waitUntil: "networkidle" });

    const cardTitles = () => page.locator("label.font-semibold.text-sm.text-ink").allTextContents();
    await expect(page.locator("label.font-semibold.text-sm.text-ink").first()).toBeVisible({ timeout: 5000 });
    const before = await cardTitles();
    const eduAt = before.indexOf("教育背景");
    expect(before.indexOf("工作经历")).toBeGreaterThan(-1);
    expect(eduAt).toBe(before.indexOf("工作经历") + 1); // 模板默认：教育背景紧跟工作经历

    // 「教育背景」上移一格（按钮 hover 才显形，同「删除」用 force）
    const eduCard = page.locator("div.group").filter({ has: page.getByText("教育背景", { exact: true }) }).first();
    await eduCard.getByRole("button", { name: "上移教育背景" }).click({ force: true });
    const after = await cardTitles();
    expect(after.indexOf("教育背景")).toBe(eduAt - 1);

    // 保存 → 刷新后顺序仍在（证明存进了 sections JSON，不是前端临时态）
    const saved = page.waitForResponse(
      (r) => r.url().includes(`/api/resumes/${resume.id}`) && r.request().method() === "PUT",
    );
    await page.getByRole("button", { name: "保存" }).click();
    expect((await saved).status()).toBe(200);
    await expect(page.getByText("保存成功")).toBeVisible({ timeout: 5000 });

    // allTextContents 不等待 —— 刷新后 React 还没渲染就读会读到空数组，用 poll 等它出来
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(() => cardTitles()).toEqual(after);
  });
});
