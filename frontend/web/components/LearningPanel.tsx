import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { api } from "@core/api/client";
import FloatingNote from "./FloatingNote";
import HighlightableMarkdown from "./HighlightableMarkdown";
import { contentHighlightKey } from "@core/services/highlights";
import { isUnavailable } from "@core/services/aiDegrade";
import { findCornell, loadCornellFromStorage } from "@core/services/scoring";
import { useSkillStore } from "@core/stores/skillStore";
import type { GraphNode } from "@core/models/skill";
import AIErrorBox from "./AIErrorBox";

interface StepData {
  title: string;
  description: string;
  topics: string[];
  stepNumber: number;
  estimated_hours: number;
  /** 这个单元覆盖的图谱顶层节点 id（② 之后生成的计划才有，旧计划没有） */
  nodeIds?: string[];
}

interface LearningPanelProps {
  open: boolean;
  onClose: () => void;
  onAddResource?: (title: string, url?: string) => void;
  skillName: string;
  skillId: number;
  step: StepData;
  requiredLevel: string;
  stepType?: string;
  /** 本单元分到的图谱块（含子树）。空数组 = 没图谱，退回 AI 自产关键词那套 */
  block?: GraphNode[];
}

/** 深入讲解入口：有图谱块就用块的下一层（结论 10「往下再拆一层」），否则用 AI 关键词 */
interface TopicEntry {
  title: string;
  /** 图谱节点的 id，点了要把它交给后端当内容边界；AI 关键词没有 */
  nodeId?: string;
}

/* ─── Cornell shape ─── */
interface CornellData {
  cues: string[];
  notes: string;
  summary: string;
}

/* ─── Helpers ─── */
function extractLinks(md: string): { text: string; url: string }[] {
  const result: { text: string; url: string }[] = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(md)) !== null) {
    if (m[2].startsWith("http")) result.push({ text: m[1], url: m[2] });
  }
  return result;
}

/* 后端异常时返回 200 + 降级文案，用共享助手识别并转入错误态 */
const TOPIC_UNAVAILABLE = "AI 暂不可用，请稍后再试。";

function explainKey(skillId: number, stepNum: number) {
  return `explain__${skillId}__step${stepNum}`;
}
function topicKey(skillId: number, stepNum: number, topic: string) {
  return `topic__${skillId}__step${stepNum}__${topic}`;
}
function promptsKey(skillId: number, stepNum: number) {
  return `cornell_prompts__${skillId}__step${stepNum}`;
}
function activeTopicKey(skillId: number, stepNum: number) {
  return `active_topic__${skillId}__step${stepNum}`;
}
function topicsKey(skillId: number, stepNum: number) {
  return `explain_topics__${skillId}__step${stepNum}`;
}

/* ── Cache ── */
function cacheGet(key: string): string | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      const entry = JSON.parse(raw);
      if (entry && typeof entry === "object" && "value" in entry) {
        return entry.value ?? null;
      }
    } catch { /* old format */ }
    return raw;
  } catch {
    return null;
  }
}

function cacheSet(key: string, value: string) {
  try {
    localStorage.setItem(key, JSON.stringify({ value, cached_at: Date.now() }));
  } catch { /* ignore */ }
}

/* ─── Easing constants ─── */
const PANEL_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
const PANEL_DURATION = 500;

export default function LearningPanel({
  open,
  onClose,
  onAddResource,
  skillName,
  skillId,
  step,
  requiredLevel,
  stepType,
  block = [],
}: LearningPanelProps) {
  /* ── AI explanation (cached) ── */
  const [explanation, setExplanation] = useState("");
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [explanationError, setExplanationError] = useState("");

  /* ── Topic Q&A (cached) ── */
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [topicAnswers, setTopicAnswers] = useState<Record<string, string>>({});
  const [topicLoading, setTopicLoading] = useState<Record<string, boolean>>({});

  /* ── 单元概述返回的知识点关键词（无图谱时驱动深入讲解按钮，不再用学习计划的 topics） ── */
  const [topicKeywords, setTopicKeywords] = useState<string[]>([]);

  /* 深入讲解入口。有图谱块就取块的下一层 —— 这是「往下再拆一层」的落点，
     且每个入口都带节点 id，点进去的内容边界由后端按同一棵树渲染。
     没图谱（旧计划）退回 AI 从概述里自产的关键词。 */
  const topicEntries: TopicEntry[] = useMemo(
    () =>
      block.length
        ? block.flatMap((n) => n.children.map((c) => ({ title: c.title, nodeId: c.id })))
        : topicKeywords.map((t) => ({ title: t })),
    [block, topicKeywords]
  );


  /* ── Cornell ── */
  const { fetchNotes, saveNote } = useSkillStore();
  const [prompts, setPrompts] = useState<string[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [cornell, setCornell] = useState<CornellData>({ cues: [], notes: "", summary: "" });

  /* ── Floating note ── */
  const [showFloatingNote, setShowFloatingNote] = useState(false);
  const [brushMode, setBrushMode] = useState(false);
  const stickyKey = `sticky__${skillId}__step${step.stepNumber}`;

  /* ── UI ── */
  const [previewMode, setPreviewMode] = useState(false);
  const [addedLinks, setAddedLinks] = useState<Set<string>>(new Set());
  const [panelWidth, setPanelWidth] = useState(520);
  const [rendered, setRendered] = useState(false);
  const [visible, setVisible] = useState(false);

  /* ── Drag refs ── */
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(520);

  /* ── Keys ── */
  const eKey = useMemo(() => explainKey(skillId, step.stepNumber), [skillId, step.stepNumber]);
  const pKey = useMemo(() => promptsKey(skillId, step.stepNumber), [skillId, step.stepNumber]);
  const aKey = useMemo(() => activeTopicKey(skillId, step.stepNumber), [skillId, step.stepNumber]);
  const tkKey = useMemo(() => topicsKey(skillId, step.stepNumber), [skillId, step.stepNumber]);

  /* 笔记挂在哪一块：有图谱就按节点 id，老计划退回步骤号。跟后端 unit_key 同一个约定 */
  const unitKey = useMemo(
    () => (step.nodeIds?.length ? step.nodeIds.join(",") : `step${step.stepNumber}`),
    [step.nodeIds, step.stepNumber]
  );

  /* ── Save timer ── */
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 笔记存服务端（不再进 localStorage）：留在浏览器里，服务端拿不到原文，复盘（⑤）就无从谈起
  const saveCornell = useCallback((data: CornellData) => {
    saveNote(skillId, unitKey, JSON.stringify(data)).catch(() => { /* 自动保存失败不打断，下次改动再存 */ });
  }, [skillId, unitKey, saveNote]);

  /* ── Mount / unmount animation ── */
  useEffect(() => {
    if (open) {
      setRendered(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => setRendered(false), PANEL_DURATION + 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  /* ── Load data when panel becomes visible ── */
  useEffect(() => {
    if (!visible) return;

    // 1. Load step-level explanation from cache (剔除历史降级文案，触发重新生成)
    try {
      const cached = cacheGet(eKey);
      if (cached && !isUnavailable(cached)) { setExplanation(cached); setExplanationLoading(false); }
      else { setExplanationLoading(true); }
    } catch { setExplanationLoading(true); }

    // 2. Load Cornell from server
    let alive = true;
    (async () => {
      const mine = findCornell(await fetchNotes(skillId), unitKey);
      if (!alive) return; // 切到别的单元了，别把上一条笔记按到这个单元头上（会被自动保存写错位置）
      if (mine) { setCornell(mine); return; }
      // 服务端还没有 —— 认领浏览器里的老笔记（搬服务端之前写的），推上去，别让用户白写
      const legacy = loadCornellFromStorage(skillId, step.stepNumber);
      setCornell(legacy ?? { cues: [], notes: "", summary: "" });
      if (legacy) saveNote(skillId, unitKey, JSON.stringify(legacy)).catch(() => {});
    })();

    // 3. Load topic keywords from cache, then topic answers (剔除历史降级文案，点击时重新请求)
    let kw: string[] = [];
    try { kw = JSON.parse(cacheGet(tkKey) || "[]"); } catch { /* ignore */ }
    setTopicKeywords(kw);
    try {
      kw.forEach((t) => {
        const v = cacheGet(topicKey(skillId, step.stepNumber, t));
        if (v && !isUnavailable(v)) setTopicAnswers((prev) => ({ ...prev, [t]: v }));
      });
    } catch { /* ignore */ }
    // 面板不卸载后切换 step 会残留上一个 step 的 activeTopic，重开/切步时归零
    setActiveTopic((prev) => (prev && !kw.includes(prev) ? null : prev));

    // 5. Fetch step-level explanation if not cached (降级文案视为未缓存)
    const cachedE = cacheGet(eKey);
    if (!cachedE || isUnavailable(cachedE)) {
      fetchExplanation();
    }

    // 5. Load prompts from cache, fetch if not cached
    try {
      const cachedPrompts = cacheGet(pKey);
      if (cachedPrompts) {
        setPrompts(JSON.parse(cachedPrompts));
        setPromptsLoading(false);
      } else {
        setPromptsLoading(true);
      }
    } catch { setPromptsLoading(true); }
    if (!cacheGet(pKey)) {
      api.post<{ questions: string[] }>("/api/ai/cornell-prompts", {
        skill_name: skillName,
        step_title: step.title,
        topics: kw.length ? kw : (step.topics || []),
        required_level: requiredLevel,
      }).then((data) => {
        const qs = data.questions || [];
        setPrompts(qs);
        setPromptsLoading(false);
        try { cacheSet(pKey, JSON.stringify(qs)); } catch { /* ignore */ }
      }).catch(() => setPromptsLoading(false));
    } else {
      setPromptsLoading(false);
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, skillId, unitKey, step.stepNumber, tkKey]);

  /* ── Auto-save cornell ── */
  useEffect(() => {
    if (!visible) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveCornell(cornell), 400);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [cornell, visible, saveCornell]);

  /* ── Save on close ── */
  useEffect(() => {
    if (!visible && (cornell.cues.some(c => c?.trim()) || cornell.notes.trim() || cornell.summary.trim())) {
      saveCornell(cornell);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  /* ── Ask topic ── */
  const askTopic = (topic: string, nodeId?: string) => {
    setActiveTopic(topic);
    try { localStorage.setItem(aKey, topic); } catch { /* ignore */ }
    // 已有正常答案或正在加载则跳过；错误占位允许重试
    if (topicAnswers[topic] && topicAnswers[topic] !== TOPIC_UNAVAILABLE) return;
    if (topicLoading[topic]) return;

    setTopicLoading((prev) => ({ ...prev, [topic]: true }));
    api.post<{ explanation: string; topic_keywords?: string[] }>("/api/ai/explain-topic", {
      skill_name: skillName,
      step_title: step.title,
      step_description: step.description,
      topic,
      step_type: stepType || "concept",
      required_level: requiredLevel,
      skill_id: skillId,
      // 点图谱节点进来时，把该节点的子树交给后端当内容边界（结论 10）
      node_ids: nodeId ? [nodeId] : [],
    }).then((data) => {
      const content = data.explanation || "";
      if (isUnavailable(content)) {
        setTopicAnswers((prev) => ({ ...prev, [topic]: TOPIC_UNAVAILABLE }));
        setTopicLoading((prev) => ({ ...prev, [topic]: false }));
        return;
      }
      setTopicAnswers((prev) => ({ ...prev, [topic]: content }));
      setTopicLoading((prev) => ({ ...prev, [topic]: false }));
      try { cacheSet(topicKey(skillId, step.stepNumber, topic), content); } catch { /* ignore */ }
    }).catch(() => {
      setTopicAnswers((prev) => ({ ...prev, [topic]: TOPIC_UNAVAILABLE }));
      setTopicLoading((prev) => ({ ...prev, [topic]: false }));
    });
  };

  /* ── Cue update ── */
  const setCueAnswer = useCallback((idx: number, val: string) => {
    setCornell((prev) => {
      const cues = [...prev.cues];
      cues[idx] = val;
      return { ...prev, cues };
    });
  }, []);

  /* ── Retry fetch ── */
  // 防重入：生成进行中收起面板再展开时，effect 重跑会再发一次请求 → 双生成。
  // 面板不卸载后 ref 跨 step 保留，须按 step 区分——step1 生成中切到 step2 仍允许发新请求。
  const explanationFetching = useRef<{ stepKey: string } | null>(null);
  const fetchExplanation = useCallback(() => {
    const stepKey = `${skillId}/${step.stepNumber}`;
    if (explanationFetching.current?.stepKey === stepKey) return;
    explanationFetching.current = { stepKey };
    setExplanationLoading(true);
    setExplanationError("");
    api.post<{ explanation: string; topic_keywords?: string[] }>("/api/ai/explain-topic", {
      skill_name: skillName,
      step_title: step.title,
      step_description: step.description,
      topic: "",
      step_type: stepType || "concept",
      required_level: requiredLevel,
      skill_id: skillId,
      node_ids: step.nodeIds ?? [],
    }).then((data) => {
      const content = data.explanation || "";
      if (isUnavailable(content)) {
        setExplanationError("AI 服务暂不可用，请稍后再试");
        setExplanationLoading(false);
        return;
      }
      setExplanation(content);
      setExplanationLoading(false);
      try {
        cacheSet(eKey, content);
        const kws = Array.isArray(data.topic_keywords) ? data.topic_keywords : [];
        setTopicKeywords(kws);
        cacheSet(tkKey, JSON.stringify(kws));
      } catch { /* ignore */ }
    }).catch(() => {
      setExplanationError("AI 服务暂不可用，请稍后再试");
      setExplanationLoading(false);
    }).finally(() => {
      explanationFetching.current = null;
    });
  }, [skillName, step.title, step.description, step.nodeIds, stepType, requiredLevel, eKey, tkKey]);

  /* 重新生成单元概述：清缓存 + 重新请求（缓存命中会永远显示旧内容，必须显式清除） */
  const handleRegenerateExplanation = () => {
    try { localStorage.removeItem(eKey); localStorage.removeItem(tkKey); } catch { /* ignore */ }
    setExplanation("");
    setExplanationError("");
    setTopicKeywords([]);
    fetchExplanation();
  };

  /* ── Links ── */
  const links = useMemo(() => extractLinks(explanation), [explanation]);
  const allTopicAnswers = Object.values(topicAnswers).join("\n\n");
  // 知识点添加为资源时附带的引用链接（取讲解中的第一个），无则仅记录标题
  const activeTopicLink = useMemo(
    () => (activeTopic ? extractLinks(topicAnswers[activeTopic] || "")[0]?.url : undefined),
    [activeTopic, topicAnswers]
  );

  const handleAddLink = (title: string, url: string) => {
    if (onAddResource) onAddResource(title, url);
    setAddedLinks((prev) => new Set(prev).add(url));
  };

  /* ── Drag handlers ── */
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = panelWidth;
  }, [panelWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const diff = dragStartX.current - e.clientX;
      const w = Math.max(360, Math.min(window.innerWidth * 0.7, dragStartWidth.current + diff));
      setPanelWidth(w);
    };
    const handleMouseUp = () => { isDragging.current = false; };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  /* ── Render ── */
  if (!rendered) return null;

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        className={`fixed inset-0 bg-ink/5 backdrop-blur-[1px] transition-opacity duration-500 z-30 pointer-events-auto ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />

      {/* ── Drag handle ── */}
      <div
        className="fixed top-14 w-[5px] h-[calc(100vh-3.5rem)] z-50 group cursor-col-resize pointer-events-auto"
        style={{ left: `calc(100% - ${panelWidth}px - 2px)` } as React.CSSProperties}
        onMouseDown={handleDragStart}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <div className="absolute left-1/2 -translate-x-1/2 top-0 w-[3px] h-full bg-transparent group-hover:bg-blue/30 group-active:bg-blue/40 transition-all duration-200" />
        <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-1.5 h-8 rounded-full bg-blue/10 group-hover:bg-blue/30 transition-all duration-300" />
      </div>

      {/* ── Panel ── */}
      <div
        className={`fixed right-0 top-14 h-[calc(100vh-3.5rem)] bg-canvas border-l border-hairline shadow-[-8px_0_40px_rgba(0,0,0,0.08)] flex flex-col pointer-events-auto z-40`}
        style={{
          width: panelWidth,
          transform: visible ? "translateX(0)" : "translateX(100%)",
          opacity: visible ? 1 : 0,
          transition: `transform ${PANEL_DURATION}ms ${PANEL_EASING}, opacity ${PANEL_DURATION}ms ${PANEL_EASING}`,
        }}
      >
        <div
          className="flex-1 flex flex-col min-h-0"
          style={{
            transition: `transform ${PANEL_DURATION - 100}ms ${PANEL_EASING} ${visible ? "80ms" : "0ms"}, opacity ${PANEL_DURATION - 100}ms ${PANEL_EASING} ${visible ? "80ms" : "0ms"}`,
            transform: visible ? "scale(1)" : "scale(0.97)",
            opacity: visible ? 1 : 0,
          }}
        >
          {/* ─── Header ─── */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-hairline shrink-0">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-ink truncate">{step.title}</h3>
              <p className="text-xs text-muted mt-0.5 truncate flex items-center gap-2">
                <span>{skillName}</span>
                <span className="text-xs bg-blue-light/50 text-blue rounded-full px-2 py-0.5">{requiredLevel}</span>
                {step.estimated_hours > 0 && <span className="text-muted">预估 {step.estimated_hours}h</span>}
              </p>
            </div>
            <button
              onClick={() => setBrushMode((v) => !v)}
              className={`ml-2 w-7 h-7 flex items-center justify-center rounded-full transition-colors shrink-0 ${brushMode ? "bg-blue text-white" : "text-muted hover:text-ink hover:bg-surface"}`}
              title="刷子模式：拖动文字高亮，再拖动高亮文字取消"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.37 2.63 14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 1 0-3-3Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-7" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 17.5 4.5 15" />
              </svg>
            </button>
            <button
              onClick={() => setShowFloatingNote((v) => !v)}
              className={`ml-1 w-7 h-7 flex items-center justify-center rounded-full transition-colors shrink-0 ${showFloatingNote ? "bg-blue-light/50 text-blue" : "text-muted hover:text-ink hover:bg-surface"}`}
              title="随手记"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="ml-1 w-7 h-7 flex items-center justify-center rounded-full text-muted hover:text-ink hover:bg-surface transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* ─── Scrollable ─── */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Step description */}
            {step.description && (
              <p className="text-sm text-slate leading-relaxed border-l-2 border-blue/20 pl-3 italic">
                {step.description}
              </p>
            )}

            {/* ══════ AI 学习内容 ══════ */}
            <section>
              <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">学习内容</h4>

              {explanationLoading && (
                <div className="bg-surface/50 rounded-lg border border-hairline p-5 space-y-2.5">
                  <div className="animate-pulse space-y-2.5">
                    <div className="h-3 bg-muted/20 rounded w-3/4" />
                    <div className="h-3 bg-muted/20 rounded w-1/2" />
                    <div className="h-3 bg-muted/20 rounded w-5/6" />
                  </div>
                  <p className="text-xs text-muted flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 bg-blue rounded-full animate-pulse" />
                    AI 生成中，可收起面板后台等待，完成后自动显示
                  </p>
                </div>
              )}

              {explanationError && (
                <AIErrorBox message={explanationError} onRetry={fetchExplanation} />
              )}

              {!explanationLoading && explanation && (
                <>
                  <div className="flex justify-end mb-1">
                    <button
                      onClick={handleRegenerateExplanation}
                      className="text-xs bg-transparent text-charcoal border border-hairline rounded-full px-3 py-1 hover:bg-surface transition-colors"
                    >
                      ↻ 重新生成
                    </button>
                  </div>
                  <div className="bg-canvas border border-hairline rounded-lg px-5 py-4 text-sm leading-relaxed">
                    <HighlightableMarkdown
                      contentKey={contentHighlightKey(skillId, step.stepNumber)}
                      markdown={explanation}
                      brushMode={brushMode}
                    />
                  </div>

                  {/* Extracted links */}
                  {links.length > 0 && (
                    <div className="mt-3 bg-canvas border border-hairline rounded-lg px-4 py-3">
                      <p className="text-xs font-medium text-muted mb-2">📎 推荐资源</p>
                      <div className="space-y-1.5">
                        {links.map((link, i) => {
                          const isAdded = addedLinks.has(link.url);
                          return (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <a
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-blue underline hover:text-blue/80 truncate min-w-0 flex-1 cursor-pointer"
                              >
                                {link.text}
                              </a>
                              <button
                                onClick={() => handleAddLink(link.text, link.url)}
                                className={`shrink-0 font-medium ${isAdded ? "text-green" : "text-blue hover:text-blue/80"}`}
                              >
                                {isAdded ? "✓ 已添加" : "+ 添加"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {!explanationLoading && !explanationError && !explanation && (
                <div className="bg-surface/50 rounded-lg border border-hairline px-4 py-6 text-sm text-muted text-center">AI 正在思考...</div>
              )}
            </section>

            {/* ══════ Topic shortcuts（有图谱用块的下一层，无图谱用概述自产的关键词） ══════ */}
            {topicEntries.length > 0 && (
              <section>
                <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">想深入了解哪个知识点？</h4>
                <div className="flex flex-wrap gap-2">
                  {topicEntries.map(({ title: t, nodeId }, i) => {
                    const cached = !!topicAnswers[t] && topicAnswers[t] !== TOPIC_UNAVAILABLE;
                    const loading = !!topicLoading[t];
                    return (
                      <button
                        key={i}
                        onClick={() => askTopic(t, nodeId)}
                        className={`text-xs rounded-full px-3 py-1.5 font-medium transition-all border flex items-center gap-1 ${
                          activeTopic === t
                            ? "bg-blue text-white border-blue"
                            : cached
                            ? "bg-green-light/30 text-green border-green/20"
                            : "bg-canvas text-slate border-hairline hover:border-blue hover:text-blue"
                        }`}
                      >
                        {loading && (
                          <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        )}
                        {t}{cached && !loading && <span className="opacity-60">✓</span>}
                      </button>
                    );
                  })}
                </div>

                {activeTopic && (
                  <div className="mt-3 bg-canvas border border-blue/20 rounded-lg px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-blue">{activeTopic}</span>
                      <button
                        onClick={() => { if (onAddResource) onAddResource(activeTopic, activeTopicLink); }}
                        title={activeTopicLink ? "添加为资源（附讲解中的引用链接）" : "该讲解暂无引用链接，仅记录标题"}
                        className="text-xs text-blue hover:text-blue/80 font-medium"
                      >
                        + 添加为资源
                      </button>
                    </div>
                    {topicLoading[activeTopic] && !topicAnswers[activeTopic] ? (
                      <div className="animate-pulse space-y-1.5">
                        <div className="h-3 bg-muted/20 rounded w-5/6" />
                        <div className="h-3 bg-muted/20 rounded w-2/3" />
                      </div>
                    ) : topicAnswers[activeTopic] === TOPIC_UNAVAILABLE ? (
                      <div className="flex flex-col items-center gap-2 py-3">
                        <p className="text-sm text-red">{topicAnswers[activeTopic]}</p>
                        <button
                          onClick={() => {
                            setTopicAnswers((prev) => ({ ...prev, [activeTopic]: "" }));
                            askTopic(activeTopic);
                          }}
                          className="text-xs bg-red/10 text-red rounded-full px-3 py-1 hover:bg-red/20 transition-colors font-medium"
                        >
                          重新生成
                        </button>
                      </div>
                    ) : topicAnswers[activeTopic] ? (
                      <>
                        <div className="flex justify-end mb-1">
                          <button
                            onClick={() => {
                              const tk = topicKey(skillId, step.stepNumber, activeTopic);
                              try { localStorage.removeItem(tk); } catch { /* ignore */ }
                              setTopicAnswers((prev) => ({ ...prev, [activeTopic]: "" }));
                              askTopic(activeTopic);
                            }}
                            className="text-xs bg-transparent text-charcoal border border-hairline rounded-full px-3 py-1 hover:bg-surface transition-colors"
                          >
                            ↻ 重新生成
                          </button>
                        </div>
                        <div className="text-sm text-charcoal leading-relaxed">
                          <HighlightableMarkdown
                            contentKey={contentHighlightKey(skillId, step.stepNumber, activeTopic)}
                            markdown={topicAnswers[activeTopic]}
                                  brushMode={brushMode}
                          />
                        </div>
                        {(() => {
                          const tl = extractLinks(topicAnswers[activeTopic]);
                          if (tl.length === 0) return null;
                          return (
                            <div className="mt-2 pt-2 border-t border-hairline space-y-1">
                              {tl.filter((l) => !addedLinks.has(l.url)).map((link, li) => (
                                <div key={li} className="flex items-center gap-2 text-xs">
                                  <a
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-blue underline hover:text-blue/80 truncate min-w-0 flex-1 cursor-pointer"
                                  >
                                    {link.text}
                                  </a>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAddLink(link.text, link.url);
                                    }}
                                    className="shrink-0 text-blue hover:text-blue/80 font-medium"
                                  >
                                    + 添加资源
                                  </button>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </>
                    ) : null}
                  </div>
                )}
              </section>
            )}

            {/* ══════ Cornell 笔记 ══════ */}
            <section>
              <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">学习摘录</h4>
              {promptsLoading ? (
                <div className="space-y-3 animate-pulse">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="space-y-1">
                      <div className="h-3 bg-muted/20 rounded w-5/6" />
                      <div className="h-6 bg-muted/10 rounded w-full" />
                    </div>
                  ))}
                </div>
              ) : prompts.length === 0 ? (
                <p className="text-xs text-muted italic">正在生成引导问题...</p>
              ) : (
                <div className="flex min-h-[220px]">
                  <div className="w-[35%] border-r border-hairline p-4 flex flex-col gap-3">
                    {prompts.map((q, idx) => (
                      <div key={idx} className="space-y-1">
                        <label className="text-xs text-slate font-medium leading-snug block">{q}</label>
                        <div className="border-b border-hairline focus-within:border-blue transition-colors">
                          <textarea
                            value={cornell.cues[idx] || ""}
                            onChange={(e) => setCueAnswer(idx, e.target.value)}
                            ref={(el) => {
                              if (el && el.value) {
                                el.style.height = "auto";
                                el.style.height = el.scrollHeight + "px";
                              }
                            }}
                            placeholder="写下你的理解..."
                            rows={1}
                            className="w-full py-1.5 text-sm text-charcoal bg-transparent outline-none placeholder:text-muted/50 resize-none overflow-hidden"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 p-4 flex flex-col min-h-0">
                    <label className="text-xs text-slate font-medium mb-2 block shrink-0">笔记栏</label>
                    <textarea
                      value={cornell.notes}
                      onChange={(e) => setCornell((prev) => ({ ...prev, notes: e.target.value }))}
                      ref={(el) => {
                        if (el && el.value) {
                          el.style.height = "auto";
                          el.style.height = el.scrollHeight + "px";
                        }
                      }}
                      placeholder="在此记录详细笔记、摘抄要点、写下你的理解和关联..."
                      className="w-full min-h-[180px] text-sm text-charcoal leading-relaxed bg-transparent border-none outline-none placeholder:text-muted/40 resize-none overflow-hidden"
                    />
                  </div>
                </div>
              )}

              <div className="border-t border-hairline px-4 py-3">
                <label className="text-xs text-slate font-medium mb-1.5 block">总结输出栏</label>
                <textarea
                  value={cornell.summary}
                  onChange={(e) => setCornell((prev) => ({ ...prev, summary: e.target.value }))}
                  placeholder="一句话总结本节内容、行动项、待深入的知识点..."
                  rows={2}
                  className="w-full resize-y text-sm text-charcoal leading-relaxed bg-transparent border-none outline-none placeholder:text-muted/40 max-h-[200px] overflow-y-auto"
                />
              </div>

              <p className="text-xs text-muted/60 mt-2">
                ✎ 笔记已自动保存
                {cornell.cues.some((c) => c?.trim()) && ` · 线索 ${cornell.cues.filter((c) => c?.trim()).length} 条`}
                {cornell.notes.trim() && ` · 笔记 ${cornell.notes.length} 字`}
                {cornell.summary.trim() && ` · 总结 ${cornell.summary.length} 字`}
              </p>
            </section>
          </div>
        </div>
      </div>

      {showFloatingNote && (
        <FloatingNote storageKey={stickyKey} onClose={() => setShowFloatingNote(false)} />
      )}
    </>
  );
}
