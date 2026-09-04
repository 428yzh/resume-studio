import type { Question } from "@core/models/quiz";
import { useEntrance, entrance } from "@web/hooks/useEntrance";

interface QuestionCardProps {
  question: Question;
  index: number;
  selectedAnswer: string;
  onAnswer: (answer: string) => void;
  showResult?: boolean;
  result?: { is_correct: boolean | null; ai_score?: number; ai_feedback?: string; correct_answer: string };
}

function getDifficultyLabel(d: string) {
  return d === "easy" ? "简单" : d === "hard" ? "困难" : "中等";
}

export default function QuestionCard({ question, index, selectedAnswer, onAnswer, showResult, result }: QuestionCardProps) {
  const options = (question.options as { key: string; text: string }[]) || [];
  const { mounted } = useEntrance();

  return (
    <div
      className="bg-canvas rounded-xl border border-hairline p-5 transition-all duration-200 hover:border-blue/20"
      style={entrance(mounted, Math.min(0.08 * index, 0.8))}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-white bg-charcoal rounded-full w-6 h-6 flex items-center justify-center shrink-0">
            {index + 1}
          </span>
          <span className="text-xs text-muted bg-surface rounded-full px-2.5 py-0.5 shrink-0">
            {question.type === "single_choice" ? "单选题" : question.type === "multi_choice" ? "多选题" : "问答题"}
          </span>
        </div>
        {result && (
          <div className="flex items-center gap-2 shrink-0">
            {result.is_correct === true && <span className="text-xs text-green bg-green/10 rounded-full px-2.5 py-0.5 font-medium">✓ 正确</span>}
            {result.is_correct === false && <span className="text-xs text-red bg-red/10 rounded-full px-2.5 py-0.5 font-medium">✗ 错误</span>}
            {result.is_correct === null && result.ai_score !== undefined && (
              <span className={`text-xs rounded-full px-2.5 py-0.5 font-medium ${
                result.ai_score >= 70 ? "text-green bg-green/10" : result.ai_score >= 40 ? "text-amber bg-amber/10" : "text-red bg-red/10"
              }`}>
                {result.ai_score} 分
              </span>
            )}
          </div>
        )}
      </div>

      {/* Question text */}
      <p className="text-sm text-charcoal leading-relaxed mb-4">{question.question_text}</p>

      {/* Options for choice questions */}
      {(question.type === "single_choice" || question.type === "multi_choice") && (
        <div className="space-y-2">
          {options.map((opt) => {
            const isSelected = selectedAnswer.includes(opt.key);
            const isCorrectAnswer = result?.correct_answer?.includes(opt.key);
            const isUserWrong = result && !result.is_correct && isSelected && !isCorrectAnswer;

            let border = "border-hairline";
            let bg = "bg-canvas";
            let icon = null;

            if (showResult) {
              if (isCorrectAnswer) {
                border = "border-green/40";
                bg = "bg-green/[0.04]";
                icon = <span className="text-green text-sm font-bold">✓</span>;
              } else if (isUserWrong) {
                border = "border-red/40";
                bg = "bg-red/[0.04]";
                icon = <span className="text-red text-sm font-bold">✗</span>;
              } else if (isSelected) {
                border = "border-blue/40";
                bg = "bg-blue/[0.04]";
              }
            } else if (isSelected) {
              border = "border-blue";
              bg = "bg-blue/[0.04]";
            }

            return (
              <button
                key={opt.key}
                onClick={() => {
                  if (showResult) return;
                  if (question.type === "single_choice") {
                    onAnswer(opt.key);
                  } else {
                    const keys = selectedAnswer.split(",").filter(Boolean);
                    const next = keys.includes(opt.key)
                      ? keys.filter((k) => k !== opt.key).join(",")
                      : [...keys, opt.key].join(",");
                    onAnswer(next);
                  }
                }}
                disabled={showResult}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-sm text-left transition-colors ${border} ${bg} ${
                  !showResult ? "hover:border-blue/30 hover:bg-blue/[0.02] cursor-pointer" : "cursor-default"
                }`}
              >
                <span className={`w-7 h-7 rounded-full border flex items-center justify-center text-xs font-medium shrink-0 ${
                  showResult && isCorrectAnswer
                    ? "border-green text-green bg-green/10"
                    : showResult && isUserWrong
                    ? "border-red text-red bg-red/10"
                    : isSelected
                    ? "border-blue text-blue bg-blue-light"
                    : "border-hairline text-slate"
                }`}>
                  {icon || opt.key}
                </span>
                <span className="text-sm text-charcoal">{opt.text}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Essay answer */}
      {question.type === "essay" && (
        <div>
          {showResult ? (
            <div className="space-y-3">
              <div className="bg-surface rounded-lg border border-hairline p-4">
                <p className="text-xs text-muted mb-1.5 font-medium">你的回答</p>
                <p className="text-sm text-charcoal whitespace-pre-wrap">{selectedAnswer}</p>
              </div>
              {result?.ai_feedback && (
                <div className="bg-blue-light/20 rounded-lg border border-blue/10 p-4">
                  <p className="text-xs text-blue mb-1.5 font-medium">AI 反馈</p>
                  <p className="text-sm text-charcoal whitespace-pre-wrap">{result.ai_feedback}</p>
                </div>
              )}
              {result?.correct_answer && (
                <div className="bg-green/[0.04] rounded-lg border border-green/20 p-4">
                  <p className="text-xs text-green mb-1.5 font-medium">参考答案</p>
                  <p className="text-sm text-charcoal whitespace-pre-wrap">{result.correct_answer}</p>
                </div>
              )}
            </div>
          ) : (
            <textarea
              value={selectedAnswer}
              onChange={(e) => onAnswer(e.target.value)}
              placeholder="输入你的回答..."
              className="w-full border border-hairline rounded-lg px-4 py-3 text-sm text-charcoal outline-none focus:border-blue transition-colors resize-none min-h-[120px]"
            />
          )}
        </div>
      )}
    </div>
  );
}
