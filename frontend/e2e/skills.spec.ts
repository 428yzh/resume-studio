import { test, expect, type Page } from "@playwright/test";

const API = "http://localhost:8001";

/** 技能卡片（表格改卡片后，role="cell" 不再存在，改用卡片锚点） */
const card = (page: Page, name: string) =>
  page.getByTestId("skill-card").filter({ hasText: name });

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

  /** 建一个技能并登记待清理的 id（备注必填，不填确认按钮是 disabled） */
  async function addSkill(page: Page, name: string) {
    await page.getByRole("button", { name: "+ 添加技能" }).click();
    const addForm = page.getByText("添加技能").locator("..");
    await addForm.locator('input[placeholder="技能名称"]').fill(name);
    await addForm.locator('input[placeholder^="备注"]').fill("E2E 临时数据");
    await addForm.getByRole("button", { name: "确认添加" }).click();
    await expect(card(page, name)).toBeVisible({ timeout: 5000 });

    const skills = await (await fetch(`${API}/api/skills`)).json();
    const skill = skills.find((s: { name: string }) => s.name === name);
    if (skill) createdIds.push(skill.id);
    return skill;
  }

  /** UI 删除成功后从待清理列表摘掉，避免 afterEach 二次删除 */
  function forget(id: number | undefined) {
    const idx = createdIds.indexOf(id as number);
    if (idx > -1) createdIds.splice(idx, 1);
  }

  test("adds and deletes a skill", async ({ page }) => {
    const name = `E2E-添加-${Date.now()}`;

    await page.goto("/skills", { waitUntil: "networkidle" });
    const skill = await addSkill(page, name);

    await card(page, name).getByRole("button", { name: "删除" }).click();
    await page.getByRole("button", { name: "确认删除" }).click();
    await expect(card(page, name)).not.toBeVisible({ timeout: 5000 });

    forget(skill?.id);
  });

  test("edits a skill", async ({ page }) => {
    const name = `E2E-编辑-${Date.now()}`;
    const editedName = `${name}-已编辑`;

    await page.goto("/skills", { waitUntil: "networkidle" });
    const skill = await addSkill(page, name);

    await card(page, name).getByRole("button", { name: "编辑" }).click();

    const modal = page.locator(".fixed.inset-0").first();
    await expect(modal).toBeVisible();
    await expect(modal.getByText("编辑技能")).toBeVisible();

    await modal.locator("input").first().clear();
    await modal.locator("input").first().fill(editedName);
    await modal.getByRole("button", { name: "保存" }).click();

    await expect(card(page, editedName)).toBeVisible({ timeout: 5000 });

    await card(page, editedName).getByRole("button", { name: "删除" }).click();
    await page.getByRole("button", { name: "确认删除" }).click();
    await expect(card(page, editedName)).not.toBeVisible({ timeout: 5000 });

    forget(skill?.id);
  });

  // 自评不是默认值：新建时不预填、不落库，只有拖过滑块才算用户表态
  test("new skill starts as 未验证, slider drag turns it into a real self-assessment", async ({ page }) => {
    const name = `E2E-未验证-${Date.now()}`;

    await page.goto("/skills", { waitUntil: "networkidle" });
    const skill = await addSkill(page, name);
    expect(skill.proficiency).toBeNull();

    const sliders = card(page, name).getByTestId("skill-proficiency");
    await expect(sliders).toContainText("未验证");

    await sliders.locator('input[type="range"]').fill("73");
    await sliders.locator('input[type="range"]').dispatchEvent("mouseup");
    await expect(sliders).toContainText("73%");

    await page.reload({ waitUntil: "networkidle" });
    await expect(card(page, name).getByTestId("skill-proficiency")).toContainText("73%");

    await card(page, name).getByRole("button", { name: "删除" }).click();
    await page.getByRole("button", { name: "确认删除" }).click();
    await expect(card(page, name)).not.toBeVisible({ timeout: 5000 });

    forget(skill?.id);
  });
});
