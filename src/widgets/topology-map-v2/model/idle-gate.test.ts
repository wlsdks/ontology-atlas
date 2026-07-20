import { describe, expect, it } from "vitest";

import { isCanvasActive, shouldSkipFrame, type CanvasActivityFlags } from "./idle-gate";

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
