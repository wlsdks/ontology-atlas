// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { LibraryGraph, LibraryGraphEdge, LibraryGraphNode } from "./build-library-graph";
import { layoutLibraryGraph } from "./library-graph-layout";

/**
 * **The settle has to be finished before the first frame is due.**
 *
 * The force pass runs synchronously on the interaction frame that opens the section, so
 * its cost is not amortised over anything: whatever it takes is time the person spends
 * looking at a section that has appeared but not drawn. A folder of 500 files and pages
 * is the size at which this stops being obviously cheap, so that is where the budget is
 * pinned.
 *
 * 200 ms is the ceiling, not the target — measured on an M-series laptop the same graph
 * lays out in roughly a tenth of that (the run below prints its own number). The margin
 * absorbs a slower machine and a loaded CI runner without turning a real regression into
 * a green run: a change that doubled the iteration count, or dropped Barnes-Hut, would
 * still be caught.
 */

function bigGraph(nodeCount: number): LibraryGraph {
  const nodes: LibraryGraphNode[] = [];
  const edges: LibraryGraphEdge[] = [];
  const pageCount = Math.floor(nodeCount / 4);
  for (let index = 0; index < nodeCount; index += 1) {
    const kind = index < pageCount ? "page" : index < pageCount * 3 ? "source" : "concept";
    nodes.push({ id: `n${index}`, kind, label: `n${index}`, ref: `n${index}`, href: null });
  }
  // Each page cites two files and names one concept — the shape a compiled folder has.
  for (let page = 0; page < pageCount; page += 1) {
    for (const offset of [0, 1]) {
      const target = pageCount + ((page * 2 + offset) % (pageCount * 2));
      edges.push({
        id: `c${page}-${offset}`,
        source: `n${page}`,
        target: `n${target}`,
        relation: "cites",
        certainty: "current",
      });
    }
    const concept = pageCount * 3 + (page % Math.max(1, nodeCount - pageCount * 3));
    edges.push({
      id: `m${page}`,
      source: `n${page}`,
      target: `n${concept}`,
      relation: "mentions",
      certainty: "current",
    });
  }
  return {
    nodes,
    edges,
    counts: {
      sources: pageCount * 2,
      pages: pageCount,
      concepts: nodeCount - pageCount * 3,
      cites: pageCount * 2,
      mentions: pageCount,
    },
  };
}

describe("library graph layout performance", () => {
  it("settles 500 nodes in under 200ms", () => {
    const graph = bigGraph(500);
    // One warm-up so the measurement is of the layout, not of the first JIT pass.
    layoutLibraryGraph(bigGraph(50));
    const started = performance.now();
    const layout = layoutLibraryGraph(graph);
    const elapsed = performance.now() - started;
    console.log(`[library-graph] 500 nodes / ${graph.edges.length} edges settled in ${elapsed.toFixed(1)}ms`);
    expect(layout.settled.size).toBe(500);
    expect(elapsed).toBeLessThan(200);
  });
});
