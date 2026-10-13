import { describe, it, expect } from "vitest";

import { resumeToDocBlocks, buildResumeDocx } from "../core/services/docxService";

describe("TC-DOCX: 导出 Word 的中间块（resumeToDocBlocks）", () => {
  it("header → 姓名 / 求职意向 / 联系方式一行；正文区块带小标题", () => {
    const blocks = resumeToDocBlocks([
      { key: "header", title: "个人信息", data: { name: "张三", title: "高级前端工程师", email: "a@b.com", phone: "13800000000", location: "北京" } },
      { key: "summary", title: "个人摘要", data: { content: "八年经验。" } },
    ]);
    expect(blocks).toEqual([
      { kind: "name", text: "张三" },
      { kind: "subtitle", text: "高级前端工程师" },
      { kind: "meta", text: "a@b.com  |  13800000000  |  北京" },
      { kind: "section", text: "个人摘要" },
      { kind: "body", text: "八年经验。" },
    ]);
  });

  it("经历：在职显示「至今」；描述按换行拆段（docx 的 TextRun 不渲染 \\n）", () => {
    const blocks = resumeToDocBlocks([
      {
        key: "experience",
        title: "工作经历",
        data: [{ id: "1", company: "某公司", position: "前端", start_date: "2022-01", end_date: "", current: true, description: "负责 A\n负责 B\n\n" }],
      },
    ]);
    expect(blocks).toEqual([
      { kind: "section", text: "工作经历" },
      { kind: "item", text: "某公司（前端）" },
      { kind: "meta", text: "2022-01 - 至今" },
      { kind: "body", text: "负责 A" },
      { kind: "body", text: "负责 B" },
    ]);
  });

  it("技能/语言：熟练度翻中文、顿号一行（便于在 Word 里直接改）", () => {
    const blocks = resumeToDocBlocks([
      { key: "skills", title: "技能", data: [{ id: "1", name: "React", level: "advanced" }, { id: "2", name: "TS", level: "beginner" }] },
      { key: "languages", title: "语言", data: [{ id: "3", name: "英语", proficiency: "fluent" }] },
    ]);
    expect(blocks).toEqual([
      { kind: "section", text: "技能" },
      { kind: "item", text: "React（精通）、TS（入门）" },
      { kind: "section", text: "语言" },
      { kind: "item", text: "英语（流利）" },
    ]);
  });

  it("教育/项目/证书：日期与补充信息拼 meta，描述拆 body", () => {
    const blocks = resumeToDocBlocks([
      { key: "education", title: "教育背景", data: [{ id: "1", school: "某大学", degree: "本科", major: "计算机", start_date: "2018-09", end_date: "2022-06" }] },
      { key: "projects", title: "项目经验", data: [{ id: "2", name: "简历应用", role: "负责人", tech_stack: "React", description: "做完了", url: "https://x.com" }] },
      { key: "certifications", title: "证书", data: [{ id: "3", name: "CET-6", issuer: "教育部", date: "2020-06" }] },
    ]);
    expect(blocks).toEqual([
      { kind: "section", text: "教育背景" },
      { kind: "item", text: "某大学" },
      { kind: "meta", text: "2018-09 - 2022-06 · 本科 · 计算机" },
      { kind: "section", text: "项目经验" },
      { kind: "item", text: "简历应用（负责人）" },
      { kind: "meta", text: "技术栈：React" },
      { kind: "meta", text: "https://x.com" },
      { kind: "body", text: "做完了" },
      { kind: "section", text: "证书" },
      { kind: "item", text: "CET-6" },
      { kind: "meta", text: "教育部 · 2020-06" },
    ]);
  });

  it("空数据 / 坏数据 / 未知区块：不出块也不炸（未填区块不占小标题）", () => {
    expect(resumeToDocBlocks([])).toEqual([]);
    expect(resumeToDocBlocks([{ key: "summary", title: "个人摘要", data: undefined }])).toEqual([]);
    expect(resumeToDocBlocks([{ key: "summary", title: "个人摘要", data: { content: "   " } }])).toEqual([]);
    expect(resumeToDocBlocks([{ key: "experience", title: "工作经历", data: [] }])).toEqual([]);
    expect(resumeToDocBlocks([{ key: "experience", title: "工作经历", data: "坏数据" }])).toEqual([]);
    expect(resumeToDocBlocks([{ key: "unknown_key", title: "别的", data: [1, 2] }])).toEqual([]);
  });

  it("打包真的能出 .docx（zip 魔数 PK）；空简历走「暂无内容」也不炸", async () => {
    const blob = await buildResumeDocx("#1456f0", [
      { key: "header", title: "个人信息", data: { name: "张三", email: "a@b.com" } },
      { key: "skills", title: "技能", data: [{ id: "1", name: "React", level: "expert" }] },
    ]);
    // jsdom 的 Blob 没有 arrayBuffer()，用 FileReader 读头两个字节
    const head = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).slice(0, 2));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    expect(head).toBe("PK"); // docx 是 zip 容器

    const empty = await buildResumeDocx(undefined, []);
    expect(empty.size).toBeGreaterThan(0);
  });
});
