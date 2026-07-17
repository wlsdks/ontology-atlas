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
import { radiusForKind, type TopologyWorld } from "./topology-world";
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
): string | null {
  let bestId: string | null = null;
  let bestDistance = Infinity;
  for (const node of world.nodes) {
    if (isHittable && !isHittable(node)) continue;
    const screen = worldToScreen(camera, viewportWidth, viewportHeight, node.x, node.y);
    const effRadius = radiusForKind(node.kind, tokens) * camera.scale.value + 5;
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

function readSafeInsets(tokens: SafeInsetTokens): SafeInsets {
  return {
    left: tokens.safeInsetLeft ?? 0,
    right: tokens.safeInsetRight ?? 0,
    top: tokens.safeInsetTop ?? 0,
    bottom: tokens.safeInsetBottom ?? 0,
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
 * Camera target for the current focus state — the full-graph overview fit
 * when `focusedSlug` is `null`, or the clicked node + its 1-hop ego bbox
 * (`--topology-v2-focus-bbox-margin`/`-focus-fit-max-scale`) otherwise
 * (`docs/TOPOLOGY-V2-DESIGN.md` §3.2 "카메라가 노드+1-hop 이웃 bbox 로 스프링
 * 다이브"). `null` only if `focusedSlug` doesn't resolve to a known node.
 */
export function computeFocusCameraTarget(
  world: TopologyWorld,
  tokens: TopologyV2Tokens,
  viewportWidth: number,
  viewportHeight: number,
  focusedSlug: string | null,
): CameraTarget | null {
  if (focusedSlug === null) {
    // Overview fits the SPINE bbox (project+domain+hub — the only tier drawn at
    // entry), not the full 295-node bounds; see `topology-world.ts#spineBounds`.
    return computeOverviewCameraTarget(world.spineBounds, viewportWidth, viewportHeight, tokens);
  }
  const focusNode = world.nodeById.get(focusedSlug);
  if (!focusNode) return null;

  const neighborIds = world.neighborMap.get(focusedSlug) ?? new Set<string>();
  const egoNodes: WorldNode[] = [focusNode];
  for (const id of neighborIds) {
    const neighbor = world.nodeById.get(id);
    if (neighbor) egoNodes.push(neighbor);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of egoNodes) {
    const r = radiusForKind(n.kind, tokens);
    minX = Math.min(minX, n.x - r);
    maxX = Math.max(maxX, n.x + r);
    minY = Math.min(minY, n.y - r);
    maxY = Math.max(maxY, n.y + r);
  }
  const margin = tokens.focusBboxMargin;
  return fitWorldTarget(
    { minX: minX - margin, minY: minY - margin, maxX: maxX + margin, maxY: maxY + margin },
    viewportWidth,
    viewportHeight,
    tokens.focusFitMaxScale,
    tokens.cameraScaleMin,
  );
}
