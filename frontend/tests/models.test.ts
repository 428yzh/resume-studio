import { describe, it, expect } from "vitest";
import type { Resume } from "../core/models/resume";
import type { ResumeTemplate } from "../core/models/template";
import { findNodes, unitKeyOf, type Skill, type GraphNode } from "../core/models/skill";
import type { JDAnalysis } from "../core/models/jd";

describe("TC-MODEL-001: Resume interface", () => {
  it("should have correct structure", () => {
    const resume: Resume = {
      id: 1,
      title: "测试简历",
      template_id: 1,
      sections: { summary: { content: "test" } },
      target_company: "",
      target_position: "",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    expect(resume.id).toBe(1);
    expect(resume.title).toBe("测试简历");
    expect(resume.sections.summary?.content).toBe("test");
  });
});

describe("TC-MODEL-002: Template interface", () => {
  it("should have correct structure", () => {
    const template: ResumeTemplate = {
      id: 1,
      name: "经典专业",
      description: "通用模板",
      structure: {
        sections: [{ key: "header", title: "个人信息", required: true, max_length: 500, hint: "" }],
        style: {},
      },
      is_default: true,
      created_at: "2026-01-01T00:00:00Z",
    };
    expect(template.name).toBe("经典专业");
    expect(template.structure.sections.length).toBe(1);
    expect(template.structure.sections[0].key).toBe("header");
  });
});

describe("TC-MODEL-003: Skill interface", () => {
  it("should have correct structure", () => {
    const skill: Skill = {
      id: 1,
      name: "React",
      category: "前端",
      proficiency: 80,
      source: "手动添加",
      notes: "",
      learned_at: null,
      created_at: "2026-01-01T00:00:00Z",
      has_graph: false,
    };
    expect(skill.name).toBe("React");
    expect(skill.proficiency).toBe(80);
  });
});

describe("TC-MODEL-006: unitKeyOf 笔记挂在哪一块", () => {
  // 这个约定前后端各写一份（后端是 skill_notes.unit_key），改一边就得改另一边
  it("有图谱节点就用节点 id 逗号连接（了解档一个单元合并多个顶层节点）", () => {
    expect(unitKeyOf({ step: 1, node_ids: ["2"] })).toBe("2");
    expect(unitKeyOf({ step: 4, node_ids: ["4", "5"] })).toBe("4,5");
  });

  it("老计划没有 node_ids，退回步骤号", () => {
    expect(unitKeyOf({ step: 7 })).toBe("step7");
    expect(unitKeyOf({ step: 7, node_ids: [] })).toBe("step7");
  });
});

describe("TC-MODEL-004: JDAnalysis interface", () => {
  it("should have correct structure", () => {
    const analysis: JDAnalysis = {
      id: 1,
      company: "Test",
      position: "FE",
      title: "Test - FE",
      jd_text: "require React",
      tech_stack: [{ name: "React", category: "前端", required_level: "精通", priority: 1 }],
      analysis_result: {},
      resume_id: null,
      created_at: "2026-01-01T00:00:00Z",
    };
    expect(analysis.tech_stack.length).toBe(1);
    expect(analysis.tech_stack[0].name).toBe("React");
  });
});

describe("TC-MODEL-005: findNodes 从图谱里取单元分到的那块", () => {
  const n = (id: string, ...kids: GraphNode[]): GraphNode => ({ id, title: `t${id}`, children: kids });
  const graph = [n("1", n("1.1"), n("1.2")), n("2", n("2.1"), n("2.2")), n("3")];

  it("命中顶层节点要连子树一起取", () => {
    const hit = findNodes(graph, ["2"]);
    expect(hit.map((h) => h.id)).toEqual(["2"]);
    expect(hit[0].children.map((c) => c.id)).toEqual(["2.1", "2.2"]);
  });

  it("多个 id（了解档合并单元）按图谱顺序返回，不按入参顺序", () => {
    expect(findNodes(graph, ["3", "1"]).map((h) => h.id)).toEqual(["1", "3"]);
  });

  it("能在第二层命中（深入讲解入口传的是子节点 id）", () => {
    expect(findNodes(graph, ["1.2"]).map((h) => h.id)).toEqual(["1.2"]);
  });

  it("找不到是空数组，不是 undefined", () => {
    expect(findNodes(graph, ["9.9"])).toEqual([]);
  });
});
