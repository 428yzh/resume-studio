/**
 * 首访引导（一次性聚光灯导览）的纯逻辑 —— 步骤定义 + 「看过」标记。
 * 锚点走 data-tour 属性（见 Layout / ResumeList），不绑文案、不绑 DOM 结构：改界面文字不会让导览指错。
 * 展示与 driver.js 装配在 web/components/AppTour.tsx，这里不碰 DOM。
 */
export interface TourStepDef {
  anchor: string | null; // data-tour 属性名；null = 无锚点，居中弹（欢迎步）
  title: string;
  body: string;
  side: "top" | "bottom";
  align: "start" | "center" | "end";
}

export const TOUR_SEEN_KEY = "onboarding__tour_seen";

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === "1";
  } catch {
    return true; // 存不了的浏览器（禁 localStorage）就当看过，别每次刷新都弹
  }
}

export function markTourSeen(): void {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, "1");
  } catch {
    // 存不了就算了：最多下次再弹一遍，无伤大雅
  }
}

/** 认路（配 key + 三个板块）在前，最后一步落在「真正要点的那个按钮」上收尾；每步只说一件事。 */
export function buildTourSteps(aiMissing: boolean): TourStepDef[] {
  const steps: TourStepDef[] = [
    {
      anchor: null,
      title: "欢迎使用 Resume Pro",
      body: "带 AI 的求职工作台：写简历 → 分析 JD → 学技能 → 刷题和模拟面试，这条线走完就算上手了。30 秒带你认一下界面。",
      side: "bottom",
      align: "center",
    },
  ];
  if (aiMissing) {
    steps.push({
      anchor: "nav-settings",
      title: "先配置 AI 服务",
      body: "润色、JD 分析、出题、讲解全靠它。填一个 API key 就行，1 分钟搞定，保存后立即生效。",
      side: "bottom",
      align: "end",
    });
  }
  steps.push(
    {
      anchor: "nav-jd",
      title: "JD 分析",
      body: "拿到想投的岗位，把职位描述粘进来：AI 拆出技术栈，自动导入技能库。",
      side: "bottom",
      align: "start",
    },
    {
      anchor: "nav-skills",
      title: "技能库",
      body: "每个技能生成知识图谱和分块学习计划；边学边写笔记，学完直接出题检验。",
      side: "bottom",
      align: "start",
    },
    {
      anchor: "nav-quiz",
      title: "面试题库 · 模拟面试",
      body: "刷题、45 分钟模拟考试，还有 AI 面试官逐题打分。",
      side: "bottom",
      align: "center",
    },
    {
      anchor: "create-resume",
      title: "从这里开始",
      body: "新建一份简历，或者直接导入现成的 PDF，AI 帮你整理好。",
      side: "bottom",
      align: "end",
    },
  );
  return steps;
}
