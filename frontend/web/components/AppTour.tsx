import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { buildTourSteps, markTourSeen, tourSeen } from "@core/services/onboarding";

/**
 * 首访一次性导览：只在落地页弹一次。走完 / 跳过 / Esc 关掉都算「看过」（都走 driver.js 的 onDestroyed）。
 * 定位不靠文案、不靠 DOM 层级，只认 data-tour 锚点（见 core/services/onboarding.ts 的步骤定义）。
 */
export default function AppTour({ aiLoaded, aiMissing }: { aiLoaded: boolean; aiMissing: boolean }) {
  const { pathname } = useLocation();

  useEffect(() => {
    // 等 AI 配置状态到位再定步骤（未配置时才有「先配 key」那步）；
    // 只在落地页弹：深链直接进 /skills 的人不该被半截导览打断，等他回到主页再引导
    if (!aiLoaded || tourSeen() || pathname !== "/resumes") return;

    const timer = window.setTimeout(() => {
      if (tourSeen()) return;
      const steps = buildTourSteps(aiMissing)
        // 锚点还没渲染出来（页面 loading 等）就跳过该步，宁缺勿指错
        .filter((s) => !s.anchor || document.querySelector(`[data-tour="${s.anchor}"]`))
        .map((s) => ({
          element: s.anchor ? `[data-tour="${s.anchor}"]` : undefined,
          popover: { title: s.title, description: s.body, side: s.side, align: s.align },
        }));
      driver({
        showProgress: true,
        progressText: "{{current}} / {{total}}",
        nextBtnText: "下一步",
        prevBtnText: "上一步",
        doneBtnText: "开始使用",
        stagePadding: 6,
        stageRadius: 8,
        smoothScroll: true,
        popoverClass: "tour-popover",
        steps,
        onDestroyed: markTourSeen,
      }).drive();
    }, 400); // 卡片入场动画（translate/opacity）跑一半时定位会飘，稍等一下

    return () => window.clearTimeout(timer);
  }, [aiLoaded, aiMissing, pathname]);

  return null;
}
