interface Props {
  label?: string;
  className?: string;
}

/** Three bouncing dots — the shared loading indicator used across the app. */
export default function LoadingDots({ label = "加载中...", className }: Props) {
  return (
    <div className={`inline-flex items-center gap-2 text-muted text-sm ${className || ""}`}>
      <span className="w-2 h-2 bg-blue rounded-full animate-bounce" style={{ animationDelay: "0s" }} />
      <span className="w-2 h-2 bg-blue rounded-full animate-bounce" style={{ animationDelay: "0.15s" }} />
      <span className="w-2 h-2 bg-blue rounded-full animate-bounce" style={{ animationDelay: "0.3s" }} />
      <span className="ml-1">{label}</span>
    </div>
  );
}
