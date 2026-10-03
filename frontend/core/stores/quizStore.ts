import { create } from "zustand";
import { api } from "@core/api/client";
import type { Question, QuizSession, QuizSessionDetail, SessionListItem, GenerateRequest } from "@core/models/quiz";
import { hasUnavailableField } from "@core/services/aiDegrade";

interface QuizState {
  // Lists
  sessions: SessionListItem[];
  currentSession: QuizSessionDetail | null;

  // Question generation
  generatedQuestions: Question[];
  currentAnswers: Record<number, string>;

  // Loading
  loading: boolean;
  submitting: boolean;
  error: string | null;

  // Actions
  generateQuestions: (req: GenerateRequest) => Promise<Question[]>;
  createSession: (mode: "practice" | "exam", questionIds: number[]) => Promise<QuizSession>;
  fetchSession: (id: number) => Promise<void>;
  submitSession: (sessionId: number, answers: Record<number, string>) => Promise<void>;
  fetchSessions: () => Promise<void>;
  setAnswer: (questionId: number, answer: string) => void;
  clearGenerated: () => void;
}

export const useQuizStore = create<QuizState>((set, get) => ({
  sessions: [],
  currentSession: null,
  generatedQuestions: [],
  currentAnswers: {},
  loading: false,
  submitting: false,
  error: null,

  generateQuestions: async (req: GenerateRequest) => {
    set({ loading: true, error: null });
    try {
      const questions = await api.post<Question[]>("/api/questions/generate", req);
      if (hasUnavailableField(questions)) {
        set({ error: "AI 服务暂不可用，请稍后再试", loading: false });
        return [];
      }
      set({ generatedQuestions: questions, currentAnswers: {}, loading: false });
      return questions;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  createSession: async (mode: "practice" | "exam", questionIds: number[]) => {
    set({ loading: true, error: null });
    try {
      const session = await api.post<QuizSession>("/api/quiz/sessions", { mode, question_ids: questionIds });
      set({ loading: false });
      return session;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  fetchSession: async (id: number) => {
    set({ loading: true, error: null });
    try {
      const session = await api.get<QuizSessionDetail>(`/api/quiz/sessions/${id}`);
      set({ currentSession: session, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  submitSession: async (sessionId: number, answers: Record<number, string>) => {
    set({ submitting: true, error: null });
    try {
      await api.post(`/api/quiz/sessions/${sessionId}/submit`, { answers });
      // 重新拉取：判分结果（is_correct / ai_score / ai_feedback）只在服务端生成，
      // 不刷新的话交卷后结果页拿到的是交卷前的旧 answers（空数组）。
      await get().fetchSession(sessionId);
      set({ submitting: false });
    } catch (e) {
      set({ error: (e as Error).message, submitting: false });
      throw e;
    }
  },

  fetchSessions: async () => {
    set({ loading: true, error: null });
    try {
      const sessions = await api.get<SessionListItem[]>("/api/quiz/sessions");
      set({ sessions, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  setAnswer: (questionId: number, answer: string) => {
    set((s) => ({ currentAnswers: { ...s.currentAnswers, [questionId]: answer } }));
  },

  clearGenerated: () => {
    set({ generatedQuestions: [], currentAnswers: {} });
  },
}));
