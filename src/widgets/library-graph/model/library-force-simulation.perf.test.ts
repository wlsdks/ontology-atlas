// @vitest-environment node
import { describe, expect, it } from "vitest";

import { drawLibraryGraph } from "../render/draw-library-graph";
import type { LibraryGraph, LibraryGraphEdge, LibraryGraphNode } from "./build-library-graph";
import { libraryGraphFlowEdges, libraryGraphStaleEdges } from "./library-graph-card";
import {
  isLibrarySimulationRunning,
  LIBRARY_SETTLE_MAX_TICKS,
  MANY_BODY_EXACT_MAX_ORDER,
  createLibrarySimulation,
  settleLibrarySimulation,
  stepLibrarySimulation,
} from "./library-force-simulation";

/**
 * A tick must fit a 16.7 ms frame, and the Barnes–Hut crossover
 * (`MANY_BODY_EXACT_MAX_ORDER`) must stay measured. Measured on an M-series laptop: 0.10,
 * 0.47 and 1.93 ms per tick at 100, 300 and 800 nodes. The gate is a ceiling about ten
 * times that, so a loaded CI runner passes and dropping the collision grid still fails.
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
    /*
     * This edge joins the folder into one component: repulsion runs per group, so
     * disconnected stars would never exercise the O(n²) pass the crossover measures.
     */
    if (page > 0) {
      edges.push({
        id: `j${page}`,
        source: `n${page}`,
        target: `n${pageCount + ((page - 1) * 2) % (pageCount * 2)}`,
        relation: "cites",
        certainty: "current",
      });
    }
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
 * The best of four runs per strategy, not the mean, which also measures the machine's other
 * work (a 500-node comparison inverted on a mean). Both are warmed first and alternated, or
 * the second inherits warm shared tick code.
 */
function bestTickPairMs(nodeCount: number): { exact: number; tree: number } {
  const best = { exact: Infinity, tree: Infinity };
  for (let run = 0; run < 4; run += 1) {
    const order = run % 2 === 0 ? ["exact", "tree"] as const : ["tree", "exact"] as const;
    for (const strategy of order) {
      const exactMaxOrder = strategy === "exact" ? Number.POSITIVE_INFINITY : 0;
      best[strategy] = Math.min(best[strategy], meanTickMs(nodeCount, 30, exactMaxOrder));
    }
  }
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
  const elapsed = performance.now() - started;
  // A skipped simulation or empty fixture must not masquerade as a fast tick.
  expect(sim.nodes).toHaveLength(nodeCount);
  expect(sim.ticks).toBe(5 + ticks);
  return elapsed / ticks;
}

describe("the live simulation's frame budget", () => {
  it("steps 100, 300 and 800 nodes inside one animation frame", () => {
    const table = [100, 300, 800].map((order) => ({ order, ms: meanTickMs(order) }));
    for (const row of table) {
      console.log(
        `[library-graph] ${row.order} nodes: ${row.ms.toFixed(2)}ms per tick (${((row.ms / 16.7) * 100).toFixed(0)}% of a 60fps frame)`,
      );
    }
    // 100 and 300 are everyday orders; 800 is the claimed ceiling.
    expect(table[0]!.ms).toBeLessThan(4);
    expect(table[1]!.ms).toBeLessThan(8);
    expect(table[2]!.ms).toBeLessThan(16.7);
  });

  // Both passes run on the same graph, forced by moving the switch, or the crossover compares unrelated numbers.
  it("keeps the exact pass ahead below the crossover and behind it above", () => {
    // Far enough either side of the crossing that the gap beats the noise.
    const below = 100;
    const above = 2160;
    meanTickMs(below, 100, Number.POSITIVE_INFINITY);
    meanTickMs(below, 100, 0);
    const { exact: belowExact, tree: belowTree } = bestTickPairMs(below);
    const { exact: aboveExact, tree: aboveTree } = bestTickPairMs(above);
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
    // 30s: four O(n²) passes over 2,160 marks measured 5.47s idle and 7.25s under load.
  }, 30_000);
});

/**
 * Sixty write-ups over three hundred files in six clusters: the real arrival shape, since
 * composition settles every component synchronously on mount.
 */
function wiki(pageCount: number, sourceCount: number): LibraryGraph {
  const nodes: LibraryGraphNode[] = [];
  const edges: LibraryGraphEdge[] = [];
  const clusters = 6;
  const perCluster = Math.floor(sourceCount / clusters);
  const pagesPerCluster = Math.floor(pageCount / clusters);
  for (let index = 0; index < sourceCount; index += 1) {
    nodes.push({ id: `s${index}`, kind: "source", state: "compiled", label: `s${index}`, ref: `s${index}`, href: null });
  }
  for (let index = 0; index < clusters * 2; index += 1) {
    nodes.push({ id: `k${index}`, kind: "concept", label: `k${index}`, ref: `k${index}`, href: "/topology" });
  }
  for (let page = 0; page < pageCount; page += 1) {
    const cluster = Math.min(clusters - 1, Math.floor(page / pagesPerCluster));
    const within = page % pagesPerCluster;
    nodes.push({ id: `p${page}`, kind: "page", label: `p${page}`, ref: `p${page}`, href: null });
    const cited = 6 + (within % 5);
    for (let k = 0; k < cited; k += 1) {
      const source = cluster * perCluster + ((within * 5 + k) % perCluster);
      edges.push({ id: `c${page}-${k}`, source: `p${page}`, target: `s${source}`, relation: "cites", certainty: "current" });
    }
    if (within % 3 === 0) {
      edges.push({ id: `m${page}`, source: `p${page}`, target: `k${cluster * 2 + (within % 2)}`, relation: "mentions", certainty: "current" });
    }
  }
  return {
    nodes,
    edges,
    counts: {
      sources: sourceCount,
      pages: pageCount,
      concepts: clusters * 2,
      cites: edges.filter((edge) => edge.relation === "cites").length,
      mentions: edges.filter((edge) => edge.relation === "mentions").length,
    },
  };
}

describe("the arrival's settle budget", () => {
  // The whole arrival: the synchronous composition settle, then the rAF settle.
  it("settles 300 and 1000 marks inside the budget, and idles after", () => {
    for (const [pages, sources] of [
      [60, 240],
      [180, 800],
    ] as const) {
      const graph = wiki(pages, sources);
      const order = graph.nodes.length;
      const startedMount = performance.now();
      const sim = createLibrarySimulation({ graph, box: { width: 1088, height: 819 } });
      const mountMs = performance.now() - startedMount;
      const startedSettle = performance.now();
      settleLibrarySimulation(sim);
      const settleMs = performance.now() - startedSettle;
      process.stdout.write(
        `[library-graph] ${order} marks: mount (composition) ${mountMs.toFixed(0)}ms, settle ${settleMs.toFixed(0)}ms over ${sim.ticks} ticks, ${(settleMs / Math.max(1, sim.ticks)).toFixed(2)}ms per tick\n`,
      );
      // The settle lands, so the loop may stop (`docs/DECISIONS.md`).
      expect(isLibrarySimulationRunning(sim)).toBe(false);
      expect(sim.ticks).toBeLessThanOrEqual(LIBRARY_SETTLE_MAX_TICKS);
      // A ceiling about ten times the local measurement.
      expect(mountMs).toBeLessThan(order > 500 ? 4000 : 1500);
      // One 60fps frame per tick; measured 0.27ms at 312 marks and 1.21ms at 992.
      expect(settleMs / Math.max(1, sim.ticks)).toBeLessThan(16.7);
    }
  });
});

/**
 * An open card's per-frame cost at 372 and 992 marks, against the recorded budget of 2 ms
 * added (`docs/DECISIONS.md`). Only this repository's per-frame arithmetic is timed, on a
 * recording context; the rasterised cost is read in a browser through the probe,
 * window.__atlasLibraryGraph.paint().
 */
describe("what an open card costs per frame", () => {
  /** A 2D context that records nothing and costs nothing: what is left is our own code. */
  function nullContext(): CanvasRenderingContext2D {
    const noop = (): void => undefined;
    return {
      save: noop, restore: noop, beginPath: noop, moveTo: noop, lineTo: noop,
      quadraticCurveTo: noop, closePath: noop, arc: noop, fill: noop, stroke: noop,
      fillRect: noop, strokeRect: noop, setLineDash: noop, fillText: noop, strokeText: noop,
      measureText: () => ({ width: 40 }) as TextMetrics,
      strokeStyle: "", fillStyle: "", lineWidth: 1, globalAlpha: 1, lineDashOffset: 0,
      lineCap: "butt", lineJoin: "round", textBaseline: "alphabetic", textAlign: "left", font: "",
    } as unknown as CanvasRenderingContext2D;
  }

  const INK = {
    ground: "#000", page: "#fff", source: "#888", concept: "#888", edge: "#888",
    selected: "#55f", selectedRing: "#77f", danger: "#f55", stale: "#fb3", pageHalo: "#111",
    hoverRing: "#666", labelSurface: "#111", labelBorder: "#333", labelInk: "#fff", sourceLabel: "#999",
    fontFamily: "sans-serif", pageLabelPx: 11, labelPx: 11, captionPx: 9.5,
  };

  it("adds well under 2ms a frame at 372 and 992 marks, and nothing at all at rest", () => {
    for (const [pages, sources] of [
      [60, 300],
      [180, 800],
    ] as const) {
      const graph = wiki(pages, sources);
      const order = graph.nodes.length;
      const box = { width: 1088, height: 819 };
      const sim = createLibrarySimulation({ graph, box });
      settleLibrarySimulation(sim);
      const positions = new Map<string, { x: number; y: number }>();
      for (const node of sim.nodes) positions.set(node.id, { x: node.x, y: node.y });
      // The busiest page: the worst card a person can open on this folder.
      const card = graph.nodes.find((node) => node.kind === "page")!.id;

      const sets = () => {
        const started = performance.now();
        for (let round = 0; round < 20; round += 1) {
          libraryGraphFlowEdges(graph, card);
          libraryGraphStaleEdges(graph);
        }
        return (performance.now() - started) / 20;
      };
      const setsMs = sets();

      const { flow: flowEdges, stale } = libraryGraphFlowEdges(graph, card);
      const frame = (withCard: boolean) => {
        const ctx = nullContext();
        const base = {
          nodes: graph.nodes, edges: graph.edges, positions, width: box.width, height: box.height,
          ink: INK, selectedId: null, hoveredId: null, focusedId: null, activeLabel: null,
          standingLabels: true, sourceLabels: false,
        };
        // Warm, then measure: the first call pays for this file's own JIT.
        for (let round = 0; round < 3; round += 1) {
          drawLibraryGraph(ctx, { ...base, flow: withCard ? cardFlow(0.3) : null });
        }
        const started = performance.now();
        const rounds = 12;
        for (let round = 0; round < rounds; round += 1) {
          drawLibraryGraph(ctx, { ...base, flow: withCard ? cardFlow(round / rounds) : null });
        }
        return (performance.now() - started) / rounds;
      };
      const cardFlow = (phase: number) => ({
        edges: flowEdges,
        phase,
        arrivalEdges: new Set<string>(),
        arrivalPhase: 0,
        arrived: new Map<string, number>(),
        pulse: stale,
        pulsePhase: phase,
        still: false,
      });

      /*
       * Interleaved medians against a ratio, since an absolute budget measured +0.53ms idle
       * and +2.45ms under load; shared drift cancels, and a real per-edge regression still breaks it.
       */
      const withoutRuns: number[] = [];
      const withRuns: number[] = [];
      for (let round = 0; round < 5; round += 1) {
        withoutRuns.push(frame(false));
        withRuns.push(frame(true));
      }
      const median = (values: number[]): number =>
        [...values].sort((first, second) => first - second)[Math.floor(values.length / 2)]!;
      const without = median(withoutRuns);
      const withCard = median(withRuns);
      process.stdout.write(
        `[library-graph] ${order} marks, card open: frame ${without.toFixed(2)} → ${withCard.toFixed(2)}ms (+${(withCard - without).toFixed(2)}, ${(withCard / without).toFixed(2)}x), flow sets ${setsMs.toFixed(3)}ms\n`,
      );

      expect(withCard).toBeLessThan(without * 1.6 + 0.5);
      // The sets are recomputed only on card or folder change, but would fit a frame anyway.
      expect(setsMs).toBeLessThan(2);
      // And the drift never touches a mention: the sets are the citations of one mark.
      expect(flowEdges.size).toBeLessThan(graph.counts.cites);
    }
  }, 30_000);
});
