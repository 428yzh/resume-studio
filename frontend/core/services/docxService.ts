import { LEVEL_LABELS } from "@core/models/section";

interface SectionItem {
  key: string;
  title: string;
  data: unknown;
}

/**
 * Word 文档的中间表示：先把区块化成通用块（纯逻辑、可单测），
 * 再由 exportResumeToDocx 映射成 docx 段落。
 */
export type DocBlock = {
  kind: "name" | "subtitle" | "section" | "item" | "meta" | "body";
  text: string;
};

/** 与 ResumePDF 同款的安全取值 */
function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (v == null) return fallback;
  return String(v);
}

/** 描述类文本按换行拆成多段 —— docx 的 TextRun 不渲染 \n，必须拆成独立段落 */
function pushBody(blocks: DocBlock[], text: string) {
  for (const line of text.split("\n")) {
    if (line.trim()) blocks.push({ kind: "body", text: line.trim() });
  }
}

function levelLabel(v: unknown): string {
  const s = str(v);
  return LEVEL_LABELS[s] || s;
}

function items(data: unknown): Record<string, unknown>[] {
  return Array.isArray(data) ? data.filter((it): it is Record<string, unknown> => !!it && typeof it === "object") : [];
}

/** 「React（精通）、TypeScript（入门）」—— 技能/语言共用 */
function tagLine(data: unknown, levelKey: "level" | "proficiency"): DocBlock[] {
  const parts = items(data)
    .map((it) => {
      const name = str(it.name);
      if (!name) return "";
      const label = levelLabel(it[levelKey]);
      return label ? `${name}（${label}）` : name;
    })
    .filter(Boolean);
  return parts.length ? [{ kind: "item", text: parts.join("、") }] : [];
}

function dates(item: Record<string, unknown>, withCurrent: boolean): string {
  const start = str(item.start_date);
  const end = withCurrent && item.current ? "至今" : str(item.end_date);
  return [start, end].filter(Boolean).join(" - ");
}

function sectionBlocks(key: string, data: unknown): DocBlock[] {
  switch (key) {
    case "summary": {
      const blocks: DocBlock[] = [];
      pushBody(blocks, str((data as Record<string, unknown> | undefined)?.content));
      return blocks;
    }
    case "experience":
      return items(data).flatMap((it) => {
        const blocks: DocBlock[] = [];
        const head = str(it.company) ? `${str(it.company)}${str(it.position) ? `（${str(it.position)}）` : ""}` : str(it.position);
        if (head) blocks.push({ kind: "item", text: head });
        const d = dates(it, true);
        if (d) blocks.push({ kind: "meta", text: d });
        pushBody(blocks, str(it.description));
        return blocks;
      });
    case "education":
      return items(data).flatMap((it) => {
        const blocks: DocBlock[] = [];
        if (str(it.school)) blocks.push({ kind: "item", text: str(it.school) });
        const meta = [dates(it, false), str(it.degree), str(it.major)].filter(Boolean).join(" · ");
        if (meta) blocks.push({ kind: "meta", text: meta });
        return blocks;
      });
    case "skills":
      return tagLine(data, "level");
    case "languages":
      return tagLine(data, "proficiency");
    case "projects":
      return items(data).flatMap((it) => {
        const blocks: DocBlock[] = [];
        const head = str(it.name) ? `${str(it.name)}${str(it.role) ? `（${str(it.role)}）` : ""}` : str(it.role);
        if (head) blocks.push({ kind: "item", text: head });
        if (str(it.tech_stack)) blocks.push({ kind: "meta", text: `技术栈：${str(it.tech_stack)}` });
        if (str(it.url)) blocks.push({ kind: "meta", text: str(it.url) });
        pushBody(blocks, str(it.description));
        return blocks;
      });
    case "certifications":
      return items(data).flatMap((it) => {
        const blocks: DocBlock[] = [];
        if (str(it.name)) blocks.push({ kind: "item", text: str(it.name) });
        const meta = [str(it.issuer), str(it.date)].filter(Boolean).join(" · ");
        if (meta) blocks.push({ kind: "meta", text: meta });
        return blocks;
      });
    default:
      return [];
  }
}

/** 区块 → 通用块：header 独立成姓名/意向/联系方式，其余按模板顺序带小标题 */
export function resumeToDocBlocks(sections: SectionItem[]): DocBlock[] {
  const blocks: DocBlock[] = [];

  const header = sections.find((s) => s.key === "header")?.data as Record<string, unknown> | undefined;
  if (header) {
    if (str(header.name)) blocks.push({ kind: "name", text: str(header.name) });
    if (str(header.title)) blocks.push({ kind: "subtitle", text: str(header.title) });
    const contact = [str(header.email), str(header.phone), str(header.location)].filter(Boolean).join("  |  ");
    if (contact) blocks.push({ kind: "meta", text: contact });
  }

  for (const sec of sections) {
    if (sec.key === "header") continue;
    const body = sectionBlocks(sec.key, sec.data);
    if (!body.length) continue;
    blocks.push({ kind: "section", text: sec.title });
    blocks.push(...body);
  }
  return blocks;
}

/**
 * 生成 Word（.docx）文档 blob。
 * docx 包按需动态导入，不进主 bundle（同 PDF 的字体拉取思路）。
 */
export async function buildResumeDocx(primaryColor: string | undefined, sections: SectionItem[]) {
  const { Document, Packer, Paragraph, TextRun, BorderStyle } = await import("docx");

  const accent = (primaryColor || "#1456f0").replace("#", "").toUpperCase();
  const font = { ascii: "Calibri", hAnsi: "Calibri", eastAsia: "微软雅黑" };

  const blocks = resumeToDocBlocks(sections);
  const children =
    blocks.length === 0
      ? [new Paragraph({ children: [new TextRun({ text: "暂无内容", size: 21, color: "94A3B8" })] })]
      : blocks.map((b) => {
          switch (b.kind) {
            case "name":
              return new Paragraph({ children: [new TextRun({ text: b.text, bold: true, size: 44, color: "0A0A0A" })], spacing: { after: 40 } });
            case "subtitle":
              return new Paragraph({ children: [new TextRun({ text: b.text, size: 22, color: "475569" })], spacing: { after: 40 } });
            case "meta":
              return new Paragraph({ children: [new TextRun({ text: b.text, size: 18, color: "475569" })], spacing: { after: 80 } });
            case "section":
              return new Paragraph({
                children: [new TextRun({ text: b.text, bold: true, size: 26, color: accent })],
                spacing: { before: 240, after: 100 },
                border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: accent, space: 2 } },
              });
            case "item":
              return new Paragraph({ children: [new TextRun({ text: b.text, bold: true, size: 21, color: "0A0A0A" })], spacing: { before: 80, after: 20 } });
            default:
              return new Paragraph({ children: [new TextRun({ text: b.text, size: 21, color: "222222" })], spacing: { after: 40 } });
          }
        });

  const doc = new Document({
    styles: { default: { document: { run: { font } } } },
    sections: [{ children }],
  });
  return Packer.toBlob(doc);
}

/** 导出 Word 并触发浏览器下载 —— 给用户拿到一份可在 Word 里继续修改的简历 */
export async function exportResumeToDocx(title: string, primaryColor: string | undefined, sections: SectionItem[]) {
  const blob = await buildResumeDocx(primaryColor, sections);

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title || "简历"}.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
