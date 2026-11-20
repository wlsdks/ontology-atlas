import { describe, expect, it } from "vitest";

import type { LibraryGraph } from "../../model/build-library-graph";
import { FLOW_ROW_MIN_PX, flowLayout } from "../../model/library-flow-layout";
import { FIT_PADDING, FLOW_FIT_PADDING_Y, flowFitView, flowWorld } from "./picture-geometry";

function foldedFolder(pages: number): LibraryGraph {
  const nodes = [
    ...Array.from({ length: pages }, (_, i) => ({ id: `source:s${i}.md`, kind: "source" as const, label: `s${i}.md`, ref: `s${i}.md`, href: null })),
    ...Array.from({ length: pages }, (_, i) => ({ id: `page:p${i}`, kind: "page" as const, label: `p${i}`, ref: `p${i}`, href: null })),
    ...Array.from({ length: 12 }, (_, i) => ({ id: `concept:c${i}`, kind: "concept" as const, label: `c${i}`, ref: `c${i}`, href: null })),
  ];
  const edges = Array.from({ length: pages }, (_, i) => [
    { id: `c${i}`, source: `page:p${i}`, target: `source:s${i}.md`, relation: "cites" as const },
    { id: `m${i}`, source: `page:p${i}`, target: `concept:c${(i * 5) % 12}`, relation: "mentions" as const },
  ]).flat();
  return { nodes, edges } as LibraryGraph;
}

describe("flow picture geometry", () => {
  it("frames a laid flow box with the flow clearance above and below and the full clearance at the sides", () => {
    for (const box of [{ width: 856, height: 527 }, { width: 1088, height: 628 }, { width: 1496, height: 827 }]) {
      for (const pages of [8, 60, 150]) {
        const world = flowWorld(box, 2);
        const layout = flowLayout(foldedFolder(pages), world);
        const view = flowFitView({ minX: 0, minY: 0, maxX: layout.extent.width, maxY: layout.extent.height }, box, 2);
        const shownWidth = layout.extent.width * view.scale;
        const shownHeight = layout.extent.height * view.scale;
        const label = `${box.width}x${box.height}, ${pages} pages`;
        expect(shownWidth, label).toBeLessThanOrEqual(box.width - FIT_PADDING * 2 + 1e-6);
        expect(shownHeight, label).toBeLessThanOrEqual(box.height - FLOW_FIT_PADDING_Y * 2 + 1e-6);
        // The camera shows the picture at the scale the layout chose its stacks for, so a
        // row the layout counted as keeping the floor keeps it on screen.
        expect(view.scale, label).toBeCloseTo(Math.min(2, layout.scale * world.cameraGain!), 6);
        if (layout.columns.some((column) => column.kind === "page" && column.grid > 1)) {
          expect(layout.rowGap * view.scale, label).toBeGreaterThanOrEqual(FLOW_ROW_MIN_PX - 1e-6);
        }
      }
    }
  });

  it("gives a folded folder's rows the height the side clearance does not take", () => {
    const box = { width: 1088, height: 628 };
    const layout = flowLayout(foldedFolder(60), flowWorld(box, 2));
    const view = flowFitView({ minX: 0, minY: 0, maxX: layout.extent.width, maxY: layout.extent.height }, box, 2);
    // 30 rows at 18px need 522px: inside 628 less 24px twice, not 628 less 64px twice.
    expect(layout.columns.find((column) => column.kind === "page")!.grid).toBe(2);
    expect(layout.extent.height * view.scale).toBeGreaterThan(box.height - FIT_PADDING * 2);
  });
});
