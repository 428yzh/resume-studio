import { test, expect } from "@playwright/test";

const API = "http://localhost:8001";

test.describe("Skill Library", () => {
  const createdIds: number[] = [];

  test.afterEach(async () => {
    for (const id of createdIds) {
      try {
        await fetch(`${API}/api/skills/${id}`, { method: "DELETE" });
      } catch {
        // ignore cleanup errors
      }
    }
    createdIds.length = 0;
  });

  test("adds and deletes a skill", async ({ page }) => {
    const name = `E2E-添加-${Date.now()}`;

    await page.goto("/skills", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "+ 添加技能" }).click();

    const addForm = page.getByText("添加技能").locator("..");
    await addForm.locator('input[placeholder="技能名称"]').fill(name);
    await addForm.locator('input[placeholder^="备注"]').fill("E2E 临时数据"); // 备注必填，不填按钮是 disabled
    await addForm.getByRole("button", { name: "确认添加" }).click();

    await expect(page.getByRole("cell", { name })).toBeVisible({ timeout: 5000 });

    // Get skill ID for cleanup
    const res = await fetch(`${API}/api/skills`);
    const skills = await res.json();
    const skill = skills.find((s: { name: string }) => s.name === name);
    if (skill) createdIds.push(skill.id);

    // Delete via UI（需确认弹窗）
    await page.getByRole("cell", { name }).locator("..").getByRole("button", { name: "删除" }).click();
    await page.getByRole("button", { name: "确认删除" }).click();
    await expect(page.getByRole("cell", { name })).not.toBeVisible({ timeout: 5000 });

    // API cleanup: remove from tracking since UI delete succeeded
    const idx = createdIds.indexOf(skill?.id);
    if (idx > -1) createdIds.splice(idx, 1);
  });

  test("edits a skill", async ({ page }) => {
    const name = `E2E-编辑-${Date.now()}`;
    const editedName = `${name}-已编辑`;

    await page.goto("/skills", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "+ 添加技能" }).click();
    const addForm = page.getByText("添加技能").locator("..");
    await addForm.locator('input[placeholder="技能名称"]').fill(name);
    await addForm.locator('input[placeholder^="备注"]').fill("E2E 临时数据"); // 备注必填，不填按钮是 disabled
    await addForm.getByRole("button", { name: "确认添加" }).click();
    await expect(page.getByRole("cell", { name })).toBeVisible({ timeout: 5000 });

    // Get skill ID for cleanup
    const res = await fetch(`${API}/api/skills`);
    const skills = await res.json();
    const skill = skills.find((s: { name: string }) => s.name === name);
    if (skill) createdIds.push(skill.id);

    // Click edit in the row
    await page.getByRole("cell", { name }).locator("..").getByRole("button", { name: "编辑" }).click();

    // Find modal overlay and edit the skill name
    const modal = page.locator(".fixed.inset-0").first();
    await expect(modal).toBeVisible();
    await expect(modal.getByText("编辑技能")).toBeVisible();

    await modal.locator("input").first().clear();
    await modal.locator("input").first().fill(editedName);
    await modal.getByRole("button", { name: "保存" }).click();

    // Verify edit
    await expect(page.getByRole("cell", { name: editedName })).toBeVisible({ timeout: 5000 });

    // Cleanup via UI
    await page.getByRole("cell", { name: editedName }).locator("..").getByRole("button", { name: "删除" }).click();

    // API cleanup: remove from tracking since UI delete succeeded
    const idx = createdIds.indexOf(skill?.id);
    if (idx > -1) createdIds.splice(idx, 1);
  });

  // 自评不是默认值：新建时不预填、不落库，只有拖过滑块才算用户表态
  test("new skill starts as 未验证, slider drag turns it into a real self-assessment", async ({ page }) => {
    const name = `E2E-未验证-${Date.now()}`;

    await page.goto("/skills", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "+ 添加技能" }).click();
    const addForm = page.getByText("添加技能").locator("..");
    await addForm.locator('input[placeholder="技能名称"]').fill(name);
    await addForm.locator('input[placeholder^="备注"]').fill("E2E 临时数据");
    await addForm.getByRole("button", { name: "确认添加" }).click();

    const row = page.getByRole("cell", { name }).locator("..");
    await expect(row).toBeVisible({ timeout: 5000 });

    const res = await fetch(`${API}/api/skills`);
    const skill = (await res.json()).find((s: { name: string }) => s.name === name);
    if (skill) createdIds.push(skill.id);
    expect(skill.proficiency).toBeNull();

    const cell = row.locator("td").nth(2); // 自评熟练度列
    await expect(cell).toContainText("未验证");

    await cell.locator('input[type="range"]').fill("73");
    await cell.locator('input[type="range"]').dispatchEvent("mouseup");
    await expect(cell).toContainText("73%");

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByRole("cell", { name }).locator("..").locator("td").nth(2)).toContainText("73%");

    await page.getByRole("cell", { name }).locator("..").getByRole("button", { name: "删除" }).click();
    await page.getByRole("button", { name: "确认删除" }).click();
    await expect(page.getByRole("cell", { name })).not.toBeVisible({ timeout: 5000 });

    const idx = createdIds.indexOf(skill?.id);
    if (idx > -1) createdIds.splice(idx, 1);
  });
});
