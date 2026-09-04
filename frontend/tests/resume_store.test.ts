import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock api client
vi.mock("../core/api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
  },
}));

import { useResumeStore } from "../core/stores/resumeStore";
import { api } from "../core/api/client";
import type { Resume } from "../core/models/resume";

describe("TC-STORE-RESUME-001: ResumeStore create resume", () => {
  beforeEach(() => {
    useResumeStore.setState({ resumes: [], currentResume: null, loading: false, error: null });
  });

  it("should create a resume", async () => {
    const mockResume = { id: 1, title: "新简历", template_id: 1, sections: {} as Resume["sections"], target_company: "", target_position: "", created_at: "", updated_at: "" };
    vi.mocked(api.post).mockResolvedValue(mockResume);

    const result = await useResumeStore.getState().createResume({ title: "新简历" });
    expect(result.id).toBe(1);
    expect(useResumeStore.getState().resumes.length).toBe(1);
  });
});

describe("TC-STORE-RESUME-002: ResumeStore update section", () => {
  beforeEach(() => {
    useResumeStore.setState({
      currentResume: { id: 1, title: "test", template_id: 1, sections: {} as Resume["sections"], target_company: "", target_position: "", created_at: "", updated_at: "" },
      resumes: [],
    });
  });

  it("should update resume sections", async () => {
    const updated = { id: 1, title: "test", template_id: 1, sections: { summary: { content: "hello" } }, target_company: "", target_position: "", created_at: "", updated_at: "" };
    vi.mocked(api.put).mockResolvedValue(updated);

    await useResumeStore.getState().updateResume(1, { sections: { summary: { content: "hello" } } });
    expect(useResumeStore.getState().currentResume?.sections.summary?.content).toBe("hello");
  });
});

describe("TC-STORE-RESUME-003: ResumeStore switch template", () => {
  it("should update template_id", async () => {
    useResumeStore.setState({
      currentResume: { id: 1, title: "test", template_id: 1, sections: {} as Resume["sections"], target_company: "", target_position: "", created_at: "", updated_at: "" },
    });
    const updated = { id: 1, title: "test", template_id: 2, sections: {} as Resume["sections"], target_company: "", target_position: "", created_at: "", updated_at: "" };
    vi.mocked(api.put).mockResolvedValue(updated);

    await useResumeStore.getState().updateResume(1, { template_id: 2 });
    expect(useResumeStore.getState().currentResume?.template_id).toBe(2);
  });
});
