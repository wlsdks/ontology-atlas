/**
 * Semantic-zoom tier gating — the "level 0 = project + domain + hub 만"
 * charter from `.claude/rules/design.md` ("기본 뷰 = overview-first ... level 0
 * = project + domain + hub 만, 나머지는 클릭 시 expand (semantic zoom)").
 *
 * P3 live diagnosis (chrome-devtools, dogfood 295 nodes / 505 edges) showed
 * the overview drawing *every* node — capabilities and elements fanned into
 * tight concentric arcs (the owner's "반달 겹침" / fan-arc pileup) with label
 * and trace soup on top. The lead's decision is to gate the NODES (and their
 * traces), not just the labels: at overview altitude only project + domain +
 * the single hub node draw; capabilities appear as you zoom into the
 * transition band, elements deeper still.
 *
 * The gate is a continuous `alpha ∈ [0,1]` driven by the same single `farT`
 * value that drives every other visual axis — so the "no discrete mode flip"
 * invariant (`model/altitude.ts`) is preserved: nodes fade in/out, they never
 * pop. `farT = 1` is constellation/overview (zoomed OUT); `farT = 0` is
 * circuit (zoomed IN). Pure math — no camera/DOM/token knowledge.
 */

import { smoothstep } from "./altitude";
import type { LayoutNodeKind } from "./layout";

export interface TierRevealBand {
  /** farT at/above which the tier is fully hidden (deep overview). */
  hideAboveFarT: number;
  /** farT at/below which the tier is fully shown (zoomed in). */
  showBelowFarT: number;
}

export interface TierRevealConfig {
  capability: TierRevealBand;
  element: TierRevealBand;
}

/**
 * Default reveal bands. Capabilities cross-fade in across the upper transition
 * band; elements only in the lower/circuit band — so zooming in reveals the
 * hierarchy one level at a time (domain → capability → element).
 */
export const DEFAULT_TIER_REVEAL: TierRevealConfig = {
  capability: { hideAboveFarT: 0.72, showBelowFarT: 0.42 },
  element: { hideAboveFarT: 0.4, showBelowFarT: 0.12 },
};

/** `1 - smoothstep(showBelow, hideAbove, farT)` — 1 when zoomed in past `showBelow`, 0 at/above `hideAbove`. */
function revealAlpha(farT: number, band: TierRevealBand): number {
  return 1 - smoothstep(band.showBelowFarT, band.hideAboveFarT, farT);
}

/**
 * Alpha for a node at the current altitude. Project/domain and the single hub
 * node are always fully visible (the level-0 spine); capabilities/elements
 * fade in per their reveal band.
 */
export function nodeTierAlpha(
  kind: LayoutNodeKind,
  isHub: boolean,
  farT: number,
  config: TierRevealConfig,
): number {
  if (isHub || kind === "project" || kind === "domain") return 1;
  if (kind === "capability") return revealAlpha(farT, config.capability);
  return revealAlpha(farT, config.element);
}

/** An edge is only as visible as its least-visible endpoint (both ends must be present for the relation to read). */
export function edgeTierAlpha(sourceAlpha: number, targetAlpha: number): number {
  return Math.min(sourceAlpha, targetAlpha);
}
