import type { IndexPanelState } from "./index-panel-state";

/**
 * Mirrors `TopologyAnalysisMode` (`src/views/home/model/url-state.ts`) by
 * value, not by import — FSD forbids `widgets` importing from `views`
 * (`.claude/rules/architecture.md`). Only the "overview" branch matters here;
 * callers pass HomePage's real `analysisMode` value, which is a superset of
 * this string, so no runtime cast is needed at the call site.
 */
export type LeftSlotAnalysisMode = "overview" | "graph" | "focus" | "path" | "health";

/**
 * Left-slot exclusivity (B3 허브가 곧 지도 — "Left-slot choreography").
 *
 * INDEX and the analysis rail (`TopologyAnalysisBar`, née "reader lens
 * panel") are exclusive occupants of the topology's left slot. INDEX is the
 * default; the analysis rail only reclaims the slot when the user is in a
 * non-overview analysis mode (focus/path/health — those panels carry mode-
 * specific controls INDEX doesn't have, e.g. the path source/target picker)
 * or when the user explicitly reveals the overview analysis chrome (the
 * "View analysis" chip demoted from always-on per the B3 spec).
 *
 * Pure decision — no React, no DOM. `resolveLeftSlotOwner` + `resolveRenderedIndexPanelState`
 * together are the whole contract HomePage wires against.
 */

export type LeftSlotOwner = "index" | "analysis-rail";

export interface LeftSlotInputs {
  analysisMode: LeftSlotAnalysisMode;
  /** User-initiated opt-in to see the overview analysis rail content even
   * though INDEX would otherwise own the slot (only meaningful in "overview"). */
  overviewChromeRevealed: boolean;
}

export function resolveLeftSlotOwner(inputs: LeftSlotInputs): LeftSlotOwner {
  if (inputs.analysisMode !== "overview") return "analysis-rail";
  return inputs.overviewChromeRevealed ? "analysis-rail" : "index";
}

/**
 * The INDEX panel's rendered visual state — distinct from the user's
 * persisted preference (`IndexPanelState`). When the analysis rail owns the
 * slot, INDEX auto-collapses to its edge tab regardless of the stored
 * preference; the preference itself is untouched so returning to overview
 * restores exactly what the user had before (per spec).
 */
export function resolveRenderedIndexPanelState(
  owner: LeftSlotOwner,
  preferredState: IndexPanelState,
): IndexPanelState {
  return owner === "index" ? preferredState : "collapsed";
}
