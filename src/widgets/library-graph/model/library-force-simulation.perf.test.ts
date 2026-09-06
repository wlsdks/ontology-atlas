// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { LibraryGraph, LibraryGraphEdge, LibraryGraphNode } from "./build-library-graph";
import {
  MANY_BODY_EXACT_MAX_ORDER,
  createLibrarySimulation,
  stepLibrarySimulation,
} from "./library-force-simulation";

/**
 * **A tick has to fit in a frame, and the Barnes–Hut crossover has to be a measurement.**
 *
 * The simulation now runs on `requestAnimationFrame` while a person is looking at it, so
 * its cost is not amortised over anything: whatever one tick takes is time subtracted
 * from a 16.7 ms budget that also has to paint. This file measures it at three orders and
 * prints the table, and it measures the exact and approximated many-body passes against
 * each other so `MANY_BODY_EXACT_MAX_ORDER` stays a number somebody measured rather than
 * a number somebody liked.
 *
 * ## Measured, M-series laptop, 2026-09-07 (mean of 40 ticks)
 *
 * | Nodes | Edges | Tick | Of a 16.7 ms frame |
 * |---|---|---|---|
 * | 100 | 75 | 0.10 ms | 0.6% |
 * | 300 | 225 | 0.40 ms | 2.4% |
 * | 800 | 600 | 1.73 ms | 10% |
 *
 * The gate is a **ceiling**, not the measurement: a wall-clock assertion tuned to this
 * laptop either fails honest code on a loaded CI runner or is loosened until it catches
 * nothing (the same lesson the layout's own perf test recorded on 2026-09-06 — 95 ms
 * locally, 279 ms on CI for one identical pass). 16.7 ms at 800 nodes is roughly ten
 * times the local measurement, which still fails a change that dropped the collision grid
 * — restoring the exact pass there cost 11 of a 13.7 ms tick at 1,500 nodes.
 */

function folder(nodeCount: number): LibraryGraph {
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

/**
 * The **best** of three runs, not the mean of them.
 *
 * A mean measures the machine's other work as much as this code's; the fastest run is the
 * one where the process got a clean slice, and it is the only figure two implementations
 * can be compared on when both are timed inside one loaded test process. Measured
 * 2026-09-07: the same 500-node comparison inverted on a mean and never on a best-of-three.
 */
function bestTickMs(nodeCount: number, exactMaxOrder?: number): number {
  let best = Infinity;
  for (let run = 0; run < 3; run += 1) best = Math.min(best, meanTickMs(nodeCount, 30, exactMaxOrder));
  return best;
}

function meanTickMs(nodeCount: number, ticks = 40, exactMaxOrder?: number): number {
  const sim = createLibrarySimulation({
    graph: folder(nodeCount),
    box: { width: 1046, height: 620 },
    exactMaxOrder,
  });
  // One warm pass so the measurement is of the loop, not of the JIT's first look at it.
  for (let tick = 0; tick < 5; tick += 1) stepLibrarySimulation(sim);
  const started = performance.now();
  for (let tick = 0; tick < ticks; tick += 1) stepLibrarySimulation(sim);
  return (performance.now() - started) / ticks;
}

describe("the live simulation's frame budget", () => {
  it("steps 100, 300 and 800 nodes inside one animation frame", () => {
    const table = [100, 300, 800].map((order) => ({ order, ms: meanTickMs(order) }));
    for (const row of table) {
      console.log(
        `[library-graph] ${row.order} nodes: ${row.ms.toFixed(2)}ms per tick (${((row.ms / 16.7) * 100).toFixed(0)}% of a 60fps frame)`,
      );
    }
    // 100 and 300 are the everyday orders and have to be nearly free; 800 is the ceiling
    // the widget is claimed to hold.
    expect(table[0]!.ms).toBeLessThan(4);
    expect(table[1]!.ms).toBeLessThan(8);
    expect(table[2]!.ms).toBeLessThan(16.7);
  });

  /**
   * **The crossover is a fact about this machine's arithmetic, not a preference.**
   *
   * Both passes are measured on the **same graph** — the exact one forced by lifting the
   * switch out of reach, the approximated one by dropping it to zero. A crossover
   * asserted against two different graphs is not a crossover, it is two unrelated
   * numbers.
   */
  it("keeps the exact pass ahead below the crossover and behind it above", () => {
    // Far enough either side of the crossing that the gap is bigger than the noise: at
    // 200 the exact pass wins by about 60%, at 2160 the tree wins by about the same.
    const below = 200;
    const above = 2160;
    const belowExact = bestTickMs(below, Number.POSITIVE_INFINITY);
    const belowTree = bestTickMs(below, 0);
    const aboveExact = bestTickMs(above, Number.POSITIVE_INFINITY);
    const aboveTree = bestTickMs(above, 0);
    console.log(
      `[library-graph] ${below} nodes: exact ${belowExact.toFixed(2)}ms vs tree ${belowTree.toFixed(2)}ms`,
    );
    console.log(
      `[library-graph] ${above} nodes: exact ${aboveExact.toFixed(2)}ms vs tree ${aboveTree.toFixed(2)}ms`,
    );
    expect(belowExact).toBeLessThan(belowTree);
    expect(aboveTree).toBeLessThan(aboveExact);
    expect(MANY_BODY_EXACT_MAX_ORDER).toBeGreaterThan(below);
    expect(MANY_BODY_EXACT_MAX_ORDER).toBeLessThan(above);
  });
});
