import { useEffect, useState } from "react";

/** 秒 →「42 秒」/「1 分 42 秒」。纯函数，可单测 */
export function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec} 秒`;
  return `${Math.floor(sec / 60)} 分 ${sec % 60} 秒`;
}

/** 真实流逝的等待时间。锚「请求发出时刻」（startedAt）而不是组件挂载 —— 收起再展开不会归零 */
export default function ElapsedTime({ startedAt }: { startedAt: number | null }) {
  const [, force] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  if (startedAt == null) return null;
  const sec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return <span>已等待 {formatElapsed(sec)}</span>;
}
