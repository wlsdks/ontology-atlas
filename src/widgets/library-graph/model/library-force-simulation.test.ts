// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { LibraryGraph, LibraryGraphEdge, LibraryGraphNode } from "./build-library-graph";
import {
  createLibrarySimulation,
  hasPinnedNode,
  isLibrarySimulationRunning,
  libraryPositions,
  libraryMarkRadii,
  libraryOrphanRing,
  LIBRARY_CONCEPT_RADIUS,
  LIBRARY_FIT_PADDING,
  LIBRARY_PAGE_RADIUS_MAX,
  LIBRARY_PAGE_RADIUS_MIN,
  LIBRARY_SOURCE_RADIUS,
  librarySimulationBounds,
  pinLibraryNode,
  reheatLibrarySimulation,
  releaseLibraryNode,
  settleLibrarySimulation,
  stepLibrarySimulation,
  syncLibrarySimulation,
} from "./library-force-simulation";
import { fitView, worldToScreen } from "./library-graph-view";

/**
 * The live simulation's claims, made falsifiable, since a force layout always produces some
 * picture: it settles, clusters, holds a held node, and is deterministic.
 */

/**
 * A dense real folder shape: 7 sources, 6 pages each citing 4–7 of them and naming 2–3
 * concepts, where a sparse fixture would flatter any layout.
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

/**
 * Seven sources, three cited by nobody, and four pages, one citing nothing: four marks with
 * no relation at all.
 */
function looseFolder(): LibraryGraph {
  const cited = ["sources/quarter-plan.pdf", "sources/budget.xlsx", "sources/release-dates.csv", "sources/roadmap.md"];
  const loose = ["sources/design-system.docx", "sources/kickoff-notes.html", "sources/interview-notes.txt"];
  const nodes: LibraryGraphNode[] = [];
  const edges: LibraryGraphEdge[] = [];
  for (const path of [...cited, ...loose]) {
    nodes.push({ id: `source:${path}`, kind: "source", label: path, ref: path, href: null });
  }
  const pages: Array<[string, string[]]> = [
    ["wiki/quarter-plan", [cited[0]!]],
    ["wiki/release-dates", [cited[2]!, cited[3]!]],
    ["wiki/budget", [cited[1]!, cited[0]!]],
    // The one a person wrote by hand, citing nothing.
    ["wiki/handover", []],
  ];
  for (const [slug, sources] of pages) {
    nodes.push({ id: `page:${slug}`, kind: "page", label: slug, ref: slug, href: null });
    for (const path of sources) {
      edges.push({
        id: `cites:${slug}→${path}`,
        source: `page:${slug}`,
        target: `source:${path}`,
        relation: "cites",
        certainty: "current",
      });
    }
  }
  return { nodes, edges, counts: { sources: 7, pages: 4, concepts: 0, cites: edges.length, mentions: 0 } };
}

/** Every mark with no relation at all — the ones the ring exists for. */
const LOOSE_IDS = [
  "source:sources/design-system.docx",
  "source:sources/interview-notes.txt",
  "source:sources/kickoff-notes.html",
  "page:wiki/handover",
];

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
   * A near-complete bipartite graph has no clusters to find, so the claim is folder-wide:
   * a page's own sources sit closer than ones it never cited (per page it is a coin toss).
   * Measured on this fixture: cited 104.7 world units, uncited 155.1, over 31 and 11 pairs.
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
    // 0.85 leaves margin over the measured 0.67 and still fails if the springs stop pulling.
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

    /*
     * Packed groups sit in adjacent cells (`library-graph-packing.ts`), so the claim is that
     * groups are separate places: boxes disjoint, every mark nearer its own group's centre.
     * The trade and its dissent: `docs/DECISIONS.md`, "Each group of the folder gets a place".
     */
    const boxOf = (group: number) => {
      const points = [0, 1, 2, 3]
        .map((index) => at(`source:sources/g${group}-${index}.pdf`))
        .concat([0, 1].map((page) => at(`page:wiki/g${group}-page-${page}`)));
      return {
        minX: Math.min(...points.map((point) => point.x)),
        maxX: Math.max(...points.map((point) => point.x)),
        minY: Math.min(...points.map((point) => point.y)),
        maxY: Math.max(...points.map((point) => point.y)),
        cx: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        cy: points.reduce((sum, point) => sum + point.y, 0) / points.length,
      };
    };
    const first = boxOf(0);
    const second = boxOf(1);
    const overlaps =
      first.minX < second.maxX &&
      first.maxX > second.minX &&
      first.minY < second.maxY &&
      first.maxY > second.minY;
    expect(overlaps, "the two groups were drawn on top of one another").toBe(false);

    for (const group of [0, 1]) {
      const own = group === 0 ? first : second;
      const other = group === 0 ? second : first;
      for (const id of [
        ...[0, 1, 2, 3].map((index) => `source:sources/g${group}-${index}.pdf`),
        ...[0, 1].map((page) => `page:wiki/g${group}-page-${page}`),
      ]) {
        const mark = at(id);
        expect(
          Math.hypot(mark.x - own.cx, mark.y - own.cy),
          `${id} settled nearer the other group's centre`,
        ).toBeLessThan(Math.hypot(mark.x - other.cx, mark.y - other.cy));
      }
    }
  });

  // A mention rests further out than a citation, putting concepts outside a page's sources.
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

    // A held node keeps the simulation alive, so the release, not a timer, ends the loop.
    expect(isLibrarySimulationRunning(sim)).toBe(true);
    releaseLibraryNode(sim, held, { x: 40, y: 0 });
    // The flick is capped: an unbounded release would throw the mark off the canvas.
    expect(sim.nodes[sim.index.get(held)!]!.vx).toBeLessThanOrEqual(14);
    expect(sim.nodes[sim.index.get(held)!]!.vx).toBeGreaterThan(0);
  });

  // Reduced motion settles in one call to the same positions, losing only the motion.
  it("settles to rest in a single synchronous call for reduced motion", () => {
    const sim = settleLibrarySimulation(createLibrarySimulation({ graph: denseFolder(), box: BOX }));
    expect(isLibrarySimulationRunning(sim)).toBe(false);
    expect(sim.nodes.every((node) => node.entered === 1)).toBe(true);
    expect(librarySimulationBounds(sim)).not.toBeNull();
  });

  /**
   * A settled picture is exactly still: a thousand frames guarded as the product loop is
   * leave positions byte-equal, with no clock, phase or per-frame offset added.
   */
  it("is exactly still once settled, however long the loop keeps asking", () => {
    const sim = settleLibrarySimulation(createLibrarySimulation({ graph: denseFolder(), box: BOX }));
    expect(isLibrarySimulationRunning(sim)).toBe(false);
    const rest = libraryPositions(sim);
    // The product loop, verbatim: the guard decides whether a frame steps at all.
    for (let frame = 0; frame < 1000; frame += 1) {
      if (isLibrarySimulationRunning(sim) || hasPinnedNode(sim)) stepLibrarySimulation(sim);
    }
    const after = libraryPositions(sim);
    for (const node of sim.nodes) {
      // Not "within a tolerance": the same numbers, and the same numbers the node carries.
      expect(after.get(node.id)).toEqual(rest.get(node.id));
      expect(after.get(node.id)).toEqual({ x: node.x, y: node.y });
    }
    expect(isLibrarySimulationRunning(sim)).toBe(false);

    // And a hand still wakes it: the reversal removed the endless drift, not the physics.
    pinLibraryNode(sim, sim.nodes[0]!.id, { x: 10, y: 20 });
    reheatLibrarySimulation(sim);
    expect(isLibrarySimulationRunning(sim)).toBe(true);
    releaseLibraryNode(sim, sim.nodes[0]!.id);
  });

  // A just-written page appears on its sources, then moves out, rather than flying in from the seed ring.
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

    // A removal returns where the mark was, so the caller fades it out there.
    const shrunk = syncLibrarySimulation(sim, graph);
    expect(shrunk.removed.map((node) => node.id)).toEqual(["page:wiki/fresh"]);
    expect(shrunk.removed[0]!.x).toBeCloseTo(fresh.x, 5);
  });

  /**
   * Orphans settle on a ring, not against the walls
   * (.claude/shots-2026-09-07/review/10-library-graph-rest.png), at four box shapes, since
   * a ring holding at one aspect is a tuned constant.
   */
  it("settles an unattached mark on a ring in its own place, never against a wall", () => {
    for (const box of [BOX, { width: 1156, height: 847 }, { width: 1400, height: 393 }, { width: 420, height: 300 }]) {
      const shape = `${box.width}×${box.height}`;
      const sim = settleLibrarySimulation(createLibrarySimulation({ graph: looseFolder(), box }));
      const at = (id: string) => sim.nodes[sim.index.get(id)!]!;
      const ring = libraryOrphanRing(sim);
      expect(ring, `no ring at ${shape}`).not.toBeNull();
      const radialOf = (node: { x: number; y: number }) =>
        Math.hypot((node.x - ring!.cx) / ring!.rx, (node.y - ring!.cy) / ring!.ry);

      // On the band, not merely somewhere outside.
      for (const id of LOOSE_IDS) {
        expect(radialOf(at(id)), `${id} left the ring band at ${shape}`).toBeGreaterThan(0.82);
        expect(radialOf(at(id)), `${id} left the ring band at ${shape}`).toBeLessThan(1.18);
      }
      /*
       * Packed, the ring sits in its own cell, so the claim is that no loose mark is inside
       * any component's bounding box (`docs/DECISIONS.md`, "Each group of the folder gets a
       * place, the ring included").
       */
      const clusters = new Map<number, { minX: number; minY: number; maxX: number; maxY: number }>();
      for (const node of sim.nodes) {
        if (node.orbit !== null) continue;
        const box = clusters.get(node.cell) ?? { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        box.minX = Math.min(box.minX, node.x - node.radius);
        box.minY = Math.min(box.minY, node.y - node.radius);
        box.maxX = Math.max(box.maxX, node.x + node.radius);
        box.maxY = Math.max(box.maxY, node.y + node.radius);
        clusters.set(node.cell, box);
      }
      for (const id of LOOSE_IDS) {
        const mark = at(id);
        for (const [cell, box] of clusters) {
          const inside =
            mark.x > box.minX && mark.x < box.maxX && mark.y > box.minY && mark.y < box.maxY;
          expect(inside, `${id} settled inside cluster ${cell} at ${shape}`).toBe(false);
        }
      }

      // Spread around the ring, not bunched in one direction.
      const angles = LOOSE_IDS.map((id) => Math.atan2(at(id).y - ring!.cy, at(id).x - ring!.cx)).sort(
        (first, second) => first - second,
      );
      const gaps = angles.map((angle, position) =>
        position === 0 ? angles[0]! + Math.PI * 2 - angles.at(-1)! : angle - angles[position - 1]!,
      );
      expect(Math.min(...gaps), `two loose marks share a direction at ${shape}`).toBeGreaterThan(
        ((Math.PI * 2) / LOOSE_IDS.length) * 0.8,
      );

      // Inside the canvas, measured after `fitView`, which reserves `LIBRARY_FIT_PADDING` per side.
      const view = fitView(librarySimulationBounds(sim), box, LIBRARY_FIT_PADDING);
      for (const id of LOOSE_IDS) {
        const point = worldToScreen(at(id), view, box);
        const fromSide = Math.min(point.x, box.width - point.x);
        const fromEnd = Math.min(point.y, box.height - point.y);
        expect(fromSide, `${id} is against a side wall at ${shape}`).toBeGreaterThanOrEqual(
          LIBRARY_FIT_PADDING - 0.5,
        );
        expect(fromEnd, `${id} is against the top or bottom at ${shape}`).toBeGreaterThanOrEqual(
          LIBRARY_FIT_PADDING - 0.5,
        );
        // Never near two edges at once: a mark outermost on both axes lands in a corner.
        expect(
          Math.max(fromSide, fromEnd),
          `${id} sits in a corner at ${shape}`,
        ).toBeGreaterThan(Math.min(box.width, box.height) * 0.15);
      }
    }
  });

  // The ring is a place, not a pin: an orphan can be dragged away and comes home.
  it("lets an unattached mark be dragged off its ring slot and brings it home again", () => {
    const sim = settleLibrarySimulation(createLibrarySimulation({ graph: looseFolder(), box: BOX }));
    const id = "page:wiki/handover";
    const at = () => sim.nodes[sim.index.get(id)!]!;
    const home = { x: at().x, y: at().y };

    pinLibraryNode(sim, id, { x: 0, y: 0 });
    stepLibrarySimulation(sim);
    expect(at().x).toBe(0);
    expect(at().y).toBe(0);

    releaseLibraryNode(sim, id);
    reheatLibrarySimulation(sim);
    settleLibrarySimulation(sim);
    const ring = libraryOrphanRing(sim)!;
    // Measured from the drop point: the loose group's cell is not at the origin.
    expect(Math.hypot(at().x, at().y), "the released mark stayed where it was dropped").toBeGreaterThan(
      ring.rx * 0.5,
    );
    // Home is the slot, not the pixel: within the mark's own collision reach, since it
    // shoves through neighbours on the way back and a small folder has a small ring.
    expect(
      Math.hypot(at().x - home.x, at().y - home.y),
      "the released mark did not come home",
    ).toBeLessThan(at().radius * 2);
  });

  /**
   * The slots are handed out by sorted id, so the same folder draws the same ring —
   * including after a page gains its first citation and stops being an orphan at all.
   */
  it("takes the ring slot back from a mark that gains a relation", () => {
    const graph = looseFolder();
    const sim = settleLibrarySimulation(createLibrarySimulation({ graph, box: BOX }));
    expect(sim.nodes.filter((node) => node.orbit !== null).map((node) => node.id).sort()).toEqual(
      [...LOOSE_IDS].sort(),
    );

    const joined: LibraryGraph = {
      ...graph,
      edges: [
        ...graph.edges,
        {
          id: "cites:wiki/handover→sources/kickoff-notes.html",
          source: "page:wiki/handover",
          target: "source:sources/kickoff-notes.html",
          relation: "cites",
          certainty: "current",
        },
      ],
    };
    syncLibrarySimulation(sim, joined);
    const still = sim.nodes.filter((node) => node.orbit !== null).map((node) => node.id).sort();
    expect(still).toEqual(["source:sources/design-system.docx", "source:sources/interview-notes.txt"]);
  });

  // The mark scale is a fact about the folder: the same radii whatever window it is drawn on.
  it("returns the same radii whatever the canvas is", () => {
    const graph = denseFolder();
    const radii = libraryMarkRadii(graph);
    expect([...radii.entries()]).toEqual([...libraryMarkRadii(graph).entries()]);
    const pages = graph.nodes.filter((node) => node.kind === "page");
    const top = Math.max(...pages.map((node) => radii.get(node.id)!));
    const bottom = Math.min(...pages.map((node) => radii.get(node.id)!));
    expect(top).toBeCloseTo(LIBRARY_PAGE_RADIUS_MAX, 6);
    expect(bottom).toBeGreaterThanOrEqual(LIBRARY_PAGE_RADIUS_MIN - 1e-9);
    for (const node of graph.nodes) {
      if (node.kind === "source") expect(radii.get(node.id)).toBeCloseTo(LIBRARY_SOURCE_RADIUS, 6);
      if (node.kind === "concept") expect(radii.get(node.id)).toBeCloseTo(LIBRARY_CONCEPT_RADIUS, 6);
    }
    // Citations still grade inside the band.
    expect(radii.get("page:wiki/page-4")!).toBeGreaterThan(radii.get("page:wiki/page-3")!);
  });

  it("grades the mark by citations inside the 5–9 band, keeping the source well under it", () => {
    const graph = denseFolder();
    const radii = libraryMarkRadii(graph);
    for (const node of graph.nodes) {
      const radius = radii.get(node.id)!;
      expect(radius).toBeGreaterThanOrEqual(LIBRARY_SOURCE_RADIUS - 1e-9);
      expect(radius).toBeLessThanOrEqual(LIBRARY_PAGE_RADIUS_MAX + 1e-9);
    }
    // The busiest page is drawn larger than the quietest.
    const pageRadius = (slug: string) => radii.get(`page:${slug}`)!;
    expect(pageRadius("wiki/page-4")).toBeGreaterThan(pageRadius("wiki/page-3"));
  });
});

/**
 * The loose group's index addresses `cells` only while packed; the one cell-shaped reader
 * checks `packed` first, and these cases state that invariant. They also cover the
 * single-mass branch, which `looseFolder()` (two masses) never enters.
 */

/** One connected mass plus unattached marks: the single-mass branch, which had no fixture. */
function oneMassPlusLooseFolder(): LibraryGraph {
  const nodes: LibraryGraphNode[] = [];
  const edges: LibraryGraphEdge[] = [];
  const mass = ["sources/m1.pdf", "sources/m2.pdf", "sources/m3.pdf"];
  const loose = ["sources/x.pdf", "sources/y.pdf", "sources/z.pdf"];
  for (const path of [...mass, ...loose]) {
    nodes.push({ id: `source:${path}`, kind: "source", label: path, ref: path, href: null });
  }
  // One page citing all three of the mass's files, so the mass is a single component.
  nodes.push({ id: "page:wiki/mass", kind: "page", label: "wiki/mass", ref: "wiki/mass", href: null });
  for (const path of mass) {
    edges.push({
      id: `cites:wiki/mass→${path}`,
      source: "page:wiki/mass",
      target: `source:${path}`,
      relation: "cites",
      certainty: "current",
    });
  }
  return { nodes, edges, counts: { sources: 6, pages: 1, concepts: 0, cites: edges.length, mentions: 0 } };
}

describe("the unattached group's own index", () => {
  const shapes: Array<[string, () => LibraryGraph]> = [
    ["one mass plus loose (unpacked)", oneMassPlusLooseFolder],
    ["several masses plus loose (packed)", looseFolder],
    ["a dense folder with nothing loose", denseFolder],
  ];

  for (const [shape, build] of shapes) {
    it(`addresses the degree-0 marks in \`groupNodes\`: ${shape}`, () => {
      const sim = settleLibrarySimulation(createLibrarySimulation({ graph: build(), box: BOX }));
      const loose = sim.nodes.filter((node) => node.orbit !== null).map((node) => node.id).sort();

      if (loose.length === 0) {
        expect(sim.looseGroup, "no unattached mark, so there is no loose group").toBeNull();
      } else {
        expect(sim.looseGroup, "unattached marks exist, so the group must be named").not.toBeNull();
        expect(
          (sim.groupNodes[sim.looseGroup!] ?? []).map((node) => node.id).sort(),
          "`groupNodes[looseGroup]` is not exactly the degree-0 set",
        ).toEqual(loose);
      }

      // The cell claim holds only while packed; unpacked, one cell covers the field and the index is 1.
      if (sim.packed) {
        expect(sim.cells.length, "packed, so one cell per group").toBe(sim.groupNodes.length);
        if (sim.looseGroup !== null) expect(sim.cells[sim.looseGroup]).toBeDefined();
      } else {
        expect(sim.cells.length, "unpacked is one field").toBe(1);
      }
    });
  }

  // Single mass: one field, one centre, loose marks ringed around the mass (`composeLibraryGroups`).
  it("keeps one field and puts the loose marks outside the mass, not in a cell of their own", () => {
    const sim = settleLibrarySimulation(
      createLibrarySimulation({ graph: oneMassPlusLooseFolder(), box: BOX }),
    );
    expect(sim.packed, "one connected mass must not be composed as peers").toBe(false);
    expect(sim.cells.length).toBe(1);
    expect(sim.groupNodes.length, "the mass and the loose marks are the two groups").toBe(2);

    const held = sim.nodes.filter((node) => node.orbit === null);
    const loose = sim.nodes.filter((node) => node.orbit !== null);
    expect(held.length).toBe(4);
    expect(loose.length).toBe(3);

    const box = {
      minX: Math.min(...held.map((node) => node.x - node.radius)),
      maxX: Math.max(...held.map((node) => node.x + node.radius)),
      minY: Math.min(...held.map((node) => node.y - node.radius)),
      maxY: Math.max(...held.map((node) => node.y + node.radius)),
    };
    // No unattached mark inside the connected mass's box.
    for (const node of loose) {
      const inside =
        node.x > box.minX && node.x < box.maxX && node.y > box.minY && node.y < box.maxY;
      expect(inside, `${node.id} stands inside the connected mass`).toBe(false);
    }

    // Unpacked, the ring is measured from the mass, and every loose mark stands on it.
    const ring = libraryOrphanRing(sim)!;
    expect(ring, "a folder with unattached marks has a ring").not.toBeNull();
    for (const node of loose) {
      const radial = Math.hypot((node.x - ring.cx) / ring.rx, (node.y - ring.cy) / ring.ry);
      expect(radial, `${node.id} is not on the ring`).toBeGreaterThan(0.9);
      expect(radial, `${node.id} is not on the ring`).toBeLessThan(1.1);
    }
  });
});
