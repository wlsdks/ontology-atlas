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
  LIBRARY_LABEL_ALLOWANCE,
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

/**
 * **The seeded folder that produced the scattered picture**, in its measured shape: seven
 * sources of which three are cited by nobody, four pages of which one cites nothing. Four
 * marks with no relation at all — the exact set the review frame of 2026-09-07 found on
 * four different walls of the canvas.
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

    /*
     * ⚠️ **Restated on 2026-09-12, and the reason is a trade this change made on purpose.**
     *
     * What stood here was that *every* source of a page is nearer to it than *any* source of
     * the other group. That held because cross-group repulsion pushed two unconnected
     * clusters as far apart as the field allowed — which is exactly what left 54% of the
     * canvas empty on the owner's folder and is why the groups are now composed into adjacent
     * cells (`library-graph-packing.ts`). Packed, the far side of your own cluster can be 100
     * units away while the nearest mark of the cluster beside it is 96, and no gutter fixes
     * that without giving the empty middle back.
     *
     * So the claim is the one a reader actually uses: the **groups are separate places** —
     * their bounding boxes do not overlap — and every mark is nearer to its own group's centre
     * than to the other's. Which cluster a mark belongs to is said by the lines that run to
     * it, and the composition's job is to put the two somewhere a person can tell apart.
     * `docs/DECISIONS.md`, 2026-09-12, carries the trade and the dissent against it.
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
   * **A settled picture is still — exactly, not nearly** (owner, 2026-09-08:
   * *"why does it wriggle whenever I put the mouse on the graph?"*).
   *
   * This is the regression barrier for the ambient drift that used to live here. It was
   * ≤0.4px, it was applied to the drawn position on a clock, and it was still visible — so
   * the bound this gate owns is no longer a small number but **zero**, and it is asserted
   * the way the loop actually runs: a thousand guarded frames, each stepping only while
   * `isLibrarySimulationRunning` says there is somewhere to go. The positions must come
   * back byte-equal, and `libraryPositions` must remain the simulation's own state with
   * nothing added to it — no clock, no phase, no per-frame offset.
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

  /**
   * **The scattered-orphan case** — the review frame of 2026-09-07,
   * `.claude/shots-2026-09-07/review/10-library-graph-rest.png`, made falsifiable.
   *
   * A degree-0 mark had no spring to answer for it, so it was placed by repulsion against
   * gravity alone, and that balance is not a place: on the owner's seeded folder the four
   * loose marks went to four different walls, one of them into the bottom-right corner
   * under the fit control, while the two real components sat small in the middle. The
   * claims below are the composition, not the coincidence, and they are made at four box
   * shapes because a ring that only holds at one aspect is a tuned constant.
   *
   * Measured on this fixture at 1046×620, loose marks only: distance from the ring, 0.83
   * to 1.54 of the mass's own radius before and 0.97 to 1.00 after; smallest angular gap
   * 0.30 rad before and 1.57 after; marks within 60px of two canvas edges at once, two
   * before and none after; canvas filled 78.2% wide before and 89.1% after, which is the
   * whole of what the fit's padding leaves.
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

      // ── On the band, not merely somewhere outside ──────────────────────────────────
      for (const id of LOOSE_IDS) {
        expect(radialOf(at(id)), `${id} left the ring band at ${shape}`).toBeGreaterThan(0.82);
        expect(radialOf(at(id)), `${id} left the ring band at ${shape}`).toBeLessThan(1.18);
      }
      /*
       * ⚠️ **The ring is its own place, not a rim around the clusters** (2026-09-12).
       *
       * The claim that used to stand here was that the ring encircled the connected mass
       * and nothing the springs hold reached it. Since the folder's groups are composed —
       * each one packed into a cell of its own — the unattached marks are a group like any
       * other and the ring is inside their cell. What has to stay true is the thing that
       * record was protecting: **no loose mark is inside a cluster**. So it is measured
       * against every component's own bounding box rather than against a shared rim.
       * `docs/DECISIONS.md`, 2026-09-12, carries the narrowing.
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

      // ── Spread, because two loose marks in one direction is the old picture ─────────
      const angles = LOOSE_IDS.map((id) => Math.atan2(at(id).y - ring!.cy, at(id).x - ring!.cx)).sort(
        (first, second) => first - second,
      );
      const gaps = angles.map((angle, position) =>
        position === 0 ? angles[0]! + Math.PI * 2 - angles.at(-1)! : angle - angles[position - 1]!,
      );
      expect(Math.min(...gaps), `two loose marks share a direction at ${shape}`).toBeGreaterThan(
        ((Math.PI * 2) / LOOSE_IDS.length) * 0.8,
      );

      /*
       * ── Inside the canvas, in the pixels a person is looking at ───────────────────
       *
       * ⚠️ Measured **after the fit**, which is the only place the claim means anything:
       * the simulation's box is a field shape, and it is `fitView` that decides where a
       * world coordinate lands on the canvas. It reserves `LIBRARY_LABEL_ALLOWANCE` on
       * every side for the name that stands under the outermost mark — the same number the
       * ring's own documentation is written against.
       */
      const view = fitView(librarySimulationBounds(sim), box, LIBRARY_LABEL_ALLOWANCE);
      for (const id of LOOSE_IDS) {
        const point = worldToScreen(at(id), view, box);
        const fromSide = Math.min(point.x, box.width - point.x);
        const fromEnd = Math.min(point.y, box.height - point.y);
        expect(fromSide, `${id} is against a side wall at ${shape}`).toBeGreaterThanOrEqual(
          LIBRARY_LABEL_ALLOWANCE - 0.5,
        );
        expect(fromEnd, `${id} is against the top or bottom at ${shape}`).toBeGreaterThanOrEqual(
          LIBRARY_LABEL_ALLOWANCE - 0.5,
        );
        // And never against two of them at once. A mark that is the outermost thing on
        // both axes lands in a corner however generous the margin is, which is where
        // `kickoff-notes.html` was found, 40px from the fit control.
        expect(
          Math.max(fromSide, fromEnd),
          `${id} sits in a corner at ${shape}`,
        ).toBeGreaterThan(Math.min(box.width, box.height) * 0.15);
      }
    }
  });

  /**
   * The ring is a **place**, not a pin. The decision the ring lands under is the one that
   * made this canvas live, so an orphan that could not be pulled out of shape, or that
   * stayed where it was dropped, would answer the wall complaint by breaking the record it
   * is written under.
   */
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
    // Measured from where it was **dropped**, not from the origin: since the folder's
    // groups are composed the loose group's cell is somewhere of its own, and the origin is
    // the middle of the whole arrangement rather than the middle of the mass.
    expect(Math.hypot(at().x, at().y), "the released mark stayed where it was dropped").toBeGreaterThan(
      ring.rx * 0.5,
    );
    // Home is the slot, not the pixel: the mark shoved its way through its neighbours on
    // the way in, so it comes back to within its own width of where it stood rather than to
    // the same coordinate. A fraction of the ring is the wrong scale for this — a folder with
    // three loose files has a small ring — and it is stated against the mark's own collision
    // reach so that the band following the canvas cannot silently loosen it.
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
