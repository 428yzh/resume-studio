import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFeynmanStore } from "@core/stores/feynmanStore";
import { api } from "@core/api/client";
import type { Skill } from "@core/models/skill";
import { LEVEL_LABELS } from "@core/models/feynman";
import LevelBadge from "@web/components/LevelBadge";
import { ArrowRight, Trash, Check, X, GraduationCap } from "@phosphor-icons/react";

export default function FeynmanRoomList() {
  const navigate = useNavigate();
  const { topics, loading, fetchTopics, createTopic, deleteTopic } = useFeynmanStore();

  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState<number | "">("");
  const [manualName, setManualName] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    fetchTopics();
    api.get<Skill[]>("/api/skills").then(setSkills).catch(() => {});
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const displayName = manualName || (selectedSkillId ? skills.find((s) => s.id === selectedSkillId)?.name : "") || "";

  const handleCreate = async () => {
    if (!displayName.trim()) return;
    setCreating(true);
    try {
      const topic = await createTopic({
        skill_id: selectedSkillId ? (selectedSkillId as number) : null,
        name: displayName.trim(),
      });
      navigate(`/feynman/${topic.id}`);
    } catch {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    setConfirmDelete(null);
    try {
      await deleteTopic(id);
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  };

  const levelDistribution = useMemo(() => {
    const counts = new Map<number, number>();
    for (const t of topics) counts.set(t.level, (counts.get(t.level) || 0) + 1);
    return counts;
  }, [topics]);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 animate-fade-in">
        <h2 className="text-2xl font-bold text-ink mb-1 flex items-center gap-2">
          <GraduationCap size={24} className="text-blue" />
          费曼教学 · 数字学生
        </h2>
        <p className="text-sm text-slate">你给 AI 讲课，它批判式听讲——不懂就追问，懂了就重构，学完出一份 PPT</p>
      </div>

      {/* 五级模型解释 */}
      <div
        className="bg-canvas rounded-xl border border-hairline p-5 mb-6"
        style={{ animation: `fade-in-up 0.4s ease-out ${mounted ? "0.1s" : "0s"} both` }}
      >
        <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">五级理解状态机</div>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((lv) => (
            <div key={lv} className="flex items-center gap-2">
              <LevelBadge level={lv} />
              {lv < 5 && <span className="text-muted text-xs">→</span>}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted mt-2.5">
          等级单调上升，L5 必须先到过 L4。L3 广度追问 ×2、L5 深度追问 ×2，问完即彻底理解。
        </p>
      </div>

      {/* 新建房间 */}
      <div
        className="bg-canvas rounded-xl border border-hairline p-6 mb-8"
        style={{ animation: `fade-in-up 0.4s ease-out ${mounted ? "0.18s" : "0s"} both` }}
      >
        <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">从技能库选一个主题开讲</div>

        {/* 技能选择 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4 max-h-52 overflow-y-auto pr-1">
          {skills.map((s) => {
            const active = selectedSkillId === s.id && !manualName;
            return (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedSkillId(s.id);
                  setManualName("");
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all duration-200 active:scale-[0.98] ${
                  active ? "border-blue bg-blue/5" : "border-hairline hover:border-blue/30 hover:bg-surface/50"
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${active ? "border-blue" : "border-hairline"}`}>
                  {active && <div className="w-2 h-2 rounded-full bg-blue" />}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink truncate">{s.name}</div>
                  <div className="text-[11px] text-muted">{s.proficiency === null ? "熟练度未验证" : `自评熟练度 ${s.proficiency}`}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* 手动输入 */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1">
            <input
              className="w-full bg-canvas border border-hairline rounded-lg px-3 py-2 text-sm text-ink placeholder:text-muted outline-none transition-all duration-200 focus:border-blue/50"
              placeholder={skills.length ? "或在技能库里手动输入一个主题…" : "输入要教学的主题…"}
              value={manualName}
              onChange={(e) => {
                setManualName(e.target.value);
                if (e.target.value) setSelectedSkillId("");
              }}
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={!displayName.trim() || creating}
            className="bg-blue text-white rounded-full px-6 py-2.5 text-sm font-semibold transition-all duration-200 hover:bg-blue/90 active:scale-95 disabled:opacity-40 flex items-center gap-1.5 flex-shrink-0"
          >
            {creating ? "创建中…" : "开始教学"}
          </button>
        </div>
      </div>

      {/* 房间列表 */}
      <h3 className="font-semibold text-ink mb-3" style={{ animation: `fade-in 0.3s ease-out ${mounted ? "0.25s" : "0s"} both` }}>
        学习房间
        {topics.length > 0 && (
          <span className="text-xs font-normal text-muted ml-2">
            {topics.length} 个 · 等级分布：
            {[...levelDistribution.entries()]
              .sort((a, b) => a[0] - b[0])
              .map(([lv, cnt]) => `${LEVEL_LABELS[lv]}×${cnt}`)
              .join(" / ")}
          </span>
        )}
      </h3>

      {loading && topics.length === 0 ? (
        <div className="bg-canvas border border-hairline rounded-xl overflow-hidden animate-pulse">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-hairline">
              <div className="h-5 w-16 bg-hairline rounded-full" />
              <div className="flex-1"><div className="h-4 bg-hairline rounded w-40" /><div className="h-3 bg-hairline rounded w-24 mt-1.5" /></div>
            </div>
          ))}
        </div>
      ) : topics.length === 0 ? (
        <div className="bg-canvas rounded-xl border border-hairline p-14 text-center" style={{ animation: `fade-in-up 0.4s ease-out ${mounted ? "0.3s" : "0s"} both` }}>
          <div className="w-14 h-14 rounded-full bg-surface flex items-center justify-center mx-auto mb-4">
            <GraduationCap size={24} className="text-muted" />
          </div>
          <h3 className="text-base font-semibold text-ink mb-1">还没有学习房间</h3>
          <p className="text-sm text-muted">从技能库选一个主题，开始给数字学生讲课</p>
        </div>
      ) : (
        <div className="bg-canvas border border-hairline rounded-xl overflow-hidden" style={{ animation: `fade-in-up 0.4s ease-out ${mounted ? "0.3s" : "0s"} both` }}>
          {topics.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 px-4 py-3.5 border-b border-hairline last:border-b-0 hover:bg-surface/50 transition-all duration-200"
            >
              <LevelBadge level={t.level} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink truncate">{t.name}</div>
                <div className="text-xs text-muted mt-0.5">
                  {t.status === "completed" ? "已完成" : "学习中"}
                  <span className="mx-1">·</span>
                  {t.total_messages} 条消息
                  <span className="mx-1">·</span>
                  广度 {t.breadth_left}/2 · 深度 {t.depth_left}/2
                  {t.weak_points?.length > 0 && (
                    <>
                      <span className="mx-1">·</span>
                      <span className="text-amber">薄弱点 {t.weak_points.length}</span>
                    </>
                  )}
                  {t.has_problems && (
                    <>
                      <span className="mx-1">·</span>
                      <span className="text-amber">有未解决问题</span>
                    </>
                  )}
                  <span className="mx-1">·</span>
                  {new Date(t.created_at).toLocaleDateString("zh-CN")}
                </div>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  onClick={() => navigate(`/feynman/${t.id}`)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate transition-all duration-200 hover:text-blue hover:bg-blue/5 active:scale-90"
                  title={t.status === "completed" ? "查看" : "继续教学"}
                >
                  <ArrowRight size={16} />
                </button>
                {confirmDelete === t.id ? (
                  <>
                    <button
                      onClick={() => handleDelete(t.id)}
                      disabled={deletingId === t.id}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-red transition-all duration-200 hover:bg-red/5 active:scale-90 disabled:opacity-50"
                      title="确认删除"
                    >
                      {deletingId === t.id ? <span className="w-3 h-3 border-2 border-red/30 border-t-red rounded-full animate-spin" /> : <Check size={16} />}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate transition-all duration-200 hover:text-ink hover:bg-surface active:scale-90"
                      title="取消"
                    >
                      <X size={16} />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(t.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-muted transition-all duration-200 hover:text-red hover:bg-red/5 active:scale-90"
                    title="删除"
                  >
                    <Trash size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
