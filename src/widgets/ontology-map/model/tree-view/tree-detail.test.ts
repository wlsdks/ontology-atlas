import { describe, expect, it } from "vitest";

import { TREE_POSE_REST, aimTreeProjector, createTreeProjector } from "./tree-camera";
import { TREE_MARK_BUDGET, cutTreeDetail } from "./tree-detail";
import { TREE_TONE_STEPS } from "./types";
import type {
  TreeDetailInput,
  TreeDrawList,
  TreeLayout,
  TreeModel,
  TreeNodeKind,
  TreeProjector,
  TreeRect,
  TreeScreenPoint,
} from "./types";

interface Spec {
  kind: TreeNodeKind;
  at: [number, number, number];
  children?: Spec[];
}

/** A hand-built layout: preorder arrays, AABB-derived bounds and least child spacing. */
function buildTree(root: Spec): TreeLayout {
  const specs: Spec[] = [];
  const parentOf: number[] = [];
  const stack: [Spec, number][] = [[root, -1]];
  while (stack.length > 0) {
    const [spec, parent] = stack.pop()!;
    parentOf.push(parent);
    const index = specs.push(spec) - 1;
    const children = spec.children ?? [];
    for (let c = children.length - 1; c >= 0; c--) stack.push([children[c], index]);
  }
  const count = specs.length;
  const parent = Int32Array.from(parentOf);
  const subtreeEnd = new Int32Array(count);
  for (let i = count - 1; i >= 0; i--) subtreeEnd[i] = Math.max(subtreeEnd[i], i + 1);
  for (let i = count - 1; i > 0; i--) subtreeEnd[parent[i]] = Math.max(subtreeEnd[parent[i]], subtreeEnd[i]);
  const position = new Float32Array(specs.flatMap((s) => s.at));
  const low = Array.from({ length: count }, (_, i) => [...position.subarray(i * 3, i * 3 + 3)]);
  const high = low.map((p) => [...p]);
  for (let i = count - 1; i > 0; i--) {
    for (let a = 0; a < 3; a++) {
      low[parent[i]][a] = Math.min(low[parent[i]][a], low[i][a]);
      high[parent[i]][a] = Math.max(high[parent[i]][a], high[i][a]);
    }
  }
  const bound = new Float32Array(count * 4);
  const childPitch = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const half = [0, 1, 2].map((a) => (high[i][a] - low[i][a]) / 2);
    for (let a = 0; a < 3; a++) bound[i * 4 + a] = low[i][a] + half[a];
    bound[i * 4 + 3] = Math.hypot(half[0], half[1], half[2]) + 1e-3;
    const kids: number[] = [];
    for (let c = i + 1; c < subtreeEnd[i]; c = subtreeEnd[c]) kids.push(c);
    let least = Infinity;
    for (let a = 0; a < kids.length; a++) {
      for (let b = a + 1; b < kids.length; b++) {
        const pa = kids[a] * 3;
        const pb = kids[b] * 3;
        least = Math.min(least, Math.hypot(position[pa] - position[pb], position[pa + 1] - position[pb + 1], position[pa + 2] - position[pb + 2]));
      }
    }
    childPitch[i] = Number.isFinite(least) ? least : 0;
  }
  const empty = new Int32Array(count + 1);
  const model: TreeModel = {
    count,
    ids: specs.map((_, i) => `n${i}`),
    labels: specs.map((_, i) => `n${i}`),
    kinds: specs.map((s) => s.kind),
    parent,
    subtreeEnd,
    concepts: new Int32Array(count),
    capabilities: new Int32Array(count),
    elements: new Int32Array(count),
    indexOf: new Map(specs.map((_, i) => [`n${i}`, i])),
    needsStart: empty,
    needs: new Int32Array(0),
    usedByStart: empty,
    usedBy: new Int32Array(0),
    looseRoot: -1,
  };
  const r = bound[3];
  return {
    model,
    position,
    control: new Float32Array(count * 6),
    widthStart: new Float32Array(count),
    widthEnd: new Float32Array(count),
    bound,
    childPitch,
    reach: new Float32Array(count),
    centre: [bound[0], bound[1], bound[2]],
    radius: r,
  };
}

const UNIT = 10;
/** Orthographic: 10 px per world unit at scale 1, depth grows with z. */
function flatProjector(scale = 1): TreeProjector {
  return {
    unit: UNIT,
    near: 90,
    far: 110,
    project(x: number, y: number, z: number, out: TreeScreenPoint) {
      out.x = 500 + x * UNIT * scale;
      out.y = 500 - y * UNIT * scale;
      out.scale = scale;
      out.depth = 100 + z;
    },
  };
}

const SIZES = { project: 9, domain: 7, capability: 5, element: 3, bud: 4 };
const WIDE: TreeRect = { x: 0, y: 0, width: 1000, height: 1000 };

function cut(layout: TreeLayout, overrides: Partial<TreeDetailInput> = {}, out = drawList()): TreeDrawList {
  cutTreeDetail(
    {
      layout,
      projector: flatProjector(),
      view: WIDE,
      marks: SIZES,
      openPitchPx: 20,
      leafPitchPx: 10,
      markBudget: TREE_MARK_BUDGET,
      reveal: [],
      ...overrides,
    },
    out,
  );
  return out;
}

function drawList(): TreeDrawList {
  return { marks: [], count: 0, visited: 0, folded: 0 };
}

function drawn(list: TreeDrawList): Map<number, boolean> {
  return new Map(list.marks.slice(0, list.count).map((m) => [m.node, m.closed]));
}

function leaves(count: number, x: number, y: number, z: number, step: number): Spec[] {
  return Array.from({ length: count }, (_, i) => ({ kind: "element" as const, at: [x + (i - (count - 1) / 2) * step, y, z] }));
}

/** Domains 40 px apart, capabilities 20 px, elements 10 px. */
const SMALL = buildTree({
  kind: "project",
  at: [0, 5, 0],
  children: [
    {
      kind: "domain",
      at: [-2, 6, 0],
      children: [
        { kind: "capability", at: [-3, 7, 0], children: leaves(2, -3, 8, 0, 1) },
        { kind: "capability", at: [-1, 7, 0], children: leaves(2, -1, 8, 0, 1) },
      ],
    },
    {
      kind: "domain",
      at: [2, 6, 0],
      children: [
        { kind: "capability", at: [1, 7, 0], children: leaves(2, 1, 8, 0, 1) },
        { kind: "capability", at: [3, 7, 0], children: leaves(2, 3, 8, 0, 1) },
      ],
    },
  ],
});

function kindsDrawn(layout: TreeLayout, list: TreeDrawList): TreeNodeKind[] {
  return [...new Set([...drawn(list).keys()].map((n) => layout.model.kinds[n]))].sort();
}

/** 1 + 10 domains + 100 capabilities + 9,900 elements. */
function bigTree(): TreeLayout {
  return buildTree({
    kind: "project",
    at: [0, 10, 0],
    children: Array.from({ length: 10 }, (_, d) => {
      const angle = (d / 10) * Math.PI * 2;
      const dx = Math.cos(angle) * 12;
      const dz = Math.sin(angle) * 12;
      return {
        kind: "domain" as const,
        at: [dx, 14, dz] as [number, number, number],
        children: Array.from({ length: 10 }, (_, c) => {
          const cx = dx + (c - 4.5) * 1.2;
          return {
            kind: "capability" as const,
            at: [cx, 17, dz] as [number, number, number],
            children: leaves(99, cx, 19, dz, 0.01),
          };
        }),
      };
    }),
  });
}

function aimed(layout: TreeLayout, zoom: number, yaw: number): TreeProjector {
  const projector = createTreeProjector();
  aimTreeProjector(projector, layout, { ...TREE_POSE_REST, zoom, yaw }, { width: 1512, height: 982 }, { x: 0, y: 0, width: 1512, height: 982 });
  return projector;
}

describe("cutTreeDetail", () => {
  it("opens a node only when its children's projected spacing reaches the threshold", () => {
    expect(kindsDrawn(SMALL, cut(SMALL, { openPitchPx: 20, leafPitchPx: 10 }))).toEqual(["capability", "domain", "element", "project"]);
    expect(kindsDrawn(SMALL, cut(SMALL, { openPitchPx: 20, leafPitchPx: 10.01 }))).toEqual(["capability", "domain", "project"]);
    expect(kindsDrawn(SMALL, cut(SMALL, { openPitchPx: 20.01, leafPitchPx: 0 }))).toEqual(["domain", "project"]);
    expect(kindsDrawn(SMALL, cut(SMALL, { openPitchPx: 30, leafPitchPx: 25 }))).toEqual(["domain", "project"]);
    expect(kindsDrawn(SMALL, cut(SMALL, { projector: flatProjector(2), openPitchPx: 30, leafPitchPx: 25 }))).toEqual(["capability", "domain", "project"]);
  });

  it("takes a lone child's spacing from the length of its branch", () => {
    const layout = buildTree({ kind: "project", at: [0, 5, 0], children: [{ kind: "domain", at: [0, 8, 0] }] });
    expect(drawn(cut(layout, { openPitchPx: 30 })).has(1)).toBe(true);
    expect(drawn(cut(layout, { openPitchPx: 30.01 })).has(1)).toBe(false);
  });

  it("draws no mark for an open fork", () => {
    const layout = buildTree({
      kind: "project",
      at: [0, 5, 0],
      children: [{ kind: "fork", at: [1, 6, 0], children: [{ kind: "capability", at: [0, 7, 0] }, { kind: "capability", at: [2, 7, 0] }] }],
    });
    expect([...drawn(cut(layout, { openPitchPx: 0 })).keys()].sort()).toEqual([0, 2, 3]);
  });

  it("sizes each mark by its kind times the projected scale", () => {
    const list = cut(SMALL, { projector: flatProjector(2), openPitchPx: 0, leafPitchPx: 0 });
    expect(list.count).toBe(SMALL.model.count);
    for (const mark of list.marks.slice(0, list.count)) {
      const kind = SMALL.model.kinds[mark.node] as Exclude<TreeNodeKind, "fork">;
      expect(mark.radius).toBe(SIZES[kind] * 2);
    }
  });

  it("draws a closed node as one mark that folds its whole subtree", () => {
    const list = cut(SMALL, { openPitchPx: 25, leafPitchPx: 10 });
    const marks = drawn(list);
    expect([...marks.entries()].filter(([, closed]) => closed).map(([n]) => SMALL.model.kinds[n])).toEqual(["domain", "domain"]);
    expect(list.count).toBe(3);
    expect(list.folded).toBe(SMALL.model.count - 3);
  });

  it("never exceeds the mark budget and gives it to the nearer nodes", () => {
    const layout = buildTree({
      kind: "project",
      at: [0, 5, 0],
      children: [
        { kind: "capability", at: [-3, 6, -5], children: leaves(10, -3, 7, -5, 0.5) },
        { kind: "capability", at: [3, 6, 5], children: leaves(10, 3, 7, 5, 0.5) },
      ],
    });
    const list = cut(layout, { leafPitchPx: 0, markBudget: 13 });
    const marks = drawn(list);
    expect(list.count).toBe(13);
    for (let leaf = 2; leaf < 12; leaf++) expect(marks.has(leaf)).toBe(true);
    expect(marks.get(12)).toBe(true);
    for (let leaf = 13; leaf < 23; leaf++) expect(marks.has(leaf)).toBe(false);
    for (const budget of [1, 2, 5, 12]) expect(cut(layout, { leafPitchPx: 0, markBudget: budget }).count).toBeLessThanOrEqual(budget);
  });

  it("closes only a node whose children overflow the budget and still opens the nodes after it", () => {
    const layout = buildTree({
      kind: "project",
      at: [0, 5, 0],
      children: [
        { kind: "capability", at: [-3, 6, -5], children: leaves(50, -3, 7, -5, 0.2) },
        { kind: "capability", at: [3, 6, 5], children: leaves(3, 3, 7, 5, 0.5) },
      ],
    });
    const marks = drawn(cut(layout, { leafPitchPx: 0, markBudget: 10 }));
    expect(marks.get(1)).toBe(true);
    expect(marks.get(52)).toBe(false);
    for (const leaf of [53, 54, 55]) expect(marks.has(leaf)).toBe(true);
  });

  it("draws every node under an unbounded budget", () => {
    expect(cut(SMALL, { openPitchPx: 0, leafPitchPx: 0, markBudget: Infinity }).count).toBe(SMALL.model.count);
    expect(cut(SMALL, { openPitchPx: 0, leafPitchPx: 0, markBudget: 2 ** 31 }).count).toBe(SMALL.model.count);
  });

  it("counts only the children in view against the budget", () => {
    const layout = buildTree({
      kind: "project",
      at: [0, 5, 0],
      children: [{ kind: "capability", at: [0, 6, 0], children: leaves(1600, 0, 7, 0, 0.5) }],
    });
    const list = cut(layout, { openPitchPx: 0, leafPitchPx: 0 });
    expect(drawn(list).get(1)).toBe(false);
    expect(list.count).toBeGreaterThan(150);
    expect(list.count).toBeLessThan(TREE_MARK_BUDGET);
  });

  it("visits at most four times the budget on a 10,000-node layout", () => {
    const layout = bigTree();
    expect(layout.model.count).toBeGreaterThan(10_000);
    for (const budget of [TREE_MARK_BUDGET, 200]) {
      for (const [zoom, yaw] of [[1, 0], [6, 1.3], [32, 4]]) {
        const list = cut(layout, { projector: aimed(layout, zoom, yaw), view: { x: 0, y: 0, width: 1512, height: 982 }, openPitchPx: 0, leafPitchPx: 0, markBudget: budget });
        expect(list.count).toBeLessThanOrEqual(budget);
        expect(list.visited).toBeLessThanOrEqual(4 * budget);
        expect(list.count).toBeGreaterThan(0);
      }
    }
  });

  it("does not visit the inside of a subtree that projects outside the view", () => {
    const layout = buildTree({
      kind: "project",
      at: [0, 5, 0],
      children: [
        { kind: "capability", at: [-20, 6, 0], children: leaves(3, -20, 7, 0, 1) },
        { kind: "capability", at: [20, 6, 0], children: leaves(50, 20, 7, 0, 0.1) },
      ],
    });
    const everything = cut(layout, { leafPitchPx: 0 });
    const leftHalf = cut(layout, { leafPitchPx: 0, view: { x: 0, y: 0, width: 500, height: 1000 } });
    expect(everything.visited - leftHalf.visited).toBeGreaterThanOrEqual(50);
    expect([...drawn(leftHalf).keys()].every((n) => n < 5)).toBe(true);
  });

  it("draws every leaf whose mark touches the view", () => {
    const layout = buildTree({
      kind: "project",
      at: [0, 5, 0],
      children: [
        {
          kind: "capability",
          at: [20, 6, 0],
          children: [19.6, 19.8, 20, 20.2, 20.4].map((x) => ({ kind: "element" as const, at: [x, 7, 0] as [number, number, number] })),
        },
      ],
    });
    const viewEdgePx = 700;
    const list = cut(layout, { leafPitchPx: 0, view: { x: 0, y: 0, width: viewEdgePx, height: 1000 } });
    const touching = [2, 3, 4, 5, 6].filter((leaf) => 500 + layout.position[leaf * 3] * UNIT - SIZES.element <= viewEdgePx);
    expect(touching).toEqual([2, 3, 4, 5]);
    expect(touching.filter((leaf) => drawn(list).has(leaf))).toEqual(touching);
  });

  it("draws a revealed node that lies outside the view", () => {
    const layout = buildTree({
      kind: "project",
      at: [0, 5, 0],
      children: [
        { kind: "capability", at: [-20, 6, 0], children: leaves(3, -20, 7, 0, 1) },
        { kind: "capability", at: [20, 6, 0], children: leaves(50, 20, 7, 0, 0.1) },
      ],
    });
    const leftHalf = { x: 0, y: 0, width: 500, height: 1000 };
    expect(drawn(cut(layout, { leafPitchPx: 0, view: leftHalf })).has(6)).toBe(false);
    expect(drawn(cut(layout, { leafPitchPx: 0, view: leftHalf, reveal: [6] })).has(6)).toBe(true);
  });

  it("keeps a revealed node itself closed when its spacing closes it", () => {
    expect(drawn(cut(SMALL, { openPitchPx: Infinity, leafPitchPx: Infinity, reveal: [1] })).get(1)).toBe(true);
    const forked = buildTree({
      kind: "project",
      at: [0, 5, 0],
      children: [{ kind: "fork", at: [1, 6, 0], children: leaves(2, 1, 7, 0, 0.1) }],
    });
    const fork = cut(forked, { openPitchPx: 0, leafPitchPx: 10, reveal: [1] }).marks.find((m) => m.node === 1)!;
    expect([fork.closed, fork.radius]).toEqual([true, SIZES.bud]);
  });

  it("draws a revealed node alone under an ancestor whose children overflow the budget", () => {
    const layout = buildTree({
      kind: "project",
      at: [0, 5, 0],
      children: [{ kind: "capability", at: [0, 6, 0], children: leaves(20, 0, 7, 0, 0.5) }],
    });
    const list = cut(layout, { leafPitchPx: Infinity, markBudget: 3, reveal: [7] });
    const marks = drawn(list);
    expect(list.count).toBe(3);
    expect(marks.get(1)).toBe(true);
    expect(marks.get(7)).toBe(false);
    expect(list.folded).toBe(19);
  });

  it("never exceeds the budget when the reveal path is longer than it", () => {
    const chain = buildTree({
      kind: "project",
      at: [0, 5, 0],
      children: [{ kind: "domain", at: [0, 6, 0], children: [{ kind: "capability", at: [0, 7, 0], children: [{ kind: "element", at: [0, 8, 0] }] }] }],
    });
    expect(cut(chain, { openPitchPx: 0, leafPitchPx: 0, markBudget: 2, reveal: [3] }).count).toBeLessThanOrEqual(2);
  });

  it("keeps a revealed node's mark when its ancestor's off-view children use up the visits", () => {
    const layout = buildTree({
      kind: "project",
      at: [0, 5, 0],
      children: [{ kind: "capability", at: [0, 6, 0], children: leaves(1600, 0, 7, 0, 0.5) }],
    });
    const middle = 2 + 800;
    const list = cut(layout, { openPitchPx: 0, leafPitchPx: 0, markBudget: 10, reveal: [middle] });
    expect(list.visited).toBeLessThanOrEqual(40);
    expect(drawn(list).get(middle)).toBe(false);
  });

  it("draws a revealed node and opens its ancestors when spacing would close them", () => {
    const element = 6;
    expect(SMALL.model.kinds[element]).toBe("element");
    expect(drawn(cut(SMALL, { openPitchPx: Infinity, leafPitchPx: Infinity })).has(element)).toBe(false);
    const marks = drawn(cut(SMALL, { openPitchPx: Infinity, leafPitchPx: Infinity, reveal: [element] }));
    expect(marks.get(element)).toBe(false);
    for (let node = SMALL.model.parent[element]; node >= 0; node = SMALL.model.parent[node]) expect(marks.get(node)).toBe(false);
  });

  it("keeps a revealed node in the list when nearer nodes would take the whole budget", () => {
    const layout = buildTree({
      kind: "project",
      at: [0, 5, 0],
      children: [
        { kind: "capability", at: [-3, 6, -5], children: leaves(10, -3, 7, -5, 0.5) },
        { kind: "capability", at: [3, 6, 5], children: leaves(10, 3, 7, 5, 0.5) },
      ],
    });
    const farLeaf = 13;
    expect(drawn(cut(layout, { leafPitchPx: 0, markBudget: 13 })).has(farLeaf)).toBe(false);
    const list = cut(layout, { leafPitchPx: 0, markBudget: 13, reveal: [farLeaf] });
    expect(list.count).toBeLessThanOrEqual(13);
    expect(drawn(list).has(farLeaf)).toBe(true);
  });

  it("lists marks far to near", () => {
    const layout = bigTree();
    const list = cut(layout, { projector: aimed(layout, 3, 0.7), view: { x: 0, y: 0, width: 1512, height: 982 }, openPitchPx: 0, leafPitchPx: 0 });
    expect(list.count).toBeGreaterThan(100);
    for (let i = 1; i < list.count; i++) expect(list.marks[i].depth).toBeLessThanOrEqual(list.marks[i - 1].depth);
  });

  it("tones a mark from 0 at the far depth to the last step at the near depth", () => {
    const layout = buildTree({
      kind: "project",
      at: [0, 5, 0],
      children: [
        { kind: "domain", at: [-2, 6, 10] },
        { kind: "domain", at: [2, 6, -10] },
      ],
    });
    const marks = cut(layout).marks;
    expect(marks.find((m) => m.node === 1)?.tone).toBe(0);
    expect(marks.find((m) => m.node === 2)?.tone).toBe(TREE_TONE_STEPS - 1);
  });

  it("places the trunk's mark at the trunk base and sizes a closed fork as a bud", () => {
    const layout = buildTree({
      kind: "project",
      at: [0, 5, 0],
      children: [{ kind: "fork", at: [1, 6, 0], children: leaves(2, 1, 7, 0, 0.1) }],
    });
    const list = cut(layout, { openPitchPx: 0, leafPitchPx: 10 });
    const trunk = list.marks.find((m) => m.node === 0)!;
    expect([trunk.x, trunk.y]).toEqual([500, 500]);
    const fork = list.marks.find((m) => m.node === 1)!;
    expect([fork.closed, fork.radius]).toEqual([true, SIZES.bud]);
  });

  it("reuses the pooled mark objects on the next cut", () => {
    const list = cut(SMALL, { openPitchPx: 0, leafPitchPx: 0 });
    const pool = [...list.marks];
    cut(SMALL, { openPitchPx: 25 }, list);
    cut(SMALL, { openPitchPx: 0, leafPitchPx: 0 }, list);
    expect(list.marks.length).toBe(pool.length);
    expect(new Set([...list.marks, ...pool]).size).toBe(pool.length);
  });
});
