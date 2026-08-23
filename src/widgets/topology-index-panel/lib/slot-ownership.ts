import type { IndexPanelState } from "./index-panel-state";

/**
 * Mirrors `TopologyAnalysisMode` (`src/views/home/model/url-state.ts`) by
 * value, not by import — FSD forbids `widgets` importing from `views`
 * (`.claude/rules/architecture.md`).
 */
export type LeftSlotAnalysisMode = "overview" | "focus" | "path" | "health";

/**
 * Left-slot exclusivity (「The hub is the map」 — the hub is the map;
 * "Left-slot choreography").
 *
 * INDEX used to share the topology's left slot with the analysis rail
 * (`TopologyAnalysisBar`, née "reader lens panel"), which reclaimed it for
 * whichever analysis mode carried rail-specific controls INDEX didn't have.
 * "Phase 2 of retiring the analysis panel entirely" (phase 2 of retiring the analysis panel entirely)
 * removed that rail mode by mode — focus (§a) was removed outright (the node
 * datasheet's action row and `FullDetailA1`'s handoff row already covered what
 * it showed), path (§b) moved to a top-center "chrome grammar" status chip
 * (`TopologyPathChip`, mounted next to `SearchHint`), and health (§c) moved to
 * the 「Repair Queue」 (repair queue) section of `/ontology/insights`' relations tab.
 * With all three gone, `TopologyAnalysisBar` itself was deleted (§d) — there is
 * no longer any content that reclaims the left slot, so INDEX owns it
 * unconditionally.
 *
 * `resolveLeftSlotOwner` stays as a named seam (not an inlined constant)
 * because `resolveRenderedIndexPanelState` still reads its output, and a
 * future mode that genuinely needs the slot back has one obvious place to
 * change the rule instead of hunting through `HomePage`.
 */
export type LeftSlotOwner = "index" | "analysis-rail";

export interface LeftSlotInputs {
  analysisMode: LeftSlotAnalysisMode;
}

export function resolveLeftSlotOwner(inputs: LeftSlotInputs): LeftSlotOwner {
  void inputs;
  return "index";
}

/**
 * The INDEX panel's rendered visual state — distinct from the user's
 * persisted preference (`IndexPanelState`). Now that `resolveLeftSlotOwner`
 * always returns `"index"`, this always resolves to `preferredState` — kept
 * as a function (not inlined at call sites) for the same "one seam" reason
 * documented above.
 */
export function resolveRenderedIndexPanelState(
  owner: LeftSlotOwner,
  preferredState: IndexPanelState,
): IndexPanelState {
  return owner === "index" ? preferredState : "collapsed";
}
