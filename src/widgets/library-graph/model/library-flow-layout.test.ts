import { describe, expect, it } from "vitest";

import type { LibraryGraph } from "./build-library-graph";
import { FLOW_GRID_STEP, FLOW_LABEL_ROOM_PX, FLOW_ROW_MAX, FLOW_ROW_MIN, FLOW_ROW_MIN_PX, FLOW_SIDE_PAD, FLOW_TOP_PAD, flowLayout } from "./library-flow-layout";

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

const BOX = { width: 1000, height: 600, ceiling: 1 };
/** Where the outer columns stand: the side pad plus the room for a name beside them. */
const FIRST = FLOW_SIDE_PAD + FLOW_LABEL_ROOM_PX;
const LAST = BOX.width - FIRST;

describe("flow layout", () => {
  it("puts sources left, pages in the middle, concepts right, spread across the width", () => {
    const layout = flowLayout(graph({ sources: ["a.md"], pages: ["a"], concepts: ["x"], cites: [["a", "a.md"]], mentions: [["a", "x"]] }), BOX);
    expect(layout.columns.map((column) => column.kind)).toEqual(["source", "page", "concept"]);
    // The outer columns leave room for the names standing outside them; the middle is halfway.
    expect(layout.columns.map((column) => column.x)).toEqual([FIRST, (FIRST + LAST) / 2, LAST]);
    expect(layout.positions.get("page:a")?.y).toBe(300);
    expect(layout.extent).toEqual({ width: 1000, height: 600 });
  });

  it("drops an empty column and centres what remains, so two pages never sit in a corner", () => {
    const layout = flowLayout(graph({ sources: ["a.md", "b.md"], pages: ["a", "b"], cites: [["a", "a.md"], ["b", "b.md"]] }), BOX);
    expect(layout.columns.map((column) => column.kind)).toEqual(["source", "page"]);
    expect(layout.columns.map((column) => column.x)).toEqual([FIRST, LAST]);
    expect(layout.columns.every((column) => column.grid === 1)).toBe(true);
    const ys = ["page:a", "page:b"].map((id) => layout.positions.get(id)!.y);
    expect((ys[0] + ys[1]) / 2).toBe(300);
    expect(ys[1] - ys[0]).toBe(FLOW_ROW_MAX);
  });

  it("is the same picture for the same folder, whatever order the nodes arrived in", () => {
    const one = flowLayout(graph({ sources: ["b.md", "a.md"], pages: ["b", "a"], cites: [["a", "a.md"], ["b", "b.md"]] }), BOX);
    const two = flowLayout(graph({ sources: ["a.md", "b.md"], pages: ["a", "b"], cites: [["b", "b.md"], ["a", "a.md"]] }), BOX);
    expect([...one.positions.entries()].sort()).toEqual([...two.positions.entries()].sort());
  });

  it("puts a page level with the sources it was written from", () => {
    const layout = flowLayout(graph({ sources: ["a.md", "b.md", "c.md", "d.md"], pages: ["one", "two"], cites: [["one", "a.md"], ["one", "b.md"], ["two", "c.md"], ["two", "d.md"]] }), BOX);
    const y = (id: string) => layout.positions.get(id)!.y;
    expect(y("page:one")).toBe((y("source:a.md") + y("source:b.md")) / 2);
    expect(y("page:two")).toBe((y("source:c.md") + y("source:d.md")) / 2);
    expect(y("page:two") - y("page:one")).toBeGreaterThanOrEqual(FLOW_ROW_MIN);
  });

  it("orders a source beside the page that cites it, so citations do not cross", () => {
    const layout = flowLayout(graph({ sources: ["z.md", "a.md"], pages: ["alpha", "zeta"], cites: [["alpha", "z.md"], ["zeta", "a.md"]] }), BOX);
    // alpha is the first page; z.md is cited by alpha, so z.md is the first source.
    expect(layout.columns[0].ids).toEqual(["source:z.md", "source:a.md"]);
    expect(layout.positions.get("source:z.md")?.y).toBe(layout.positions.get("page:alpha")?.y);
  });

  it("keeps a ceiling on the row gap for a short column", () => {
    const few = flowLayout(graph({ sources: ["a.md", "b.md", "c.md"] }), BOX);
    expect(few.rowGap).toBe(FLOW_ROW_MAX);
    expect(few.columns[0].grid).toBe(1);
  });

  it("keeps a row for every file while the picture can afford one at the 18px floor, even past the rows that fit at the ceiling", () => {
    // 340 world tall at ceiling 2 fits 15 rows at the ceiling and affords 37 at the floor.
    const twelve = flowLayout(graph({ sources: Array.from({ length: 20 }, (_, i) => `s${i}.md`), pages: ["a"], cites: [["a", "s0.md"]] }), { width: 600, height: 340, ceiling: 2 });
    expect(twelve.columns[0].grid).toBe(1);
    expect(twelve.extent.height).toBe(FLOW_ROW_MIN * 19 + FLOW_TOP_PAD * 2);
  });

  it("folds a file band taller than the box into a grid at the floor gap, and names keep their rows", () => {
    const many = flowLayout(graph({ sources: Array.from({ length: 300 }, (_, i) => `s${i}.md`) }), { width: 600, height: 340, ceiling: 2 });
    const column = many.columns[0];
    // Rows affordable at 18px each: (340 · 2 / (18/22) − 32) / 22 + 1 = 37 → 300 files are 9 sub-columns of 34.
    expect(column.grid).toBe(9);
    expect(many.rowGap).toBe(FLOW_ROW_MIN);
    const ys = new Set(column.ids.map((id) => many.positions.get(id)!.y));
    expect(ys.size).toBe(34);
    const xs = [...new Set(column.ids.map((id) => many.positions.get(id)!.x))].sort((a, b) => a - b);
    expect(xs.length).toBe(9);
    expect(xs[1] - xs[0]).toBe(FLOW_GRID_STEP);
    // The grid is centred on the column's own x.
    expect(xs.reduce((sum, x) => sum + x, 0) / xs.length).toBeCloseTo(column.x, 6);
  });

  it("grows taller than the box for a long page column, keeping the aspect, and widens the name room by the same amount", () => {
    const pages = Array.from({ length: 30 }, (_, i) => `p${String(i).padStart(2, "0")}`);
    const long = flowLayout(graph({ sources: ["a.md"], pages, cites: [["p00", "a.md"]] }), { width: 600, height: 340, ceiling: 2 });
    const page = long.columns.find((column) => column.kind === "page")!;
    expect(page.grid).toBe(1);
    expect(long.rowGap).toBe(FLOW_ROW_MIN);
    const height = FLOW_ROW_MIN * 29 + FLOW_TOP_PAD * 2;
    expect(long.extent.height).toBe(height);
    expect(long.extent.width).toBeCloseTo(600 * (height / 340), 6);
    // The camera will fit this at 2 · 340 / height; the 132px name room is that much wider in world units.
    const scale = 2 * (340 / height);
    expect(long.scale).toBeCloseTo(scale, 6);
    expect(long.columns[0].x).toBeCloseTo(FLOW_SIDE_PAD + FLOW_LABEL_ROOM_PX / scale, 6);
    expect(long.columns[1].x).toBeCloseTo(long.extent.width - FLOW_SIDE_PAD - FLOW_LABEL_ROOM_PX / scale, 6);
  });

  it("folds a named column into sub-columns with room for its names once a row would drop under 18px", () => {
    const pages = Array.from({ length: 60 }, (_, i) => `p${String(i).padStart(2, "0")}`);
    const layout = flowLayout(graph({ sources: ["a.md"], pages, cites: [["p00", "a.md"]] }), { width: 600, height: 340, ceiling: 2 });
    const page = layout.columns.find((column) => column.kind === "page")!;
    // Rows affordable at 18px each: (340 · 2 / (18/22) − 32) / 22 + 1 = 37 → 60 pages are two sub-columns of 30.
    expect(page.grid).toBe(2);
    expect(layout.scale * FLOW_ROW_MIN).toBeGreaterThanOrEqual(FLOW_ROW_MIN_PX - 1e-6);
    const xs = [...new Set(page.ids.map((id) => layout.positions.get(id)!.x))].sort((a, b) => a - b);
    expect(xs).toHaveLength(2);
    // A name's full room fits between the two sub-columns: mark, gap, 132px of name, a breath.
    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(18 + 5 + FLOW_LABEL_ROOM_PX / layout.scale);
    // The picture stays wider than its bands and the name room outside them.
    expect(layout.extent.width).toBeGreaterThanOrEqual(FLOW_SIDE_PAD * 2 + (FLOW_LABEL_ROOM_PX / layout.scale) * 2 + (xs[1] - xs[0]));
  });

  it("stands pages that name the same concept together, and the concept level with them", () => {
    const layout = flowLayout(
      graph({
        pages: ["alpha", "beta", "gamma", "delta"],
        concepts: ["refunds", "payments"],
        mentions: [["alpha", "refunds"], ["beta", "payments"], ["gamma", "refunds"], ["delta", "payments"]],
      }),
      BOX,
    );
    // Concepts rank by title (payments 0, refunds 1); pages follow their concept, then title.
    expect(layout.columns.find((column) => column.kind === "page")!.ids).toEqual(["page:beta", "page:delta", "page:alpha", "page:gamma"]);
    const y = (id: string) => layout.positions.get(id)!.y;
    expect(y("concept:payments")).toBe((y("page:beta") + y("page:delta")) / 2);
    expect(y("concept:refunds")).toBe((y("page:alpha") + y("page:gamma")) / 2);
  });

  it("stands folded pages in stacks, each with the files its pages read directly to its left", () => {
    const pages = Array.from({ length: 60 }, (_, i) => `p${String(i).padStart(2, "0")}`);
    const sources = Array.from({ length: 120 }, (_, i) => `s${String(i).padStart(3, "0")}.md`);
    // Page i reads files 2i and 2i+1; the pages fold into two sub-columns of thirty here.
    const cites: Array<[string, string]> = pages.flatMap((p, i) => [[p, sources[2 * i]], [p, sources[2 * i + 1]]] as Array<[string, string]>);
    const layout = flowLayout(graph({ sources, pages, cites }), { width: 600, height: 340, ceiling: 2 });
    const page = layout.columns.find((column) => column.kind === "page")!;
    expect(page.grid).toBe(2);
    const x = (id: string) => layout.positions.get(id)!.x;
    const firstStackPages = page.ids.slice(0, 30);
    const secondStackPages = page.ids.slice(30);
    const stackPageX = [x(firstStackPages[0]), x(secondStackPages[0])];
    expect(stackPageX[1]).toBeGreaterThan(stackPageX[0]);
    // Every file read by a first-stack page stands left of that stack's pages and right of nothing else;
    // every file read by a second-stack page stands between the first stack's pages and its own.
    for (const [p, s] of cites) {
      const inFirst = firstStackPages.includes(`page:${p}`);
      if (inFirst) expect(x(`source:${s}`)).toBeLessThan(stackPageX[0]);
      else {
        expect(x(`source:${s}`)).toBeGreaterThan(stackPageX[0]);
        expect(x(`source:${s}`)).toBeLessThan(stackPageX[1]);
      }
    }
    // Rows line up across a stack: a page and its files share the same set of rows.
    const ys = new Set(page.ids.map((id) => layout.positions.get(id)!.y));
    expect(ys.size).toBe(30);
    expect(layout.extent.width).toBeGreaterThanOrEqual(600);
  });

  it("lays a single node at the centre", () => {
    const layout = flowLayout(graph({ pages: ["only"] }), BOX);
    expect(layout.positions.get("page:only")).toEqual({ x: 500, y: 300 });
  });
});
