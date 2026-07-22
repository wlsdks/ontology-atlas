/**
 * Camera-space conversions — `worldToScreen`/`screenToWorld`/`fitWorldTarget`/
 * `hitTestWorld` (prototype `worldToScreen()`/`screenToWorld()`/`fitTarget()`/
 * `hitTest()`, `docs/prototypes/topology-b2plus.html` §8/§9).
 *
 * Camera convention (`engine/spring.ts`/`engine/momentum.ts` JSDoc — already
 * committed, tested): `camera.x`/`camera.y` are the WORLD point the camera is
 * centered on, `camera.scale` the world-to-screen zoom factor — the
 * prototype's own convention, not `topology-map-canvas/lib/camera.ts`'s
 * `{tx,ty,k}` translate convention (a different parameterization the already-
 * built engine modules don't use). These are this file's local, tiny
 * (prototype-faithful) equivalents of that lib's `fitBounds`/pan math, kept
 * in the convention the engine layer expects.
 */

import type { CameraAxes, CameraTarget } from "../engine/camera";
import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";
import { computeClusterDiscBounds, computeEgoBounds, radiusForKind, type TopologyWorld } from "./topology-world";
import type { WorldNode } from "./topology-world";

interface Point {
  x: number;
  y: number;
}

export function worldToScreen(camera: CameraAxes, viewportWidth: number, viewportHeight: number, wx: number, wy: number): Point {
  return {
    x: (wx - camera.x.value) * camera.scale.value + viewportWidth / 2,
    y: (wy - camera.y.value) * camera.scale.value + viewportHeight / 2,
  };
}

export function screenToWorld(camera: CameraAxes, viewportWidth: number, viewportHeight: number, sx: number, sy: number): Point {
  return {
    x: (sx - viewportWidth / 2) / camera.scale.value + camera.x.value,
    y: (sy - viewportHeight / 2) / camera.scale.value + camera.y.value,
  };
}

/** Ported from the prototype's `fitTarget()` — centers `bounds` in the viewport, clamped to `[scaleMin, maxScale]`. */
export function fitWorldTarget(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewportWidth: number,
  viewportHeight: number,
  maxScale: number,
  scaleMin: number,
): CameraTarget {
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);
  let scale = Math.min(viewportWidth / w, viewportHeight / h);
  scale = Math.min(scale, maxScale);
  scale = Math.max(scale, scaleMin);
  return {
    tx: (bounds.minX + bounds.maxX) / 2,
    ty: (bounds.minY + bounds.maxY) / 2,
    tscale: scale,
  };
}

/** Ported from the prototype's `hitTest()` — nearest node under `(screenX, screenY)`, `null` if none is within its padded radius. */
export function hitTestWorld(
  world: TopologyWorld,
  camera: CameraAxes,
  viewportWidth: number,
  viewportHeight: number,
  tokens: TopologyV2Tokens,
  screenX: number,
  screenY: number,
  /** Optional filter — skips nodes that aren't currently hittable (e.g. semantic-zoom-hidden tiers). Defaults to "all hittable". */
  isHittable?: (node: WorldNode) => boolean,
  /**
   * S5 — optional per-node render offset (world units). The draw pass shifts
   * deep realm nodes by the depth-parallax offset; passing the SAME offset here
   * keeps the clickable disc under where the node is actually drawn. Defaults to
   * no offset (the common case).
   */
  renderOffsetForNode?: (node: WorldNode) => Point,
): string | null {
  let bestId: string | null = null;
  let bestDistance = Infinity;
  for (const node of world.nodes) {
    if (isHittable && !isHittable(node)) continue;
    const off = renderOffsetForNode ? renderOffsetForNode(node) : null;
    const screen = worldToScreen(
      camera,
      viewportWidth,
      viewportHeight,
      node.x + (off?.x ?? 0),
      node.y + (off?.y ?? 0),
    );
    const effRadius = radiusForKind(node.kind, tokens) * node.magnitudeScale * camera.scale.value + 5;
    const distance = Math.hypot(screenX - screen.x, screenY - screen.y);
    if (distance <= effRadius && distance < bestDistance) {
      bestId = node.id;
      bestDistance = distance;
    }
  }
  return bestId;
}

/**
 * DECOUPLING (topology-map-v2 axis split): `farT` (visual expression) and tier
 * visibility used to ride the same camera scale. `overviewScaleRef` feeds
 * `model/altitude.ts`'s `farHigh`/`farLow` as the "100%" anchor —
 * `farHigh = overviewScale * 0.92`, `farLow = overviewScale * 0.62`.
 *
 * The redesign wants the DEFAULT overview to read as CIRCUIT (`farT ≈ 0`) — a
 * machined, engraved-numeral look, not the flat constellation — while still
 * showing only the project/domain/hub spine (no fan-arc soup). Circuit needs
 * the camera at/above `farHigh`; the anti-soup behavior now comes from a
 * SEPARATE zoom-ratio gate (`model/tier-visibility.ts`), not from `farT`.
 *
 * So the entry scale is the tight fit × `--topology-v2-overview-entry-ratio`
 * (0.95), kept ABOVE the far-high ratio (0.92) so `farT` lands at 0 on load by
 * construction, for every dataset. The tight fit itself is unchanged and still
 * anchors `overviewScaleRef` (the altitude band's 100% reference) AND the
 * zoom-ratio's `overviewEntryScale = fit.tscale × overviewEntryRatio`. Zooming
 * OUT from here still crosses `farHigh`→`farLow`, so the far-field
 * constellation/diffraction expression still appears when the user pulls back.
 */
/**
 * Fixed-chrome safe insets (px) — the left ReaderLens panel, right popover rail,
 * top utility lane, bottom hint. Optional on the token param so the pure
 * camera-math tests (which pass a token literal without insets) still type-check
 * and behave as a zero-inset full-viewport fit.
 */
export type SafeInsetTokens = Partial<
  Pick<TopologyV2Tokens, "safeInsetLeft" | "safeInsetRight" | "safeInsetTop" | "safeInsetBottom">
>;

interface SafeInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * 검수 Pass B 결함 1 (2026-07-23) — 오버뷰 핏은 노드 지오메트리 bounds 만
 * safe 영역에 맞춰, 최하단 스파인 노드의 라벨 anchor(= 노드 아래
 * `radius + LABEL_OFFSET`, frame-draw:794 — 컬은 폰트 높이가 아니라 anchor
 * 만 본다)가 라벨 safe-rect 컬 라인 바로 밖으로 밀려 1440×900 기본 뷰에서만
 * 조용히 사라졌다 (1920 은 가로 제약 핏이라 세로 여유가 남아 미발현). 핏
 * 계산에서만 하단 인셋에 여유를 예약한다 — 라벨 컬 rect 와 카메라 이동
 * 가능 영역은 불변. 값 = max LABEL_OFFSET(project 20) + 슬랙 4 (Guardian
 * 산술 검증 — `render/labels.ts` LABEL_OFFSET 변경 시 함께 갱신할 것).
 */
const OVERVIEW_LABEL_BOTTOM_ALLOWANCE = 24;

function readSafeInsets(tokens: SafeInsetTokens): SafeInsets {
  return {
    left: tokens.safeInsetLeft ?? 0,
    right: tokens.safeInsetRight ?? 0,
    top: tokens.safeInsetTop ?? 0,
    // 인셋 미지정(= 크롬 없는 순수 핏 테스트 계약)은 종전과 동일하게 0 —
    // 라벨 여유는 실제 하단 크롬 인셋이 존재할 때만 얹는다.
    bottom:
      tokens.safeInsetBottom == null
        ? 0
        : tokens.safeInsetBottom + OVERVIEW_LABEL_BOTTOM_ALLOWANCE,
  };
}

/**
 * The tight-fit scale against the VISIBLE area (viewport minus the fixed
 * chrome). This is the altitude band's "100%" anchor (`overviewScaleRef`) —
 * derived here so the anchor and the panel-aware overview target stay in sync.
 */
export function computeOverviewFitScale(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewportWidth: number,
  viewportHeight: number,
  tokens: Pick<TopologyV2Tokens, "cameraScaleMax" | "cameraScaleMin"> & SafeInsetTokens,
): number {
  const insets = readSafeInsets(tokens);
  const effW = Math.max(1, viewportWidth - insets.left - insets.right);
  const effH = Math.max(1, viewportHeight - insets.top - insets.bottom);
  return fitWorldTarget(bounds, effW, effH, tokens.cameraScaleMax, tokens.cameraScaleMin).tscale;
}

/**
 * PANEL-AWARE overview fit (Design Guardian 카메라 반려): the fit used to center
 * on the full viewport, so the left third of the graph hid behind the ReaderLens
 * panel. Now the scale is computed against the VISIBLE area (viewport minus the
 * safe insets), and the camera center is shifted so the graph's own center lands
 * at the visible-area center rather than the raw screen center. With zero insets
 * this reduces exactly to the previous behavior (`topology-camera-math.test.ts`).
 */
export function computeOverviewCameraTarget(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewportWidth: number,
  viewportHeight: number,
  tokens: Pick<TopologyV2Tokens, "cameraScaleMax" | "cameraScaleMin" | "overviewEntryRatio"> & SafeInsetTokens,
): CameraTarget {
  const insets = readSafeInsets(tokens);
  const fitScale = computeOverviewFitScale(bounds, viewportWidth, viewportHeight, tokens);
  const tscale = Math.min(tokens.cameraScaleMax, Math.max(tokens.cameraScaleMin, fitScale * tokens.overviewEntryRatio));
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  // worldToScreen centers on the raw screen midpoint; offset the camera so the
  // graph center renders at the visible-area midpoint instead.
  return {
    tx: centerX - (insets.left - insets.right) / (2 * tscale),
    ty: centerY - (insets.top - insets.bottom) / (2 * tscale),
    tscale,
  };
}

/**
 * C1 A1 — the camera's REAL (interactive) zoom-in ceiling, viewport-relative.
 *
 * Audit finding: the overview entry scale is viewport-proportional (≈1.5 at
 * 1512×917), while `--topology-v2-camera-scale-max` is an ABSOLUTE number
 * (2.6). Binding the camera's zoom-in clamp to that absolute value caps
 * `zoomRatio` at ≈1.8 regardless of what the tier-reveal bands need — the
 * capability band (1.5→2.0) never finishes revealing (max ~40% alpha, below
 * the 0.5 hit threshold, so it's unclickable) and the element band
 * (2.3→2.85) is never reachable at all. Worse on larger viewports, where the
 * entry scale is smaller still.
 *
 * The fix: the effective max is `overviewEntryScale × maxZoomRatio` — constant
 * in RATIO terms across every viewport/dataset, not in absolute scale terms.
 * `--topology-v2-camera-scale-max` is RETIRED as the binding constraint and
 * kept only as a safety fallback for the degenerate case where
 * `overviewEntryScale` is somehow non-positive (camera not yet initialized).
 */
export function computeEffectiveCameraScaleMax(
  overviewEntryScale: number,
  maxZoomRatio: number,
  absoluteFallback: number,
): number {
  if (!(overviewEntryScale > 0)) return absoluteFallback;
  return overviewEntryScale * maxZoomRatio;
}

/**
 * C1 A1 follow-up (owner feedback — wheel zoom-OUT floor) — the symmetric
 * fix for `computeEffectiveCameraScaleMax`, in the other direction. The same
 * absolute-vs-ratio mismatch applies to the zoom-OUT floor
 * (`--topology-v2-camera-scale-min`, 0.24): on a large viewport the
 * interactive zoom-out range is squeezed to almost nothing, and on a small
 * viewport it can shrink the spine to a speck before the far-field
 * constellation crossfade even engages. `--topology-v2-camera-min-zoom-ratio`
 * (0.5, i.e. half the overview entry scale) replaces the absolute floor as
 * the binding constraint for the same three call sites (spring clamp, wheel
 * clamp) — the fit-scale computations keep the absolute floor as their own
 * sanity bound, same reasoning as `computeEffectiveCameraScaleMax`.
 */
export function computeEffectiveCameraScaleMin(
  overviewEntryScale: number,
  minZoomRatio: number,
  absoluteFallback: number,
): number {
  if (!(overviewEntryScale > 0)) return absoluteFallback;
  return overviewEntryScale * minZoomRatio;
}

/**
 * Camera target for the current focus state — the full-graph overview fit
 * when `focusedSlug` is `null`, or the clicked node + its 1-hop ego bbox
 * (`--topology-v2-focus-bbox-margin`) otherwise (`docs/TOPOLOGY-V2-DESIGN.md`
 * §3.2 "카메라가 노드+1-hop 이웃 bbox 로 스프링 다이브"). `null` only if
 * `focusedSlug` doesn't resolve to a known node.
 *
 * Dive-framing fix (owner symptom: "clicking a node dives TOO deep —
 * over-zoomed, cluttered, labels colliding; pleasant view only after zooming
 * way out"). C1 A3's `revealFloor = overviewEntryScale × capability.fullRatio`
 * forced EVERY dive to zoomRatio ≥ 2.0 regardless of the ego cluster's own
 * size — a wide-fan domain (many spread-out neighbors) got zoomed in far past
 * what fitting that fan actually needed. The floor is also redundant: C1 A2's
 * ego-tier exemption (`model/tier-visibility.ts#effectiveNodeAlpha`) already
 * keeps the focused node + its 1-hop neighbors visible/clickable at ANY zoom,
 * so nothing needs a minimum zoom-in to "reveal" them anymore.
 *
 * The dive target is now simply `clamp(fitScale(egoBounds × marginRatio),
 * overviewEntryScale, effectiveMax)`: fit the WHOLE ego set (padded by
 * `--topology-v2-focus-bbox-margin`, a multiplicative ratio ~1.15 so the
 * padding scales with cluster size instead of a fixed px pad), floored at the
 * overview's OWN entry scale (a "dive" never zooms OUT past the overview
 * itself), capped at the ratio-based effective max (the degenerate tiny-ego
 * case, where the raw fit would zoom in far past readable).
 */
export function computeFocusCameraTarget(
  world: TopologyWorld,
  tokens: TopologyV2Tokens,
  viewportWidth: number,
  viewportHeight: number,
  focusedSlug: string | null,
  /** `overviewScale × overviewEntryRatio` at the current viewport — the zoom-ratio's "1.0" anchor (`model/tier-visibility.ts#computeZoomRatio`). */
  overviewEntryScale: number,
  /**
   * S8 결함 4 — 영역 전개 중이면 그 영역 멤버 Set. ego bbox 를 이 안으로 제한해
   * 결계 밖 fling 이웃이 bbox 를 부풀려 카메라가 화면 밖으로 날아가는 것을 막는다.
   * 생략/null 이면 전역 ego(기존 계약 불변).
   */
  restrictIds?: ReadonlySet<string> | null,
): CameraTarget | null {
  if (focusedSlug === null) {
    // Overview fits the SPINE bbox (project+domain+hub — the only tier drawn at
    // entry), not the full 295-node bounds; see `topology-world.ts#spineBounds`.
    return computeOverviewCameraTarget(world.spineBounds, viewportWidth, viewportHeight, tokens);
  }
  const egoBounds = computeEgoBounds(world, tokens, focusedSlug, restrictIds);
  if (!egoBounds) return null;

  // Multiplicative margin (not additive px) so a wide ego cluster gets
  // proportionally more breathing room than a tiny one, uniformly scaled
  // about the bbox's own center.
  const marginRatio = tokens.focusBboxMargin;
  const centerX = (egoBounds.minX + egoBounds.maxX) / 2;
  const centerY = (egoBounds.minY + egoBounds.maxY) / 2;
  const w = Math.max(1, (egoBounds.maxX - egoBounds.minX) * marginRatio);
  const h = Math.max(1, (egoBounds.maxY - egoBounds.minY) * marginRatio);
  const fitScale = Math.min(viewportWidth / w, viewportHeight / h);
  const effectiveMax = computeEffectiveCameraScaleMax(overviewEntryScale, tokens.cameraMaxZoomRatio, tokens.cameraScaleMax);
  const scale = Math.min(effectiveMax, Math.max(overviewEntryScale, fitScale));

  return {
    tx: centerX,
    ty: centerY,
    tscale: scale,
  };
}

/**
 * S2 파트 5B — 펼친 클러스터 디스크(부모 + 직속 자식 부챗살)로의 카메라 다이브
 * 타깃. `computeFocusCameraTarget` 의 ego-fit 분기와 같은 계약(마진 비율 패딩 +
 * `[overviewEntryScale, effectiveMax]` clamp) — 대상만 ego 이웃이 아니라 contains
 * 자식 디스크다. 칩을 펼치면 이 타깃으로 스프링 다이브해 자식이 tier 알파로
 * 자연히 리빌된다. `parentId` 미해결/자식 없음이면 `null`(카메라 미이동).
 */
export function computeClusterFitTarget(
  world: TopologyWorld,
  tokens: TopologyV2Tokens,
  viewportWidth: number,
  viewportHeight: number,
  parentId: string,
  overviewEntryScale: number,
): CameraTarget | null {
  const disc = computeClusterDiscBounds(world, tokens, parentId);
  if (!disc) return null;
  const marginRatio = tokens.focusBboxMargin;
  const centerX = (disc.minX + disc.maxX) / 2;
  const centerY = (disc.minY + disc.maxY) / 2;
  const w = Math.max(1, (disc.maxX - disc.minX) * marginRatio);
  const h = Math.max(1, (disc.maxY - disc.minY) * marginRatio);
  const fitScale = Math.min(viewportWidth / w, viewportHeight / h);
  const effectiveMax = computeEffectiveCameraScaleMax(overviewEntryScale, tokens.cameraMaxZoomRatio, tokens.cameraScaleMax);
  const scale = Math.min(effectiveMax, Math.max(overviewEntryScale, fitScale));
  return { tx: centerX, ty: centerY, tscale: scale };
}
