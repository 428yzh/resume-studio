import { NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

const navItems = [
  { to: "/resumes", label: "简历管理" },
  { to: "/jd", label: "JD 分析" },
  { to: "/quiz", label: "面试题库" },
  { to: "/mock-interview", label: "模拟面试" },
  { to: "/skills", label: "技能库" },
];

export default function Layout({ children }: { children: ReactNode }) {
  // 「费曼复习」入口已挪进技能库页面。它仍是技能库下的功能，
  // 所以停在 /feynman 时让「技能库」保持高亮，否则整个导航会没有任何一项点亮。
  const feynmanOpen = useLocation().pathname.startsWith("/feynman");

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
          <div className="text-sm text-muted">简历管理</div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {children}
      </main>
    </div>
  );
}
