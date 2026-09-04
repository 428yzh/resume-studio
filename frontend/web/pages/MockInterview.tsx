import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useInterviewStore } from "@core/stores/interviewStore";
import type { MockInterviewMessage } from "@core/models/mockInterview";
import VoiceRecorder from "@web/components/VoiceRecorder";
import AIErrorBox from "@web/components/AIErrorBox";
import AnimatedNumber from "@web/components/AnimatedNumber";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

export default function MockInterview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    currentSession,
    streamingContent,
    streamingScore,
    currentDifficulty,
    isStreaming,
    loading,
    error,
    fetchSession,
    askQuestion,
    endInterview,
  } = useInterviewStore();

  const [answer, setAnswer] = useState("");
  const [ending, setEnding] = useState(false);
  const [pageMounted, setPageMounted] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id) {
      fetchSession(Number(id));
    }
    const t = setTimeout(() => setPageMounted(true), 80);
    return () => clearTimeout(t);
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentSession?.messages, streamingContent]);

  const handleVoiceResult = useCallback((text: string) => {
    setAnswer((prev) => (prev ? prev + text : text));
  }, []);

  const handleSend = async () => {
    if (!answer.trim() || !id || isStreaming) return;
    const text = answer.trim();
    setAnswer("");
    await askQuestion(Number(id), text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEnd = async () => {
    if (!id) return;
    setEnding(true);
    try {
      await endInterview(Number(id));
    } finally {
      setEnding(false);
    }
  };

  // ── Loading state ──
  if (loading && !currentSession) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center gap-2 text-muted text-sm">
          <span className="w-2 h-2 bg-blue rounded-full animate-bounce" style={{ animationDelay: "0s" }} />
          <span className="w-2 h-2 bg-blue rounded-full animate-bounce" style={{ animationDelay: "0.15s" }} />
          <span className="w-2 h-2 bg-blue rounded-full animate-bounce" style={{ animationDelay: "0.3s" }} />
          <span className="ml-1">加载中...</span>
        </div>
      </div>
    );
  }
  if (!currentSession) {
    return (
      <div className="text-center py-12 animate-fade-in">
        <p className="text-muted text-sm mb-4">面试不存在</p>
        <button
          onClick={() => navigate("/mock-interview")}
          className="bg-blue text-white rounded-full px-5 py-2 text-sm font-semibold transition-all duration-200 hover:bg-blue/90 active:scale-95"
        >
          返回列表
        </button>
      </div>
    );
  }

  // ── Done state ──
  if (currentSession.status === "completed") {
    const feedback = currentSession.overall_feedback as Record<string, unknown> | null;
    const score = currentSession.summary_score ?? 0;
    const msgCount = currentSession.messages.filter((m) => m.role === "user").length;

    return (
      <div className="max-w-3xl mx-auto">
        {/* Score hero */}
        <div
          className="bg-canvas rounded-xl border border-hairline p-8 text-center mb-8 transition-all duration-300"
          style={{ animation: pageMounted ? "fade-in-up 0.5s ease-out both" : "none" }}
        >
          <div className="text-5xl font-bold text-ink tracking-tight">
            <AnimatedNumber value={score} />
            <span className="text-lg font-normal text-muted ml-1">/ 100</span>
          </div>
          <h2 className="text-lg font-semibold text-ink mt-2">面试结束</h2>
          <p className="text-sm text-slate mt-1">
            {currentSession.position || "该岗位"} · {msgCount} 个回答 · 总分 {score}/100
          </p>
          <div className="flex items-center justify-center gap-2 mt-3">
            <TypeBadge type={currentSession.interview_type} />
            <DifficultyBadge level={currentSession.difficulty_level} />
          </div>
        </div>

        {/* Strengths & Weaknesses */}
        {feedback && (
          <div className="space-y-3 mb-8">
            {(feedback.strengths as string[] || []).length > 0 && (
              <div
                className="bg-canvas rounded-xl border border-hairline p-5"
                style={{ animation: pageMounted ? "fade-in-up 0.4s ease-out 0.15s both" : "none" }}
              >
                <h3 className="text-xs font-semibold text-green uppercase tracking-wider mb-2">优势</h3>
                <ul className="space-y-1">
                  {(feedback.strengths as string[]).map((s, i) => (
                    <li key={i} className="text-sm text-ink flex items-start gap-2 opacity-0" style={{ animation: `fade-in 0.3s ease-out ${0.25 + 0.06 * i}s forwards` }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-green mt-1.5 flex-shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(feedback.weaknesses as string[] || []).length > 0 && (
              <div
                className="bg-canvas rounded-xl border border-hairline p-5"
                style={{ animation: pageMounted ? "fade-in-up 0.4s ease-out 0.2s both" : "none" }}
              >
                <h3 className="text-xs font-semibold text-amber uppercase tracking-wider mb-2">待改进</h3>
                <ul className="space-y-1">
                  {(feedback.weaknesses as string[]).map((w, i) => (
                    <li key={i} className="text-sm text-ink flex items-start gap-2 opacity-0" style={{ animation: `fade-in 0.3s ease-out ${0.35 + 0.06 * i}s forwards` }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-amber mt-1.5 flex-shrink-0" />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(feedback.suggestions as string[] || []).length > 0 && (
              <div
                className="bg-canvas rounded-xl border border-hairline p-5"
                style={{ animation: pageMounted ? "fade-in-up 0.4s ease-out 0.25s both" : "none" }}
              >
                <h3 className="text-xs font-semibold text-blue uppercase tracking-wider mb-2">改进建议</h3>
                <ul className="space-y-1">
                  {(feedback.suggestions as string[]).map((s, i) => (
                    <li key={i} className="text-sm text-ink flex items-start gap-2 opacity-0" style={{ animation: `fade-in 0.3s ease-out ${0.45 + 0.06 * i}s forwards` }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-blue mt-1.5 flex-shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Messages review */}
        <div
          className="border border-hairline rounded-lg overflow-hidden mb-8 transition-all duration-300"
          style={{ animation: pageMounted ? "fade-in-up 0.4s ease-out 0.3s both" : "none" }}
        >
          <div className="bg-surface px-4 py-2.5 text-xs font-medium text-slate border-b border-hairline">
            对话回顾
          </div>
          <div className="divide-y divide-hairline">
            {currentSession.messages
              .filter((m) => m.role === "ai" && m.question_type !== "closing")
              .map((m, i) => (
                <div key={m.id} className="px-4 py-3 transition-colors duration-150 hover:bg-surface/50">
                  <span className="text-xs text-blue font-medium">Q{i + 1}</span>
                  <p className="text-sm text-ink mt-0.5 line-clamp-2">{m.content}</p>
                </div>
              ))}
          </div>
        </div>

        {/* Actions */}
        <div
          className="flex justify-center gap-3"
          style={{ animation: pageMounted ? "fade-in 0.3s ease-out 0.4s both" : "none" }}
        >
          <button
            onClick={() => navigate("/mock-interview")}
            className="bg-transparent text-ink border border-hairline rounded-full px-5 py-2 text-sm font-medium transition-all duration-200 hover:bg-surface active:scale-95"
          >
            返回列表
          </button>
          <button
            onClick={() => navigate("/mock-interview/new")}
            className="bg-blue text-white rounded-full px-5 py-2 text-sm font-semibold transition-all duration-200 hover:bg-blue/90 active:scale-95"
          >
            再来一次
          </button>
        </div>
      </div>
    );
  }

  // ── In-progress: Chat UI ──
  const allMessages = currentSession.messages || [];
  const displayDifficulty = currentDifficulty || currentSession.difficulty_level;

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-8rem)] animate-fade-in">
      {/* Top bar */}
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-hairline">
        <div className="flex items-center gap-2">
          <div>
            <h2 className="text-sm font-semibold text-ink">
              {currentSession.position || "模拟面试"}
            </h2>
            <p className="text-xs text-muted">
              {currentSession.company || "面试中"}
              {currentSession.jd_analysis_id && " · 基于 JD"}
            </p>
          </div>
          <div className="flex items-center gap-1.5 ml-3 pl-3 border-l border-hairline">
            <TypeBadge type={currentSession.interview_type} />
            <DifficultyBadge level={displayDifficulty} />
          </div>
        </div>
        <button
          onClick={handleEnd}
          disabled={ending || isStreaming}
          className="bg-transparent text-red border border-red/30 rounded-full px-4 py-1.5 text-xs font-medium transition-all duration-200 hover:bg-red/5 active:scale-95 disabled:opacity-50"
        >
          {ending ? "结束中..." : "结束面试"}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {allMessages.map((m, i) => (
          <MessageBubble key={m.id} message={m} index={i} />
        ))}

        {/* Streaming AI message */}
        {(isStreaming || streamingContent) && (
          <div className="flex items-start gap-3" style={{ animation: "fade-in-up 0.3s ease-out both" }}>
            <div className="w-7 h-7 rounded-full bg-surface flex items-center justify-center flex-shrink-0">
              <span className="text-xs text-slate font-medium">面试官</span>
            </div>
            <div className="bg-surface rounded-2xl rounded-tl-sm px-4 py-3 max-w-[80%]">
              <MarkdownContent content={streamingContent} />
              {isStreaming && (
                <span className="inline-block w-1.5 h-4 bg-slate ml-0.5 rounded-sm animate-pulse" />
              )}
            </div>
          </div>
        )}

        {/* Score notification */}
        {streamingScore && !streamingContent && (
          <div className="flex justify-center" style={{ animation: "scale-in 0.25s ease-out both" }}>
            <div className="bg-surface rounded-full px-4 py-1.5 text-xs text-slate flex items-center gap-2">
              <span className="font-medium">评分 {streamingScore.score}/10</span>
              <span className="text-muted">·</span>
              <span>{streamingScore.feedback}</span>
            </div>
          </div>
        )}

        {/* Difficulty change notification */}
        {currentDifficulty && currentDifficulty !== currentSession.difficulty_level && (
          <div className="flex justify-center" style={{ animation: "scale-in 0.25s ease-out both" }}>
            <div className="bg-blue/10 border border-blue/20 rounded-full px-4 py-1.5 text-xs text-blue flex items-center gap-1.5">
              <span>难度已调整为</span>
              <DifficultyBadge level={currentDifficulty} />
            </div>
          </div>
        )}

        {error && !isStreaming && (
          <div className="max-w-[80%]">
            <AIErrorBox
              message={error}
              onRetry={() => answer.trim() && !isStreaming && askQuestion(Number(id), answer.trim())}
              retryLabel="重试发送"
            />
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input area */}
      <div className="mt-4 pt-3 border-t border-hairline">
        <div className="flex items-end gap-2">
          <VoiceRecorder onResult={handleVoiceResult} disabled={isStreaming} />
          <textarea
            className="flex-1 bg-canvas border border-hairline rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-muted resize-none outline-none transition-all duration-200 focus:border-blue/50 focus:shadow-[0_0_0_3px_rgba(20,86,240,0.06)]"
            rows={2}
            placeholder="输入你的回答..."
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
          />
          <button
            onClick={handleSend}
            disabled={!answer.trim() || isStreaming}
            className="bg-blue text-white rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-200 hover:bg-blue/90 active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex-shrink-0"
          >
            {isStreaming ? (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce [animation-delay:0.15s]" />
                <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce [animation-delay:0.3s]" />
              </span>
            ) : (
              "发送"
            )}
          </button>
        </div>
        <p className="text-xs text-muted mt-1.5">Enter 发送 · Shift+Enter 换行 · 🎤 语音输入</p>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="text-sm text-ink mb-1 last:mb-0 leading-relaxed">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-1 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-1 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="text-sm text-ink leading-relaxed">{children}</li>,
        code: ({ children }) => <code className="bg-surface px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>,
        pre: ({ children }) => <pre className="bg-surface rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono">{children}</pre>,
        h1: ({ children }) => <h1 className="text-base font-bold mb-1">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold mb-1">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mb-0.5">{children}</h3>,
        br: () => <br />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function MessageBubble({ message, index }: { message: MockInterviewMessage; index: number }) {
  const isUser = message.role === "user";
  const isOpening = message.question_type === "opening";
  const delay = 0.05 * index;

  if (isUser) {
    const meta = message.metadata_json as Record<string, unknown>;
    const score = typeof meta.score === "number" ? meta.score : null;
    const feedback = typeof meta.feedback === "string" ? meta.feedback : null;
    return (
      <div className="flex items-start gap-3 justify-end" style={{ animation: `fade-in-up 0.35s ease-out ${delay}s both` }}>
        <div className="bg-blue text-white rounded-2xl rounded-tr-sm px-4 py-3 max-w-[75%]">
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          {score !== null && (
            <div className="mt-1.5 pt-1.5 border-t border-white/20 flex items-center gap-2 opacity-0" style={{ animation: `fade-in 0.3s ease-out ${delay + 0.15}s forwards` }}>
              <span className="text-xs text-white/80">评分 {score}/10</span>
              {feedback && (
                <span className="text-xs text-white/60">{feedback}</span>
              )}
            </div>
          )}
        </div>
        <div className="w-7 h-7 rounded-full bg-blue flex items-center justify-center flex-shrink-0">
          <span className="text-xs text-white font-medium">你</span>
        </div>
      </div>
    );
  }

  if (isOpening) {
    return (
      <div className="flex justify-center" style={{ animation: `fade-in-up 0.4s ease-out ${delay}s both` }}>
        <div className="bg-gradient-to-br from-blue to-blue/80 text-white rounded-[20px] px-5 py-3.5 max-w-[85%] text-center shadow-sm">
          <p className="text-xs font-medium text-white/80 mb-1">面试官</p>
          <div className="text-sm leading-relaxed [&_p]:text-white [&_strong]:text-white [&_li]:text-white">
            <MarkdownContent content={message.content} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3" style={{ animation: `fade-in-up 0.35s ease-out ${delay}s both` }}>
      <div className="w-7 h-7 rounded-full bg-surface flex items-center justify-center flex-shrink-0 transition-transform duration-200 hover:scale-105">
        <span className="text-xs text-slate font-medium">面试官</span>
      </div>
      <div className="bg-surface rounded-2xl rounded-tl-sm px-4 py-3 max-w-[80%] border-l-[3px] border-l-blue/30 transition-all duration-200 hover:border-l-blue/50">
        <MarkdownContent content={message.content} />
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue/10 text-blue transition-all duration-200">
      {TYPE_LABELS[type] || type}
    </span>
  );
}

function DifficultyBadge({ level }: { level: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium transition-all duration-200 ${DIFF_COLORS[level] || "bg-surface text-slate"}`}>
      {DIFF_LABELS[level] || level}
    </span>
  );
}
