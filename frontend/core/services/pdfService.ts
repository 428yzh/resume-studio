import { pdf, Font } from "@react-pdf/renderer";
import { createElement } from "react";
import ResumePDF from "@web/components/ResumePDF";
import QuizPDF from "@web/components/QuizPDF";
import type { ResumeTemplate } from "@core/models/template";
import type { Question, QuizAnswer } from "@core/models/quiz";

/**
 * PDF 内置的 Helvetica 是单字节 WinAnsi 字体，中文会被按码点截断成低字节
 * （"中文测试" → "-‡KÕ"），且不会嵌入字体。必须注册 CJK 字体才能正确出中文。
 * 字体放 public/fonts，仅在导出时按需拉取，不进 JS bundle。
 */
Font.register({
  family: "NotoSansSC",
  fonts: [
    { src: "/fonts/NotoSansSC-Regular.woff", fontWeight: 400 },
    { src: "/fonts/NotoSansSC-Bold.woff", fontWeight: 700 },
  ],
});

/** 生成 PDF 并触发浏览器下载 */
async function download(element: Parameters<typeof pdf>[0], filename: string) {
  const blob = await pdf(element).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** 使用 @react-pdf/renderer 生成并下载 PDF */
export async function exportToPDF(
  resume: {
    id: number;
    title: string;
    template_id: number;
    sections: Record<string, unknown>;
    target_company: string;
    target_position: string;
    created_at: string;
    updated_at: string;
  },
  template: ResumeTemplate,
  sections: { key: string; title: string; data: unknown }[],
) {
  const element = createElement(ResumePDF, { resume, template, sections });
  await download(element as Parameters<typeof pdf>[0], `${resume.title || "简历"}.pdf`);
}

/**
 * 导出题目 PDF，三种形态：
 * - 都不传 → 空白卷（考前练习/考试）
 * - `showAnswers: true` → 只出正确答案（技能复习）
 * - `answers` → 含作答回顾（题目 + 用户答案 + 判定 + 正确答案 + AI 反馈）
 */
export async function exportQuestionsToPDF(options: {
  title: string;
  subtitle?: string;
  questions: Question[];
  answers?: QuizAnswer[];
  showAnswers?: boolean;
}) {
  const element = createElement(QuizPDF, options);
  const suffix = options.showAnswers || options.answers?.length ? "（含答案）" : "（空白卷）";
  await download(element as Parameters<typeof pdf>[0], `${options.title}${suffix}.pdf`);
}
