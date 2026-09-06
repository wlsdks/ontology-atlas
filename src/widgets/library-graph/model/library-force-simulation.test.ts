// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { LibraryGraph, LibraryGraphEdge, LibraryGraphNode } from "./build-library-graph";
import {
  AMBIENT_AMPLITUDE,
  AMBIENT_PERIOD_MS,
  createLibrarySimulation,
  hasPinnedNode,
  isLibrarySimulationRunning,
  ambientDriftOffset,
  applyAmbientDrift,
  libraryPositions,
  libraryMarkRadii,
  librarySimulationBounds,
  pinLibraryNode,
  reheatLibrarySimulation,
  releaseLibraryNode,
  settleLibrarySimulation,
  stepLibrarySimulation,
  syncLibrarySimulation,
} from "./library-force-simulation";

/**
 * **The claims the live simulation makes, made falsifiable.**
 *
 * A force layout is easy to write and hard to trust: it always produces *a* picture, and
 * a picture is not evidence that the physics did anything. So every property the owner's
 * verdict turned on has a case here — the picture settles, the picture **clusters** (the
 * defect on 2026-09-07 was a hairball, which is a layout that ran and said nothing), a
 * held node stays held, and the same folder draws the same picture twice.
 */

/**
 * The owner's own folder, in its measured shape: **7 sources, 6 pages, every page citing
 * 4–7 of them and naming 2–3 concepts.** This is the density that produced the hairball,
 * so it is the fixture every claim below is made against rather than a sparse graph on
 * which any layout looks fine.
 */
function denseFolder(): LibraryGraph {
  const nodes: LibraryGraphNode[] = [];
  const edges: LibraryGraphEdge[] = [];
  const sources = Array.from({ length: 7 }, (_, index) => `sources/file-${index}.pdf`);
  const concepts = ["domains/checkout", "domains/loyalty", "capabilities/billing", "capabilities/search"];
  for (const path of sources) {
    nodes.push({ id: `source:${path}`, kind: "source", state: "compiled", label: path, ref: path, href: null });
  }
  for (const slug of concepts) {
    nodes.push({ id: `concept:${slug}`, kind: "concept", label: slug, ref: slug, href: "/topology" });
  }
  /** Which sources each page cites — overlapping runs, which is what makes it a hairball. */
  const citations = [
    [0, 1, 2, 3],
    [1, 2, 3, 4, 5],
    [2, 3, 4, 5, 6, 0],
    [0, 4, 5, 6],
    [1, 3, 5, 6, 0, 2, 4],
    [2, 5, 6, 1, 0],
  ];
  citations.forEach((cited, page) => {
    const slug = `wiki/page-${page}`;
    nodes.push({ id: `page:${slug}`, kind: "page", label: slug, ref: slug, href: null });
    for (const index of cited) {
      edges.push({
        id: `cites:${slug}→${sources[index]}`,
        source: `page:${slug}`,
        target: `source:${sources[index]}`,
        relation: "cites",
        certainty: "current",
      });
    }
    for (let offset = 0; offset < 2 + (page % 2); offset += 1) {
      const slugOut = concepts[(page + offset) % concepts.length]!;
      edges.push({
        id: `mentions:${slug}→${slugOut}`,
        source: `page:${slug}`,
        target: `concept:${slugOut}`,
        relation: "mentions",
        certainty: "current",
      });
    }
  });
  return {
    nodes,
    edges,
    counts: {
      sources: sources.length,
      pages: citations.length,
      concepts: concepts.length,
      cites: edges.filter((edge) => edge.relation === "cites").length,
      mentions: edges.filter((edge) => edge.relation === "mentions").length,
    },
  };
}

const BOX = { width: 1046, height: 620 };

function totalSpeed(nodes: readonly { vx: number; vy: number }[]): number {
  return nodes.reduce((sum, node) => sum + Math.hypot(node.vx, node.vy), 0);
}

describe("the library graph's force simulation", () => {
  it("loses energy: the picture arrives and then stops", () => {
    const sim = createLibrarySimulation({ graph: denseFolder(), box: BOX });
    for (let tick = 0; tick < 5; tick += 1) stepLibrarySimulation(sim);
    const early = totalSpeed(sim.nodes);
    for (let tick = 0; tick < 120; tick += 1) stepLibrarySimulation(sim);
    const middle = totalSpeed(sim.nodes);
    for (let tick = 0; tick < 200; tick += 1) stepLibrarySimulation(sim);
    const late = totalSpeed(sim.nodes);

    expect(middle).toBeLessThan(early);
    expect(late).toBeLessThan(middle * 0.2);
    expect(isLibrarySimulationRunning(sim)).toBe(false);
  });

  /**
   * **The hairball test, on the folder that produced the hairball.**
   *
   * ⚠️ Note what is *not* claimed. Six pages citing 4–7 of the same seven sources is
   * nearly a complete bipartite graph, and a complete bipartite graph **has no
   * clusters** — no layout can separate groups that share every member, and one that
   * appeared to would be lying about the folder. What the springs can and must do here
   * is make the citation itself measurable: across the folder, a page's own sources sit
   * closer to it than the ones it never cited. Per page the margin is not guaranteed
   * (one page in this fixture cites six of seven, so its single control is a coin toss),
   * which is exactly why the assertion is over the whole folder and why the readability
   * of a graph this dense is bought by hover and drag rather than by position alone.
   *
   * Measured on this fixture: cited 104.7 world units, uncited 155.1, over 31 and 11
   * pairs.
   */
  it("holds each page's cited sources closer to it than the ones it never cited", () => {
    const graph = denseFolder();
    const sim = settleLibrarySimulation(createLibrarySimulation({ graph, box: BOX }));
    const at = (id: string) => sim.nodes[sim.index.get(id)!]!;
    const sources = graph.nodes.filter((node) => node.kind === "source");

    let cited = 0;
    let citedCount = 0;
    let uncited = 0;
    let uncitedCount = 0;
    for (const page of graph.nodes.filter((node) => node.kind === "page")) {
      const links = new Set(
        graph.edges
          .filter((edge) => edge.source === page.id && edge.relation === "cites")
          .map((edge) => edge.target),
      );
      for (const source of sources) {
        const distance = Math.hypot(at(source.id).x - at(page.id).x, at(source.id).y - at(page.id).y);
        if (links.has(source.id)) {
          cited += distance;
          citedCount += 1;
        } else {
          uncited += distance;
          uncitedCount += 1;
        }
      }
    }
    expect(citedCount).toBeGreaterThan(0);
    expect(uncitedCount).toBeGreaterThan(0);
    // A margin, not a hair: 0.85 is well inside the measured 0.67 and would still fail a
    // build whose springs had stopped pulling.
    expect(cited / citedCount).toBeLessThan((uncited / uncitedCount) * 0.85);
  });

  /**
   * And where the folder **does** separate, the picture separates: two groups of pages
   * over two groups of sources with nothing shared must settle into two clusters, every
   * page nearer to every one of its own sources than to any of the other group's.
   */
  it("pulls a folder that really has two groups into two clusters", () => {
    const nodes: LibraryGraphNode[] = [];
    const edges: LibraryGraphEdge[] = [];
    for (const group of [0, 1]) {
      for (let index = 0; index < 4; index += 1) {
        const path = `sources/g${group}-${index}.pdf`;
        nodes.push({ id: `source:${path}`, kind: "source", label: path, ref: path, href: null });
      }
      for (let page = 0; page < 2; page += 1) {
        const slug = `wiki/g${group}-page-${page}`;
        nodes.push({ id: `page:${slug}`, kind: "page", label: slug, ref: slug, href: null });
        for (let index = 0; index < 4; index += 1) {
          edges.push({
            id: `cites:${slug}→g${group}-${index}`,
            source: `page:${slug}`,
            target: `source:sources/g${group}-${index}.pdf`,
            relation: "cites",
            certainty: "current",
          });
        }
      }
    }
    const graph: LibraryGraph = {
      nodes,
      edges,
      counts: { sources: 8, pages: 4, concepts: 0, cites: edges.length, mentions: 0 },
    };
    const sim = settleLibrarySimulation(createLibrarySimulation({ graph, box: BOX }));
    const at = (id: string) => sim.nodes[sim.index.get(id)!]!;
    for (const group of [0, 1]) {
      const other = group === 0 ? 1 : 0;
      for (let page = 0; page < 2; page += 1) {
        const from = at(`page:wiki/g${group}-page-${page}`);
        const near = Math.max(
          ...Array.from({ length: 4 }, (_, index) => {
            const point = at(`source:sources/g${group}-${index}.pdf`);
            return Math.hypot(point.x - from.x, point.y - from.y);
          }),
        );
        const far = Math.min(
          ...Array.from({ length: 4 }, (_, index) => {
            const point = at(`source:sources/g${other}-${index}.pdf`);
            return Math.hypot(point.x - from.x, point.y - from.y);
          }),
        );
        expect(near).toBeLessThan(far);
      }
    }
  });

  /**
   * A mention rests further out than a citation, which is what puts the concepts on the
   * outside of a page's cluster rather than inside its sources.
   */
  it("holds a mentioned concept further out than a cited source", () => {
    const graph = denseFolder();
    const sim = settleLibrarySimulation(createLibrarySimulation({ graph, box: BOX }));
    const at = (id: string) => sim.nodes[sim.index.get(id)!]!;
    const page = "page:wiki/page-0";
    const distance = (id: string) => Math.hypot(at(id).x - at(page).x, at(id).y - at(page).y);
    const meanOf = (relation: "cites" | "mentions") => {
      const ids = graph.edges
        .filter((edge) => edge.source === page && edge.relation === relation)
        .map((edge) => edge.target);
      return ids.reduce((sum, id) => sum + distance(id), 0) / ids.length;
    };
    expect(meanOf("cites")).toBeLessThan(meanOf("mentions"));
  });

  it("draws the same folder the same way twice — no clock, no randomness", () => {
    const first = createLibrarySimulation({ graph: denseFolder(), box: BOX });
    const second = createLibrarySimulation({ graph: denseFolder(), box: BOX });
    for (let tick = 0; tick < 90; tick += 1) {
      stepLibrarySimulation(first);
      stepLibrarySimulation(second);
    }
    for (let index = 0; index < first.nodes.length; index += 1) {
      expect(second.nodes[index]!.x).toBe(first.nodes[index]!.x);
      expect(second.nodes[index]!.y).toBe(first.nodes[index]!.y);
    }
  });

  it("keeps a held node exactly where the pointer put it while its neighbours move", () => {
    const graph = denseFolder();
    const sim = settleLibrarySimulation(createLibrarySimulation({ graph, box: BOX }));
    const held = "source:sources/file-2.pdf";
    const neighbour = "page:wiki/page-0";
    const before = { ...sim.nodes[sim.index.get(neighbour)!]! };

    reheatLibrarySimulation(sim);
    pinLibraryNode(sim, held, { x: 260, y: -180 });
    for (let tick = 0; tick < 40; tick += 1) {
      stepLibrarySimulation(sim);
      pinLibraryNode(sim, held, { x: 260, y: -180 });
    }
    const pinned = sim.nodes[sim.index.get(held)!]!;
    expect(pinned.x).toBe(260);
    expect(pinned.y).toBe(-180);
    expect(hasPinnedNode(sim)).toBe(true);

    // The picture around it reacted: a page that cites the held file moved toward it.
    const after = sim.nodes[sim.index.get(neighbour)!]!;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(4);

    // A held node keeps the simulation alive even at rest, so releasing it is what ends
    // the loop rather than a timer.
    expect(isLibrarySimulationRunning(sim)).toBe(true);
    releaseLibraryNode(sim, held, { x: 40, y: 0 });
    // The flick is capped: an unbounded release would throw the mark off the canvas.
    expect(sim.nodes[sim.index.get(held)!]!.vx).toBeLessThanOrEqual(14);
    expect(sim.nodes[sim.index.get(held)!]!.vx).toBeGreaterThan(0);
  });

  /**
   * **Reduced motion settles in one call, not in one frame of a loop.** The preference
   * loses the motion and nothing else: the same settled positions are computed and drawn
   * once, which is the behaviour the one-shot layout had before this file existed.
   */
  it("settles to rest in a single synchronous call for reduced motion", () => {
    const sim = settleLibrarySimulation(createLibrarySimulation({ graph: denseFolder(), box: BOX }));
    expect(isLibrarySimulationRunning(sim)).toBe(false);
    expect(sim.nodes.every((node) => node.entered === 1)).toBe(true);
    expect(librarySimulationBounds(sim)).not.toBeNull();
  });

  /**
   * The ambient drift is an owner directive against the motion charter's own preference,
   * so its bound is a number this gate owns rather than a claim in a comment.
   */
  it("keeps the ambient drift inside its declared bound, in screen pixels at any zoom", () => {
    const sim = settleLibrarySimulation(createLibrarySimulation({ graph: denseFolder(), box: BOX }));
    let peak = 0;
    for (let ms = 0; ms <= AMBIENT_PERIOD_MS * 2; ms += 60) {
      for (const node of sim.nodes) {
        const offset = ambientDriftOffset(node.phase, ms);
        peak = Math.max(peak, Math.hypot(offset.x, offset.y));
      }
    }
    expect(peak).toBeLessThanOrEqual(AMBIENT_AMPLITUDE * Math.SQRT2 + 1e-9);
    // The stated bound is on what a person could see travel — the radial figure — not on
    // the per-axis constant. 0.28 per axis is 0.396 radial, which is what 0.4 is about.
    expect(AMBIENT_AMPLITUDE * Math.SQRT2).toBeLessThanOrEqual(0.4);
    expect(AMBIENT_PERIOD_MS).toBeGreaterThanOrEqual(6000);

    /*
     * ⚠️ **The offset takes no scale, and that is the bound.** Applied to the simulated
     * position it was multiplied by the zoom — measured 2.7px of travel at 8× during the
     * 2026-09-07 recording — so it is applied to the already-transformed screen map, where
     * a third of a pixel is a third of a pixel however close a person has zoomed.
     */
    const screen = new Map(sim.nodes.map((node) => [node.id, { x: node.x * 8, y: node.y * 8 }]));
    const before = new Map([...screen].map(([id, point]) => [id, { ...point }]));
    applyAmbientDrift(sim, screen, 2400);
    for (const node of sim.nodes) {
      const from = before.get(node.id)!;
      const to = screen.get(node.id)!;
      expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeLessThanOrEqual(AMBIENT_AMPLITUDE * Math.SQRT2 + 1e-9);
    }

    // A held mark is exactly where the hand put it, drift or no drift.
    pinLibraryNode(sim, sim.nodes[0]!.id, { x: 10, y: 20 });
    const held = new Map([[sim.nodes[0]!.id, { x: 100, y: 200 }]]);
    applyAmbientDrift(sim, held, 3000);
    expect(held.get(sim.nodes[0]!.id)).toEqual({ x: 100, y: 200 });
    releaseLibraryNode(sim, sim.nodes[0]!.id);

    // And `libraryPositions` is the simulation's own answer, with nothing added.
    const plain = libraryPositions(sim);
    for (const node of sim.nodes) expect(plain.get(node.id)).toEqual({ x: node.x, y: node.y });
  });

  /**
   * A page Compile has just written appears **on the sources it was written from**, then
   * is pushed out to its own place. Seeding it on the ring instead would fly it across
   * the canvas past everything else, which reads as a different folder rather than as one
   * new page.
   */
  it("enters a new node at a neighbour it is already attached to, and re-heats", () => {
    const graph = denseFolder();
    const sim = settleLibrarySimulation(createLibrarySimulation({ graph, box: BOX }));
    const anchor = sim.nodes[sim.index.get("source:sources/file-0.pdf")!]!;
    const anchorAt = { x: anchor.x, y: anchor.y };

    const grown: LibraryGraph = {
      ...graph,
      nodes: [
        ...graph.nodes,
        { id: "page:wiki/fresh", kind: "page", label: "Fresh", ref: "wiki/fresh", href: null },
      ],
      edges: [
        ...graph.edges,
        {
          id: "cites:wiki/fresh→sources/file-0.pdf",
          source: "page:wiki/fresh",
          target: "source:sources/file-0.pdf",
          relation: "cites",
          certainty: "current",
        },
      ],
    };
    const changed = syncLibrarySimulation(sim, grown);
    expect(changed.entered).toEqual(["page:wiki/fresh"]);
    expect(changed.removed).toEqual([]);
    const fresh = sim.nodes[sim.index.get("page:wiki/fresh")!]!;
    expect(fresh.x).toBe(anchorAt.x);
    expect(fresh.y).toBe(anchorAt.y);
    expect(fresh.entered).toBe(0);
    expect(isLibrarySimulationRunning(sim)).toBe(true);

    // And a removal hands back where the mark was, so the caller can fade it out from
    // there rather than deleting it under the pointer.
    const shrunk = syncLibrarySimulation(sim, graph);
    expect(shrunk.removed.map((node) => node.id)).toEqual(["page:wiki/fresh"]);
    expect(shrunk.removed[0]!.x).toBeCloseTo(fresh.x, 5);
  });

  it("grades the mark by degree inside the 5–10px band, keeping the source a step smaller", () => {
    const graph = denseFolder();
    const radii = libraryMarkRadii(graph);
    for (const node of graph.nodes) {
      const radius = radii.get(node.id)!;
      expect(radius).toBeGreaterThanOrEqual(5 * (5 / 6) - 1e-9);
      expect(radius).toBeLessThanOrEqual(10 + 1e-9);
    }
    // The busiest page is drawn larger than the quietest one: that is the whole of what
    // the band encodes.
    const pageRadius = (slug: string) => radii.get(`page:${slug}`)!;
    expect(pageRadius("wiki/page-4")).toBeGreaterThan(pageRadius("wiki/page-3"));
  });
});
