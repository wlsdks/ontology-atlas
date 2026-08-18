import { describe, expect, it } from "vitest";

import {
  CAMERA_TRANSITION_MAX_MS,
  CAMERA_TRANSITION_MIN_MS,
  cameraTransitionDurationMs,
  easeCameraKeyframe,
  easeInOutCubic,
  type CameraKeyframe,
  VAN_WIJK_RHO,
  vanWijkCameraKeyframe,
} from "./camera-easing";

describe("easeInOutCubic", () => {
  it("pins the endpoints and the symmetric midpoint", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 10);
  });

  it("clamps outside the unit interval instead of extrapolating", () => {
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
  });

  it("is symmetric about the midpoint (ease-in mirrors ease-out)", () => {
    for (const t of [0.1, 0.25, 0.4]) {
      expect(easeInOutCubic(t) + easeInOutCubic(1 - t)).toBeCloseTo(1, 10);
    }
  });

  it("starts slower than linear then overtakes (ease-in shape in the first half)", () => {
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25);
    expect(easeInOutCubic(0.75)).toBeGreaterThan(0.75);
  });

  it("is monotonic non-decreasing across the interval", () => {
    let prev = -Infinity;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = easeInOutCubic(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe("cameraTransitionDurationMs", () => {
  const at = (x: number, y: number, scale: number): CameraKeyframe => ({ x, y, scale });

  it("is the minimum for a no-op (same start and target)", () => {
    expect(cameraTransitionDurationMs(at(0, 0, 1), at(0, 0, 1))).toBe(CAMERA_TRANSITION_MIN_MS);
  });

  it("stays within the [min, max] clamp for any distance", () => {
    const huge = cameraTransitionDurationMs(at(0, 0, 0.24), at(99999, 99999, 2.6));
    expect(huge).toBeLessThanOrEqual(CAMERA_TRANSITION_MAX_MS);
    expect(huge).toBeGreaterThanOrEqual(CAMERA_TRANSITION_MIN_MS);
    expect(huge).toBe(CAMERA_TRANSITION_MAX_MS);
  });

  it("grows monotonically with pan distance (fixed scale)", () => {
    const d1 = cameraTransitionDurationMs(at(0, 0, 1), at(120, 0, 1));
    const d2 = cameraTransitionDurationMs(at(0, 0, 1), at(600, 0, 1));
    expect(d2).toBeGreaterThan(d1);
    expect(d1).toBeGreaterThanOrEqual(CAMERA_TRANSITION_MIN_MS);
  });

  it("grows monotonically with zoom distance (fixed pan)", () => {
    const d1 = cameraTransitionDurationMs(at(0, 0, 1), at(0, 0, 1.2));
    const d2 = cameraTransitionDurationMs(at(0, 0, 1), at(0, 0, 2.4));
    expect(d2).toBeGreaterThan(d1);
  });

  it("is deterministic (same inputs → identical output)", () => {
    const a = cameraTransitionDurationMs(at(10, 20, 1), at(300, 80, 1.6));
    const b = cameraTransitionDurationMs(at(10, 20, 1), at(300, 80, 1.6));
    expect(a).toBe(b);
  });
});

describe("easeCameraKeyframe", () => {
  const start: CameraKeyframe = { x: 0, y: 0, scale: 1 };
  const target: CameraKeyframe = { x: 200, y: -100, scale: 2 };

  it("returns the start at elapsed 0", () => {
    expect(easeCameraKeyframe(start, target, 0, 400)).toEqual(start);
  });

  it("returns the target exactly at/after the duration", () => {
    expect(easeCameraKeyframe(start, target, 400, 400)).toEqual(target);
    expect(easeCameraKeyframe(start, target, 999, 400)).toEqual(target);
  });

  it("returns the target for a non-positive duration (degenerate jump)", () => {
    expect(easeCameraKeyframe(start, target, 0, 0)).toEqual(target);
  });

  it("sits at the geometric midpoint of every axis at half time", () => {
    const mid = easeCameraKeyframe(start, target, 200, 400);
    expect(mid.x).toBeCloseTo(100, 10);
    expect(mid.y).toBeCloseTo(-50, 10);
    expect(mid.scale).toBeCloseTo(1.5, 10);
  });

  it("eases scale in lockstep with pan (all axes share the one warp)", () => {
    const quarter = easeCameraKeyframe(start, target, 100, 400);
    const e = easeInOutCubic(0.25);
    expect(quarter.x).toBeCloseTo(200 * e, 10);
    expect(quarter.scale).toBeCloseTo(1 + 1 * e, 10);
  });
});

/* ── van Wijk 최적 경로 ─────────────────────────────────────────────────── */

const VIEW_W = 1512;

/**
 * **광학 흐름** — van Wijk 가 실제로 일정하게 만든 그 값이다: 한 걸음의
 * 월드 이동량을 그 순간 화면에 담기는 월드 폭으로 나눈 것(= 화면 폭 대비
 * 몇 배가 흘러갔나). 픽셀로 재면 줌 항을 어떻게 섞을지가 임의값이 되어
 * 무엇을 재는지 흐려진다 — 그래서 논문의 무차원량을 그대로 쓴다.
 */
function opticalFlowSpread(
  path: (p: number) => CameraKeyframe,
  steps = 40,
): { min: number; max: number; ratio: number } {
  let prev = path(0);
  const flow: number[] = [];
  for (let i = 1; i <= steps; i += 1) {
    const now = path(i / steps);
    const du = Math.hypot(now.x - prev.x, now.y - prev.y);
    const w = (VIEW_W / prev.scale + VIEW_W / now.scale) / 2;
    const dlnw = Math.abs(Math.log(prev.scale / now.scale));
    /*
     * 논문의 계량이다. 해석적으로 확인한 항등식:
     *   u'(s)/w(s) = sech(ρs+r₀)/ρ · · · w'(s)/w(s) = −ρ·tanh(ρs+r₀)
     * 이므로 `ρ²(u'/w)² + (w'/w)²/ρ² = sech² + tanh² = 1` 이다. 즉 이 조합만이
     * 경로 위에서 상수이고, 그것이 van Wijk 가 최적화한 「지각되는 흐름」이다.
     * 이동만 재거나(du/w) ρ 를 반대로 걸면(hypot(du/w, ρ·dlnw)) 상수가 아니라서
     * 시험이 엉뚱한 결론을 낸다 — 이 라운드에서 그 둘을 다 밟아 봤다.
     */
    flow.push(Math.hypot((VAN_WIJK_RHO * du) / w, dlnw / VAN_WIJK_RHO));
    prev = now;
  }
  const min = Math.min(...flow);
  const max = Math.max(...flow);
  return { min, max, ratio: max / Math.max(min, 1e-12) };
}

describe("van Wijk 경로 — 광학 흐름이 일정하다", () => {
  const start: CameraKeyframe = { x: 0, y: 0, scale: 0.3 };
  const target: CameraKeyframe = { x: 4000, y: 1200, scale: 2.4 };

  it("끝점을 정확히 못박는다", () => {
    const a = easeCameraKeyframe(start, target, 0, 500, VIEW_W);
    const b = easeCameraKeyframe(start, target, 500, 500, VIEW_W);
    expect(a).toEqual(start);
    expect(b).toEqual(target);
  });

  /*
   * `/gate-probe` — **배선을 재는 단 하나의 단언이다.** 나머지는
   * `vanWijkCameraKeyframe` 을 직접 부르므로, `easeCameraKeyframe` 안에서
   * 경로를 다시 선형으로 되돌려도 전부 초록이다(실측으로 확인했다). 뷰포트
   * 폭을 준 호출이 실제로 경로를 타는지는 여기서만 잡힌다.
   */
  it("뷰포트 폭을 주면 경로가 바뀐다 — 안 주면 선형, 주면 van Wijk", () => {
    const a: CameraKeyframe = { x: 0, y: 0, scale: 1 };
    const b: CameraKeyframe = { x: 12000, y: 0, scale: 1 };
    const flat = easeCameraKeyframe(a, b, 200, 400);
    const path = easeCameraKeyframe(a, b, 200, 400, VIEW_W);
    expect(flat.scale, "폭 없는 호출이 배율을 건드렸다 — 선형 폴백이 깨졌다").toBeCloseTo(1, 9);
    expect(path.scale, "폭을 줬는데 배율이 안 물러났다 — 경로가 선형으로 되돌았다").toBeLessThan(0.95);
  });

  it("배율을 **기하** 로 보간한다 — 1→4 의 중간은 2.5 가 아니라 2 쪽이다", () => {
    const half = vanWijkCameraKeyframe({ x: 0, y: 0, scale: 1 }, { x: 0, y: 0, scale: 4 }, 0.5, VIEW_W);
    expect(half.scale).toBeCloseTo(2, 6);
    expect(Math.abs(half.scale - 2)).toBeLessThan(Math.abs(half.scale - 2.5));
  });

  /*
   * `/gate-probe` — **이 단언이 van Wijk 를 lerp 와 가르는 유일한 지점이다.**
   * 어떤 축별 보간도 중간 배율이 두 끝점 사이에 갇히므로, 「중간에 더 물러난다」
   * 는 선형으로는 원리적으로 만들 수 없다. 경로를 lerp 로 되돌리면 여기가
   * 빨개진다(실측으로 확인).
   */
  it("멀리 갈수록 중간에 물러난다 — 같은 배율의 먼 이동에서 중간이 더 축소된다", () => {
    const a: CameraKeyframe = { x: 0, y: 0, scale: 1 };
    const b: CameraKeyframe = { x: 12000, y: 0, scale: 1 };
    const mid = vanWijkCameraKeyframe(a, b, 0.5, VIEW_W);
    expect(mid.scale).toBeLessThan(a.scale);
    expect(mid.scale).toBeLessThan(b.scale);
  });

  it("이동이 0 인 순수 줌에서도 유한한 값을 낸다 (0/0 갈래)", () => {
    const a: CameraKeyframe = { x: 10, y: -5, scale: 0.5 };
    const b: CameraKeyframe = { x: 10, y: -5, scale: 3 };
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      const k = vanWijkCameraKeyframe(a, b, p, VIEW_W);
      expect(Number.isFinite(k.x)).toBe(true);
      expect(Number.isFinite(k.y)).toBe(true);
      expect(Number.isFinite(k.scale)).toBe(true);
      expect(k.scale).toBeGreaterThan(0);
    }
    expect(vanWijkCameraKeyframe(a, b, 1, VIEW_W).scale).toBeCloseTo(3, 6);
  });

  it("두 상태가 같으면 목표로 스냅한다 — 퇴화에서 NaN 이 안 샌다", () => {
    const a: CameraKeyframe = { x: 7, y: 9, scale: 1.25 };
    const k = vanWijkCameraKeyframe(a, { ...a }, 0.5, VIEW_W);
    expect(k.x).toBeCloseTo(7, 9);
    expect(k.scale).toBeCloseTo(1.25, 9);
  });

  it("광학 흐름이 선형 보간보다 훨씬 고르다 — 이것이 논문이 최적화한 값이다", () => {
    const wijk = opticalFlowSpread((p) => vanWijkCameraKeyframe(start, target, p, VIEW_W));
    const linear = opticalFlowSpread((p) => ({
      x: start.x + (target.x - start.x) * p,
      y: start.y + (target.y - start.y) * p,
      scale: start.scale + (target.scale - start.scale) * p,
    }));
    /*
     * 1.00 = 완전 균일. van Wijk 경로는 **정의상** 이 계량에서 상수이므로
     * 유한 표본 잔차만 남아야 하고, 선형 보간은 크게 흔들려야 한다. 두
     * 단언을 같이 두는 이유: 앞의 것만 두면 두 경로를 다 망가뜨려도 초록이고,
     * 뒤의 것만 두면 「선형이 원래 나쁘다」만 말하지 우리 경로가 좋다는 말을
     * 못 한다.
     */
    expect(
      wijk.ratio,
      `van Wijk 경로가 자기 계량에서 상수가 아니다 (${wijk.ratio.toFixed(4)}×) — 식이 틀렸다`,
    ).toBeLessThan(1.02);
    expect(
      linear.ratio,
      `선형 보간이 이 계량에서 안 흔들린다 (${linear.ratio.toFixed(2)}×) — 표본이 차이를 못 본다`,
    ).toBeGreaterThan(1.5);
  });
});
