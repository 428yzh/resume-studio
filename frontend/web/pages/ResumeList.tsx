import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useResumeStore } from "@core/stores/resumeStore";
import { calculateResumeProgress } from "@core/services/resumeService";
import ConfirmDialog from "@web/components/ConfirmDialog";
import LoadingDots from "@web/components/LoadingDots";
import JobRecommend from "@web/components/JobRecommend";
import AnimatedNumber from "@web/components/AnimatedNumber";
import { useEntrance, entrance } from "@web/hooks/useEntrance";
import { DocIcon } from "@web/components/EmptyIcons";

function getRequiredKeys(): string[] {
  return ["header", "summary", "experience", "education", "skills"];
}

export default function ResumeList() {
  const navigate = useNavigate();
  const { resumes, templates, loading, fetchResumes, fetchTemplates, createResume, deleteResume } = useResumeStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const { mounted } = useEntrance();

  useEffect(() => {
    fetchResumes();
    fetchTemplates();
  }, []);

  const handleCreate = async () => {
    const defaultTemplate = templates.find((t) => t.is_default) || templates[0];
    const resume = await createResume({
      title: "未命名简历",
      template_id: defaultTemplate?.id || 1,
    });
    navigate(`/resumes/${resume.id}`);
  };

  const handleImportPDF = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/resumes/import-pdf", { method: "POST", body: formData });
      if (!res.ok) throw new Error((await res.json()).detail || "导入失败");
      const resume = await res.json();
      await fetchResumes();
      navigate(`/resumes/${resume.id}`);
    } catch (err) {
      alert("导入失败：" + ((err as Error).message || "请检查文件格式"));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 animate-fade-in">
        <div>
          <h2 className="text-2xl font-bold text-ink">我的简历</h2>
          <p className="text-sm text-slate mt-1">管理你的简历，创建新简历或编辑已有简历</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleImportPDF} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="bg-transparent text-ink border border-hairline rounded-full px-5 py-2 font-semibold text-sm hover:bg-surface transition-all active:scale-95 disabled:opacity-50"
          >
            {importing ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-blue rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-blue rounded-full animate-bounce [animation-delay:0.15s]" />
                <span className="w-1.5 h-1.5 bg-blue rounded-full animate-bounce [animation-delay:0.3s]" />
                解析中...
              </span>
            ) : (
              "导入简历"
            )}
          </button>
          <button
            onClick={handleCreate}
            data-tour="create-resume"
            className="bg-blue text-white rounded-full px-5 py-2 font-semibold text-sm hover:bg-blue/90 transition-all active:scale-95"
          >
            + 新建简历
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex justify-center py-12">
          <LoadingDots />
        </div>
      )}

      {/* Empty state */}
      {!loading && resumes.length === 0 && (
        <div
          className="bg-canvas rounded-xl border border-hairline p-12 text-center transition-all duration-300"
          style={entrance(mounted, 0.1)}
        >
          <DocIcon className="w-12 h-12 mx-auto mb-4 transition-transform duration-300 hover:scale-110" />
          <h3 className="text-lg font-semibold text-ink mb-2">还没有简历</h3>
          <p className="text-sm text-slate mb-6">点击上方按钮创建你的第一份简历</p>
          <button
            onClick={handleCreate}
            className="bg-blue text-white rounded-full px-5 py-2 font-semibold text-sm hover:bg-blue/90 transition-all active:scale-95"
          >
            开始创建
          </button>
        </div>
      )}

      {/* Resume grid */}
      {!loading && resumes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {resumes.map((resume, i) => {
            const progress = calculateResumeProgress(resume, getRequiredKeys());
            const template = templates.find((t) => t.id === resume.template_id);
            return (
              <div
                key={resume.id}
                className="bg-canvas rounded-xl border border-hairline p-6 hover:border-blue/30 hover:shadow-sm hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 cursor-pointer group"
                onClick={() => navigate(`/resumes/${resume.id}`)}
                style={entrance(mounted, 0.08 + 0.05 * i)}
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-ink text-base">{resume.title}</h3>
                  <span className="text-xs text-muted bg-surface rounded-full px-2.5 py-0.5">
                    {template?.name || "默认模板"}
                  </span>
                </div>

                {resume.target_position && (
                  <p className="text-sm text-slate mb-3">目标：{resume.target_position}</p>
                )}

                {/* Progress bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs text-muted mb-1">
                    <span>完成度</span>
                    <span className="tabular-nums">
                      <AnimatedNumber value={progress} className="font-semibold text-ink" />%
                    </span>
                  </div>
                  <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue rounded-full transition-all duration-700 ease-out"
                      style={{ width: mounted ? `${progress}%` : "0%" }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">{new Date(resume.updated_at).toLocaleDateString("zh-CN")}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(resume.id); }}
                    className="text-xs text-red/60 hover:text-red md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                  >
                    删除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Job recommendations */}
      <JobRecommend />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除简历"
        message="删除后无法恢复，确定要删除这份简历吗？"
        confirmLabel="确认删除"
        onConfirm={async () => {
          if (deleteTarget !== null) {
            await deleteResume(deleteTarget);
            setDeleteTarget(null);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
