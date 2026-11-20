import { describe, expect, it } from "vitest";

import type { LibraryGraph } from "./build-library-graph";
import {
  FLOW_GRID_STEP,
  FLOW_LABEL_ROOM_MAX_PX,
  FLOW_LABEL_ROOM_MIN_PX,
  FLOW_ROW_MAX,
  FLOW_ROW_MIN,
  FLOW_ROW_MIN_PX,
  FLOW_SIDE_PAD,
  FLOW_TOP_PAD,
  flowLayout,
  type FlowLayout,
} from "./library-flow-layout";

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

function sameTitles(folder: LibraryGraph, reversed: boolean): LibraryGraph {
  const title = { source: "notes.md", page: "Notes", concept: "Payments" } as const;
  const nodes = folder.nodes.map((node) => ({ ...node, label: title[node.kind] }));
  return reversed ? { ...folder, nodes: nodes.reverse(), edges: [...folder.edges].reverse() } : { ...folder, nodes };
}

const BOX = { width: 1000, height: 600, ceiling: 1 };
/** A name place's width besides its room, in world units at scale 1: two mark radii, the name gap and a breath. */
const PLACE_BESIDES_ROOM = 9 * 2 + 5 + 8;

/**
 * Sixty pages that fold into two stacks of thirty in a 600 × 340 box at ceiling 2, each
 * reading its own file and naming two of sixteen concepts by a fixed stride, plus a concept
 * no page names. The strides give concepts named from both stacks, ties included.
 */
function foldedFolder(): LibraryGraph {
  const pages = Array.from({ length: 60 }, (_, i) => `p${String(i).padStart(2, "0")}`);
  const sources = Array.from({ length: 60 }, (_, i) => `s${String(i).padStart(3, "0")}.md`);
  const concepts = [...Array.from({ length: 16 }, (_, i) => `c${String(i).padStart(2, "0")}`), "unnamed"];
  const cites = pages.map((p, i) => [p, sources[i]] as [string, string]);
  const mentions = pages.flatMap((p, i) => [...new Set([(i * 7) % 16, (i * 3 + 5) % 16])].map((c) => [p, concepts[c]] as [string, string]));
  return graph({ sources, pages, concepts, cites, mentions });
}
const FOLDED_WORLD = { width: 600, height: 340, ceiling: 2 };

/** Each page's stack, read off the picture: stacks are the page columns from left to right. */
function stacksOf(layout: FlowLayout, folder: LibraryGraph): { stackOf: Map<string, number>; pageXs: number[] } {
  const pageIds = folder.nodes.filter((node) => node.kind === "page").map((node) => node.id);
  const pageXs = [...new Set(pageIds.map((id) => layout.positions.get(id)!.x))].sort((a, b) => a - b);
  return { stackOf: new Map(pageIds.map((id) => [id, pageXs.indexOf(layout.positions.get(id)!.x)])), pageXs };
}

describe("flow layout", () => {
  it("puts sources left, pages in the middle, concepts right, spread across the width", () => {
    const layout = flowLayout(graph({ sources: ["a.md"], pages: ["a"], concepts: ["x"], cites: [["a", "a.md"]], mentions: [["a", "x"]] }), BOX);
    expect(layout.columns.map((column) => column.kind)).toEqual(["source", "page", "concept"]);
    // Centred, one gap apart: the four name places share the box, so the gap stays under its 260px cap.
    const [source, page, concept] = layout.columns.map((column) => column.x);
    expect(page).toBe(500);
    expect(concept - page).toBeCloseTo(page - source, 6);
    expect(concept - page).toBeLessThanOrEqual(260);
    expect(concept - page).toBeGreaterThanOrEqual(PLACE_BESIDES_ROOM + layout.columns[1].labelRoom);
    expect(layout.positions.get("page:a")?.y).toBe(300);
    expect(layout.extent).toEqual({ width: 1000, height: 600 });
  });

  it("drops an empty column and centres what remains, so two pages never sit in a corner", () => {
    const layout = flowLayout(graph({ sources: ["a.md", "b.md"], pages: ["a", "b"], cites: [["a", "a.md"], ["b", "b.md"]] }), BOX);
    expect(layout.columns.map((column) => column.kind)).toEqual(["source", "page"]);
    // The gap holds a whole name place: at the 240px ceiling that is wider than the 260px gap cap.
    expect(layout.columns.map((column) => column.x)).toEqual([500 - (PLACE_BESIDES_ROOM + FLOW_LABEL_ROOM_MAX_PX) / 2, 500 + (PLACE_BESIDES_ROOM + FLOW_LABEL_ROOM_MAX_PX) / 2]);
    expect(layout.columns.every((column) => column.grid === 1)).toBe(true);
    const ys = ["page:a", "page:b"].map((id) => layout.positions.get(id)!.y);
    expect((ys[0] + ys[1]) / 2).toBe(300);
    expect(ys[1] - ys[0]).toBe(FLOW_ROW_MAX);
  });

  it("lets a page name run into the empty concept column instead of cutting it", () => {
    // Pages citing no concept: no concept column is laid, so page names may use the empty right side.
    const layout = flowLayout(
      graph({ sources: ["a.md", "b.md"], pages: ["Engineering onboarding and the rest of it", "b"], cites: [["b", "b.md"]] }),
      BOX,
    );
    const page = layout.columns.find((column) => column.kind === "page")!;
    expect(layout.columns.map((column) => column.kind)).toEqual(["source", "page"]);
    expect(page.labelRoom).toBeGreaterThan(layout.columns[0].labelRoom);
    // Out to the picture's edge: everything between the name's start and the side pad.
    expect(page.labelRoom).toBeCloseTo(layout.extent.width - FLOW_SIDE_PAD - (page.x + 9 + 5), 6);
    // A name that long is drawn whole, so nothing is cut while the canvas has the room.
    expect(page.labelRoom).toBeGreaterThan(300);
  });

  it("keeps the budgeted room when the concept column does hold rows", () => {
    // Widening here would put a page name across the citations running to the concepts.
    const layout = flowLayout(
      graph({ sources: ["a.md"], pages: ["a"], concepts: ["x"], cites: [["a", "a.md"]], mentions: [["a", "x"]] }),
      BOX,
    );
    const page = layout.columns.find((column) => column.kind === "page")!;
    const concept = layout.columns.find((column) => column.kind === "concept")!;
    // Every place's equal share of the box; the rightmost column has no neighbour kind to widen into.
    expect(page.labelRoom).toBeLessThanOrEqual(FLOW_LABEL_ROOM_MAX_PX / layout.scale);
    expect(concept.labelRoom).toBe(page.labelRoom);
    expect(layout.columns[0].labelRoom).toBe(page.labelRoom);
  });

  it("is the same picture for the same folder, whatever order the nodes arrived in", () => {
    const one = flowLayout(graph({ sources: ["b.md", "a.md"], pages: ["b", "a"], cites: [["a", "a.md"], ["b", "b.md"]] }), BOX);
    const two = flowLayout(graph({ sources: ["a.md", "b.md"], pages: ["a", "b"], cites: [["b", "b.md"], ["a", "a.md"]] }), BOX);
    expect([...one.positions.entries()].sort()).toEqual([...two.positions.entries()].sort());
  });

  it("keeps same-titled files, pages and concepts in their places whatever order they arrived in", () => {
    const folder = graph({
      sources: ["a/notes.md", "b/notes.md"],
      pages: ["one", "two"],
      concepts: ["x", "y"],
      cites: [["one", "a/notes.md"], ["two", "b/notes.md"]],
      mentions: [["one", "x"], ["two", "y"]],
    });
    const one = flowLayout(sameTitles(folder, false), BOX);
    const two = flowLayout(sameTitles(folder, true), BOX);
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
    // The camera will fit this at 2 · 340 / height; the name room is the 240px ceiling in
    // world units, and the two columns stand a whole name place apart, centred in the wider world.
    const scale = 2 * (340 / height);
    expect(long.scale).toBeCloseTo(scale, 6);
    expect(long.columns[1].x - long.columns[0].x).toBeCloseTo(9 * 2 + 5 + (8 + FLOW_LABEL_ROOM_MAX_PX) / scale, 6);
    expect((long.columns[0].x + long.columns[1].x) / 2).toBeCloseTo(long.extent.width / 2, 6);
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
    // A name's whole room fits between the two sub-columns: mark, gap, the published room.
    expect(page.labelRoom * layout.scale).toBeGreaterThanOrEqual(FLOW_LABEL_ROOM_MIN_PX - 1e-6);
    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(18 + 5 + page.labelRoom);
    // The picture holds both stacks and the room right of the last one.
    expect(layout.extent.width).toBeGreaterThanOrEqual(xs[1] + 9 + 5 + page.labelRoom - 1e-6);
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

  it("gives each concept to the stack holding most of the pages naming it, between that stack's pages and the next stack's files", () => {
    const folder = foldedFolder();
    const layout = flowLayout(folder, FOLDED_WORLD);
    const { stackOf, pageXs } = stacksOf(layout, folder);
    expect(pageXs).toHaveLength(2);
    const x = (id: string) => layout.positions.get(id)!.x;
    const firstFileOfStack = (stack: number): number =>
      Math.min(...folder.nodes.filter((node) => node.kind === "source" && x(node.id) > pageXs[stack - 1]! && (stack === pageXs.length - 1 || x(node.id) < pageXs[stack]!)).map((node) => x(node.id)));
    let ties = 0;
    let towardSecond = 0;
    for (const concept of folder.nodes.filter((node) => node.kind === "concept")) {
      const namers = new Set(folder.edges.filter((edge) => edge.target === concept.id).map((edge) => edge.source));
      const counts = [0, 0];
      for (const page of namers) counts[stackOf.get(page)!] += 1;
      const expected = namers.size === 0 ? 1 : counts[1] > counts[0] ? 1 : 0;
      if (namers.size > 0 && counts[0] === counts[1]) ties += 1;
      if (expected === 1 && namers.size > 0) towardSecond += 1;
      expect(x(concept.id), concept.id).toBeGreaterThan(pageXs[expected]);
      if (expected === 0) expect(x(concept.id), concept.id).toBeLessThan(firstFileOfStack(1));
    }
    // The draw exercises the tie rule and a majority in the later stack, or the case proves less.
    expect(ties).toBeGreaterThan(0);
    expect(towardSecond).toBeGreaterThan(0);
    // A concept no page names stands in the last stack.
    expect(x("concept:unnamed")).toBeGreaterThan(pageXs[1]);
  });

  it("keeps most of a folded folder's page-to-concept lines inside one stack", () => {
    const folder = foldedFolder();
    const layout = flowLayout(folder, FOLDED_WORLD);
    const { stackOf, pageXs } = stacksOf(layout, folder);
    const conceptStack = (id: string) => (layout.positions.get(id)!.x > pageXs[1] ? 1 : 0);
    const mentions = folder.edges.filter((edge) => edge.relation === "mentions");
    const leaving = mentions.filter((edge) => stackOf.get(edge.source) !== conceptStack(edge.target)).length;
    // With one shared concept column every first-stack line left its stack: about half of them.
    expect(leaving).toBeLessThan(mentions.length / 2);
  });

  it("stands a stack's concepts level with the pages naming them, a row apart", () => {
    const folder = foldedFolder();
    const layout = flowLayout(folder, FOLDED_WORLD);
    const { pageXs } = stacksOf(layout, folder);
    const firstStackConcepts = folder.nodes
      .filter((node) => node.kind === "concept" && layout.positions.get(node.id)!.x < pageXs[1])
      .map((node) => layout.positions.get(node.id)!);
    expect(firstStackConcepts.length).toBeGreaterThan(1);
    const ys = firstStackConcepts.map((point) => point.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i += 1) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(layout.rowGap - 1e-6);
    // One unfolded lane, so every concept is named at rest.
    expect(new Set(firstStackConcepts.map((point) => point.x)).size).toBe(1);
    expect(layout.columns.find((column) => column.kind === "concept")!.grid).toBe(1);
  });

  it("lays the same folded folder the same way whatever order its nodes and edges arrive in", () => {
    const folder = foldedFolder();
    const shuffled = { ...folder, nodes: [...folder.nodes].reverse(), edges: [...folder.edges.filter((_, i) => i % 2 === 1), ...folder.edges.filter((_, i) => i % 2 === 0)].reverse() };
    const one = flowLayout(folder, FOLDED_WORLD);
    const two = flowLayout(shuffled, FOLDED_WORLD);
    expect([...two.positions.entries()].sort()).toEqual([...one.positions.entries()].sort());
    expect(two.columns.map((column) => column.labelRoom)).toEqual(one.columns.map((column) => column.labelRoom));
  });

  it("gives every name place an equal share of the free width, between the minimum and the ceiling", () => {
    const folder = foldedFolder();
    for (const width of [260, 600, 2400]) {
      const layout = flowLayout(folder, { ...FOLDED_WORLD, width });
      const rooms = new Set(layout.columns.map((column) => column.labelRoom * layout.scale));
      expect(rooms.size, `width ${width}`).toBe(1);
      const [roomPx] = [...rooms];
      expect(roomPx, `width ${width}`).toBeGreaterThanOrEqual(FLOW_LABEL_ROOM_MIN_PX - 1e-6);
      expect(roomPx, `width ${width}`).toBeLessThanOrEqual(FLOW_LABEL_ROOM_MAX_PX + 1e-6);
    }
    // A wide box reaches the ceiling and centres the rest; a middling one fills its width.
    const wide = flowLayout(folder, { ...FOLDED_WORLD, width: 2400 });
    expect(wide.columns[1].labelRoom * wide.scale).toBeCloseTo(FLOW_LABEL_ROOM_MAX_PX, 6);
    const middling = flowLayout(folder, { ...FOLDED_WORLD, width: 600 });
    expect(middling.columns[1].labelRoom * middling.scale).toBeLessThan(FLOW_LABEL_ROOM_MAX_PX);
    expect(middling.extent.width * middling.scale).toBeCloseTo(600 * 2, 6);
  });

  it("drops file names, then concept names, before a narrow pane takes a stack's rows under the floor", () => {
    const folder = foldedFolder();
    const room = (layout: FlowLayout, kind: string) => layout.columns.find((column) => column.kind === kind)!.labelRoom;
    const narrow = flowLayout(folder, { ...FOLDED_WORLD, width: 220 });
    expect(room(narrow, "source")).toBe(0);
    expect(room(narrow, "concept")).toBe(room(narrow, "page"));
    expect(room(narrow, "page") * narrow.scale).toBeGreaterThanOrEqual(FLOW_LABEL_ROOM_MIN_PX - 1e-6);
    expect(narrow.rowGap * narrow.scale).toBeGreaterThanOrEqual(FLOW_ROW_MIN_PX - 1e-6);
    const narrower = flowLayout(folder, { ...FOLDED_WORLD, width: 170 });
    expect(room(narrower, "source")).toBe(0);
    expect(room(narrower, "concept")).toBe(0);
    expect(room(narrower, "page") * narrower.scale).toBeGreaterThanOrEqual(FLOW_LABEL_ROOM_MIN_PX - 1e-6);
    expect(narrower.rowGap * narrower.scale).toBeGreaterThanOrEqual(FLOW_ROW_MIN_PX - 1e-6);
  });

  it("lays a single node at the centre", () => {
    const layout = flowLayout(graph({ pages: ["only"] }), BOX);
    expect(layout.positions.get("page:only")).toEqual({ x: 500, y: 300 });
  });

  it("lays an empty folder as an empty picture in the world box", () => {
    const layout = flowLayout(graph({}), BOX);
    expect(layout.positions.size).toBe(0);
    expect(layout.columns).toEqual([]);
    expect(layout.extent).toEqual({ width: 1000, height: 600 });
    expect(layout.scale).toBe(1);
  });
});
