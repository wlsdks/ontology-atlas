/**
 * Whether the map's search/action lane must drop its chip labels because the
 * map has no room for the labelled lane beside the right-hand utility group.
 *
 * Measured 2026-09-02 (static build, index expanded, one trail chip): the
 * labelled lane is 500 px wide and is centred in the map that remains right of
 * the index, while the utility group (Agent · Recent, 225 px) hangs from the
 * right edge. At 1280 px the two overlapped by 49 px and at 1366 px by 6 px;
 * at 1440 px they cleared by 30 px. The added Meaning review action consumes that
 * clearance. With the desktop automation/agent controls and a trail present,
 * a 2026-09-24 static-export probe measured 105 px overlap at 1728 and 9 px
 * at 1920. Keep the expanded-index lane compact and on its own row below 2048.
 * Below `xl` (1280 px) the lane already moves to its own row, and only
 * while the index is expanded (collapsed, the lane is centred in the whole map
 * and clears at every `xl` width).
 *
 * Selection-driven compaction (`compact-focus`, the inspector) is a separate
 * reason that ORs with this one at the call site.
 */
export const SEARCH_LANE_CROWDED_BELOW_PX = 2048;

export function isSearchLaneCrowded(input: {
  /** `useViewportBelow(SEARCH_LANE_CROWDED_BELOW_PX)` — true below the measured crowding boundary. */
  viewportBelowCrowdedWidth: boolean;
  /** The left index panel is expanded (not the collapsed rail). */
  indexExpanded: boolean;
}): boolean {
  return input.viewportBelowCrowdedWidth && input.indexExpanded;
}
