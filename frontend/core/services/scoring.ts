/**
 * Cornell 笔记计分工具
 *
 * 每个学习步骤有 3 个文本字段（线索/笔记/总结），
 * 各有权重和字数阈值。
 *
 * 计分策略（"无惩罚"模式）：
 *   有内容 → 80 基础分 + 20 × min(1, 字数/阈值)
 *   为空   → 0
 */

import { unitKeyOf, type SkillNote } from "@core/models/skill";

const THRESHOLDS = {
  cues: 50,    // 线索栏字数阈值
  notes: 200,  // 笔记栏字数阈值
  summary: 100, // 总结栏字数阈值
} as const;

const WEIGHTS = {
  cues: 1,
  notes: 2,
  summary: 1,
} as const;

export interface CornellNotes {
  cues: string[];
  notes: string;
  summary: string;
}

export interface StepScore {
  step: number;
  score: number;        // 0–100
  details: {
    cuesChars: number;
    cuesScore: number;
    notesChars: number;
    notesScore: number;
    summaryChars: number;
    summaryScore: number;
  };
}

export interface ScoringResult {
  stepScores: StepScore[];
  overall: number;       // 0–100 技能总掌握度
}

/** 单字段字数 → 得分 */
function fieldScore(chars: number, threshold: number): number {
  if (chars <= 0) return 0;
  return 80 + 20 * Math.min(1, chars / threshold);
}

/** 计算单个步骤的 Cornell 笔记得分 */
export function calculateStepScore(cornell: CornellNotes): Omit<StepScore, 'step'> {
  const cuesChars = (cornell.cues || []).reduce((s, c) => s + (c || '').trim().length, 0);
  const notesChars = (cornell.notes || '').trim().length;
  const summaryChars = (cornell.summary || '').trim().length;

  const cuesScore = fieldScore(cuesChars, THRESHOLDS.cues);
  const notesScore = fieldScore(notesChars, THRESHOLDS.notes);
  const summaryScore = fieldScore(summaryChars, THRESHOLDS.summary);

  const totalWeight = WEIGHTS.cues + WEIGHTS.notes + WEIGHTS.summary;
  const weighted = (
    cuesScore * WEIGHTS.cues +
    notesScore * WEIGHTS.notes +
    summaryScore * WEIGHTS.summary
  ) / totalWeight;

  return {
    score: Math.round(weighted * 10) / 10,
    details: { cuesChars, cuesScore, notesChars, notesScore, summaryChars, summaryScore },
  };
}

/** 读取浏览器里的旧笔记（搬服务端之前写的）。只在服务端还没有这条时用来认领一次，
 *  认领完就归服务端管 —— 留着这个函数是为了别把用户写过的笔记丢在浏览器里 */
export function loadCornellFromStorage(skillId: number, stepNumber: number): CornellNotes | null {
  try {
    const raw = localStorage.getItem(`cornell__${skillId}__step${stepNumber}`);
    if (!raw) return null;
    return JSON.parse(raw) as CornellNotes;
  } catch {
    return null;
  }
}

/** 某块内容的笔记。按 unit_key（节点 id）找，不再按步骤号 */
export function findCornell(notes: SkillNote[], unitKey: string): CornellNotes | null {
  const raw = notes.find((n) => n.unit_key === unitKey)?.cornell;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CornellNotes;
  } catch {
    return null;
  }
}

/** 计算技能全部单元的得分 */
export function calculateAllStepScores(
  notes: SkillNote[],
  steps: { step: number; node_ids?: string[] }[],
): ScoringResult {
  const stepScores: StepScore[] = steps.map((s) => {
    const cornell = findCornell(notes, unitKeyOf(s));
    const base = cornell
      ? calculateStepScore(cornell)
      : { score: 0, details: { cuesChars: 0, cuesScore: 0, notesChars: 0, notesScore: 0, summaryChars: 0, summaryScore: 0 } };
    return { step: s.step, ...base };
  });

  const overall =
    stepScores.length > 0
      ? Math.round(stepScores.reduce((sum, s) => sum + s.score, 0) / stepScores.length)
      : 0;

  return { stepScores, overall };
}
