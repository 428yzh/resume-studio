import type { GraphNode, NodeScore } from "@core/models/skill";
import { skillTotal, tierOf } from "@core/models/skill";

/* 分数地图 —— 缩进树，节点底色 = 分数档（设计稿 4.2）。
   和 KnowledgeGraph（网状图）是一对：网状图只画结构、不带分数，
   分数全在这张图上（两处都画分数会各说各的）。
   未测 = 虚线灰（不是 0 分、不参与父节点平均）——见 scoring.py 顶上那段。
   `mode="coverage"` 切换成覆盖率视图（工作台的「分数 / 覆盖率」toggle）：
   底色不再是分数档，而是「这块被直接测过没有」——分数与覆盖率必须成对看（结论 15）。 */

export const TIER_CLS: Record<number, { chip: string; pill: string; name: string }> = {
  4: { chip: "bg-green/15 border-green/40", pill: "text-green", name: "text-ink" },
  3: { chip: "bg-green/5 border-green/20", pill: "text-green/80", name: "text-ink" },
  2: { chip: "bg-surface border-hairline", pill: "text-slate", name: "text-ink" },
  1: { chip: "bg-amber/10 border-amber/30", pill: "text-amber", name: "text-ink" },
  0: { chip: "bg-transparent border-dashed border-muted", pill: "text-muted", name: "text-muted" },
};

const TESTED_CLS = { chip: "bg-blue-light/40 border-blue/25", pill: "text-blue", name: "text-ink" };
const UNTESTED_CLS = TIER_CLS[0];

const LEGEND: [number, string][] = [
  [4, "≥ 75 熟练"],
  [3, "50–74 基本可用"],
  [2, "25–49 有缝"],
  [1, "< 25 缺口"],
  [0, "未测 · 不参与平均"],
];

const COVERAGE_LEGEND: [string, string][] = [
  [TESTED_CLS.chip, "已直接作答"],
  [UNTESTED_CLS.chip, "未测 · 只数直接证据（孩子测了不算父节点测过）"],
];

export type ScoreMapMode = "score" | "coverage";

function Chip({ title, src, score, own = 0, mode, pillText, onClick, selected }: {
  title: string;
  src?: string;
  score?: number | null;
  own?: number;
  mode: ScoreMapMode;
  /** 覆盖率模式下根 chip 的胶囊要显示百分比，不是题数 */
  pillText?: string;
  /** 点选（工作台的「分数来源」框要跟着选中的节点走） */
  onClick?: () => void;
  selected?: boolean;
}) {
  const t = tierOf(score);
  const tested = own > 0;
  const c = mode === "coverage" ? (tested ? TESTED_CLS : UNTESTED_CLS) : TIER_CLS[t];
  const dashed = mode === "coverage" ? !tested : t === 0;
  const text = mode === "coverage" ? (pillText ?? (tested ? `${own} 题` : "未测")) : (score ?? "未测");
  return (
    <div
      onClick={onClick}
      className={`inline-flex items-center gap-2 border rounded-[10px] px-3 py-1.5 text-[13px] max-w-full ${
        selected ? "ring-2 ring-blue/30" : ""
      } ${onClick ? "cursor-pointer" : ""} ${c.chip}`}
    >
      <span className={`font-semibold truncate ${c.name}`} title={title}>{title}</span>
      <span
        className={`shrink-0 text-xs font-bold rounded-full px-2 py-px bg-canvas tabular-nums border ${
          dashed ? "border-dashed border-muted" : "border-transparent"
        } ${c.pill}`}
      >
        {text}
      </span>
      {src && <span className="shrink-0 text-[11px] text-muted font-normal">{src}</span>}
    </div>
  );
}

function countAll(nodes: GraphNode[]): number {
  return nodes.reduce((n, x) => n + 1 + countAll(x.children ?? []), 0);
}

function NodeRow({ node, scores, mode, selected, onSelect }: {
  node: GraphNode;
  scores: Record<string, NodeScore>;
  mode: ScoreMapMode;
  selected?: string | null;
  onSelect?: (nodeId: string) => void;
}) {
  const s = scores[node.id];
  const kids = node.children ?? [];
  // 来源注脚：有子节点说「测了几个子节点」，叶子说「答了几题」——
  // 父节点的 answered 含子节点累加，标成自己答的题数会让人以为这块被直考过
  const tested = kids.filter((k) => scores[k.id]?.score != null).length;
  const direct = kids.filter((k) => (scores[k.id]?.own ?? 0) > 0).length;
  const src = kids.length
    ? mode === "coverage"
      ? (direct ? `${direct}/${kids.length} 直接测过` : "子节点都没测过")
      : (tested ? `${tested}/${kids.length} 已测` : "子节点都没测")
    : (s?.answered ? `已答 ${s.answered} 题` : "无作答记录");

  return (
    <li>
      <Chip
        mode={mode}
        title={`${node.id} ${node.title}`}
        score={s?.score ?? null}
        own={s?.own ?? 0}
        src={src}
        selected={selected === node.id}
        onClick={onSelect ? () => onSelect(node.id) : undefined}
      />
      {kids.length > 0 && (
        <ul className="ml-4 mt-1 space-y-1 border-l border-hairline pl-4">
          {kids.map((k) => (
            <NodeRow key={k.id} node={k} scores={scores} mode={mode} selected={selected} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function ScoreMap({
  nodes, scores = {}, label, mode = "score", selected, onSelect,
}: {
  nodes: GraphNode[];
  scores?: Record<string, NodeScore>;
  label?: string;
  mode?: ScoreMapMode;
  /** 点选节点（可选）。工作台用它把「分数来源」框接上去；技能库不传就是纯展示 */
  selected?: string | null;
  onSelect?: (nodeId: string) => void;
}) {
  const total = skillTotal(nodes, scores);
  const testedTops = nodes.filter((n) => scores[n.id]?.score != null).length;
  const totalCount = countAll(nodes);
  const testedCount = Object.values(scores).filter((s) => (s.own ?? 0) > 0).length;

  return (
    <div data-testid="score-map">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 bg-surface border border-hairline rounded-lg px-3.5 py-2.5 mb-3 text-[11px] text-slate">
        {(mode === "coverage" ? COVERAGE_LEGEND : LEGEND).map(([t, text]) => (
          <span key={String(t)} className="inline-flex items-center gap-1.5">
            <span className={`w-3.5 h-3.5 rounded border ${typeof t === "number" ? TIER_CLS[t].chip : t}`} />
            {text}
          </span>
        ))}
      </div>

      <ul className="space-y-1">
        <li>
          {mode === "coverage" ? (
            <Chip
              mode={mode}
              title={label ?? "本技能"}
              own={testedCount}
              pillText={`${totalCount ? Math.round((testedCount / totalCount) * 100) : 0}%`}
              src={`技能级 · ${testedCount}/${totalCount} 个知识点直接测过`}
            />
          ) : (
            <Chip
              mode={mode}
              title={label ?? "本技能"}
              score={total}
              src={`技能级 · ${testedTops}/${nodes.length} 个顶层块已测`}
            />
          )}
          <ul className="ml-4 mt-1 space-y-1 border-l border-hairline pl-4">
            {nodes.map((n) => (
              <NodeRow key={n.id} node={n} scores={scores} mode={mode} selected={selected} onSelect={onSelect} />
            ))}
          </ul>
        </li>
      </ul>
    </div>
  );
}
