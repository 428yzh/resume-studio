import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuizStore } from "@core/stores/quizStore";
import QuestionCard from "@web/components/QuestionCard";
import LoadingDots from "@web/components/LoadingDots";
import { exportQuestionsToPDF } from "@core/services/pdfService";
import { useEntrance, entrance } from "@web/hooks/useEntrance";

export default function QuizSession() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentSession, currentAnswers, loading, submitting, fetchSession, submitSession, setAnswer } = useQuizStore();
  const [submitted, setSubmitted] = useState(false);
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
    return <div className="text-center py-12 text-muted text-sm animate-fade-in">答题不存在</div>;
  }

  const { questions, answers } = currentSession;

  if (currentSession.status === "completed" || submitted) {
    const resultMap = new Map(answers.map((a) => [a.question_id, a]));
    return (
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8" style={entrance(mounted, 0.05)}>
          <h2 className="text-2xl font-bold text-ink">答题结果</h2>
          <p className="text-sm text-slate mt-1">
            共 {questions.length} 题 · 正确 {answers.filter((a) => a.is_correct === true).length} 题
          </p>
        </div>
        <div className="space-y-4">
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
                result={
                  result
                    ? {
                        is_correct: result.is_correct,
                        ai_score: result.ai_score ?? undefined,
                        ai_feedback: result.ai_feedback,
                        correct_answer: result.ai_reference || q.correct_answer,
                      }
                    : undefined
                }
              />
            );
          })}
        </div>
        <div className="flex justify-center gap-3 mt-8" style={entrance(mounted, 0.2)}>
          <button
            onClick={() => navigate("/quiz")}
            className="bg-transparent text-ink border border-hairline rounded-full px-5 py-2 text-sm font-medium hover:bg-surface transition-all active:scale-95"
          >
            返回
          </button>
          <button
            onClick={() => navigate("/quiz/records")}
            className="bg-transparent text-blue border border-blue/30 rounded-full px-5 py-2 text-sm font-medium hover:bg-blue/[0.04] transition-all active:scale-95"
          >
            查看答题记录
          </button>
          <button
            onClick={() =>
              exportQuestionsToPDF({
                title: "刷题练习",
                subtitle: `共 ${questions.length} 题 · 正确 ${answers.filter((a) => a.is_correct === true).length} 题`,
                questions,
                answers,
              })
            }
            className="bg-blue text-white rounded-full px-5 py-2 text-sm font-semibold hover:bg-blue/90 transition-all active:scale-95"
          >
            下载 PDF（含答案）
          </button>
        </div>
      </div>
    );
  }

  const allAnswered = questions.every((q) => currentAnswers[q.id]?.trim());

  const handleSubmit = async () => {
    setSubmitted(true);
    await submitSession(Number(id), currentAnswers);
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Progress header */}
      <div className="flex items-center justify-between mb-6" style={entrance(mounted, 0.05)}>
        <div>
          <h2 className="text-lg font-bold text-ink">刷题练习</h2>
          <p className="text-xs text-muted mt-0.5">
            已答 {Object.keys(currentAnswers).filter((k) => currentAnswers[Number(k)]?.trim()).length} / {questions.length} 题
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted bg-surface rounded-full px-3 py-1">
            倒计时 30:00
          </span>
          <button
            onClick={() => exportQuestionsToPDF({ title: "刷题练习", subtitle: `共 ${questions.length} 题`, questions })}
            className="text-xs text-blue border border-blue/30 rounded-full px-3 py-1 font-medium hover:bg-blue/[0.04] transition-all active:scale-95"
          >
            下载空白题
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-surface rounded-full mb-6 overflow-hidden">
        <div
          className="h-full bg-blue rounded-full transition-all duration-500 ease-out"
          style={{
            width: mounted ? `${(Object.keys(currentAnswers).filter((k) => currentAnswers[Number(k)]?.trim()).length / Math.max(questions.length, 1)) * 100}%` : "0%",
          }}
        />
      </div>

      {/* Questions */}
      <div className="space-y-5">
        {questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            question={q}
            index={i}
            selectedAnswer={currentAnswers[q.id] || ""}
            onAnswer={(answer) => setAnswer(q.id, answer)}
          />
        ))}
      </div>

      {/* Submit */}
      <div className="sticky bottom-0 bg-gradient-to-t from-surface via-surface/95 to-transparent pt-8 pb-4 mt-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted">
            {allAnswered ? "所有题目已作答" : `还有 ${questions.length - Object.keys(currentAnswers).filter((k) => currentAnswers[Number(k)]?.trim()).length} 题未答`}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => navigate("/quiz")}
              className="bg-transparent text-ink border border-hairline rounded-full px-5 py-2 text-sm font-medium hover:bg-surface transition-all active:scale-95"
            >
              退出
            </button>
            <button
              onClick={handleSubmit}
              disabled={!allAnswered || submitting}
              className="bg-blue text-white rounded-full px-6 py-2 text-sm font-semibold hover:bg-blue/90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce [animation-delay:0.15s]" />
                  <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce [animation-delay:0.3s]" />
                  提交中...
                </span>
              ) : (
                "交卷"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
