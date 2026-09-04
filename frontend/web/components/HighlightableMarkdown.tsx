import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { useHighlights } from "@web/hooks/useHighlights";
import { applyHighlights } from "@core/services/highlights";
import type { Highlight } from "@core/services/highlights";

interface Props {
  contentKey: string;
  markdown: string;
  brushMode?: boolean;
}

interface NoteState {
  hl: Highlight;
  x: number;
  y: number;
}

const MARK_CLASS =
  "bg-amber-light/70 rounded-sm px-0.5 py-px cursor-pointer hover:bg-amber/40 transition-colors";

/* 块级边界检测：两个相邻 text node 之间是否隔着块级元素（段落/列表项等）。
 * 利用浏览器规则——Range.toString() 对块级边界返回 \n、行内边界返回空串，
 * 与用户划词时 sel.toString() 的换行规则一致，跨块高亮才能对上。 */
function blockGap(a: Text, b: Text): boolean {
  const r = document.createRange();
  r.setStart(a, a.data.length);
  r.setEnd(b, 0);
  return /\n/.test(r.toString());
}

// markdown → HTML 字符串（同步）。渲染用 dangerouslySetInnerHTML：
// React 把容器内容当"不透明"，不会逐节点 reconcile，注入的 <mark> 不再与 React 冲突。
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeStringify);

/** markdown 主体。memo：html 不变则 React 跳过重渲染，保住注入的高亮 <mark> */
const MarkdownBody = memo(function MarkdownBody({ html }: { html: string }) {
  return <div className="markdown-prose" dangerouslySetInnerHTML={{ __html: html }} />;
});

/**
 * 刷子划词高亮：开刷子模式后拖动文字即高亮，再拖动已高亮文字即取消。
 * 点击高亮可写笔记/删除。react-markdown v10 不支持 text 组件覆盖，且其虚拟 DOM 与
 * 命令式 <mark> 注入冲突（重渲染 removeChild 崩溃），故改为 HTML 字符串 + DOM 注入。
 */
export default function HighlightableMarkdown({ contentKey, markdown, brushMode = false }: Props) {
  const { highlights, addHighlight, updateHighlight, removeHighlight, clearAll } = useHighlights(contentKey);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState<NoteState | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [popPos, setPopPos] = useState({ left: 0, top: 0 });

  // markdown → HTML 字符串（同步转换）
  const html = useMemo(() => {
    try {
      return String(processor.processSync(markdown));
    } catch {
      return "";
    }
  }, [markdown]);

  // 渲染后把高亮文本包成 <mark>（先撤销旧的，避免重复包裹）。
  // html 变化时 React 整体替换 innerHTML（旧 mark 一并丢弃），本 effect 重新注入。
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.querySelectorAll("mark[data-hl-id]").forEach((m) => {
      m.replaceWith(document.createTextNode(m.textContent || ""));
    });
    container.normalize();

    if (!highlights.length) return;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.trim()) textNodes.push(node as Text);
    }
    if (!textNodes.length) return;

    // 全文拼接：块级边界插 \n（与 sel.toString() 规则一致），行内边界直接相接。
    // 对全文做一次匹配，把高亮区间再按 node 切分回写——跨行/跨节点的高亮才能命中。
    const items: { node: Text; start: number; text: string }[] = [];
    let full = "";
    for (let i = 0; i < textNodes.length; i++) {
      const t = textNodes[i].nodeValue || "";
      if (i > 0 && blockGap(textNodes[i - 1], textNodes[i])) full += "\n";
      items.push({ node: textNodes[i], start: full.length, text: t });
      full += t;
    }

    const segments = applyHighlights(full, highlights);

    // 高亮段按全文坐标分配到各 text node 的切片（跨 node 时每个 node 各自包 mark）
    const piecesByNode = new Map<Text, { from: number; to: number; id: string }[]>();
    let pos = 0;
    let itemIdx = 0;
    for (const seg of segments) {
      if (seg.type === "text") { pos += seg.text.length; continue; }
      const segStart = pos;
      const segEnd = pos + seg.text.length;
      while (itemIdx < items.length && items[itemIdx].start + items[itemIdx].text.length <= segStart) {
        itemIdx++;
      }
      let p = segStart;
      while (p < segEnd && itemIdx < items.length) {
        const it = items[itemIdx];
        const from = Math.max(p, it.start);
        const to = Math.min(segEnd, it.start + it.text.length);
        if (to > from) {
          const list = piecesByNode.get(it.node) || [];
          list.push({ from: from - it.start, to: to - it.start, id: seg.id });
          piecesByNode.set(it.node, list);
        }
        p = to;
        if (to >= it.start + it.text.length) itemIdx++;
      }
      pos = segEnd;
    }

    for (const [textNode, pieces] of piecesByNode) {
      const text = textNode.nodeValue || "";
      const frag = document.createDocumentFragment();
      let cur = 0;
      for (const piece of pieces) {
        if (piece.from > cur) frag.appendChild(document.createTextNode(text.slice(cur, piece.from)));
        const mark = document.createElement("mark");
        mark.dataset.hlId = piece.id;
        mark.className = MARK_CLASS;
        mark.textContent = text.slice(piece.from, piece.to);
        frag.appendChild(mark);
        cur = piece.to;
      }
      if (cur < text.length) frag.appendChild(document.createTextNode(text.slice(cur)));
      textNode.parentNode?.replaceChild(frag, textNode);
    }
  }, [html, highlights]);

  // 刷子模式：拖选即高亮 / 再拖已高亮文字即取消
  const handleMouseUp = useCallback(() => {
    if (!brushMode) return;
    const sel = window.getSelection();
    const text = sel && !sel.isCollapsed ? sel.toString().trim() : "";
    if (!text) return;
    if (!(sel && sel.anchorNode && containerRef.current?.contains(sel.anchorNode))) return;

    const existing = highlights.filter((h) => h.text === text);
    if (existing.length) {
      existing.forEach((h) => removeHighlight(h.id));
    } else {
      addHighlight(text);
    }
    sel.removeAllRanges();
  }, [brushMode, highlights, addHighlight, removeHighlight]);

  // 容器委托：点击 <mark> 打开笔记弹层
  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      const el = (e.target as HTMLElement).closest("mark[data-hl-id]") as HTMLElement | null;
      if (!el) return;
      const hl = highlights.find((h) => h.id === el.dataset.hlId);
      if (!hl) return;
      const rect = el.getBoundingClientRect();
      setNoteDraft(hl.note);
      setNote({ hl, x: rect.left, y: rect.bottom });
    },
    [highlights]
  );

  // 弹层定位：mark 靠近屏幕边缘时钳制到视口内，避免偏出屏幕外
  useLayoutEffect(() => {
    if (!note) return;
    const el = popoverRef.current;
    if (!el) return;
    const pad = 8;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.min(note.x, window.innerWidth - w - pad);
    const top = Math.min(note.y + 6, window.innerHeight - h - pad);
    setPopPos({ left: Math.max(pad, left), top: Math.max(pad, top) });
  }, [note]);

  // 点击高亮/弹层内部不关闭；点击别处关闭笔记弹层
  useEffect(() => {
    if (!note) return;
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("mark[data-hl-id]") || (popoverRef.current && popoverRef.current.contains(t))) return;
      setNote(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [note]);

  return (
    <div
      ref={containerRef}
      onMouseUp={handleMouseUp}
      onClick={handleContainerClick}
      data-hl-container="true"
      className={`relative ${brushMode ? "select-text" : ""}`}
    >
      {brushMode && (
        <p className="text-[11px] text-amber mb-1.5 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse" />
          刷子模式：拖动文字高亮，再拖动高亮文字取消
        </p>
      )}

      {/* markdown 主体用 memo 包裹：html 没变时 React 完全跳过它（父级重渲染/刷子切换/弹层
          都不会重置 innerHTML，注入的高亮 <mark> 才能存活）。html 真的变化时才重渲染，
          由下方 effect 重新注入高亮 */}
      <MarkdownBody html={html} />

      {/* 笔记弹层：Portal 到 body，脱离 transform 祖先，fixed 才能相对视口定位 */}
      {note &&
        createPortal(
          <div
            ref={popoverRef}
            className="fixed z-[60] w-64 bg-canvas border border-hairline rounded-xl shadow-lg p-3"
            style={{ left: popPos.left, top: popPos.top }}
            onMouseDown={(e) => e.stopPropagation()}
          >
          <p className="text-xs text-slate mb-1.5 line-clamp-2">{note.hl.text}</p>
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="写下你的笔记，下次复习时能想起来…"
            rows={3}
            className="w-full border border-hairline rounded-lg px-2.5 py-1.5 text-xs bg-canvas outline-none focus:border-blue resize-none placeholder:text-muted/50"
          />
          <div className="flex items-center justify-between mt-2">
            <button
              onClick={() => {
                removeHighlight(note.hl.id);
                setNote(null);
              }}
              className="text-xs text-red/70 hover:text-red transition-colors"
            >
              删除高亮
            </button>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setNote(null)}
                className="text-xs text-slate hover:text-ink px-2 py-1 rounded-full transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  updateHighlight(note.hl.id, noteDraft.trim());
                  setNote(null);
                }}
                className="text-xs font-medium bg-blue text-white rounded-full px-3 py-1 hover:bg-blue/90 transition-colors"
              >
                保存
              </button>
            </div>
          </div>
          </div>,
          document.body
        )}

      {/* 全部清除（有高亮时） */}
      {highlights.length > 0 && (
        <button
          onClick={clearAll}
          className="mt-2 text-[11px] text-muted hover:text-red transition-colors"
          title="清除本内容的所有高亮"
        >
          清除 {highlights.length} 处高亮
        </button>
      )}
    </div>
  );
}
