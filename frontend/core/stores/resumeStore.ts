import { create } from "zustand";
import { api } from "@core/api/client";
import { ensureSections } from "@core/services/resumeService";
import type { Resume, ResumeCreate, ResumeUpdate } from "@core/models/resume";
import type { ResumeTemplate } from "@core/models/template";

interface ResumeState {
  resumes: Resume[];
  currentResume: Resume | null;
  templates: ResumeTemplate[];
  loading: boolean;
  error: string | null;

  fetchResumes: () => Promise<void>;
  fetchResume: (id: number) => Promise<void>;
  createResume: (data: ResumeCreate) => Promise<Resume>;
  updateResume: (id: number, data: ResumeUpdate) => Promise<void>;
  deleteResume: (id: number) => Promise<void>;
  fetchTemplates: () => Promise<void>;
}

export const useResumeStore = create<ResumeState>((set, get) => ({
  resumes: [],
  currentResume: null,
  templates: [],
  loading: false,
  error: null,

  fetchResumes: async () => {
    set({ loading: true, error: null });
    try {
      const resumes = await api.get<Resume[]>("/api/resumes");
      set({ resumes, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  fetchResume: async (id: number) => {
    set({ loading: true, error: null });
    try {
      const raw = await api.get<Resume>(`/api/resumes/${id}`);
      set({ currentResume: ensureSections(raw), loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  createResume: async (data: ResumeCreate) => {
    set({ loading: true, error: null });
    try {
      const resume = await api.post<Resume>("/api/resumes", data);
      set((s) => ({ resumes: [resume, ...s.resumes], loading: false }));
      return resume;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  updateResume: async (id: number, data: ResumeUpdate) => {
    set({ loading: true, error: null });
    try {
      const updated = await api.put<Resume>(`/api/resumes/${id}`, data);
      set((s) => ({
        currentResume: s.currentResume?.id === id ? updated : s.currentResume,
        resumes: s.resumes.map((r) => (r.id === id ? updated : r)),
        loading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  deleteResume: async (id: number) => {
    set({ loading: true, error: null });
    try {
      await api.del(`/api/resumes/${id}`);
      set((s) => ({
        resumes: s.resumes.filter((r) => r.id !== id),
        currentResume: s.currentResume?.id === id ? null : s.currentResume,
        loading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  fetchTemplates: async () => {
    try {
      const templates = await api.get<ResumeTemplate[]>("/api/templates");
      set({ templates });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },
}));
