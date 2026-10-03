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
}

/** 知识图谱节点。id 由服务端分配（1 / 1.2 / 1.2.3），是分数落点和笔记归属的锚 */
export interface GraphNode {
  id: string;
  title: string;
  children: GraphNode[];
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  /** true = 树的容量约束两次都没过。仍可用，但父节点累加会偏，要显式提示 */
  degraded: boolean;
  issues: string[];
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
