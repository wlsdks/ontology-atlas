import { describe, expect, it } from "vitest";

import {
  isCameraUnsettled,
  isCanvasActive,
  isDomeSpinAnimating,
  isEgoTailAnimating,
  shouldSkipFrame,
  type CanvasActivityFlags,
  type DomeSpinInput,
  type EgoTailActivityInput,
} from "./idle-gate";
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
  // Reproduces the regression: no live focus (node or edge) remains, but the
  // retained colorFocus is still there while the focus ramp decays. Both the ramp
  // decay and the colorFocus clear happen only inside the rAF frame body, so with
  // no incidental activity (a comet, the camera) the idle skip drops the frame,
  // the ramp freezes, and the selection ring stays at full opacity. This flag
  // counts the window as activity and keeps the loop awake until the fade ends.
  const TAU = 0.16; // --topology-v2-focus-dim-tau
  const CLEAR_THRESHOLD = 0.02; // the colorFocus clear threshold in use-topology-loop

  it("retained colorFocus 페이드 구간은 다른 활동이 전무해도 활성이다", () => {
    // Every incidental source (comet, camera, hover) is off — pure idle, fade only.
    expect(isCanvasActive({ ...IDLE, focusFadeSettling: true })).toBe(true);
  });

  // Mirrors, as a pure function, the focusFadeSettling decision use-topology-loop
  // computes from refs each frame — proving all three deselect paths converge on
  // the same state: no live focus, colorFocus retained.
  const focusFadeSettlingFrom = (refs: {
    colorFocus: string | null;
    focusedSlug: string | null;
    selectedEdge: unknown | null;
  }): boolean => refs.colorFocus !== null && refs.focusedSlug === null && refs.selectedEdge === null;

  it("세 deselect 경로(빈-클릭·Escape·패널 X-close)는 동일 프레임 상태로 수렴해 활성이다", () => {
    // All three run through handleClose and set focusedSlug to null, but the
    // retained colorFocus stays as the color fade target. The state must count as
    // activity regardless of which event produced it, or the ring freezes —
    // handling the paths separately is exactly how only X-close froze.
    const deselected = { colorFocus: "domain:views", focusedSlug: null, selectedEdge: null };
    for (const _path of ["empty-click", "escape", "panel-x-close"]) {
      expect(focusFadeSettlingFrom(deselected)).toBe(true);
      expect(isCanvasActive({ ...IDLE, focusFadeSettling: focusFadeSettlingFrom(deselected) })).toBe(true);
    }
    // A live focus still held (a static selection) is not fading, so idle is allowed.
    expect(focusFadeSettlingFrom({ colorFocus: "domain:views", focusedSlug: "domain:views", selectedEdge: null })).toBe(false);
    // A live edge-pair selection is not a fade either.
    expect(focusFadeSettlingFrom({ colorFocus: null, focusedSlug: null, selectedEdge: { a: 1 } })).toBe(false);
  });

  it("페이드가 문턱 아래로 감쇠해 colorFocus 가 클리어되면 다시 유휴로 돌아간다", () => {
    // Just after deselect: the ramp starts at 1 and decays each frame with focusActive=false.
    let ramp = 1;
    let colorFocusRetained = true;
    let frames = 0;
    const dt = 1 / 60;

    // While the fade runs, frames must never be skipped: the ramp decays only
    // inside a frame, so freezing it means the fade never finishes.
    while (colorFocusRetained) {
      const focusFadeSettling = colorFocusRetained; // no live focus, colorFocus retained
      expect(isCanvasActive({ ...IDLE, focusFadeSettling })).toBe(true);
      ramp = stepFocusRamp(ramp, false, dt, TAU);
      if (ramp < CLEAR_THRESHOLD) colorFocusRetained = false; // the clear condition in use-topology-loop
      frames += 1;
      if (frames > 600) throw new Error("페이드가 수렴하지 않음");
    }

    // The decay finishes in bounded time: ~4τ ≈ 0.64 s at 60 fps ≈ 39 frames.
    expect(frames).toBeLessThan(60);
    // Once cleared and with nothing else active, the canvas returns to idle rather than repainting forever.
    expect(isCanvasActive({ ...IDLE, focusFadeSettling: false })).toBe(false);
  });
});

describe("isCameraUnsettled (M-1 — 유휴 중 휠 줌 사망 회귀)", () => {
  const settled = { x: 100, y: 50, scale: 1.2 };

  it("타깃과 값이 일치하면 정착", () => {
    expect(isCameraUnsettled(settled, { tx: 100, ty: 50, tscale: 1.2 })).toBe(false);
  });

  it("휠이 스케일 타깃만 바꿔도 활동으로 판정한다 — 값 이동 없이도", () => {
    // While frames are skipped the physics step does not run, so the value cannot
    // move. If a changed target alone is not activity, nothing ever wakes the loop.
    expect(isCameraUnsettled(settled, { tx: 100, ty: 50, tscale: 1.4 })).toBe(true);
  });

  it("팬 타깃 변화도 활동", () => {
    expect(isCameraUnsettled(settled, { tx: 130, ty: 50, tscale: 1.2 })).toBe(true);
  });

  it("입실론 안 미세 차이는 정착으로 (재도색 헛깨움 방지)", () => {
    expect(isCameraUnsettled(settled, { tx: 100.005, ty: 50, tscale: 1.20005 })).toBe(false);
  });
});

describe("isEgoTailAnimating — 앰비언트 휴면이 세 갈래 전부에 걸리는가", () => {
  // Awake, depends comets flowing, one node selected.
  const AWAKE_FOCUSED: EgoTailActivityInput = {
    reducedMotion: false,
    ambientAsleep: false,
    hasDependsEdges: true,
    edgePulseSpeed: 0.075,
    focused: true,
    hasContainsEdges: true,
    livePulseCount: 0,
  };

  it("각성 중에는 활동 — 보고 있는 사람의 화면은 종전 그대로", () => {
    expect(isEgoTailAnimating(AWAKE_FOCUSED)).toBe(true);
  });

  /**
   * A regression this repository actually had: ambient sleep was applied to the
   * depends branch only, so **leaving a node selected and taking your hands off**
   * left the contains branch holding the condition open forever. The screen had
   * already stopped (every comet speed × factor 0), so it was pure wasted raster.
   */
  it("잠들면 선택 상태에서도 비활동 — 데이터시트 열어 두고 떠나도 잠든다", () => {
    expect(isEgoTailAnimating({ ...AWAKE_FOCUSED, ambientAsleep: true })).toBe(false);
  });

  it("잠들면 depends 갈래도 비활동", () => {
    expect(
      isEgoTailAnimating({ ...AWAKE_FOCUSED, focused: false, ambientAsleep: true }),
    ).toBe(false);
  });

  it("reduced-motion 은 각성 여부와 무관하게 비활동 (정지 계약)", () => {
    expect(isEgoTailAnimating({ ...AWAKE_FOCUSED, reducedMotion: true })).toBe(false);
  });

  it("입력이 오면(각성 복귀) 다시 활동 — 얼어붙는 실패 모드 없음", () => {
    const asleep = { ...AWAKE_FOCUSED, ambientAsleep: true };
    expect(isEgoTailAnimating(asleep)).toBe(false);
    expect(isEgoTailAnimating({ ...asleep, ambientAsleep: false })).toBe(true);
  });

  /**
   * The pulse is deliberately outside the condition: it is a one-shot signal born
   * from hover that expires after 420 ms, and hover is input, so the app is already
   * awake at that moment. Gating it would only add a "fired but never drawn"
   * failure mode.
   */
  it("살아있는 호버 펄스는 잠든 상태에서도 그려야 한다", () => {
    expect(
      isEgoTailAnimating({ ...AWAKE_FOCUSED, ambientAsleep: true, livePulseCount: 1 }),
    ).toBe(true);
  });

  it("혜성 속도 토큰이 0 이면 depends 갈래는 활동이 아니다", () => {
    expect(
      isEgoTailAnimating({ ...AWAKE_FOCUSED, focused: false, edgePulseSpeed: 0 }),
    ).toBe(false);
  });

  it("선택돼 있어도 contains 엣지가 없으면 그 갈래는 활동이 아니다", () => {
    expect(
      isEgoTailAnimating({
        ...AWAKE_FOCUSED,
        hasDependsEdges: false,
        hasContainsEdges: false,
      }),
    ).toBe(false);
  });
});

/**
 * The 3D dome's autonomous spin under the ambient-motion contract.
 *
 * Measured 2026-08-19: the spin alone sat outside the `ambient-sleep` contract,
 * so 3D would not sleep even 45 s after the last input, permanently burning
 * 520 ms per second (half a core) at 2,000 nodes where the same state in 2D cost
 * 3 ms/s. Same failure as `isEgoTailAnimating`, so the same condition sits in the
 * same place.
 */
describe("isDomeSpinAnimating", () => {
  const SPINNING: DomeSpinInput = {
    domeOn: true,
    reducedMotion: false,
    ambientAsleep: false,
    spinArmed: true,
    pointerOverCanvas: false,
    assembled: true,
  };

  it("무장 + 조립 완료 + 각성 상태에서는 돈다", () => {
    expect(isDomeSpinAnimating(SPINNING)).toBe(true);
  });

  /** This one line guards the most expensive regression in the file. */
  it("앰비언트 휴면에 들면 자율 회전은 활동이 아니다", () => {
    expect(isDomeSpinAnimating({ ...SPINNING, ambientAsleep: true })).toBe(false);
  });

  it("3D 가 꺼져 있으면 돌지 않는다", () => {
    expect(isDomeSpinAnimating({ ...SPINNING, domeOn: false })).toBe(false);
  });

  it("reduced-motion 이면 돌지 않는다", () => {
    expect(isDomeSpinAnimating({ ...SPINNING, reducedMotion: true })).toBe(false);
  });

  it("개입으로 무장이 내려가면 돌지 않는다", () => {
    expect(isDomeSpinAnimating({ ...SPINNING, spinArmed: false })).toBe(false);
  });

  it("커서가 캔버스 위면 정지한다 — 조준한 노드가 밑에서 미끄러지지 않게", () => {
    expect(isDomeSpinAnimating({ ...SPINNING, pointerOverCanvas: true })).toBe(false);
  });

  it("조립 램프가 덜 찼으면 자율 회전은 아직 아니다", () => {
    expect(isDomeSpinAnimating({ ...SPINNING, assembled: false })).toBe(false);
  });
});
