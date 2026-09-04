import { test, expect } from "@playwright/test";

test.describe("JD Analysis", () => {
  test("shows JD analysis page with form elements", async ({ page }) => {
    await page.goto("/jd", { waitUntil: "networkidle" });

    // Page header
    await expect(page.getByRole("heading", { name: "JD 分析" })).toBeVisible();

    // 输入表单默认折叠，需展开
    await page.getByRole("button", { name: "+ 新建分析" }).click();

    // Form elements
    await expect(page.getByPlaceholder("公司名称（选填）")).toBeVisible();
    await expect(page.getByPlaceholder("职位名称（选填）")).toBeVisible();
    await expect(page.getByPlaceholder("在此粘贴职位描述（JD）...")).toBeVisible();

    // Analyze button
    await expect(page.getByRole("button", { name: "开始分析" })).toBeVisible();
  });

  test("shows history toggle", async ({ page }) => {
    await page.goto("/jd", { waitUntil: "networkidle" });

    // 分析历史列表常驻显示
    await expect(page.getByRole("heading", { name: "分析历史" })).toBeVisible();
  });
});
