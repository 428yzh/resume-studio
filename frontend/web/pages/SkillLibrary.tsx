import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { useSkillStore } from "@core/stores/skillStore";
import { useQuizStore } from "@core/stores/quizStore";
import ConfirmDialog from "@web/components/ConfirmDialog";
import LearningPanel from "@web/components/LearningPanel";
import { GridIcon } from "@web/components/EmptyIcons";
import { api } from "@core/api/client";
import type { Skill } from "@core/models/skill";
import type { Question } from "@core/models/quiz";
import { exportQuestionsToPDF } from "@core/services/pdfService";
import { calculateAllStepScores, calculateStepScore, loadCornellFromStorage } from "@core/services/scoring";
import AIErrorBox from "@web/components/AIErrorBox";
import LoadingDots from "@web/components/LoadingDots";
import { isUnavailable, hasUnavailableField } from "@core/services/aiDegrade";
import { useEntrance, entrance } from "@web/hooks/useEntrance";

function EditSkillModal({
  skill,
  onClose,
  onSave,
  categories,
}: {
  skill: Skill;
  onClose: () => void;
  onSave: (data: { name: string; category: string; proficiency: number | null; notes: string }) => Promise<void>;
  categories: string[];
}) {
  const [name, setName] = useState(skill.name);
  const [category, setCategory] = useState(skill.category);
  const [proficiency, setProficiency] = useState(skill.proficiency);
  const [notes, setNotes] = useState(skill.notes);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[oklch(12%_0.008_250)]/40" onClick={onClose}>
      <div className="bg-canvas rounded-xl border border-hairline p-6 w-full max-w-md shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-base text-ink mb-4">编辑技能</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted block mb-1">技能名称</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm outline-none focus:border-blue" />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">分类</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm outline-none focus:border-blue bg-canvas">
              {categories.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">自评熟练度</label>
            <div className="flex items-center gap-3">
              <input type="range" min={0} max={100} value={proficiency ?? 0} onChange={(e) => setProficiency(Number(e.target.value))} className="flex-1" />
              <span className="text-xs text-muted w-12 text-right">{proficiency === null ? "未验证" : `${proficiency}%`}</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">备注</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm outline-none focus:border-blue resize-none" rows={3} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="bg-transparent text-ink border border-hairline rounded-full px-4 py-2 text-sm font-medium hover:bg-surface transition-colors">取消</button>
          <button onClick={() => onSave({ name, category, proficiency, notes })} className="bg-blue text-white rounded-full px-4 py-2 text-sm font-medium hover:bg-blue/90 transition-colors">保存</button>
        </div>
      </div>
    </div>
  );
}

export default function SkillLibrary() {
  const navigate = useNavigate();
  const { skills, resources, questions, learningPlan, loadingPlan, loading, error, fetchSkills, addSkill, updateSkill, deleteSkill, fetchResources, addResource, updateResource, deleteResource, fetchQuestions, addQuestion, updateQuestion, deleteQuestion, fetchLearningPlan, generateLearningPlan } = useSkillStore();
  const [activeCategory, setActiveCategory] = useState("全部");
  const [showForm, setShowForm] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [expandedSkill, setExpandedSkill] = useState<number | null>(null);
  // 新建时不带 proficiency：没自评过就存 NULL，用一个预填的 50 冒充自评是假数据
  const [formData, setFormData] = useState({ name: "", category: "前端", notes: "" });
  const [newResource, setNewResource] = useState({ title: "", url: "", type: "article" });
  const [editingResourceId, setEditingResourceId] = useState<number | null>(null);
  const [editResourceData, setEditResourceData] = useState({ title: "", url: "", type: "", completed: false });
  const [newQuestion, setNewQuestion] = useState({ question: "", answer: "", difficulty: "medium" });
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
  const [editQuestionData, setEditQuestionData] = useState({ question: "", answer: "", difficulty: "medium" });
  const [deleteSkillTarget, setDeleteSkillTarget] = useState<number | null>(null);
  const [quizQs, setQuizQs] = useState<Record<number, Question[]>>({});
  const [deleteResourceTarget, setDeleteResourceTarget] = useState<{ skillId: number; id: number; title: string } | null>(null);
  const [deleteQuestionTarget, setDeleteQuestionTarget] = useState<{ skillId: number; id: number; question: string } | null>(null);
  // 学习计划的现状描述 / 掌握程度按技能隔离，避免跨技能残留
  const [learningPlanLevel, setLearningPlanLevel] = useState<Record<number, string>>({});
  const [priorUnderstanding, setPriorUnderstanding] = useState<Record<number, string>>({});
  const [learningPanel, setLearningPanel] = useState<{
    open: boolean;
    skillId: number;
    skillName: string;
    step: { title: string; description: string; topics: string[]; stepNumber: number; estimated_hours: number; type?: string };
    requiredLevel: string;
  } | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Record<number, Record<number, boolean>>>({});
  const [stepScores, setStepScores] = useState<Record<number, Record<number, number>>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const { mounted } = useEntrance();

  useEffect(() => {
    fetchSkills();
  }, []);

  /* Recalculate step scores when learningPlan loads for the expanded skill */
  useEffect(() => {
    if (!expandedSkill || !learningPlan || !learningPlan.steps.length) return;
    const result = calculateAllStepScores(expandedSkill, learningPlan.steps);
    const scoresMap: Record<number, number> = {};
    result.stepScores.forEach((s) => { scoresMap[s.step] = s.score; });
    setStepScores((prev) => ({ ...prev, [expandedSkill]: scoresMap }));
  }, [learningPlan, expandedSkill]);

  const filteredSkills = activeCategory === "全部"
    ? skills
    : skills.filter((s) => s.category === activeCategory);

  const allCategories = ["全部", ...new Set(skills.map((s) => s.category).filter(Boolean))];

  const handleAdd = async () => {
    // 备注必填：它是出题时唯一的技能语境（见 backend _skill_context）。
    // 空的备注会让「harness」这种歧义名退化成裸名字，AI 只能瞎猜。
    if (!formData.name.trim() || !formData.notes.trim()) return;
    await addSkill(formData);
    setFormData({ name: "", category: "前端", notes: "" });
    setShowForm(false);
  };

  const handleEdit = async (skill: Skill, data: { name: string; category: string; proficiency: number | null; notes: string }) => {
    await updateSkill(skill.id, data);
    setEditingSkill(null);
  };

  const handleProficiencyChange = async (skill: Skill, value: number) => {
    await updateSkill(skill.id, { proficiency: value });
  };

  const isStepCompleted = useCallback((skillId: number, step: number) => {
    return completedSteps[skillId]?.[step] ?? false;
  }, [completedSteps]);

  const getStepScore = useCallback((skillId: number, step: number): number => {
    // 手动标记完成的步骤直接满分
    if (completedSteps[skillId]?.[step]) return 100;
    return stepScores[skillId]?.[step] ?? 0;
  }, [stepScores, completedSteps]);

  const toggleStepComplete = useCallback((skillId: number, step: number) => {
    const isCurrentlyDone = !!completedSteps[skillId]?.[step];
    const newDone = !isCurrentlyDone;

    // 标记完成 → 满分；取消标记 → 重新从笔记算分
    if (newDone) {
      setStepScores((prev) => ({
        ...prev,
        [skillId]: { ...(prev[skillId] || {}), [step]: 100 },
      }));
    } else {
      const cornell = loadCornellFromStorage(skillId, step);
      const score = cornell ? calculateStepScore(cornell).score : 0;
      setStepScores((prev) => ({
        ...prev,
        [skillId]: { ...(prev[skillId] || {}), [step]: score },
      }));
    }

    setCompletedSteps((prev) => {
      const updated = {
        ...prev,
        [skillId]: { ...prev[skillId], [step]: newDone },
      };
      try {
        localStorage.setItem(
          `learning_completed_${skillId}`,
          JSON.stringify(updated[skillId])
        );
      } catch {
        // ignore
      }
      return updated;
    });
  }, [completedSteps]);

  const handleAddResourceFromTopic = async (skillId: number, title: string, url?: string) => {
    await addResource(skillId, { title, url: url || "", type: "article" });
  };

  const handleExportMarkdown = useCallback(
    (skillId: number, skillName: string) => {
      const plan = learningPlan;
      if (!plan) return;

      const completed = completedSteps[skillId] || {};

      let md = `# 学习计划：${skillName}\n\n`;
      md += `**掌握程度**：${plan.required_level}\n\n`;
      md += `---\n\n`;

      plan.steps.forEach((step) => {
        const done = completed[step.step];
        md += `## 步骤 ${step.step}：${step.title}（${step.estimated_hours}h）\n\n`;
        md += `**状态**：${done ? "✅ 已完成" : "⬜ 未完成"}\n\n`;
        md += `### 学习内容\n${step.description}\n\n`;

        md += `---\n\n`;
      });

      if (plan.milestones.length > 0) {
        md += `## 学习目标\n\n`;
        plan.milestones.forEach((m) => {
          md += `- [ ] ${m}\n`;
        });
        md += "\n";
      }

      // Download .md file
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `学习计划_${skillName}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [learningPlan, completedSteps]
  );

  const toggleExpand = async (skillId: number) => {
    if (expandedSkill === skillId) {
      setExpandedSkill(null);
      return;
    }
    setExpandedSkill(skillId);
    fetchResources(skillId);
    fetchQuestions(skillId);
    fetchLearningPlan(skillId);
    // Load step completion from localStorage
    try {
      const saved = localStorage.getItem(`learning_completed_${skillId}`);
      if (saved) {
        setCompletedSteps((prev) => ({
          ...prev,
          [skillId]: JSON.parse(saved),
        }));
      }
    } catch {
      // ignore
    }
    // Fetch related quiz questions
    try {
      const { api } = await import("@core/api/client");
      const qs = await api.get<Question[]>(`/api/questions?skill_id=${skillId}`);
      setQuizQs((prev) => ({ ...prev, [skillId]: qs }));
    } catch {
      // ignore
    }
  };

  const getProficiencyColor = (value: number | null) => {
    if (value === null) return "bg-surface text-muted";
    if (value >= 80) return "bg-green text-green";
    if (value >= 60) return "bg-blue text-blue";
    if (value >= 40) return "bg-amber text-amber";
    return "bg-surface text-muted";
  };

  /* ── Animated counter ── */
  function AnimatedProficiency({ value }: { value: number }) {
    const [display, setDisplay] = useState(value);
    const prevRef = useRef(value);

    useEffect(() => {
      const from = prevRef.current;
      const to = value;
      if (from === to) { setDisplay(to); return; }

      const duration = 600;
      const start = performance.now();

      const tick = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplay(Math.round(from + (to - from) * eased));
        if (progress < 1) requestAnimationFrame(tick);
      };

      prevRef.current = to;
      requestAnimationFrame(tick);
    }, [value]);

    return <span>{display}</span>;
  }

  /* ── Isolated slider component to prevent table re-render on drag ── */
  function ProficiencySlider({ skill: sk }: { skill: Skill }) {
    const [val, setVal] = useState<number | null>(sk.proficiency);
    useEffect(() => setVal(sk.proficiency), [sk.proficiency]);

    const commit = async () => {
      if (val === null) return; // 没拖过就不写，别把「未验证」变成一个数字
      try {
        await api.put(`/api/skills/${sk.id}`, { proficiency: val });
        const { skills } = useSkillStore.getState();
        useSkillStore.setState({ skills: skills.map((s) => s.id === sk.id ? { ...s, proficiency: val } : s) });
      } catch {}
    };

    return (
      <div className="flex items-center gap-3 max-w-[180px]" onClick={(e) => e.stopPropagation()}>
        <input
          type="range" min={0} max={100}
          value={val ?? 0}
          title={val === null ? "拖动即表示自评（未经验证，只是你的预测）" : "自评熟练度（未经验证）"}
          onChange={(e) => setVal(Number(e.target.value))}
          onMouseUp={commit}
          onTouchEnd={commit}
          className="flex-1"
        />
        {val === null
          ? <span className="text-xs font-medium text-muted whitespace-nowrap">未验证</span>
          : (
            <span className={`text-xs font-medium ${getProficiencyColor(val).split(" ")[1]}`}>
              <AnimatedProficiency value={val} />%
            </span>
          )}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 animate-fade-in">
        <div>
          <h2 className="text-2xl font-bold text-ink">技能库</h2>
          <p className="text-sm text-slate mt-1">管理你的技能，跟踪学习进度</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/feynman")}
            className="bg-transparent text-ink border border-hairline rounded-full px-5 py-2 font-medium text-sm hover:bg-surface transition-all active:scale-95"
          >
            费曼复习
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue text-white rounded-full px-5 py-2 font-semibold text-sm hover:bg-blue/90 transition-all active:scale-95"
          >
            + 添加技能
          </button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-canvas rounded-xl border border-hairline p-5 mb-6 transition-all duration-200 hover:border-blue/20" style={entrance(mounted, 0.05)}>
          <h3 className="font-semibold text-sm text-ink mb-4">添加技能</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="技能名称"
              className="border border-hairline rounded-lg px-3 py-2 text-sm outline-none focus:border-blue transition-colors"
            />
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="border border-hairline rounded-lg px-3 py-2 text-sm outline-none focus:border-blue transition-colors bg-canvas"
            >
              {allCategories.filter((c) => c !== "全部").map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="备注（必填 · 出题依据）"
              title="写清这个技能具体指什么。出题时只有这段文字会作为技能语境传给 AI，歧义名（如 harness）尤其要写。"
              className="border border-hairline rounded-lg px-3 py-2 text-sm outline-none focus:border-blue transition-colors"
            />
            <button
              onClick={handleAdd}
              disabled={!formData.name.trim() || !formData.notes.trim()}
              className="bg-ink text-white rounded-full px-4 py-2 text-sm font-medium hover:bg-ink/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-ink"
            >
              确认添加
            </button>
          </div>
        </div>
      )}



      {/* Category filter */}
      <div className="flex items-center gap-2 mb-4 flex-wrap" style={entrance(mounted, 0.05)}>
        {allCategories.map((cat, ci) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all active:scale-95 ${
              activeCategory === cat
                ? "bg-ink text-white shadow-sm"
                : "bg-surface text-slate hover:text-ink"
            }`}
            style={{ opacity: 0, animation: `fade-in 0.3s ease-out ${0.1 + 0.05 * ci}s forwards` }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <LoadingDots />
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredSkills.length === 0 && (
        <div className="bg-canvas rounded-xl border border-hairline p-12 text-center transition-all duration-300" style={entrance(mounted, 0.15)}>
          <GridIcon className="w-12 h-12 mx-auto mb-4 transition-transform duration-300 hover:scale-110" />
          <h3 className="text-lg font-semibold text-ink mb-2">技能库为空</h3>
          <p className="text-sm text-slate mb-6">
            {activeCategory === "全部"
              ? "添加技能或通过 JD 分析导入技能"
              : `暂无 ${activeCategory} 分类的技能`}
          </p>
          {activeCategory === "全部" && (
            <button
              onClick={() => setShowForm(true)}
              className="bg-blue text-white rounded-full px-5 py-2 font-semibold text-sm hover:bg-blue/90 transition-all active:scale-95"
            >
              添加技能
            </button>
          )}
        </div>
      )}

      {/* Skills table */}
      {!loading && filteredSkills.length > 0 && (
        <div className="border border-hairline rounded-lg overflow-hidden" style={entrance(mounted, 0.1)}>
          <table className="w-full">
            <thead>
              <tr className="bg-surface text-xs text-muted uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">技能名称</th>
                <th className="text-left px-4 py-3 font-medium">分类</th>
                <th className="text-left px-4 py-3 font-medium" title="这是你的自评，不是验证过的分数。没拖过滑块就是「未验证」">自评熟练度</th>
                <th className="text-left px-4 py-3 font-medium">来源</th>
                <th className="text-left px-4 py-3 font-medium">备注</th>
                <th className="text-right px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredSkills.map((skill, si) => (
                <Fragment key={skill.id}>
                  <tr className="border-t border-hairline hover:bg-surface/50 transition-colors cursor-pointer" onClick={() => toggleExpand(skill.id)} style={{ opacity: 0, animation: `fade-in 0.3s ease-out ${0.12 + 0.04 * si}s forwards` }}>
                    <td className="px-4 py-3 font-medium text-charcoal text-sm">{skill.name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs rounded-full px-2.5 py-0.5 font-medium ${
                        skill.category === "前端" ? "bg-blue-light text-blue" :
                        skill.category === "后端" ? "bg-green/10 text-green" :
                        skill.category === "数据库" ? "bg-amber/10 text-amber" :
                        "bg-surface text-slate"
                      }`}>
                        {skill.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ProficiencySlider skill={skill} />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate">{skill.source || "-"}</td>
                    <td className="px-4 py-3 text-sm text-slate max-w-[150px] truncate">{skill.notes || "-"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setEditingSkill(skill)}
                          className="text-xs text-slate hover:text-blue transition-colors"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => setDeleteSkillTarget(skill.id)}
                          className="text-xs text-red/60 hover:text-red transition-colors"
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedSkill === skill.id && (
                    <tr key={`${skill.id}-details`} className="border-t border-hairline">
                      <td colSpan={6} className="px-0 py-0">
                        <div className="mx-4 mb-4 bg-canvas rounded-xl border border-blue/20 shadow-sm overflow-hidden">
                          <div className="flex items-center gap-2 px-4 py-2 bg-blue-light/20 text-xs text-blue font-medium border-b border-blue/10">
                            <span>详细信息</span>
                          </div>
                          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Learning Resources */}
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-sm font-semibold text-ink">学习资源</h4>
                              <button
                                onClick={() => {
                                  setNewResource({ title: "", url: "", type: "article" });
                                  addResource(skill.id, { title: "新资源", url: "", type: "article" });
                                }}
                                className="text-xs text-blue hover:text-blue/80 font-medium"
                              >
                                + 添加
                              </button>
                            </div>
                            <div className="space-y-2">
                              {resources.map((r) => (
                                <div key={r.id}>
                                  {editingResourceId === r.id ? (
                                    <div className="bg-canvas rounded-lg border border-blue/30 px-3 py-2 space-y-2">
                                      <input
                                        value={editResourceData.title}
                                        onChange={(e) => setEditResourceData({ ...editResourceData, title: e.target.value })}
                                        className="w-full border border-hairline rounded px-2 py-1 text-sm outline-none focus:border-blue"
                                        placeholder="资源名称"
                                      />
                                      <div className="flex items-center gap-2">
                                        <input
                                          value={editResourceData.url}
                                          onChange={(e) => setEditResourceData({ ...editResourceData, url: e.target.value })}
                                          className="flex-1 border border-hairline rounded px-2 py-1 text-sm outline-none focus:border-blue"
                                          placeholder="URL"
                                        />
                                        <select
                                          value={editResourceData.type}
                                          onChange={(e) => setEditResourceData({ ...editResourceData, type: e.target.value })}
                                          className="border border-hairline rounded px-2 py-1 text-sm bg-canvas"
                                        >
                                          <option value="article">文章</option>
                                          <option value="video">视频</option>
                                          <option value="course">课程</option>
                                          <option value="book">书籍</option>
                                        </select>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <label className="flex items-center gap-1.5 text-sm text-slate">
                                          <input
                                            type="checkbox"
                                            checked={editResourceData.completed}
                                            onChange={(e) => setEditResourceData({ ...editResourceData, completed: e.target.checked })}
                                          />
                                          已完成
                                        </label>
                                        <div className="flex gap-2">
                                          <button
                                            onClick={() => {
                                              updateResource(skill.id, r.id, editResourceData);
                                              setEditingResourceId(null);
                                            }}
                                            className="text-xs text-green font-medium"
                                          >
                                            保存
                                          </button>
                                          <button
                                            onClick={() => setEditingResourceId(null)}
                                            className="text-xs text-slate"
                                          >
                                            取消
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-between bg-canvas rounded-lg border border-hairline px-3 py-2 group">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <button
                                          onClick={() => updateResource(skill.id, r.id, { completed: !r.completed })}
                                          className={`text-xs shrink-0 ${r.completed ? "text-green" : "text-muted"}`}
                                        >
                                          {r.completed ? "✓" : "○"}
                                        </button>
                                        {r.url ? (
                                          <a
                                            href={r.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className={`text-sm truncate hover:underline ${
                                              r.completed ? "text-muted line-through" : "text-blue"
                                            }`}
                                          >
                                            {r.title}
                                          </a>
                                        ) : (
                                          <span className={`text-sm truncate ${r.completed ? "text-muted line-through" : "text-charcoal"}`}>
                                            {r.title}
                                          </span>
                                        )}
                                        <span className="text-xs text-muted bg-surface rounded-full px-1.5 py-0.5 shrink-0">{r.type}</span>
                                      </div>
                                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        <button
                                          onClick={() => {
                                            setEditingResourceId(r.id);
                                            setEditResourceData({ title: r.title, url: r.url, type: r.type, completed: r.completed });
                                          }}
                                          className="text-xs text-slate hover:text-blue"
                                        >
                                          编辑
                                        </button>
                                        <button
                                          onClick={() => setDeleteResourceTarget({ skillId: skill.id, id: r.id, title: r.title })}
                                          className="text-xs text-red/60 hover:text-red"
                                        >
                                          删除
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                              {resources.length === 0 && (
                                <p className="text-sm text-muted">暂无学习资源，点击"+ 添加"创建</p>
                              )}
                            </div>
                          </div>

                          {/* Interview Questions */}
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-sm font-semibold text-ink">面试题</h4>
                              <button
                                onClick={() => {
                                  setNewQuestion({ question: "", answer: "", difficulty: "medium" });
                                  addQuestion(skill.id, { question: "新面试题", answer: "", difficulty: "medium" });
                                }}
                                className="text-xs text-blue hover:text-blue/80 font-medium"
                              >
                                + 添加
                              </button>
                            </div>
                            <div className="space-y-2">
                              {questions.map((q) => (
                                <div key={q.id}>
                                  {editingQuestionId === q.id ? (
                                    <div className="bg-canvas rounded-lg border border-blue/30 px-3 py-2 space-y-2">
                                      <input
                                        value={editQuestionData.question}
                                        onChange={(e) => setEditQuestionData({ ...editQuestionData, question: e.target.value })}
                                        className="w-full border border-hairline rounded px-2 py-1 text-sm outline-none focus:border-blue"
                                        placeholder="面试题"
                                      />
                                      <textarea
                                        value={editQuestionData.answer}
                                        onChange={(e) => setEditQuestionData({ ...editQuestionData, answer: e.target.value })}
                                        className="w-full border border-hairline rounded px-2 py-1 text-sm outline-none focus:border-blue resize-none"
                                        rows={2}
                                        placeholder="答案"
                                      />
                                      <div className="flex items-center justify-between">
                                        <select
                                          value={editQuestionData.difficulty}
                                          onChange={(e) => setEditQuestionData({ ...editQuestionData, difficulty: e.target.value })}
                                          className="border border-hairline rounded px-2 py-1 text-sm bg-canvas"
                                        >
                                          <option value="easy">简单</option>
                                          <option value="medium">中等</option>
                                          <option value="hard">困难</option>
                                        </select>
                                        <div className="flex gap-2">
                                          <button
                                            onClick={() => {
                                              updateQuestion(skill.id, q.id, editQuestionData);
                                              setEditingQuestionId(null);
                                            }}
                                            className="text-xs text-green font-medium"
                                          >
                                            保存
                                          </button>
                                          <button
                                            onClick={() => setEditingQuestionId(null)}
                                            className="text-xs text-slate"
                                          >
                                            取消
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <details className="bg-canvas rounded-lg border border-hairline group">
                                      <summary className="px-3 py-2 text-sm text-charcoal cursor-pointer flex items-center gap-2">
                                        <span className={`text-xs rounded-full px-1.5 py-0.5 font-medium ${
                                          q.difficulty === "easy" ? "bg-green/10 text-green" :
                                          q.difficulty === "hard" ? "bg-red/10 text-red" :
                                          "bg-amber/10 text-amber"
                                        }`}>
                                          {q.difficulty === "easy" ? "简单" : q.difficulty === "hard" ? "困难" : "中等"}
                                        </span>
                                        <span className="flex-1 min-w-0 truncate">{q.question}</span>
                                        <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => e.preventDefault()}>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setEditingQuestionId(q.id);
                                              setEditQuestionData({ question: q.question, answer: q.answer, difficulty: q.difficulty });
                                            }}
                                            className="text-xs text-slate hover:text-blue"
                                          >
                                            编辑
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setDeleteQuestionTarget({ skillId: skill.id, id: q.id, question: q.question });
                                            }}
                                            className="text-xs text-red/60 hover:text-red"
                                          >
                                            删除
                                          </button>
                                        </span>
                                      </summary>
                                      <div className="px-3 pb-3 pt-1 text-sm text-slate border-t border-hairline mt-1">
                                        {q.answer || "暂无答案"}
                                      </div>
                                    </details>
                                  )}
                                </div>
                              ))}
                              {questions.length === 0 && (
                                <p className="text-sm text-muted">暂无面试题，点击"+ 添加"创建</p>
                              )}
                            </div>
                          </div>

                          {/* Quiz Platform Questions */}
                          {quizQs[skill.id] && quizQs[skill.id].length > 0 && (
                            <div className="md:col-span-2">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="text-sm font-semibold text-ink">AI 生成题目</h4>
                                <div className="flex items-center gap-3">
                                  <button
                                    onClick={() =>
                                      exportQuestionsToPDF({
                                        title: `${skill.name} · 复习题`,
                                        subtitle: `共 ${quizQs[skill.id].length} 题`,
                                        questions: quizQs[skill.id],
                                        showAnswers: true,
                                      })
                                    }
                                    className="text-xs text-blue hover:text-blue/80 font-medium"
                                  >
                                    导出 PDF
                                  </button>
                                  <button
                                    onClick={() => navigate("/quiz")}
                                    className="text-xs text-blue hover:text-blue/80 font-medium"
                                  >
                                    去刷题 →
                                  </button>
                                </div>
                              </div>
                              <div className="space-y-2">
                                {quizQs[skill.id].slice(0, 5).map((q) => (
                                  <div key={q.id} className="flex items-center gap-2 bg-canvas rounded-lg border border-hairline px-3 py-2">
                                    <span className="text-xs text-muted bg-surface rounded-full px-1.5 py-0.5 shrink-0">
                                      {q.type === "single_choice" ? "单选" : q.type === "multi_choice" ? "多选" : "问答"}
                                    </span>
                                    <span className="text-sm text-charcoal truncate">{q.question_text}</span>
                                  </div>
                                ))}
                                {quizQs[skill.id].length > 5 && (
                                  <p className="text-xs text-muted text-center">...还有 {quizQs[skill.id].length - 5} 题</p>
                                )}
                              </div>
                            </div>
                          )}

                          {/* AI Learning Plan */}
                          <div className="md:col-span-2">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-sm font-semibold text-ink">AI 学习计划</h4>
                              {learningPlan && (
                                <button
                                  onClick={() => handleExportMarkdown(skill.id, skill.name)}
                                  className="flex items-center gap-1 text-xs text-blue hover:text-blue/80 font-medium transition-colors"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                  导出 Markdown
                                </button>
                              )}
                            </div>
                            {learningPlan ? (
                              <div className="space-y-4">
                                {hasUnavailableField(learningPlan) && (
                                  <AIErrorBox
                                    message="AI 服务暂不可用，请稍后再试"
                                    onRetry={() => !loadingPlan && generateLearningPlan(skill.id, learningPlanLevel[skill.id] ?? "熟悉", priorUnderstanding[skill.id] ?? "")}
                                    retryLabel="重新生成计划"
                                  />
                                )}
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted bg-surface rounded-full px-2 py-0.5">
                                    要求程度：{learningPlan.required_level}
                                  </span>
                                </div>
                                {/* Steps */}
                                <div className="space-y-3">
                                  {learningPlan.steps.filter((s) => !isUnavailable(s.description ?? "")).map((step) => {
                                    const score = getStepScore(skill.id, step.step);
                                    const ringColor = score >= 70 ? "#059669" : score >= 40 ? "#1456f0" : "#d97706";
                                    const ringRadius = 11;
                                    const ringCircum = 2 * Math.PI * ringRadius;
                                    return (
                                      <div
                                        key={step.step}
                                        className={`rounded-lg border p-3.5 transition-all cursor-pointer group ${
                                          score >= 80
                                            ? "bg-canvas border-green/20"
                                            : score >= 40
                                            ? "bg-canvas border-hairline hover:border-blue/30"
                                            : "bg-canvas border-hairline hover:border-blue/30"
                                        }`}
                                        onClick={() => {
                                          if (!learningPanel?.open) {
                                            setLearningPanel({
                                              open: true,
                                              skillId: skill.id,
                                              skillName: skill.name,
                                              step: {
                                                title: step.title,
                                                description: step.description,
                                                topics: step.topics || [],
                                                stepNumber: step.step,
                                                estimated_hours: step.estimated_hours,
                                                type: step.type,
                                              },
                                              requiredLevel: learningPlan.required_level,
                                            });
                                          }
                                        }}
                                      >
                                        <div className="flex items-start gap-3">
                                          {/* ── Circular progress ring ── */}
                                          <div className="relative shrink-0 mt-0.5">
                                            <svg width="30" height="30" className="transform -rotate-90">
                                              <circle cx="15" cy="15" r={ringRadius} fill="none" stroke="#e2e8f0" strokeWidth="2.5" />
                                              <circle
                                                cx="15" cy="15" r={ringRadius}
                                                fill="none"
                                                stroke={ringColor}
                                                strokeWidth="2.5"
                                                strokeLinecap="round"
                                                strokeDasharray={ringCircum}
                                                strokeDashoffset={ringCircum * (1 - score / 100)}
                                                className="transition-all duration-700 ease-out"
                                              />
                                            </svg>
                                            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold"
                                              style={{ color: score >= 80 ? '#059669' : score >= 40 ? '#1456f0' : '#94a3b8' }}
                                            >
                                              {step.step}
                                            </span>
                                          </div>

                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                              <p className={`text-sm font-semibold transition-colors ${
                                                score >= 80 ? "text-charcoal" : "text-charcoal"
                                              }`}>
                                                {step.title}
                                              </p>
                                              {score > 0 && (
                                                <span
                                                  className="text-xs font-bold ml-auto tabular-nums"
                                                  style={{ color: ringColor }}
                                                >
                                                  {Math.round(score)}%
                                                </span>
                                              )}
                                            </div>
                                            <p className="text-xs text-slate mt-1 leading-relaxed">
                                              {step.description}
                                            </p>
                                            {(() => {
                                              // 知识点标签来自单元阐述生成的关键词缓存（explain_topics__ 键，cacheSet 包装为 {value, cached_at}），生成后才展示
                                              let kws: string[] = [];
                                              try {
                                                const raw = localStorage.getItem(`explain_topics__${skill.id}__step${step.step}`);
                                                if (raw) {
                                                  const parsed = JSON.parse(raw);
                                                  const arr = parsed && typeof parsed === "object" && "value" in parsed ? parsed.value : parsed;
                                                  if (Array.isArray(arr)) kws = arr;
                                                }
                                              } catch { /* ignore */ }
                                              if (kws.length === 0) return null;
                                              return (
                                                <div className="flex flex-wrap gap-1.5 mt-2">
                                                  {kws.map((t, ti) => (
                                                    <span
                                                      key={ti}
                                                      className={`text-xs rounded-full px-2.5 py-0.5 ${
                                                        score >= 80
                                                          ? "bg-surface/50 text-muted/70"
                                                          : "bg-surface text-slate"
                                                      }`}
                                                    >
                                                      {t}
                                                    </span>
                                                  ))}
                                                </div>
                                              );
                                            })()}
                                            {step.estimated_hours > 0 && (
                                              <p className="text-xs text-muted mt-1.5 flex items-center gap-1">
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                预估 {step.estimated_hours} 小时
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                        {/* ── Bottom bar: progress + complete button ── */}
                                        <div className="mt-2.5 pt-2 border-t border-hairline/50 flex items-center gap-3">
                                          {score > 0 && (
                                            <div className="flex-1 flex items-center gap-2 min-w-0">
                                              <div className="flex-1 h-1 bg-surface rounded-full overflow-hidden">
                                                <div
                                                  className="h-full rounded-full transition-all duration-500"
                                                  style={{
                                                    width: `${Math.min(100, score)}%`,
                                                    backgroundColor: ringColor,
                                                  }}
                                                />
                                              </div>
                                              <span className="text-[10px] text-muted/60 shrink-0">
                                                {score < 30 ? "开始记笔记" : score < 60 ? "继续完善" : score < 80 ? "再加把劲" : "接近完成"}
                                              </span>
                                            </div>
                                          )}
                                          {isStepCompleted(skill.id, step.step) ? (
                                            <button
                                              onClick={(e) => { e.stopPropagation(); toggleStepComplete(skill.id, step.step); }}
                                              className="shrink-0 text-xs font-medium text-green hover:text-green/80 transition-colors flex items-center gap-1"
                                            >
                                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                              </svg>
                                              已完成
                                            </button>
                                          ) : (
                                            <button
                                              onClick={(e) => { e.stopPropagation(); toggleStepComplete(skill.id, step.step); }}
                                              className="shrink-0 text-xs font-medium text-slate hover:text-blue transition-colors flex items-center gap-1"
                                            >
                                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                              </svg>
                                              标记完成
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                                {/* Milestones */}
                                {learningPlan.milestones.length > 0 && (
                                  <div>
                                    <p className="text-xs font-medium text-muted mb-2">学习目标</p>
                                    <ul className="space-y-1">
                                      {learningPlan.milestones.map((m, mi) => (
                                        <li key={mi} className="flex items-start gap-2 text-sm text-slate">
                                          <span className="text-green mt-0.5 shrink-0">✓</span>
                                          <span>{m}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="bg-surface/50 rounded-lg border border-hairline p-4 space-y-3">
                                <p className="text-sm text-muted">根据你的掌握程度和现状，生成个性化学习计划</p>
                                {error && (
                                  <p className="text-xs text-red bg-red/5 border border-red/20 rounded-lg px-3 py-2">{error}</p>
                                )}
                                <div>
                                  <label className="text-xs text-slate font-medium block mb-1.5">你现在会多少？填得越具体，计划越贴合你 <span className="text-muted/70">(选填)</span></label>
                                  <textarea
                                    value={priorUnderstanding[skill.id] ?? ""}
                                    onChange={(e) => setPriorUnderstanding((p) => ({ ...p, [skill.id]: e.target.value }))}
                                    placeholder="例如：React 会写组件但没碰过 Hooks / 只听过 Vue 从没写过 / 平时写业务，性能优化是空白…"
                                    rows={2}
                                    className="w-full border border-hairline rounded-lg px-3 py-2 text-sm bg-canvas outline-none focus:border-blue resize-none placeholder:text-muted/50"
                                  />
                                </div>
                                <div className="flex items-center justify-center gap-2">
                                  <select
                                    value={learningPlanLevel[skill.id] ?? "熟悉"}
                                    onChange={(e) => setLearningPlanLevel((l) => ({ ...l, [skill.id]: e.target.value }))}
                                    className="border border-hairline rounded-lg px-3 py-1.5 text-sm bg-canvas outline-none focus:border-blue"
                                  >
                                    <option value="了解">了解</option>
                                    <option value="熟悉">熟悉</option>
                                    <option value="精通">精通</option>
                                  </select>
                                  <button
                                    onClick={() => generateLearningPlan(skill.id, learningPlanLevel[skill.id] ?? "熟悉", priorUnderstanding[skill.id] ?? "")}
                                    disabled={loadingPlan}
                                    className="bg-blue text-white rounded-full px-4 py-1.5 text-sm font-medium hover:bg-blue/90 active:scale-95 disabled:opacity-50 transition-all"
                                  >
                                    {loadingPlan ? "后台生成中…" : "生成学习计划"}
                                  </button>
                                </div>
                                {loadingPlan && (
                                  <p className="text-xs text-muted text-center mt-1">生成需 1-3 分钟，可收起页面后台等待，完成后自动显示</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Learning Panel (right drawer) */}
      {learningPanel && (
        <LearningPanel
          open={learningPanel.open}
          skillName={learningPanel.skillName}
          skillId={learningPanel.skillId}
          step={learningPanel.step}
          requiredLevel={learningPanel.requiredLevel}
          stepType={learningPanel.step.type}
          onClose={() => {
            // Cornell 笔记完成度只在前端本地算分展示，不落库。
            // 停掉的 /proficiency-from-steps 曾把笔记字数启发式当成自评写进 skill.proficiency。
            const sid = learningPanel.skillId;
            const plan = useSkillStore.getState().learningPlan;
            if (plan && plan.steps.length > 0) {
              const result = calculateAllStepScores(sid, plan.steps);
              const scoresMap: Record<number, number> = {};
              // 手动标记完成的步骤覆盖为满分
              result.stepScores.forEach((s) => { scoresMap[s.step] = getStepScore(sid, s.step); });
              setStepScores((prev) => ({ ...prev, [sid]: scoresMap }));
            }
            // 只关动画不卸载：后台生成中的讲解/知识点请求继续，重开面板时加载状态保留
            setLearningPanel((p) => (p ? { ...p, open: false } : p));
          }}
          onAddResource={(title, url) => handleAddResourceFromTopic(learningPanel.skillId, title, url)}
        />
      )}

      {/* Edit modal */}
      {editingSkill && (
        <EditSkillModal
          skill={editingSkill}
          categories={allCategories.filter((c) => c !== "全部")}
          onClose={() => setEditingSkill(null)}
          onSave={(data) => handleEdit(editingSkill, data)}
        />
      )}

      {/* Stats */}
      {!loading && skills.length > 0 && (
        <div className="mt-6 flex items-center gap-4 text-xs text-muted flex-wrap">
          <span>总计 {skills.length} 项技能</span>
          {allCategories.filter((c) => c !== "全部").map((cat) => {
            const count = skills.filter((s) => s.category === cat).length;
            return count > 0 ? <span key={cat}>{cat}: {count}</span> : null;
          })}
        </div>
      )}

      {/* Delete confirmations */}
      <ConfirmDialog
        open={deleteSkillTarget !== null}
        title="删除技能"
        message="删除后无法恢复，确定要删除这项技能吗？"
        confirmLabel="确认删除"
        onConfirm={async () => {
          if (deleteSkillTarget !== null) {
            await deleteSkill(deleteSkillTarget);
            setDeleteSkillTarget(null);
          }
        }}
        onCancel={() => setDeleteSkillTarget(null)}
      />
      <ConfirmDialog
        open={deleteResourceTarget !== null}
        title="删除学习资源"
        message={`确定要删除「${deleteResourceTarget?.title || ""}」吗？`}
        confirmLabel="确认删除"
        onConfirm={async () => {
          if (deleteResourceTarget) {
            await deleteResource(deleteResourceTarget.skillId, deleteResourceTarget.id);
            setDeleteResourceTarget(null);
          }
        }}
        onCancel={() => setDeleteResourceTarget(null)}
      />
      <ConfirmDialog
        open={deleteQuestionTarget !== null}
        title="删除面试题"
        message={`确定要删除「${deleteQuestionTarget?.question?.slice(0, 50) || ""}」吗？`}
        confirmLabel="确认删除"
        onConfirm={async () => {
          if (deleteQuestionTarget) {
            await deleteQuestion(deleteQuestionTarget.skillId, deleteQuestionTarget.id);
            setDeleteQuestionTarget(null);
          }
        }}
        onCancel={() => setDeleteQuestionTarget(null)}
      />
    </div>
  );
}
