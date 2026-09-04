import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("navigates between all pages", async ({ page }) => {
    await page.goto("/resumes", { waitUntil: "networkidle" });

    // Resume list
    await expect(page.getByRole("heading", { name: "我的简历", exact: true })).toBeVisible({ timeout: 10000 });

    // JD Analysis（输入表单默认折叠，需展开）
    await page.getByRole("link", { name: "JD 分析" }).click();
    await expect(page.getByRole("heading", { name: "JD 分析", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "+ 新建分析" }).click();
    await expect(page.getByPlaceholder("公司名称（选填）")).toBeVisible();

    // Skill Library
    await page.getByRole("link", { name: "技能库" }).click();
    await expect(page.getByRole("heading", { name: "技能库", exact: true })).toBeVisible();

    // Back to resume list
    await page.getByRole("link", { name: "简历管理" }).click();
    await expect(page.getByRole("heading", { name: "我的简历", exact: true })).toBeVisible();
  });
});
