import { useEffect, useRef, useState } from "react";

interface Props {
  value?: number;
  fallback?: number | string | null;
  className?: string;
  duration?: number;
}

/** Counts from 0 → value with cubic ease-out via requestAnimationFrame. */
export default function AnimatedNumber({ value, fallback, className, duration = 700 }: Props) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (value === undefined) return;
    const start = performance.now();
    rafRef.current = requestAnimationFrame(function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * ease));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  if (value === undefined) {
    return <span className={className}>{fallback ?? "—"}</span>;
  }
  return <span className={className}>{display}</span>;
}
