import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useResumeStore } from "@core/stores/resumeStore";
import { useSkillStore } from "@core/stores/skillStore";
import { computeGaps, calculateResumeProgress, ensureSections } from "@core/services/resumeService";
import type { Job } from "@core/models/job";
import type { GapAnalysis } from "@core/models/jd";

const REQUIRED_KEYS = ["header", "summary", "experience", "education", "skills"];

interface Props {
  job: Job;
  onClose: () => void;
}

export default function JobDetailModal({ job, onClose }: Props) {
  const navigate = useNavigate();
  const [analyzing, setAnalyzing] = useState(false);
  const [match, setMatch] = useState<GapAnalysis | null>(null);
  const [analysisId, setAnalysisId] = useState<number | null>(null);
  const [matchError, setMatchError] = useState("");

  useEffect(() => {
    if (!onClose) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleAnalyze = async () => {
    const { resumes } = useResumeStore.getState();
    if (resumes.length === 0) {
      // 无简历：直接跳 JD 分析页自动分析
      navigate(
        `/jd?jd_text=${encodeURIComponent(job.jd)}&company=${encodeURIComponent(job.company)}&position=${encodeURIComponent(job.title)}`
      );
      return;
    }
    const best = resumes.reduce((a, b) =>
      calculateResumeProgress(b, REQUIRED_KEYS) > calculateResumeProgress(a, REQUIRED_KEYS) ? b : a
    );
    setAnalyzing(true);
    setMatchError("");
    try {
      const analysis = await useSkillStore.getState().analyzeJD(job.jd, job.company, job.title, best.id);
      setMatch(computeGaps(ensureSections(best).sections, analysis));
      setAnalysisId(analysis.id);
    } catch {
      setMatchError("分析失败，请稍后重试");
    } finally {
      setAnalyzing(false);
    }
  };

  const meta = [
    { label: "城市", value: job.city },
    { label: "经验", value: job.experience },
    { label: "学历", value: job.education },
  ].filter((m) => m.value);

  const matchColor = (p: number) => (p >= 80 ? "bg-green" : p >= 50 ? "bg-amber" : "bg-red");
  const matchText = (p: number) => (p >= 80 ? "text-green" : p >= 50 ? "text-amber" : "text-red");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-[oklch(12%_0.008_250)]/60 backdrop-blur-sm absolute inset-0" />
      <div
        className="relative bg-canvas rounded-xl border border-hairline w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto shadow-lg animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold text-base text-ink leading-snug">{job.title}</h3>
              <p className="text-sm text-slate mt-0.5">
                {job.company}
                {job.city && <span className="text-muted"> · {job.city}</span>}
              </p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-muted hover:text-ink hover:bg-surface transition-colors"
              title="关闭"
            >
              ✕
            </button>
          </div>

          {/* Salary */}
          {job.salary && (
            <p className="text-xl font-bold text-blue mt-3">{job.salary}</p>
          )}

          {/* Meta tags */}
          {meta.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {meta.map((m) => (
                <span key={m.label} className="text-xs text-slate bg-surface rounded-full px-2.5 py-1">
                  {m.label}：{m.value}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* JD */}
        {job.jd && (
          <div className="p-6 pb-4">
            <h4 className="text-xs font-semibold text-ink uppercase tracking-wide mb-2">任职要求</h4>
            <p className="text-sm text-slate leading-relaxed whitespace-pre-line">{job.jd}</p>
          </div>
        )}

        {/* Match result */}
        {match && (
          <div className="px-6 pb-4 space-y-3">
            <div className="bg-surface rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-ink">匹配度</span>
                <span className={`text-xl font-bold tabular-nums ${matchText(match.match_percentage)}`}>
                  {match.match_percentage}%
                </span>
              </div>
              <div className="h-2 bg-hairline rounded-full overflow-hidden">
                <div className={`h-full ${matchColor(match.match_percentage)} rounded-full transition-all duration-700 ease-out`} style={{ width: `${match.match_percentage}%` }} />
              </div>
              <p className="text-xs text-muted mt-2">职位要求 {match.total_required} 项技术，简历匹配 {match.match_count} 项</p>
            </div>

            {match.missing_skills.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-ink mb-2">缺失技能</h4>
                <div className="flex flex-wrap gap-2">
                  {match.missing_skills.map((s, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 bg-red/5 border border-red/20 rounded-full px-3 py-1 text-xs text-red">
                      {s.name}
                      <span className="text-red/60">· {s.required_level}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {match.matched_skills.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-ink mb-2">已匹配</h4>
                <div className="flex flex-wrap gap-2">
                  {match.matched_skills.map((s, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 bg-green/5 border border-green/20 rounded-full px-3 py-1 text-xs text-green">
                      ✓ {s.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {matchError && <p className="px-6 text-sm text-red mb-2">{matchError}</p>}

        {/* Actions */}
        <div className="flex items-center gap-2 p-6 pt-4 border-t border-hairline">
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="bg-blue text-white rounded-full px-5 py-2 font-semibold text-sm hover:bg-blue/90 active:scale-95 disabled:opacity-50 transition-all"
          >
            {analyzing ? "分析中..." : match ? "重新匹配" : "分析匹配度"}
          </button>
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            className="bg-transparent text-ink border border-hairline rounded-full px-5 py-2 font-semibold text-sm hover:bg-surface transition-all"
          >
            查看原帖 ↗
          </a>
          {analysisId && (
            <button
              onClick={() => navigate(`/jd?analysis_id=${analysisId}`)}
              className="ml-auto text-sm text-blue font-medium hover:underline"
            >
              查看完整 JD 分析 →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
