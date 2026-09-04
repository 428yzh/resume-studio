/** 空状态装饰插画 — 简洁 SVG，使用 OKLCH 品牌色系 */

// 色彩常量: oklch 品牌蓝 + 中性灰
// blue: oklch(55% 0.18 260) ≈ #1456f0
// blue-light: oklch(75% 0.08 250) ≈ #8bb4fe
// gray-stroke: oklch(65% 0.015 250) — 带品牌色温的中性灰
// gray-fill: oklch(93% 0.005 250) — 极浅灰背景

export function DocIcon({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>{`
          .d1 { stroke: oklch(65% 0.015 250); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; fill: none; }
          .d1f { fill: oklch(93% 0.005 250); stroke: oklch(65% 0.015 250); stroke-width: 1; }
          .d1p { fill: oklch(55% 0.18 260); }
          .d1a { animation: d1a 2.5s ease-in-out infinite; }
          .d1b { animation: d1a 2.5s ease-in-out 0.6s infinite; }
          @keyframes d1a {
            0%, 100% { opacity: 0.2; r: 3; }
            50% { opacity: 0.5; r: 4.5; }
          }
        `}</style>
      </defs>
      <rect x="10" y="6" width="28" height="36" rx="3" className="d1" />
      <path d="M10 15h28M10 22h28M10 29h18" className="d1" />
      <circle cx="35" cy="37" r="3" className="d1p d1a" />
      <circle cx="35" cy="37" r="5" className="d1p" opacity="0.15" />
    </svg>
  );
}

export function SearchIcon({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>{`
          .s1 { stroke: oklch(65% 0.015 250); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
          .s1g { fill: oklch(55% 0.18 260); animation: s1g 2s ease-in-out infinite; }
          @keyframes s1g {
            0%, 100% { opacity: 0.08; transform: scale(1); }
            50% { opacity: 0.25; transform: scale(1.1); }
          }
        `}</style>
      </defs>
      <circle cx="21" cy="21" r="11" className="s1" />
      <line x1="29" y1="29" x2="37" y2="37" className="s1" />
      <circle cx="21" cy="21" r="7" className="s1g" />
    </svg>
  );
}

export function GridIcon({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>{`
          .g1 { fill: oklch(93% 0.005 250); stroke: oklch(65% 0.015 250); stroke-width: 1; }
          .g1b { fill: oklch(88% 0.06 250); stroke: oklch(55% 0.18 260); stroke-width: 1; }
          .g1a { animation: g1a 2.2s ease-in-out infinite; }
          .g1b2 { animation: g1a 2.2s ease-in-out 0.5s infinite; }
          .g1c { animation: g1a 2.2s ease-in-out 1s infinite; }
          @keyframes g1a {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </defs>
      <rect x="8" y="8" width="13" height="13" rx="2" className="g1" />
      <rect x="27" y="8" width="13" height="13" rx="2" className="g1b g1a" />
      <rect x="8" y="27" width="13" height="13" rx="2" className="g1b g1b2" />
      <rect x="27" y="27" width="13" height="13" rx="2" className="g1 g1c" />
    </svg>
  );
}

export function TargetIcon({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>{`
          .t1 { stroke: oklch(65% 0.015 250); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
          .t1d { fill: oklch(55% 0.18 260); }
          .t1a { animation: t1a 2s ease-in-out infinite; transform-origin: center; }
          .t1b { animation: t1a 2s ease-in-out 0.7s infinite; transform-origin: center; }
          @keyframes t1a {
            0%, 100% { opacity: 0.1; transform: scale(1); }
            50% { opacity: 0.3; transform: scale(1.15); }
          }
        `}</style>
      </defs>
      <circle cx="24" cy="24" r="16" className="t1" />
      <circle cx="24" cy="24" r="10" className="t1" />
      <circle cx="24" cy="24" r="4" className="t1" />
      <circle cx="24" cy="24" r="16" className="t1d t1a" />
      <circle cx="24" cy="24" r="10" className="t1d t1b" />
    </svg>
  );
}
