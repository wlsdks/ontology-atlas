import { describe, expect, it } from "vitest";
import { stepRowMotionClass, stepRowUsesStagger } from "./step-row-motion";

describe("지난 걸음 행의 모션 — 방금 남긴 줄만 확정 서명", () => {
  it("방금 남긴 해시가 확정 램프를 받는다", () => {
    expect(stepRowMotionClass("abc123", "abc123")).toBe("git-commit-settle");
  });

  // 이게 이 함수의 존재 이유다 — 전부에 확정을 주면 이미 있던 역사가 다시
  // 태어나고, "무엇이 방금 일어났나" 라는 정보가 오히려 흐려진다.
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
