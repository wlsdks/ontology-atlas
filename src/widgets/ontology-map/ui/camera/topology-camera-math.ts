/**
 * Camera-space conversions — `worldToScreen`/`screenToWorld`/`fitWorldTarget`/
 * `hitTestWorld` (prototype `worldToScreen()`/`screenToWorld()`/`fitTarget()`/
 * `hitTest()`, `docs/prototypes/topology-b2plus.html` §8/§9).
 *
 * Camera convention (`engine/spring.ts`/`engine/momentum.ts` JSDoc):
 * `camera.x`/`camera.y` are the WORLD point the camera is centered on and
 * `camera.scale` the world-to-screen zoom factor — the prototype's own
 * convention, which the engine layer expects.
 */

import { clampPointToPanBounds, computePanBounds, type CameraAxes, type CameraTarget, type PanBounds } from "../../engine/camera";
import { LABEL_OFFSET } from "../../render/labels";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { computeClusterDiscBounds, computeEgoBounds, computeIdsBounds, dialOverviewFit, radiusForKind, type Bounds, type DialFocusFrame, type TopologyWorld } from "../world/topology-world";
import type { WorldNode } from "../world/topology-world";

interface Point {
  x: number;
  y: number;
}

/**
 * Optional depth argument to `worldToScreen`: `z` is recession behind the layout plane, `focal` the
 * weak-perspective focal length (`s = focal / (focal + z)`), `lift` a constant plane spacing.
 * Omitted, the output is the original formula (`topology-camera-math.test.ts`, `dome-view.test.ts`).
 */
export interface DepthTerm {
  z: number;
  lift: number;
  focal: number;
}

export function worldToScreen(camera: CameraAxes, viewportWidth: number, viewportHeight: number, wx: number, wy: number, depth?: DepthTerm): Point {
  if (depth !== undefined) {
    const s = depth.focal / (depth.focal + depth.z);
    return {
      x: (wx - camera.x.value) * s * camera.scale.value + viewportWidth / 2,
      y: ((wy - camera.y.value) * s + depth.lift * s) * camera.scale.value + viewportHeight / 2,
    };
  }
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

/**
 * The courtesy ring outside a node's painted disc, in screen px. An element draws
 * at 7 px world radius and can be under 4 px on screen in 3D, which is not a
 * pressable target on its own; this is what makes it one. It is a **slack ring,
 * not a second disc** — `hitTestWorld` ranks painted ink above it (see there).
 */
export const HIT_TOUCH_SLACK_PX = 5;

/** Ported from the prototype's `hitTest()` — the node under `(screenX, screenY)`, `null` if none is within its padded radius. */
export function hitTestWorld(
  world: TopologyWorld,
  camera: CameraAxes,
  viewportWidth: number,
  viewportHeight: number,
  tokens: OntologyMapTokens,
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
  /**
   * 3D view — multiply the hit disc by the same perspective factor
   * (`DomeNodeFrame.s`) the draw multiplied the node radius by. Omitted means 1
   * (the previous 2D behaviour unchanged).
   */
  radiusScaleForNode?: (node: WorldNode) => number,
  /**
   * 3D view: the node's normalised depth (0 near, 1 far, `DomeNodeFrame.u`). When given, the
   * nearer node wins overlapping discs and distance breaks ties among equal depths. Omitted,
   * distance alone decides.
   */
  depthForNode?: (node: WorldNode) => number,
): string | null {
  let bestId: string | null = null;
  let bestDistance = Infinity;
  let bestDepth = Infinity;
  let bestOnInk = false;
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
    // The disc the draw actually paints (`frame-draw/paint-nodes.ts`'s `screenRadius`)
    // and, around it, the courtesy ring that makes a 7 px element pressable.
    const drawnRadius =
      radiusForKind(node.kind, tokens) * node.magnitudeScale * (radiusScaleForNode ? radiusScaleForNode(node) : 1) * camera.scale.value;
    const effRadius = drawnRadius + HIT_TOUCH_SLACK_PX;
    const distance = Math.hypot(screenX - screen.x, screenY - screen.y);
    // Compare positively — a NaN coordinate (mocked or unprojected) cannot pass `<=`.
    if (!(distance <= effRadius)) continue;
    // Is the cursor on this node's **painted** disc, or only inside its slack ring?
    const onInk = distance <= drawnRadius;
    const depth = depthForNode ? depthForNode(node) : 0;
    /*
     * Rank: ink first, then depth, then distance. The slack ring is a courtesy for small targets,
     * not an occluder, so it decides only among points on no painted disc; depth orders real
     * overlaps.
     */
    const better = onInk === bestOnInk
      ? depth < bestDepth - 1e-6 || (Math.abs(depth - bestDepth) <= 1e-6 && distance < bestDistance)
      : onInk;
    if (better) {
      bestId = node.id;
      bestDistance = distance;
      bestDepth = depth;
      bestOnInk = onInk;
    }
  }
  return bestId;
}

/**
 * The overview entry scale is the tight fit times `--map-overview-entry-ratio` (0.95), kept
 * above the far-high ratio (0.92) so `farT` lands at 0 on load. It anchors `overviewScaleRef`;
 * zooming out still crosses `farHigh` to `farLow`.
 */
/**
 * Fixed-chrome safe insets (px) — the left ReaderLens panel, right popover rail,
 * top utility lane, bottom hint. Optional on the token param so the pure
 * camera-math tests (which pass a token literal without insets) still type-check
 * and behave as a zero-inset full-viewport fit.
 */
export type SafeInsetTokens = Partial<
  Pick<OntologyMapTokens, "safeInsetLeft" | "safeInsetRight" | "safeInsetTop" | "safeInsetBottom">
> & {
  /**
   * What a panel measured on screen actually covers, in canvas pixels — the
   * part of the side inset that is real occlusion rather than a preference.
   * `MAX_FIT_CHROME_SHARE` never shrinks the fit below it, so narrowing the
   * reservation can never slide the graph under an open panel. Absent means
   * "not measured": then the whole inset is treated as preference.
   */
  obstacleInsetLeft?: number;
  obstacleInsetRight?: number;
};

/**
 * The share of an axis the fit may reserve for chrome. Side insets are absolute pixels, so a
 * half-canvas ceiling leaves every desktop width from 1040 up untouched and binds only where
 * chrome would take more of the frame than the map.
 */
export const MAX_FIT_CHROME_SHARE = 0.5;

/**
 * How the two insets of one axis give way past the ceiling. `equal`: side lanes cut by the same
 * pixels, keeping the drawing centred (`tests/contract/map/map-fit-side-air.contract.test.ts`).
 * `proportional`: top and bottom bands, which have no shared air to centre.
 */
export type FitInsetShare = "equal" | "proportional";

/**
 * Shrinks a pair of insets so together they reserve at most
 * `MAX_FIT_CHROME_SHARE` of `extent`, keeping each one's measured floor. Only
 * the part above the floor gives way, as `share` says; a side that reaches its
 * floor hands the rest of the cut to the other.
 */
export function clampFitInsets(
  lo: number,
  hi: number,
  extent: number,
  floorLo = 0,
  floorHi = 0,
  share: FitInsetShare = "proportional",
): { lo: number; hi: number } {
  if (!(extent > 0)) return { lo, hi };
  const budget = extent * MAX_FIT_CHROME_SHARE;
  if (lo + hi <= budget) return { lo, hi };
  const fLo = Math.min(Math.max(0, floorLo), lo);
  const fHi = Math.min(Math.max(0, floorHi), hi);
  const softLo = lo - fLo;
  const softHi = hi - fHi;
  const soft = softLo + softHi;
  if (soft <= 0) return { lo: fLo, hi: fHi };
  const allowed = Math.max(0, budget - fLo - fHi);
  if (share === "equal") {
    const cut = Math.min(soft, lo + hi - fLo - fHi - allowed);
    const cutLo = Math.min(softLo, Math.max(cut / 2, cut - softHi));
    return { lo: lo - cutLo, hi: hi - (cut - cutLo) };
  }
  const k = Math.min(1, allowed / soft);
  return { lo: fLo + (lo - fLo) * k, hi: fHi + (hi - fHi) * k };
}

interface SafeInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * **Which camera puts something at the centre of the space left by the panels** —
 * the single place this formula lives.
 *
 * `worldToScreen` draws against the screen's **raw centre**, so landing something
 * at the centre of the visible area means pushing the camera back by half the
 * difference between the left and right insets. **Dividing by the zoom factor** is
 * the point — the same screen offset is a shorter world distance the further in
 * you are zoomed.
 *
 * ⚠️ This formula was once written out in **four** places (the overview, the pan
 * leash, and for one day the caller's "free-area" shift as well). Of
 * those, the focus dive **did not have it at all**, so choosing a node could put it
 * behind the panel that explains it. With several copies, the one that goes missing
 * is the default — so they were gathered into one.
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
 * The overview fit reserves a bottom allowance so the bottom-most spine node's label anchor
 * (`radius + LABEL_OFFSET`) stays inside the label cull line. Derived from `LABEL_OFFSET` (max
 * plus 4 slack) so it cannot drift; applied to the fit only, not to the cull rect or movable area.
 */
const OVERVIEW_LABEL_BOTTOM_ALLOWANCE = Math.max(...Object.values(LABEL_OFFSET)) + 4;

function readSafeInsets(
  tokens: SafeInsetTokens,
  viewportWidth?: number,
  viewportHeight?: number,
  pad?: OverviewFitOptions["padPx"],
  labelBottomAllowance = OVERVIEW_LABEL_BOTTOM_ALLOWANCE,
): SafeInsets {
  const raw = {
    left: (tokens.safeInsetLeft ?? 0) + (pad?.left ?? 0),
    right: (tokens.safeInsetRight ?? 0) + (pad?.right ?? 0),
    top: (tokens.safeInsetTop ?? 0) + (pad?.top ?? 0),
    // No insets specified (= the pure fit test contract, with no chrome) stays 0 as
    // before — the label allowance is added only when a real bottom chrome inset exists.
    bottom:
      tokens.safeInsetBottom == null
        ? pad?.bottom ?? 0
        : tokens.safeInsetBottom + labelBottomAllowance + (pad?.bottom ?? 0),
  };
  // The chrome may not eat the map (`MAX_FIT_CHROME_SHARE`). Callers without a
  // viewport — the pan leash — keep the raw numbers.
  const x =
    viewportWidth === undefined
      ? { lo: raw.left, hi: raw.right }
      : clampFitInsets(raw.left, raw.right, viewportWidth, tokens.obstacleInsetLeft ?? 0, tokens.obstacleInsetRight ?? 0, "equal");
  const y =
    viewportHeight === undefined ? { lo: raw.top, hi: raw.bottom } : clampFitInsets(raw.top, raw.bottom, viewportHeight);
  return { left: x.lo, right: x.hi, top: y.lo, bottom: y.hi };
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
const SMALL_GRAPH_NODE_MAX = 5;

export interface OverviewFitOptions {
  padPx?: { left: number; right: number; top: number; bottom: number };
  scaleFloor?: number;
  /** Zero when a branch scene already reserves its own screen-space label pad. */
  labelBottomAllowance?: number;
}

export function computeOverviewFitScale(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewportWidth: number,
  viewportHeight: number,
  tokens: Pick<OntologyMapTokens, "cameraScaleMax" | "cameraScaleMin" | "cameraSmallGraphScaleMax"> & SafeInsetTokens,
  /**
   * #11 — total node count. When ≤ `SMALL_GRAPH_NODE_MAX`, the fit is capped at
   * `cameraSmallGraphScaleMax` so a tiny vault doesn't over-zoom. Omitted (the
   * pure camera-math tests) → no small-graph clamp, previous behavior exactly.
   */
  nodeCount?: number,
  fit?: OverviewFitOptions,
): number {
  const insets = readSafeInsets(tokens, viewportWidth, viewportHeight, fit?.padPx, fit?.labelBottomAllowance);
  const effW = Math.max(1, viewportWidth - insets.left - insets.right);
  const effH = Math.max(1, viewportHeight - insets.top - insets.bottom);
  const maxScale =
    nodeCount !== undefined && nodeCount <= SMALL_GRAPH_NODE_MAX
      ? Math.min(tokens.cameraScaleMax, tokens.cameraSmallGraphScaleMax)
      : tokens.cameraScaleMax;
  return fitWorldTarget(bounds, effW, effH, maxScale, fit?.scaleFloor ?? tokens.cameraScaleMin).tscale;
}

/**
 * PANEL-AWARE overview fit (the Design Guardian's camera rejection): the fit used
 * to center on the full viewport, so the left third of the graph hid behind the
 * ReaderLens panel. Now the zoom is computed against the VISIBLE area (viewport
 * minus the safe insets), and the camera center is shifted so the graph's own
 * center lands at the visible-area center rather than the raw screen center. With
 * zero insets this reduces exactly to the previous behavior
 * (`topology-camera-math.test.ts`).
 */
export function computeOverviewCameraTarget(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewportWidth: number,
  viewportHeight: number,
  tokens: Pick<OntologyMapTokens, "cameraScaleMax" | "cameraScaleMin" | "cameraSmallGraphScaleMax" | "overviewEntryRatio"> & SafeInsetTokens,
  /** #11 — total node count, forwarded to the small-graph fit clamp. */
  nodeCount?: number,
  fit?: OverviewFitOptions,
): CameraTarget {
  const insets = readSafeInsets(tokens, viewportWidth, viewportHeight, fit?.padPx, fit?.labelBottomAllowance);
  const fitScale = computeOverviewFitScale(bounds, viewportWidth, viewportHeight, tokens, nodeCount, fit);
  const tscale = Math.min(tokens.cameraScaleMax, Math.max(fit?.scaleFloor ?? tokens.cameraScaleMin, fitScale * tokens.overviewEntryRatio));
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  // worldToScreen centers on the raw screen midpoint; offset the camera so the
  // graph center renders at the visible-area midpoint instead.
  return { ...centerForInsets(centerX, centerY, insets, tscale), tscale };
}

/**
 * The lens fit (expand-all, recent-changes spotlight): fits the lens bounds into the width beside
 * the side panels and centres them. Top and bottom lanes are not reserved: the lens bounds carry
 * their own 18% padding (`runSpotlightFit`). With zero insets this is exactly `fitWorldTarget`.
 */
export function computeLensFitTarget(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewportWidth: number,
  viewportHeight: number,
  tokens: Pick<OntologyMapTokens, "cameraScaleMax" | "cameraScaleMin"> & SafeInsetTokens,
): CameraTarget {
  const insets = { left: tokens.safeInsetLeft ?? 0, right: tokens.safeInsetRight ?? 0, top: 0, bottom: 0 };
  const fit = fitWorldTarget(
    bounds,
    Math.max(1, viewportWidth - insets.left - insets.right),
    viewportHeight,
    tokens.cameraScaleMax,
    tokens.cameraScaleMin,
  );
  return { ...centerForInsets(fit.tx, fit.ty, insets, fit.tscale), tscale: fit.tscale };
}

/**
 * The cone's own fit: fill the free canvas, not the safe rect, since the overview fit's static insets
 * describe the 2D map. Free canvas = canvas minus measured panels (`interaction/free-area.ts`) minus
 * the `insets` bands; `nodeRadiusPx` is subtracted (`DOME_NODE_PX`). No padding beyond `fill`.
 */
export function computeDomeFitCameraTarget(
  /** The projected bounds of the node **centres** (world units). */
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewportWidth: number,
  viewportHeight: number,
  /** Live panel obstruction plus the cone's own top/bottom bands, in screen px. */
  insets: { left: number; right: number; top: number; bottom: number },
  /** Half the widest disc the cone draws, in screen px. */
  nodeRadiusPx: number,
  tokens: Pick<OntologyMapTokens, "cameraScaleMax" | "cameraScaleMin"> & { domeFitFill: number },
): CameraTarget {
  const effW = Math.max(1, viewportWidth - insets.left - insets.right);
  const effH = Math.max(1, viewportHeight - insets.top - insets.bottom);
  const fill = tokens.domeFitFill > 0 ? tokens.domeFitFill : 1;
  const availW = Math.max(1, effW * fill - nodeRadiusPx * 2);
  const availH = Math.max(1, effH * fill - nodeRadiusPx * 2);
  const spanX = Math.max(1e-6, bounds.maxX - bounds.minX);
  const spanY = Math.max(1e-6, bounds.maxY - bounds.minY);
  const tscale = Math.min(
    tokens.cameraScaleMax,
    Math.max(tokens.cameraScaleMin, Math.min(availW / spanX, availH / spanY)),
  );
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return { ...centerForInsets(centerX, centerY, insets, tscale), tscale };
}

/**
 * Pan envelope with no focus: around the fit when `cameraPanLeash` is set, else the world bbox
 * plus slack. The leash serves surfaces with no Fit Map control; it takes the fit as its
 * reference, so it does not depend on vault size. With `leash <= 0` the bbox envelope applies.
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
 * The camera's interactive zoom-in ceiling, viewport-relative: `overviewEntryScale x
 * maxZoomRatio`, constant in ratio terms so the tier-reveal bands can finish.
 * `--map-camera-scale-max` is only the fallback when `overviewEntryScale` is non-positive.
 */
export function computeEffectiveCameraScaleMax(
  overviewEntryScale: number,
  maxZoomRatio: number,
  absoluteFallback: number,
  contentScaleMax?: number,
): number {
  if (!(overviewEntryScale > 0)) return absoluteFallback;
  return Math.max(overviewEntryScale * maxZoomRatio, contentScaleMax ?? 0);
}

/**
 * The camera's interactive zoom-out floor, viewport-relative: `overviewEntryScale x minZoomRatio`
 * (`--map-camera-min-zoom-ratio`) replaces the absolute `--map-camera-scale-min` for the spring
 * and wheel clamps. The fit computations keep the absolute floor as their own sanity bound.
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
 * Camera target for the current focus: the full-graph overview fit when `focusedSlug` is `null`, else
 * the node plus its 1-hop ego bbox (`--map-focus-bbox-margin`, `docs/design/ontology-map.md` 3.2).
 * Floored at the overview entry zoom, capped at the effective max. `null` if the slug is unknown.
 */
/**
 * The focused node stays at least this far inside the free area's edge under
 * any pan: room for its ring and its name.
 */
export const FOCUS_LEASH_EDGE_PAD_PX = 120;

/** The focus leash in screen pixels, per axis. */
export interface FocusLeashPx {
  x: number;
  y: number;
}

/**
 * How far, in screen pixels, the camera centre may sit from the focused node on each axis:
 * half the free extent (canvas minus panels and bars) less the edge pad. Sized to the screen,
 * it keeps the subject in frame while letting a wide ego graph be centred in the free area.
 */
export function focusLeashPx(
  viewportWidth: number,
  viewportHeight: number,
  insets: { left: number; right: number; top: number; bottom: number },
): FocusLeashPx {
  const freeHalfX = Math.max(0, viewportWidth - insets.left - insets.right) / 2;
  const freeHalfY = Math.max(0, viewportHeight - insets.top - insets.bottom) / 2;
  return { x: Math.max(0, freeHalfX - FOCUS_LEASH_EDGE_PAD_PX), y: Math.max(0, freeHalfY - FOCUS_LEASH_EDGE_PAD_PX) };
}

/** The leash `computeFocusCameraTarget` aims inside, so the physics holds the same box. */
export function focusTargetLeashPx(tokens: SafeInsetTokens, viewportWidth: number, viewportHeight: number): FocusLeashPx {
  return focusLeashPx(viewportWidth, viewportHeight, readSafeInsets(tokens, viewportWidth, viewportHeight));
}

/** The leash in world units at `scale`: the screen leash, never tighter than the token. */
export function focusLeashWorld(leashPx: number, scale: number, tokenMargin: number): number {
  const floor = Number.isFinite(tokenMargin) ? tokenMargin : 0;
  return scale > 0 ? Math.max(floor, leashPx / scale) : floor;
}

/** The pan box the physics holds a focused camera in: the leash on each axis around the node. */
export function focusPanBounds(
  anchor: { x: number; y: number },
  leashPx: FocusLeashPx | null,
  scale: number,
  tokenMargin: number,
): PanBounds {
  const mx = focusLeashWorld(leashPx?.x ?? 0, scale, tokenMargin);
  const my = focusLeashWorld(leashPx?.y ?? 0, scale, tokenMargin);
  return { minX: anchor.x - mx, maxX: anchor.x + mx, minY: anchor.y - my, maxY: anchor.y + my };
}

export interface FocusFrame {
  bounds: Bounds;
  /** Where the bounds' centre was aimed before the leash clamp. */
  aim: { tx: number; ty: number };
  scale: number;
}
let lastFocusFrameState: FocusFrame | null = null;
/** The ego bounds the last focus target framed; the e2e probe reads it. */
export function lastFocusFrame(): FocusFrame | null {
  return lastFocusFrameState;
}

export function computeFocusCameraTarget(
  world: TopologyWorld,
  tokens: OntologyMapTokens,
  viewportWidth: number,
  viewportHeight: number,
  focusedSlug: string | null,
  /** `overviewScale × overviewEntryRatio` at the current viewport — the zoom-ratio's "1.0" anchor (`model/visibility/tier-visibility.ts#computeZoomRatio`). */
  overviewEntryScale: number,
  /**
   * S8 defect 4 — while a realm is expanded, that realm's member set. Restricting
   * the ego bbox to it stops a fling neighbour outside the warding circle from
   * inflating the bbox and throwing the camera off screen. Omitted or null means
   * the global ego (the existing contract unchanged).
   */
  restrictIds?: ReadonlySet<string> | null,
  /**
   * The bounds the deselect return fits. Defaults to the spine; the loop passes
   * the full bounds while expand-all is on, so closing a panel lands on the
   * same frame the fit button and the `0` key produce.
   */
  overviewBounds: Bounds = world.spineBounds,
  dialFrame?: DialFocusFrame,
): CameraTarget | null {
  if (focusedSlug === null) {
    // Overview fits the SPINE bbox (project+domain+hub — the only tier drawn at
    // entry), not the full 295-node bounds; see `topology-world.ts#spineBounds`.
    return computeOverviewCameraTarget(overviewBounds, viewportWidth, viewportHeight, tokens, world.nodes.length, dialOverviewFit(world));
  }
  const egoBounds = dialFrame ? computeIdsBounds(world, tokens, dialFrame.ids) : computeEgoBounds(world, tokens, focusedSlug, restrictIds);
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
   * Uses the safe insets the same way the overview path does (`computeOverviewCameraTarget`), so the
   * selected node is centred in the space the panel leaves instead of ending up behind it.
   */
  const insets = readSafeInsets(tokens, viewportWidth, viewportHeight);
  const effW = Math.max(1, viewportWidth - insets.left - insets.right);
  const effH = Math.max(1, viewportHeight - insets.top - insets.bottom);
  // The leash is a box around the viewport centre, not the free centre, so a
  // fit that only divides the free extent by the bbox can still leave the far
  // side of the ego graph under a panel once the leash stops the centring.
  // With the focus held at most `leash` px from the centre, the far edge
  // reaches at most `leash + (edge − focus) × scale` past it; the scale that
  // keeps that inside the free area is the tighter bound.
  const leashPx = focusLeashPx(viewportWidth, viewportHeight, insets);
  const focus = world.nodeById.get(focusedSlug);
  const leashFit = (lead: number, trail: number, free: { lo: number; hi: number }, centre: number, leash: number): number => {
    const toHi = trail > 0 ? (free.hi - centre + leash) / trail : Number.POSITIVE_INFINITY;
    const toLo = lead > 0 ? (centre - free.lo + leash) / lead : Number.POSITIVE_INFINITY;
    return Math.min(toHi, toLo);
  };
  const leashFitScale = focus
    ? Math.min(
        leashFit(focus.x - (centerX - w / 2), centerX + w / 2 - focus.x, { lo: insets.left, hi: viewportWidth - insets.right }, viewportWidth / 2, leashPx.x),
        leashFit(focus.y - (centerY - h / 2), centerY + h / 2 - focus.y, { lo: insets.top, hi: viewportHeight - insets.bottom }, viewportHeight / 2, leashPx.y),
      )
    : Number.POSITIVE_INFINITY;
  // The physics holds the focus leash only while zoomed in past the overview scale; at or below it
  // the wider unfocused leash applies. A fit inside the focus leash zooms out until it fits, never
  // past the overview scale. (`overviewEntryScale` is `overviewScale x overviewEntryRatio`.)
  const overviewScale = overviewEntryScale / Math.max(tokens.overviewEntryRatio || 1, 1e-6);
  let fitScale = Math.min(effW / w, effH / h);
  if (fitScale > overviewScale && leashFitScale < fitScale) {
    // A hair under the overview scale, so the `>` the physics uses reads the
    // same on both sides after floating error.
    fitScale = Math.max(leashFitScale, overviewScale * (1 - 1e-6));
  }
  const effectiveMax = computeEffectiveCameraScaleMax(overviewEntryScale, tokens.cameraMaxZoomRatio, tokens.cameraScaleMax, dialFrame ? world.dialScaleMax ?? undefined : undefined);
  // Zooming in for selection framing is capped at `overviewEntryScale x focusMaxZoomRatio`: ego
  // members are tier-exempt so they stay visible at that zoom, and zooming out to fit is not
  // limited.
  const focusZoomInCeiling = Math.max(overviewEntryScale * (tokens.focusMaxZoomRatio ?? Number.POSITIVE_INFINITY), dialFrame?.nameScale ?? 0);
  const scale = Math.min(effectiveMax, focusZoomInCeiling, Math.max(overviewEntryScale, fitScale));

  /*
   * Push the target back by the insets — **the same formula** as the overview path
   * (`(left - right) / (2 × scale)`). Divide by the zoom factor because the same
   * screen offset is a shorter world distance the further in you are zoomed.
   */
  // The physics keeps a focused camera inside `cameraFocusPanMargin` of the focused node
  // (`topology-physics-step.ts`). A target outside that box is unreachable: the spring pushes, the
  // clamp pulls back, and the idle gate reads "camera moving" for as long as the node stays selected.
  const centred = centerForInsets(centerX, centerY, insets, scale);
  lastFocusFrameState = { bounds: egoBounds, aim: { tx: centred.tx, ty: centred.ty }, scale };
  if (!focus) return { ...centred, tscale: scale };
  // The same rule as `topology-physics-step`: the focus leash past the overview
  // scale, the unfocused leash otherwise.
  const leash =
    scale > overviewScale
      ? focusPanBounds(focus, leashPx, scale, tokens.cameraFocusPanMargin)
      : computeUnfocusedPanBounds(overviewBounds, scale, tokens);
  const clamped = clampPointToPanBounds(centred.tx, centred.ty, leash);
  return { tx: clamped.x, ty: clamped.y, tscale: scale };
}

/**
 * The camera target for a 3D dome selection reframe — **the same contract** as the
 * ego-fit branch of `computeFocusCameraTarget` (`focusBboxMargin` multiplicative
 * padding, the same safe-inset grammar, the same zoom-in ceiling), with different
 * inputs: the bbox is not the 2D ego but the **dome ego bbox projected at the
 * target pose** (`model/dome-view/projection.ts#domeEgoWorldBounds`), and the zoom-out floor
 * is not 2D's `overviewEntryScale` but the **dome fit zoom** (`scaleFloor`) —
 * because the dome's projected bbox is wider than the 2D spine, so its fit zoom
 * lives below the 2D floor (see the `DomeRuntime.fitScale` JSDoc). The insets are
 * re-read here so `readSafeInsets`'s label-allowance rule is not reimplemented at
 * every call site.
 */
export function computeDomeFocusCameraTarget(
  egoBounds: { minX: number; minY: number; maxX: number; maxY: number },
  tokens: OntologyMapTokens,
  viewportWidth: number,
  viewportHeight: number,
  overviewEntryScale: number,
  scaleFloor: number | null,
  /** The world point the selected node projects to at the target pose — the same anchor as the focus pan leash. */
  focusAnchor?: { x: number; y: number } | null,
): CameraTarget {
  const marginRatio = tokens.focusBboxMargin;
  const centerX = (egoBounds.minX + egoBounds.maxX) / 2;
  const centerY = (egoBounds.minY + egoBounds.maxY) / 2;
  const w = Math.max(1, (egoBounds.maxX - egoBounds.minX) * marginRatio);
  const h = Math.max(1, (egoBounds.maxY - egoBounds.minY) * marginRatio);
  const insets = readSafeInsets(tokens, viewportWidth, viewportHeight);
  const effW = Math.max(1, viewportWidth - insets.left - insets.right);
  const effH = Math.max(1, viewportHeight - insets.top - insets.bottom);
  const fitScale = Math.min(effW / w, effH / h);
  const effectiveMax = computeEffectiveCameraScaleMax(overviewEntryScale, tokens.cameraMaxZoomRatio, tokens.cameraScaleMax);
  const focusZoomInCeiling = overviewEntryScale * (tokens.focusMaxZoomRatio ?? Number.POSITIVE_INFINITY);
  const scale = Math.min(effectiveMax, focusZoomInCeiling, Math.max(scaleFloor ?? 0, fitScale));
  const target = { ...centerForInsets(centerX, centerY, insets, scale), tscale: scale };
  // Keep the target **inside** the focus pan leash's envelope
  // (`cameraFocusPanMargin`) — the dome's ego neighbours project asymmetrically onto
  // the tiers above rather than around the subject, so the bbox centre can fall
  // outside the leash; the elastic clamp then pulls the camera back after the tween
  // arrives and «sliding after landing» becomes visible (measured 38 units). A target
  // inside the envelope makes arrival mean a stop.
  if (focusAnchor && tokens.cameraFocusPanMargin > 0) {
    const m = tokens.cameraFocusPanMargin;
    target.tx = Math.min(focusAnchor.x + m, Math.max(focusAnchor.x - m, target.tx));
    target.ty = Math.min(focusAnchor.y + m, Math.max(focusAnchor.y - m, target.ty));
  }
  return target;
}

/**
 * S2 part 5B — the camera dive target for an expanded cluster disc (the parent plus
 * its direct children's fan). The same contract as the ego-fit branch of
 * `computeFocusCameraTarget` (margin-ratio padding plus an
 * `[overviewEntryScale, effectiveMax]` clamp), with contains children as the subject
 * instead of ego neighbours. Expanding a chip spring-dives to this target so the
 * children reveal naturally through tier alpha. `null` when `parentId` does not
 * resolve or has no children (the camera does not move).
 */
export function computeClusterFitTarget(
  world: TopologyWorld,
  tokens: OntologyMapTokens,
  viewportWidth: number,
  viewportHeight: number,
  parentId: string,
  overviewEntryScale: number,
  /**
   * High-fanout batch reveal (2026-07) — the whitelist of nodes to include in the
   * framing (the parent plus this batch's children). Given, the disc bbox narrows to
   * just this set so it holds "a few, large" rather than pulling far out to take
   * every child. null or omitted means the whole disc (zero regression).
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
  /*
   * The fan is fitted into the region a person can see (`readSafeInsets` + `centerForInsets`), like
   * every other fit. A double-click selects and expands; the selection dive runs a frame later
   * (`use-topology-loop`) and overwrites this target, so this is the camera a chip press moves alone.
   */
  const insets = readSafeInsets(tokens, viewportWidth, viewportHeight);
  const effW = Math.max(1, viewportWidth - insets.left - insets.right);
  const effH = Math.max(1, viewportHeight - insets.top - insets.bottom);
  const fitScale = Math.min(effW / w, effH / h);
  const effectiveMax = computeEffectiveCameraScaleMax(overviewEntryScale, tokens.cameraMaxZoomRatio, tokens.cameraScaleMax);
  // Zooming in for selection framing is capped at `overviewEntryScale x focusMaxZoomRatio`: ego
  // members are tier-exempt so they stay visible at that zoom, and zooming out to fit is not
  // limited.
  const focusZoomInCeiling = overviewEntryScale * (tokens.focusMaxZoomRatio ?? Number.POSITIVE_INFINITY);
  /*
   * A dive is floored at the camera's own minimum, not `overviewEntryScale`: a fan wider than
   * the visible region at that altitude must be held in frame instead of half-shown.
   */
  const scaleMin = computeEffectiveCameraScaleMin(overviewEntryScale, tokens.cameraMinZoomRatio, tokens.cameraScaleMin);
  const scale = Math.min(effectiveMax, focusZoomInCeiling, Math.max(scaleMin, fitScale));
  const target = { ...centerForInsets(centerX, centerY, insets, scale), tscale: scale };
  /*
   * The focus leash keeps a focused camera within `cameraFocusPanMargin` of its subject and
   * pulls back a target outside it after the tween arrives. The parent is the subject, so the
   * clamp only shortens a reach the leash would have undone anyway.
   */
  const parent = world.nodeById.get(parentId);
  if (parent && tokens.cameraFocusPanMargin > 0) {
    const m = tokens.cameraFocusPanMargin;
    target.tx = Math.min(parent.x + m, Math.max(parent.x - m, target.tx));
    target.ty = Math.min(parent.y + m, Math.max(parent.y - m, target.ty));
  }
  return target;
}

/**
 * Whether any node is on screen. Moving the window to another monitor or resizing it changes viewport
 * and DPR while the camera stays put, possibly leaving an empty map. It corrects only when no node is
 * visible, so a user-set zoom survives. `marginPx` counts a barely clipped node as visible.
 */
export function hasAnyNodeOnScreen(
  camera: CameraAxes,
  viewportWidth: number,
  viewportHeight: number,
  nodes: ReadonlyArray<{ x: number; y: number }>,
  marginPx = 24,
): boolean {
  if (nodes.length === 0) return true; // With no nodes, nothing has 'disappeared' either.
  if (viewportWidth <= 0 || viewportHeight <= 0) return true; // Before layout.
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
