export interface FeynmanMessage {
  id: number;
  role: "user" | "ai";
  content: string;
  level: number | null;
  action: string;
  created_at: string;
}

export interface FeynmanProblem {
  id: number;
  topic_id: number;
  content: string;
  source: string;
  status: "open" | "resolved";
  created_at: string;
  resolved_at: string | null;
}

export interface FeynmanTopic {
  id: number;
  skill_id: number | null;
  name: string;
  level: number;
  status: "learning" | "completed";
  breadth_left: number;
  depth_left: number;
  learning_summary: Record<string, unknown> | null;
  weak_points: string[];
  problems: FeynmanProblem[];
  created_at: string;
  updated_at: string;
  messages: FeynmanMessage[];
}

export interface FeynmanTopicListItem {
  id: number;
  skill_id: number | null;
  name: string;
  level: number;
  status: "learning" | "completed";
  breadth_left: number;
  depth_left: number;
  weak_points: string[];
  has_problems: boolean;
  total_messages: number;
  created_at: string;
  updated_at: string;
}

export interface CreateTopicRequest {
  skill_id?: number | null;
  name: string;
}

/** 五级理解状态机 */
export const LEVEL_LABELS: Record<number, string> = {
  1: "混沌",
  2: "字面",
  3: "关联",
  4: "重构",
  5: "辩证",
};

export const LEVEL_DESCS: Record<number, string> = {
  1: "未知术语，结构缺失",
  2: "能复述，缺例子/同义词",
  3: "搭逻辑链，发现缺环",
  4: "能用自己话重构",
  5: "能找矛盾与边界",
};

export const LEVEL_COLORS: Record<number, string> = {
  1: "bg-surface text-slate border-hairline",
  2: "bg-blue/10 text-blue border-blue/20",
  3: "bg-amber/10 text-amber border-amber/20",
  4: "bg-green/10 text-green border-green/20",
  5: "bg-red/10 text-red border-red/20",
};
