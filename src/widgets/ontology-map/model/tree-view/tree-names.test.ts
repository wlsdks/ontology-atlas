import { describe, expect, it } from "vitest";
import { placeTreeNames, treeNameCandidates } from "./tree-names";
import type {
  TreeDrawList,
  TreeDrawMark,
  TreeFocus,
  TreeModel,
  TreeNameBox,
  TreeNameCandidate,
  TreeNamePlacement,
  TreeNameSide,
  TreeNameSizes,
  TreeNodeKind,
  TreeRect,
} from "./types";
import { TREE_ARC_BUDGET } from "./types";

const SIZES: TreeNameSizes = {
  project: 24,
  domain: 20,
  domainSub: 12,
  capability: 13,
  element: 11,
  gap: 4,
  pad: 3,
  leading: 1.5,
};
const CHAR_PX = 7;
const measure = (text: string) => text.length * CHAR_PX;
const noSub = () => null;
const WIDE: TreeRect = { x: 0, y: 0, width: 2000, height: 2000 };

interface NodeSpec {
  kind: TreeNodeKind;
  parent: number;
  id?: string | null;
  label?: string;
}

/** Specs in preorder; `needs` are directed [from, to] pairs. */
function modelOf(specs: NodeSpec[], needs: [number, number][] = []): TreeModel {
  const count = specs.length;
  const parent = Int32Array.from(specs, (s) => s.parent);
  const subtreeEnd = Int32Array.from(specs, (_, i) => i + 1);
  const concepts = Int32Array.from(specs, (s) => (s.kind === "fork" ? 0 : 1));
  const capabilities = Int32Array.from(specs, (s) => (s.kind === "capability" ? 1 : 0));
  const elements = Int32Array.from(specs, (s) => (s.kind === "element" ? 1 : 0));
  for (let i = count - 1; i > 0; i -= 1) {
    const p = parent[i]!;
    subtreeEnd[p] = Math.max(subtreeEnd[p]!, subtreeEnd[i]!);
    concepts[p]! += concepts[i]!;
    capabilities[p]! += capabilities[i]!;
    elements[p]! += elements[i]!;
  }
  const ids = specs.map((s, i) => (s.id === undefined ? (s.kind === "fork" ? null : `n${i}`) : s.id));
  const indexOf = new Map<string, number>();
  ids.forEach((id, i) => id !== null && indexOf.set(id, i));
  return {
    count,
    ids,
    labels: specs.map((s, i) => s.label ?? (s.kind === "fork" ? "" : `name ${i}`)),
    kinds: specs.map((s) => s.kind),
    parent,
    subtreeEnd,
    concepts,
    capabilities,
    elements,
    indexOf,
    ...csr(count, needs),
    looseRoot: -1,
  };
}

function csr(count: number, needs: [number, number][]) {
  const lists = (pairs: [number, number][]) => {
    const start = new Int32Array(count + 1);
    for (const [from] of pairs) start[from + 1]! += 1;
    for (let i = 0; i < count; i += 1) start[i + 1]! += start[i]!;
    const fill = start.slice();
    const to = new Int32Array(pairs.length);
    for (const [from, target] of pairs) to[fill[from]!++] = target;
    return [start, to] as const;
  };
  const [needsStart, needsList] = lists(needs);
  const [usedByStart, usedBy] = lists(needs.map(([a, b]) => [b, a]));
  return { needsStart, needs: needsList, usedByStart, usedBy };
}

function mark(node: number, x: number, y: number, radius = 4, closed = false): TreeDrawMark {
  return { node, x, y, radius, scale: 1, depth: 0, tone: 0, closed };
}

/** Marks are given far to near; depth falls with the index. */
function listOf(marks: TreeDrawMark[]): TreeDrawList {
  marks.forEach((m, i) => (m.depth = marks.length - i));
  return { marks, count: marks.length, visited: marks.length, folded: 0 };
}

function focusOn(node: number, needs: number[] = [], usedBy: number[] = []): TreeFocus {
  return { node, selected: true, needs, usedBy, path: [] };
}

function emptyPlacement(): TreeNamePlacement {
  return { boxes: [], count: 0, dropped: 0, tested: 0 };
}

function candidatesOf(
  list: TreeDrawList,
  model: TreeModel,
  focus: TreeFocus | null = null,
  subOf: (node: number) => string | null = noSub,
  elementNamePitchPx = 0,
): TreeNameCandidate[] {
  const out: TreeNameCandidate[] = [];
  const n = treeNameCandidates(list, model, focus, measure, subOf, SIZES, elementNamePitchPx, out);
  return out.slice(0, n);
}

function place(
  list: TreeDrawList,
  candidates: TreeNameCandidate[],
  free: TreeRect = WIDE,
  keep: ReadonlyMap<number, TreeNameSide> | null = null,
  out: TreeNamePlacement = emptyPlacement(),
): TreeNamePlacement {
  placeTreeNames(candidates, candidates.length, list, free, keep, out, SIZES);
  return out;
}

function placedNodes(out: TreeNamePlacement): number[] {
  return out.boxes.slice(0, out.count).map((box) => box.node);
}

function boxesOverlap(a: TreeNameBox, b: TreeNameBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function boxMeetsCircle(box: TreeNameBox, x: number, y: number, r: number): boolean {
  const dx = x - Math.min(Math.max(x, box.x), box.x + box.width);
  const dy = y - Math.min(Math.max(y, box.y), box.y + box.height);
  return dx * dx + dy * dy < r * r;
}

/** One trunk and one domain holding `capabilities` capabilities, each with `elements` elements. */
function crown(capabilities: number, elements: number): NodeSpec[] {
  const specs: NodeSpec[] = [{ kind: "project", parent: -1 }, { kind: "domain", parent: 0 }];
  for (let c = 0; c < capabilities; c += 1) {
    const at = specs.length;
    specs.push({ kind: "capability", parent: 1, label: `capability number ${c}` });
    for (let e = 0; e < elements; e += 1) specs.push({ kind: "element", parent: at });
  }
  return specs;
}

/** A k x k lattice of capability marks `stepPx` apart, all under one domain. */
function lattice(k: number, stepPx: number, originX = 0, originY = 0) {
  const model = modelOf(crown(k * k, 0));
  const marks: TreeDrawMark[] = [];
  for (let i = 0; i < k * k; i += 1) {
    const x = originX + (i % k) * stepPx + stepPx / 2;
    marks.push(mark(2 + i, x, originY + Math.floor(i / k) * stepPx + stepPx / 2, 5));
  }
  const free: TreeRect = { x: originX, y: originY, width: k * stepPx, height: k * stepPx };
  return { model, list: listOf(marks), free };
}

describe("treeNameCandidates", () => {
  it("names the trunk like a domain block only when it has an id", () => {
    const specs: NodeSpec[] = [
      { kind: "project", parent: -1 },
      { kind: "fork", parent: 0 },
      { kind: "domain", parent: 1 },
    ];
    const list = listOf([mark(0, 100, 100), mark(1, 100, 60), mark(2, 140, 40)]);
    const subOf = (node: number) => (node === 0 ? "concepts 2" : null);
    const named = candidatesOf(list, modelOf(specs), null, subOf);
    expect(named.map((c) => [c.node, c.sub])).toEqual([
      [2, null],
      [0, "concepts 2"],
    ]);
    specs[0] = { kind: "project", parent: -1, id: null };
    expect(candidatesOf(list, modelOf(specs)).map((c) => c.node)).toEqual([2]);
  });

  it("offers element names only where the leaves are at least the name spacing apart", () => {
    const model = modelOf(crown(1, 3));
    const list = listOf([mark(3, 100, 100), mark(4, 110, 100), mark(5, 160, 100)]);
    expect(candidatesOf(list, model, null, noSub, 30).map((c) => c.node)).toEqual([5]);
    expect(candidatesOf(list, model, null, noSub, 60).map((c) => c.node)).toEqual([]);
  });

  it("offers a labelled fork as the loose shoot and never an unlabelled fork", () => {
    const model = modelOf([
      { kind: "project", parent: -1, id: null },
      { kind: "fork", parent: 0, label: "not in a domain" },
      { kind: "fork", parent: 0 },
    ]);
    const list = listOf([mark(1, 100, 100), mark(2, 300, 100)]);
    expect(candidatesOf(list, model).map((c) => c.node)).toEqual([1]);
  });

  it("sizes a name block by its font, with a sub line only when there is one", () => {
    const model = modelOf([{ kind: "project", parent: -1 }, { kind: "domain", parent: 0 }]);
    const list = listOf([mark(0, 100, 300), mark(1, 100, 100)]);
    const subOf = (node: number) => (node === 0 ? "domains 1" : null);
    const heights = candidatesOf(list, model, null, subOf).map((c) => [c.node, c.height]);
    expect(heights).toEqual([
      [1, SIZES.domain * SIZES.leading],
      [0, (SIZES.project + SIZES.domainSub) * SIZES.leading],
    ]);
  });

  it("orders capabilities of equal element count by id", () => {
    const model = modelOf([
      { kind: "project", parent: -1, id: null },
      { kind: "domain", parent: 0, label: "" },
      { kind: "capability", parent: 1, id: "b" },
      { kind: "capability", parent: 1, id: "a" },
    ]);
    const list = listOf([mark(3, 100, 100), mark(2, 300, 100)]);
    expect(candidatesOf(list, model).map((c) => c.node)).toEqual([3, 2]);
  });

  it("pins the closed mark that holds a folded arc end", () => {
    const model = modelOf(crown(2, 1), [[2, 5]]);
    const list = listOf([mark(1, 50, 50), mark(2, 100, 100), mark(4, 200, 100, 4, true)]);
    const named = candidatesOf(list, model, focusOn(2, [5]));
    expect(named.filter((c) => c.pinned).map((c) => c.node).sort()).toEqual([2, 4]);
  });

  it("pins the concepts that depend on the focus", () => {
    const model = modelOf(crown(3, 0));
    const list = listOf([mark(2, 100, 100), mark(3, 200, 100), mark(4, 300, 100)]);
    const named = candidatesOf(list, model, focusOn(2, [], [4]));
    expect(named.filter((c) => c.pinned).map((c) => c.node).sort()).toEqual([2, 4]);
  });

  it("pins no arc end past the arc budget, taking needs before used-by", () => {
    const model = modelOf(crown(TREE_ARC_BUDGET + 3, 0));
    const nodes = Array.from({ length: TREE_ARC_BUDGET + 3 }, (_, i) => 2 + i);
    const list = listOf(nodes.map((node, i) => mark(node, (i % 10) * 200, Math.floor(i / 10) * 100)));
    const needs = nodes.slice(1, TREE_ARC_BUDGET + 2);
    const usedBy = nodes.slice(TREE_ARC_BUDGET + 2);
    const named = candidatesOf(list, model, focusOn(nodes[0]!, needs, usedBy));
    const pinned = named.filter((c) => c.pinned).map((c) => c.node);
    expect(pinned.sort((a, b) => a - b)).toEqual(nodes.slice(0, TREE_ARC_BUDGET + 1));
  });
});

describe("placeTreeNames", () => {
  it("places no name over a mark or another name, and keeps every name inside the free area", () => {
    const { model, list, free } = lattice(12, 40);
    const out = place(list, candidatesOf(list, model), free);
    expect(out.count).toBeGreaterThan(10);
    expect(out.dropped).toBeGreaterThan(10);
    const boxes = out.boxes.slice(0, out.count);
    for (const [i, box] of boxes.entries()) {
      expect(box.x >= free.x && box.y >= free.y).toBe(true);
      expect(box.x + box.width <= free.width && box.y + box.height <= free.height).toBe(true);
      for (const m of list.marks) {
        if (m.node !== box.node) expect(boxMeetsCircle(box, m.x, m.y, m.radius + SIZES.pad)).toBe(false);
      }
      for (const other of boxes.slice(i + 1)) expect(boxesOverlap(box, other)).toBe(false);
    }
  });

  // Both marks sit at one point and the names are too wide for above or below, so only one fits, on the right.
  it("places a domain name before a capability name that competes for the same place", () => {
    const model = modelOf([
      { kind: "project", parent: -1, id: null },
      { kind: "domain", parent: 0, label: "the domain name here" },
      { kind: "capability", parent: 1, label: "the capability name here" },
      { kind: "element", parent: 2 },
    ]);
    const list = listOf([mark(0, 600, 600), mark(1, 20, 30), mark(2, 20, 30)]);
    const free: TreeRect = { x: 0, y: 0, width: 260, height: 60 };
    const subOf = (node: number) => (node === 1 ? "capabilities 1" : null);
    const out = place(list, candidatesOf(list, model, null, subOf), free);
    expect(placedNodes(out)).toEqual([1]);
    expect(out.boxes[0]!.sub).toBe("capabilities 1");
    expect(out.dropped).toBe(1);
  });

  it("lets a pinned name displace a capability that outranks it", () => {
    const model = modelOf([
      { kind: "project", parent: -1, id: null },
      { kind: "domain", parent: 0, label: "" },
      { kind: "capability", parent: 1, label: "larger capability name" },
      { kind: "element", parent: 2 },
      { kind: "element", parent: 2 },
      { kind: "capability", parent: 1, label: "smaller capability name" },
    ]);
    const list = listOf([mark(2, 20, 30), mark(5, 20, 30)]);
    const free: TreeRect = { x: 0, y: 0, width: 260, height: 60 };
    expect(placedNodes(place(list, candidatesOf(list, model), free))).toEqual([2]);
    expect(placedNodes(place(list, candidatesOf(list, model, focusOn(5)), free))).toEqual([5]);
  });

  it("places the focus name before the name of a nearer arc end", () => {
    const model = modelOf(crown(2, 0), [[2, 3]]);
    const list = listOf([mark(2, 20, 30), mark(3, 20, 30)]);
    const free: TreeRect = { x: 0, y: 0, width: 260, height: 60 };
    expect(placedNodes(place(list, candidatesOf(list, model, focusOn(2, [3])), free))).toEqual([2]);
  });

  it("places the same names in a free area away from the origin", () => {
    const home = lattice(12, 40);
    const away = lattice(12, 40, 700, 300);
    const boxesOf = (l: ReturnType<typeof lattice>, dx: number, dy: number) => {
      const out = place(l.list, candidatesOf(l.list, l.model), l.free);
      return out.boxes.slice(0, out.count).map((b) => [b.node, b.x - dx, b.y - dy, b.side]);
    };
    const atHome = boxesOf(home, 0, 0);
    expect(atHome.length).toBeGreaterThan(10);
    expect(boxesOf(away, 700, 300)).toEqual(atHome);
  });

  // Above, below and left fall outside the free area, so the second name has only its right side.
  it("keeps the padding between two names", () => {
    const model = modelOf(crown(2, 0));
    const lineHeight = SIZES.capability * SIZES.leading;
    const free: TreeRect = { x: 0, y: 0, width: 300, height: 60 };
    const withGap = (gapPx: number) => {
      const list = listOf([mark(2, 20, 20), mark(3, 20, 20 + lineHeight + gapPx)]);
      return placedNodes(place(list, candidatesOf(list, model), free));
    };
    expect(withGap(SIZES.pad - 1)).toEqual([2]);
    expect(withGap(SIZES.pad + 1)).toEqual([2, 3]);
  });

  it("keeps a kept name on its recorded side while free and drops it when that side collides", () => {
    const model = modelOf(crown(1, 0));
    const name = candidatesOf(listOf([mark(2, 200, 200)]), model);
    const kept = place(listOf([mark(2, 200, 200)]), name, WIDE, new Map([[2, 1]]));
    expect(kept.boxes[0]!.side).toBe(1);
    expect(kept.count).toBe(1);
    const blocked = place(listOf([mark(2, 200, 200), mark(1, 150, 200)]), name, WIDE, new Map([[2, 1]]));
    expect(blocked.count).toBe(0);
    expect(blocked.dropped).toBe(1);
  });

  it("adds no name that is not kept while names are kept", () => {
    const model = modelOf(crown(2, 0));
    const list = listOf([mark(2, 200, 200), mark(3, 600, 600)]);
    const out = place(list, candidatesOf(list, model), WIDE, new Map([[3, 0]]));
    expect(placedNodes(out)).toEqual([3]);
    expect(out.dropped).toBe(0);
  });

  it("drops and counts a name that does not fit inside the free area", () => {
    const model = modelOf(crown(2, 0));
    const list = listOf([mark(2, 50, 50), mark(3, 900, 900)]);
    const out = place(list, candidatesOf(list, model), { x: 0, y: 0, width: 100, height: 100 });
    expect(out.count).toBe(0);
    expect(out.dropped).toBe(2);
  });

  it("holds only the latest names in a reused placement", () => {
    const model = modelOf(crown(2, 0));
    const both = listOf([mark(2, 200, 200), mark(3, 600, 600)]);
    const out = place(both, candidatesOf(both, model));
    expect(out.count).toBe(2);
    const one = listOf([mark(3, 600, 600)]);
    place(one, candidatesOf(one, model), WIDE, null, out);
    expect(placedNodes(out)).toEqual([3]);
    expect(out.dropped).toBe(0);
  });

  it("tests a number of occupants that grows linearly with the candidates", () => {
    const tested = (k: number) => {
      const { model, list, free } = lattice(k, 60);
      return place(list, candidatesOf(list, model), free).tested;
    };
    const small = tested(20);
    const large = tested(40);
    expect(small).toBeGreaterThan(0);
    expect(large / small).toBeLessThan(4 * 1.25);
  });
});
