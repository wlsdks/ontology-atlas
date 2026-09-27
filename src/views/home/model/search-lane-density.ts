/**
 * Whether the search lane drops its chip labels because the labelled lane (500 px, centred right
 * of the index)
 * would overlap the right utility group. Measured with the index expanded: it clears only from
 * 1728 px, and
 * below `xl` the lane has its own row. Selection-driven compaction ORs with this at the call site.
 */
export const SEARCH_LANE_CROWDED_BELOW_PX = 1728;

export function isSearchLaneCrowded(input: {
  viewportBelowCrowdedWidth: boolean;
  /** Expanded, not the collapsed rail. */
  indexExpanded: boolean;
}): boolean {
  return input.viewportBelowCrowdedWidth && input.indexExpanded;
}
