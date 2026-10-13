import { describe, it, expect } from "vitest";
import { formatElapsed } from "../web/components/ElapsedTime";

/* 等待计时器的显示格式：秒/分边界算错不报错、只显示怪数字 —— 用断言钉住 */
describe("TC-ELAPSED-001: 等待计时格式化", () => {
  it("不足 1 分钟只报秒", () => {
    expect(formatElapsed(0)).toBe("0 秒");
    expect(formatElapsed(59)).toBe("59 秒");
  });

  it("满 1 分钟起报「M 分 S 秒」", () => {
    expect(formatElapsed(60)).toBe("1 分 0 秒");
    expect(formatElapsed(61)).toBe("1 分 1 秒");
    expect(formatElapsed(3725)).toBe("62 分 5 秒");
  });
});
