import { describe, it, expect, beforeEach } from "vitest";
import { buildTourSteps, tourSeen, markTourSeen, TOUR_SEEN_KEY } from "../core/services/onboarding";

describe("TC-TOUR-001: buildTourSteps 步骤构成", () => {
  it("未配 key：含设置步；欢迎步在首（无锚点）、建简历按钮在末（导览落在真正要点的按钮上收尾）", () => {
    const steps = buildTourSteps(true);
    expect(steps[0].anchor).toBeNull();
    expect(steps[steps.length - 1].anchor).toBe("create-resume");
    expect(steps.some((s) => s.anchor === "nav-settings")).toBe(true);
  });

  it("已配 key：不出现设置步", () => {
    const steps = buildTourSteps(false);
    expect(steps.some((s) => s.anchor === "nav-settings")).toBe(false);
    expect(steps[0].anchor).toBeNull();
  });

  it("有锚点的步 anchor 唯一，且每步都有标题和正文", () => {
    for (const aiMissing of [true, false]) {
      const steps = buildTourSteps(aiMissing);
      const anchors = steps.filter((s) => s.anchor).map((s) => s.anchor);
      expect(new Set(anchors).size).toBe(anchors.length);
      for (const s of steps) {
        expect(s.title.length).toBeGreaterThan(0);
        expect(s.body.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("TC-TOUR-002: tourSeen / markTourSeen", () => {
  beforeEach(() => localStorage.clear());

  it("默认没看过；标记后 tourSeen 为 true，标记键固定", () => {
    expect(tourSeen()).toBe(false);
    markTourSeen();
    expect(tourSeen()).toBe(true);
    expect(localStorage.getItem(TOUR_SEEN_KEY)).toBe("1");
  });
});
