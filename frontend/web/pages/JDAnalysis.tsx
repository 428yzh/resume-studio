import { useEffect, useState, useRef, useCallback } from "react";
import { useSkillStore } from "@core/stores/skillStore";
import { SearchIcon } from "@web/components/EmptyIcons";
import { Trash, Check, X, PencilSimple } from "@phosphor-icons/react";
import type { JDAnalysis } from "@core/models/jd";
import AIErrorBox from "@web/components/AIErrorBox";
import { isUnavailable, hasUnavailableField } from "@core/services/aiDegrade";
import { useEntrance, entrance } from "@web/hooks/useEntrance";

interface AnalysisResult {
  role_summary?: string;
  key_requirements?: string[];
  experience_years?: string;
  education?: string;
}

interface LearningGuide {
  learning_path: { step: number; title: string; description: string; estimated_hours: number }[];
  resources?: { title: string; url: string; type: string }[];
  interview_questions: { question: string; difficulty: string; answer_hint: string }[];
}

export default function JDAnalysis() {
  const { currentAnalysis, analyses, loading, error, analyzeJD, fetchAnalyses, fetchAnalysis, importSkillFromJD } = useSkillStore();
  const [importedSkills, setImportedSkills] = useState<Set<string>>(new Set());

  const [jdText, setJdText] = useState("");
  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [learningGuides, setLearningGuides] = useState<Record<string, LearningGuide>>({});
  const [guideErrors, setGuideErrors] = useState<Record<string, string>>({});
  const [loadingGuide, setLoadingGuide] = useState<string | null>(null);
  const [activeTech, setActiveTech] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameText, setRenameText] = useState("");

  // Image upload
  const [inputMode, setInputMode] = useState<"text" | "image">("text");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageLoading, setImageLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { mounted } = useEntrance();

  useEffect(() => {
    fetchAnalyses();

    // Parse URL params for BOSS extension import
    const params = new URLSearchParams(window.location.search);
    const jdFromUrl = params.get("jd_text");
    const companyFromUrl = params.get("company");
    const positionFromUrl = params.get("position");
    const analysisIdFromUrl = params.get("analysis_id");

    if (analysisIdFromUrl) {
      fetchAnalysis(Number(analysisIdFromUrl));
      setShowInput(false);
    } else if (jdFromUrl) {
      setJdText(decodeURIComponent(jdFromUrl));
      setCompany(decodeURIComponent(companyFromUrl || ""));
      setPosition(decodeURIComponent(positionFromUrl || ""));
      setShowInput(true);
      // Auto-trigger analysis
      setTimeout(() => {
        const btn = document.querySelector("[data-auto-analyze]") as HTMLButtonElement;
        btn?.click();
      }, 100);
    }
  }, []);

  // Auto-select first analysis when list loads
  useEffect(() => {
    if (analyses.length > 0 && !currentAnalysis) {
      fetchAnalysis(analyses[0].id);
    }
  }, [analyses.length]);

  const handleAnalyze = async () => {
    if (!jdText.trim()) return;
    await analyzeJD(jdText, company, position);
  };

  const addImages = (files: FileList | File[]) => {
    const newFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (newFiles.length === 0) return;
    setSelectedImages((prev) => [...prev, ...newFiles]);
    newFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setImagePreviews((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addImages(e.target.files);
      e.target.value = "";
    }
  };

  const handleAnalyzeImage = async () => {
    if (selectedImages.length === 0) return;
    setImageLoading(true);
    try {
      const formData = new FormData();
      selectedImages.forEach((f) => formData.append("file", f));
      if (company) formData.append("company", company);
      if (position) formData.append("position", position);

      const resp = await fetch("/api/jd/analyze-image", {
        method: "POST",
        body: formData,
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || "分析失败");
      }
      const result = await resp.json();
      useSkillStore.setState({ currentAnalysis: result });
      await fetchAnalyses();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setImageLoading(false);
    }
  };

  // Paste images from clipboard
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      addImages(imageFiles);
    }
  }, []);

  useEffect(() => {
    if (inputMode === "image") {
      document.addEventListener("paste", handlePaste);
      return () => document.removeEventListener("paste", handlePaste);
    }
  }, [inputMode, handlePaste]);

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

  const analysisResult: AnalysisResult | null = currentAnalysis
    ? (currentAnalysis.analysis_result as AnalysisResult)
    : null;

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "前端": return "bg-blue-light text-blue";
      case "后端": return "bg-green/10 text-green";
      case "数据库": return "bg-amber/10 text-amber";
      default: return "bg-surface text-slate";
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case "精通": return "text-green";
      case "熟悉": return "text-blue";
      default: return "text-muted";
    }
  };

  const getDifficultyLabel = (difficulty: string) => {
    switch (difficulty) {
      case "easy": return "简单";
      case "hard": return "困难";
      default: return "中等";
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "easy": return "bg-green/10 text-green";
      case "hard": return "bg-red/10 text-red";
      default: return "bg-amber/10 text-amber";
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 animate-fade-in">
        <div>
          <h2 className="text-2xl font-bold text-ink">JD 分析</h2>
          <p className="text-sm text-slate mt-1">粘贴职位描述，AI 自动分析技术栈并生成学习指引</p>
        </div>
        <button
          onClick={() => setShowInput(!showInput)}
          className="bg-blue text-white rounded-full px-5 py-2 font-semibold text-sm hover:bg-blue/90 transition-all active:scale-95"
        >
          {showInput ? "收起输入" : "+ 新建分析"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Input column */}
        <div className="lg:col-span-2 space-y-4">
          {/* History list — always visible */}
          <div className="bg-canvas rounded-xl border border-hairline p-5 transition-all duration-200 hover:border-blue/20" style={entrance(mounted, 0.05)}>
            <h3 className="font-semibold text-sm text-ink mb-3">分析历史</h3>
            {analyses.length === 0 ? (
              <p className="text-sm text-muted text-center py-6">暂无分析记录</p>
            ) : (
              <div className="space-y-2">
                {analyses.map((a, ai) => (
                  <div key={a.id} className="group flex items-center gap-1" style={{ opacity: 0, animation: `fade-in 0.3s ease-out ${0.1 + 0.04 * ai}s forwards` }}>
                    {renamingId === a.id ? (
                      <div className="flex-1 flex items-center gap-1 px-1">
                        <input
                          value={renameText}
                          onChange={(e) => setRenameText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              useSkillStore.getState().updateAnalysis(a.id, { title: renameText });
                              setRenamingId(null);
                            }
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          className="flex-1 border border-hairline rounded-md px-2 py-1.5 text-sm outline-none focus:border-blue/50 transition-colors"
                          autoFocus
                          placeholder={a.title || a.position || "名称"}
                        />
                        <button
                          onClick={() => {
                            useSkillStore.getState().updateAnalysis(a.id, { title: renameText });
                            setRenamingId(null);
                          }}
                          className="w-7 h-7 flex items-center justify-center rounded-md text-green hover:bg-green/5 transition-colors"
                          title="保存"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          onClick={() => setRenamingId(null)}
                          className="w-7 h-7 flex items-center justify-center rounded-md text-slate hover:text-ink hover:bg-surface transition-colors"
                          title="取消"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => fetchAnalysis(a.id)}
                          className="flex-1 text-left px-3 py-2.5 rounded-lg hover:bg-surface transition-colors text-sm"
                        >
                          <div className="font-medium text-charcoal">{a.company || a.title || a.position || `分析 #${a.id}`}</div>
                          <div className="text-xs text-muted">{new Date(a.created_at).toLocaleDateString("zh-CN")}</div>
                        </button>
                        <button
                          onClick={() => {
                            setRenamingId(a.id);
                            setRenameText(a.company || a.title || a.position || `分析 #${a.id}`);
                          }}
                          className="w-7 h-7 flex items-center justify-center rounded-md text-muted opacity-0 group-hover:opacity-100 hover:text-blue hover:bg-blue/5 transition-all"
                          title="重命名"
                        >
                          <PencilSimple size={13} />
                        </button>
                        {confirmDeleteId === a.id ? (
                          <div className="flex items-center gap-0.5 pr-1">
                            <button
                              onClick={async () => {
                                try {
                                  await useSkillStore.getState().deleteAnalysis(a.id);
                                } catch { /* ignore */ }
                                setConfirmDeleteId(null);
                              }}
                              className="w-7 h-7 flex items-center justify-center rounded-md text-red hover:bg-red/5 transition-colors"
                              title="确认删除"
                            >
                              <Check size={13} />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="w-7 h-7 flex items-center justify-center rounded-md text-slate hover:text-ink hover:bg-surface transition-colors"
                              title="取消"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(a.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-md text-muted opacity-0 group-hover:opacity-100 hover:text-red hover:bg-red/5 transition-all"
                            title="删除"
                          >
                            <Trash size={13} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Input form — collapsible */}
          {showInput && (
            <div className="bg-canvas rounded-xl border border-hairline p-5 transition-all duration-200 hover:border-blue/20" style={entrance(mounted, 0.1)}>
              <h3 className="font-semibold text-sm text-ink mb-4">输入职位描述</h3>

              {/* Mode toggle */}
              <div className="flex items-center gap-2 mb-4 bg-surface rounded-full p-0.5 w-fit">
                <button
                  onClick={() => setInputMode("text")}
                  className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                    inputMode === "text" ? "bg-canvas text-ink shadow-sm" : "text-slate hover:text-ink"
                  }`}
                >
                  文本输入
                </button>
                <button
                  onClick={() => setInputMode("image")}
                  className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                    inputMode === "image" ? "bg-canvas text-ink shadow-sm" : "text-slate hover:text-ink"
                  }`}
                >
                  图片上传
                </button>
              </div>

              {inputMode === "text" ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="公司名称（选填）"
                      className="border border-hairline rounded-lg px-3 py-2 text-sm outline-none focus:border-blue transition-colors"
                    />
                    <input
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                      placeholder="职位名称（选填）"
                      className="border border-hairline rounded-lg px-3 py-2 text-sm outline-none focus:border-blue transition-colors"
                    />
                  </div>
                  <textarea
                    value={jdText}
                    onChange={(e) => setJdText(e.target.value)}
                    placeholder="在此粘贴职位描述（JD）..."
                    className="w-full border border-hairline rounded-lg px-3 py-2 text-sm resize-y min-h-[300px] outline-none focus:border-blue transition-colors"
                  />
                  <button
                    data-auto-analyze
                    onClick={handleAnalyze}
                    disabled={!jdText.trim() || loading}
                    className="w-full bg-blue text-white rounded-full px-5 py-2 font-semibold text-sm hover:bg-blue/90 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {loading ? "分析中..." : "开始分析"}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="公司名称（选填）"
                      className="border border-hairline rounded-lg px-3 py-2 text-sm outline-none focus:border-blue transition-colors"
                    />
                    <input
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                      placeholder="职位名称（选填）"
                      className="border border-hairline rounded-lg px-3 py-2 text-sm outline-none focus:border-blue transition-colors"
                    />
                  </div>

                  {/* Upload area */}
                  <div className="border-2 border-dashed border-hairline rounded-xl p-5 transition-colors hover:border-blue/30 hover:bg-blue/[0.02]">
                    {imagePreviews.length > 0 ? (
                      <div className="space-y-3">
                        {/* Thumbnail gallery */}
                        <div className="flex flex-wrap gap-3">
                          {imagePreviews.map((src, i) => (
                            <div key={i} className="relative group">
                              <img
                                src={src}
                                alt={`JD 截图 ${i + 1}`}
                                className="w-28 h-28 object-cover rounded-lg border border-hairline"
                              />
                              <button
                                onClick={() => removeImage(i)}
                                className="absolute -top-2 -right-2 w-5 h-5 bg-red text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red/80"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                          {/* Add more button */}
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-28 h-28 border-2 border-dashed border-hairline rounded-lg flex flex-col items-center justify-center gap-1 text-muted hover:text-blue hover:border-blue/40 transition-colors"
                          >
                            <span className="text-lg font-light">+</span>
                            <span className="text-xs">添加</span>
                          </button>
                        </div>
                        <p className="text-xs text-muted">
                          已选择 {selectedImages.length} 张图片 · 可继续 Ctrl+V 粘贴
                        </p>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="cursor-pointer text-center py-8 space-y-3"
                      >
                        <div className="w-12 h-12 bg-surface rounded-full flex items-center justify-center mx-auto">
                          <svg className="w-6 h-6 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <p className="text-sm text-slate font-medium">点击上传 JD 截图</p>
                        <p className="text-xs text-muted">支持 PNG、JPG，最大 10MB，支持 Ctrl+V 粘贴</p>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                  </div>

                  <button
                    onClick={handleAnalyzeImage}
                    disabled={selectedImages.length === 0 || imageLoading}
                    className="w-full bg-blue text-white rounded-full px-5 py-2 font-semibold text-sm hover:bg-blue/90 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {imageLoading ? "OCR 识别中..." : "开始分析"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Results column */}
        <div className="lg:col-span-3 space-y-4">
          {!currentAnalysis && !loading && !error && (
            <div className="bg-canvas rounded-xl border border-hairline p-12 text-center transition-all duration-300" style={entrance(mounted, 0.15)}>
              <SearchIcon className="w-12 h-12 mx-auto mb-4 transition-transform duration-300 hover:scale-110" />
              <h3 className="text-lg font-semibold text-ink mb-2">等待分析</h3>
              <p className="text-sm text-slate">在左侧粘贴职位描述，点击"开始分析"</p>
            </div>
          )}

          {!currentAnalysis && !loading && error && (
            <div className="bg-red/5 border border-red/20 rounded-xl p-5 text-center">
              <h3 className="text-sm font-semibold text-red mb-1">分析失败</h3>
              <p className="text-sm text-slate">{error}</p>
              <button
                onClick={() => setShowInput(true)}
                className="mt-3 text-sm text-blue hover:underline"
              >
                修改后重新分析
              </button>
            </div>
          )}

          {loading && !currentAnalysis && (
            <div className="space-y-4 animate-pulse">
              <div className="bg-canvas rounded-xl border border-hairline p-5">
                <div className="h-4 bg-surface rounded w-1/4 mb-3" />
                <div className="h-3 bg-surface rounded w-3/4 mb-2" />
                <div className="h-3 bg-surface rounded w-1/2" />
              </div>
              <div className="bg-canvas rounded-xl border border-hairline p-5">
                <div className="h-4 bg-surface rounded w-1/5 mb-4" />
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 bg-surface rounded-lg" />
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted text-center">AI 正在分析职位描述，请稍候...</p>
            </div>
          )}

          {currentAnalysis && (
            <>
              {hasUnavailableField(currentAnalysis) && (
                <AIErrorBox
                  message="AI 服务暂不可用，请稍后再试"
                  onRetry={jdText.trim() ? handleAnalyze : undefined}
                  retryLabel="重新分析"
                />
              )}
              {/* Analysis summary */}
              <div className="bg-canvas rounded-xl border border-hairline p-5 transition-all duration-200 hover:border-blue/20" style={entrance(mounted, 0.1)}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm text-ink">职位概述</h3>
                  <div className="flex items-center gap-2">
                    {currentAnalysis.job_url && (
                      <span className="text-xs bg-green/10 text-green rounded-full px-2.5 py-0.5 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        来自 BOSS直聘
                      </span>
                    )}
                    {analysisResult?.experience_years && (
                      <span className="text-xs bg-surface text-muted rounded-full px-2.5 py-0.5">
                        {analysisResult.experience_years}
                      </span>
                    )}
                    {analysisResult?.education && (
                      <span className="text-xs bg-surface text-muted rounded-full px-2.5 py-0.5">
                        {analysisResult.education}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-slate leading-relaxed">
                  {analysisResult?.role_summary && !isUnavailable(analysisResult.role_summary)
                    ? analysisResult.role_summary
                    : "AI 未能生成职位概述，请重新分析。"}
                </p>
              </div>

              {/* Tech stack */}
              <div className="bg-canvas rounded-xl border border-hairline p-5 transition-all duration-200 hover:border-blue/20" style={entrance(mounted, 0.15)}>
                <h3 className="font-semibold text-sm text-ink mb-4">技术栈分析</h3>
                {currentAnalysis.tech_stack.length > 0 ? (
                  <div className="space-y-1">
                    {currentAnalysis.tech_stack.map((tech, i) => (
                      <div key={i} style={{ opacity: 0, animation: `fade-in 0.3s ease-out ${0.2 + 0.05 * i}s forwards` }}>
                        <div className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-surface/80 hover:translate-x-0.5 transition-all duration-200">
                          <button
                            onClick={() => handleLoadGuide(tech.name, tech.category, tech.required_level)}
                            className="flex items-center gap-2 min-w-0 text-left flex-1"
                          >
                            <span className="font-medium text-sm text-charcoal">{tech.name}</span>
                            <span className={`text-xs rounded-full px-2 py-0.5 ${getCategoryColor(tech.category)}`}>
                              {tech.category}
                            </span>
                            <span className={`text-xs ${getLevelColor(tech.required_level)}`}>
                              {tech.required_level}
                            </span>
                          </button>
                          <div className="flex items-center gap-2 shrink-0">
                            {importedSkills.has(tech.name) ? (
                              <span className="text-xs text-green font-medium">已导入</span>
                            ) : (
                              <button
                                onClick={async () => {
                                  const skill = await importSkillFromJD(tech.name, tech.category, `JD分析: ${currentAnalysis.company || currentAnalysis.title || currentAnalysis.position || '未知'}`);
                                  if (skill) setImportedSkills((prev) => new Set(prev).add(tech.name));
                                }}
                                className="text-xs text-blue hover:text-blue/80 font-medium transition-colors"
                              >
                                + 导入
                              </button>
                            )}
                            {learningGuides[tech.name] && (
                              <span className="text-xs text-muted">已加载</span>
                            )}
                            {loadingGuide === tech.name && (
                              <span className="text-xs text-blue">加载中...</span>
                            )}
                          </div>
                        </div>

                        {/* Learning guide details */}
                        {activeTech === tech.name && (
                          <div className="ml-4 pl-4 border-l-2 border-blue/20 space-y-4 pb-3 pt-2">
                            {guideErrors[tech.name] ? (
                              <div className="bg-red-light/30 rounded-lg border border-red/20 px-4 py-3">
                                <p className="text-sm text-red mb-2">{guideErrors[tech.name]}</p>
                                <button
                                  onClick={() => handleLoadGuide(tech.name, tech.category, tech.required_level)}
                                  disabled={loadingGuide === tech.name}
                                  className="text-xs bg-blue text-white rounded-full px-4 py-1.5 font-medium hover:bg-blue/90 transition-colors disabled:opacity-50"
                                >
                                  {loadingGuide === tech.name ? "重试中..." : "重试"}
                                </button>
                              </div>
                            ) : learningGuides[tech.name] ? (
                              <>
                            {/* Learning path */}
                            {learningGuides[tech.name].learning_path.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-ink mb-2">学习路径</h4>
                                <div className="space-y-2">
                                  {learningGuides[tech.name].learning_path.filter((s) => !isUnavailable(s.description ?? "")).map((step) => (
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

                            {/* Interview questions */}
                            {learningGuides[tech.name].interview_questions.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-ink mb-2">面试题</h4>
                                <div className="space-y-1.5">
                                  {learningGuides[tech.name].interview_questions.map((q, idx) => (
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
                ) : (
                  <p className="text-sm text-muted">配置 DEEPSEEK_API_KEY 后自动分析技术栈</p>
                )}
              </div>

              {/* Key requirements */}
              {analysisResult?.key_requirements && analysisResult.key_requirements.length > 0 && (
                <div className="bg-canvas rounded-xl border border-hairline p-5 transition-all duration-200 hover:border-blue/20" style={entrance(mounted, 0.2)}>
                  <h3 className="font-semibold text-sm text-ink mb-3">核心要求</h3>
                  <ul className="space-y-2">
                    {analysisResult.key_requirements.map((req, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate">
                        <span className="text-blue mt-0.5 shrink-0">&#8226;</span>
                        <span>{req}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Next steps */}
              {currentAnalysis.tech_stack.length > 0 && (
                <div className="bg-blue-light/50 border border-blue/20 rounded-xl p-5 transition-all duration-200 hover:border-blue/40" style={entrance(mounted, 0.25)}>
                  <h3 className="font-semibold text-sm text-blue mb-2">下一步</h3>
                  <p className="text-sm text-slate mb-3">
                    点击技术名称旁的 <strong>+ 导入</strong> 将需要的技术添加到技能库。
                    已导入的技术可在 <a href="/skills" className="text-blue underline">技能库</a> 中查看学习资源和 AI 学习计划。
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
