import { describe, expect, it } from "vitest";

import { isSearchLaneCrowded, SEARCH_LANE_CROWDED_BELOW_PX } from "./search-lane-density";

describe("search lane crowding — labels drop only where the map measured no room", () => {
  it("narrow viewport with the index expanded is crowded", () => {
    expect(isSearchLaneCrowded({ viewportBelowCrowdedWidth: true, indexExpanded: true })).toBe(true);
  });

  it("a collapsed index gives the lane the whole map — not crowded", () => {
    expect(isSearchLaneCrowded({ viewportBelowCrowdedWidth: true, indexExpanded: false })).toBe(false);
  });

  it("a wide viewport is never crowded, index or not", () => {
    expect(isSearchLaneCrowded({ viewportBelowCrowdedWidth: false, indexExpanded: true })).toBe(false);
    expect(isSearchLaneCrowded({ viewportBelowCrowdedWidth: false, indexExpanded: false })).toBe(false);
  });

  it("reserves room for the Meaning review action beside the expanded-index search lane", () => {
    expect(SEARCH_LANE_CROWDED_BELOW_PX).toBe(1728);
  });
});
