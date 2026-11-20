import { describe, expect, it } from "vitest";

import type { LibraryGraph } from "./build-library-graph";
import { flowLayout, type FlowLayout, type FlowWorld } from "./library-flow-layout";
import {
  BREATH_PX,
  FLOW_FILL,
  FLOW_GRID_STEP,
  FLOW_LABEL_ROOM_MAX_PX,
  FLOW_NAME_ROOM_MIN_PX,
  FLOW_ROW_MAX,
  FLOW_ROW_MIN,
  FLOW_ROW_MIN_PX,
  FLOW_SIDE_PAD,
  FLOW_TOP_PAD,
  NAME_GAP,
  WIDEST_MARK,
} from "./library-flow-measure";
import { STACK_GAP } from "./library-flow-stacks";
import { LIBRARY_ZOOM_MIN, SOURCE_MARK_WORLD_RADIUS } from "./library-graph-view";

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

/** The camera's box whose rows are laid in a `width` × `height` world at `ceiling`, so a test can reason in world units. */
function cameraBox(width: number, height: number, ceiling: number): FlowWorld {
  return { width: (width * ceiling) / FLOW_FILL, height: (height * ceiling) / FLOW_FILL, ceiling };
}

const BOX = cameraBox(1000, 600, 1);
/** A name place's width besides its room at zoom 1: two mark radii, the name gap and a breath. */
const PLACE_BESIDES_ROOM = WIDEST_MARK * 2 + NAME_GAP + BREATH_PX;

/**
 * Sixty pages that fold into two stacks of thirty in `FOLDED_BOX`, each reading its own file
 * and naming two of sixteen concepts by a fixed stride, plus a concept no page names. The
 * strides give concepts named from both stacks, ties included.
 */
function foldedFolder(pageCount = 60): LibraryGraph {
  const pages = Array.from({ length: pageCount }, (_, i) => `p${String(i).padStart(3, "0")}`);
  const sources = Array.from({ length: pageCount }, (_, i) => `s${String(i).padStart(3, "0")}.md`);
  const concepts = [...Array.from({ length: 16 }, (_, i) => `c${String(i).padStart(2, "0")}`), "unnamed"];
  const cites = pages.map((p, i) => [p, sources[i]] as [string, string]);
  const mentions = pages.flatMap((p, i) => [...new Set([(i * 7) % 16, (i * 3 + 5) % 16])].map((c) => [p, concepts[c]] as [string, string]));
  return graph({ sources, pages, concepts, cites, mentions });
}
const FOLDED_BOX = cameraBox(600, 340, 2);

/** Each page's stack, read off the picture: stacks are the page columns from left to right. */
function stacksOf(layout: FlowLayout, folder: LibraryGraph): { stackOf: Map<string, number>; pageXs: number[] } {
  const pageIds = folder.nodes.filter((node) => node.kind === "page").map((node) => node.id);
  const pageXs = [...new Set(pageIds.map((id) => layout.positions.get(id)!.x))].sort((a, b) => a - b);
  return { stackOf: new Map(pageIds.map((id) => [id, pageXs.indexOf(layout.positions.get(id)!.x)])), pageXs };
}

const columnOf = (layout: FlowLayout, kind: string) => layout.columns.find((column) => column.kind === kind)!;
const roomPx = (layout: FlowLayout, kind: string) => columnOf(layout, kind).labelRoom * layout.scale;

/** A small deterministic generator (mulberry32), so the fuzz draws the same folders on every run. */
function seeded(seed: number): (n: number) => number {
  let state = seed >>> 0;
  return (n) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
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
    // No name stands in the gap (files' names stand left of them, pages' right), so it is the 260px cap.
    expect(layout.columns.map((column) => column.x)).toEqual([500 - 260 / 2, 500 + 260 / 2]);
    expect(layout.columns.every((column) => column.named)).toBe(true);
    expect(layout.columns.every((column) => column.lanes === 1)).toBe(true);
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
    const page = columnOf(layout, "page");
    expect(layout.columns.map((column) => column.kind)).toEqual(["source", "page"]);
    expect(page.labelRoom).toBeGreaterThan(layout.columns[0].labelRoom);
    // Out to the picture's edge: everything between the name's start and the side pad.
    expect(page.labelRoom).toBeCloseTo(layout.extent.width - FLOW_SIDE_PAD - (page.x + WIDEST_MARK + NAME_GAP), 6);
    expect(page.labelRoom).toBeGreaterThan(300);
  });

  it("keeps the budgeted room when the concept column does hold rows", () => {
    // Widening here would put a page name across the citations running to the concepts.
    const layout = flowLayout(graph({ sources: ["a.md"], pages: ["a"], concepts: ["x"], cites: [["a", "a.md"]], mentions: [["a", "x"]] }), BOX);
    const page = columnOf(layout, "page");
    expect(page.labelRoom).toBeLessThanOrEqual(FLOW_LABEL_ROOM_MAX_PX / layout.scale);
    expect(columnOf(layout, "concept").labelRoom).toBe(page.labelRoom);
    expect(layout.columns[0].labelRoom).toBe(page.labelRoom);
  });

  it("keeps no name place left of the pages when there are no files to name there", () => {
    const pages = Array.from({ length: 6 }, (_, i) => `page ${i}`);
    const layout = flowLayout(graph({ pages, concepts: ["a", "b", "c"], mentions: pages.map((p, i) => [p, ["a", "b", "c"][i % 3]] as [string, string]) }), { width: 700, height: 500, ceiling: 2 });
    const page = columnOf(layout, "page");
    const concept = columnOf(layout, "concept");
    expect(roomPx(layout, "page")).toBeLessThan(FLOW_LABEL_ROOM_MAX_PX);
    // Two places share the width, the gap holding page names and the room right of the
    // concepts, so the page column stands as near the left edge as the concepts' room ends to the right.
    const left = page.x;
    const right = layout.extent.width - (concept.x + WIDEST_MARK + NAME_GAP + concept.labelRoom);
    expect(left).toBeCloseTo(right, 6);
    expect(left).toBeLessThan(FLOW_SIDE_PAD + concept.labelRoom);
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
    expect(few.columns[0].lanes).toBe(1);
  });

  it("keeps a row for every page while its rows hold the floor on screen, and folds the next one", () => {
    // The rows that fit the camera's height at 18px each, top and bottom pads included.
    const box = cameraBox(600, 340, 2);
    const affordable = Math.floor((box.height / (FLOW_ROW_MIN_PX / FLOW_ROW_MIN) - FLOW_TOP_PAD * 2) / FLOW_ROW_MIN) + 1;
    const pages = (count: number) => Array.from({ length: count }, (_, i) => `p${String(i).padStart(3, "0")}`);
    const longest = flowLayout(graph({ pages: pages(affordable) }), box);
    expect(columnOf(longest, "page").stacks).toBe(1);
    expect(longest.rowGap * longest.scale).toBeGreaterThanOrEqual(FLOW_ROW_MIN_PX - 1e-6);
    // One more page would take a row under the floor, so the column folds into stacks.
    const folded = flowLayout(graph({ pages: pages(affordable + 1) }), box);
    expect(columnOf(folded, "page").stacks).toBe(2);
    expect(FLOW_ROW_MIN * (box.height / (FLOW_ROW_MIN * affordable + FLOW_TOP_PAD * 2))).toBeLessThan(FLOW_ROW_MIN_PX);
  });

  it("folds a file band taller than the box into a grid at the floor gap, and names keep their rows", () => {
    const many = flowLayout(graph({ sources: Array.from({ length: 300 }, (_, i) => `s${i}.md`) }), FOLDED_BOX);
    const column = many.columns[0];
    // 41 rows are affordable at 18px each in this box, so 300 files are 8 sub-columns of 38.
    expect(column.lanes).toBe(8);
    expect(many.rowGap).toBe(FLOW_ROW_MIN);
    expect(many.rowGap * many.scale).toBeGreaterThanOrEqual(FLOW_ROW_MIN_PX);
    const ys = new Set(column.ids.map((id) => many.positions.get(id)!.y));
    expect(ys.size).toBe(38);
    const xs = [...new Set(column.ids.map((id) => many.positions.get(id)!.x))].sort((a, b) => a - b);
    expect(xs.length).toBe(8);
    expect(xs[1] - xs[0]).toBe(FLOW_GRID_STEP);
    // The grid is centred on the column's own x.
    expect(xs.reduce((sum, x) => sum + x, 0) / xs.length).toBeCloseTo(column.x, 6);
  });

  it("grows taller than the box for a long page column, keeping the aspect and the gap's on-screen cap", () => {
    const pages = Array.from({ length: 30 }, (_, i) => `p${String(i).padStart(2, "0")}`);
    const long = flowLayout(graph({ sources: ["a.md"], pages, cites: [["p00", "a.md"]] }), FOLDED_BOX);
    const page = columnOf(long, "page");
    expect(page.lanes).toBe(1);
    expect(long.rowGap).toBe(FLOW_ROW_MIN);
    const height = FLOW_ROW_MIN * 29 + FLOW_TOP_PAD * 2;
    expect(long.extent.height).toBe(height);
    expect(long.extent.width).toBeCloseTo(600 * (height / 340), 6);
    // The camera fits this at its box's height over the picture's; the two columns stand the
    // 260px gap cap apart on screen, centred, as no name stands between them.
    const scale = FOLDED_BOX.height / height;
    expect(long.scale).toBeCloseTo(scale, 6);
    expect(long.columns[1].x - long.columns[0].x).toBeCloseTo(260 / scale, 6);
    expect((long.columns[0].x + long.columns[1].x) / 2).toBeCloseTo(long.extent.width / 2, 6);
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
    expect(columnOf(layout, "page").ids).toEqual(["page:beta", "page:delta", "page:alpha", "page:gamma"]);
    const y = (id: string) => layout.positions.get(id)!.y;
    expect(y("concept:payments")).toBe((y("page:beta") + y("page:delta")) / 2);
    expect(y("concept:refunds")).toBe((y("page:alpha") + y("page:gamma")) / 2);
  });

  it("keeps a crowded column inside the picture: a lane pushed down past the last row climbs back up", () => {
    /*
     * One overview page names sixteen concepts nothing else names, and their titles rank last,
     * so it stands on its stack's last row and they all want that row.
     */
    const crowded = (pageCount: number): LibraryGraph => {
      const pages = Array.from({ length: pageCount }, (_, i) => `p${String(i).padStart(2, "0")}`);
      const concepts = [...Array.from({ length: 16 }, (_, i) => `zz${i}`), "single", ...Array.from({ length: 6 }, (_, i) => `shared${i}`)];
      const mentions: Array<[string, string]> = [
        ...Array.from({ length: 16 }, (_, i) => ["p29", `zz${i}`] as [string, string]),
        ["p28", "single"],
        ...pages.filter((p) => p !== "p29" && p !== "p28").map((p, i) => [p, `shared${i % 6}`] as [string, string]),
      ];
      return graph({ sources: pages.map((p) => `${p}.md`), pages, concepts, cites: pages.map((p) => [p, `${p}.md`] as [string, string]), mentions });
    };
    for (const [folder, box, stacks] of [[crowded(30), { width: 972, height: 732, ceiling: 2 }, 1], [crowded(60), FOLDED_BOX, 2]] as const) {
      const layout = flowLayout(folder, box);
      expect(columnOf(layout, "page").stacks).toBe(stacks);
      const pageYs = columnOf(layout, "page").ids.map((id) => layout.positions.get(id)!.y);
      const lowest = Math.max(...pageYs);
      for (const id of columnOf(layout, "concept").ids) {
        expect(layout.positions.get(id)!.y, id).toBeLessThanOrEqual(lowest + 1e-6);
        expect(layout.positions.get(id)!.y, id).toBeGreaterThanOrEqual(Math.min(...pageYs) - 1e-6);
      }
      // A row apart within each lane.
      const lanes = Map.groupBy(columnOf(layout, "concept").ids.map((id) => layout.positions.get(id)!), (point) => point.x);
      for (const lane of lanes.values()) {
        const ys = lane.map((point) => point.y).sort((a, b) => a - b);
        for (let i = 1; i < ys.length; i += 1) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(layout.rowGap - 1e-6);
      }
    }
  });

  it("gives a narrow pane's names no room rather than a zoom the camera cannot show whole", () => {
    const pages = Array.from({ length: 6 }, (_, i) => `page ${i}`);
    const folder = graph({
      sources: pages.map((p) => `${p}.md`),
      pages,
      concepts: ["a", "b", "c"],
      cites: pages.map((p) => [p, `${p}.md`] as [string, string]),
      mentions: pages.map((p, i) => [p, ["a", "b", "c"][i % 3]] as [string, string]),
    });
    for (const width of [162, 172, 182]) {
      const layout = flowLayout(folder, { width, height: 552, ceiling: 2 });
      expect(layout.scale, `width ${width}`).toBeGreaterThan(LIBRARY_ZOOM_MIN);
      expect(layout.extent.width * layout.scale, `width ${width}`).toBeLessThanOrEqual(width + 1e-6);
      expect(layout.columns.every((column) => !column.named && column.labelRoom === 0), `width ${width}`).toBe(true);
    }
  });

  it("stands folded pages in stacks, each with the files its pages read directly to its left", () => {
    const pages = Array.from({ length: 60 }, (_, i) => `p${String(i).padStart(2, "0")}`);
    const sources = Array.from({ length: 120 }, (_, i) => `s${String(i).padStart(3, "0")}.md`);
    // Page i reads files 2i and 2i+1; the pages fold into two stacks of thirty here.
    const cites: Array<[string, string]> = pages.flatMap((p, i) => [[p, sources[2 * i]], [p, sources[2 * i + 1]]] as Array<[string, string]>);
    const layout = flowLayout(graph({ sources, pages, cites }), FOLDED_BOX);
    const page = columnOf(layout, "page");
    expect(page.stacks).toBe(2);
    const x = (id: string) => layout.positions.get(id)!.x;
    const firstStackPages = page.ids.slice(0, 30);
    const secondStackPages = page.ids.slice(30);
    const stackPageX = [x(firstStackPages[0]), x(secondStackPages[0])];
    expect(stackPageX[1]).toBeGreaterThan(stackPageX[0]);
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
  });

  it("gives each concept to the stack holding most of the pages naming it, the earlier on a tie, in three stacks too", () => {
    for (const [pageCount, stacks] of [[60, 2], [100, 3]] as const) {
      const folder = foldedFolder(pageCount);
      const layout = flowLayout(folder, FOLDED_BOX);
      const { stackOf, pageXs } = stacksOf(layout, folder);
      expect(pageXs).toHaveLength(stacks);
      const x = (id: string) => layout.positions.get(id)!.x;
      const stackOfConcept = (id: string) => pageXs.filter((pageX) => pageX < x(id)).length - 1;
      let ties = 0;
      let towardLater = 0;
      for (const concept of folder.nodes.filter((node) => node.kind === "concept")) {
        const namers = new Set(folder.edges.filter((edge) => edge.target === concept.id).map((edge) => edge.source));
        const counts = Array.from({ length: stacks }, () => 0);
        for (const page of namers) counts[stackOf.get(page)!] += 1;
        const most = Math.max(...counts);
        const expected = namers.size === 0 ? stacks - 1 : counts.indexOf(most);
        if (namers.size > 0 && counts.filter((count) => count === most).length > 1) ties += 1;
        if (expected > 0 && namers.size > 0) towardLater += 1;
        expect(stackOfConcept(concept.id), `${concept.id} in ${stacks} stacks`).toBe(expected);
      }
      // The draw exercises the tie rule and a majority in a later stack, or the case proves less.
      expect(ties).toBeGreaterThan(0);
      expect(towardLater).toBeGreaterThan(0);
    }
  });

  it("keeps most of a folded folder's page-to-concept lines inside one stack", () => {
    const folder = foldedFolder();
    const layout = flowLayout(folder, FOLDED_BOX);
    const { stackOf, pageXs } = stacksOf(layout, folder);
    const conceptStack = (id: string) => (layout.positions.get(id)!.x > pageXs[1] ? 1 : 0);
    const mentions = folder.edges.filter((edge) => edge.relation === "mentions");
    const leaving = mentions.filter((edge) => stackOf.get(edge.source) !== conceptStack(edge.target)).length;
    expect(leaving).toBeLessThan(mentions.length / 4);
  });

  it("stands a stack's concept at the mean row of its own stack's pages naming it", () => {
    // Six concepts each named by five consecutive pages: no two want rows closer than the gap.
    const pages = Array.from({ length: 60 }, (_, i) => `p${String(i).padStart(2, "0")}`);
    const concepts = Array.from({ length: 12 }, (_, i) => `c${String(i).padStart(2, "0")}`);
    const mentions = pages.map((p, i) => [p, concepts[Math.floor(i / 5)]] as [string, string]);
    const folder = graph({ pages, concepts, sources: pages.map((p) => `${p}.md`), cites: pages.map((p) => [p, `${p}.md`] as [string, string]), mentions });
    const layout = flowLayout(folder, FOLDED_BOX);
    expect(columnOf(layout, "page").stacks).toBe(2);
    expect(columnOf(layout, "concept").lanes).toBe(1);
    for (const concept of concepts) {
      const namers = mentions.filter(([, c]) => c === concept).map(([p]) => layout.positions.get(`page:${p}`)!.y);
      expect(layout.positions.get(`concept:${concept}`)!.y, concept).toBeCloseTo(namers.reduce((sum, y) => sum + y, 0) / namers.length, 6);
    }
  });

  it("lays the same folded folder the same way, to the bit, whatever order its nodes and edges arrive in", () => {
    const folder = foldedFolder();
    const shuffled = { ...folder, nodes: [...folder.nodes].reverse(), edges: [...folder.edges.filter((_, i) => i % 2 === 1), ...folder.edges.filter((_, i) => i % 2 === 0)].reverse() };
    const one = flowLayout(folder, FOLDED_BOX);
    const two = flowLayout(shuffled, FOLDED_BOX);
    expect([...two.positions.entries()].sort()).toEqual([...one.positions.entries()].sort());
    expect(two.columns.map((column) => [column.labelRoom, column.named])).toEqual(one.columns.map((column) => [column.labelRoom, column.named]));
  });

  it("lays random folders to the same bits whichever order their edges arrive in", () => {
    const draw = seeded(7);
    for (let trial = 0; trial < 120; trial += 1) {
      const pageCount = 2 + draw(30);
      const pages = Array.from({ length: pageCount }, (_, i) => `p${i}`);
      const sources = Array.from({ length: draw(pageCount * 2 + 1) }, (_, i) => `s${i}.md`);
      const concepts = Array.from({ length: 1 + draw(12) }, (_, i) => `c${i}`);
      const cites: Array<[string, string]> = [];
      for (const s of sources) for (let k = 0; k < 1 + draw(3); k += 1) cites.push([pages[draw(pageCount)], s]);
      const mentions: Array<[string, string]> = [];
      for (const c of concepts) for (let k = 0; k < 1 + draw(6); k += 1) mentions.push([pages[draw(pageCount)], c]);
      const folder = graph({ sources, pages, concepts, cites, mentions });
      // Off-grid heights, so neighbour means are sums of inexact values.
      const box = { width: 300 + draw(1200), height: 200 + draw(700) + 0.37, ceiling: 2 };
      const one = flowLayout(folder, box);
      const two = flowLayout({ ...folder, edges: [...folder.edges].reverse() }, box);
      expect([...two.positions.entries()].sort(), `trial ${trial}`).toEqual([...one.positions.entries()].sort());
    }
  });

  it("reserves each stack's name rooms in the picture itself, the published room wide", () => {
    const folder = foldedFolder();
    for (const width of [500, 600, 2400]) {
      const box = cameraBox(width, 340, 2);
      const layout = flowLayout(folder, box);
      const { pageXs } = stacksOf(layout, folder);
      const breath = BREATH_PX / layout.scale;
      const page = columnOf(layout, "page");
      const concept = columnOf(layout, "concept");
      const firstConceptX = Math.min(...concept.ids.map((id) => layout.positions.get(id)!.x).filter((x) => x > pageXs[0]));
      // Page mark, its name and a breath, the stack gap, then the concept mark.
      expect(firstConceptX - pageXs[0], `width ${width}`).toBeCloseTo(WIDEST_MARK * 2 + breath + NAME_GAP + page.labelRoom + STACK_GAP, 6);
      expect(concept.labelRoom).toBe(page.labelRoom);
      expect(page.labelRoom * layout.scale, `width ${width}`).toBeGreaterThanOrEqual(FLOW_NAME_ROOM_MIN_PX - 1e-6);
      expect(page.labelRoom * layout.scale, `width ${width}`).toBeLessThanOrEqual(FLOW_LABEL_ROOM_MAX_PX + 1e-6);
    }
    // A wide box gives every place the ceiling and centres the rest; a middling one fills the camera's width.
    const wide = flowLayout(folder, cameraBox(2400, 340, 2));
    expect(roomPx(wide, "page")).toBeCloseTo(FLOW_LABEL_ROOM_MAX_PX, 6);
    const middlingBox = cameraBox(500, 340, 2);
    const middling = flowLayout(folder, middlingBox);
    expect(roomPx(middling, "page")).toBeLessThan(FLOW_LABEL_ROOM_MAX_PX);
    expect(middling.extent.width * middling.scale).toBeCloseTo(middlingBox.width, 6);
  });

  it("names pages, then concepts too, then files too, each only while every named kind keeps 96px", () => {
    const namedIn = (folder: LibraryGraph, box: FlowWorld) => {
      const layout = flowLayout(folder, box);
      const named = layout.columns.filter((column) => column.named);
      for (const column of named) expect(column.labelRoom * layout.scale, `${column.kind} in ${box.width}`).toBeGreaterThanOrEqual(FLOW_NAME_ROOM_MIN_PX - 1e-6);
      if (named.length > 0) expect(layout.rowGap * layout.scale, `rows in ${box.width}`).toBeGreaterThanOrEqual(FLOW_ROW_MIN_PX - 1e-6);
      return named.map((column) => column.kind).sort();
    };
    // Stacks: each step down the ladder hands its width to the kinds before it.
    const folded = foldedFolder();
    expect(namedIn(folded, cameraBox(160, 340, 2))).toEqual([]);
    expect(namedIn(folded, cameraBox(200, 340, 2))).toEqual(["page"]);
    expect(namedIn(folded, cameraBox(300, 340, 2))).toEqual(["concept", "page"]);
    expect(namedIn(folded, cameraBox(400, 340, 2))).toEqual(["concept", "page", "source"]);
    // One unfolded flow, the same ladder.
    const sources = ["2026-01-12-report.md", "2026-01-13-report.md", "2026-01-14-report.md"];
    const band = graph({
      sources,
      pages: ["one", "two", "three"],
      concepts: ["Payments", "Refunds"],
      cites: [["one", sources[0]], ["two", sources[1]], ["three", sources[2]]],
      mentions: [["one", "Payments"], ["two", "Refunds"], ["three", "Refunds"]],
    });
    expect(namedIn(band, cameraBox(120, 200, 2))).toEqual([]);
    expect(namedIn(band, cameraBox(160, 200, 2))).toEqual(["page"]);
    expect(namedIn(band, cameraBox(200, 200, 2))).toEqual(["concept", "page"]);
    expect(namedIn(band, cameraBox(240, 200, 2))).toEqual(["concept", "page", "source"]);
  });

  it("gives a stack's folded concept lanes no name room, and that width to the pages", () => {
    const pages = Array.from({ length: 60 }, (_, i) => `p${String(i).padStart(2, "0")}`);
    const concepts = Array.from({ length: 80 }, (_, i) => `c${String(i).padStart(2, "0")}`);
    // Eighty concepts named from the first stack's pages: more than its thirty rows.
    const mentions = concepts.map((c, i) => [pages[Math.floor((i * 30) / 80)], c] as [string, string]);
    const folder = graph({ sources: pages.map((p) => `${p}.md`), pages, concepts, cites: pages.map((p) => [p, `${p}.md`] as [string, string]), mentions });
    const layout = flowLayout(folder, { width: 960, height: 580, ceiling: 2 });
    const concept = columnOf(layout, "concept");
    expect(concept.lanes).toBeGreaterThan(1);
    expect(concept.named).toBe(false);
    expect(concept.labelRoom).toBe(0);
    // Lanes stand mark to mark with a breath between, no room for a name nothing draws.
    const laneXs = [...new Set(concept.ids.map((id) => layout.positions.get(id)!.x))].sort((a, b) => a - b);
    expect(laneXs[1] - laneXs[0]).toBeCloseTo(WIDEST_MARK * 2 + BREATH_PX / layout.scale, 6);
    expect(roomPx(layout, "page")).toBeCloseTo(FLOW_LABEL_ROOM_MAX_PX, 6);
  });

  it("keeps no name room in a gap no name stands in", () => {
    // Files and pages, no concepts: file names stand left, page names right, so the free width
    // goes to those two rooms; the gap between the columns is narrower than one of them.
    const sources = ["2026-01-12-report.md", "2026-01-13-report.md"];
    const folder = graph({ sources, pages: ["one", "two"], cites: [["one", sources[0]], ["two", sources[1]]] });
    const layout = flowLayout(folder, cameraBox(300, 200, 2));
    const source = columnOf(layout, "source");
    expect(source.named).toBe(true);
    expect(columnOf(layout, "page").named).toBe(true);
    expect(source.labelRoom * layout.scale).toBeLessThan(FLOW_LABEL_ROOM_MAX_PX);
    expect(columnOf(layout, "page").x - source.x).toBeLessThan(source.labelRoom);
  });

  it("lays the stack count that names most before the one that gives a page name more room", () => {
    // Forty pages in title order; pages 12 to 15 read six files each. Two stacks of twenty put
    // all twenty-four files in the first, a folded band, and give pages 240px; three stacks
    // of fourteen split them twelve and twelve, so files are named too, at less page room.
    const pages = Array.from({ length: 40 }, (_, i) => `p${String(i).padStart(2, "0")}`);
    const sources = Array.from({ length: 24 }, (_, i) => `s${String(i).padStart(2, "0")}.md`);
    const folder = graph({ pages, sources, cites: sources.map((s, i) => [pages[12 + Math.floor(i / 6)], s] as [string, string]) });
    const layout = flowLayout(folder, { width: 1000, height: 400, ceiling: 2 });
    expect(columnOf(layout, "page").stacks).toBe(3);
    expect(columnOf(layout, "source").named).toBe(true);
    expect(roomPx(layout, "page")).toBeLessThan(FLOW_LABEL_ROOM_MAX_PX);
    expect(layout.rowGap * layout.scale).toBeGreaterThanOrEqual(FLOW_ROW_MIN_PX - 1e-6);
  });

  it("never takes a stack's rows under the floor to buy a name", () => {
    const folder = foldedFolder();
    // At 500 wide, three stacks could name their pages only by shrinking rows under 18px, so
    // none is named, and four stacks name no more; at 400 not even that would give 96px.
    for (const width of [400, 500]) {
      const layout = flowLayout(folder, { width, height: 400, ceiling: 2 });
      expect(columnOf(layout, "page").stacks, `width ${width}`).toBe(3);
      expect(layout.columns.some((column) => column.named), `width ${width}`).toBe(false);
      expect(layout.rowGap * layout.scale, `width ${width}`).toBeGreaterThanOrEqual(FLOW_ROW_MIN_PX - 1e-6);
    }
  });

  it("lays the fewest stacks with nothing named when no count can name a page, and fewer when even those overflow", () => {
    const folder = foldedFolder();
    const fewestFor = (height: number) => Math.ceil(60 / (Math.floor((height / (FLOW_ROW_MIN_PX / FLOW_ROW_MIN) - FLOW_TOP_PAD * 2) / FLOW_ROW_MIN) + 1));
    const box = { width: 240, height: 400, ceiling: 2 };
    const layout = flowLayout(folder, box);
    expect(fewestFor(box.height)).toBe(3);
    expect(columnOf(layout, "page").stacks).toBe(3);
    expect(layout.columns.every((column) => !column.named && column.labelRoom === 0)).toBe(true);
    // Narrower, three unnamed stacks do not fit at the zoom floor; two taller ones do.
    const narrow = { width: 160, height: 400, ceiling: 2 };
    const fewer = flowLayout(folder, narrow);
    expect(columnOf(fewer, "page").stacks).toBe(2);
    expect(fewer.scale).toBeGreaterThan(LIBRARY_ZOOM_MIN);
    expect(fewer.extent.width * fewer.scale).toBeLessThanOrEqual(narrow.width + 1e-6);
  });

  it("keeps every mark inside the laid box and the laid box inside the camera's, across random folders", () => {
    const draw = seeded(20261120);
    const boxes = [
      { width: 262, height: 652, ceiling: 2 },
      { width: 728, height: 479, ceiling: 2 },
      { width: 960, height: 580, ceiling: 2 },
      { width: 1368, height: 779, ceiling: 3.6 },
      { width: 500, height: 300, ceiling: 2 },
    ];
    for (let trial = 0; trial < 300; trial += 1) {
      const pageCount = 1 + draw(trial % 2 === 0 ? 24 : 220);
      const pages = Array.from({ length: pageCount }, (_, i) => `p${i}`);
      const sources = Array.from({ length: draw(pageCount * 2 + 1) }, (_, i) => `s${i}.md`);
      const concepts = Array.from({ length: draw(60) }, (_, i) => `c${i}`);
      const cites = sources.flatMap((s) => (draw(5) === 0 ? [] : [[pages[draw(pageCount)], s] as [string, string]]));
      const mentions = concepts.flatMap((c) => Array.from({ length: draw(4) }, () => [pages[draw(pageCount)], c] as [string, string]));
      // An overview page that names many concepts, now and then.
      if (concepts.length > 0 && draw(3) === 0) for (const c of concepts.slice(0, 1 + draw(concepts.length))) mentions.push([pages[draw(pageCount)], c]);
      const box = boxes[trial % boxes.length];
      const layout = flowLayout(graph({ sources, pages, concepts, cites, mentions }), box);
      const label = `trial ${trial}: ${pageCount} pages, ${sources.length} files, ${concepts.length} concepts in ${box.width}x${box.height}`;
      for (const [id, point] of layout.positions) {
        expect(point.x, `${label}: ${id}`).toBeGreaterThanOrEqual(-1e-6);
        expect(point.x, `${label}: ${id}`).toBeLessThanOrEqual(layout.extent.width + 1e-6);
        expect(point.y, `${label}: ${id}`).toBeGreaterThanOrEqual(-1e-6);
        expect(point.y, `${label}: ${id}`).toBeLessThanOrEqual(layout.extent.height + 1e-6);
      }
      expect(layout.extent.width * layout.scale, label).toBeLessThanOrEqual(box.width + 1e-6);
      expect(layout.extent.height * layout.scale, label).toBeLessThanOrEqual(box.height + 1e-6);
      // Names: no kind without every kind before it (pages, concepts, files), each at 96px, rows at the floor.
      const named = (kind: string) => layout.columns.find((column) => column.kind === kind)?.named;
      if (named("concept")) expect(named("page"), `${label}: concepts named without pages`).not.toBe(false);
      if (named("source")) expect([named("page"), named("concept")], `${label}: files named before pages and concepts`).not.toContain(false);
      for (const column of layout.columns.filter((candidate) => candidate.named)) {
        expect(column.labelRoom * layout.scale, `${label}: ${column.kind} room`).toBeGreaterThanOrEqual(FLOW_NAME_ROOM_MIN_PX - 1e-6);
        expect(layout.rowGap * layout.scale, `${label}: rows under names`).toBeGreaterThanOrEqual(FLOW_ROW_MIN_PX - 1e-6);
      }
    }
  });

  it("lays a single node at the centre", () => {
    const layout = flowLayout(graph({ pages: ["only"] }), BOX);
    expect(layout.positions.get("page:only")).toEqual({ x: 500, y: 300 });
  });

  it("lays an empty folder as an empty picture in the world box", () => {
    const layout = flowLayout(graph({}), BOX);
    expect(layout.positions.size).toBe(0);
    expect(layout.columns).toEqual([]);
    expect(layout.extent.width).toBeCloseTo(1000, 6);
    expect(layout.extent.height).toBeCloseTo(600, 6);
    expect(layout.scale).toBe(1);
  });

  it("names a file band's marks in the room its source radius leaves", () => {
    // The band's own x is its squares' centre, the file names left of it.
    const layout = flowLayout(graph({ sources: ["a.md"], pages: ["a"], cites: [["a", "a.md"]] }), BOX);
    const source = columnOf(layout, "source");
    expect(source.x - SOURCE_MARK_WORLD_RADIUS).toBeGreaterThan(FLOW_SIDE_PAD + source.labelRoom);
  });
});
