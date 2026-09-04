import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../core/api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
  },
}));

import { useSkillStore } from "../core/stores/skillStore";
import { api } from "../core/api/client";

describe("TC-STORE-SKILL-001: SkillStore add skill", () => {
  beforeEach(() => {
    useSkillStore.setState({ skills: [], loading: false, error: null });
  });

  it("should add a skill", async () => {
    const mockSkill = { id: 1, name: "React", category: "前端", proficiency: 80, source: "", notes: "", learned_at: null, created_at: "" };
    vi.mocked(api.post).mockResolvedValue(mockSkill);

    await useSkillStore.getState().addSkill({ name: "React", category: "前端" });
    expect(useSkillStore.getState().skills.length).toBe(1);
    expect(useSkillStore.getState().skills[0].name).toBe("React");
  });
});

describe("TC-STORE-SKILL-002: SkillStore update proficiency", () => {
  beforeEach(() => {
    useSkillStore.setState({
      skills: [{ id: 1, name: "React", category: "前端", proficiency: 50, source: "", notes: "", learned_at: null, created_at: "" }],
    });
  });

  it("should update proficiency", async () => {
    const updated = { id: 1, name: "React", category: "前端", proficiency: 90, source: "", notes: "", learned_at: null, created_at: "" };
    vi.mocked(api.put).mockResolvedValue(updated);

    await useSkillStore.getState().updateSkill(1, { proficiency: 90 });
    expect(useSkillStore.getState().skills[0].proficiency).toBe(90);
  });
});

describe("TC-STORE-SKILL-003: SkillStore filter by category", () => {
  it("should filter correctly on fetch", async () => {
    vi.mocked(api.get).mockResolvedValue([
      { id: 1, name: "React", category: "前端", proficiency: 80, source: "", notes: "", learned_at: null, created_at: "" },
    ]);

    await useSkillStore.getState().fetchSkills("前端");
    expect(api.get).toHaveBeenCalledWith("/api/skills?category=前端");
  });
});

describe("TC-STORE-SKILL-004: SkillStore generateLearningPlan AI 降级处理", () => {
  beforeEach(() => {
    useSkillStore.setState({ learningPlan: null, loadingPlan: false, error: null });
    vi.mocked(api.post).mockClear();
    vi.mocked(api.get).mockClear();
  });

  const degradedPlan = {
    required_level: "熟悉",
    steps: [{ step: 1, title: "学习路径", description: "AI 服务暂不可用，请稍后再试", estimated_hours: 0, topics: [] }],
    milestones: [],
  };

  it("降级返回时退回输入表单（learningPlan=null）并报错，可原地重试", async () => {
    vi.mocked(api.post).mockResolvedValue(degradedPlan);

    await useSkillStore.getState().generateLearningPlan(1, "熟悉");
    expect(useSkillStore.getState().learningPlan).toBeNull();
    expect(useSkillStore.getState().error).toContain("AI 服务暂不可用");
    expect(useSkillStore.getState().loadingPlan).toBe(false);
  });

  it("正常返回时设置 learningPlan", async () => {
    const plan = {
      required_level: "熟悉",
      steps: [{ step: 1, title: "React 基础", description: "组件与 JSX", estimated_hours: 2, topics: ["组件"] }],
      milestones: ["会写组件"],
    };
    vi.mocked(api.post).mockResolvedValue(plan);

    await useSkillStore.getState().generateLearningPlan(1, "熟悉");
    expect(useSkillStore.getState().learningPlan?.steps[0].title).toBe("React 基础");
    expect(useSkillStore.getState().error).toBeNull();
  });

  it("生成中（loadingPlan=true）时 fetchLearningPlan 不覆盖进行中的状态", async () => {
    // 模拟：POST 生成进行中，用户收起页面再展开 → 展开时触发 fetchLearningPlan（GET）
    useSkillStore.setState({ loadingPlan: true, learningPlan: null, error: null });
    let resolveGet: (v: unknown) => void = () => {};
    vi.mocked(api.get).mockReturnValue(new Promise((r) => { resolveGet = r; }));
    const p = useSkillStore.getState().fetchLearningPlan(1);
    resolveGet(null); // GET 返回 null（计划还没生成完）
    await p;

    expect(useSkillStore.getState().loadingPlan).toBe(true); // 生成状态必须保留
    expect(useSkillStore.getState().learningPlan).toBeNull();
  });

  it("生成中再点生成不重复触发（防双 POST）", async () => {
    useSkillStore.setState({ loadingPlan: true, learningPlan: null, error: null });
    await useSkillStore.getState().generateLearningPlan(1, "熟悉");
    expect(vi.mocked(api.post)).not.toHaveBeenCalled(); // 已在生成，直接返回
    expect(useSkillStore.getState().loadingPlan).toBe(true);
  });
});
