import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInterviewStore } from "@core/stores/interviewStore";
import { api } from "@core/api/client";
import { Eye, ArrowRight, Trash, Check, X } from "@phosphor-icons/react";
import AnimatedNumber from "@web/components/AnimatedNumber";
import type { JDAnalysisListItem } from "@core/models/jd";

const INTERVIEW_TYPES = [
  { value: "comprehensive", label: "综合面试", desc: "技术 + 场景 + 行为全面考察" },
  { value: "algorithm", label: "算法专项", desc: "数据结构与算法" },
  { value: "system_design", label: "系统设计", desc: "架构与设计" },
  { value: "behavioral", label: "行为面试", desc: "STAR 法则与软技能" },
] as const;

const DIFFICULTY_LEVELS = [
  { value: "junior", label: "初级", desc: "基础概念，有引导" },
  { value: "mid", label: "中级", desc: "理解深度，正常标准" },
  { value: "senior", label: "高级", desc: "原理+架构，标准严格" },
] as const;

const TYPE_LABELS: Record<string, string> = {
  comprehensive: "综合",
  algorithm: "算法",
  system_design: "系统设计",
  behavioral: "行为",
};

const DIFF_LABELS: Record<string, string> = {
  junior: "初级",
  mid: "中级",
  senior: "高级",
};

const DIFF_COLORS: Record<string, string> = {
  junior: "text-green border-green/30 bg-green/5",
  mid: "text-blue border-blue/30 bg-blue/5",
  senior: "text-red border-red/30 bg-red/5",
};

export default function MockInterviewList() {
  const navigate = useNavigate();
  const { sessions, loading, fetchSessions } = useInterviewStore();
  const [jdAnalyses, setJdAnalyses] = useState<JDAnalysisListItem[]>([]);
  const [selectedJdId, setSelectedJdId] = useState<number | "">("");
  const [manualPosition, setManualPosition] = useState("");
  const [manualCompany, setManualCompany] = useState("");
  const [interviewType, setInterviewType] = useState("comprehensive");
  const [difficultyLevel, setDifficultyLevel] = useState("mid");
  const [starting, setStarting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [showPrevSessions, setShowPrevSessions] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(1);
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    fetchSessions();
    api.get<JDAnalysisListItem[]>("/api/jd/analyses").then(setJdAnalyses).catch(() => {});
    // Trigger staggered mount animations
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  // ── Stats computed from sessions ──
  const stats = useMemo(() => {
    const completed = sessions.filter((s) => s.status === "completed");
    const scores = completed.map((s) => s.summary_score).filter((s): s is number => s !== null);
    const totalQuestions = sessions.reduce((sum, s) => sum + (s.total_questions || 0), 0);
    return {
      total: sessions.length,
      avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      highScore: scores.length ? Math.max(...scores) : null,
      totalQuestions,
    };
  }, [sessions]);

  // ── Per-type averages ──
  const typeAverages = useMemo(() => {
    const completed = sessions.filter((s) => s.status === "completed" && s.summary_score !== null);
    const groups: Record<string, number[]> = {};
    for (const s of completed) {
      const t = s.interview_type || "comprehensive";
      if (!groups[t]) groups[t] = [];
      groups[t].push(s.summary_score!);
    }
    const result: { type: string; avg: number; count: number }[] = [];
    for (const [type, scores] of Object.entries(groups)) {
      result.push({ type, avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length), count: scores.length });
    }
    return result;
  }, [sessions]);

  const hasPosition = showManual ? !!manualPosition.trim() : !!selectedJdId;
  const displayPosition = manualPosition || (selectedJdId ? jdAnalyses.find(j => j.id === selectedJdId)?.position : "") || "";
  const displayCompany = manualCompany || (selectedJdId ? jdAnalyses.find(j => j.id === selectedJdId)?.company : "") || "";

  const handleStart = async () => {
    if (!selectedJdId && !manualPosition.trim()) return;
    setStarting(true);
    try {
      const { startInterview } = useInterviewStore.getState();
      const session = await startInterview(
        selectedJdId
          ? { jd_analysis_id: selectedJdId as number, interview_type: interviewType, difficulty_level: difficultyLevel }
          : { position: manualPosition.trim(), company: manualCompany.trim(), interview_type: interviewType, difficulty_level: difficultyLevel },
      );
      navigate(`/mock-interview/${session.id}`);
    } catch (e) {
      setStarting(false);
    }
  };

  const handleContinue = (id: number) => {
    navigate(`/mock-interview/${id}`);
  };

  const handleDelete = useCallback(async (id: number) => {
    setDeletingId(id);
    setConfirmDelete(null);
    try {
      const { deleteInterview } = useInterviewStore.getState();
      await deleteInterview(id);
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  }, []);

  // ── Score color helpers ──
  const scoreColor = (s: number | null) => {
    if (s === null) return "text-muted";
    if (s >= 70) return "text-green";
    if (s >= 40) return "text-amber";
    return "text-red";
  };
  const barColor = (s: number | null) => {
    if (s === null) return "bg-muted";
    if (s >= 70) return "bg-green";
    if (s >= 40) return "bg-amber";
    return "bg-red";
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <h2 className="text-2xl font-bold text-ink mb-1">模拟面试</h2>
        <p className="text-sm text-slate">AI 面试官根据岗位要求进行模拟面试，实时反馈与评估</p>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {([
          { label: "总面试次数", value: stats.total, sub: `累计 ${stats.totalQuestions} 个回答`, color: "text-ink" },
          { label: "平均分", value: stats.avgScore, sub: stats.avgScore !== null ? `基于 ${sessions.filter(s => s.status === "completed").length} 次完成` : null, color: stats.avgScore !== null ? scoreColor(stats.avgScore) : "text-muted" },
          { label: "最高分", value: stats.highScore, sub: stats.highScore !== null ? sessions.find(s => s.summary_score === stats.highScore)?.position || "" : null, color: stats.highScore !== null ? "text-green" : "text-muted" },
          { label: "总回答数", value: stats.totalQuestions, sub: `平均 ${stats.total ? Math.round(stats.totalQuestions / stats.total) : 0}/次`, color: "text-ink" },
        ] as const).map((item, i) => (
          <div
            key={item.label}
            className="bg-canvas rounded-xl border border-hairline p-4 transition-all duration-300 hover:border-blue/20 hover:shadow-[0_2px_8px_rgba(20,86,240,0.06)]"
            style={{ animation: `fade-in-up 0.4s ease-out ${0.08 * i}s both` }}
          >
            <AnimatedNumber value={typeof item.value === "number" ? item.value : undefined} fallback={item.value} className={`text-2xl font-bold ${item.color}`} />
            <div className="text-xs text-muted mt-0.5">{item.label}</div>
            {item.sub && <div className="text-xs mt-1 opacity-0" style={{ color: item.label === "总面试次数" ? "var(--color-green)" : "var(--color-muted)", animation: `fade-in 0.3s ease-out ${0.4 + 0.08 * i}s forwards` }}>{item.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Type rings ── */}
      {typeAverages.length > 0 && (
        <div className="bg-canvas rounded-xl border border-hairline p-5 mb-6 transition-all duration-300 hover:border-blue/20" style={{ animation: `fade-in-up 0.4s ease-out 0.2s both` }}>
          <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">各类型表现</div>
          <div className="flex gap-6 justify-center">
            {typeAverages.map((t, i) => {
              const color = t.avg >= 70 ? "#059669" : t.avg >= 40 ? "#d97706" : "#1456f0";
              return (
                <div key={t.type} className="text-center" style={{ animation: `fade-in-up 0.35s ease-out ${0.3 + 0.1 * i}s both` }}>
                  <Ring pct={t.avg} color={color} />
                  <div className="text-sm font-semibold text-ink mt-1 opacity-0" style={{ animation: `count-in 0.3s ease-out ${0.6 + 0.1 * i}s forwards` }}>
                    {t.avg}
                  </div>
                  <div className="text-xs text-muted">{TYPE_LABELS[t.type] || t.type}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Start new interview — Step by Step ── */}
      <div className="bg-canvas rounded-xl border border-hairline p-6 mb-8 transition-all duration-300" style={{ animation: `fade-in-up 0.4s ease-out 0.15s both` }}>
        {/* Stepper header */}
        <div className="flex items-center mb-6">
          {[
            { n: 1, label: "选择岗位" },
            { n: 2, label: "面试配置" },
            { n: 3, label: "确认开始" },
          ].map((s, i) => (
            <Fragment key={s.n}>
              <button
                onClick={() => { if (s.n < step || (s.n === 2 && hasPosition) || (s.n === 3 && hasPosition)) setStep(s.n); }}
                className="flex items-center gap-2 group"
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                  step === s.n
                    ? "bg-blue text-white shadow-sm scale-110"
                    : step > s.n
                      ? "bg-green text-white"
                      : "bg-surface text-muted border border-hairline"
                }`}>
                  {step > s.n ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    s.n
                  )}
                </div>
                <span className={`text-xs font-medium transition-colors duration-200 hidden sm:inline ${
                  step === s.n ? "text-ink" : step > s.n ? "text-green" : "text-muted"
                }`}>
                  {s.label}
                </span>
              </button>
              {i < 2 && (
                <div className={`flex-1 h-px mx-3 transition-all duration-300 ${
                  step > s.n ? "bg-green" : "bg-hairline"
                }`} />
              )}
            </Fragment>
          ))}
        </div>

        {/* Step 1: 选择岗位 */}
        {step === 1 && (
          <div className="space-y-3" style={{ animation: "fade-in-up 0.3s ease-out both" }}>
            <div className="space-y-2">
              {jdAnalyses.map((jd) => (
                <button
                  key={jd.id}
                  onClick={() => { setSelectedJdId(jd.id); setShowManual(false); setManualPosition(""); setManualCompany(""); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all duration-200 active:scale-[0.99] ${
                    selectedJdId === jd.id && !showManual
                      ? "border-blue bg-blue/5"
                      : "border-hairline hover:border-blue/30 hover:bg-surface/50"
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                    selectedJdId === jd.id && !showManual ? "border-blue" : "border-hairline"
                  }`}>
                    {selectedJdId === jd.id && !showManual && (
                      <div className="w-2.5 h-2.5 rounded-full bg-blue animate-scale-in" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink truncate">{jd.position || "未知岗位"} · {jd.company || "未知公司"}</div>
                    <div className="text-xs text-muted mt-0.5">JD 分析 · {new Date(jd.created_at).toLocaleDateString("zh-CN")}</div>
                  </div>
                </button>
              ))}
            </div>

            {/* Manual input card */}
            <div>
              <button
                onClick={() => { setSelectedJdId(""); setShowManual(true); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed text-left transition-all duration-200 active:scale-[0.99] ${
                  showManual
                    ? "border-blue bg-blue/5"
                    : "border-hairline hover:border-blue/30 hover:bg-surface/50 text-muted hover:text-ink"
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                  showManual ? "border-blue" : "border-hairline"
                }`}>
                  {showManual && <div className="w-2.5 h-2.5 rounded-full bg-blue animate-scale-in" />}
                </div>
                <span className="text-sm font-medium">手动输入岗位信息</span>
              </button>
              {showManual && (
                <div className="mt-3 grid grid-cols-2 gap-3 pl-9" style={{ animation: "fade-in-up 0.25s ease-out both" }}>
                  <div>
                    <label className="block text-xs font-medium text-slate mb-1">面试岗位</label>
                    <input
                      className="w-full bg-canvas border border-hairline rounded-lg px-3 py-2 text-sm text-ink placeholder:text-muted transition-all duration-200 focus:border-blue focus:shadow-[0_0_0_3px_rgba(20,86,240,0.08)] outline-none"
                      placeholder="e.g. Python 后端开发"
                      value={manualPosition}
                      onChange={(e) => setManualPosition(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate mb-1">目标公司</label>
                    <input
                      className="w-full bg-canvas border border-hairline rounded-lg px-3 py-2 text-sm text-ink placeholder:text-muted transition-all duration-200 focus:border-blue focus:shadow-[0_0_0_3px_rgba(20,86,240,0.08)] outline-none"
                      placeholder="e.g. 字节跳动"
                      value={manualCompany}
                      onChange={(e) => setManualCompany(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex justify-end pt-2">
              <button
                onClick={() => { if (hasPosition) setStep(2); }}
                disabled={!hasPosition}
                className="bg-blue text-white rounded-full px-6 py-2.5 text-sm font-semibold transition-all duration-200 hover:bg-blue/90 active:scale-95 disabled:opacity-40 flex items-center gap-1.5"
              >
                下一步
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: 面试配置 */}
        {step === 2 && (
          <div className="grid grid-cols-2 gap-6" style={{ animation: "fade-in-up 0.3s ease-out both" }}>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-3">面试类型</label>
              <div className="flex flex-col gap-2">
                {INTERVIEW_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setInterviewType(t.value)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 active:scale-[0.99] ${
                      interviewType === t.value
                        ? "border-blue bg-blue/5 text-ink"
                        : "border-hairline text-slate hover:border-blue/30 hover:text-ink"
                    }`}
                  >
                    <span className="text-sm font-medium">{t.label}</span>
                    <span className={`text-xs block mt-0.5 ${interviewType === t.value ? "text-blue/70" : "text-muted"}`}>{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-3">难度级别</label>
              <div className="flex flex-col gap-2">
                {DIFFICULTY_LEVELS.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setDifficultyLevel(d.value)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 active:scale-[0.99] ${
                      difficultyLevel === d.value
                        ? "border-blue bg-blue/5 text-ink"
                        : "border-hairline text-slate hover:border-blue/30 hover:text-ink"
                    }`}
                  >
                    <span className="text-sm font-medium">{d.label}</span>
                    <span className={`text-xs block mt-0.5 ${difficultyLevel === d.value ? "text-blue/70" : "text-muted"}`}>{d.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Navigation */}
            <div className="col-span-2 flex items-center justify-between pt-2">
              <button
                onClick={() => setStep(1)}
                className="bg-transparent text-slate border border-hairline rounded-full px-5 py-2 text-sm font-medium transition-all duration-200 hover:border-blue/30 hover:text-ink active:scale-95 flex items-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                </svg>
                上一步
              </button>
              <button
                onClick={() => setStep(3)}
                className="bg-blue text-white rounded-full px-6 py-2.5 text-sm font-semibold transition-all duration-200 hover:bg-blue/90 active:scale-95 flex items-center gap-1.5"
              >
                下一步
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Step 3: 确认开始 */}
        {step === 3 && (
          <div className="space-y-5" style={{ animation: "fade-in-up 0.3s ease-out both" }}>
            <div className="bg-surface rounded-xl border border-hairline overflow-hidden">
              <div className="px-5 py-4 border-b border-hairline">
                <span className="text-xs font-semibold text-muted uppercase tracking-wider">确认面试信息</span>
              </div>
              <div className="divide-y divide-hairline">
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm text-muted">岗位</span>
                  <span className="text-sm font-semibold text-ink text-right">{displayPosition || "未指定"}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm text-muted">公司</span>
                  <span className="text-sm font-semibold text-ink text-right">{displayCompany || "未指定"}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm text-muted">类型</span>
                  <span className="text-sm font-semibold text-blue">{INTERVIEW_TYPES.find(t => t.value === interviewType)?.label || interviewType}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm text-muted">难度</span>
                  <DifficultyBadge level={difficultyLevel} />
                </div>
                {selectedJdId && (() => {
                  const cnt = sessions.filter((s) => s.jd_analysis_id === selectedJdId).length;
                  return cnt > 0 ? (
                    <div className="flex items-center justify-between px-5 py-3.5">
                      <span className="text-sm text-muted">历史面试</span>
                      <span className="text-sm font-semibold text-ink">{cnt} 次</span>
                    </div>
                  ) : null;
                })()}
              </div>
            </div>

            <button
              onClick={handleStart}
              disabled={starting}
              className="w-full bg-blue text-white rounded-xl py-3.5 text-sm font-semibold transition-all duration-200 hover:bg-blue/90 hover:shadow-md active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {starting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  创建中...
                </span>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  开始面试
                </>
              )}
            </button>

            <div className="flex justify-center">
              <button
                onClick={() => setStep(2)}
                className="text-xs text-muted hover:text-slate transition-colors underline underline-offset-2"
              >
                返回修改配置
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── History ── */}
      <h3 className="font-semibold text-ink mb-3 transition-all duration-300" style={{ animation: `fade-in 0.3s ease-out 0.3s both` }}>
        历史记录
      </h3>
      {loading && sessions.length === 0 ? (
        <SkeletonTable />
      ) : sessions.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="bg-canvas border border-hairline rounded-xl overflow-hidden transition-all duration-300 hover:border-blue/20">
          {sessions.map((s, i) => (
            <div
              key={s.id}
              className="flex items-center gap-3 px-4 py-3 border-b border-hairline last:border-b-0 hover:bg-surface/50 transition-all duration-200"
              style={{ animation: `fade-in-up 0.3s ease-out ${0.35 + 0.04 * i}s both` }}
            >
              {/* Score */}
              <span className={`w-9 text-center text-sm font-bold ${scoreColor(s.summary_score)}`}>
                {s.summary_score !== null ? s.summary_score : "—"}
              </span>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink truncate">
                  {s.position || "未知岗位"} · {s.company || "未知公司"}
                </div>
                <div className="text-xs text-muted mt-0.5">
                  {TYPE_LABELS[s.interview_type] || s.interview_type}
                  <span className="mx-1">·</span>
                  {DIFF_LABELS[s.difficulty_level] || s.difficulty_level}
                  <span className="mx-1">·</span>
                  {new Date(s.started_at).toLocaleDateString("zh-CN")}
                  <span className="mx-1">·</span>
                  {s.total_questions || 0} 题
                </div>
              </div>

              {/* Mini progress bar */}
              <div className="w-20 h-1.5 bg-surface rounded-full overflow-hidden hidden sm:block">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out"
                  style={{
                    width: s.summary_score !== null ? `${s.summary_score}%` : "0%",
                    backgroundColor: s.summary_score !== null
                      ? s.summary_score >= 70 ? "var(--color-green)" : s.summary_score >= 40 ? "var(--color-amber)" : "var(--color-red)"
                      : "var(--color-muted)"
                  }}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  onClick={() => handleContinue(s.id)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate transition-all duration-200 hover:text-blue hover:bg-blue/5 active:scale-90"
                  title={s.status === "completed" ? "查看" : "继续"}
                >
                  {s.status === "completed" ? <Eye size={16} /> : <ArrowRight size={16} />}
                </button>
                {confirmDelete === s.id ? (
                  <>
                    <button
                      onClick={() => handleDelete(s.id)}
                      disabled={deletingId === s.id}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-red transition-all duration-200 hover:bg-red/5 active:scale-90 disabled:opacity-50"
                      title="确认删除"
                    >
                      {deletingId === s.id ? <span className="w-3 h-3 border-2 border-red/30 border-t-red rounded-full animate-spin" /> : <Check size={16} />}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate transition-all duration-200 hover:text-ink hover:bg-surface active:scale-90"
                      title="取消"
                    >
                      <X size={16} />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(s.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-muted transition-all duration-200 hover:text-red hover:bg-red/5 active:scale-90"
                    title="删除"
                  >
                    <Trash size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────

function SkeletonTable() {
  return (
    <div className="bg-canvas border border-hairline rounded-xl overflow-hidden animate-pulse">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-hairline" style={{ animation: `fade-in-up 0.3s ease-out ${0.05 * i}s both` }}>
          <div className="w-9 h-5 bg-hairline rounded" />
          <div className="flex-1">
            <div className="h-4 bg-hairline rounded w-48" />
            <div className="h-3 bg-hairline rounded w-32 mt-1.5" />
          </div>
          <div className="w-20 h-1.5 bg-hairline rounded" />
          <div className="w-16 h-8 bg-hairline rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-canvas rounded-xl border border-hairline p-14 text-center transition-all duration-300" style={{ animation: `fade-in-up 0.4s ease-out 0.2s both` }}>
      <div className="w-14 h-14 rounded-full bg-surface flex items-center justify-center mx-auto mb-4 transition-all duration-500 hover:scale-105">
        <svg className="w-6 h-6 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-ink mb-1">还没有面试记录</h3>
      <p className="text-sm text-muted">选择岗位或填写信息，开始你的第一次模拟面试</p>
    </div>
  );
}

function DifficultyBadge({ level }: { level: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium transition-all duration-200 ${DIFF_COLORS[level] || "bg-surface text-slate"}`}>
      {DIFF_LABELS[level] || level}
    </span>
  );
}

/** Animated SVG ring that fills on mount */
function Ring({ pct, color }: { pct: number; color: string }) {
  const [anim, setAnim] = useState(false);
  const r = 18;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;

  useEffect(() => {
    const t = setTimeout(() => setAnim(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <svg width="48" height="48" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r={r} fill="none" stroke="var(--color-hairline)" strokeWidth="5" />
      <circle
        cx="24" cy="24" r={r}
        fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={c}
        strokeDashoffset={anim ? offset : c}
        strokeLinecap="round"
        transform="rotate(-90 24 24)"
        style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.34, 1.56, 0.64, 1)" }
      } />
    </svg>
  );
}
