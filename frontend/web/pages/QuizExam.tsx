import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuizStore } from "@core/stores/quizStore";
import QuestionCard from "@web/components/QuestionCard";
import LoadingDots from "@web/components/LoadingDots";
import AnimatedNumber from "@web/components/AnimatedNumber";
import { useEntrance, entrance } from "@web/hooks/useEntrance";

const EXAM_DURATION = 45 * 60; // 45 minutes in seconds

export default function QuizExam() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentSession, currentAnswers, loading, submitting, fetchSession, submitSession, setAnswer } = useQuizStore();
  const [timeLeft, setTimeLeft] = useState(EXAM_DURATION);
  const [submitted, setSubmitted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submittedRef = useRef(false);
  const { mounted } = useEntrance();

  useEffect(() => {
    if (id) {
      fetchSession(Number(id));
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [id]);

  // Start timer when session loads
  useEffect(() => {
    if (currentSession && currentSession.status === "in_progress" && !submittedRef.current) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            // Auto-submit when time runs out
            if (!submittedRef.current) {
              submittedRef.current = true;
              handleAutoSubmit();
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentSession?.status]);

  const handleAutoSubmit = useCallback(async () => {
    if (!id || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitted(true);
    await submitSession(Number(id), currentAnswers);
  }, [id, currentAnswers]);

  const handleSubmit = async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    setSubmitted(true);
    await submitSession(Number(id), currentAnswers);
  };

  if (loading && !currentSession) {
    return (
      <div className="flex justify-center py-12">
        <LoadingDots />
      </div>
    );
  }
  if (!currentSession) {
    return <div className="text-center py-12 text-muted text-sm animate-fade-in">考试不存在</div>;
  }

  const { questions, answers } = currentSession;

  // Show results if exam is completed or just submitted
  if (currentSession.status === "completed" || submitted) {
    const resultMap = new Map(answers.map((a) => [a.question_id, a]));
    const totalScore = answers.reduce((sum, a) => sum + (a.ai_score || (a.is_correct ? 100 : 0)), 0);
    const maxScore = questions.length * 100;
    const pct = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

    return (
      <div className="max-w-3xl mx-auto">
        {/* Score hero */}
        <div
          className="bg-canvas rounded-xl border border-hairline p-8 text-center mb-8 transition-all duration-200 hover:border-blue/20"
          style={entrance(mounted, 0.05)}
        >
          <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4 transition-all duration-300 hover:scale-105 ${
            pct >= 70 ? "bg-green/10" : pct >= 40 ? "bg-amber/10" : "bg-red/10"
          }`}>
            <span className={`text-3xl font-bold tabular-nums ${
              pct >= 70 ? "text-green" : pct >= 40 ? "text-amber" : "text-red"
            }`}>
              <AnimatedNumber value={pct} duration={900} />
            </span>
          </div>
          <h2 className="text-xl font-bold text-ink mb-1">考试成绩</h2>
          <p className="text-sm text-slate">
            {questions.length} 题 · 得分率 {pct}%
            {pct >= 70 ? " · 表现不错！" : pct >= 40 ? " · 继续加油" : " · 需要巩固"}
          </p>
        </div>

        {/* Per-question review */}
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

        <div className="flex justify-center gap-3 mt-8" style={entrance(mounted, 0.2)}>
          <button
            onClick={() => navigate("/quiz")}
            className="bg-transparent text-ink border border-hairline rounded-full px-5 py-2 text-sm font-medium hover:bg-surface transition-all active:scale-95"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  // Format time
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const isLowTime = timeLeft < 300;
  const isCritical = timeLeft < 60;

  const allAnswered = questions.every((q) => currentAnswers[q.id]?.trim());
  const answeredCount = Object.keys(currentAnswers).filter((k) => currentAnswers[Number(k)]?.trim()).length;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Exam header with timer */}
      <div className="sticky top-14 z-40 bg-canvas border-b border-hairline -mx-6 px-6 py-3 mb-6" style={entrance(mounted, 0.05)}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">模拟面试</h2>
            <p className="text-xs text-muted">{answeredCount}/{questions.length} 已答</p>
          </div>
          <div className="flex items-center gap-4">
            <span className={`text-sm font-mono font-bold rounded-full px-3 py-1 ${
              isCritical
                ? "bg-red/10 text-red animate-pulse"
                : isLowTime
                ? "bg-amber/10 text-amber"
                : "bg-surface text-slate"
            }`}>
              {timeStr}
            </span>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-blue text-white rounded-full px-4 py-1.5 text-xs font-semibold hover:bg-blue/90 active:scale-95 disabled:opacity-50 transition-all"
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

      {/* Bottom submit bar */}
      <div className="flex items-center justify-between py-6 mt-4 border-t border-hairline">
        <p className="text-xs text-muted">
          {allAnswered ? "所有题目已作答" : `还有 ${questions.length - answeredCount} 题未答`}
        </p>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="bg-blue text-white rounded-full px-6 py-2 text-sm font-semibold hover:bg-blue/90 active:scale-95 disabled:opacity-50 transition-all"
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
  );
}
