import { useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { Gear, Warning } from "@phosphor-icons/react";
import { useSettingsStore } from "@core/stores/settingsStore";
import AppTour from "@web/components/AppTour";

// tour = 首访导览的锚点（core/services/onboarding.ts 按名字引用，改这里要同步）
const navItems = [
  { to: "/resumes", label: "简历管理", tour: "nav-resumes" },
  { to: "/jd", label: "JD 分析", tour: "nav-jd" },
  { to: "/quiz", label: "面试题库", tour: "nav-quiz" },
  { to: "/mock-interview", label: "模拟面试", tour: "nav-mock" },
  { to: "/skills", label: "技能库", tour: "nav-skills" },
];

export default function Layout({ children }: { children: ReactNode }) {
  // 「费曼复习」入口已挪进技能库页面。它仍是技能库下的功能，
  // 所以停在 /feynman 时让「技能库」保持高亮，否则整个导航会没有任何一项点亮。
  const feynmanOpen = useLocation().pathname.startsWith("/feynman");

  // 挂载时拉一次 AI 配置状态：没配 key 时，全站 AI 功能都跑不起来，得给指引
  const { ai, fetchSettings } = useSettingsStore();
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);
  const aiMissing = ai?.ai_configured === false;

  return (
    <div className="min-h-screen bg-surface">
      {/* Top Navigation */}
      <header className="bg-canvas border-b border-hairline sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="text-lg font-bold text-ink tracking-tight">Resume<span className="text-blue"> Pro</span></h1>
            <nav className="flex items-center gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  data-tour={item.tour}
                  className={({ isActive }) =>
                    `px-4 py-2 rounded-full text-sm font-medium transition-all active:scale-95 ${
                      isActive || (item.to === "/skills" && feynmanOpen)
                        ? "bg-blue text-white"
                        : "text-slate hover:text-ink hover:bg-surface"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <NavLink
            to="/settings"
            data-tour="nav-settings"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all active:scale-95 ${
                isActive
                  ? "bg-blue text-white"
                  : aiMissing
                    ? "text-amber hover:bg-amber-light/40"
                    : "text-slate hover:text-ink hover:bg-surface"
              }`
            }
          >
            <Gear size={16} weight={aiMissing ? "fill" : "regular"} />
            设置
          </NavLink>
        </div>
        {/* 没配 AI key：全站 AI 功能都不可用，常驻一条指引（配好后自动消失） */}
        {aiMissing && (
          <div className="bg-amber-light/40 border-t border-amber/20">
            <div className="max-w-7xl mx-auto px-6 py-2 flex items-center gap-2 text-sm">
              <Warning size={15} weight="fill" className="text-amber shrink-0" />
              <span className="text-charcoal">AI 功能还没配置 API key —— 润色、JD 分析、出题、讲解都不可用</span>
              <NavLink to="/settings" className="text-blue font-medium hover:underline shrink-0">
                去设置 →
              </NavLink>
            </div>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {children}
      </main>

      <AppTour aiLoaded={ai !== null} aiMissing={aiMissing} />
    </div>
  );
}
