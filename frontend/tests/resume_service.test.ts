import { describe, it, expect } from "vitest";
import { calculateResumeProgress, getOrderedSections } from "../core/services/resumeService";
import type { Resume } from "../core/models/resume";

describe("calculateResumeProgress", () => {
  it("should return 0 for empty resume", () => {
    const resume = { sections: {} } as Resume;
    expect(calculateResumeProgress(resume, ["header", "summary"])).toBe(0);
  });

  it("should return 100 for fully filled resume", () => {
    const resume = {
      sections: {
        header: { name: "John Doe", email: "john@example.com", phone: "1234567890", location: "Beijing", title: "Developer" },
        summary: { content: "Experienced developer with 5 years..." },
      },
    } as Resume;
    expect(calculateResumeProgress(resume, ["header", "summary"])).toBe(100);
  });

  it("should return 50 for half-filled resume", () => {
    const resume = {
      sections: {
        header: { name: "John Doe", email: "", phone: "", location: "", title: "" },
        summary: {} as { content?: string },
      },
    } as Resume;
    expect(calculateResumeProgress(resume, ["header", "summary"])).toBe(50);
  });
});

describe("getOrderedSections", () => {
  it("should return sections in template order", () => {
    const resume = {
      sections: {
        skills: [{ id: "1", name: "React", level: "advanced" as const }],
        header: { name: "Name", email: "", phone: "", location: "", title: "" },
        summary: { content: "Dev" },
      },
    } as Resume;
    const templateSections = [
      { key: "header", title: "Header" },
      { key: "summary", title: "Summary" },
      { key: "skills", title: "Skills" },
    ];
    const result = getOrderedSections(resume, templateSections);
    expect(result[0].key).toBe("header");
    expect(result[1].key).toBe("summary");
    expect(result[2].key).toBe("skills");
  });
});
