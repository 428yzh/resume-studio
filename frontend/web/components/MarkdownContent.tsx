import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * 聊天气泡里的 markdown 渲染（问一问 / 费曼 / 模拟面试共用）。
 * AI 流式回复是 markdown（加粗/列表/代码块），直接按纯文本渲染会露出星号。
 * 样式针对气泡：段间不空大行（mb-1 + last:mb-0），列表/代码块紧凑。
 */
export default function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="text-sm text-ink mb-1 last:mb-0 leading-relaxed">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-1 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-1 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="text-sm text-ink leading-relaxed">{children}</li>,
        code: ({ children }) => <code className="bg-surface px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>,
        pre: ({ children }) => <pre className="bg-surface rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono">{children}</pre>,
        h1: ({ children }) => <h1 className="text-base font-bold mb-1">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold mb-1">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mb-0.5">{children}</h3>,
        br: () => <br />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
