import { describe, expect, it } from "vitest";
import type { TreeInputEdge, TreeInputNode } from "../containment-tree";
import { layoutTree } from "./tree-layout";
import { buildTreeModel } from "./tree-model";
import type { TreeModel } from "./types";

const PER_NODE_ARRAYS = ["ids", "labels", "kinds", "parent", "subtreeEnd", "concepts", "capabilities", "elements", "needsStart", "needs", "usedByStart", "usedBy"] as const;

/** Counts every indexed read, iteration and array methods included; a typed array's methods need the real array. */
function counted<T extends object>(target: T, visits: { count: number }): T {
  const typed = ArrayBuffer.isView(target);
  return new Proxy(target, {
    get(array, key) {
      if (typeof key === "string" && /^\d+$/.test(key)) visits.count += 1;
      const value: unknown = Reflect.get(array, key);
      return typed && typeof value === "function" ? value.bind(array) : value;
    },
  });
}

/** A vault of about `concepts` concepts and as many dependencies, its shape fixed in proportion. */
function vault(concepts: number): { nodes: TreeInputNode[]; edges: TreeInputEdge[] } {
  const nodes: TreeInputNode[] = [{ id: "project:p", label: "p", kind: "project" }];
  const edges: TreeInputEdge[] = [];
  const elements: string[] = [];
  const add = (id: string, kind: TreeInputNode["kind"], parent: string | null) => {
    nodes.push({ id, label: id, kind });
    if (parent) edges.push({ source: parent, target: id, kind: "contains", relationType: "contains" });
    if (kind === "element") elements.push(id);
  };
  const domains = concepts / 250;
  for (let d = 0; d < domains; d += 1) {
    const domain = `domain:${d}`;
    add(domain, "domain", "project:p");
    for (let c = 0; c < 20; c += 1) {
      const capability = `capability:${d}/${c}`;
      add(capability, "capability", domain);
      for (let e = 0; e < (c === 0 ? 50 : 8); e += 1) add(`element:${d}/${c}/${e}`, "element", capability);
    }
    for (let e = 0; e < 18; e += 1) add(`element:${d}/loose/${e}`, "element", null);
  }
  for (let k = 0; k < concepts; k += 1) {
    const from = elements[(k * 7919) % elements.length]!;
    const to = elements[(k * 104729 + 13) % elements.length]!;
    edges.push({ source: from, target: to, kind: "depends", relationType: "depends_on" });
  }
  return { nodes, edges };
}

function buildVisits(concepts: number): { visits: number; model: TreeModel } {
  const { nodes, edges } = vault(concepts);
  const visits = { count: 0 };
  const model = buildTreeModel(counted(nodes, visits), counted(edges, visits));
  return { visits: visits.count, model };
}

function layoutVisits(model: TreeModel): number {
  const visits = { count: 0 };
  const wrapped = { ...model };
  for (const key of PER_NODE_ARRAYS) Object.assign(wrapped, { [key]: counted(model[key], visits) });
  layoutTree(wrapped);
  return visits.count;
}

describe("the tree's build and layout visit each concept and relation a bounded number of times", () => {
  it("at most doubles node visits when concepts and relations double", () => {
    const small = buildVisits(5_000);
    const large = buildVisits(10_000);
    const smallLayout = layoutVisits(small.model);
    const largeLayout = layoutVisits(large.model);

    expect(large.model.count).toBeGreaterThan(1.9 * small.model.count);
    expect(large.visits, `build ${small.visits} -> ${large.visits}`).toBeLessThanOrEqual(2 * small.visits);
    expect(largeLayout, `layout ${smallLayout} -> ${largeLayout}`).toBeLessThanOrEqual(2 * smallLayout);
  });
});
