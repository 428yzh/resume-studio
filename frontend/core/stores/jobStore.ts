import { create } from "zustand";
import { api } from "@core/api/client";
import type { Job } from "@core/models/job";

export const STALE_MS = 24 * 60 * 60 * 1000; // 岗位缓存过期时间：24h

interface JobState {
  jobs: Job[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;

  fetchJobs: () => Promise<void>;
  refreshJobs: () => Promise<void>;
}

export const useJobStore = create<JobState>((set) => ({
  jobs: [],
  loading: false,
  refreshing: false,
  error: null,

  fetchJobs: async () => {
    set({ loading: true, error: null });
    try {
      const jobs = await api.get<Job[]>("/api/jobs");
      set({ jobs, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  refreshJobs: async () => {
    set({ refreshing: true, error: null });
    try {
      const jobs = await api.post<Job[]>("/api/jobs/refresh");
      set({ jobs, refreshing: false });
    } catch (e) {
      set({ error: (e as Error).message, refreshing: false });
      throw e;
    }
  },
}));

/** 缓存是否过期：无岗位或最新岗位超过 24h 需要刷新 */
export function isJobsStale(jobs: Job[]): boolean {
  if (jobs.length === 0) return true;
  const latest = Math.max(...jobs.map((j) => new Date(j.created_at).getTime()));
  return Date.now() - latest > STALE_MS;
}
