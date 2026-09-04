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

/** 从 localStorage 读取某个步骤的 Cornell 笔记 */
export function loadCornellFromStorage(skillId: number, stepNumber: number): CornellNotes | null {
  try {
    const raw = localStorage.getItem(`cornell__${skillId}__step${stepNumber}`);
    if (!raw) return null;
    return JSON.parse(raw) as CornellNotes;
  } catch {
    return null;
  }
}

/** 计算技能全部步骤的得分 */
export function calculateAllStepScores(
  skillId: number,
  steps: { step: number }[],
): ScoringResult {
  const stepScores: StepScore[] = steps.map((s) => {
    const cornell = loadCornellFromStorage(skillId, s.step);
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
