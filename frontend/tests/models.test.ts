import { describe, it, expect } from "vitest";
import type { Resume } from "../core/models/resume";
import type { ResumeTemplate } from "../core/models/template";
import type { Skill } from "../core/models/skill";
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
    };
    expect(skill.name).toBe("React");
    expect(skill.proficiency).toBe(80);
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
