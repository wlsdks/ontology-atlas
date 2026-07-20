import { describe, expect, it } from "vitest";

import { isCameraUnsettled, isCanvasActive, shouldSkipFrame, type CanvasActivityFlags } from "./idle-gate";

const IDLE: CanvasActivityFlags = {
  pointerActive: false,
  simWarm: false,
  homing: false,
  selectionPulseActive: false,
  egoTailAnimating: false,
  emphasisTarget: false,
  breathing: false,
  cameraMoving: false,
};

describe("isCanvasActive", () => {
  it("전 플래그 false 면 비활성", () => {
    expect(isCanvasActive(IDLE)).toBe(false);
  });

  it("어느 플래그 하나라도 참이면 활성 — 스킵 금지", () => {
    for (const key of Object.keys(IDLE) as (keyof CanvasActivityFlags)[]) {
      expect(isCanvasActive({ ...IDLE, [key]: true })).toBe(true);
    }
  });
});

describe("shouldSkipFrame", () => {
  it("grace 안에서는 절대 스킵하지 않는다 (램프 감쇠 꼬리 보호)", () => {
    expect(shouldSkipFrame(1000, 500, 1200)).toBe(false);
    expect(shouldSkipFrame(1700, 500, 1200)).toBe(false);
  });

  it("grace 를 넘긴 유휴만 스킵한다", () => {
    expect(shouldSkipFrame(1701, 500, 1200)).toBe(true);
  });
});

describe("isCameraUnsettled (M-1 — 유휴 중 휠 줌 사망 회귀)", () => {
  const settled = { x: 100, y: 50, scale: 1.2 };

  it("타깃과 값이 일치하면 정착", () => {
    expect(isCameraUnsettled(settled, { tx: 100, ty: 50, tscale: 1.2 })).toBe(false);
  });

  it("휠이 스케일 타깃만 바꿔도 활동으로 판정한다 — 값 이동 없이도", () => {
    // 유휴 스킵 중엔 물리 스텝이 안 돌아 value 는 그대로다. 이때 타깃만
    // 바뀐 상태를 활동으로 못 치면 게이트가 영원히 안 깨어난다.
    expect(isCameraUnsettled(settled, { tx: 100, ty: 50, tscale: 1.4 })).toBe(true);
  });

  it("팬 타깃 변화도 활동", () => {
    expect(isCameraUnsettled(settled, { tx: 130, ty: 50, tscale: 1.2 })).toBe(true);
  });

  it("입실론 안 미세 차이는 정착으로 (재도색 헛깨움 방지)", () => {
    expect(isCameraUnsettled(settled, { tx: 100.005, ty: 50, tscale: 1.20005 })).toBe(false);
  });
});
