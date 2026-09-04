import { useState } from "react";
import { useSkillStore } from "@core/stores/skillStore";
import { TargetIcon } from "@web/components/EmptyIcons";
import { computeGaps } from "@core/services/resumeService";
import type { Sections } from "@core/models/section";
import type { GapAnalysis } from "@core/models/jd";
import AIErrorBox from "@web/components/AIErrorBox";
import AnimatedNumber from "@web/components/AnimatedNumber";
import { isUnavailable, hasUnavailableField } from "@core/services/aiDegrade";
import { useEntrance, entrance } from "@web/hooks/useEntrance";

interface LearningGuide {
  learning_path: { step: number; title: string; description: string; estimated_hours: number }[];
  resources?: { title: string; url: string; type: string }[];
  interview_questions: { question: string; difficulty: string; answer_hint: string }[];
}

interface Props {
  resumeId: number;
  sections: Sections;
  targetPosition: string;
  targetCompany: string;
}

export default function JDMatchTab({ resumeId, sections, targetPosition, targetCompany }: Props) {
  const { analyses, currentAnalysis, loading, error, analyzeJD, fetchAnalyses } = useSkillStore();

  const [jdText, setJdText] = useState("");
  const [gap, setGap] = useState<GapAnalysis | null>(null);
  const [jdError, setJdError] = useState("");
  const [learningGuides, setLearningGuides] = useState<Record<string, LearningGuide>>({});
  const [guideErrors, setGuideErrors] = useState<Record<string, string>>({});
  const [loadingGuide, setLoadingGuide] = useState<string | null>(null);
  const [activeTech, setActiveTech] = useState<string | null>(null);
  const { mounted } = useEntrance();

  // Load analyses bound to this resume
  useState(() => {
    if (resumeId) fetchAnalyses();
  });

  const resumeAnalyses = analyses.filter((a) => a.resume_id === resumeId);
  const hasAnalysis = resumeAnalyses.length > 0;

  const handleAnalyze = async () => {
    if (!jdText.trim()) return;
    const result = await analyzeJD(jdText, targetCompany || "", targetPosition || "", resumeId);
    if (result) {
      if (hasUnavailableField(result)) {
        setGap(null);
        setJdError("AI 服务暂不可用，请稍后再试");
        return;
      }
      setGap(computeGaps(sections, result));
      setJdError("");
    }
  };

  const handleLoadGuide = async (techName: string, category: string, requiredLevel: string = "了解") => {
    if (learningGuides[techName] && !hasUnavailableField(learningGuides[techName])) {
      setActiveTech(activeTech === techName ? null : techName);
      return;
    }
    setLoadingGuide(techName);
    setActiveTech(techName);
    setGuideErrors((prev) => { const n = { ...prev }; delete n[techName]; return n; });
    try {
      const resp = await fetch("/api/ai/learning-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tech_name: techName, category, required_level: requiredLevel }),
      });
      if (resp.ok) {
        const data = await resp.json();
        // 降级内容不当作已加载：显示内联错误 + 重试，避免「重新生成」死按钮
        if (hasUnavailableField(data)) {
          setGuideErrors((prev) => ({ ...prev, [techName]: "AI 服务暂不可用，请稍后再试" }));
        } else {
          setLearningGuides((prev) => ({ ...prev, [techName]: data }));
        }
      } else {
        setGuideErrors((prev) => ({ ...prev, [techName]: "加载失败，请稍后重试" }));
      }
    } catch {
      setGuideErrors((prev) => ({ ...prev, [techName]: "加载失败，请稍后重试" }));
    } finally {
      setLoadingGuide(null);
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "前端": return "bg-blue-light text-blue";
      case "后端": return "bg-green/10 text-green";
      case "数据库": return "bg-amber/10 text-amber";
      default: return "bg-surface text-slate";
    }
  };

  const getDifficultyColor = (d: string) => {
    switch (d) {
      case "easy": return "bg-green/10 text-green";
      case "hard": return "bg-red/10 text-red";
      default: return "bg-amber/10 text-amber";
    }
  };

  const getDifficultyLabel = (d: string) => {
    switch (d) {
      case "easy": return "简单";
      case "hard": return "困难";
      default: return "中等";
    }
  };

  return (
    <div className="space-y-4">
      {/* Input area */}
      <div className="bg-canvas rounded-xl border border-hairline p-5 transition-all duration-200 hover:border-blue/20" style={entrance(mounted, 0.05)}>
        <h3 className="font-semibold text-sm text-ink mb-3">职位描述分析</h3>
        <textarea
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          placeholder="粘贴目标职位的职位描述（JD），AI 将分析技术栈并与你的简历进行匹配..."
          className="w-full border border-hairline rounded-lg px-3 py-2 text-sm resize-y min-h-[150px] outline-none focus:border-blue transition-colors"
        />
        <div className="flex items-center justify-between mt-3">
          <p className="text-xs text-muted">分析后将展示技能匹配度和学习建议</p>
          <button
            onClick={handleAnalyze}
            disabled={!jdText.trim() || loading}
            className="bg-blue text-white rounded-full px-5 py-2 font-semibold text-sm hover:bg-blue/90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce [animation-delay:0.15s]" />
                <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce [animation-delay:0.3s]" />
                分析中...
              </span>
            ) : (
              "开始匹配"
            )}
          </button>
        </div>
      </div>

      {jdError && (
        <AIErrorBox message={jdError} onRetry={handleAnalyze} retryLabel="重新分析" />
      )}

      {/* No analysis state */}
      {!hasAnalysis && !gap && !loading && !error && (
        <div className="bg-canvas rounded-xl border border-hairline p-12 text-center transition-all duration-300" style={entrance(mounted, 0.1)}>
          <TargetIcon className="w-12 h-12 mx-auto mb-4 transition-transform duration-300 hover:scale-110" />
          <h3 className="text-lg font-semibold text-ink mb-2">尚未分析</h3>
          <p className="text-sm text-slate">粘贴目标职位的 JD 并点击"开始匹配"进行技能差距分析</p>
        </div>
      )}

      {!hasAnalysis && !gap && !loading && error && (
        <div className="bg-red/5 border border-red/20 rounded-xl p-5 text-center">
          <h3 className="text-sm font-semibold text-red mb-1">分析失败</h3>
          <p className="text-sm text-slate">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="bg-canvas rounded-xl border border-hairline p-12 text-center transition-all duration-300" style={entrance(mounted, 0.1)}>
          <div className="inline-flex items-center gap-2 text-sm text-muted">
            <span className="w-2 h-2 bg-blue rounded-full animate-bounce" style={{ animationDelay: "0s" }} />
            <span className="w-2 h-2 bg-blue rounded-full animate-bounce" style={{ animationDelay: "0.15s" }} />
            <span className="w-2 h-2 bg-blue rounded-full animate-bounce" style={{ animationDelay: "0.3s" }} />
            <span className="ml-1">AI 正在分析职位描述...</span>
          </div>
        </div>
      )}

      {/* Gap analysis results */}
      {gap && (
        <>
          {/* Match score */}
          <div className="bg-canvas rounded-xl border border-hairline p-5 transition-all duration-200 hover:border-blue/20" style={entrance(mounted, 0.15)}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm text-ink">技能匹配度</h3>
              <span className={`text-2xl font-bold tabular-nums ${
                gap.match_percentage >= 80 ? "text-green" : gap.match_percentage >= 50 ? "text-amber" : "text-red"
              }`}>
                <AnimatedNumber value={gap.match_percentage} duration={900} />%
              </span>
            </div>
            <div className="h-2 bg-surface rounded-full overflow-hidden mb-3">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${
                  gap.match_percentage >= 80 ? "bg-green" : gap.match_percentage >= 50 ? "bg-amber" : "bg-red"
                }`}
                style={{ width: mounted ? `${gap.match_percentage}%` : "0%" }}
              />
            </div>
            <p className="text-xs text-slate">
              职位要求 {gap.total_required} 项技术，简历匹配 {gap.match_count} 项
            </p>
          </div>

          {/* Suggestions */}
          <div className="bg-blue/5 border border-blue/20 rounded-xl p-4 transition-all duration-200 hover:border-blue/40" style={entrance(mounted, 0.2)}>
            <h3 className="font-semibold text-sm text-blue mb-2">建议</h3>
            <ul className="space-y-1">
              {gap.suggestions.map((s, i) => (
                <li key={i} className="text-sm text-slate flex items-start gap-2" style={{ opacity: 0, animation: `fade-in 0.3s ease-out ${0.25 + 0.05 * i}s forwards` }}>
                  <span className="text-blue mt-0.5 shrink-0">&#8226;</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Matched skills */}
          {gap.matched_skills.length > 0 && (
            <div className="bg-canvas rounded-xl border border-hairline p-5 transition-all duration-200 hover:border-blue/20" style={entrance(mounted, 0.25)}>
              <h3 className="font-semibold text-sm text-ink mb-3 flex items-center gap-2">
                <span className="text-green">&#10003;</span> 已匹配技能 ({gap.matched_skills.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {gap.matched_skills.map((skill, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 bg-green/5 border border-green/20 rounded-full px-3 py-1 text-xs text-green transition-transform duration-200 hover:scale-105"
                    style={{ opacity: 0, animation: `fade-in 0.3s ease-out ${0.3 + 0.04 * i}s forwards` }}
                  >
                    {skill.name}
                    <span className="text-muted">· {skill.level}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Missing skills */}
          {gap.missing_skills.length > 0 && (
            <div className="bg-canvas rounded-xl border border-hairline p-5 transition-all duration-200 hover:border-blue/20" style={entrance(mounted, 0.3)}>
              <h3 className="font-semibold text-sm text-ink mb-3 flex items-center gap-2">
                <span className="text-red">&#10007;</span> 缺失技能 ({gap.missing_skills.length})
              </h3>
              <div className="space-y-1">
                {gap.missing_skills.map((skill, i) => (
                  <div key={i} style={{ opacity: 0, animation: `fade-in 0.3s ease-out ${0.35 + 0.04 * i}s forwards` }}>
                    <button
                      onClick={() => handleLoadGuide(skill.name, skill.category, skill.required_level)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-surface/80 hover:translate-x-0.5 transition-all duration-200 text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-sm text-charcoal">{skill.name}</span>
                        <span className={`text-xs rounded-full px-2 py-0.5 ${getCategoryColor(skill.category)}`}>
                          {skill.category}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-red/70">{skill.required_level}</span>
                        {learningGuides[skill.name] && (
                          <span className="text-xs text-muted">已加载</span>
                        )}
                        {loadingGuide === skill.name && (
                          <span className="text-xs text-blue">加载中...</span>
                        )}
                      </div>
                    </button>

                    {/* Learning guide details */}
                    {activeTech === skill.name && (
                      <div className="ml-4 pl-4 border-l-2 border-blue/20 space-y-4 pb-3 pt-2">
                        {guideErrors[skill.name] ? (
                          <div className="bg-red-light/30 rounded-lg border border-red/20 px-4 py-3">
                            <p className="text-sm text-red mb-2">{guideErrors[skill.name]}</p>
                            <button
                              onClick={() => handleLoadGuide(skill.name, skill.category, skill.required_level)}
                              disabled={loadingGuide === skill.name}
                              className="text-xs bg-blue text-white rounded-full px-4 py-1.5 font-medium hover:bg-blue/90 transition-colors disabled:opacity-50"
                            >
                              {loadingGuide === skill.name ? "重试中..." : "重试"}
                            </button>
                          </div>
                        ) : learningGuides[skill.name] ? (
                          <>
                        {learningGuides[skill.name].learning_path.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-ink mb-2">学习路径</h4>
                            <div className="space-y-2">
                              {learningGuides[skill.name].learning_path.filter((s) => !isUnavailable(s.description ?? "")).map((step) => (
                                <div key={step.step} className="flex items-start gap-3">
                                  <span className="w-5 h-5 rounded-full bg-blue text-white text-xs flex items-center justify-center shrink-0 mt-0.5">
                                    {step.step}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-charcoal">{step.title}</p>
                                    <p className="text-xs text-slate">{step.description}</p>
                                    {step.estimated_hours > 0 && (
                                      <p className="text-xs text-muted mt-0.5">预估 {step.estimated_hours} 小时</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {learningGuides[skill.name].interview_questions.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-ink mb-2">面试题</h4>
                            <div className="space-y-1.5">
                              {learningGuides[skill.name].interview_questions.map((q, idx) => (
                                <details key={idx} className="bg-surface/50 rounded-lg border border-hairline">
                                  <summary className="px-3 py-2 text-sm text-charcoal cursor-pointer flex items-center gap-2">
                                    <span className={`text-xs rounded-full px-1.5 py-0.5 font-medium ${getDifficultyColor(q.difficulty)}`}>
                                      {getDifficultyLabel(q.difficulty)}
                                    </span>
                                    {q.question}
                                  </summary>
                                  <div className="px-3 pb-3 pt-1 text-sm text-slate border-t border-hairline mt-1">
                                    {q.answer_hint || "暂无答案"}
                                  </div>
                                </details>
                              ))}
                            </div>
                          </div>
                        )}
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
