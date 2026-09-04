import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuizStore } from "@core/stores/quizStore";
import LoadingDots from "@web/components/LoadingDots";
import { useEntrance, entrance } from "@web/hooks/useEntrance";

export default function QuizRecords() {
  const navigate = useNavigate();
  const { sessions, loading, fetchSessions } = useQuizStore();
  const { mounted } = useEntrance();

  useEffect(() => {
    fetchSessions();
  }, []);

  const modeLabel = (m: string) => (m === "exam" ? "考试" : "刷题");
  const statusLabel = (s: string) => (s === "completed" ? "已完成" : "进行中");

  return (
    <div>
      <div className="flex items-center justify-between mb-6 animate-fade-in">
        <div>
          <h2 className="text-2xl font-bold text-ink">答题记录</h2>
          <p className="text-sm text-slate mt-1">查看历史答题数据和结果</p>
        </div>
        <button
          onClick={() => navigate("/quiz")}
          className="bg-blue text-white rounded-full px-5 py-2 font-semibold text-sm hover:bg-blue/90 transition-all active:scale-95"
        >
          返回题库
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <LoadingDots />
        </div>
      )}

      {!loading && sessions.length === 0 && (
        <div className="bg-canvas rounded-xl border border-hairline p-12 text-center transition-all duration-300" style={entrance(mounted, 0.1)}>
          <div className="w-14 h-14 bg-surface rounded-full flex items-center justify-center mx-auto mb-4 transition-transform duration-300 hover:scale-110">
            <svg className="w-6 h-6 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-ink mb-2">还没有答题记录</h3>
          <p className="text-sm text-slate mb-6">开始刷题或参加模拟面试，记录会出现在这里</p>
          <button
            onClick={() => navigate("/quiz")}
            className="bg-blue text-white rounded-full px-5 py-2 font-semibold text-sm hover:bg-blue/90 transition-all active:scale-95"
          >
            去刷题
          </button>
        </div>
      )}

      {!loading && sessions.length > 0 && (
        <div className="border border-hairline rounded-lg overflow-hidden" style={entrance(mounted, 0.1)}>
          <table className="w-full">
            <thead>
              <tr className="bg-surface text-xs text-muted uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">模式</th>
                <th className="text-left px-4 py-3 font-medium">状态</th>
                <th className="text-left px-4 py-3 font-medium">题目</th>
                <th className="text-left px-4 py-3 font-medium">正确</th>
                <th className="text-left px-4 py-3 font-medium">得分</th>
                <th className="text-left px-4 py-3 font-medium">时间</th>
                <th className="text-right px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, i) => (
                <tr key={s.id} className="border-t border-hairline hover:bg-surface/50 transition-colors" style={{ opacity: 0, animation: `fade-in 0.3s ease-out ${0.12 + 0.04 * i}s forwards` }}>
                  <td className="px-4 py-3">
                    <span className={`text-xs rounded-full px-2.5 py-0.5 font-medium ${
                      s.mode === "exam" ? "bg-amber/10 text-amber" : "bg-blue-light text-blue"
                    }`}>
                      {modeLabel(s.mode)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${
                      s.status === "completed" ? "text-green" : "text-muted"
                    }`}>
                      {statusLabel(s.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-charcoal">{s.total_questions}</td>
                  <td className="px-4 py-3 text-sm text-charcoal">
                    {s.status === "completed" ? `${s.correct_count}/${s.total_questions}` : "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-charcoal">
                    {s.status === "completed" ? `${s.score}%` : "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate">
                    {new Date(s.started_at).toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => navigate(`/quiz/records/${s.id}`)}
                      className="text-xs text-blue hover:text-blue/80 font-medium transition-all hover:scale-105 active:scale-95 inline-flex items-center gap-0.5"
                    >
                      查看
                      <span className="transition-transform duration-200 hover:translate-x-0.5">→</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
