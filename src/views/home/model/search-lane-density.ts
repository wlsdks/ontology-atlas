/**
 * Whether the map's search/action lane must drop its chip labels because the
 * map has no room for the labelled lane beside the right-hand utility group.
 *
 * Measured 2026-09-02 (static build, index expanded, one trail chip): the
 * labelled lane is 500 px wide and is centred in the map that remains right of
 * the index, while the utility group (Agent · Recent, 225 px) hangs from the
 * right edge. At 1280 px the two overlapped by 49 px and at 1366 px by 6 px;
 * at 1440 px they cleared by 30 px. Below `xl` (1280 px) the lane already moves
 * to its own row, so the crowding band is exactly `xl` up to 1440 px, and only
 * while the index is expanded (collapsed, the lane is centred in the whole map
 * and clears at every `xl` width).
 *
 * Selection-driven compaction (`compact-focus`, the inspector) is a separate
 * reason that ORs with this one at the call site.
 */
export const SEARCH_LANE_CROWDED_BELOW_PX = 1440;

export function isSearchLaneCrowded(input: {
  /** `useViewportBelow(SEARCH_LANE_CROWDED_BELOW_PX)` — true when the viewport is narrower than 1440 px. */
  viewportBelowCrowdedWidth: boolean;
  /** The left index panel is expanded (not the collapsed rail). */
  indexExpanded: boolean;
}): boolean {
  return input.viewportBelowCrowdedWidth && input.indexExpanded;
}
