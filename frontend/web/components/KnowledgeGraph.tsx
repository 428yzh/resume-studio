import type { GraphNode } from "@core/models/skill";

/* 知识图谱 · 网状图（wiki 那种：点 + 连线）
   位置全部由角度算出来，不引 d3 / 力导向 —— 图谱是严格的树（≤3 层），树不需要物理引擎，
   确定性布局每次打开都一样，也好测。
   只画结构，不画分数：分数全在 ScoreMap（分数地图）那张缩进树上，
   两处都标分数会各说各的（超长标题的节点上更是摆不下）。 */
const W = 760;
const H = 480;
const CX = W / 2;
const CY = H / 2;
const R1 = 120; // 顶层块
const R2 = 208; // 往下再拆一层

type Placed = { node: GraphNode; x: number; y: number; depth: 1 | 2 };

/** 弧线：控制点从弦的中点再往外推一点，比直线更像图谱而非文件夹树 */
function arc(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return `M ${x1} ${y1} Q ${mx + (mx - CX) * 0.08} ${my + (my - CY) * 0.08} ${x2} ${y2}`;
}

export function layout(nodes: GraphNode[]) {
  const placed: Placed[] = [];
  const edges: { d: string; depth: 1 | 2 }[] = [];
  const step = (Math.PI * 2) / Math.max(nodes.length, 1);

  nodes.forEach((nd, i) => {
    const a = -Math.PI / 2 + i * step; // 从正上方开始
    const x = CX + R1 * Math.cos(a);
    const y = CY + R1 * Math.sin(a);
    placed.push({ node: nd, x, y, depth: 1 });
    edges.push({ d: arc(CX, CY, x, y), depth: 1 });

    const kids = nd.children ?? [];
    const half = step * 0.42; // 在自己那一瓣里摊开，不越到隔壁节点头上
    kids.forEach((k, j) => {
      const ka = kids.length === 1 ? a : a - half + (2 * half * j) / (kids.length - 1);
      const kx = CX + R2 * Math.cos(ka);
      const ky = CY + R2 * Math.sin(ka);
      placed.push({ node: k, x: kx, y: ky, depth: 2 });
      edges.push({ d: arc(x, y, kx, ky), depth: 2 });
    });
  });

  return { placed, edges };
}

/** 标签写在点朝外的那一侧。正上/正下（dx≈0）居中，其余按左右分边 ——
 *  只按 dx 的符号分，是因为两个节点可能一左一右挨在正下方，居中写会撞在一起 */
function labelAt(x: number, y: number, r: number) {
  const dx = x - CX;
  const dy = y - CY;
  const len = Math.hypot(dx, dy) || 1;
  return {
    lx: x + (dx / len) * (r + 10),
    ly: y + (dy / len) * (r + 10),
    anchor: (dx < -10 ? "end" : dx > 10 ? "start" : "middle") as "middle" | "start" | "end",
  };
}

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

export default function KnowledgeGraph({ nodes }: { nodes: GraphNode[] }) {
  const { placed, edges } = layout(nodes);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full max-w-[720px] h-auto mx-auto block"
      role="img"
      aria-label="知识图谱"
      data-testid="knowledge-graph"
    >
      {edges.map((e, i) => (
        <path
          key={`e${i}`}
          d={e.d}
          fill="none"
          strokeWidth={e.depth === 1 ? 1.5 : 1}
          className={e.depth === 1 ? "stroke-hairline" : "stroke-hairline/70"}
        />
      ))}

      {/* 中心是这个技能本身：写顶层块数，不写技能名（面板标题里已经有名字了） */}
      <circle cx={CX} cy={CY} r={30} strokeWidth={1} className="fill-surface stroke-hairline" />
      <text
        x={CX}
        y={CY}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-ink text-[13px] font-semibold"
      >
        {nodes.length} 块
      </text>

      {placed.map((p) => {
        const r = p.depth === 1 ? 7 : 4.5;
        const { lx, ly, anchor } = labelAt(p.x, p.y, r);
        return (
          <g key={p.node.id} className="group">
            <title>{`${p.node.id} ${p.node.title}`}</title>
            <circle
              cx={p.x}
              cy={p.y}
              r={r}
              strokeWidth={1.5}
              className={
                p.depth === 1
                  ? "fill-blue stroke-canvas group-hover:fill-ink"
                  : "fill-blue-light stroke-blue/30 group-hover:fill-blue"
              }
            />
            <text
              x={lx}
              y={ly}
              textAnchor={anchor}
              dominantBaseline="central"
              className={
                p.depth === 1
                  ? "fill-charcoal text-[12px] font-medium group-hover:fill-blue"
                  : "fill-slate text-[11px] group-hover:fill-blue"
              }
            >
              {cut(p.node.title, p.depth === 1 ? 12 : 10)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
