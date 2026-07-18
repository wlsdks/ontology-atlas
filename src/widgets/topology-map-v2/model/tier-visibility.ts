/**
 * Semantic-zoom tier gating — the "level 0 = project + domain + hub 만"
 * charter from `.claude/rules/design.md` ("기본 뷰 = overview-first ... level 0
 * = project + domain + hub 만, 나머지는 클릭 시 expand (semantic zoom)").
 *
 * P3 live diagnosis (chrome-devtools, dogfood 295 nodes / 505 edges) showed
 * the overview drawing *every* node — capabilities and elements fanned into
 * tight concentric arcs (the owner's "반달 겹침" / fan-arc pileup) with label
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
 * True while the semantic zoom still shows ONLY the project/domain/hub spine
 * (the capability tier has not begun to reveal). Pan/flick clamps must then use
 * the SPINE bounds, not the full-graph bounds: the de-pileup layout spreads all
 * 295 nodes over a far larger area than the ~8 spine nodes actually drawn at
 * the overview, so clamping to the full bounds leaves a vast legal-but-EMPTY
 * region the camera can strand in — the owner's "드래그하면 캔버스가
 * 사라져버림" (QA 소실 A). One strong flick projected thousands of world units
 * and landed inside the invisible fan; every pixel was "in bounds", nothing was
 * drawn.
 */
export function isSpineOnlyZoom(zoomRatio: number, config: TierRevealConfig): boolean {
  return zoomRatio < config.capability.enterRatio;
}
