import { describe, expect, it } from "vitest";

import type { LibraryGraph } from "../../model/build-library-graph";
import { flowLayout } from "../../model/library-flow-layout";
import { FLOW_ROW_MIN_PX } from "../../model/library-flow-measure";
import { fitView } from "../../model/library-graph-view";
import { FIT_PADDING, FLOW_FIT_PADDING, FLOW_FIT_PADDING_Y, flowWorld, zoomedToReadFlowNames } from "./picture-geometry";

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

const CANVASES = [
  { width: 856, height: 527 },
  { width: 1088, height: 628 },
  { width: 1496, height: 827 },
];

describe("flow picture geometry", () => {
  it("shows the picture at exactly the zoom the layout was laid for, inside the flow clearance", () => {
    for (const canvas of CANVASES) {
      for (const pages of [8, 60, 150]) {
        const layout = flowLayout(foldedFolder(pages), flowWorld(canvas, 2));
        const view = fitView({ minX: 0, minY: 0, maxX: layout.extent.width, maxY: layout.extent.height }, canvas, FLOW_FIT_PADDING, 2);
        const label = `${canvas.width}x${canvas.height}, ${pages} pages`;
        expect(view.scale, label).toBe(layout.scale);
        expect(layout.extent.width * view.scale, label).toBeLessThanOrEqual(canvas.width - FIT_PADDING * 2 + 1e-6);
        expect(layout.extent.height * view.scale, label).toBeLessThanOrEqual(canvas.height - FLOW_FIT_PADDING_Y * 2 + 1e-6);
      }
    }
  });

  it("names a column without names at rest once the view is zoomed in to read, a zoom the camera can reach", () => {
    // Fit well under the ceiling: half again past the fit names everything; a nudge does not.
    expect(zoomedToReadFlowNames(0.8, 0.8, 2)).toBe(false);
    expect(zoomedToReadFlowNames(1.0, 0.8, 2)).toBe(false);
    expect(zoomedToReadFlowNames(1.2, 0.8, 2)).toBe(true);
    // Fit near the ceiling: the ceiling itself is enough, since half again is out of reach.
    expect(zoomedToReadFlowNames(1.9, 1.6, 2)).toBe(false);
    expect(zoomedToReadFlowNames(2, 1.6, 2)).toBe(true);
    // Fit at the ceiling: nothing past it to zoom to.
    expect(zoomedToReadFlowNames(2, 2, 2)).toBe(false);
  });

  it("gives a folded folder's rows the height the side clearance does not take", () => {
    const canvas = { width: 1088, height: 628 };
    const layout = flowLayout(foldedFolder(60), flowWorld(canvas, 2));
    // 30 rows at 18px need 522px: inside 628 less 24px twice, not 628 less 64px twice.
    expect(layout.columns.find((column) => column.kind === "page")!.stacks).toBe(2);
    expect(layout.extent.height * layout.scale).toBeGreaterThan(canvas.height - FIT_PADDING * 2);
    expect(layout.rowGap * layout.scale).toBeGreaterThanOrEqual(FLOW_ROW_MIN_PX - 1e-6);
  });
});
