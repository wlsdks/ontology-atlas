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
 * default; the analysis rail only reclaims the slot for health — the only
 * remaining mode with rail-specific controls INDEX doesn't have (분석 패널
 * 완전 소멸 2단계 §c 가 health 마저 `/ontology/insights` 관계 탭 수리 큐로
 * 옮기면 이 예외도 사라진다).
 *
 * overview mode never reclaims the slot any more (W3 분석 보기 은퇴 —
 * `TopologyAnalysisBar`'s overview-mode content retired to the relation
 * legend, the INDEX footer's agent-handoff menu, and the insights relations
 * tab; the "View analysis" reveal chip that used to opt into overview chrome
 * is gone with it, since there's no overview chrome left to reveal).
 *
 * focus mode ALSO never reclaims the slot (분석 패널 완전 소멸 2단계 §a) —
 * the analysis rail's focus-mode content (brief copy, review order, agent
 * handoff checks) duplicated what the node datasheet
 * (`TopologyV2DetailPanel`'s action row) and `FullDetailA1`'s handoff row
 * already cover, so it was removed rather than migrated. INDEX keeps the
 * slot through node selection/expand now — no more auto-collapse on focus.
 *
 * path mode ALSO never reclaims the slot any more (분석 패널 완전 소멸
 * 2단계 §b) — the left-slot path panel (route card + MCP/CLI chips + proof
 * disclosure) moved to a top-center "chrome grammar" status chip
 * (`TopologyPathChip`, mounted next to `SearchHint`), which isn't part of
 * the left-slot contest at all.
 *
 * Pure decision — no React, no DOM. `resolveLeftSlotOwner` + `resolveRenderedIndexPanelState`
 * together are the whole contract HomePage wires against.
 */

export type LeftSlotOwner = "index" | "analysis-rail";

export interface LeftSlotInputs {
  analysisMode: LeftSlotAnalysisMode;
}

export function resolveLeftSlotOwner(inputs: LeftSlotInputs): LeftSlotOwner {
  return inputs.analysisMode === "overview" ||
    inputs.analysisMode === "focus" ||
    inputs.analysisMode === "path"
    ? "index"
    : "analysis-rail";
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
