import { useEffect, useState } from "react";
import { loadHighlights, saveHighlights } from "@core/services/highlights";
import type { Highlight } from "@core/services/highlights";

/**
 * 划词高亮状态 + localStorage 持久化。
 * contentKey 变化时重新加载对应内容的高亮。
 */
export function useHighlights(contentKey: string) {
  const [highlights, setHighlights] = useState<Highlight[]>(() => loadHighlights(contentKey));

  useEffect(() => {
    setHighlights(loadHighlights(contentKey));
  }, [contentKey]);

  useEffect(() => {
    saveHighlights(contentKey, highlights);
  }, [contentKey, highlights]);

  const addHighlight = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const id = `hl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setHighlights((prev) => [...prev, { id, text: t, note: "", createdAt: Date.now() }]);
  };

  const updateHighlight = (id: string, note: string) => {
    setHighlights((prev) => prev.map((h) => (h.id === id ? { ...h, note } : h)));
  };

  const removeHighlight = (id: string) => {
    setHighlights((prev) => prev.filter((h) => h.id !== id));
  };

  const clearAll = () => setHighlights([]);

  return { highlights, addHighlight, updateHighlight, removeHighlight, clearAll };
}
