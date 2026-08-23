/**
 * Semantic-zoom tier gating — the "level 0 = project + domain + hub only"
 * charter from `.claude/rules/design.md` ("default view = overview-first ... level 0
 * = project + domain + hub only, others expand on click (semantic zoom)") — the
 * default view is overview-first; level 0 draws only project + domain + hub and
 * everything else expands on click.
 *
 * P3 live diagnosis (chrome-devtools, dogfood 295 nodes / 505 edges) showed
 * the overview drawing *every* node — capabilities and elements fanned into
 * tight concentric arcs (the owner's "fan-arc pileup") with label
 * and trace soup on top. The lead's decision is to gate the NODES (and their
 * traces), not just the labels: at the overview entry only project + domain +
 * the single hub node draw; capabilities appear as you zoom into a transition
 * band, elements deeper still.
 *
 * DECOUPLING (this pass): tier visibility no longer rides `farT`. `farT` is the
 * *visual-expression* axis (constellation ↔ circuit) and the redesign wants the
 * default overview to read as CIRCUIT (`farT ≈ 0`) — but circuit-at-entry with a
 * farT-based gate would un-hide every capability/element and recreate the soup.
 * So tier visibility is now driven by a separate **zoom ratio** signal
 * (`computeZoomRatio`) = `cameraScale / overviewEntryScale`: `1.0` at the
 * overview entry, `>1` zoomed IN, `<1` zoomed OUT. At ratio ≈ 1 only the
 * project/domain/hub spine shows; capabilities cross-fade in past a zoom-in
 * threshold, elements deeper. Zooming OUT (ratio < 1) keeps only the spine —
 * never soup — regardless of what the far-field expression is doing.
 *
 * The gate stays a continuous `alpha ∈ [0,1]` (smoothstep bands) so the "no
 * discrete mode flip" invariant is preserved: nodes fade in/out, they never
 * pop. Pure math — no camera/DOM/token knowledge beyond the numbers passed in.
 */

import { smoothstep } from "./altitude";
import type { LayoutNodeKind } from "./layout";

export interface TierRevealBand {
  /** zoomRatio at/below which the tier is fully hidden (overview / zoomed out). */
  enterRatio: number;
  /** zoomRatio at/above which the tier is fully shown (zoomed in). */
  fullRatio: number;
}

export interface TierRevealConfig {
  capability: TierRevealBand;
  element: TierRevealBand;
}

/**
 * Default reveal bands, in **zoom-ratio** units (`cameraScale / overviewEntryScale`).
 * At entry (ratio = 1) both tiers are hidden. Capabilities cross-fade in across
 * the first zoom-in band; elements only in a deeper band — so zooming in reveals
 * the hierarchy one level at a time (domain → capability → element) while the
 * 8-node spine stays put. Tuned live against the dogfood vault (295 nodes) so
 * both tiers finish revealing within the camera's zoom-in headroom
 * (`--topology-v2-camera-scale-max`).
 */
export const DEFAULT_TIER_REVEAL: TierRevealConfig = {
  capability: { enterRatio: 1.5, fullRatio: 2.0 },
  element: { enterRatio: 2.3, fullRatio: 2.85 },
};

/** Plain (non-developer) lens — pushes the element tier into an unreachable band
 * so it is always hidden. The ego exemption (`effectiveNodeAlpha`) still applies:
 * hidden by default, revealed opt-in when you click the node. The sentinel is
 * finite so `smoothstep` cannot produce NaN. */
export const PLAIN_TIER_REVEAL: TierRevealConfig = {
  capability: DEFAULT_TIER_REVEAL.capability,
  element: { enterRatio: 1e6, fullRatio: 2e6 },
};

/**
 * Zoom ratio = `cameraScale / overviewEntryScale`. `1.0` exactly at the overview
 * entry (where `cameraScale === overviewEntryScale`), `>1` zoomed in, `<1`
 * zoomed out. Guards a non-positive entry scale (returns 1 so nothing gates
 * unexpectedly before the camera has initialized).
 */
export function computeZoomRatio(cameraScale: number, overviewEntryScale: number): number {
  if (overviewEntryScale <= 0) return 1;
  return cameraScale / overviewEntryScale;
}

/** `smoothstep(enter, full, ratio)` — 0 at/below `enter` (overview), 1 at/above `full` (zoomed in). */
function revealAlpha(zoomRatio: number, band: TierRevealBand): number {
  return smoothstep(band.enterRatio, band.fullRatio, zoomRatio);
}

/**
 * Alpha for a node at the current zoom ratio. Project/domain and the single hub
 * node are always fully visible (the level-0 spine); capabilities/elements fade
 * in per their reveal band as the camera zooms in.
 */
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

/** An edge is only as visible as its least-visible endpoint (both ends must be present for the relation to read). */
export function edgeTierAlpha(sourceAlpha: number, targetAlpha: number): number {
  return Math.min(sourceAlpha, targetAlpha);
}

/**
 * C1 A2 — focus ego tier exemption ("expand on click"). A node that's semantic-
 * zoom-gated (e.g. a capability at overview zoom, tierAlpha ≈ 0) must still
 * become visible + clickable once it's the focused node or one of its 1-hop
 * neighbors — that's the entire point of clicking a domain to "expand" it.
 * `egoRamp` is the smooth 0..1 reveal ramp (`stepEmphasis`-driven, physics-step
 * owns stepping it) so the ego set FADES in over its rise tau, never pops.
 * Non-ego-members are untouched — the tier gate still governs them normally.
 */
export function effectiveNodeAlpha(tierAlpha: number, isEgoMember: boolean, egoRamp: number): number {
  return isEgoMember ? Math.max(tierAlpha, egoRamp) : tierAlpha;
}

/** Minimum tier/effective alpha for a node to be grabbable/hoverable/clickable
 * — hidden (semantic-zoom-gated) nodes must not be hit. Shared by the pointer
 * hit-test (`ui/topology-pointer-handlers.ts#hitVisibleNode` via
 * `isNodeHittable` below) and the label-eligibility ramp
 * (`render/labels.ts#computeLabelAlpha`) — "if you can click it, you can read it", the label-clarity persona fix. */
export const HITTABLE_MIN_TIER_ALPHA = 0.5;

/** Minimal node shape `isNodeHittable` needs — structurally compatible with `WorldNode`. */
export interface HittableNodeInput {
  id: string;
  kind: LayoutNodeKind;
  isHub: boolean;
}

/**
 * Whether a node is currently hittable (grabbable/hoverable/clickable) —
 * mirrors the draw pass's `effectiveNodeAlpha` ego exemption exactly: a node
 * that's semantic-zoom-gated below `HITTABLE_MIN_TIER_ALPHA` is STILL
 * hittable once it's the focused node or one of its 1-hop neighbors (C1 A2's
 * "click a domain to expand it"). Pure predicate — extracted from
 * `ui/topology-pointer-handlers.ts#hitVisibleNode`'s inline filter so the
 * ego-exemption hit/commit contract has a unit test independent of canvas/
 * pointer-event plumbing (label-clarity persona eval — "child click ejects
 * to overview instead of selecting").
 *
 * S3 finishing polish (designed by fable, S2 known gap) — `clusteredIds` is the
 * frame's NOT-DRAWN set: subtree nodes collapsed by the density condition AND,
 * critically, the selective-ego neighbors folded behind the "+N neighbours"
 * chip when a focused node exceeds the ego limit. Those hidden
 * neighbors are still 1-hop neighbors, so the ego exemption below would
 * (wrongly) keep them clickable — grabbing an invisible node. Excluding the
 * clustered set FIRST keeps hit and draw in lockstep: if it isn't painted this
 * frame, it isn't hittable.
 */
export function isNodeHittable(
  node: HittableNodeInput,
  zoomRatio: number,
  focusedNodeId: string | null,
  neighborsOfFocused: ReadonlySet<string> | undefined,
  config: TierRevealConfig = DEFAULT_TIER_REVEAL,
  clusteredIds?: ReadonlySet<string>,
  /**
   * S10 defect 3 (critical, designed by fable) — while a realm is expanded a
   * node's tier is redefined by its **depth from the root** (root = project,
   * one level down = domain, …) rather than by its own `kind`. The draw pass
   * already applies that override in `topology-frame-draw.ts` via
   * `realmTierKinds?.get(node.id) ?? node.kind`, but the hit path ran the
   * condition on the original kind, so a depth1 `element` child was drawn at
   * SPINE zoom yet could not be clicked or hovered (entering via
   * `?realm=domain:…` left every non-centre child inert). Injecting the same
   * override here keeps draw and hit in lockstep: if it is drawn, it is
   * grabbable.
   */
  tierKindById?: ReadonlyMap<string, LayoutNodeKind> | null,
  /**
   * **The alpha the draw pass actually used this frame**
   * (`effectiveAlphaById` in `topology-frame-draw.ts`). When supplied, the hit
   * test uses it as the **single source**.
   *
   * Why it exists (full inventory, 2026-07-31): four channels pierce the tier
   * condition in the draw pass — edge selection, the footprint lens, ego focus,
   * and the recently-changed spotlight — while the hit path had **only ego**. So
   * a node raised by the footprint lens was **visible but unclickable**, even
   * though the draw-side comment claimed *"the same piercing applies to the hit
   * test, so you can click it again straight from the map"*. The exact case the
   * comment described was the one still broken; it had been written by reading
   * only the draw side.
   *
   * Threading one more argument per channel **drifts again the next time a
   * channel is added** — that is how this defect was created. Reading the map
   * the draw pass already builds cannot drift.
   *
   * Omitting it falls back to the previous computation, which guards the first
   * frame: before the first paint the map is empty, and for that one frame the
   * fallback matches today's behaviour.
   */
  effectiveAlphaById?: ReadonlyMap<string, number> | null,
): boolean {
  if (clusteredIds?.has(node.id)) return false;
  const drawn = effectiveAlphaById?.get(node.id);
  if (drawn !== undefined) {
    // ⚠️ **The floor is 0.5** — do not swap in the draw pass's 0.02. The band
    // 0.02..0.5 is deliberately "drawn but not grabbable" (making a near-
    // transparent mark clickable produces mis-clicks), and it pairs with
    // `computeLabelAlpha`'s rule that if you can click it, you can read it. The
    // contract's exact wording: grabbable once more than half revealed.
    return drawn >= HITTABLE_MIN_TIER_ALPHA;
  }
  const tierKind = tierKindById?.get(node.id) ?? node.kind;
  if (nodeTierAlpha(tierKind, node.isHub, zoomRatio, config) >= HITTABLE_MIN_TIER_ALPHA) return true;
  return focusedNodeId !== null && (node.id === focusedNodeId || (neighborsOfFocused?.has(node.id) ?? false));
}

/**
 * True while the semantic zoom still shows ONLY the project/domain/hub spine
 * (the capability tier has not begun to reveal). Pan/flick clamps must then use
 * the SPINE bounds, not the full-graph bounds: the de-pileup layout spreads all
 * 295 nodes over a far larger area than the ~8 spine nodes actually drawn at
 * the overview, so clamping to the full bounds leaves a vast legal-but-EMPTY
 * region the camera can strand in — the owner's "drag and the canvas disappears" (drag and the canvas disappears; QA loss A). One strong flick
 * projected thousands of world units
 * and landed inside the invisible fan; every pixel was "in bounds", nothing was
 * drawn.
 */
export function isSpineOnlyZoom(zoomRatio: number, config: TierRevealConfig): boolean {
  return zoomRatio < config.capability.enterRatio;
}

/**
 * The altitude tier the reader is currently at, for the corner readout's
 * orientation label (M-5). Derived from the SAME reveal bands the draw pass
 * gates node visibility with, so the readout can never claim "zoom in to see
 * elements" while elements are actually on screen (the exact orientation lie
 * the UX round caught). A tier is "reached" once its band is at least
 * half-revealed (`revealAlpha ≥ 0.5`), matching the `HITTABLE_MIN_TIER_ALPHA`
 * threshold — the point where the tier's nodes become legible/clickable, not
 * the instant their alpha leaves zero.
 *
 *   spine     — only project/domain/hub drawn (capabilities not yet revealed)
 *   circuit   — capabilities revealed, elements not yet
 *   element   — elements revealed (the "zoom in to see elements" hint is now
 *               false and must be dropped)
 */
export type ZoomTier = "spine" | "circuit" | "element";

export function classifyZoomTier(
  zoomRatio: number,
  config: TierRevealConfig = DEFAULT_TIER_REVEAL,
): ZoomTier {
  if (revealAlpha(zoomRatio, config.element) >= HITTABLE_MIN_TIER_ALPHA) return "element";
  if (revealAlpha(zoomRatio, config.capability) >= HITTABLE_MIN_TIER_ALPHA) return "circuit";
  return "spine";
}
