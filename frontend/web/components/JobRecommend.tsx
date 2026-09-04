import { useEffect, useState } from "react";
import { useJobStore, isJobsStale } from "@core/stores/jobStore";
import type { Job } from "@core/models/job";
import JobDetailModal from "@web/components/JobDetailModal";
import AnimatedNumber from "@web/components/AnimatedNumber";

const VISIBLE_COUNT = 6;

function JobCard({ job, onClick, delay }: { job: Job; onClick: () => void; delay: number }) {
  return (
    <button
      onClick={onClick}
      className="group bg-canvas rounded-xl border border-hairline p-5 text-left transition-all duration-200 hover:border-blue/40 hover:-translate-y-1 hover:shadow-sm active:scale-[0.98]"
      style={{ animation: `fade-in-up 0.5s ease-out ${delay}s both` }}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="font-semibold text-sm text-ink leading-snug truncate">{job.title}</h3>
        <span className="shrink-0 text-blue text-sm leading-none mt-0.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
          →
        </span>
      </div>
      <p className="text-xs text-slate mb-2 truncate">
        {job.company}
        {job.city && <span className="text-muted"> · {job.city}</span>}
      </p>
      {job.salary && <p className="text-sm font-semibold text-blue mb-2">{job.salary}</p>}
      <div className="flex items-center gap-1.5 flex-wrap">
        {job.experience && (
          <span className="text-xs text-muted bg-surface rounded-full px-2 py-0.5">{job.experience}</span>
        )}
        {job.education && (
          <span className="text-xs text-muted bg-surface rounded-full px-2 py-0.5">{job.education}</span>
        )}
      </div>
    </button>
  );
}

export default function JobRecommend() {
  const { jobs, loading, refreshing, error, fetchJobs, refreshJobs } = useJobStore();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [expanded, setExpanded] = useState(false);

  // 首屏：读缓存；为空或超 24h 时自动联网刷新
  useEffect(() => {
    (async () => {
      await fetchJobs();
      if (isJobsStale(useJobStore.getState().jobs)) {
        try {
          await refreshJobs();
        } catch {
          /* 刷新失败保留缓存或空态 */
        }
      }
    })();
  }, []);

  const visible = expanded ? jobs : jobs.slice(0, VISIBLE_COUNT);

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-blue animate-pulse" />
          <div>
            <h2 className="text-xl font-bold text-ink leading-none">岗位推荐</h2>
            <p className="text-xs text-slate mt-1.5">
              根据你的简历画像找到{" "}
              <AnimatedNumber value={jobs.length} className="font-semibold text-blue" /> 个真实岗位
            </p>
          </div>
        </div>
        <button
          onClick={() => refreshJobs()}
          disabled={refreshing}
          className="bg-transparent text-ink border border-hairline rounded-full px-4 py-1.5 text-sm font-medium hover:bg-surface transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
        >
          <svg className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M5.5 9a7.5 7.5 0 0112.9-2.5M18.5 15a7.5 7.5 0 01-12.9 2.5" />
          </svg>
          {refreshing ? "搜索中…" : "刷新岗位"}
        </button>
      </div>

      {loading ? (
        <div className="bg-canvas rounded-xl border border-hairline p-10 text-center text-sm text-muted">加载岗位推荐…</div>
      ) : error && jobs.length === 0 ? (
        <div className="bg-canvas rounded-xl border border-hairline p-10 text-center text-sm text-slate">
          <p className="mb-3">岗位推荐加载失败：{error}</p>
          <button
            onClick={() => refreshJobs()}
            className="bg-blue text-white rounded-full px-5 py-2 font-semibold text-sm hover:bg-blue/90 transition-all"
          >
            重新搜索
          </button>
        </div>
      ) : jobs.length === 0 ? (
        <div className="bg-canvas rounded-xl border border-hairline p-10 text-center text-sm text-slate">
          <p className="mb-3">暂无岗位推荐，点击搜索为你抓取最新真实岗位</p>
          <button
            onClick={() => refreshJobs()}
            className="bg-blue text-white rounded-full px-5 py-2 font-semibold text-sm hover:bg-blue/90 transition-all"
          >
            搜索岗位
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map((job, i) => (
              <JobCard key={job.id} job={job} delay={0.05 * i} onClick={() => setSelectedJob(job)} />
            ))}
          </div>
          {jobs.length > VISIBLE_COUNT && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mx-auto mt-5 flex items-center gap-1 text-sm text-blue font-medium hover:underline transition-all active:scale-95"
            >
              {expanded ? "收起" : `查看更多 ${jobs.length - VISIBLE_COUNT} 个`}
              <span className={`inline-block transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}>↓</span>
            </button>
          )}
        </>
      )}

      {selectedJob && (
        <JobDetailModal key={selectedJob.id} job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}
    </section>
  );
}
