import { pdf } from "@react-pdf/renderer";
import { createElement } from "react";
import ResumePDF from "@web/components/ResumePDF";
import type { ResumeTemplate } from "@core/models/template";

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
  const blob = await pdf(element as Parameters<typeof pdf>[0]).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${resume.title || "简历"}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
