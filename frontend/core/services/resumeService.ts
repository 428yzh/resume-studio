import type { Resume } from "@core/models/resume";
import type { Sections } from "@core/models/section";
import { SECTION_FORM_CONFIGS } from "@core/models/section";
import type { HeaderData, SummaryData, ExperienceItem, EducationItem, SkillItem, ProjectItem, CertificationItem, LanguageItem } from "@core/models/section";
import type { JDAnalysis, GapAnalysis } from "@core/models/jd";

/** 合并简历区块与模板结构，返回有序区块列表 */
export function getOrderedSections(resume: Resume, templateSections: { key: string; title: string }[]) {
  return templateSections.map((sec) => ({
    key: sec.key,
    title: sec.title,
    data: resume.sections[sec.key],
  }));
}

/** 判断区块是否有内容 */
export function sectionHasContent(sectionKey: string, data: unknown): boolean {
  if (!data) return false;
  const config = SECTION_FORM_CONFIGS[sectionKey];
  if (!config) return typeof data === "string" && data.trim().length > 0;
  if (config.mode === "array") return (data as unknown[]).length > 0;
  return Object.values(data as Record<string, unknown>).some((v) => {
    if (typeof v === "string") return v.trim().length > 0;
    return v != null && v !== false;
  });
}

/** 将结构化 sections 转为纯文本（用于 AI 润色） */
export function resumeToPlainText(sections: Sections): string {
  const parts: string[] = [];

  const header = sections.header;
  if (header) {
    const info = [header.name, header.email, header.phone, header.location].filter(Boolean).join(" | ");
    parts.push(
      `[个人信息]\n${info}${header.title ? `\n意向职位：${header.title}` : ""}`
    );
  }

  const summary = sections.summary;
  if (summary?.content) {
    parts.push(`[个人摘要]\n${summary.content}`);
  }

  const experience = sections.experience;
  if (experience?.length) {
    parts.push(
      "[工作经历]\n" +
        experience
          .map(
            (item) =>
              `${item.company} - ${item.position} (${item.start_date || ""} ~ ${item.end_date || "至今"})\n${item.description}`
          )
          .join("\n\n")
    );
  }

  const education = sections.education;
  if (education?.length) {
    parts.push(
      "[教育背景]\n" +
        education
          .map(
            (item) =>
              `${item.school}${item.major ? ` - ${item.major}` : ""}${item.degree ? ` (${item.degree})` : ""}${item.start_date ? `\n${item.start_date} ~ ${item.end_date || ""}` : ""}`
          )
          .join("\n\n")
    );
  }

  const skills = sections.skills;
  if (skills?.length) {
    parts.push("[技能清单]\n" + skills.map((s) => `${s.name} (${s.level || ""})`).join(", "));
  }

  const projects = sections.projects;
  if (projects?.length) {
    parts.push(
      "[项目经验]\n" +
        projects
          .map(
            (p) =>
              `${p.name}${p.role ? ` - ${p.role}` : ""}${p.tech_stack ? `\n技术栈：${p.tech_stack}` : ""}${p.description ? `\n${p.description}` : ""}`
          )
          .join("\n\n")
    );
  }

  const certs = sections.certifications;
  if (certs?.length) {
    parts.push(
      "[证书与资质]\n" + certs.map((c) => `${c.name}${c.issuer ? ` - ${c.issuer}` : ""}${c.date ? ` (${c.date})` : ""}`).join("\n")
    );
  }

  const langs = sections.languages;
  if (langs?.length) {
    parts.push("[语言能力]\n" + langs.map((l) => `${l.name} (${l.proficiency || ""})`).join(", "));
  }

  return parts.join("\n\n");
}

/** 计算简历完成度百分比 */
export function calculateResumeProgress(resume: Resume, requiredKeys: string[]): number {
  if (!requiredKeys.length) return 0;
  const filled = requiredKeys.filter((key) => {
    const content = resume.sections[key];
    if (!content) return false;
    // Array-type (experience, education, etc.): check if any entry exists
    if (Array.isArray(content)) return content.length > 0;
    // Object-type (header, summary): check if at least one field has value
    if (typeof content === "object") return Object.values(content as Record<string, unknown>).some((v) => String(v).trim().length > 0);
    return String(content).trim().length > 10;
  });
  return Math.round((filled.length / requiredKeys.length) * 100);
}

/** JD-Gap analysis: compare resume skills against JD tech stack */
export function computeGaps(sections: Sections, analysis: JDAnalysis): GapAnalysis {
  // Extract skill names from the resume's skills section
  const resumeSkillNames = new Set(
    (sections.skills || []).map((s) => s.name.toLowerCase().trim()),
  );

  // Also extract tech mentions from experience descriptions
  const experienceText = (sections.experience || [])
    .map((e) => `${e.company} ${e.position} ${e.description}`.toLowerCase())
    .join(" ");

  const techStack = analysis.tech_stack || [];
  const matched: GapAnalysis["matched_skills"] = [];
  const missing: GapAnalysis["missing_skills"] = [];

  for (const tech of techStack) {
    const techName = tech.name.toLowerCase().trim();

    // Check if the skill exists in the resume's skill list
    // or is mentioned in experience descriptions
    const inSkillList = resumeSkillNames.has(techName);
    const inExperience = !inSkillList && experienceText.includes(techName);

    if (inSkillList) {
      const resumeSkill = (sections.skills || []).find(
        (s) => s.name.toLowerCase().trim() === techName,
      );
      matched.push({
        name: tech.name,
        category: tech.category,
        level: resumeSkill?.level || "unknown",
      });
    } else if (inExperience) {
      matched.push({
        name: tech.name,
        category: tech.category,
        level: "mentioned in experience",
      });
    } else {
      missing.push({
        name: tech.name,
        category: tech.category,
        required_level: tech.required_level,
        priority: tech.priority,
      });
    }
  }

  const totalRequired = techStack.length;
  const matchCount = matched.length;
  const matchPercentage = totalRequired > 0 ? Math.round((matchCount / totalRequired) * 100) : 0;

  const suggestions: string[] = [];
  if (matchPercentage >= 80) {
    suggestions.push("你的技能与职位要求高度匹配，可以突出简历中的相关经验。");
  } else if (matchPercentage >= 50) {
    suggestions.push("你的技能基本覆盖职位要求，建议补充缺失的几项技术。");
  } else {
    suggestions.push("与该职位存在较大技能差距，建议优先学习缺失的关键技术。");
  }
  if (missing.length > 0) {
    suggestions.push(
      `建议重点学习：${missing.slice(0, 3).map((m) => m.name).join("、")}${missing.length > 3 ? "等" : ""}`,
    );
  }

  return { matched_skills: matched, missing_skills: missing, total_required: totalRequired, match_count: matchCount, match_percentage: matchPercentage, suggestions };
}

/** 检测 sections 是否为旧格式 (Record<string, string>) */
function isLegacyFormat(sections: unknown): boolean {
  if (!sections || typeof sections !== "object") return false;
  const vals = Object.values(sections as Record<string, unknown>);
  return vals.length > 0 && vals.every((v) => typeof v === "string");
}

/** 将旧格式 sections 转换为新结构化格式 */
function migrateLegacySections(sections: Record<string, string>): Sections {
  const result: Sections = {};
  for (const [key, val] of Object.entries(sections)) {
    if (!val?.trim()) continue;
    switch (key) {
      case "header": {
        const lines = val.split("\n").filter(Boolean);
        result.header = {
          name: lines[0] || "",
          email: lines.find((l) => l.includes("@")) || "",
          phone: lines.find((l) => /[\d-]{7,}/.test(l)) || "",
          location: "",
          title: "",
        };
        break;
      }
      case "summary":
        result.summary = { content: val };
        break;
      case "experience":
        result.experience = [
          {
            id: "migrated_1",
            company: val.split("\n")[0] || "",
            position: "",
            start_date: "",
            end_date: "",
            current: false,
            description: val,
          },
        ];
        break;
      case "education":
        result.education = [
          {
            id: "migrated_1",
            school: val.split("\n")[0] || "",
            degree: "",
            major: "",
            start_date: "",
            end_date: "",
          },
        ];
        break;
      case "skills":
        result.skills = val
          .split("\n")
          .filter(Boolean)
          .map((name, i) => ({
            id: `migrated_${i + 1}`,
            name: name.trim(),
            level: "intermediate" as const,
          }));
        break;
      default: {
        // projects, certifications, languages — put whole text as first entry description
        const arrayKey = key as keyof Sections;
        if (["projects", "certifications", "languages"].includes(key)) {
          result[arrayKey] = [
            {
              id: "migrated_1",
              name: val.split("\n")[0] || val.slice(0, 30),
              ...(key === "projects"
                ? { role: "", tech_stack: "", description: val, url: "" }
                : key === "certifications"
                  ? { issuer: "", date: "" }
                  : { proficiency: "conversational" as const }),
            },
          ] as never;
        }
        break;
      }
    }
  }
  return result;
}

/** 确保 sections 为新格式，旧数据自动迁移 */
export function ensureSections(resume: Resume): Resume {
  if (isLegacyFormat(resume.sections)) {
    return { ...resume, sections: migrateLegacySections(resume.sections as unknown as Record<string, string>) };
  }
  return resume;
}
