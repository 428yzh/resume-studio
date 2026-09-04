import { describe, it, expect } from "vitest";
import { applyHighlights, contentHighlightKey } from "../core/services/highlights";
import type { Highlight } from "../core/services/highlights";

const hl = (text: string, id = text): Highlight => ({ id, text, note: "", createdAt: 0 });

describe("TC-HL-001: applyHighlights 基础匹配", () => {
  it("无高亮时返回整段普通文本", () => {
    expect(applyHighlights("一段普通文本", [])).toEqual([{ type: "text", text: "一段普通文本" }]);
  });

  it("命中时把目标文本包成高亮段", () => {
    const segs = applyHighlights("核心是虚拟 DOM 渲染", [hl("虚拟 DOM")]);
    expect(segs).toEqual([
      { type: "text", text: "核心是" },
      { type: "hl", id: "虚拟 DOM", text: "虚拟 DOM" },
      { type: "text", text: " 渲染" },
    ]);
  });

  it("同一段文本多处出现时全部高亮", () => {
    const segs = applyHighlights("A 组件 A 和 A", [hl("A")]);
    expect(segs.filter((s) => s.type === "hl")).toHaveLength(3);
  });
});

describe("TC-HL-002: 最长优先与重叠处理", () => {
  it("长词优先匹配，短词不套在长词内部", () => {
    const segs = applyHighlights("diff 虚拟 DOM 算法", [hl("DOM"), hl("虚拟 DOM")]);
    const hlParts = segs.filter((s) => s.type === "hl").map((s) => s.text);
    expect(hlParts).toEqual(["虚拟 DOM"]);
  });

  it("重叠区间不重复包裹", () => {
    const segs = applyHighlights("ABCDEF", [hl("BCD"), hl("CDE")]);
    const hlParts = segs.filter((s) => s.type === "hl").map((s) => s.text);
    expect(hlParts).toEqual(["BCD"]);
  });
});

describe("TC-HL-003: 边界与异常", () => {
  it("空文本返回空数组", () => {
    expect(applyHighlights("", [hl("A")])).toEqual([]);
  });

  it("匹配不到的高亮被跳过", () => {
    const segs = applyHighlights("没有任何匹配", [hl("不存在")]);
    expect(segs).toEqual([{ type: "text", text: "没有任何匹配" }]);
  });

  it("空白高亮文本被过滤", () => {
    const segs = applyHighlights("有内容", [hl("  "), hl("有内容")]);
    expect(segs.filter((s) => s.type === "hl")).toHaveLength(1);
  });

  it("高亮在文本开头/结尾也能工作", () => {
    const segs = applyHighlights("开头", [hl("开头")]);
    expect(segs).toEqual([{ type: "hl", id: "开头", text: "开头" }]);
  });
});

describe("TC-HL-005: 跨行/跨块匹配（sel.toString() 含 \n，节点拼接文本不含）", () => {
  it("高亮文本含 \n 时命中全文（块级边界拼接）", () => {
    const full = "段落一\n段落二"; // 节点拼接后块级边界插入的 \n
    const segs = applyHighlights(full, [hl("段落一\n段落二")]);
    expect(segs).toEqual([{ type: "hl", id: "段落一\n段落二", text: "段落一\n段落二" }]);
  });

  it("高亮文本空白数量与原文不一致时也能命中（空白压缩）", () => {
    const segs = applyHighlights("段落一\n\n段落二", [hl("段落一\n段落二")]);
    expect(segs).toEqual([{ type: "hl", id: "段落一\n段落二", text: "段落一\n\n段落二" }]);
  });

  it("行内跨节点（strong/code 拆开）直接相接能命中", () => {
    const segs = applyHighlights("加粗文字", [hl("加粗文字")]);
    expect(segs).toEqual([{ type: "hl", id: "加粗文字", text: "加粗文字" }]);
  });

  it("原文含换行时普通子串匹配不受影响", () => {
    const segs = applyHighlights("第一行\n第二行", [hl("第二行")]);
    expect(segs).toEqual([
      { type: "text", text: "第一行\n" },
      { type: "hl", id: "第二行", text: "第二行" },
    ]);
  });
});

describe("TC-HL-004: contentHighlightKey", () => {
  it("单元讲解 key", () => {
    expect(contentHighlightKey(3, 2)).toBe("hl__explain__3__step2");
  });
  it("主题讲解 key", () => {
    expect(contentHighlightKey(3, 2, "Hooks")).toBe("hl__topic__3__step2__Hooks");
  });
});
