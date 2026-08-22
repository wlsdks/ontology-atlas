import { describe, expect, it } from "vitest";
import { stepRowMotionClass, stepRowUsesStagger } from "./step-row-motion";

describe("지난 걸음 행의 모션 — 방금 남긴 줄만 확정 서명", () => {
  it("방금 남긴 해시가 확정 램프를 받는다", () => {
    expect(stepRowMotionClass("abc123", "abc123")).toBe("git-commit-settle");
  });

  // Why this function exists — giving every row the settle re-births history
  // that was already there and blurs what just happened.
  it("나머지 역사는 손대지 않는다", () => {
    expect(stepRowMotionClass("older", "abc123")).toBe("git-fade-in");
  });

  it("남긴 것이 없으면 아무 줄도 확정을 받지 않는다", () => {
    expect(stepRowMotionClass("abc123", null)).toBe("git-fade-in");
    expect(stepRowMotionClass("abc123", undefined)).toBe("git-fade-in");
  });

  it("확정 줄은 계단을 타지 않는다 — 한 줄짜리 사건에 순서가 없다", () => {
    expect(stepRowUsesStagger("abc123", "abc123")).toBe(false);
    expect(stepRowUsesStagger("older", "abc123")).toBe(true);
  });
});
