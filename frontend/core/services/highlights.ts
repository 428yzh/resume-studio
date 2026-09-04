/**
 * 划词高亮核心逻辑：把用户划选的文本段持久化，并在渲染时重新注入 <mark>。
 * 纯函数，无 DOM 依赖，可单测。
 */

export interface Highlight {
  id: string;
  text: string;
  note: string;
  createdAt: number;
}

export type HighlightSegment =
  | { type: "text"; text: string }
  | { type: "hl"; id: string; text: string };

/**
 * 空白压缩：连续空白字符（含 \n）压成单个空格，返回压缩文本 + 每个压缩字符对应的原始索引。
 * 用于跨节点匹配——浏览器 sel.toString() 在块级元素之间会插入 \n，而 DOM text node 拼接
 * 没有这些字符，把两边都压缩后再匹配，位置才能对上。
 */
export function compressWhitespace(s: string): { text: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];
  let i = 0;
  while (i < s.length) {
    if (/\s/.test(s[i])) {
      let j = i;
      while (j < s.length && /\s/.test(s[j])) j++;
      // 连续空白压成单个空格；前导空白丢弃（与高亮文本 trim 过滤一致）；
      // 映射到最后一个空白字符，保证区间端点落在非空白字符上
      if (chars.length && chars[chars.length - 1] !== " ") {
        chars.push(" ");
        map.push(j - 1);
      }
      i = j;
    } else {
      chars.push(s[i]);
      map.push(i);
      i++;
    }
  }
  return { text: chars.join(""), map };
}

/**
 * 把 highlights 匹配到 text 中，切分成高亮/普通片段。
 * - 最长文本优先匹配（避免短词先吃掉长词的内部）
 * - 高亮区间不重叠，先到先得
 * - 匹配不到的高亮静默跳过（数据保留，只是当前渲染不出）
 * - 内部经空白压缩匹配（跨行/跨块的高亮文本含 \n 也能命中），返回区间映射回原文
 */
export function applyHighlights(text: string, highlights: Highlight[]): HighlightSegment[] {
  if (!text) return [];
  const active = highlights.filter((h) => h.text && h.text.trim());
  if (!active.length) return [{ type: "text", text }];

  const { text: cText, map } = compressWhitespace(text);
  const sorted = [...active].sort((a, b) => b.text.length - a.text.length);
  const needles = new Map(sorted.map((h) => [h, compressWhitespace(h.text).text]));

  const marks: Array<{ start: number; end: number; id: string }> = [];
  for (const h of sorted) {
    const needle = needles.get(h)!;
    if (!needle) continue;
    let idx = 0;
    while (true) {
      const pos = cText.indexOf(needle, idx);
      if (pos === -1) break;
      if (!marks.some((m) => pos < m.end && pos + needle.length > m.start)) {
        marks.push({ start: pos, end: pos + needle.length, id: h.id });
      }
      idx = pos + needle.length;
    }
  }
  if (!marks.length) return [{ type: "text", text }];

  marks.sort((a, b) => a.start - b.start);

  // 压缩区间 → 原文区间：区间首字符 map 回原文索引，末端字符 +1
  const toRaw = (pos: number) => (pos >= map.length ? text.length : map[pos]);
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const m of marks) {
    const rawStart = toRaw(m.start);
    const rawEnd = m.end > m.start ? toRaw(m.end - 1) + 1 : rawStart;
    if (rawStart > cursor) segments.push({ type: "text", text: text.slice(cursor, rawStart) });
    segments.push({ type: "hl", id: m.id, text: text.slice(rawStart, rawEnd) });
    cursor = rawEnd;
  }
  if (cursor < text.length) segments.push({ type: "text", text: text.slice(cursor) });
  return segments;
}

/* ── localStorage 持久化 ── */

export function loadHighlights(key: string): Highlight[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data.filter((h) => h && typeof h.text === "string") : [];
  } catch {
    return [];
  }
}

export function saveHighlights(key: string, list: Highlight[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* localStorage 不可用时静默降级 */
  }
}

/** 高亮缓存 key，与 LearningPanel 的内容缓存 key 对齐（explain__ / topic__） */
export function contentHighlightKey(skillId: number, stepNum: number, topic?: string): string {
  return topic
    ? `hl__topic__${skillId}__step${stepNum}__${topic}`
    : `hl__explain__${skillId}__step${stepNum}`;
}
