import { describe, expect, it } from "vitest";

import {
  layoutTierLegendRows,
  STRATA_SILHOUETTE_ASPECT,
  TIER_LEGEND_RAIL_COLUMN_PX,
  tierLegendPlacement,
  type TierLegendAnchor,
} from "./tier-legend-rows";

const ROW = 20;
const ANCHORS: TierLegendAnchor[] = [
  { kind: "project", y: 140 },
  { kind: "domain", y: 300 },
  { kind: "capability", y: 460 },
  { kind: "element", y: 620 },
];

describe("layoutTierLegendRows", () => {
  it("puts each row at its own plane's height when there is room", () => {
    const rows = layoutTierLegendRows(ANCHORS, 100, 600, ROW)!;
    expect(rows.map((r) => r.kind)).toEqual(["project", "domain", "capability", "element"]);
    // container-local centre = anchor − containerTop, and top = centre − row/2.
    expect(rows.map((r) => r.top + ROW / 2)).toEqual([40, 200, 360, 520]);
  });

  it("keeps the order and the minimum spacing when the projection flattens", () => {
    // A shallow pitch puts all four planes within 9 px of each other.
    const flat: TierLegendAnchor[] = [
      { kind: "project", y: 300 },
      { kind: "domain", y: 303 },
      { kind: "capability", y: 306 },
      { kind: "element", y: 309 },
    ];
    const rows = layoutTierLegendRows(flat, 100, 600, ROW)!;
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].top - rows[i - 1].top).toBeGreaterThanOrEqual(ROW - 1e-9);
    }
    expect(rows.map((r) => r.kind)).toEqual(["project", "domain", "capability", "element"]);
  });

  it("never lets a row leave the band, at either end", () => {
    const rows = layoutTierLegendRows(
      [
        { kind: "project", y: -400 },
        { kind: "domain", y: -380 },
        { kind: "capability", y: 5000 },
        { kind: "element", y: 5200 },
      ],
      100,
      200,
      ROW,
    )!;
    expect(rows[0].top).toBeGreaterThanOrEqual(0);
    expect(rows[rows.length - 1].top + ROW).toBeLessThanOrEqual(200 + 1e-9);
  });

  it("every row is the same height — the rail never shrinks one to fit", () => {
    // The helper returns tops only; equal height is what the caller applies, and
    // the guarantee here is that the spacing it hands back always admits it.
    const rows = layoutTierLegendRows(ANCHORS, 0, 4 * ROW, ROW)!;
    expect(rows).toHaveLength(4);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].top - rows[i - 1].top).toBeGreaterThanOrEqual(ROW - 1e-9);
    }
    expect(rows[3].top + ROW).toBeLessThanOrEqual(4 * ROW + 1e-9);
  });

  it("refuses the band that cannot hold four rows — the rim names stay instead", () => {
    expect(layoutTierLegendRows(ANCHORS, 0, 4 * ROW - 1, ROW)).toBeNull();
    expect(layoutTierLegendRows([], 0, 600, ROW)).toBeNull();
  });
});

/**
 * **Which placement the four names get** — the predicate the fit and the legend
 * both read, so the reserved column and the drawn legend cannot disagree.
 */
describe("tierLegendPlacement", () => {
  it("keeps the rail where the fit is bound by height and the column goes unused", () => {
    // 1512x982, index panel measured at 324: free box 1116 x 846, silhouette 1.08.
    expect(tierLegendPlacement(1116, 846)).toBe("rail");
  });

  it("sends the names to the corner where the column would be width the graph wanted", () => {
    // 1040x720, same panel: free box 652 x 584 — width binds, so 56 px is 56 px of graph.
    expect(tierLegendPlacement(652, 584)).toBe("corner");
  });

  it("turns over within one column's width of the crossover", () => {
    const height = 584;
    const crossover = height * STRATA_SILHOUETTE_ASPECT + TIER_LEGEND_RAIL_COLUMN_PX;
    expect(tierLegendPlacement(crossover + 1, height)).toBe("rail");
    expect(tierLegendPlacement(crossover - 1, height)).toBe("corner");
  });

  it("answers corner for a box it cannot measure, rather than reserving on a guess", () => {
    expect(tierLegendPlacement(0, 584)).toBe("corner");
    expect(tierLegendPlacement(652, 0)).toBe("corner");
    expect(tierLegendPlacement(Number.NaN, Number.NaN)).toBe("corner");
  });
});
