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
import { computeClusterDiscBounds, computeEgoBounds, radiusForKind, type Bounds, type TopologyWorld } from "./topology-world";
import type { WorldNode } from "./topology-world";

interface Point {
  x: number;
  y: number;
}

/**
 * The depth term — an optional argument to `worldToScreen`.
 *
 * `z` is how far a node has receded behind the layout plane (world units) and
 * `focal` is the focal length of the weak perspective: `s = focal / (focal + z)`.
 * `lift` is layer separation — a fixed tilt encoded as a constant plane spacing
 * (world units) — so deeper layers settle lower on screen. (A leftover API from
 * the 2026-08-18 z-lift mockup: the current 3D dome uses the offset path in
 * `model/dome-view.ts` and does not use this term, but `dome-view.test.ts` pins it
 * along with the byte-identical contract for when it is omitted.)
 *
 * **Omitted (the default path), the output is byte-identical to before** — it
 * takes the original two-line formula, and `topology-camera-math.test.ts` pins
 * that invariant as a contract.
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
  /**
   * 3D view — multiply the hit disc by the same perspective factor
   * (`DomeNodeFrame.s`) the draw multiplied the node radius by. Omitted means 1
   * (the previous 2D behaviour unchanged).
   */
  radiusScaleForNode?: (node: WorldNode) => number,
  /**
   * 3D view — the node's normalised depth (0 near → 1 far, `DomeNodeFrame.u`).
   * Given, **the nearer node wins** when discs overlap: in the dome the front and
   * back rings overlap on screen constantly, and the old «distance to centre»
   * decision alone handed back the far node in the fog instead of the large bright
   * near node under the cursor — dragging that reads on screen as «clicking does
   * not move the right thing» (owner report, 2026-08-18). Distance remains the
   * tiebreak among equal depths. Omitted keeps the previous behaviour.
   */
  depthForNode?: (node: WorldNode) => number,
): string | null {
  let bestId: string | null = null;
  let bestDistance = Infinity;
  let bestDepth = Infinity;
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
    const effRadius =
      radiusForKind(node.kind, tokens) * node.magnitudeScale * (radiusScaleForNode ? radiusScaleForNode(node) : 1) * camera.scale.value + 5;
    const distance = Math.hypot(screenX - screen.x, screenY - screen.y);
    // Compare positively — a NaN coordinate (mocked or unprojected) cannot pass `<=`.
    if (!(distance <= effRadius)) continue;
    const depth = depthForNode ? depthForNode(node) : 0;
    if (depth < bestDepth - 1e-6 || (Math.abs(depth - bestDepth) <= 1e-6 && distance < bestDistance)) {
      bestId = node.id;
      bestDistance = distance;
      bestDepth = depth;
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
 * Review pass B defect 1 (2026-07-23) — the overview fit matched only the nodes'
 * geometry bounds into the safe area, so the bottom-most spine node's label anchor
 * (= `radius + LABEL_OFFSET` below the node, frame-draw:794 — the cull looks at the
 * anchor, not the font height) was pushed just outside the label safe-rect's cull
 * line and vanished silently, but only in the 1440×900 default view (1920 is a
 * width-constrained fit, so vertical slack remained and it never surfaced).
 * Allowance is reserved on the bottom inset **in the fit calculation only** — the
 * label cull rect and the camera's movable area are unchanged.
 *
 * The value derives from `LABEL_OFFSET` in `render/labels.ts` — max LABEL_OFFSET
 * (currently project 20) plus 4 slack. Keeping a literal 24 alongside would let
 * this reservation drift silently whenever LABEL_OFFSET changes (Guardian
 * follow-up), so it is derived per frame rather than held as a constant, which
 * guarantees it stays in sync.
 */
const OVERVIEW_LABEL_BOTTOM_ALLOWANCE = Math.max(...Object.values(LABEL_OFFSET)) + 4;

function readSafeInsets(tokens: SafeInsetTokens): SafeInsets {
  return {
    left: tokens.safeInsetLeft ?? 0,
    right: tokens.safeInsetRight ?? 0,
    top: tokens.safeInsetTop ?? 0,
    // No insets specified (= the pure fit test contract, with no chrome) stays 0 as
    // before — the label allowance is added only when a real bottom chrome inset exists.
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
const SMALL_GRAPH_NODE_MAX = 5;

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
 * The pan envelope with no focus — **around the fit when a leash is set, otherwise
 * the world bbox plus slack, as before**.
 *
 * ## Why the leash was needed (gateway measurement, 2026-07-29)
 *
 * The map on the `/download` stage is the gateway's only sales argument, and one
 * hard drag to the left pushed the whole graph behind the reserved column so **the
 * stage went empty** (ink in the 0..520 band +12.6%, unchanged 12 seconds later —
 * zero damping). On the workbench "fit the map" brings it back, but
 * the gateway has no such chrome. **Allowing an irreversible gesture on a screen
 * with no way back** is the defect.
 *
 * The old envelope (world bbox ± 320) widens with the graph, so no value could ever
 * guarantee "outside the reserved column". The leash takes **the fit itself as its
 * reference point** instead — the fit already reflects the safe insets (see
 * `computeOverviewCameraTarget` above), so the leash radius becomes the movement
 * limit on screen and stops depending on vault size. It is **the same shape** the
 * focus pan clamp (`cameraFocusPanMargin`) uses, so no new mechanism is invented.
 *
 * With `leash <= 0` the behaviour is unchanged — the workbench's token default of 0
 * leaves it not one pixel different.
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
 * §3.2 "the camera spring-dives to the node plus its 1-hop neighbour bbox"). `null` only if `focusedSlug`
 * doesn't resolve to a known node.
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
 * padding grows with cluster size instead of a fixed px pad), floored at the
 * overview's OWN entry zoom (a "dive" never zooms OUT past the overview
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
): CameraTarget | null {
  if (focusedSlug === null) {
    // Overview fits the SPINE bbox (project+domain+hub — the only tier drawn at
    // entry), not the full 295-node bounds; see `topology-world.ts#spineBounds`.
    return computeOverviewCameraTarget(overviewBounds, viewportWidth, viewportHeight, tokens);
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
   * **Use the safe insets the same way the overview path does** (owner call,
   * 2026-08-10: *"It must not be covered; centre it in the space left by the panel."* — it must not be
   * covered; centre it in the space left by the panel).
   *
   * ⚠️ This function used to use the insets **not at all** — it returned
   * `tx: centerX` verbatim and fitted the zoom against the whole viewport. So
   * choosing a node could put it **behind the panel that explains it**. Measured
   * (1512×982): opening the popover covers 384px on the right while the target was
   * still the screen's centre.
   *
   * The overview path (`computeOverviewCameraTarget`) was **already** solving the
   * same problem with insets, so the prescription is not a new correction system
   * but bringing this function onto that mechanism — a day earlier I did the
   * opposite (stacking a second shift at the call site), and that produced a 188px
   * misalignment and a 64px over-correction.
   */
  const insets = readSafeInsets(tokens);
  const effW = Math.max(1, viewportWidth - insets.left - insets.right);
  const effH = Math.max(1, viewportHeight - insets.top - insets.bottom);
  const fitScale = Math.min(effW / w, effH / h);
  const effectiveMax = computeEffectiveCameraScaleMax(overviewEntryScale, tokens.cameraMaxZoomRatio, tokens.cameraScaleMax);
  // Owner report (2026-07-24) — with neighbours hidden (spotlight and the like) the
  // ego bbox is small and the fit shoots up into a microscope zoom. Zooming in for
  // selection framing is capped at overviewEntryScale × focusMaxZoomRatio — ego
  // members are tier-exempt so they are all visible even at that zoom, and fitting
  // in the zoom-out direction is not limited.
  const focusZoomInCeiling = overviewEntryScale * (tokens.focusMaxZoomRatio ?? Number.POSITIVE_INFINITY);
  const scale = Math.min(effectiveMax, focusZoomInCeiling, Math.max(overviewEntryScale, fitScale));

  /*
   * Push the target back by the insets — **the same formula** as the overview path
   * (`(left - right) / (2 × scale)`). Divide by the zoom factor because the same
   * screen offset is a shorter world distance the further in you are zoomed.
   */
  return { ...centerForInsets(centerX, centerY, insets, scale), tscale: scale };
}

/**
 * The camera target for a 3D dome selection reframe — **the same contract** as the
 * ego-fit branch of `computeFocusCameraTarget` (`focusBboxMargin` multiplicative
 * padding, the same safe-inset grammar, the same zoom-in ceiling), with different
 * inputs: the bbox is not the 2D ego but the **dome ego bbox projected at the
 * target pose** (`model/dome-view.ts#domeEgoWorldBounds`), and the zoom-out floor
 * is not 2D's `overviewEntryScale` but the **dome fit zoom** (`scaleFloor`) —
 * because the dome's projected bbox is wider than the 2D spine, so its fit zoom
 * lives below the 2D floor (see the `DomeRuntime.fitScale` JSDoc). The insets are
 * re-read here so `readSafeInsets`'s label-allowance rule is not reimplemented at
 * every call site.
 */
export function computeDomeFocusCameraTarget(
  egoBounds: { minX: number; minY: number; maxX: number; maxY: number },
  tokens: TopologyV2Tokens,
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
  const insets = readSafeInsets(tokens);
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
  tokens: TopologyV2Tokens,
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
  const fitScale = Math.min(viewportWidth / w, viewportHeight / h);
  const effectiveMax = computeEffectiveCameraScaleMax(overviewEntryScale, tokens.cameraMaxZoomRatio, tokens.cameraScaleMax);
  // Owner report (2026-07-24) — with neighbours hidden (spotlight and the like) the
  // ego bbox is small and the fit shoots up into a microscope zoom. Zooming in for
  // selection framing is capped at overviewEntryScale × focusMaxZoomRatio — ego
  // members are tier-exempt so they are all visible even at that zoom, and fitting
  // in the zoom-out direction is not limited.
  const focusZoomInCeiling = overviewEntryScale * (tokens.focusMaxZoomRatio ?? Number.POSITIVE_INFINITY);
  const scale = Math.min(effectiveMax, focusZoomInCeiling, Math.max(overviewEntryScale, fitScale));
  return { tx: centerX, ty: centerY, tscale: scale };
}

/**
 * Has the camera pushed every node off screen (#71)?
 *
 * Why it is needed: moving the window to another monitor, or resizing it heavily,
 * changes the viewport and DPR together while the camera stays put. In that
 * combination, with every node outside the viewport, the user sees **an empty map**
 * — only pressing "fit the whole map" brings it back (codex
 * audit P1 report).
 *
 * The safety net's discipline:
 * - **It does not force a full fit on every resize.** The zoom and position the
 *   user set are intent, and erasing them is a different kind of defect.
 * - It corrects only in the unambiguous state "not one node is on screen".
 * - A margin counts a node barely clipping the edge as 'visible' — which stops the
 *   camera flickering and jumping at the boundary.
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
