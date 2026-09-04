import { LEVEL_LABELS, LEVEL_COLORS, LEVEL_DESCS } from "@core/models/feynman";

/**
 * 费曼理解等级徽章：L1 混沌 → L5 辩证
 */
export default function LevelBadge({
  level,
  size = "md",
  showDesc = false,
}: {
  level: number | null;
  size?: "sm" | "md";
  showDesc?: boolean;
}) {
  if (level === null) return null;
  const color = LEVEL_COLORS[level] || "bg-surface text-slate border-hairline";
  const label = LEVEL_LABELS[level] || `L${level}`;
  const desc = LEVEL_DESCS[level] || "";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-semibold transition-all duration-200 ${
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      } ${color}`}
      title={desc}
    >
      <span>L{level}</span>
      <span className="opacity-80">{label}</span>
      {showDesc && <span className="opacity-60 font-normal hidden sm:inline">· {desc}</span>}
    </span>
  );
}
