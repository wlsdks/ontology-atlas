import { describe, expect, it } from "vitest";
import type { TreeInputEdge, TreeInputNode } from "../containment-tree";
import { buildTreeModel, readTreeFocus } from "./tree-model";
import type { TreeModel } from "./types";

const concept = (id: string, kind: TreeInputNode["kind"]): TreeInputNode => ({ id, label: id, kind });
const contains = (parent: string, child: string): TreeInputEdge => ({ source: parent, target: child, kind: "contains", relationType: "contains" });
const dependsOn = (from: string, to: string): TreeInputEdge => ({ source: from, target: to, kind: "depends", relationType: "depends_on" });

function childrenOf(model: TreeModel, node: number): number[] {
  const out: number[] = [];
  for (let j = node + 1; j < model.subtreeEnd[node]!; j = model.subtreeEnd[j]!) out.push(j);
  return out;
}

function isInside(model: TreeModel, node: number, root: number): boolean {
  return node >= root && node < model.subtreeEnd[root]!;
}

describe("buildTreeModel", () => {
  it("places every concept exactly once, the ones under no domain on the loose fork", () => {
    const nodes = [
      concept("project:p", "project"),
      concept("project:q", "project"),
      concept("domain:d", "domain"),
      concept("capability:in-domain", "capability"),
      concept("element:in-capability", "element"),
      concept("capability:held-by-project", "capability"),
      concept("element:held-by-project", "element"),
      concept("capability:parentless", "capability"),
      concept("element:inside-element", "element"),
    ];
    const edges = [
      contains("project:p", "domain:d"),
      contains("domain:d", "capability:in-domain"),
      contains("capability:in-domain", "element:in-capability"),
      contains("project:p", "capability:held-by-project"),
      contains("project:p", "element:held-by-project"),
      contains("element:in-capability", "element:inside-element"),
    ];
    const model = buildTreeModel(nodes, edges);

    const placed = model.ids.filter((id): id is string => id !== null);
    expect([...placed].sort()).toEqual(nodes.map((n) => n.id).sort());
    expect(model.looseRoot).toBeGreaterThan(0);
    expect(model.parent[model.looseRoot]).toBe(0);
    for (const loose of ["project:q", "capability:held-by-project", "element:held-by-project", "capability:parentless", "element:inside-element"]) {
      expect(isInside(model, model.indexOf.get(loose)!, model.looseRoot), loose).toBe(true);
    }
    expect(isInside(model, model.indexOf.get("element:in-capability")!, model.indexOf.get("domain:d")!)).toBe(true);
  });

  it("forks a parent of 400 capabilities at most 4 ways at every fork", () => {
    const nodes = [concept("project:p", "project"), concept("domain:d", "domain")];
    const edges = [contains("project:p", "domain:d")];
    for (let k = 0; k < 400; k += 1) {
      const id = `capability:${String(k).padStart(3, "0")}`;
      nodes.push(concept(id, "capability"));
      edges.push(contains("domain:d", id));
    }
    const model = buildTreeModel(nodes, edges);
    const domain = model.indexOf.get("domain:d")!;

    expect(model.capabilities[domain]).toBe(400);
    expect(childrenOf(model, domain).length).toBeLessThanOrEqual(4);
    for (let i = 0; i < model.count; i += 1) {
      if (model.kinds[i] !== "fork") continue;
      const fanOut = childrenOf(model, i).length;
      expect(fanOut).toBeGreaterThanOrEqual(2);
      expect(fanOut).toBeLessThanOrEqual(4);
    }
    const order = model.ids.filter((id) => id?.startsWith("capability:"));
    expect(order).toEqual([...order].sort());
  });

  it("gives a vault with no project a trunk without an id", () => {
    const model = buildTreeModel([concept("domain:d", "domain"), concept("capability:c", "capability")], [contains("domain:d", "capability:c")]);

    expect(model.ids[0]).toBeNull();
    expect(model.parent[0]).toBe(-1);
    expect(model.parent[model.indexOf.get("domain:d")!]).toBe(0);
    expect(model.concepts[0]).toBe(2);
  });

  it("yields a model of zero nodes for an empty vault", () => {
    const model = buildTreeModel([], []);

    expect(model.count).toBe(0);
    expect(model.looseRoot).toBe(-1);
    expect(model.indexOf.size).toBe(0);
  });

  it("lists an element's dependency from the element, not from its capability", () => {
    const nodes = [
      concept("domain:d", "domain"),
      concept("capability:a", "capability"),
      concept("capability:b", "capability"),
      concept("element:a1", "element"),
    ];
    const edges = [
      contains("domain:d", "capability:a"),
      contains("domain:d", "capability:b"),
      contains("capability:a", "element:a1"),
      dependsOn("element:a1", "capability:b"),
      dependsOn("element:a1", "capability:b"),
    ];
    const model = buildTreeModel(nodes, edges);
    const element = model.indexOf.get("element:a1")!;
    const owner = model.indexOf.get("capability:a")!;
    const target = model.indexOf.get("capability:b")!;

    expect(readTreeFocus(model, element, false).needs).toEqual([target]);
    expect(readTreeFocus(model, owner, false).needs).toEqual([]);
    expect(readTreeFocus(model, target, true).usedBy).toEqual([element]);
  });

  it("reads a focus path from the parent up to the trunk", () => {
    const model = buildTreeModel(
      [concept("project:p", "project"), concept("domain:d", "domain"), concept("capability:c", "capability"), concept("element:e", "element")],
      [contains("project:p", "domain:d"), contains("domain:d", "capability:c"), contains("capability:c", "element:e")],
    );
    const at = (id: string) => model.indexOf.get(id)!;

    expect(readTreeFocus(model, at("element:e"), true).path).toEqual([at("capability:c"), at("domain:d"), 0]);
    expect(readTreeFocus(model, 0, false).path).toEqual([]);
  });
});
