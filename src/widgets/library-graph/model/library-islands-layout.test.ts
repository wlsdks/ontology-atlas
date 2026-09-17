import { describe, expect, it } from "vitest";

import type { LibraryGraph } from "./build-library-graph";
import { ISLAND_PAGE_RADIUS, ISLAND_SOURCE_RADIUS, islandsLayout } from "./library-islands-layout";

function graph(input: { sources?: string[]; pages?: string[]; concepts?: string[]; cites?: Array<[string, string]>; mentions?: Array<[string, string]> }): LibraryGraph {
  const nodes = [
    ...(input.sources ?? []).map((path) => ({ id: `source:${path}`, kind: "source" as const, label: path, ref: path, href: null })),
    ...(input.pages ?? []).map((slug) => ({ id: `page:${slug}`, kind: "page" as const, label: slug, ref: slug, href: null })),
    ...(input.concepts ?? []).map((slug) => ({ id: `concept:${slug}`, kind: "concept" as const, label: slug, ref: slug, href: null })),
  ];
  const edges = [
    ...(input.cites ?? []).map(([page, source], index) => ({ id: `c${index}`, source: `page:${page}`, target: `source:${source}`, relation: "cites" as const, certainty: "current" as const })),
    ...(input.mentions ?? []).map(([page, concept], index) => ({ id: `m${index}`, source: `page:${page}`, target: `concept:${concept}`, relation: "mentions" as const, certainty: "current" as const })),
  ];
  return { nodes, edges, counts: { sources: input.sources?.length ?? 0, pages: input.pages?.length ?? 0, concepts: input.concepts?.length ?? 0, cites: input.cites?.length ?? 0, mentions: input.mentions?.length ?? 0 } };
}

const WORLD = { width: 1000, height: 600 };
const LABELS = { unsorted: "Unsorted", unread: "Unread" };

describe("islands layout", () => {
  it("makes an island per concept, an Unsorted island for pages naming none, and an Unread island for files no page read", () => {
    const layout = islandsLayout(
      graph({
        sources: ["a.md", "b.md", "c.md", "d.md"],
        pages: ["one", "two", "three"],
        concepts: ["payments", "refunds"],
        cites: [["one", "a.md"], ["two", "b.md"], ["three", "c.md"]],
        mentions: [["one", "payments"], ["two", "refunds"], ["two", "payments"]],
      }),
      WORLD,
      LABELS,
    );
    const byId = new Map(layout.islands.map((island) => [island.id, island]));
    expect(byId.get("concept:payments")?.pages).toEqual(["page:one", "page:two"]);
    expect(byId.get("concept:refunds")).toBeUndefined();
    expect(byId.get("unsorted")?.pages).toEqual(["page:three"]);
    expect(byId.get("unsorted")?.sources).toEqual(["source:c.md"]);
    expect(byId.get("unread")?.sources).toEqual(["source:d.md"]);
    expect(byId.get("unread")?.kind).toBe("unread");
  });

  it("groups by wiki sub-folder when a page names no concept", () => {
    const layout = islandsLayout(graph({ pages: ["wiki/payments/fees", "wiki/payments/tiers", "wiki/notes"] }), WORLD, LABELS);
    expect(layout.islands.map((island) => [island.id, island.pages.length]).sort()).toEqual([["folder:payments", 2], ["unsorted", 1]]);
  });

  it("keeps every dot inside its island and no two islands overlapping, with the largest in the middle", () => {
    const sources = Array.from({ length: 300 }, (_, i) => `s${i}.md`);
    const pages = Array.from({ length: 60 }, (_, i) => `p${i}`);
    const concepts = ["alpha", "beta", "gamma"];
    // The last twenty files are read by nobody: they are the Unread island.
    const cites: Array<[string, string]> = sources.slice(0, 280).map((s, i) => [pages[i % 40], s]);
    const mentions: Array<[string, string]> = pages.slice(0, 50).map((p, i) => [p, concepts[i % 3]]);
    const layout = islandsLayout(graph({ sources, pages, concepts, cites, mentions }), WORLD, LABELS);
    expect(layout.islands.length).toBe(5);
    for (const island of layout.islands) {
      for (const id of [...island.pages, ...island.sources]) {
        const p = layout.positions.get(id)!;
        expect(Math.hypot(p.x - island.x, p.y - island.y) + layout.radii.get(id)!).toBeLessThanOrEqual(island.r + 1e-6);
      }
    }
    for (const a of layout.islands) for (const b of layout.islands) {
      if (a === b) continue;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r - 1e-6);
    }
    // The largest island stands about the middle of the map: the ring around it is not
    // symmetric, so "about" is within a sixth of the world on either axis.
    const largest = [...layout.islands].sort((a, b) => b.r - a.r)[0];
    expect(Math.abs(largest.x - WORLD.width / 2)).toBeLessThanOrEqual(WORLD.width / 6);
    expect(Math.abs(largest.y - WORLD.height / 2)).toBeLessThanOrEqual(WORLD.height / 6);
    // The map fills the world on one axis and never leaves it.
    const minX = Math.min(...layout.islands.map((i) => i.x - i.r));
    const maxX = Math.max(...layout.islands.map((i) => i.x + i.r));
    const minY = Math.min(...layout.islands.map((i) => i.y - i.r));
    const maxY = Math.max(...layout.islands.map((i) => i.y + i.r));
    expect(minX).toBeGreaterThanOrEqual(-1e-6);
    expect(maxX).toBeLessThanOrEqual(WORLD.width + 1e-6);
    expect(minY).toBeGreaterThanOrEqual(-1e-6);
    expect(maxY).toBeLessThanOrEqual(WORLD.height + 1e-6);
    expect(Math.max(maxX - minX - WORLD.width, maxY - minY - WORLD.height)).toBeCloseTo(0, 6);
  });

  it("scales dot radii with the map, pages larger than files", () => {
    const layout = islandsLayout(graph({ sources: ["a.md"], pages: ["one"], cites: [["one", "a.md"]] }), WORLD, LABELS);
    const page = layout.radii.get("page:one")!;
    const file = layout.radii.get("source:a.md")!;
    expect(page / file).toBeCloseTo(ISLAND_PAGE_RADIUS / ISLAND_SOURCE_RADIUS, 6);
  });

  it("is the same map for the same folder whatever order the nodes arrived in", () => {
    const one = islandsLayout(graph({ sources: ["b.md", "a.md"], pages: ["b", "a"], cites: [["a", "a.md"], ["b", "b.md"]] }), WORLD, LABELS);
    const two = islandsLayout(graph({ sources: ["a.md", "b.md"], pages: ["a", "b"], cites: [["b", "b.md"], ["a", "a.md"]] }), WORLD, LABELS);
    expect([...one.positions.entries()].sort()).toEqual([...two.positions.entries()].sort());
  });
});
