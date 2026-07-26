import { describe, expect, it } from "vitest";

import { isCameraUnsettled, isCanvasActive, shouldSkipFrame, type CanvasActivityFlags } from "./idle-gate";
import { stepFocusRamp } from "./focus-state";

const IDLE: CanvasActivityFlags = {
  pointerActive: false,
  simWarm: false,
  homing: false,
  selectionPulseActive: false,
  egoTailAnimating: false,
  emphasisTarget: false,
  breathing: false,
  cameraMoving: false,
  focusFadeSettling: false,
  spotlightSettling: false,
  trailLensSettling: false,
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

describe("focusFadeSettling (deselect 링 잔류 회귀)", () => {
  // 회귀 재현: 라이브 포커스(노드/엣지)는 없는데 retained colorFocus 가 남아
  // focus 램프가 감쇠 중인 구간. 램프 감쇠·colorFocus 클리어는 rAF 프레임
  // 바디 안에서만 일어나므로, 이 구간에 우발 활동(코멧/카메라)이 없으면
  // 유휴 게이트가 프레임을 스킵해 램프가 얼고 선택 링이 풀 opacity 로 남는다.
  // 이 플래그가 그 구간을 활동으로 쳐 페이드가 끝날 때까지 루프를 깨워 둔다.
  const TAU = 0.16; // --topology-v2-focus-dim-tau
  const CLEAR_THRESHOLD = 0.02; // use-topology-loop 의 colorFocus 클리어 문턱

  it("retained colorFocus 페이드 구간은 다른 활동이 전무해도 활성이다", () => {
    // 우발 활동(코멧·카메라·호버) 전부 꺼진 순수 유휴 + 페이드만 진행 중.
    expect(isCanvasActive({ ...IDLE, focusFadeSettling: true })).toBe(true);
  });

  // use-topology-loop 이 매 프레임 refs 에서 계산하는 focusFadeSettling 판정을
  // 순수 함수로 미러 — 세 deselect 경로가 모두 이 동일 상태(라이브 포커스 없음 +
  // retained colorFocus)로 수렴함을 검증한다.
  const focusFadeSettlingFrom = (refs: {
    colorFocus: string | null;
    focusedSlug: string | null;
    selectedEdge: unknown | null;
  }): boolean => refs.colorFocus !== null && refs.focusedSlug === null && refs.selectedEdge === null;

  it("세 deselect 경로(빈-클릭·Escape·패널 X-close)는 동일 프레임 상태로 수렴해 활성이다", () => {
    // 셋 다 handleClose 를 거쳐 focusedSlug→null 로 만들지만 retained colorFocus 는
    // 남는다(색 페이드 타깃). 이벤트 출처와 무관하게 게이트가 그 상태를 활동으로
    // 봐야 링이 얼지 않는다 — 경로별로 다르게 처리하면 X-close 만 얼어붙는다.
    const deselected = { colorFocus: "domain:views", focusedSlug: null, selectedEdge: null };
    for (const _path of ["empty-click", "escape", "panel-x-close"]) {
      expect(focusFadeSettlingFrom(deselected)).toBe(true);
      expect(isCanvasActive({ ...IDLE, focusFadeSettling: focusFadeSettlingFrom(deselected) })).toBe(true);
    }
    // 라이브 포커스가 아직 있으면(정적 선택 유지) 페이드 대상이 아니다 → 유휴 허용.
    expect(focusFadeSettlingFrom({ colorFocus: "domain:views", focusedSlug: "domain:views", selectedEdge: null })).toBe(false);
    // 엣지 페어 선택이 살아 있어도 페이드 아님.
    expect(focusFadeSettlingFrom({ colorFocus: null, focusedSlug: null, selectedEdge: { a: 1 } })).toBe(false);
  });

  it("페이드가 문턱 아래로 감쇠해 colorFocus 가 클리어되면 다시 유휴로 돌아간다", () => {
    // deselect 직후: 램프 1 에서 시작해 focusActive=false 로 매 프레임 감쇠.
    let ramp = 1;
    let colorFocusRetained = true;
    let frames = 0;
    const dt = 1 / 60;

    // 페이드가 진행되는 한 게이트는 절대 스킵하지 않아야 한다(프레임이 돌아야
    // 램프가 감쇠하므로 — 얼면 영원히 안 끝난다).
    while (colorFocusRetained) {
      const focusFadeSettling = colorFocusRetained; // 라이브 포커스 없음 + retained
      expect(isCanvasActive({ ...IDLE, focusFadeSettling })).toBe(true);
      ramp = stepFocusRamp(ramp, false, dt, TAU);
      if (ramp < CLEAR_THRESHOLD) colorFocusRetained = false; // use-topology-loop 클리어 조건
      frames += 1;
      if (frames > 600) throw new Error("페이드가 수렴하지 않음");
    }

    // 감쇠는 바운드된 시간 안에 끝난다(~4τ ≈ 0.64s @ 60fps ≈ 39 프레임).
    expect(frames).toBeLessThan(60);
    // 클리어 후 다른 활동이 없으면 캔버스는 유휴로 복귀(무한 재도색 방지).
    expect(isCanvasActive({ ...IDLE, focusFadeSettling: false })).toBe(false);
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
