interface AIErrorBoxProps {
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

/** AI 服务降级错误提示，带「重新生成」按钮 */
export default function AIErrorBox({
  message = "AI 服务暂不可用，请稍后再试",
  onRetry,
  retryLabel = "重新生成",
}: AIErrorBoxProps) {
  return (
    <div className="bg-red-light/30 rounded-lg border border-red/20 px-4 py-3">
      <p className="text-sm text-red mb-2">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs bg-blue text-white rounded-full px-4 py-1.5 font-medium hover:bg-blue/90 transition-colors"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
