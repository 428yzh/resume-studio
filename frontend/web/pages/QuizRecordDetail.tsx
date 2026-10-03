import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuizStore } from "@core/stores/quizStore";
import QuestionCard from "@web/components/QuestionCard";
import LoadingDots from "@web/components/LoadingDots";
import AnimatedNumber from "@web/components/AnimatedNumber";
import { exportQuestionsToPDF } from "@core/services/pdfService";
import { useEntrance, entrance } from "@web/hooks/useEntrance";

export default function QuizRecordDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentSession, loading, fetchSession } = useQuizStore();
  const { mounted } = useEntrance();

  useEffect(() => {
    if (id) fetchSession(Number(id));
  }, [id]);

  if (loading && !currentSession) {
    return (
      <div className="flex justify-center py-12">
        <LoadingDots />
      </div>
    );
  }
  if (!currentSession) {
    return <div className="text-center py-12 text-muted text-sm animate-fade-in">记录不存在</div>;
  }

  const { questions, answers, mode, status, score, total_questions, correct_count, started_at, completed_at } = currentSession;
  const resultMap = new Map(answers.map((a) => [a.question_id, a]));
  const isCompleted = status === "completed";
  const modeLabel = mode === "exam" ? "模拟面试" : "刷题练习";

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back link */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate("/quiz/records")}
          className="text-sm text-slate hover:text-ink transition-all inline-flex items-center gap-1 hover:gap-1.5 active:scale-95"
        >
          ← 答题记录
        </button>
        <button
          onClick={() =>
            exportQuestionsToPDF({
              title: modeLabel,
              subtitle: `共 ${total_questions} 题 · 正确 ${correct_count} 题 · 得分率 ${score}%`,
              questions,
              answers,
            })
          }
          className="text-xs text-blue border border-blue/30 rounded-full px-3 py-1 font-medium hover:bg-blue/[0.04] transition-all active:scale-95"
        >
          下载 PDF
        </button>
      </div>

      {/* Session info */}
      <div className="bg-canvas rounded-xl border border-hairline p-6 mb-8 transition-all duration-200 hover:border-blue/20" style={entrance(mounted, 0.05)}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-ink">{modeLabel}</h2>
            <span className={`text-xs rounded-full px-2.5 py-0.5 font-medium ${
              mode === "exam" ? "bg-amber/10 text-amber" : "bg-blue-light text-blue"
            }`}>
              {mode === "exam" ? "考试" : "刷题"}
            </span>
          </div>
          {isCompleted && completed_at && (
            <span className="text-xs text-muted">
              {new Date(completed_at).toLocaleString("zh-CN")}
            </span>
          )}
        </div>

        <div className="grid grid-cols-4 gap-4">
          {[
            { value: total_questions, color: "text-ink", label: "总题数" },
            { value: correct_count, color: "text-green", label: "正确" },
            { value: total_questions - correct_count, color: "text-red", label: "错误" },
            { value: score, color: score >= 70 ? "text-green" : score >= 40 ? "text-amber" : "text-red", label: "得分率" },
          ].map((item, i) => (
            <div
              key={item.label}
              className="bg-surface rounded-lg p-3 text-center transition-all duration-200 hover:bg-blue-light/30 hover:-translate-y-0.5"
              style={entrance(mounted, 0.12 + 0.06 * i)}
            >
              <p className={`text-lg font-bold tabular-nums ${item.color}`}>
                <AnimatedNumber value={item.value} duration={700} />
                {item.label === "得分率" && "%"}
              </p>
              <p className="text-xs text-muted">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Questions review */}
      {isCompleted && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-ink" style={entrance(mounted, 0.2)}>题目回顾</h3>
          {questions.map((q, i) => {
            const result = resultMap.get(q.id);
            return (
              <QuestionCard
                key={q.id}
                question={q}
                index={i}
                selectedAnswer={result?.user_answer || ""}
                onAnswer={() => {}}
                showResult
                result={result ? {
                  is_correct: result.is_correct,
                  ai_score: result.ai_score ?? undefined,
                  ai_feedback: result.ai_feedback,
                  correct_answer: result.ai_reference || q.correct_answer,
                } : undefined}
              />
            );
          })}
        </div>
      )}

      {!isCompleted && (
        <div className="bg-amber/5 rounded-xl border border-amber/20 p-8 text-center" style={entrance(mounted, 0.1)}>
          <p className="text-sm text-amber font-medium">该场次尚未完成</p>
        </div>
      )}
    </div>
  );
}
