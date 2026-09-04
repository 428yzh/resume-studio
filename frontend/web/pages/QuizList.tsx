import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuizStore } from "@core/stores/quizStore";
import { useSkillStore } from "@core/stores/skillStore";
import type { Skill } from "@core/models/skill";
import AIErrorBox from "@web/components/AIErrorBox";
import AnimatedNumber from "@web/components/AnimatedNumber";
import { useEntrance, entrance } from "@web/hooks/useEntrance";

const COUNT_OPTIONS = [
  { label: "5 题", value: 5 },
  { label: "10 题", value: 10 },
  { label: "15 题", value: 15 },
];

export default function QuizList() {
  const navigate = useNavigate();
  const { skills, fetchSkills } = useSkillStore();
  const { generateQuestions, createSession, loading, error } = useQuizStore();
  const { mounted } = useEntrance();

  const [mode, setMode] = useState<"practice" | "exam">("practice");
  const [selectedSkills, setSelectedSkills] = useState<number[]>([]);
  const [counts, setCounts] = useState({ single_choice: 5, multi_choice: 5, essay: 2 });

  useEffect(() => {
    fetchSkills();
  }, []);

  const toggleSkill = (id: number) => {
    setSelectedSkills((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleStart = async () => {
    if (mode === "practice") {
      const questions = await generateQuestions({
        mode: "practice",
        skill_ids: selectedSkills.length > 0 ? selectedSkills : undefined,
        counts,
      });
      if (questions.length > 0) {
        const session = await createSession("practice", questions.map((q) => q.id));
        navigate(`/quiz/session/${session.id}`);
      }
    } else {
      const questions = await generateQuestions({ mode: "exam" });
      if (questions.length > 0) {
        const session = await createSession("exam", questions.map((q) => q.id));
        navigate(`/quiz/exam/${session.id}`);
      }
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 animate-fade-in">
        <div>
          <h2 className="text-2xl font-bold text-ink">面试题库</h2>
          <p className="text-sm text-slate mt-1">刷题巩固，查漏补缺</p>
        </div>
        <button
          onClick={() => navigate("/quiz/records")}
          className="bg-transparent text-ink border border-hairline rounded-full px-4 py-2 text-sm font-medium hover:bg-surface transition-all active:scale-95"
        >
          答题记录
        </button>
      </div>

      {/* Mode switch */}
      <div className="flex items-center gap-4 mb-8" style={entrance(mounted, 0.05)}>
        <button
          onClick={() => setMode("practice")}
          className={`rounded-full px-6 py-2 text-sm font-medium transition-all active:scale-95 ${
            mode === "practice"
              ? "bg-ink text-white shadow-sm"
              : "bg-surface text-slate hover:text-ink"
          }`}
        >
          刷题模式
        </button>
        <button
          onClick={() => setMode("exam")}
          className={`rounded-full px-6 py-2 text-sm font-medium transition-all active:scale-95 ${
            mode === "exam"
              ? "bg-ink text-white shadow-sm"
              : "bg-surface text-slate hover:text-ink"
          }`}
        >
          考试模式
        </button>
      </div>

      {error && (
        <div className="max-w-2xl mb-4">
          <AIErrorBox message={error} onRetry={handleStart} />
        </div>
      )}

      {mode === "practice" ? (
        <div className="max-w-2xl space-y-6">
          {/* Skill filter */}
          <div className="bg-canvas rounded-xl border border-hairline p-5 transition-all duration-200 hover:border-blue/20" style={entrance(mounted, 0.1)}>
            <h3 className="text-sm font-semibold text-ink mb-3">选择技能范围</h3>
            {skills.length === 0 ? (
              <p className="text-sm text-muted">技能库为空，先去添加技能吧</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedSkills([])}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                    selectedSkills.length === 0
                      ? "bg-blue text-white"
                      : "bg-surface text-slate hover:text-ink"
                  }`}
                >
                  全部
                </button>
                {skills.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => toggleSkill(s.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                      selectedSkills.includes(s.id)
                        ? "bg-blue text-white"
                        : "bg-surface text-slate hover:text-ink"
                    }`}
                    style={{ opacity: 0, animation: `fade-in 0.3s ease-out ${0.15 + 0.04 * i}s forwards` }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Question counts */}
          <div className="bg-canvas rounded-xl border border-hairline p-5 transition-all duration-200 hover:border-blue/20" style={entrance(mounted, 0.15)}>
            <h3 className="text-sm font-semibold text-ink mb-4">题型数量</h3>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <label className="text-xs text-muted block mb-2">单选题</label>
                <div className="flex items-center gap-2">
                  {COUNT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setCounts({ ...counts, single_choice: counts.single_choice === opt.value ? 0 : opt.value })}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                        counts.single_choice === opt.value
                          ? "bg-ink text-white"
                          : "bg-surface text-slate hover:text-ink"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted block mb-2">多选题</label>
                <div className="flex items-center gap-2">
                  {COUNT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setCounts({ ...counts, multi_choice: counts.multi_choice === opt.value ? 0 : opt.value })}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                        counts.multi_choice === opt.value
                          ? "bg-ink text-white"
                          : "bg-surface text-slate hover:text-ink"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted block mb-2">问答题</label>
                <div className="flex items-center gap-2">
                  {COUNT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setCounts({ ...counts, essay: counts.essay === opt.value ? 0 : opt.value })}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                        counts.essay === opt.value
                          ? "bg-ink text-white"
                          : "bg-surface text-slate hover:text-ink"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted mt-3">
              共 {counts.single_choice + counts.multi_choice + counts.essay} 题
              {counts.single_choice + counts.multi_choice + counts.essay === 0 && (
                <span className="text-red/60 ml-1">请至少选择一种题型</span>
              )}
            </p>
          </div>

          {/* Start button */}
          <button
            onClick={handleStart}
            disabled={loading || counts.single_choice + counts.multi_choice + counts.essay === 0}
            className="w-full bg-blue text-white rounded-full py-3 font-semibold text-sm hover:bg-blue/90 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            style={entrance(mounted, 0.2)}
          >
            {loading ? (
              <span className="inline-flex items-center justify-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce [animation-delay:0.15s]" />
                <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce [animation-delay:0.3s]" />
                生成题目...
              </span>
            ) : (
              "开始刷题"
            )}
          </button>
        </div>
      ) : (
        /* Exam mode */
        <div className="max-w-2xl space-y-6">
          <div className="bg-canvas rounded-xl border border-hairline p-6 text-center transition-all duration-200 hover:border-blue/20" style={entrance(mounted, 0.1)}>
            <div className="w-16 h-16 bg-blue-light rounded-full flex items-center justify-center mx-auto mb-4 transition-transform duration-300 hover:scale-110">
              <span className="text-blue text-2xl font-bold">E</span>
            </div>
            <h3 className="text-base font-semibold text-ink mb-2">模拟面试</h3>
            <p className="text-sm text-slate mb-6 max-w-md mx-auto">
              AI 根据你的技能库生成一份标准面试卷，包含 10 道单选题、5 道多选题、3 道问答题，限时 45 分钟。
            </p>
            <div className="grid grid-cols-3 gap-4 mb-6 text-center">
              {[
                { value: 10, label: "单选题" },
                { value: 5, label: "多选题" },
                { value: 3, label: "问答题" },
              ].map((item, i) => (
                <div key={item.label} className="bg-surface rounded-xl p-3 transition-all duration-200 hover:bg-blue-light/30" style={entrance(mounted, 0.18 + 0.08 * i)}>
                  <p className="text-lg font-bold text-ink tabular-nums"><AnimatedNumber value={item.value} duration={600} /></p>
                  <p className="text-xs text-muted">{item.label}</p>
                </div>
              ))}
            </div>
            <button
              onClick={handleStart}
              disabled={loading}
              className="bg-blue text-white rounded-full px-8 py-2.5 font-semibold text-sm hover:bg-blue/90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <span className="inline-flex items-center justify-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce [animation-delay:0.15s]" />
                  <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce [animation-delay:0.3s]" />
                  生成考试卷...
                </span>
              ) : (
                "开始考试"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
