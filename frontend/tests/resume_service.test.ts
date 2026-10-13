import { describe, it, expect } from "vitest";
import {
  calculateResumeProgress, getOrderedSections, orderSectionKeys, moveSectionKey,
} from "../core/services/resumeService";
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

  it("respects the saved custom order (__order)", () => {
    const resume = {
      sections: {
        skills: [{ id: "1", name: "React", level: "advanced" as const }],
        header: { name: "Name", email: "", phone: "", location: "", title: "" },
        __order: ["skills", "header"],
      },
    } as unknown as Resume;
    const templateSections = [
      { key: "header", title: "Header" },
      { key: "skills", title: "Skills" },
    ];
    expect(getOrderedSections(resume, templateSections).map((s) => s.key)).toEqual(["skills", "header"]);
  });
});

describe("orderSectionKeys", () => {
  it("没保存过顺序时保持原序", () => {
    expect(orderSectionKeys(["a", "b", "c"])).toEqual(["a", "b", "c"]);
    expect(orderSectionKeys(["a", "b"], [])).toEqual(["a", "b"]);
    expect(orderSectionKeys(["a", "b"], "不是数组")).toEqual(["a", "b"]);
  });

  it("按保存的顺序排，没排到的 key 保持原序补在后面", () => {
    expect(orderSectionKeys(["a", "b", "c"], ["c", "a"])).toEqual(["c", "a", "b"]);
  });

  it("忽略保存顺序里已经没有的 key（区块被删/换模板）", () => {
    expect(orderSectionKeys(["a", "b"], ["b", "gone"])).toEqual(["b", "a"]);
  });
});

describe("moveSectionKey", () => {
  it("上移 / 下移一位", () => {
    expect(moveSectionKey(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveSectionKey(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
  });

  it("首尾越界原样返回，且不改入参", () => {
    const order = ["a", "b"];
    expect(moveSectionKey(order, "a", -1)).toEqual(["a", "b"]);
    expect(moveSectionKey(order, "b", 1)).toEqual(["a", "b"]);
    expect(moveSectionKey(order, "gone", 1)).toEqual(["a", "b"]);
    expect(order).toEqual(["a", "b"]);
  });
});
