/**
 * AI 服务降级检测。
 * 后端在 DeepSeek 不可用时返回 HTTP 200 + 错误文案（而非抛错），
 * 这些文案会被当成正常内容渲染。前端据此识别并转入错误状态（显示重新生成按钮）。
 */
export const AI_UNAVAILABLE_MARKERS = [
  "AI 服务暂不可用",
  "AI 服务未配置",
  "AI 暂不可用",
  "AI 判卷服务暂不可用",
  "AI 评估暂不可用",
  "AI 回复失败",
  // explain_topic 生成内容为空时的兜底文案，同样当失败处理（显示重试而非死文字）
  "暂无解释",
];

export function isUnavailable(text: string): boolean {
  return AI_UNAVAILABLE_MARKERS.some((m) => text.includes(m));
}

/** 递归扫描任意结构，任一字符串字段命中降级标记即视为 AI 不可用（用于 JD/学习计划/题库等结构化返回） */
export function hasUnavailableField(value: unknown): boolean {
  if (typeof value === "string") return isUnavailable(value);
  if (Array.isArray(value)) return value.some(hasUnavailableField);
  if (value && typeof value === "object") return Object.values(value).some(hasUnavailableField);
  return false;
}
