import { statusOf, type GraphSummary, type SkillStatus } from "@core/models/skill";

/** 卡片 / 工作台共用的状态 chip（设计 4.1 四态）。判据在 `statusOf`，这里只管文案和颜色 */
const META: Record<SkillStatus, { label: string; cls: string }> = {
  none: { label: "未生成图谱", cls: "bg-surface text-muted" },
  untested: { label: "大部分未测", cls: "bg-blue-light/60 text-blue" },
  gap: { label: "有缺口", cls: "bg-amber/10 text-amber" },
  ok: { label: "状态可信", cls: "bg-green/10 text-green" },
};

export default function SkillStatusChip({ summary }: { summary: GraphSummary | null | undefined }) {
  const m = META[statusOf(summary)];
  return (
    <span className={`shrink-0 text-[11px] rounded-full px-2.5 py-0.5 font-medium ${m.cls}`}>
      {m.label}
    </span>
  );
}
