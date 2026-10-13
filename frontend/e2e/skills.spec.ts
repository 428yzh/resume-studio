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

  /** 走 UI 删掉并等 DELETE 真的落地。
   *  只断言「卡片没了」是不够的：卡片可能只是重渲染瞬间不在，断言立刻通过、用例结束，
   *  在途的 DELETE 被掐断 —— 数据留在库里，而 forget() 已经把兜底清理摘掉了（实测漏过两条）。 */
  async function deleteViaUI(page: Page, name: string, id: number) {
    const deleted = page.waitForResponse(
      (r) => r.url().includes(`/api/skills/${id}`) && r.request().method() === "DELETE",
      { timeout: 5000 },
    );
    await card(page, name).getByRole("button", { name: "删除" }).click();
    await page.getByRole("button", { name: "确认删除" }).click();
    expect((await deleted).status()).toBe(204);
    await expect(card(page, name)).not.toBeVisible({ timeout: 5000 });
  }

  test("adds and deletes a skill", async ({ page }) => {
    const name = `E2E-添加-${Date.now()}`;

    await page.goto("/skills", { waitUntil: "networkidle" });
    const skill = await addSkill(page, name);

    await deleteViaUI(page, name, skill.id);

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

    await deleteViaUI(page, editedName, skill.id);

    forget(skill?.id);
  });

  // ⑦ 技能工作台：卡片正面的入口得能进到 /skills/:id，且没图谱时给的是生成入口
  // （A5：有图谱后**没有**「重新生成图谱」—— 节点 id 是分数和笔记的锚，重生成会全冲掉）
  test("workbench opens from the card and offers 生成图谱 when there is none", async ({ page }) => {
    const name = `E2E-工作台-${Date.now()}`;

    await page.goto("/skills", { waitUntil: "networkidle" });
    const skill = await addSkill(page, name);

    await card(page, name).getByRole("button", { name: "打开工作台" }).click();
    await expect(page).toHaveURL(new RegExp(`/skills/${skill.id}$`));
    await expect(page.getByRole("heading", { level: 2 })).toContainText(name);
    await expect(page.getByText("未生成图谱")).toBeVisible();
    await expect(page.getByRole("button", { name: "生成图谱" })).toBeVisible();

    await page.goto("/skills", { waitUntil: "networkidle" });
    await deleteViaUI(page, name, skill.id);

    forget(skill?.id);
  });

  // 自评不是默认值：新建时不预填、不落库，只有拖过滑块才算用户表态
  // D1：滑块已移进展开区 —— 卡片正面整张可点展开，滑块留在正面等于把「点中心展开」变成「误改自评」
  test("new skill starts as 未验证, slider drag turns it into a real self-assessment", async ({ page }) => {
    const name = `E2E-未验证-${Date.now()}`;

    await page.goto("/skills", { waitUntil: "networkidle" });
    const skill = await addSkill(page, name);
    expect(skill.proficiency).toBeNull();

    // 卡片正面没有自评控件
    const sliders = page.getByTestId("skill-proficiency");
    await expect(sliders).toHaveCount(0);

    // 点卡片中心 = 只展开，不碰数据（就是当初误把 未验证 改成 50 的那一下）
    await card(page, name).click();
    await expect(sliders).toContainText("未验证");

    // 等 PUT 落地再刷新 —— 拖完立刻 reload 会把在途请求掐掉（本地 state 已是 73%，看着像保存了）
    const saved = page.waitForResponse(
      (r) => r.url().includes(`/api/skills/${skill.id}`) && r.request().method() === "PUT",
      { timeout: 5000 },
    );
    await sliders.locator('input[type="range"]').fill("73");
    // 等 React 把 73 渲染出来再 mouseup：commit() 闭包捕获的是渲染那一刻的 val，
    // 填完立刻 mouseup 会跑在旧闭包上（val 还是 null）→ 直接 return，PUT 压根不发（实测偶发超时）
    await expect(sliders).toContainText("73%");
    await sliders.locator('input[type="range"]').dispatchEvent("mouseup");
    expect((await saved).status()).toBe(200);

    await page.reload({ waitUntil: "networkidle" });
    await card(page, name).click();
    await expect(page.getByTestId("skill-proficiency")).toContainText("73%");

    await deleteViaUI(page, name, skill.id);

    forget(skill?.id);
  });

  // 回归：卡片组件必须定义在 SkillLibrary() 外面。写在组件体内 → 父级每次重渲染都生成
  // 新的函数对象 = 新组件类型 → React 卸载重挂整张网格，卡片的入场动画
  //（opacity:0 → fade-in）跟着重播 —— 表现为「一打字整个技能库主页就刷新」。
  // 实测触发路径：康奈尔笔记打字 → 400ms 自动保存 → store set → 父级重渲染。
  // 这里用最便宜的重渲染触发（开/关添加表单，纯本地 state、不发请求），机制同一条。
  test("cards keep their DOM nodes when the page re-renders", async ({ page }) => {
    const name = `E2E-重挂-${Date.now()}`;

    await page.goto("/skills", { waitUntil: "networkidle" });
    const skill = await addSkill(page, name);

    await page.evaluate((n) => {
      (window as unknown as { __card?: Element | null }).__card =
        Array.from(document.querySelectorAll('[data-testid="skill-card"]'))
          .find((e) => e.textContent?.includes(n)) ?? null;
    }, name);

    await page.getByRole("button", { name: "+ 添加技能" }).click();

    expect(
      await page.evaluate(() => {
        const w = window as unknown as { __card?: Element | null };
        return w.__card?.isConnected ?? false;
      }),
    ).toBe(true);

    await deleteViaUI(page, name, skill.id);

    forget(skill?.id);
  });
});
