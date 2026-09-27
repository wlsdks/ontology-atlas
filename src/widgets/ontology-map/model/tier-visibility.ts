/**
 * Semantic-zoom tier gating (overview first, `.claude/rules/design.md`): at the overview
 * only the project, domains and the hub draw; capabilities fade in past a zoom-in band and
 * elements deeper. Driven by the zoom ratio `cameraScale / overviewEntryScale`, not `farT`,
 * so the circuit expression at entry does not un-hide every node. Continuous smoothstep
 * alpha, never a discrete flip.
 */

import { smoothstep } from "./altitude";
import type { LayoutNodeKind } from "./layout";

interface TierRevealBand {
  enterRatio: number;
  fullRatio: number;
}

export interface TierRevealConfig {
  capability: TierRevealBand;
  element: TierRevealBand;
}

/**
 * At entry (ratio 1) both tiers are hidden; tuned on the dogfood vault so both finish
 * revealing within `--map-camera-scale-max`.
 */
export const DEFAULT_TIER_REVEAL: TierRevealConfig = {
  capability: { enterRatio: 1.75, fullRatio: 2.0 },
  element: { enterRatio: 2.575, fullRatio: 2.85 },
};

/**
 * Pushes the element tier to an unreachable band; the ego exemption still reveals a clicked
 * node. Finite sentinels so `smoothstep` cannot produce NaN.
 */
export const PLAIN_TIER_REVEAL: TierRevealConfig = {
  capability: DEFAULT_TIER_REVEAL.capability,
  element: { enterRatio: 1e6, fullRatio: 2e6 },
};

/** Returns 1 for a non-positive entry scale, so nothing gates before the camera initialises. */
export function computeZoomRatio(cameraScale: number, overviewEntryScale: number): number {
  if (overviewEntryScale <= 0) return 1;
  return cameraScale / overviewEntryScale;
}

function revealAlpha(zoomRatio: number, band: TierRevealBand): number {
  return smoothstep(band.enterRatio, band.fullRatio, zoomRatio);
}

/** Project, domains and the hub are always fully visible (the level-0 spine). */
export function nodeTierAlpha(
  kind: LayoutNodeKind,
  isHub: boolean,
  zoomRatio: number,
  config: TierRevealConfig,
): number {
  if (isHub || kind === "project" || kind === "domain") return 1;
  if (kind === "capability") return revealAlpha(zoomRatio, config.capability);
  return revealAlpha(zoomRatio, config.element);
}

/** Both ends must be present for the relation to read. */
export function edgeTierAlpha(sourceAlpha: number, targetAlpha: number): number {
  return Math.min(sourceAlpha, targetAlpha);
}

/**
 * A tier-gated node in the focus ego set fades in on `egoRamp`, so clicking a domain
 * expands it without a pop; non-members stay under the tier gate.
 */
export function effectiveNodeAlpha(tierAlpha: number, isEgoMember: boolean, egoRamp: number): number {
  return isEgoMember ? Math.max(tierAlpha, egoRamp) : tierAlpha;
}

/**
 * The one floor for paint, hit test (`isNodeHittable`) and label eligibility
 * (`render/labels.ts` `computeLabelAlpha`): one exported name so the three cannot disagree.
 * A higher hit floor would paint circles that cannot be named, hovered or clicked, with a
 * click falling through to an edge behind.
 */
export const HITTABLE_MIN_TIER_ALPHA = 0.02;

/** Structurally compatible with `WorldNode`. */
export interface HittableNodeInput {
  id: string;
  kind: LayoutNodeKind;
  isHub: boolean;
}

/**
 * Mirrors the draw pass's ego exemption so a clicked domain's neighbours are
 * clickable. `clusteredIds` is the frame's not-drawn set, including neighbours folded behind the `+N`
 * chip, and is excluded first so an invisible node is never grabbable.
 */
export function isNodeHittable(
  node: HittableNodeInput,
  zoomRatio: number,
  focusedNodeId: string | null,
  neighborsOfFocused: ReadonlySet<string> | undefined,
  config: TierRevealConfig = DEFAULT_TIER_REVEAL,
  clusteredIds?: ReadonlySet<string>,
  /**
   * In a realm the tier follows depth from the root, as the draw pass applies it; without
   * this a depth-1 element drawn at spine zoom could not be clicked.
   */
  tierKindById?: ReadonlyMap<string, LayoutNodeKind> | null,
  /**
   * The alpha the draw pass used this frame, the single source: several channels (edge
   * selection, trail lens, ego, spotlight) pierce the tier gate, and one argument per
   * channel drifts when a channel is added. Omitted, the fallback covers the first frame.
   */
  effectiveAlphaById?: ReadonlyMap<string, number> | null,
): boolean {
  if (clusteredIds?.has(node.id)) return false;
  const drawn = effectiveAlphaById?.get(node.id);
  if (drawn !== undefined) {
    // The draw pass's own paint floor, so nothing is drawn but not grabbable.
    return drawn >= HITTABLE_MIN_TIER_ALPHA;
  }
  const tierKind = tierKindById?.get(node.id) ?? node.kind;
  if (nodeTierAlpha(tierKind, node.isHub, zoomRatio, config) >= HITTABLE_MIN_TIER_ALPHA) return true;
  return focusedNodeId !== null && (node.id === focusedNodeId || (neighborsOfFocused?.has(node.id) ?? false));
}

/**
 * Pan and flick clamps must use the spine bounds here: the full layout spans far more than
 * the drawn spine, so a flick could strand the camera in a legal but empty region.
 */
export function isSpineOnlyZoom(zoomRatio: number, config: TierRevealConfig): boolean {
  return zoomRatio < config.capability.enterRatio;
}

export type ZoomTier = "spine" | "circuit" | "element";

/**
 * The reader's tier for the corner readout, from the same bands the draw pass gates with,
 * so the readout never says "zoom in to see elements" while elements are on screen. A tier is
 * reached once its band's alpha reaches `HITTABLE_MIN_TIER_ALPHA`, the floor at which its nodes
 * become hittable.
 */
export function classifyZoomTier(
  zoomRatio: number,
  config: TierRevealConfig = DEFAULT_TIER_REVEAL,
): ZoomTier {
  if (revealAlpha(zoomRatio, config.element) >= HITTABLE_MIN_TIER_ALPHA) return "element";
  if (revealAlpha(zoomRatio, config.capability) >= HITTABLE_MIN_TIER_ALPHA) return "circuit";
  return "spine";
}
