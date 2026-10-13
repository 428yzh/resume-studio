import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useSkillStore, type LearningPlan } from "@core/stores/skillStore";
import ScoreMap, { TIER_CLS, type ScoreMapMode } from "@web/components/ScoreMap";
import SkillStatusChip from "@web/components/SkillStatusChip";
import LearningPanel from "@web/components/LearningPanel";
import LoadingDots from "@web/components/LoadingDots";
import ElapsedTime from "@web/components/ElapsedTime";
import { findNodes, skillTotal, tierOf, type GraphNode } from "@core/models/skill";

/* 技能工作台（设计 4.2，结论 24 的第二层）：页面主体是分数地图，右侧是学习单元列表。
   单元学习面板保持在页内（结论 25），不拆独立路由。
   A5：**没有「重新生成图谱」按钮** —— 节点 id 是分数落点和笔记归属的锚，重生成会把它们全冲掉。 */

type Step = LearningPlan["steps"][number];

/** 单元分 = 该单元覆盖的顶层节点分的平均（设计 4.2 的算例：单元 3 = (90+15)/2 = 53） */
function unitTops(nodes: GraphNode[] | null, step: Step): GraphNode[] {
  return nodes && step.node_ids?.length ? findNodes(nodes, step.node_ids) : [];
}

export default function SkillWorkbench() {
  const { id } = useParams();
  const skillId = Number(id);
  const navigate = useNavigate();
  const {
    skills, fetchSkills, loading,
    knowledgeGraph, graphSkillId, fetchGraph, generateGraph, loadingGraph,
    learningPlan, learningPlanSkillId, fetchLearningPlan, generateLearningPlan, loadingPlan, planStartedAt,
    addResource,
  } = useSkillStore();

  const [graphView, setGraphView] = useState<ScoreMapMode>("score");
  const [level, setLevel] = useState("熟悉");
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<{
    open: boolean;
    step: { title: string; description: string; topics: string[]; stepNumber: number; estimated_hours: number; type?: string; nodeIds?: string[] };
  } | null>(null);

  useEffect(() => {
    if (!skills.length) void fetchSkills();
  }, []);

  useEffect(() => {
    if (!Number.isFinite(skillId)) return;
    void fetchGraph(skillId);
    void fetchLearningPlan(skillId);
  }, [skillId]);

  const skill = skills.find((s) => s.id === skillId);
  const graph = graphSkillId === skillId ? knowledgeGraph : null;
  const graphLoaded = graphSkillId === skillId;
  const plan = learningPlanSkillId === skillId ? learningPlan : null;
  const summary = skill?.graph_summary ?? null;

  if (!skill) {
    return (
      <div className="py-20 text-center">
        {loading ? <LoadingDots /> : (
          <>
            <p className="text-slate">技能不存在</p>
            <Link to="/skills" className="text-sm text-blue hover:underline">返回技能库</Link>
          </>
        )}
      </div>
    );
  }

  const openUnit = (step: Step) => {
    setPanel({
      open: true,
      step: {
        title: step.title,
        description: step.description,
        topics: step.topics || [],
        stepNumber: step.step,
        estimated_hours: step.estimated_hours,
        type: step.type,
        nodeIds: step.node_ids,
      },
    });
  };

  const nextUnit = plan?.steps.find((st) => unitTops(graph?.nodes ?? null, st).every((n) => graph?.scores?.[n.id]?.score == null)) ?? plan?.steps[0];
  const selectedNode = graph && selected ? findNodes(graph.nodes, [selected])[0] : null;

  const metrics = summary ? [
    { label: "图谱覆盖率", value: `${summary.total ? Math.round((summary.tested / summary.total) * 100) : 0}%`, hint: `${summary.tested}/${summary.total} 个知识点直接测过` },
    { label: "知识点", value: `${summary.total}`, hint: `个节点 · 根下 ${summary.depth} 层` },
    { label: "学习单元", value: `${summary.units}`, hint: "个 · 即学习步骤" },
    { label: "最低分", value: summary.lowest ? `${summary.lowest.score}` : "—", hint: summary.lowest?.title ?? "还没有块被测过" },
  ] : [];

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <div className="text-xs">
            <Link to="/skills" className="text-blue hover:underline">技能库</Link>
            <span className="text-muted"> / {skill.name}</span>
          </div>
          <h2 className="mt-1.5 flex items-center gap-2 text-2xl font-bold text-ink">
            {skill.name}
            <SkillStatusChip summary={summary} />
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/feynman")}
            className="bg-transparent text-ink border border-hairline rounded-full px-4 py-2 text-sm font-medium hover:bg-surface transition-all active:scale-95"
          >
            费曼讲一讲
          </button>
          <button
            onClick={() => navigate(`/quiz?skill=${skill.id}`)}
            className="bg-transparent text-ink border border-hairline rounded-full px-4 py-2 text-sm font-medium hover:bg-surface transition-all active:scale-95"
          >
            去刷题
          </button>
          {plan && (
            <button
              onClick={() => nextUnit && openUnit(nextUnit)}
              className="bg-blue text-white rounded-full px-5 py-2 text-sm font-semibold hover:bg-blue/90 transition-all active:scale-95"
            >
              继续下一个单元
            </button>
          )}
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {metrics.map((m) => (
            <div key={m.label} className="bg-canvas rounded-xl border border-hairline px-4 py-3">
              <div className="text-[11px] text-muted">{m.label}</div>
              <div className="text-xl font-bold text-ink tabular-nums mt-0.5">{m.value}</div>
              <div className="text-[11px] text-slate truncate" title={m.hint}>{m.hint}</div>
            </div>
          ))}
        </div>
      )}

      {!graphLoaded ? (
        <div className="bg-canvas rounded-xl border border-hairline p-10 text-center"><LoadingDots /></div>
      ) : !graph ? (
        <div className="bg-canvas rounded-xl border border-hairline p-10 text-center">
          <p className="text-sm text-slate mb-3">这个技能还没有知识图谱。图谱是分数地图和学习单元的底子 —— AI 按技能备注生成一次。</p>
          <button
            onClick={() => generateGraph(skill.id)}
            disabled={loadingGraph}
            className="bg-blue text-white rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loadingGraph ? "生成中…" : "生成图谱"}
          </button>
          {loadingGraph && <p className="text-xs text-muted mt-2">需十几秒，生成完自动展开</p>}
        </div>
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
          {/* 左：分数地图 / 覆盖率 */}
          <div className="bg-canvas rounded-xl border border-hairline p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="font-semibold text-ink">知识图谱 / 分数地图</h3>
                <p className="text-xs text-muted mt-0.5">节点底色 = 分数档 · 点节点看这一分怎么算出来的</p>
              </div>
              <div className="bg-surface rounded-full p-1 flex">
                {(["score", "coverage"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setGraphView(v)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      graphView === v ? "bg-canvas shadow-sm text-ink" : "text-slate"
                    }`}
                  >
                    {v === "score" ? "分数" : "覆盖率"}
                  </button>
                ))}
              </div>
            </div>
            <ScoreMap
              nodes={graph.nodes}
              scores={graph.scores ?? {}}
              label={skill.name}
              mode={graphView}
              selected={selected}
              onSelect={setSelected}
            />
          </div>

          {/* 右：学习单元 + 分数来源 */}
          <div className="flex flex-col gap-4">
            <div className="bg-canvas rounded-xl border border-hairline p-5">
              <h3 className="font-semibold text-ink">学习单元列表</h3>
              <p className="text-xs text-muted mt-0.5">图谱切分出的步骤，一个单元 = 图谱的一块。</p>
              {plan ? (
                <div className="mt-3 space-y-1.5">
                  {plan.steps.map((st) => {
                    const tops = unitTops(graph.nodes, st);
                    const score = skillTotal(tops, graph.scores ?? {});
                    const tested = tops.filter((n) => graph.scores?.[n.id]?.score != null).length;
                    return (
                      <div key={st.step} className="flex items-center gap-2 rounded-lg border border-hairline px-3 py-2.5 hover:border-blue/30 transition-colors">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-charcoal truncate">单元 {st.step} · {st.title}</div>
                          <div className="text-[11px] text-muted truncate">
                            {tops.length
                              ? `覆盖「${tops.map((t) => t.title).join(" + ")}」子树 · ${tested}/${tops.length} 已测`
                              : "未挂图谱块（老计划）"}
                          </div>
                        </div>
                        <span className={`shrink-0 text-xs font-bold rounded-full border px-2 py-0.5 tabular-nums ${TIER_CLS[tierOf(score)].chip} ${TIER_CLS[tierOf(score)].pill}`}>
                          {score ?? "未测"}
                        </span>
                        <button
                          onClick={() => openUnit(st)}
                          className="shrink-0 bg-surface text-slate rounded-full px-3 py-1 text-xs font-semibold hover:bg-blue-light hover:text-blue transition-colors"
                        >
                          {score == null ? "开始" : "继续"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-3">
                  <p className="text-xs text-slate mb-2">还没切分学习单元 —— 按目标掌握程度，AI 把图谱切成一步步的单元。</p>
                  <div className="flex items-center gap-2">
                    <select
                      value={level}
                      onChange={(e) => setLevel(e.target.value)}
                      className="border border-hairline rounded-lg px-3 py-1.5 text-sm bg-canvas outline-none focus:border-blue"
                    >
                      <option value="了解">了解</option>
                      <option value="熟悉">熟悉</option>
                      <option value="精通">精通</option>
                    </select>
                    <button
                      onClick={() => generateLearningPlan(skill.id, level)}
                      disabled={loadingPlan}
                      className="bg-blue text-white rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
                    >
                      {loadingPlan ? "生成中…" : "生成学习单元"}
                    </button>
                  </div>
                  {loadingPlan && <p className="text-[11px] text-muted mt-1.5">生成 + AI 自检通常需 1-3 分钟 · <ElapsedTime startedAt={planStartedAt} /> · 可切走后台等待。</p>}
                </div>
              )}
            </div>

            {/* 分数来源：点的那个分怎么来的。没有作答时间戳，只追到「几题」这一层 */}
            <div className="bg-surface rounded-xl border border-hairline p-4 text-xs">
              {selectedNode && graph.scores?.[selectedNode.id] ? (
                <>
                  <div className="font-semibold text-slate">分数来源 · 「{selectedNode.title}」= {graph.scores[selectedNode.id].score ?? "未测"}</div>
                  {(() => {
                    const kidScored = selectedNode.children.filter((k) => graph.scores?.[k.id]?.score != null);
                    if (kidScored.length) {
                      return (
                        <>
                          <div className="text-muted mt-1.5">
                            （{kidScored.map((k) => `${k.title} ${graph.scores![k.id].score}`).join(" + ")}）/ {kidScored.length} = {graph.scores![selectedNode.id].score}
                          </div>
                          <div className="text-muted mt-1">{selectedNode.children.length - kidScored.length} 个子节点未测，不摊进平均。</div>
                        </>
                      );
                    }
                    return (
                      <div className="text-muted mt-1.5">
                        {graph.scores![selectedNode.id].own
                          ? `这块是直接作答算出来的：${graph.scores![selectedNode.id].own} 题（含子树共 ${graph.scores![selectedNode.id].answered} 题）。`
                          : "这块还没被直接测过 —— 上面的分是子节点算上来的。"}
                      </div>
                    );
                  })()}
                </>
              ) : (
                <>
                  <div className="font-semibold text-slate">分数来源</div>
                  <p className="text-muted mt-1.5">点图上任一节点，这里显示这个分是怎么算出来的 —— 分数永远能追到某一次作答。</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {panel && (
        <LearningPanel
          open={panel.open}
          skillName={skill.name}
          skillId={skill.id}
          step={panel.step}
          requiredLevel={plan?.required_level ?? "熟悉"}
          stepType={panel.step.type}
          block={graph && panel.step.nodeIds?.length ? findNodes(graph.nodes, panel.step.nodeIds) : []}
          // 只关动画不卸载：后台生成中的讲解请求继续（跟技能库同一个模式）
          onClose={() => setPanel((p) => (p ? { ...p, open: false } : p))}
          onAddResource={(title, url) => addResource(skill.id, { title, url: url || "", type: "article" })}
        />
      )}
    </div>
  );
}
