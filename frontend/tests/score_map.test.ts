import { describe, it, expect } from "vitest";
import { skillTotal, statusOf, tierOf } from "../core/models/skill";
import type { GraphNode, GraphSummary, NodeScore } from "../core/models/skill";

/* 分数档的边界和「总分只数有分的块」是整张分数地图的判据，
   错一档界面就把「有缝」画成「基本可用」—— 用户照着它决定学不学 */

describe("TC-SCORE-VIZ-001: tierOf 分档", () => {
  it("五档边界（含端点）", () => {
    expect(tierOf(100)).toBe(4);
    expect(tierOf(75)).toBe(4);   // ≥75 熟练
    expect(tierOf(74)).toBe(3);
    expect(tierOf(50)).toBe(3);   // 50–74 基本可用
    expect(tierOf(49)).toBe(2);
    expect(tierOf(25)).toBe(2);   // 25–49 有缝
    expect(tierOf(24)).toBe(1);
    expect(tierOf(0)).toBe(1);    // <25 缺口；0 是「测过但全错」，不是未测
  });

  it("null / undefined 是未测（第 0 档），不是 0 分", () => {
    expect(tierOf(null)).toBe(0);
    expect(tierOf(undefined)).toBe(0);
  });
});

describe("TC-SCORE-VIZ-002: skillTotal", () => {
  const nodes: GraphNode[] = [
    { id: "1", title: "模型", children: [] },
    { id: "2", title: "工具", children: [] },
    { id: "3", title: "记忆", children: [] },
    { id: "4", title: "输出解析器", children: [] },
  ];
  const row = (score: number | null): NodeScore => ({ score, answered: 1 });

  it("有分的顶层块平均，未测的不摊（不是按 0 算）", () => {
    expect(skillTotal(nodes, { "1": row(80), "2": row(40), "3": row(null), "4": row(null) })).toBe(60);
  });

  it("一块都没测 → null（界面显示未测，不是 0）", () => {
    expect(skillTotal(nodes, {})).toBeNull();
    expect(skillTotal(nodes, { "1": row(null) })).toBeNull();
  });

  it("四块全满分 → 100（「四个子主题学完 = 满分」的落点）", () => {
    const all = Object.fromEntries(nodes.map((n) => [n.id, row(100)]));
    expect(skillTotal(nodes, all)).toBe(100);
  });
});

describe("TC-SCORE-VIZ-003: statusOf 卡片状态（设计 4.1 四态）", () => {
  const sum = (p: Partial<GraphSummary>): GraphSummary =>
    ({ score: null, tested: 0, total: 10, depth: 2, units: 0, lowest: null, ...p });

  it("没图谱 / 空图谱 → none", () => {
    expect(statusOf(null)).toBe("none");
    expect(statusOf(undefined)).toBe("none");
    expect(statusOf(sum({ total: 0 }))).toBe("none");
  });

  it("覆盖不到一半 → untested（样本太少，先别提分数）", () => {
    expect(statusOf(sum({ tested: 4, total: 10 }))).toBe("untested");
  });

  it("过半覆盖 + 最低块 <25 → gap；最低块 ≥25 → ok", () => {
    expect(statusOf(sum({ tested: 6, total: 10, lowest: { id: "1", title: "x", score: 24 } }))).toBe("gap");
    expect(statusOf(sum({ tested: 6, total: 10, lowest: { id: "1", title: "x", score: 25 } }))).toBe("ok");
  });

  it("覆盖够、但一块都没测出分（全 null）→ ok，不误报缺口", () => {
    expect(statusOf(sum({ tested: 6, total: 10, lowest: null }))).toBe("ok");
  });
});
