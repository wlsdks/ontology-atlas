import { describe, expect, it } from "vitest";
import type { TreeInputEdge, TreeInputNode } from "../containment-tree";
import { layoutTree } from "./tree-layout";
import { buildTreeModel, type TreeWork } from "./tree-model";
import type { TreeModel } from "./types";

const PER_NODE_ARRAYS = ["ids", "labels", "kinds", "parent", "subtreeEnd", "concepts", "capabilities", "elements", "needsStart", "needs", "usedByStart", "usedBy"] as const;

/** Counts every property or index read; a typed array's methods need the real array. */
function counted<T extends object>(target: T, work: TreeWork): T {
  const typed = ArrayBuffer.isView(target);
  return new Proxy(target, {
    get(object, key) {
      if (typeof key === "string") work.steps += 1;
      const value: unknown = Reflect.get(object, key);
      return typed && typeof value === "function" ? value.bind(object) : value;
    },
  });
}

/**
 * Work per tree node may grow 2% when the vault doubles: synthetic forks come in whole steps, so the
 * tree grows a little faster than the vault. A pass quadratic in siblings or leaves roughly doubles it.
 */
const PER_NODE_CEILING = 1.02;

const padded = (k: number) => String(k).padStart(6, "0");

/**
 * About `concepts` concepts and as many dependencies. One domain's capabilities and one head grow
 * with the size, so a pass quadratic in siblings or leaves shows. Nodes arrive in id order, as a
 * vault's files do, which keeps the containment rule's id sort linear.
 */
function vault(concepts: number): { nodes: TreeInputNode[]; edges: TreeInputEdge[] } {
  const nodes: TreeInputNode[] = [{ id: "project:p", label: "p", kind: "project" }];
  const edges: TreeInputEdge[] = [];
  const elements: string[] = [];
  const add = (id: string, kind: TreeInputNode["kind"], parent: string | null) => {
    nodes.push({ id, label: id, kind });
    if (parent) edges.push({ source: parent, target: id, kind: "contains", relationType: "contains" });
    if (kind === "element") elements.push(id);
  };
  for (let d = 0; d < concepts / 250; d += 1) {
    const domain = `domain:${padded(d)}`;
    add(domain, "domain", "project:p");
    const capabilities = d === 0 ? 20 + concepts / 10 : 20;
    for (let c = 0; c < capabilities; c += 1) {
      const capability = `capability:${padded(d)}/${padded(c)}`;
      add(capability, "capability", domain);
      const leaves = d === 0 && c === 0 ? concepts / 5 : c % 4 === 0 ? 0 : 8;
      for (let e = 0; e < leaves; e += 1) add(`element:${padded(d)}/${padded(c)}/${padded(e)}`, "element", capability);
    }
    for (let e = 0; e < 6; e += 1) add(`element:${padded(d)}/own/${padded(e)}`, "element", domain);
    for (let e = 0; e < 6; e += 1) add(`element:${padded(d)}/loose/${padded(e)}`, "element", null);
  }
  for (let k = 0; k < concepts; k += 1) {
    const from = elements[(k * 7919) % elements.length]!;
    const to = elements[(k * 104729 + 13) % elements.length]!;
    edges.push({ source: from, target: to, kind: "depends", relationType: "depends_on" });
  }
  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { nodes, edges };
}

function buildWork(concepts: number): { steps: number; model: TreeModel } {
  const { nodes, edges } = vault(concepts);
  const work: TreeWork = { steps: 0 };
  const watchedNodes = counted(nodes.map((node) => counted(node, work)), work);
  const watchedEdges = counted(edges.map((edge) => counted(edge, work)), work);
  const model = buildTreeModel(watchedNodes, watchedEdges, work);
  return { steps: work.steps, model };
}

function layoutWork(model: TreeModel): number {
  const work: TreeWork = { steps: 0 };
  const wrapped = { ...model };
  for (const key of PER_NODE_ARRAYS) Object.assign(wrapped, { [key]: counted(model[key], work) });
  layoutTree(wrapped, work);
  return work.steps;
}

describe("the tree's build and layout visit each concept and relation a bounded number of times", () => {
  it("keeps the work per tree node level when concepts and relations double", () => {
    const small = buildWork(5_000);
    const large = buildWork(10_000);
    const smallLayout = layoutWork(small.model);
    const largeLayout = layoutWork(large.model);

    const perNode = (steps: number, model: TreeModel) => steps / model.count;

    expect(large.model.count).toBeGreaterThan(1.9 * small.model.count);
    expect(perNode(large.steps, large.model), `build ${small.steps} -> ${large.steps}`).toBeLessThanOrEqual(PER_NODE_CEILING * perNode(small.steps, small.model));
    expect(perNode(largeLayout, large.model), `layout ${smallLayout} -> ${largeLayout}`).toBeLessThanOrEqual(PER_NODE_CEILING * perNode(smallLayout, small.model));
  });
});
