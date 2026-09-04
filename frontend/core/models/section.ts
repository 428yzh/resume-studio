// ===== 区块内容类型定义 =====

/** 个人信息 */
export interface HeaderData {
  name: string;
  email: string;
  phone: string;
  location: string;
  title: string;
}

/** 个人摘要 */
export interface SummaryData {
  content: string;
}

/** 工作经历单条 */
export interface ExperienceItem {
  id: string;
  company: string;
  position: string;
  start_date: string;
  end_date: string;
  current: boolean;
  description: string;
}

/** 教育背景单条 */
export interface EducationItem {
  id: string;
  school: string;
  degree: string;
  major: string;
  start_date: string;
  end_date: string;
}

/** 技能单条 */
export interface SkillItem {
  id: string;
  name: string;
  level: "beginner" | "intermediate" | "advanced" | "expert";
}

/** 项目经验单条 */
export interface ProjectItem {
  id: string;
  name: string;
  role: string;
  tech_stack: string;
  description: string;
  url: string;
}

/** 证书单条 */
export interface CertificationItem {
  id: string;
  name: string;
  issuer: string;
  date: string;
}

/** 语言单条 */
export interface LanguageItem {
  id: string;
  name: string;
  proficiency: "basic" | "conversational" | "fluent" | "native";
}

// ===== 区块键到内容类型的映射 =====

export interface SectionMap {
  header: HeaderData;
  summary: SummaryData;
  experience: ExperienceItem[];
  education: EducationItem[];
  skills: SkillItem[];
  projects: ProjectItem[];
  certifications: CertificationItem[];
  languages: LanguageItem[];
}

export type Sections = Partial<SectionMap> & Record<string, unknown>;

// ===== 表单字段配置 =====

export type FieldType = "text" | "textarea" | "date" | "select" | "checkbox";

export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  placeholder?: string;
  required?: boolean;
  colSpan?: 1 | 2;
}

export interface SectionFormConfig {
  mode: "single" | "array";
  fields: FormField[];
}

// ===== 每个区块的表单配置 =====

export const SECTION_FORM_CONFIGS: Record<string, SectionFormConfig> = {
  header: {
    mode: "single",
    fields: [
      { key: "name", label: "姓名", type: "text", required: true, colSpan: 1 },
      { key: "email", label: "邮箱", type: "text", placeholder: "example@email.com", colSpan: 1 },
      { key: "phone", label: "电话", type: "text", placeholder: "+86 138-0000-0000", colSpan: 1 },
      { key: "location", label: "所在地", type: "text", placeholder: "北京", colSpan: 1 },
      { key: "title", label: "求职意向", type: "text", placeholder: "高级前端工程师", colSpan: 2 },
    ],
  },
  summary: {
    mode: "single",
    fields: [
      { key: "content", label: "个人摘要", type: "textarea", placeholder: "简要介绍自己的职业背景和核心优势，3-5 句话", colSpan: 2 },
    ],
  },
  experience: {
    mode: "array",
    fields: [
      { key: "company", label: "公司", type: "text", placeholder: "公司名称", required: true },
      { key: "position", label: "职位", type: "text", placeholder: "高级前端工程师" },
      { key: "start_date", label: "开始时间", type: "date" },
      { key: "end_date", label: "结束时间", type: "date" },
      { key: "current", label: "至今在职", type: "checkbox", colSpan: 2 },
      { key: "description", label: "工作描述", type: "textarea", placeholder: "按 STAR 法则描述工作内容和成果，量化数据", colSpan: 2 },
    ],
  },
  education: {
    mode: "array",
    fields: [
      { key: "school", label: "学校", type: "text", placeholder: "学校名称", required: true },
      { key: "major", label: "专业", type: "text", placeholder: "计算机科学与技术" },
      { key: "degree", label: "学历", type: "select", options: ["高中", "大专", "本科", "硕士", "博士"] },
      { key: "start_date", label: "开始时间", type: "date" },
      { key: "end_date", label: "结束时间", type: "date" },
    ],
  },
  skills: {
    mode: "array",
    fields: [
      { key: "name", label: "技能名称", type: "text", placeholder: "React", required: true },
      { key: "level", label: "熟练度", type: "select", options: ["beginner", "intermediate", "advanced", "expert"] },
    ],
  },
  projects: {
    mode: "array",
    fields: [
      { key: "name", label: "项目名称", type: "text", placeholder: "项目名称", required: true },
      { key: "role", label: "角色", type: "text", placeholder: "前端负责人" },
      { key: "tech_stack", label: "技术栈", type: "text", placeholder: "React, TypeScript, Node.js" },
      { key: "url", label: "项目链接", type: "text", placeholder: "https://github.com/..." },
      { key: "description", label: "项目描述", type: "textarea", placeholder: "项目背景、你的贡献、量化成果", colSpan: 2 },
    ],
  },
  certifications: {
    mode: "array",
    fields: [
      { key: "name", label: "证书名称", type: "text", placeholder: "AWS Certified Solutions Architect", required: true },
      { key: "issuer", label: "颁发机构", type: "text", placeholder: "Amazon Web Services" },
      { key: "date", label: "获得时间", type: "date" },
    ],
  },
  languages: {
    mode: "array",
    fields: [
      { key: "name", label: "语言", type: "text", placeholder: "英语", required: true },
      { key: "proficiency", label: "水平", type: "select", options: ["basic", "conversational", "fluent", "native"] },
    ],
  },
};

// ===== 工具函数 =====

let _idCounter = 0;
export function genId(): string {
  return `sec_${++_idCounter}_${Date.now()}`;
}

/** 创建区块的空默认值 */
export function createDefaultContent(key: string): unknown {
  const config = SECTION_FORM_CONFIGS[key];
  if (!config) return "";
  if (config.mode === "array") return [];
  const obj: Record<string, string | boolean> = {};
  for (const f of config.fields) {
    obj[f.key] = f.type === "checkbox" ? false : "";
  }
  return obj;
}

/** 等级标签中文化 */
export const LEVEL_LABELS: Record<string, string> = {
  beginner: "入门",
  intermediate: "熟练",
  advanced: "精通",
  expert: "专家",
  basic: "基础",
  conversational: "会话",
  fluent: "流利",
  native: "母语",
};
