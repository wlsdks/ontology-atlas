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

import { computePanBounds, type CameraAxes, type CameraTarget, type PanBounds } from "../engine/camera";
import { LABEL_OFFSET } from "../render/labels";
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
 * **패널을 뺀 자리 가운데에 무엇을 둘 카메라인가** — 이 식이 사는 단 하나의 곳.
 *
 * `worldToScreen` 은 화면의 **날 가운데**를 기준으로 그리므로, 보이는 영역의
 * 가운데에 두려면 카메라를 좌우 인셋 차의 절반만큼 되민다. **배율로 나누는 것**이
 * 요점이다 — 같은 화면 오프셋이 배율이 클수록 더 짧은 월드 거리다.
 *
 * ⚠️ 이 식은 한때 **네 곳**에 각각 적혀 있었다(개요 · 팬 목줄 · 그리고 하루 동안은
 * 호출부의 「자유 영역」 시프트까지). 그중 초점 다이브만 이 식을 **아예 안 갖고
 * 있어서**, 노드를 고르면 그것을 설명하는 패널 뒤로 들어갈 수 있었다. 사본이
 * 여럿이면 빠진 사본이 생기는 쪽이 기본값이다 — 그래서 한 곳으로 모았다.
 */
export function centerForInsets(
  cx: number,
  cy: number,
  insets: SafeInsets,
  scale: number,
): { tx: number; ty: number } {
  const safeScale = Math.abs(scale) < 1e-6 ? 1 : scale;
  return {
    tx: cx - (insets.left - insets.right) / (2 * safeScale),
    ty: cy - (insets.top - insets.bottom) / (2 * safeScale),
  };
}

/**
 * 검수 Pass B 결함 1 (2026-07-23) — 오버뷰 핏은 노드 지오메트리 bounds 만
 * safe 영역에 맞춰, 최하단 스파인 노드의 라벨 anchor(= 노드 아래
 * `radius + LABEL_OFFSET`, frame-draw:794 — 컬은 폰트 높이가 아니라 anchor
 * 만 본다)가 라벨 safe-rect 컬 라인 바로 밖으로 밀려 1440×900 기본 뷰에서만
 * 조용히 사라졌다 (1920 은 가로 제약 핏이라 세로 여유가 남아 미발현). 핏
 * 계산에서만 하단 인셋에 여유를 예약한다 — 라벨 컬 rect 와 카메라 이동
 * 가능 영역은 불변.
 *
 * 값은 `render/labels.ts` 의 `LABEL_OFFSET` 에서 파생 — max LABEL_OFFSET
 * (현재 project 20) + 슬랙 4. 리터럴 24 를 따로 유지하면 LABEL_OFFSET 이
 * 바뀔 때 이 예약분이 조용히 드리프트할 수 있어 (Guardian follow-up),
 * 상수 대신 매 프레임 파생시켜 항상 동기화 상태를 보장한다.
 */
const OVERVIEW_LABEL_BOTTOM_ALLOWANCE = Math.max(...Object.values(LABEL_OFFSET)) + 4;

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
/**
 * #11 — a graph with this many nodes or fewer counts as "small" for the
 * overview-fit ceiling. A just-onboarded vault (project + a domain + one
 * created node) has a minuscule spine bbox that the plain fit blows up to
 * `cameraScaleMax`, so a single hexagon fills half the screen. Below this
 * threshold the fit is capped at `cameraSmallGraphScaleMax` instead.
 */
export const SMALL_GRAPH_NODE_MAX = 5;

export function computeOverviewFitScale(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewportWidth: number,
  viewportHeight: number,
  tokens: Pick<TopologyV2Tokens, "cameraScaleMax" | "cameraScaleMin" | "cameraSmallGraphScaleMax"> & SafeInsetTokens,
  /**
   * #11 — total node count. When ≤ `SMALL_GRAPH_NODE_MAX`, the fit is capped at
   * `cameraSmallGraphScaleMax` so a tiny vault doesn't over-zoom. Omitted (the
   * pure camera-math tests) → no small-graph clamp, previous behavior exactly.
   */
  nodeCount?: number,
): number {
  const insets = readSafeInsets(tokens);
  const effW = Math.max(1, viewportWidth - insets.left - insets.right);
  const effH = Math.max(1, viewportHeight - insets.top - insets.bottom);
  const maxScale =
    nodeCount !== undefined && nodeCount <= SMALL_GRAPH_NODE_MAX
      ? Math.min(tokens.cameraScaleMax, tokens.cameraSmallGraphScaleMax)
      : tokens.cameraScaleMax;
  return fitWorldTarget(bounds, effW, effH, maxScale, tokens.cameraScaleMin).tscale;
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
  tokens: Pick<TopologyV2Tokens, "cameraScaleMax" | "cameraScaleMin" | "cameraSmallGraphScaleMax" | "overviewEntryRatio"> & SafeInsetTokens,
  /** #11 — total node count, forwarded to the small-graph fit clamp. */
  nodeCount?: number,
): CameraTarget {
  const insets = readSafeInsets(tokens);
  const fitScale = computeOverviewFitScale(bounds, viewportWidth, viewportHeight, tokens, nodeCount);
  const tscale = Math.min(tokens.cameraScaleMax, Math.max(tokens.cameraScaleMin, fitScale * tokens.overviewEntryRatio));
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  // worldToScreen centers on the raw screen midpoint; offset the camera so the
  // graph center renders at the visible-area midpoint instead.
  return { ...centerForInsets(centerX, centerY, insets, tscale), tscale };
}

/**
 * 초점이 없을 때의 팬 봉투 — **목줄(leash)이 있으면 핏 주변, 없으면 종전대로
 * 월드 bbox + 여유**.
 *
 * ## 왜 목줄이 필요했나 (2026-07-29 관문 실측)
 *
 * `/download` 무대의 지도는 관문의 유일한 판매 논증인데, 왼쪽으로 한 번 세게
 * 끌면 그래프가 예약 컬럼 뒤로 통째로 밀려 **무대가 비어 버렸다**(0..520 밴드의
 * 잉크 +12.6%, 12초 뒤에도 그대로 — 감쇠 0). 워크벤치라면 「지도 맞추기」로
 * 되돌리지만 관문에는 그 크롬이 없다. **되돌릴 길이 없는 화면에서 되돌릴 수
 * 없는 조작을 허용한 것**이 결함이다.
 *
 * 종전 봉투(월드 bbox ± 320)는 그래프가 클수록 넓어져서, 어떤 값으로도 "예약
 * 컬럼 밖" 을 보장하지 못한다. 목줄은 대신 **핏 자체를 기준점**으로 잡는다 —
 * 핏은 이미 safe inset 을 반영하므로(위 `computeOverviewCameraTarget`),
 * 목줄 반경만큼이 곧 화면에서의 이동 한계가 되고 볼트 크기와 무관해진다.
 * 초점 팬 클램프(`cameraFocusPanMargin`)가 쓰는 것과 **같은 모양**이라 새
 * 기제를 만들지 않는다.
 *
 * `leash <= 0` 이면 종전 동작 그대로 — 워크벤치는 토큰 기본값 0 으로 1픽셀도
 * 안 바뀐다.
 */
export function computeUnfocusedPanBounds(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  cameraScale: number,
  tokens: SafeInsetTokens & { cameraPanLeash?: number },
): PanBounds {
  const leash = tokens.cameraPanLeash ?? 0;
  if (!(leash > 0) || !(cameraScale > 0)) return computePanBounds(bounds);
  const insets = readSafeInsets(tokens);
  const { tx: anchorX, ty: anchorY } = centerForInsets(
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + bounds.maxY) / 2,
    insets,
    cameraScale,
  );
  return computePanBounds(
    { minX: anchorX, minY: anchorY, maxX: anchorX, maxY: anchorY },
    leash,
  );
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
  /*
   * **안전 인셋을 개요 경로와 같은 방식으로 쓴다** (2026-08-10 소유자 확정:
   * *"가려선 안되지 패널 뺀 공간 가운데로 맞춰줘"*).
   *
   * ⚠️ 종전에 이 함수는 인셋을 **전혀** 쓰지 않았다 — `tx: centerX` 를 그대로 돌려주고
   * 배율도 전체 뷰포트로 맞췄다. 그래서 노드를 고르면 그 노드가 **그것을 설명하는
   * 패널 뒤로** 들어갈 수 있었다. 실측(1512×982): 팝오버가 열리면 오른쪽 384px 이
   * 가려지는데 목표는 여전히 화면 가운데였다.
   *
   * 개요 경로(`computeOverviewCameraTarget`)는 **이미** 같은 문제를 인셋으로 풀고
   * 있었다. 그래서 처방은 새 보정 체계를 만드는 것이 아니라 이 함수를 그 기구에
   * 맞추는 것이다 — 하루 전 나는 반대로 했고(호출부에 둘째 시프트를 얹었다) 그것이
   * 188px 어긋남과 64px 과보정을 만들었다.
   */
  const insets = readSafeInsets(tokens);
  const effW = Math.max(1, viewportWidth - insets.left - insets.right);
  const effH = Math.max(1, viewportHeight - insets.top - insets.bottom);
  const fitScale = Math.min(effW / w, effH / h);
  const effectiveMax = computeEffectiveCameraScaleMax(overviewEntryScale, tokens.cameraMaxZoomRatio, tokens.cameraScaleMax);
  // 소유자 실보고 (2026-07-24) — 이웃이 숨은 상태(스포트라이트 등)에선 ego
  // bbox 가 작아 fit 이 현미경 줌으로 치솟는다. 선택 프레이밍의 줌인은
  // overviewEntryScale × focusMaxZoomRatio 를 상한으로 — ego 멤버는 tier
  // 면제라 이 배율에서도 전부 보이고, 줌아웃 방향 fit 은 제한하지 않는다.
  const focusZoomInCeiling = overviewEntryScale * (tokens.focusMaxZoomRatio ?? Number.POSITIVE_INFINITY);
  const scale = Math.min(effectiveMax, focusZoomInCeiling, Math.max(overviewEntryScale, fitScale));

  /*
   * 인셋만큼 목표를 되민다 — 개요 경로와 **같은 식**이다(`(left - right) / (2 × scale)`).
   * 배율로 나누는 이유: 같은 화면 오프셋이 배율이 클수록 더 짧은 월드 거리다.
   */
  return { ...centerForInsets(centerX, centerY, insets, scale), tscale: scale };
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
  /**
   * 고팬아웃 배치-공개(2026-07) — 프레이밍에 포함할 노드 화이트리스트(부모 +
   * 이번 배치 자식). 주어지면 디스크 bbox 를 이 집합의 노드로만 좁혀 "소수를
   * 크게" 담는다(전량 자식으로 멀리 빼지 않음). null/생략 = 디스크 전체(회귀 0).
   */
  restrictIds?: ReadonlySet<string> | null,
): CameraTarget | null {
  const disc = computeClusterDiscBounds(world, tokens, parentId, restrictIds);
  if (!disc) return null;
  const marginRatio = tokens.focusBboxMargin;
  const centerX = (disc.minX + disc.maxX) / 2;
  const centerY = (disc.minY + disc.maxY) / 2;
  const w = Math.max(1, (disc.maxX - disc.minX) * marginRatio);
  const h = Math.max(1, (disc.maxY - disc.minY) * marginRatio);
  const fitScale = Math.min(viewportWidth / w, viewportHeight / h);
  const effectiveMax = computeEffectiveCameraScaleMax(overviewEntryScale, tokens.cameraMaxZoomRatio, tokens.cameraScaleMax);
  // 소유자 실보고 (2026-07-24) — 이웃이 숨은 상태(스포트라이트 등)에선 ego
  // bbox 가 작아 fit 이 현미경 줌으로 치솟는다. 선택 프레이밍의 줌인은
  // overviewEntryScale × focusMaxZoomRatio 를 상한으로 — ego 멤버는 tier
  // 면제라 이 배율에서도 전부 보이고, 줌아웃 방향 fit 은 제한하지 않는다.
  const focusZoomInCeiling = overviewEntryScale * (tokens.focusMaxZoomRatio ?? Number.POSITIVE_INFINITY);
  const scale = Math.min(effectiveMax, focusZoomInCeiling, Math.max(overviewEntryScale, fitScale));
  return { tx: centerX, ty: centerY, tscale: scale };
}

/**
 * 카메라가 모든 노드를 화면 밖으로 밀어냈는가 (#71).
 *
 * 왜 필요한가: 창을 다른 모니터로 옮기거나 크게 리사이즈하면 뷰포트와 DPR 이
 * 함께 바뀌는데, 카메라는 그대로다. 그 조합에서 노드가 전부 뷰포트 밖으로
 * 나가면 사용자에게는 **빈 지도**로 보인다 — '지도 전체 맞추기' 를 눌러야만
 * 돌아온다(codex 감사 P1 실보고).
 *
 * 안전망의 규율:
 * - **매 resize 마다 강제 전체 맞추기는 하지 않는다.** 사용자가 잡아둔 줌·위치는
 *   의도이고, 그걸 지우는 건 다른 종류의 결함이다.
 * - 오직 "화면 안에 노드가 하나도 없다" 는 명백한 상태에서만 보정한다.
 * - 여유(margin)를 둬 가장자리에 살짝 걸친 노드는 '보인다' 로 센다 — 경계에서
 *   깜빡이며 카메라가 튀는 것을 막는다.
 */
export function hasAnyNodeOnScreen(
  camera: CameraAxes,
  viewportWidth: number,
  viewportHeight: number,
  nodes: ReadonlyArray<{ x: number; y: number }>,
  marginPx = 24,
): boolean {
  if (nodes.length === 0) return true; // 노드가 없으면 '사라진' 것도 아니다.
  if (viewportWidth <= 0 || viewportHeight <= 0) return true; // 아직 레이아웃 전.
  for (const node of nodes) {
    const p = worldToScreen(camera, viewportWidth, viewportHeight, node.x, node.y);
    if (
      p.x >= -marginPx &&
      p.x <= viewportWidth + marginPx &&
      p.y >= -marginPx &&
      p.y <= viewportHeight + marginPx
    ) {
      return true;
    }
  }
  return false;
}
