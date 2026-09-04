import { useEffect, useState } from "react";

/** Page-mount flag so entrance animations only run once after first paint. */
export function useEntrance(delay = 50) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return { mounted };
}

/**
 * Staggered entrance style (fade-in-up). Pass delay in seconds.
 * Returns "none" before mounted so the animation only plays on first paint.
 */
export function entrance(mounted: boolean, delaySec: number, anim = "fade-in-up") {
  return { animation: mounted ? `${anim} 0.4s ease-out ${delaySec}s both` : "none" };
}
