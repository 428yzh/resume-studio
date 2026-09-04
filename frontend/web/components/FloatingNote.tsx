import { useState, useCallback, useRef, useEffect } from "react";

interface FloatingNoteProps {
  /** Storage key for localStorage */
  storageKey: string;
  /** Close handler */
  onClose: () => void;
}

/** 可拖动的漂浮便签 — 随手记录技术名词和笔记 */
export default function FloatingNote({ storageKey, onClose }: FloatingNoteProps) {
  const [text, setText] = useState(() => {
    try { return localStorage.getItem(storageKey) || ""; } catch { return ""; }
  });
  const [pos, setPos] = useState(() => {
    try {
      const saved = localStorage.getItem(`${storageKey}_pos`);
      if (saved) return JSON.parse(saved) as { x: number; y: number };
    } catch { /* ignore */ }
    return { x: Math.max(0, (typeof window !== "undefined" ? window.innerWidth - 340 : 400)), y: 120 };
  });
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const posRef = useRef(pos);
  posRef.current = pos;

  // Auto-save text with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      try { localStorage.setItem(storageKey, text); } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [text, storageKey]);

  // Save position to localStorage
  const savePos = useCallback((p: { x: number; y: number }) => {
    try { localStorage.setItem(`${storageKey}_pos`, JSON.stringify(p)); } catch { /* ignore */ }
  }, [storageKey]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    dragOffset.current = { x: e.clientX - posRef.current.x, y: e.clientY - posRef.current.y };
    (e.target as HTMLElement).style.cursor = "grabbing";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const newPos = {
        x: Math.max(0, e.clientX - dragOffset.current.x),
        y: Math.max(0, e.clientY - dragOffset.current.y),
      };
      setPos(newPos);
    };
    const handleMouseUp = () => {
      if (dragging.current) {
        dragging.current = false;
        document.body.style.cursor = "";
        savePos(posRef.current);
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [savePos]);

  return (
    <div
      className="fixed z-[100] w-[280px] h-[200px] min-w-[180px] min-h-[120px] bg-canvas border border-hairline rounded-xl shadow-lg flex flex-col overflow-auto resize"
      style={{ left: pos.x, top: pos.y }}
    >
      {/* ── Title bar — drag handle ── */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-surface cursor-grab active:cursor-grabbing select-none shrink-0"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-slate" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-xs font-semibold text-slate">随手记</span>
        </div>
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded-full text-muted hover:text-ink hover:bg-surface transition-colors"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ── Textarea ── */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full flex-1 resize-none text-sm text-charcoal leading-relaxed bg-transparent p-3 outline-none min-h-[80px]"
      />
    </div>
  );
}
