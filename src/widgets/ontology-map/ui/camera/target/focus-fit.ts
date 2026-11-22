import { clampPointToPanBounds, type CameraTarget } from "../../../engine/camera";
import type { OntologyMapTokens } from "../../../tokens/read-map-tokens";
import { computeClusterDiscBounds, computeEgoBounds, computeIdsBounds } from "../../world/framing/world-bounds";
import { dialOverviewFit, type DialFocusFrame } from "../../world/framing/dial-world-framing";
import { type Bounds, type TopologyWorld } from "../../world/topology-world";
import { computeOverviewCameraTarget } from "./fit-targets";
import { computeUnfocusedPanBounds, focusLeashPx, focusPanBounds } from "./pan-leash";
import { centerForInsets, readSafeInsets } from "./safe-insets";
import { computeEffectiveCameraScaleMax, computeEffectiveCameraScaleMin, drawsFlatGraph } from "./zoom-range";

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

/**
 * Camera target for the current focus: the full-graph overview fit when `focusedSlug` is `null`, else
 * the node plus its 1-hop ego bbox (`--map-focus-bbox-margin`, `docs/design/ontology-map.md` 3.2).
 * Floored at the overview entry zoom, capped at the effective max. `null` if the slug is unknown.
 */
export function computeFocusCameraTarget(
  world: TopologyWorld,
  tokens: OntologyMapTokens,
  viewportWidth: number,
  viewportHeight: number,
  focusedSlug: string | null,
  /** `overviewScale × overviewEntryRatio` at the current viewport — the zoom-ratio's "1.0" anchor (`model/visibility/tier-visibility.ts#computeZoomRatio`). */
  overviewEntryScale: number,
  /**
   * While a realm is expanded, that realm's member set. Restricting
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
 * The camera target for a 3D dome selection reframe, the same contract as the ego-fit branch of `computeFocusCameraTarget`
 * (`focusBboxMargin` padding, safe insets, zoom-in ceiling) with other inputs: the dome ego bbox projected at the target pose
 * (`domeEgoWorldBounds`) and the dome fit zoom as the zoom-out floor (`scaleFloor`; see `DomeRuntime.fitScale`).
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
  // Keep the target inside the focus pan leash's envelope (`cameraFocusPanMargin`): the dome's ego neighbours project asymmetrically, so the bbox centre can
  // fall outside the leash and the elastic clamp would pull the camera back after the tween arrives (measured 38 units, a visible slide after landing).
  if (focusAnchor && tokens.cameraFocusPanMargin > 0) {
    const m = tokens.cameraFocusPanMargin;
    target.tx = Math.min(focusAnchor.x + m, Math.max(focusAnchor.x - m, target.tx));
    target.ty = Math.min(focusAnchor.y + m, Math.max(focusAnchor.y - m, target.ty));
  }
  return target;
}

/**
 * The camera dive target for an expanded cluster disc (the parent plus its direct children's fan): the ego-fit contract of
 * `computeFocusCameraTarget` with contains children as the subject, so the children reveal through tier alpha. `null` when
 * `parentId` does not resolve or has no children (the camera does not move).
 */
export function computeClusterFitTarget(
  world: TopologyWorld,
  tokens: OntologyMapTokens,
  viewportWidth: number,
  viewportHeight: number,
  parentId: string,
  overviewEntryScale: number,
  /**
   * High-fanout batch reveal: the nodes to include in the framing (the parent plus this batch's
   * children). Given, the disc bbox narrows to this set so it holds "a few, large" rather than
   * pulling far out to take every child. null or omitted means the whole disc.
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
  const scaleMin = computeEffectiveCameraScaleMin(overviewEntryScale, tokens.cameraMinZoomRatio, tokens.cameraScaleMin, drawsFlatGraph(world));
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
