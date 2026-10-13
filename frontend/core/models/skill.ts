export interface Skill {
  id: number;
  name: string;
  category: string;
  /** 0-100 自评；null = 尚未表态（「未验证」） */
  proficiency: number | null;
  source: string;
  notes: string;
  learned_at: string | null;
  created_at: string;
  /** 是否已生成知识图谱。树本身要单独取（getGraph），卡片只需要这个布尔 */
  has_graph: boolean;
  /** 卡片正面的图谱摘要（列表/更新接口现算）；没图谱 → null */
  graph_summary?: GraphSummary | null;
}

/** 卡片正面三件套（设计 4.1）：覆盖率 × 状态 × 单元数。后端 `_graph_summary` 现算 */
export interface GraphSummary {
  /** 技能总分 = 有分的顶层块平均；null = 一块都没测过 */
  score: number | null;
  /** 测过的知识点数（**只数直接证据**：父节点的分是子节点算上来的，不算） */
  tested: number;
  total: number;
  /** 根下有几层（顶层算第 1 层） */
  depth: number;
  /** 图谱切分出的学习单元数（还没生成计划 = 0） */
  units: number;
  lowest: { id: string; title: string; score: number } | null;
}

/** 卡片状态四态（设计 4.1 状态 chip）。none = 没图谱 */
export type SkillStatus = "none" | "untested" | "gap" | "ok";

/** 状态判据。阈值只在这里；「是哪种档」复用 tierOf，不另写一份分界 */
export function statusOf(s: GraphSummary | null | undefined): SkillStatus {
  if (!s || !s.total) return "none";
  // 覆盖不到一半：样本太少，先别提分数（分数与覆盖率必须成对显示，结论 15）
  if (s.tested * 2 < s.total) return "untested";
  if (s.lowest && tierOf(s.lowest.score) === 1) return "gap"; // 有块掉进 <25 缺口档
  return "ok";
}

/** 知识图谱节点。id 由服务端分配（1 / 1.2 / 1.2.3），是分数落点和笔记归属的锚 */
export interface GraphNode {
  id: string;
  title: string;
  children: GraphNode[];
}

/** 一个节点的掌握分。score=null 即未测（不是 0）；answered 含子树，own 只数直接证据 */
export interface NodeScore {
  score: number | null;
  answered: number;
  /** 直接答过的题数（不含子节点累加）。覆盖率只数直接证据：父节点的分是算上来的，不算测过 */
  own?: number;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  /** true = 树的容量约束两次都没过。仍可用，但父节点累加会偏，要显式提示 */
  degraded: boolean;
  issues: string[];
  /** 每个节点的掌握分，GET 图谱时现算（不落库）。未生成图谱 / 老响应没有这个字段 */
  scores?: Record<string, NodeScore>;
}

/** 分数档：4 熟练 / 3 基本可用 / 2 有缝 / 1 缺口 / 0 未测。
 *  和设计稿的 t0–t4 一一对应，**阈值只在这里**，改档位改这一处。 */
export function tierOf(score: number | null | undefined): 0 | 1 | 2 | 3 | 4 {
  if (score === null || score === undefined) return 0;
  if (score >= 75) return 4;
  if (score >= 50) return 3;
  if (score >= 25) return 2;
  return 1;
}

/** 技能总分 = 有分的顶层块平均（未测的块不摊进来）。null = 一块都没测过 */
export function skillTotal(nodes: GraphNode[], scores: Record<string, NodeScore> = {}): number | null {
  const vals = nodes.map((n) => scores[n.id]?.score).filter((s): s is number => typeof s === "number");
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/** 取出图谱里 id 命中的节点（含各自子树），保持原顺序。单元能覆盖多个顶层节点（了解档会合并）。
 *  镜像后端 `_find_nodes` —— 前端要靠它把单元分到的那块挑出来渲染深入讲解入口。 */
export function findNodes(nodes: GraphNode[], ids: string[]): GraphNode[] {
  const want = new Set(ids);
  const out: GraphNode[] = [];
  for (const n of nodes) {
    if (want.has(n.id)) out.push(n);
    else out.push(...findNodes(n.children, ids));
  }
  return out;
}

/** 学习笔记（Cornell 原文）。搬服务端是为了让 AI 能复盘 —— 留在浏览器里，服务端拿不到原文 */
export interface SkillNote {
  unit_key: string;
  /** JSON {cues, notes, summary}，原样存取 */
  cornell: string;
  updated_at?: string;
}

/** 这条笔记挂在哪一块图谱上：节点 id 逗号连接（了解档一个单元会合并顶层节点 → "4,5"）。
 *  不用学习计划的步骤号 —— 换 required_level 重新切分会让旧步骤号指向别的内容，笔记就静默错位。
 *  老计划（② 之前）没有 node_ids，退回 "step{n}"。**跟后端 unit_key 是同一个约定**。 */
export function unitKeyOf(step: { step: number; node_ids?: string[] }): string {
  return step.node_ids?.length ? step.node_ids.join(",") : `step${step.step}`;
}

export interface SkillCreate {
  name: string;
  category?: string;
  proficiency?: number | null;
  source?: string;
  notes?: string;
}

export interface LearningResource {
  id: number;
  skill_id: number;
  title: string;
  url: string;
  type: string;
  completed: boolean;
}

export interface LearningResourceCreate {
  title: string;
  url?: string;
  type?: string;
  completed?: boolean;
}

export interface InterviewQuestion {
  id: number;
  skill_id: number;
  question: string;
  answer: string;
  difficulty: string;
}

export interface InterviewQuestionCreate {
  question: string;
  answer?: string;
  difficulty?: string;
}
