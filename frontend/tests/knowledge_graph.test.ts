import { describe, it, expect } from "vitest";
import { layout } from "../web/components/KnowledgeGraph";
import type { GraphNode } from "../core/models/skill";

/* 网状图的位置全靠角度算，算歪了不会报错、只会画到画布外面 —— 用几何断言钉住 */
const VIEW = { w: 760, h: 480 };
const n = (id: string, ...kids: GraphNode[]): GraphNode => ({ id, title: `节点${id}`, children: kids });

describe("TC-GRAPH-VIZ-001: 径向布局", () => {
  const tree = [
    n("1", n("1.1"), n("1.2"), n("1.3")),
    n("2", n("2.1"), n("2.2")),
    n("3", n("3.1")),
    n("4"),
    n("5", n("5.1"), n("5.2")),
  ];

  it("每个节点都被摆上，每个节点一根线连回父节点", () => {
    const { placed, edges } = layout(tree);
    expect(placed.map((p) => p.node.id)).toContain("2.2");
    expect(placed).toHaveLength(5 + 8); // 根（技能本身）画在圆心，不在这里面
    expect(edges).toHaveLength(placed.length); // 5 根线从圆心出去 + 8 根连子节点
    expect(edges.filter((e) => e.depth === 1)).toHaveLength(5);
  });

  it("全落在画布内（点数最多的那棵树也不越界）", () => {
    const { placed } = layout(tree);
    for (const p of placed) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(VIEW.w);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(VIEW.h);
    }
  });

  it("空图谱不炸（技能刚建、图谱还是空数组时）", () => {
    expect(layout([])).toEqual({ placed: [], edges: [] });
  });
});
