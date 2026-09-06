import { describe, expect, it } from "vitest";

import { layoutTierLegendRows, type TierLegendAnchor } from "./tier-legend-rows";

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
