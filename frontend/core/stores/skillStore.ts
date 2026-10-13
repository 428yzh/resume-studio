export interface LearningPlan {
  required_level: string;
  /** node_ids = 这个单元覆盖了图谱的哪几个顶层节点（结论 9：一个单元 = 图谱的一块）。
   *  可选：② 之前生成的 9 个旧计划没有这个字段，不必迁移（结论 33）。 */
  steps: { step: number; type?: string; title: string; description: string; estimated_hours: number; topics: string[]; node_ids?: string[] }[];
  milestones: string[];
  /** 覆盖没通过校验时的缺口清单，正常为 undefined */
  coverage_issues?: string[];
}

import { create } from "zustand";
import { api } from "@core/api/client";
import { hasUnavailableField } from "@core/services/aiDegrade";
import type { Skill, SkillCreate, LearningResource, LearningResourceCreate, InterviewQuestion, InterviewQuestionCreate, KnowledgeGraph, SkillNote } from "@core/models/skill";
import type { JDAnalysis, JDAnalysisListItem } from "@core/models/jd";

interface SkillState {
  skills: Skill[];
  analyses: JDAnalysisListItem[];
  currentAnalysis: JDAnalysis | null;
  resources: LearningResource[];
  questions: InterviewQuestion[];
  learningPlan: LearningPlan | null;
  learningPlanSkillId: number | null; // learningPlan 属于哪个技能，防止跨技能串用
  loadingPlan: boolean;
  /** 生成学习计划的开始时刻（等待计时器锚点：锚请求发出，不锚组件挂载） */
  planStartedAt: number | null;
  knowledgeGraph: KnowledgeGraph | null;
  graphSkillId: number | null; // knowledgeGraph 属于哪个技能：展开 A 再展开 B，不能再拿 A 的树渲染 B
  loadingGraph: boolean;
  /** 当前技能的笔记（含那块内容的 Cornell 原文） */
  notes: SkillNote[];
  /** notes 属于哪个技能 —— 同 learningPlanSkillId / graphSkillId，防跨技能串用 */
  notesSkillId: number | null;
  loading: boolean;
  error: string | null;

  fetchSkills: (category?: string) => Promise<void>;
  addSkill: (data: SkillCreate) => Promise<Skill>;
  updateSkill: (id: number, data: Partial<SkillCreate>) => Promise<void>;
  deleteSkill: (id: number) => Promise<void>;
  analyzeJD: (jdText: string, company?: string, position?: string, resumeId?: number) => Promise<JDAnalysis>;
  fetchAnalyses: () => Promise<void>;
  fetchAnalysis: (id: number) => Promise<void>;
  updateAnalysis: (id: number, data: { title?: string; company?: string; position?: string }) => Promise<void>;
  deleteAnalysis: (id: number) => Promise<void>;
  fetchResources: (skillId: number) => Promise<void>;
  addResource: (skillId: number, data: LearningResourceCreate) => Promise<void>;
  updateResource: (skillId: number, resourceId: number, data: Partial<LearningResourceCreate>) => Promise<void>;
  deleteResource: (skillId: number, resourceId: number) => Promise<void>;
  fetchQuestions: (skillId: number) => Promise<void>;
  addQuestion: (skillId: number, data: InterviewQuestionCreate) => Promise<void>;
  updateQuestion: (skillId: number, questionId: number, data: Partial<InterviewQuestionCreate>) => Promise<void>;
  deleteQuestion: (skillId: number, questionId: number) => Promise<void>;
  fetchLearningPlan: (skillId: number) => Promise<void>;
  generateLearningPlan: (skillId: number, requiredLevel: string, priorUnderstanding?: string) => Promise<void>;
  fetchGraph: (skillId: number) => Promise<KnowledgeGraph | null>;
  generateGraph: (skillId: number) => Promise<void>;
  fetchNotes: (skillId: number) => Promise<SkillNote[]>;
  saveNote: (skillId: number, unitKey: string, cornell: string) => Promise<void>;
  importSkillFromJD: (name: string, category: string, source: string) => Promise<Skill | null>;
}

export const useSkillStore = create<SkillState>((set) => ({
  skills: [],
  analyses: [],
  currentAnalysis: null,
  resources: [],
  questions: [],
  learningPlan: null,
  learningPlanSkillId: null,
  loadingPlan: false,
  planStartedAt: null,
  knowledgeGraph: null,
  graphSkillId: null,
  loadingGraph: false,
  notes: [],
  notesSkillId: null,
  loading: false,
  error: null,

  fetchSkills: async (category?: string) => {
    set({ loading: true, error: null });
    try {
      const url = category ? `/api/skills?category=${category}` : "/api/skills";
      const skills = await api.get<Skill[]>(url);
      set({ skills, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  addSkill: async (data: SkillCreate) => {
    set({ loading: true, error: null });
    try {
      const skill = await api.post<Skill>("/api/skills", data);
      set((s) => ({ skills: [skill, ...s.skills], loading: false }));
      return skill;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  updateSkill: async (id: number, data: Partial<SkillCreate>) => {
    set({ loading: true, error: null });
    try {
      const updated = await api.put<Skill>(`/api/skills/${id}`, data);
      set((s) => ({
        skills: s.skills.map((sk) => (sk.id === id ? updated : sk)),
        loading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  deleteSkill: async (id: number) => {
    set({ loading: true, error: null });
    try {
      await api.del(`/api/skills/${id}`);
      set((s) => ({
        skills: s.skills.filter((sk) => sk.id !== id),
        loading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  analyzeJD: async (jdText: string, company = "", position = "", resumeId?: number) => {
    set({ loading: true, error: null });
    try {
      const result = await api.post<JDAnalysis>("/api/jd/analyze", { jd_text: jdText, company, position, resume_id: resumeId ?? null });
      set((s) => ({
        currentAnalysis: result,
        analyses: [{ id: result.id, company: result.company, position: result.position, title: result.title, resume_id: result.resume_id, created_at: result.created_at }, ...s.analyses],
        loading: false,
      }));
      return result;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  fetchAnalyses: async () => {
    try {
      const analyses = await api.get<JDAnalysisListItem[]>("/api/jd/analyses");
      set({ analyses });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  fetchAnalysis: async (id: number) => {
    set({ loading: true, error: null });
    try {
      const analysis = await api.get<JDAnalysis>(`/api/jd/analyses/${id}`);
      set({ currentAnalysis: analysis, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  updateAnalysis: async (id: number, data: { title?: string; company?: string; position?: string }) => {
    set({ error: null });
    try {
      const updated = await api.put<JDAnalysis>(`/api/jd/analyses/${id}`, data);
      set((state) => ({
        currentAnalysis: state.currentAnalysis?.id === id ? updated : state.currentAnalysis,
        analyses: state.analyses.map((a) => a.id === id ? { ...a, ...data } : a),
      }));
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  deleteAnalysis: async (id: number) => {
    set({ error: null });
    try {
      await api.del(`/api/jd/analyses/${id}`);
      set((state) => ({
        analyses: state.analyses.filter((a) => a.id !== id),
        currentAnalysis: state.currentAnalysis?.id === id ? null : state.currentAnalysis,
      }));
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  fetchResources: async (skillId: number) => {
    try {
      const resources = await api.get<LearningResource[]>(`/api/skills/${skillId}/resources`);
      set({ resources });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  addResource: async (skillId: number, data: LearningResourceCreate) => {
    try {
      const resource = await api.post<LearningResource>(`/api/skills/${skillId}/resources`, data);
      set((s) => ({ resources: [...s.resources, resource] }));
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  updateResource: async (skillId: number, resourceId: number, data: Partial<LearningResourceCreate>) => {
    try {
      const updated = await api.put<LearningResource>(`/api/skills/${skillId}/resources/${resourceId}`, data);
      set((s) => ({
        resources: s.resources.map((r) => (r.id === resourceId ? updated : r)),
      }));
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  deleteResource: async (skillId: number, resourceId: number) => {
    try {
      await api.del(`/api/skills/${skillId}/resources/${resourceId}`);
      set((s) => ({ resources: s.resources.filter((r) => r.id !== resourceId) }));
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  fetchQuestions: async (skillId: number) => {
    try {
      const questions = await api.get<InterviewQuestion[]>(`/api/skills/${skillId}/questions`);
      set({ questions });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  addQuestion: async (skillId: number, data: InterviewQuestionCreate) => {
    try {
      const question = await api.post<InterviewQuestion>(`/api/skills/${skillId}/questions`, data);
      set((s) => ({ questions: [...s.questions, question] }));
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  updateQuestion: async (skillId: number, questionId: number, data: Partial<InterviewQuestionCreate>) => {
    try {
      const updated = await api.put<InterviewQuestion>(`/api/skills/${skillId}/questions/${questionId}`, data);
      set((s) => ({
        questions: s.questions.map((q) => (q.id === questionId ? updated : q)),
      }));
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  deleteQuestion: async (skillId: number, questionId: number) => {
    try {
      await api.del(`/api/skills/${skillId}/questions/${questionId}`);
      set((s) => ({ questions: s.questions.filter((q) => q.id !== questionId) }));
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  fetchLearningPlan: async (skillId: number) => {
    // GET 只负责拉取已落库的计划，不碰 loadingPlan：生成进行中（loadingPlan=true）时收起页面再展开，
    // 若这里把 loadingPlan 重置会导致按钮复活、用户重复触发生成（双 POST）
    try {
      const plan = await api.get<LearningPlan | null>(`/api/skills/${skillId}/learning-plan`);
      if (useSkillStore.getState().loadingPlan) return; // 生成中，不覆盖进行中的状态
      // 历史遗留的降级计划不进视图：退回输入表单，重新生成按钮保持可用
      if (plan && hasUnavailableField(plan)) {
        set({ learningPlan: null, learningPlanSkillId: skillId, error: "AI 服务暂不可用，请稍后再试" });
        return;
      }
      set({ learningPlan: plan, learningPlanSkillId: skillId, error: null });
    } catch (e) {
      if (!useSkillStore.getState().loadingPlan) set({ error: (e as Error).message });
    }
  },

  generateLearningPlan: async (skillId: number, requiredLevel: string, priorUnderstanding = "") => {
    if (useSkillStore.getState().loadingPlan) return; // 已在生成，防收起重开后的重复触发
    set({ loadingPlan: true, planStartedAt: Date.now(), error: null });
    try {
      const plan = await api.post<LearningPlan>(`/api/skills/${skillId}/learning-plan`, {
        required_level: requiredLevel,
        prior_understanding: priorUnderstanding,
      });
      // AI 不可用时会返回 HTTP 200 + 降级文案，把它当失败处理：
      // 退回输入表单（learningPlan=null），按钮留在原地可重试，重试时显示「生成中」反馈
      if (hasUnavailableField(plan)) {
        set({ learningPlan: null, learningPlanSkillId: skillId, error: "AI 服务暂不可用，请稍后再试", loadingPlan: false });
        return;
      }
      set({ learningPlan: plan, learningPlanSkillId: skillId, loadingPlan: false });
    } catch (e) {
      // 生成失败也退回输入表单：不留降级/旧计划在视图里卡住重试
      set({ learningPlan: null, learningPlanSkillId: skillId, error: (e as Error).message, loadingPlan: false });
    }
  },

  fetchGraph: async (skillId: number) => {
    try {
      const graph = await api.get<KnowledgeGraph | null>(`/api/skills/${skillId}/graph`);
      set({ knowledgeGraph: graph, graphSkillId: skillId });
      return graph;
    } catch (e) {
      set({ error: (e as Error).message });
      return null;
    }
  },

  generateGraph: async (skillId: number) => {
    if (useSkillStore.getState().loadingGraph) return; // 已在生成，防重复触发（一次要十几秒）
    set({ loadingGraph: true, error: null });
    try {
      const graph = await api.post<KnowledgeGraph>(`/api/skills/${skillId}/graph`, {});
      if (!graph.nodes.length) {
        set({ loadingGraph: false, error: "AI 服务暂不可用，请稍后再试" });
        return;
      }
      set({ knowledgeGraph: graph, graphSkillId: skillId, loadingGraph: false });
      // 列表里的 has_graph 是生成前拉的，本地补上，省一次全量刷新
      set((s) => ({ skills: s.skills.map((k) => (k.id === skillId ? { ...k, has_graph: true } : k)) }));
    } catch (e) {
      set({ error: (e as Error).message, loadingGraph: false });
    }
  },

  fetchNotes: async (skillId: number) => {
    try {
      const notes = await api.get<SkillNote[]>(`/api/skills/${skillId}/notes`);
      set({ notes, notesSkillId: skillId });
      return notes;
    } catch (e) {
      set({ error: (e as Error).message });
      return [];
    }
  },

  saveNote: async (skillId: number, unitKey: string, cornell: string) => {
    // PUT 覆盖：自动保存每次覆盖前一版，同一块内容只留一条
    const saved = await api.put<SkillNote>(`/api/skills/${skillId}/notes`, { unit_key: unitKey, cornell });
    // 本地补上，省一次全量刷新（步骤环的分数直接读这个数组）
    set((s) => ({
      notes: [...s.notes.filter((n) => n.unit_key !== unitKey), saved],
      notesSkillId: skillId,
    }));
  },

  importSkillFromJD: async (name: string, category: string, source: string) => {
    try {
      const skill = await api.post<Skill>("/api/skills", { name, category, source });
      set((s) => ({ skills: [skill, ...s.skills] }));
      return skill;
    } catch (e) {
      set({ error: (e as Error).message });
      return null;
    }
  },
}));
