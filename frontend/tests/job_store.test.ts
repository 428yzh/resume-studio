import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock api client
vi.mock("../core/api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
  },
}));

import { useJobStore, isJobsStale, STALE_MS } from "../core/stores/jobStore";
import { api } from "../core/api/client";
import type { Job } from "../core/models/job";

function makeJob(over: Partial<Job> = {}): Job {
  return {
    id: 1,
    title: "前端工程师",
    company: "腾讯",
    city: "深圳",
    salary: "20-40K",
    experience: "3-5年",
    education: "本科",
    jd: "精通 React",
    url: "https://example.com/job/1",
    created_at: new Date().toISOString(),
    ...over,
  };
}

describe("TC-STORE-JOB-001: JobStore fetch jobs", () => {
  beforeEach(() => {
    useJobStore.setState({ jobs: [], loading: false, refreshing: false, error: null });
  });

  it("should load jobs from GET /api/jobs", async () => {
    const mockJobs = [makeJob({ id: 1 }), makeJob({ id: 2, title: "后端工程师" })];
    vi.mocked(api.get).mockResolvedValue(mockJobs);

    await useJobStore.getState().fetchJobs();
    expect(api.get).toHaveBeenCalledWith("/api/jobs");
    expect(useJobStore.getState().jobs.length).toBe(2);
    expect(useJobStore.getState().loading).toBe(false);
  });
});

describe("TC-STORE-JOB-002: JobStore refresh jobs", () => {
  beforeEach(() => {
    useJobStore.setState({ jobs: [], loading: false, refreshing: false, error: null });
  });

  it("should post refresh and store new jobs", async () => {
    const mockJobs = [makeJob({ id: 3 })];
    vi.mocked(api.post).mockResolvedValue(mockJobs);

    await useJobStore.getState().refreshJobs();
    expect(api.post).toHaveBeenCalledWith("/api/jobs/refresh");
    expect(useJobStore.getState().jobs.length).toBe(1);
    expect(useJobStore.getState().refreshing).toBe(false);
  });
});

describe("TC-STORE-JOB-003: isJobsStale staleness", () => {
  it("empty jobs → stale", () => {
    expect(isJobsStale([])).toBe(true);
  });

  it("fresh jobs → not stale", () => {
    const fresh = [makeJob({ created_at: new Date(Date.now() - 60_000).toISOString() })];
    expect(isJobsStale(fresh)).toBe(false);
  });

  it("jobs older than STALE_MS → stale", () => {
    const old = [makeJob({ created_at: new Date(Date.now() - STALE_MS - 60_000).toISOString() })];
    expect(isJobsStale(old)).toBe(true);
  });
});
