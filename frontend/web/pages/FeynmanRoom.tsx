import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useFeynmanStore } from "@core/stores/feynmanStore";
import type { FeynmanMessage } from "@core/models/feynman";
import LevelBadge from "@web/components/LevelBadge";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Download, PresentationChart, Question } from "@phosphor-icons/react";

export default function FeynmanRoom() {
  const { id } = useParams<{ id: string }>();
  const roomId = Number(id);
  const navigate = useNavigate();

  // 房间隔离：只订阅当前房间的聊天状态，其他房间的流式/消息互不影响
  const currentTopic = useFeynmanStore((s) => (s.rooms[roomId]?.topic ?? null));
  const streamingContent = useFeynmanStore((s) => s.rooms[roomId]?.streamingContent ?? "");
  const streamingLevel = useFeynmanStore((s) => s.rooms[roomId]?.streamingLevel ?? null);
  const isStreaming = useFeynmanStore((s) => s.rooms[roomId]?.isStreaming ?? false);
  const loading = useFeynmanStore((s) => s.loading);
  const error = useFeynmanStore((s) => s.error);
  const fetchTopic = useFeynmanStore((s) => s.fetchTopic);
  const sendMessage = useFeynmanStore((s) => s.sendMessage);
  const generateReport = useFeynmanStore((s) => s.generateReport);
  const addProblem = useFeynmanStore((s) => s.addProblem);
  const setProblemStatus = useFeynmanStore((s) => s.setProblemStatus);

  const [teaching, setTeaching] = useState("");
  const [generating, setGenerating] = useState(false);
  const [pageMounted, setPageMounted] = useState(false);
  const [problemOpen, setProblemOpen] = useState(false);
  const [newProblem, setNewProblem] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const handleAddProblem = async () => {
    if (!newProblem.trim()) return;
    const text = newProblem.trim();
    setNewProblem("");
    await addProblem(roomId, text);
  };

  useEffect(() => {
    if (id) fetchTopic(Number(id));
    const t = setTimeout(() => setPageMounted(true), 80);
    return () => clearTimeout(t);
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentTopic?.messages, streamingContent]);

  const handleSend = async () => {
    if (!teaching.trim() || !id || isStreaming) return;
    const text = teaching.trim();
    setTeaching("");
    await sendMessage(Number(id), text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReport = async () => {
    if (!id) return;
    setGenerating(true);
    await generateReport(Number(id));
    await fetchTopic(Number(id));
    setGenerating(false);
  };

  // ── Loading / 404 ──
  if (loading && !currentTopic) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center gap-2 text-muted text-sm">
          <span className="w-2 h-2 bg-blue rounded-full animate-bounce" />
          <span className="w-2 h-2 bg-blue rounded-full animate-bounce [animation-delay:0.15s]" />
          <span className="w-2 h-2 bg-blue rounded-full animate-bounce [animation-delay:0.3s]" />
          <span className="ml-1">加载中...</span>
        </div>
      </div>
    );
  }
  if (!currentTopic) {
    return (
      <div className="text-center py-12 animate-fade-in">
        <p className="text-muted text-sm mb-4">房间不存在</p>
        <button
          onClick={() => navigate("/feynman")}
          className="bg-blue text-white rounded-full px-5 py-2 text-sm font-semibold transition-all duration-200 hover:bg-blue/90 active:scale-95"
        >
          返回列表
        </button>
      </div>
    );
  }

  // ── 已完成态 ──
  if (currentTopic.status === "completed") {
    return <CompletedView topicId={currentTopic.id} topicName={currentTopic.name} onBack={() => navigate("/feynman")} />;
  }

  const allMessages = currentTopic.messages || [];

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-8rem)] animate-fade-in">
      {/* 顶栏 */}
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-hairline">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => navigate("/feynman")}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-surface transition-all duration-200 flex-shrink-0"
            title="返回"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink truncate">{currentTopic.name}</h2>
            <p className="text-xs text-muted">
              广度追问 {currentTopic.breadth_left}/2 · 深度追问 {currentTopic.depth_left}/2
              {currentTopic.weak_points?.length > 0 && (
                <span className="text-amber"> · 薄弱点 {currentTopic.weak_points.length}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <LevelBadge level={currentTopic.level} showDesc />
          <button
            onClick={handleReport}
            disabled={generating || isStreaming}
            className="bg-blue text-white rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 hover:bg-blue/90 active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
          >
            <PresentationChart size={14} />
            {generating ? "生成中…" : "生成 PPT"}
          </button>
        </div>
      </div>

      {/* 消息区 */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {allMessages.length === 0 && (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-full bg-surface flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🎓</span>
            </div>
            <p className="text-sm text-ink font-medium">给数字学生讲第一课</p>
            <p className="text-xs text-muted mt-1">它什么都不懂——只信你教的内容，讲不清它就会追问</p>
          </div>
        )}

        {allMessages.map((m, i) => (
          <MessageBubble key={m.id} message={m} index={i} />
        ))}

        {/* 流式 AI 回复 */}
        {(isStreaming || streamingContent) && (
          <div className="flex items-start gap-3" style={{ animation: "fade-in-up 0.3s ease-out both" }}>
            <div className="w-7 h-7 rounded-full bg-surface flex items-center justify-center flex-shrink-0">
              <span className="text-xs text-slate font-medium">学生</span>
            </div>
            <div className="bg-surface rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%] border border-hairline">
              <div className="flex items-center gap-2 mb-1.5">
                <LevelBadge level={streamingLevel} size="sm" />
              </div>
              <MarkdownContent content={streamingContent} />
              {isStreaming && <span className="inline-block w-1.5 h-4 bg-slate ml-0.5 rounded-sm animate-pulse" />}
            </div>
          </div>
        )}

        {error && !isStreaming && (
          <div className="bg-red/5 border border-red/20 rounded-xl px-4 py-3 text-xs text-red">
            {error}
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* 问题跟踪（手动记录教学缺陷/卡点；AI 只在回复里提示，不自动添加） */}
      <div className="mt-3 border border-hairline rounded-xl overflow-hidden bg-canvas flex-shrink-0">
        <button
          onClick={() => setProblemOpen(!problemOpen)}
          className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-ink hover:bg-surface transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Question size={14} className="text-slate" />
            问题跟踪
            {currentTopic.problems.filter((p) => p.status === "open").length > 0 && (
              <span className="text-amber text-[11px] font-medium">
                未解决 {currentTopic.problems.filter((p) => p.status === "open").length}
              </span>
            )}
          </span>
          <span className="text-muted text-[11px]">{problemOpen ? "收起" : "展开"}</span>
        </button>

        {problemOpen && (
          <div className="border-t border-hairline px-3 py-2.5 space-y-2 bg-surface">
            <div className="flex items-center gap-2">
              <input
                value={newProblem}
                onChange={(e) => setNewProblem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddProblem();
                  }
                }}
                placeholder="记下这个卡点 / 缺陷…（AI 不自动添加）"
                className="flex-1 bg-canvas border border-hairline rounded-lg px-3 py-1.5 text-xs text-ink placeholder:text-muted outline-none transition-all focus:border-blue/50"
              />
              <button
                onClick={handleAddProblem}
                disabled={!newProblem.trim()}
                className="bg-blue text-white rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 hover:bg-blue/90 active:scale-95 disabled:opacity-40 flex-shrink-0"
              >
                添加
              </button>
            </div>

            {currentTopic.problems.length === 0 ? (
              <p className="text-xs text-muted">暂无记录。数字学生讲错 / 讲含糊时会在回复里提示你,点开这里手动记下。</p>
            ) : (
              currentTopic.problems.map((p) => (
                <div
                  key={p.id}
                  className="flex items-start gap-2 bg-canvas border border-hairline rounded-lg px-3 py-2"
                >
                  <span className={`flex-1 text-xs leading-relaxed ${p.status === "resolved" ? "line-through text-muted" : "text-ink"}`}>
                    {p.content}
                  </span>
                  {p.status === "open" ? (
                    <button
                      onClick={() => setProblemStatus(roomId, p.id, "resolved")}
                      className="text-xs text-green font-medium hover:underline flex-shrink-0"
                    >
                      标记解决
                    </button>
                  ) : (
                    <button
                      onClick={() => setProblemStatus(roomId, p.id, "open")}
                      className="text-xs text-slate font-medium hover:underline flex-shrink-0"
                    >
                      重开
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="mt-4 pt-3 border-t border-hairline">
        <div className="flex items-end gap-2">
          <textarea
            className="flex-1 bg-canvas border border-hairline rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-muted resize-none outline-none transition-all duration-200 focus:border-blue/50 focus:shadow-[0_0_0_3px_rgba(20,86,240,0.06)]"
            rows={2}
            placeholder="给数字学生讲解这个主题…"
            value={teaching}
            onChange={(e) => setTeaching(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
          />
          <button
            onClick={handleSend}
            disabled={!teaching.trim() || isStreaming}
            className="bg-blue text-white rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-200 hover:bg-blue/90 active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex-shrink-0"
          >
            {isStreaming ? (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce [animation-delay:0.15s]" />
                <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce [animation-delay:0.3s]" />
              </span>
            ) : (
              "讲解"
            )}
          </button>
        </div>
        <p className="text-xs text-muted mt-1.5">Enter 发送 · Shift+Enter 换行 · 等级徽章 = 数字学生当前理解</p>
      </div>
    </div>
  );
}

// ─── 已完成态 ─────────────────────────────
function CompletedView({ topicId, topicName, onBack }: { topicId: number; topicName: string; onBack: () => void }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    await useFeynmanStore.getState().generateReport(topicId);  // POST + blob 下载
    setDownloading(false);
  };

  return (
    <div className="max-w-3xl mx-auto text-center py-16 animate-fade-in">
      <div className="bg-canvas rounded-xl border border-hairline p-10 mb-6" style={{ animation: "fade-in-up 0.5s ease-out both" }}>
        <div className="text-5xl mb-4">🎓</div>
        <h2 className="text-xl font-bold text-ink mb-2">「{topicName}」学习完成</h2>
        <p className="text-sm text-slate mb-6">数字学生已学完这个主题，学习报告已生成并可下载</p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={onBack}
            className="bg-transparent text-ink border border-hairline rounded-full px-5 py-2 text-sm font-medium transition-all duration-200 hover:bg-surface active:scale-95"
          >
            返回列表
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="bg-blue text-white rounded-full px-5 py-2 text-sm font-semibold transition-all duration-200 hover:bg-blue/90 active:scale-95 disabled:opacity-60 flex items-center gap-1.5"
          >
            <Download size={15} />
            {downloading ? "生成中…" : "下载 PPT 报告"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 子组件 ─────────────────────────────
function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="text-sm text-ink mb-1 last:mb-0 leading-relaxed">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-1 space-y-0.5">{children}</ul>,
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

function MessageBubble({ message, index }: { message: FeynmanMessage; index: number }) {
  const isUser = message.role === "user";
  const delay = 0.05 * index;

  if (isUser) {
    return (
      <div className="flex items-start gap-3 justify-end" style={{ animation: `fade-in-up 0.35s ease-out ${delay}s both` }}>
        <div className="bg-blue text-white rounded-2xl rounded-tr-sm px-4 py-3 max-w-[75%]">
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
        </div>
        <div className="w-7 h-7 rounded-full bg-blue flex items-center justify-center flex-shrink-0">
          <span className="text-xs text-white font-medium">师</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3" style={{ animation: `fade-in-up 0.35s ease-out ${delay}s both` }}>
      <div className="w-7 h-7 rounded-full bg-surface flex items-center justify-center flex-shrink-0">
        <span className="text-xs text-slate font-medium">学</span>
      </div>
      <div className="bg-surface rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%] border border-hairline">
        <div className="flex items-center gap-2 mb-1.5">
          <LevelBadge level={message.level} size="sm" />
        </div>
        <MarkdownContent content={message.content} />
      </div>
    </div>
  );
}
