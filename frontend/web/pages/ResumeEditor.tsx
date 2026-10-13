import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useResumeStore } from "@core/stores/resumeStore";
import { resumeToPlainText, sectionHasContent, orderSectionKeys, moveSectionKey, SECTION_ORDER_KEY } from "@core/services/resumeService";
import { exportToPDF } from "@core/services/pdfService";
import { exportResumeToDocx } from "@core/services/docxService";
import SectionForm from "@web/components/SectionForm";
import JDMatchTab from "@web/components/JDMatchTab";
import ConfirmDialog from "@web/components/ConfirmDialog";
import LoadingDots from "@web/components/LoadingDots";
import { useEntrance, entrance } from "@web/hooks/useEntrance";
import { DocIcon } from "@web/components/EmptyIcons";
import { createDefaultContent } from "@core/models/section";
import type { Sections } from "@core/models/section";

type TabKey = "edit" | "polish" | "preview" | "jd";

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 bg-ink text-white rounded-full px-5 py-2.5 text-sm font-medium shadow-lg z-50 animate-fade-in">
      {message}
    </div>
  );
}

/** Consume SSE stream from /api/ai/polish/stream */
async function streamPolish(
  sectionTitle: string,
  content: string,
  targetPosition: string,
  onToken: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const resp = await fetch("/api/ai/polish/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ section_title: sectionTitle, content, target_position: targetPosition }),
    signal,
  });
  if (!resp.ok) throw new Error("Stream request failed");

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (parsed.content) {
            full += parsed.content;
            onToken(parsed.content);
          }
        } catch (e) {
          if (e instanceof Error) throw e;
          /* skip malformed */
        }
      }
    }
  }

  return full;
}

const SECTION_GROUPS = [
  {
    label: "基本信息",
    items: [
      { key: "header", title: "个人信息", hint: "姓名、联系方式、地址等" },
      { key: "summary", title: "个人摘要", hint: "简要介绍自己的职业背景和核心优势" },
      { key: "experience", title: "工作经历", hint: "按 STAR 法则描述工作经历" },
      { key: "education", title: "教育背景", hint: "学校、专业、学位、时间" },
      { key: "skills", title: "技能清单", hint: "专业技能、工具、语言等" },
    ],
  },
  {
    label: "附加信息",
    items: [
      { key: "projects", title: "项目经验", hint: "重点项目描述" },
      { key: "certifications", title: "证书与资质", hint: "相关证书和认证" },
      { key: "languages", title: "语言能力", hint: "语言种类和水平" },
    ],
  },
];

const AVAILABLE_SECTION_TYPES = SECTION_GROUPS.flatMap((g) => g.items);

export default function ResumeEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentResume, templates, loading, fetchResume, fetchTemplates, createResume, updateResume } = useResumeStore();

  const [activeTab, setActiveTab] = useState<TabKey>("edit");
  const [sectionContents, setSectionContents] = useState<Sections>({});
  const [title, setTitle] = useState("");
  const [targetCompany, setTargetCompany] = useState("");
  const [targetPosition, setTargetPosition] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number>(1);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDeleteSection, setConfirmDeleteSection] = useState<{ key: string; title: string } | null>(null);

  // Reset dirty on initial load
  useEffect(() => {
    if (currentResume) {
      setDirty(false);
    }
  }, [currentResume?.id]);

  // Mark dirty only on explicit user edits, not on data loading
  const markDirty = useCallback(() => {
    if (!dirty) setDirty(true);
  }, [dirty]);

  // beforeunload — warn on tab close / refresh
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Reset dirty on initial load

  // Polish state
  const [polishingFull, setPolishingFull] = useState(false);
  const [polishFullText, setPolishFullText] = useState("");
  const [polishFullResult, setPolishFullResult] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { mounted } = useEntrance();

  const isNew = id === "new";

  useEffect(() => {
    fetchTemplates();
    if (id && id !== "new") {
      fetchResume(Number(id));
    }
  }, [id]);

  useEffect(() => {
    if (currentResume) {
      setSectionContents(currentResume.sections || {});
      setTitle(currentResume.title);
      setTargetCompany(currentResume.target_company || "");
      setTargetPosition(currentResume.target_position || "");
      setSelectedTemplateId(currentResume.template_id);
    }
  }, [currentResume]);

  const template = templates.find((t) => t.id === selectedTemplateId) || templates[0];
  const templateSections = template?.structure?.sections || [];

  // 模板区块 + 数据里存在但模板未定义区块（如切换到不含 projects 的模板时，
  // 已有内容不应被藏起来，否则既看不到也无法重新添加），最后按用户自定义顺序排
  const unorderedSections = [
    ...templateSections.map((sec) => ({
      key: sec.key,
      title: sec.title,
      data: sectionContents[sec.key],
    })),
    ...Object.keys(sectionContents)
      .filter((k) => k !== SECTION_ORDER_KEY && !templateSections.find((ts) => ts.key === k) && sectionContents[k] !== undefined)
      .map((k) => ({
        key: k,
        title: AVAILABLE_SECTION_TYPES.find((s) => s.key === k)?.title ?? k,
        data: sectionContents[k],
      })),
  ];
  const displaySections = orderSectionKeys(
    unorderedSections.map((s) => s.key),
    sectionContents[SECTION_ORDER_KEY],
  ).map((k) => unorderedSections.find((s) => s.key === k)!);

  const fullResumeText = useMemo(() => resumeToPlainText(sectionContents), [sectionContents]);
  const filledCount = displaySections.filter((s) => sectionHasContent(s.key, s.data)).length;

  const handleContentChange = (key: string, data: unknown) => {
    setSectionContents((prev) => ({ ...prev, [key]: data }));
    markDirty();
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      if (isNew) {
        const resume = await createResume({
          title: title || "未命名简历",
          template_id: selectedTemplateId,
          sections: sectionContents,
          target_company: targetCompany,
          target_position: targetPosition,
        });
        navigate(`/resumes/${resume.id}`, { replace: true });
      } else if (currentResume) {
        await updateResume(currentResume.id, {
          title,
          sections: sectionContents,
          target_company: targetCompany,
          target_position: targetPosition,
        });
      }
      setToast("保存成功");
	      setDirty(false);
    } catch {
      setToast("保存失败");
    } finally {
      setSaving(false);
    }
  }, [currentResume, isNew, title, selectedTemplateId, sectionContents, targetCompany, targetPosition, navigate, createResume, updateResume]);

  const handleTemplateChange = (newTemplateId: number) => {
    setSelectedTemplateId(newTemplateId);
    markDirty();
  };

  const handleAddSection = (key: string) => {
    if (sectionContents[key] !== undefined) return;
    setSectionContents((prev) => ({ ...prev, [key]: createDefaultContent(key) as never }));
  };

  const handleMoveSection = (key: string, dir: -1 | 1) => {
    const keys = displaySections.map((s) => s.key);
    const next = moveSectionKey(keys, key, dir);
    if (next === keys) return; // 首尾越界
    setSectionContents((prev) => ({ ...prev, [SECTION_ORDER_KEY]: next }));
    markDirty();
  };

  const handleRemoveSection = (key: string) => {
    if (templateSections.find((s) => s.key === key)?.required) return;
    const newContents = { ...sectionContents };
    delete newContents[key];
    setSectionContents(newContents);
  };

  const handleExportPDF = () => {
    if (!currentResume && !isNew) return;
    const resumeData = currentResume || {
      id: 0,
      title,
      template_id: selectedTemplateId,
      sections: sectionContents as Record<string, unknown>,
      target_company: targetCompany,
      target_position: targetPosition,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const tmpl = template || templates[0];
    if (!tmpl) return;
    exportToPDF(resumeData, tmpl, displaySections);
  };

  const handleExportWord = () => {
    const tmpl = template || templates[0];
    exportResumeToDocx(title || "简历", tmpl?.structure.style?.primary_color, displaySections);
  };

  const handleExportBOSS = () => {
    const text = resumeToPlainText(sectionContents);
    navigator.clipboard.writeText(text).then(() => {
      alert("简历文本已复制到剪贴板，可直接粘贴到 BOSS直聘 简历编辑页");
    }).catch(() => {
      // Fallback for non-HTTPS environments
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      alert("简历文本已复制到剪贴板");
    });
  };

  const handleFullPolish = async () => {
    if (!fullResumeText.trim()) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPolishingFull(true);
    setPolishFullText("");
    setPolishFullResult(null);

    try {
      const result = await streamPolish(
        "完整简历",
        fullResumeText,
        targetPosition,
        (token) => {
          setPolishFullText((prev) => prev + token);
        },
        controller.signal,
      );
      if (!result || !result.trim()) {
        setToast("AI 返回内容为空，请稍后重试");
        setPolishFullResult(null);
      } else {
        setPolishFullResult(result);
      }
      setPolishFullText("");
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setToast("润色失败，请重试");
    } finally {
      setPolishingFull(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const extraSections = AVAILABLE_SECTION_TYPES.filter(
    (s) => !templateSections.find((ts) => ts.key === s.key) && sectionContents[s.key] === undefined
  );

  if (!isNew && !currentResume && loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingDots />
      </div>
    );
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: "edit", label: "编辑" },
    { key: "polish", label: "AI 润色" },
    { key: "preview", label: "预览" },
    { key: "jd", label: "JD 匹配" },
  ];

  // ── Preview sub-renderers ──────────────────────────────────────

  function renderHeaderPreview(data: unknown) {
    if (!data) return null;
    const h = data as { name?: string; email?: string; phone?: string; location?: string; title?: string };
    return (
      <div className="mb-6">
        {h.name && <h1 className="text-2xl font-bold text-ink">{h.name}</h1>}
        {h.title && <p className="text-sm text-slate mt-0.5">{h.title}</p>}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate mt-1">
          {h.email && <span>{h.email}</span>}
          {h.phone && <span>{h.phone}</span>}
          {h.location && <span>{h.location}</span>}
        </div>
      </div>
    );
  }

  function renderSummaryPreview(data: unknown) {
    if (!data) return null;
    const s = data as { content?: string };
    if (!s.content?.trim()) return null;
    return <p className="text-sm text-charcoal whitespace-pre-wrap leading-relaxed mb-6">{s.content}</p>;
  }

  function renderExperiencePreview(data: unknown) {
    const items = data as Array<{ id?: string; company?: string; position?: string; start_date?: string; end_date?: string; current?: boolean; description?: string }> | undefined;
    if (!items?.length) return null;
    return (
      <div className="space-y-4 mb-6">
        {items.map((item) => (
          <div key={item.id || ""}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-ink">{item.company}</h3>
              <span className="text-xs text-slate shrink-0 ml-4">
                {item.start_date || ""} - {item.current ? "至今" : item.end_date || ""}
              </span>
            </div>
            {item.position && <p className="text-xs text-slate">{item.position}</p>}
            {item.description && <p className="text-sm text-charcoal whitespace-pre-wrap leading-relaxed mt-1">{item.description}</p>}
          </div>
        ))}
      </div>
    );
  }

  function renderEducationPreview(data: unknown) {
    const items = data as Array<{ id?: string; school?: string; degree?: string; major?: string; start_date?: string; end_date?: string }> | undefined;
    if (!items?.length) return null;
    return (
      <div className="space-y-3 mb-6">
        {items.map((item) => (
          <div key={item.id || ""}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-ink">{item.school}</h3>
              <span className="text-xs text-slate shrink-0 ml-4">
                {item.start_date || ""} - {item.end_date || ""}
              </span>
            </div>
            <p className="text-xs text-slate">{[item.degree, item.major].filter(Boolean).join(" · ")}</p>
          </div>
        ))}
      </div>
    );
  }

  function renderSkillsPreview(data: unknown) {
    const items = data as Array<{ id?: string; name?: string; level?: string }> | undefined;
    if (!items?.length) return null;
    return (
      <div className="flex flex-wrap gap-2 mb-6">
        {items.map((item) => (
          <span
            key={item.id || ""}
            className="inline-flex items-center gap-1.5 bg-surface border border-hairline rounded-full px-3 py-1 text-xs"
          >
            <span>{item.name}</span>
            {item.level && <span className="text-muted">· {item.level}</span>}
          </span>
        ))}
      </div>
    );
  }

  function renderProjectsPreview(data: unknown) {
    const items = data as Array<{ id?: string; name?: string; role?: string; tech_stack?: string; description?: string; url?: string }> | undefined;
    if (!items?.length) return null;
    return (
      <div className="space-y-4 mb-6">
        {items.map((item) => (
          <div key={item.id || ""}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-ink">{item.name}</h3>
              {item.role && <span className="text-xs text-slate">{item.role}</span>}
            </div>
            {item.tech_stack && <p className="text-xs text-muted mt-0.5">技术栈：{item.tech_stack}</p>}
            {item.description && <p className="text-sm text-charcoal whitespace-pre-wrap leading-relaxed mt-1">{item.description}</p>}
            {item.url && (
              <a href={item.url} className="text-xs text-blue hover:underline mt-0.5 inline-block" target="_blank" rel="noreferrer">
                {item.url}
              </a>
            )}
          </div>
        ))}
      </div>
    );
  }

  function renderCertificationsPreview(data: unknown) {
    const items = data as Array<{ id?: string; name?: string; issuer?: string; date?: string }> | undefined;
    if (!items?.length) return null;
    return (
      <div className="space-y-2 mb-6">
        {items.map((item) => (
          <div key={item.id || ""} className="text-sm">
            <span className="font-medium text-ink">{item.name}</span>
            {item.issuer && <span className="text-slate"> — {item.issuer}</span>}
            {item.date && <span className="text-muted text-xs ml-2">{item.date}</span>}
          </div>
        ))}
      </div>
    );
  }

  function renderLanguagesPreview(data: unknown) {
    const items = data as Array<{ id?: string; name?: string; proficiency?: string }> | undefined;
    if (!items?.length) return null;
    return (
      <div className="flex flex-wrap gap-2 mb-6">
        {items.map((item) => (
          <span key={item.id || ""} className="inline-flex items-center gap-1.5 bg-surface border border-hairline rounded-full px-3 py-1 text-xs">
            <span>{item.name}</span>
            {item.proficiency && <span className="text-muted">· {item.proficiency}</span>}
          </span>
        ))}
      </div>
    );
  }

  function renderSectionPreview(key: string, data: unknown) {
    switch (key) {
      case "header": return renderHeaderPreview(data);
      case "summary": return renderSummaryPreview(data);
      case "experience": return renderExperiencePreview(data);
      case "education": return renderEducationPreview(data);
      case "skills": return renderSkillsPreview(data);
      case "projects": return renderProjectsPreview(data);
      case "certifications": return renderCertificationsPreview(data);
      case "languages": return renderLanguagesPreview(data);
      default: return null;
    }
  }

  return (
    <div>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {/* Title bar */}
      <div className="flex items-center justify-between mb-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <button onClick={() => { if (dirty) { setConfirmLeave(true); } else { navigate("/resumes"); } }} className="text-slate hover:text-ink text-sm transition-all hover:gap-1 active:scale-95 inline-flex items-center gap-0.5">
            &larr; 返回
          </button>
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); markDirty(); }}
            className="text-2xl font-bold bg-transparent border-none outline-none focus:border-b focus:border-hairline"
            placeholder="简历名称"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue text-white rounded-full px-5 py-2 font-semibold text-sm hover:bg-blue/90 active:scale-95 disabled:opacity-50 transition-all"
          >
            {saving ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce [animation-delay:0.15s]" />
                <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce [animation-delay:0.3s]" />
                保存中...
              </span>
            ) : (
              "保存"
            )}
          </button>
          <button
            onClick={handleExportPDF}
            className="bg-transparent text-ink border border-hairline rounded-full px-5 py-2 font-semibold text-sm hover:bg-surface transition-all active:scale-95"
          >
            导出 PDF
          </button>
          <button
            onClick={handleExportWord}
            className="bg-transparent text-ink border border-hairline rounded-full px-5 py-2 font-semibold text-sm hover:bg-surface transition-all active:scale-95"
          >
            导出 Word
          </button>
          <button
            onClick={handleExportBOSS}
            className="bg-transparent text-ink border border-hairline rounded-full px-5 py-2 font-semibold text-sm hover:bg-surface transition-all active:scale-95"
          >
            导出为 BOSS 格式
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-6 bg-surface rounded-full p-1 w-fit" style={entrance(mounted, 0.05)}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all active:scale-95 ${
              activeTab === tab.key ? "bg-canvas text-ink shadow-sm" : "text-slate hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Edit tab ─────────────────────────────────────────────── */}
      {activeTab === "edit" && (
        <>
        {isNew && filledCount === 0 && (
          <div className="bg-blue-light/30 border border-blue/20 rounded-xl p-8 mb-6 text-center transition-all duration-300" style={entrance(mounted, 0.08)}>
          <DocIcon className="w-10 h-10 mx-auto mb-3 transition-transform duration-300 hover:scale-110" />
          <h3 className="text-lg font-semibold text-ink mb-2">开始编写你的简历</h3>
            <p className="text-sm text-slate max-w-md mx-auto mb-6">
              填写右侧的标题和求职目标，然后逐个区块填写内容。
              模板已预设了常用区块，你也可以按需添加。
            </p>
            <div className="flex flex-wrap justify-center gap-3 text-sm text-slate">
              <div className="bg-canvas rounded-lg border border-hairline px-4 py-2">1. 填写标题和目标</div>
              <div className="bg-canvas rounded-lg border border-hairline px-4 py-2">2. 编辑各区块内容</div>
              <div className="bg-canvas rounded-lg border border-hairline px-4 py-2">3. 点击「保存」</div>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {displaySections.map((sec, i) => {
              const data = sec.data ?? createDefaultContent(sec.key);
              return (
                <div key={sec.key} className="bg-canvas rounded-xl border border-hairline p-5 group transition-all duration-200 hover:border-blue/20" style={entrance(mounted, 0.1 + 0.05 * i)}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <label className="font-semibold text-sm text-ink">{sec.title}</label>
                      {sectionHasContent(sec.key, data) && (
                        <span className="text-xs text-green">已填写</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleMoveSection(sec.key, -1)}
                        disabled={i === 0}
                        aria-label={`上移${sec.title}`}
                        className="text-xs text-slate/60 hover:text-blue disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        ↑ 上移
                      </button>
                      <button
                        onClick={() => handleMoveSection(sec.key, 1)}
                        disabled={i === displaySections.length - 1}
                        aria-label={`下移${sec.title}`}
                        className="text-xs text-slate/60 hover:text-blue disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        ↓ 下移
                      </button>
                      {!templateSections.find((s) => s.key === sec.key)?.required && (
                        <button
                          onClick={() => setConfirmDeleteSection({ key: sec.key, title: sec.title })}
                          className="text-xs text-red/60 hover:text-red"
                        >
                          删除
                        </button>
                      )}
                    </div>
                  </div>
                  <SectionForm
                    sectionKey={sec.key}
                    data={data}
                    onChange={(d) => handleContentChange(sec.key, d)}
                  />
                </div>
              );
            })}

            {extraSections.length > 0 && (
              <details className="bg-canvas rounded-xl border border-dashed border-hairline p-4">
                <summary className="text-sm font-medium text-blue cursor-pointer select-none">
                  + 添加区块
                </summary>
                <div className="mt-3 space-y-3">
                  {SECTION_GROUPS.map((group) => {
                    const items = group.items.filter(
                      (s) => !templateSections.find((ts) => ts.key === s.key) && sectionContents[s.key] === undefined
                    );
                    if (items.length === 0) return null;
                    return (
                      <div key={group.label}>
                        <p className="text-xs text-muted font-medium mb-1.5">{group.label}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {items.map((sec) => (
                            <button
                              key={sec.key}
                              onClick={() => handleAddSection(sec.key)}
                              className="text-left px-3 py-2 rounded-lg hover:bg-surface transition-colors text-sm text-slate hover:text-ink"
                            >
                              <div className="font-medium">{sec.title}</div>
                              <div className="text-xs text-muted truncate">{sec.hint}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="bg-canvas rounded-xl border border-hairline p-5 transition-all duration-200 hover:border-blue/20" style={entrance(mounted, 0.25)}>
              <h3 className="font-semibold text-sm text-ink mb-3">模板信息</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted block mb-1">切换模板</label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => handleTemplateChange(Number(e.target.value))}
                    className="w-full border border-hairline rounded-lg px-3 py-2 text-sm outline-none focus:border-blue transition-colors bg-canvas"
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate">区块数</span>
                  <span className="font-medium">{displaySections.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate">已填写</span>
                  <span className="font-medium">{filledCount}</span>
                </div>
              </div>
            </div>

            <div className="bg-canvas rounded-xl border border-hairline p-5 transition-all duration-200 hover:border-blue/20" style={entrance(mounted, 0.3)}>
              <h3 className="font-semibold text-sm text-ink mb-3">求职目标</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted block mb-1">目标公司</label>
                  <input
                    value={targetCompany}
                    onChange={(e) => { setTargetCompany(e.target.value); markDirty(); }}
                    placeholder="例如：字节跳动"
                    className="w-full border border-hairline rounded-lg px-3 py-2 text-sm outline-none focus:border-blue transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">目标职位</label>
                  <input
                    value={targetPosition}
                    onChange={(e) => { setTargetPosition(e.target.value); markDirty(); }}
                    placeholder="例如：高级前端工程师"
                    className="w-full border border-hairline rounded-lg px-3 py-2 text-sm outline-none focus:border-blue transition-colors"
                  />
                </div>
              </div>
            </div>

            <div className="bg-blue/5 rounded-xl border border-blue/20 p-5 transition-all duration-200 hover:border-blue/40" style={entrance(mounted, 0.35)}>
              <h3 className="font-semibold text-sm text-blue mb-2">写作提示</h3>
              <ul className="text-xs text-slate space-y-1.5 list-disc list-inside">
                <li>用 STAR 法则描述工作经历</li>
                <li>量化成果，用数字说话</li>
                <li>使用强动词开头（实现、优化、主导）</li>
                <li>针对目标岗位定制关键词</li>
              </ul>
            </div>
          </div>
        </div>
        </>
      )}

      {/* ── AI Polish tab ─────────────────────────────────────────── */}
      {activeTab === "polish" && (
        <div className="space-y-4">
          <div className="bg-canvas rounded-xl border border-hairline p-5 transition-all duration-200 hover:border-blue/20" style={entrance(mounted, 0.1)}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm text-ink">AI 简历润色</h3>
              <button
                onClick={handleFullPolish}
                disabled={polishingFull || !fullResumeText.trim()}
                className="bg-blue text-white rounded-full px-5 py-2 font-semibold text-sm hover:bg-blue/90 active:scale-95 disabled:opacity-50 transition-all"
              >
                {polishingFull ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce" />
                    <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce [animation-delay:0.15s]" />
                    <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce [animation-delay:0.3s]" />
                    润色中...
                  </span>
                ) : (
                  "AI 润色全文"
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted mb-1">原文</p>
                <div className="text-sm text-slate whitespace-pre-wrap bg-surface rounded-lg p-3 min-h-[300px] max-h-[500px] overflow-y-auto border border-hairline">
                  {fullResumeText || "暂无内容，请先在编辑页填写简历"}
                </div>
              </div>

              <div>
                <p className="text-xs text-muted mb-1">
                  {polishingFull ? "AI 生成中..." : polishFullResult ? "润色结果" : "润色结果"}
                </p>
                {polishingFull ? (
                  <div className="text-sm text-charcoal whitespace-pre-wrap bg-blue-light/30 rounded-lg p-3 min-h-[300px] max-h-[500px] overflow-y-auto border border-blue/20">
                    {polishFullText || "正在生成..."}
                    <span className="inline-block w-0.5 h-4 bg-blue ml-0.5 animate-pulse" />
                  </div>
                ) : polishFullResult ? (
                  <div className="text-sm text-charcoal whitespace-pre-wrap bg-blue-light/30 rounded-lg p-3 min-h-[300px] max-h-[500px] overflow-y-auto border border-blue/20">
                    {polishFullResult}
                  </div>
                ) : (
                  <div className="text-sm text-muted bg-surface rounded-lg p-3 min-h-[300px] border border-hairline flex items-center justify-center">
                    点击「AI 润色全文」获取优化建议
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Preview tab ───────────────────────────────────────────── */}
      {activeTab === "preview" && (
        <div className="bg-canvas rounded-xl border border-hairline p-8 max-w-[210mm] mx-auto transition-all duration-200 hover:border-blue/20" style={entrance(mounted, 0.1)}>
          {/* Header section is rendered separately at top */}
          {sectionContents.header && renderHeaderPreview(sectionContents.header)}

          {displaySections
            .filter((sec) => sec.key !== "header" && sectionHasContent(sec.key, sec.data))
            .map((sec) => {
              const preview = renderSectionPreview(sec.key, sec.data);
              if (!preview) return null;
              return (
                <div key={sec.key} className="mb-6">
                  <h2 className="text-sm font-bold text-blue uppercase tracking-wider border-b-2 border-blue pb-1 mb-3">
                    {sec.title}
                  </h2>
                  {preview}
                </div>
              );
            })}

          {displaySections.every((s) => !sectionHasContent(s.key, s.data)) && (
            <div className="text-center py-12 text-muted text-sm">暂无内容，请先在编辑页填写简历</div>
          )}
        </div>
      )}

      {/* ── JD Match tab ──────────────────────────────────────────── */}
      {activeTab === "jd" && (
        <JDMatchTab
          resumeId={currentResume?.id || 0}
          sections={sectionContents}
          targetPosition={targetPosition}
          targetCompany={targetCompany}
        />
      )}

      {/* Confirm leave without saving */}
      <ConfirmDialog
        open={confirmLeave}
        title="未保存的更改"
        message="你有未保存的更改，离开后将丢失。确定要离开吗？"
        confirmLabel="离开"
        cancelLabel="继续编辑"
        danger={false}
        onConfirm={() => {
          setConfirmLeave(false);
          setDirty(false);
          navigate("/resumes");
        }}
        onCancel={() => setConfirmLeave(false)}
      />

      {/* Confirm section deletion */}
      <ConfirmDialog
        open={confirmDeleteSection !== null}
        title="删除区块"
        message={`确定要删除「${confirmDeleteSection?.title || ""}」区块吗？内容将被移除。`}
        confirmLabel="确认删除"
        onConfirm={() => {
          if (confirmDeleteSection) {
            handleRemoveSection(confirmDeleteSection.key);
            setConfirmDeleteSection(null);
          }
        }}
        onCancel={() => setConfirmDeleteSection(null)}
      />
    </div>
  );
}
