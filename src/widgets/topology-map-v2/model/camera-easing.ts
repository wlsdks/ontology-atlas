/**
 * Camera transition easing — the reusable pure core behind v2's programmatic
 * camera moves (focus dive, cluster-disc dive, "fit view"/relayout recenter).
 *
 * WHY (S3 마감 폴리시, fable 설계): the interactive camera rides a critically-
 * damped spring (`engine/camera.ts`) — an ease-OUT curve that starts fast and
 * decays. For a PROGRAMMATIC move (the user clicked a node, we're taking them
 * somewhere) a symmetric ease-in-out reads more deliberate and cinematic: the
 * camera accelerates out of rest, cruises, and settles — van Wijk's "smooth
 * and efficient zooming and panning" (2004) in spirit, with a distance-
 * proportional duration so a small nudge is quick and a big leap is given time
 * to be legible. This module is the pure, viewport-agnostic math; the loop
 * (`ui/use-topology-loop.ts`) owns the tween STATE (start keyframe, start time)
 * and drives the camera through `easeCameraKeyframe` each frame while a
 * transition is in flight, handing back to the spring the instant an
 * interactive gesture (wheel/drag) interrupts.
 *
 * S4 ("영역 전개" 연출) will reuse `easeInOutCubic` + `easeCameraKeyframe`
 * directly — that's why the easing lives here as a standalone module rather
 * than inline in the loop.
 *
 * Constants (min/max duration, reference distances) are documented module
 * constants, not `--topology-v2-*` tokens — same "no token yet" precedent as
 * `engine/camera.ts#DEFAULT_PAN_BOUNDS_MARGIN` and
 * `ui/topology-pointer-handlers.ts#RIPPLE_PER_NEIGHBOR_DELAY_MS`. They govern
 * feel (timing), not a themable surface value.
 */

import { CAMERA_TWEEN_MAX_MS, CAMERA_TWEEN_MIN_MS } from "./motion-physics";

/** A camera state snapshot — the three animated axes, value-only (no velocity). */
export interface CameraKeyframe {
  x: number;
  y: number;
  scale: number;
}

/**
 * A live programmatic camera transition. Owned as a ref by
 * `ui/use-topology-loop.ts` (captured when a focus dive / cluster dive / fit
 * fires) and read each frame to drive the camera through `easeCameraKeyframe`;
 * an interactive gesture (wheel/drag, via `ui/topology-pointer-handlers.ts`)
 * clears it to hand control back to the spring.
 */
export interface CameraTween {
  start: CameraKeyframe;
  target: CameraKeyframe;
  /** `performance.now()`-compatible start timestamp (same clock as the rAF `now`). */
  startMs: number;
  durationMs: number;
}

/**
 * Clamp of the distance-proportional transition duration (ms). van Wijk's
 * spirit: never so short it snaps, never so long it drags. R4 (모션 헌법):
 * derived from the house `CAMERA_TWEEN_MIN/MAX_MS` in `model/motion-physics.ts`
 * so the widget's motion feel constants have a single home — value unchanged.
 */
export const CAMERA_TRANSITION_MIN_MS = CAMERA_TWEEN_MIN_MS;
export const CAMERA_TRANSITION_MAX_MS = CAMERA_TWEEN_MAX_MS;

/**
 * Reference screen-pan distance (px) that, on its own, earns the full duration.
 * The pan term is measured in screen pixels (world Δ × the average of the two
 * scales) so the same world leap feels proportionally longer when zoomed in.
 */
const REF_PAN_PX = 1400;
/**
 * Reference zoom distance, in octaves (|log2(scaleRatio)|), that on its own
 * earns the full duration. Doubling/halving the scale is ~1 octave.
 */
const REF_ZOOM_OCTAVES = 2.2;

const SCALE_EPSILON = 1e-6;

/**
 * Standard cubic ease-in-out on `[0,1]` (clamps `t` outside the unit range).
 * `0→0`, `1→1`, `0.5→0.5`; symmetric, C¹-continuous at the endpoints (zero
 * slope), so the camera leaves and arrives at rest.
 */
export function easeInOutCubic(t: number): number {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/**
 * Distance-proportional transition duration (ms), clamped to
 * `[CAMERA_TRANSITION_MIN_MS, CAMERA_TRANSITION_MAX_MS]`. Combines a screen-
 * space pan term and a zoom-octave term; either alone reaching its reference
 * distance saturates to the max. Monotonic non-decreasing in both pan and zoom
 * distance. Pure — no viewport/DOM knowledge (pan is pre-projected via scale).
 */
export function cameraTransitionDurationMs(start: CameraKeyframe, target: CameraKeyframe): number {
  const panWorld = Math.hypot(target.x - start.x, target.y - start.y);
  const avgScale = (Math.max(start.scale, SCALE_EPSILON) + Math.max(target.scale, SCALE_EPSILON)) / 2;
  const panScreen = panWorld * avgScale;
  const zoomOctaves = Math.abs(
    Math.log2(Math.max(target.scale, SCALE_EPSILON) / Math.max(start.scale, SCALE_EPSILON)),
  );
  const normalized = panScreen / REF_PAN_PX + zoomOctaves / REF_ZOOM_OCTAVES;
  const span = CAMERA_TRANSITION_MAX_MS - CAMERA_TRANSITION_MIN_MS;
  return Math.min(
    CAMERA_TRANSITION_MAX_MS,
    CAMERA_TRANSITION_MIN_MS + Math.min(1, normalized) * span,
  );
}

/**
 * The eased camera keyframe at `elapsedMs` into a `durationMs` transition from
 * `start` to `target`. `elapsedMs ≤ 0` returns `start`; `elapsedMs ≥ durationMs`
 * (or a non-positive duration) returns `target` exactly. Each axis is a linear
 * interpolation warped by `easeInOutCubic` — including `scale`, so the zoom and
 * the pan arrive together.
 */
/**
 * ── van Wijk 최적 경로 — 「lerp 처럼 보이는 것」의 정체 ────────────────────
 *
 * 이 모듈은 오랫동안 x·y·scale 을 **각각 선형 보간**하고 시간만 ease-in-out
 * 으로 휘었다. 그런데 카메라가 이동과 확대를 동시에 할 때 그 조합은 **화면
 * 위 광학 흐름이 폭발**한다: 확대되어 있는 구간에서는 같은 월드 이동량이 훨씬
 * 큰 픽셀 이동이 되므로, 가까운 것들이 화면을 가로질러 «휙» 지나간다.
 * 모션 리뷰에서 아마추어 티로 지목되는 바로 그 인상이고, 이 파일의 원래
 * 주석이 *"van Wijk 를 정신적으로 따른다"* 고 적어 둔 그 논문이 정확히 이
 * 문제를 푼 것이다.
 *
 * van Wijk & Nuij, *Smooth and Efficient Zooming and Panning*, InfoVis 2003
 * (https://vanwijk.win.tue.nl/zoompan.pdf) 는 «지각되는 광학 흐름이 일정한»
 * 경로를 해석적으로 푼다. 결과는 카메라가 **한 번 물러났다가 이동하고 다시
 * 파고드는** 쌍곡선 궤적이다. d3 의 `interpolateZoom` 이 같은 식이다.
 *
 * 두 가지가 동시에 고쳐진다:
 * - **줌이 로그 공간에서 보간된다.** 배율을 산술 보간하면 1→4 의 중간이 2.5 다.
 *   사람이 «절반쯤 왔다»고 느끼는 값은 2(기하 중간)다. 이 한 가지만으로도
 *   확대·축소의 체감이 달라진다.
 * - **이동과 줌이 서로를 안다.** 멀리 갈수록 더 물러나므로, 지나가는 동안
 *   화면에 남는 것은 «맥락»이지 «흐릿한 줄»이 아니다.
 *
 * ρ 는 논문의 사용자 실험 최적값 **1.42** 를 쓴다(d3 기본은 √2 로 사실상 같다).
 *
 * ## 시간 휨은 그대로 둔다
 *
 * 논문은 등속 이동을 가정한다. UI 에서는 정지에서 출발하고 정지로 도착하는
 * 편이 «누가 데려간다»로 읽히므로, 경로는 van Wijk 로 두고 **경로 위 진행률**
 * 에만 기존 `easeInOutCubic` 을 그대로 얹는다. 새 이징을 만들지 않는다.
 */
export const VAN_WIJK_RHO = 1.42;

/** 배율 → 화면에 담기는 월드 폭. van Wijk 의 `w` 다(같은 단위여야 식이 성립한다). */
function worldWidthFor(scale: number, viewportWidthPx: number): number {
  return viewportWidthPx / Math.max(scale, SCALE_EPSILON);
}

/**
 * 경로 위 진행률 `p`(0..1, 이미 이징이 걸린 값) 에서의 카메라 상태.
 *
 * `viewportWidthPx` 가 필요한 이유: van Wijk 의 식은 이동 거리(월드)와 보이는
 * 폭(월드)의 **비**로 굴러간다. 배율만으로는 그 비를 만들 수 없다.
 */
export function vanWijkCameraKeyframe(
  start: CameraKeyframe,
  target: CameraKeyframe,
  p: number,
  viewportWidthPx: number,
  rho = VAN_WIJK_RHO,
): CameraKeyframe {
  const w0 = worldWidthFor(start.scale, viewportWidthPx);
  const w1 = worldWidthFor(target.scale, viewportWidthPx);
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const d2 = dx * dx + dy * dy;
  const d1 = Math.sqrt(d2);
  const rho2 = rho * rho;
  const rho4 = rho2 * rho2;

  // 순수 줌(이동 0) — 쌍곡선 해가 0/0 이 되므로 로그 보간으로 떨어진다.
  // 이 갈래가 없으면 같은 자리에서 확대만 할 때 NaN 이 나온다.
  if (d2 < 1e-9) {
    const w = w0 * Math.pow(w1 / w0, p);
    return { x: target.x, y: target.y, scale: viewportWidthPx / w };
  }

  const b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1);
  const b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1);
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
  const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const S = (r1 - r0) / rho;

  // S 가 0 에 수렴하는 퇴화(두 상태가 사실상 같다) — 목표로 스냅한다.
  if (!Number.isFinite(S) || Math.abs(S) < 1e-9) {
    return { x: target.x, y: target.y, scale: target.scale };
  }

  const s = p * S;
  const coshr0 = Math.cosh(r0);
  const u = (w0 / rho2) * (coshr0 * Math.tanh(rho * s + r0) - Math.sinh(r0));
  const w = (w0 * coshr0) / Math.cosh(rho * s + r0);
  return {
    x: start.x + (u / d1) * dx,
    y: start.y + (u / d1) * dy,
    scale: viewportWidthPx / w,
  };
}

export function easeCameraKeyframe(
  start: CameraKeyframe,
  target: CameraKeyframe,
  elapsedMs: number,
  durationMs: number,
  /**
   * 뷰포트 폭(px) — 주면 **van Wijk 최적 경로**를 탄다(위 독블록). 생략하면
   * 축별 선형 보간으로 떨어진다. 선택 인자인 이유는 하나뿐이다: 이 함수는
   * 뷰포트를 모르는 순수 수학으로 태어났고, 폭을 못 대는 호출부가 아직
   * 남아 있어도 그 호출부가 깨지지 않아야 한다.
   */
  viewportWidthPx?: number,
): CameraKeyframe {
  const p = durationMs <= 0 ? 1 : elapsedMs / durationMs;
  const e = easeInOutCubic(p);
  if (viewportWidthPx !== undefined && viewportWidthPx > 0) {
    // 끝점은 정확히 못박는다 — 경로 수학의 반올림이 도착점을 몇 월드 단위
    // 어긋나게 두면 그 어긋남이 다음 제스처의 앵커로 굳는다.
    if (p <= 0) return { ...start };
    if (p >= 1) return { ...target };
    return vanWijkCameraKeyframe(start, target, e, viewportWidthPx);
  }
  return {
    x: start.x + (target.x - start.x) * e,
    y: start.y + (target.y - start.y) * e,
    scale: start.scale + (target.scale - start.scale) * e,
  };
}
