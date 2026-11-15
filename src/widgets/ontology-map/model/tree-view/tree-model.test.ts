import { describe, expect, it } from "vitest";
import type { TreeInputEdge, TreeInputNode } from "../containment-tree";
import { buildTreeModel, readTreeFocus } from "./tree-model";
import type { TreeModel } from "./types";

const concept = (id: string, kind: TreeInputNode["kind"], label = id): TreeInputNode => ({ id, label, kind });
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

function padded(k: number): string {
  return String(k).padStart(3, "0");
}

describe("buildTreeModel", () => {
  it("places every concept exactly once, the ones under no domain on the loose fork", () => {
    const nodes = [
      concept("project:p", "project"),
      concept("project:q", "project"),
      concept("domain:d", "domain"),
      concept("capability:in-domain", "capability"),
      concept("element:in-capability", "element"),
      concept("element:held-by-domain", "element"),
      concept("capability:held-by-project", "capability"),
      concept("element:held-by-project", "element"),
      concept("capability:parentless", "capability"),
      concept("element:inside-element", "element"),
    ];
    const edges = [
      contains("project:p", "domain:d"),
      contains("domain:d", "capability:in-domain"),
      contains("capability:in-domain", "element:in-capability"),
      contains("domain:d", "element:held-by-domain"),
      contains("project:p", "capability:held-by-project"),
      contains("project:p", "element:held-by-project"),
      contains("element:in-capability", "element:inside-element"),
    ];
    const model = buildTreeModel(nodes, edges);
    const domain = model.indexOf.get("domain:d")!;

    const placed = model.ids.filter((id): id is string => id !== null);
    expect([...placed].sort()).toEqual(nodes.map((n) => n.id).sort());
    expect(model.looseRoot).toBeGreaterThan(0);
    expect(model.parent[model.looseRoot]).toBe(0);
    for (const loose of ["project:q", "capability:held-by-project", "element:held-by-project", "capability:parentless", "element:inside-element"]) {
      expect(isInside(model, model.indexOf.get(loose)!, model.looseRoot), loose).toBe(true);
    }
    for (const owned of ["element:in-capability", "element:held-by-domain"]) {
      expect(isInside(model, model.indexOf.get(owned)!, domain), owned).toBe(true);
    }
  });

  it("hangs a parent's own elements from one stem, so no parent mixes branches and leaves", () => {
    const nodes = [concept("project:p", "project"), concept("domain:d", "domain"), concept("capability:loose", "capability"), concept("element:loose", "element")];
    const edges = [contains("project:p", "domain:d")];
    for (let k = 0; k < 5; k += 1) {
      nodes.push(concept(`capability:${k}`, "capability"), concept(`element:own-${k}`, "element"), concept(`element:of-${k}`, "element"));
      edges.push(contains("domain:d", `capability:${k}`), contains("domain:d", `element:own-${k}`), contains(`capability:${k}`, `element:of-${k}`));
    }
    const model = buildTreeModel(nodes, edges);

    for (let i = 0; i < model.count; i += 1) {
      const kids = childrenOf(model, i).map((j) => model.kinds[j] === "element");
      expect(kids.every((leaf) => leaf === kids[0]), `children of ${i}`).toBe(true);
    }
    for (const holder of [model.indexOf.get("domain:d")!, model.looseRoot]) {
      const stems = childrenOf(model, holder).filter((j) => model.kinds[j + 1] === "element");
      expect(stems).toHaveLength(1);
      expect(model.kinds[stems[0]!]).toBe("fork");
      expect(model.labels[stems[0]!]).toBe("");
    }
    expect(model.elements[model.indexOf.get("domain:d")!]).toBe(10);
  });

  it("keeps every fan-out at most 4, the trunk beside its loose fork and a domain beside its stem included", () => {
    const nodes = [concept("project:p", "project"), concept("capability:orphan", "capability"), concept("element:own", "element")];
    const edges: TreeInputEdge[] = [contains("domain:000", "element:own")];
    for (let d = 0; d < 40; d += 1) {
      nodes.push(concept(`domain:${padded(d)}`, "domain"));
      edges.push(contains("project:p", `domain:${padded(d)}`));
    }
    for (let k = 0; k < 400; k += 1) {
      nodes.push(concept(`capability:${padded(k)}`, "capability"));
      edges.push(contains("domain:000", `capability:${padded(k)}`));
    }
    const model = buildTreeModel(nodes, edges);
    const domain = model.indexOf.get("domain:000")!;

    expect(model.capabilities[domain]).toBe(400);
    for (let i = 0; i < model.count; i += 1) {
      const kids = childrenOf(model, i);
      if (kids.length === 0 || model.kinds[kids[0]!] === "element") continue;
      expect(kids.length, `fan-out of ${i}`).toBeLessThanOrEqual(4);
      if (model.kinds[i] === "fork" && i !== model.looseRoot) expect(kids.length, `fork ${i}`).toBeGreaterThanOrEqual(2);
    }
    const order = model.ids.filter((id) => id?.startsWith("capability:") && id !== "capability:orphan");
    expect(order).toEqual([...order].sort());
  });

  it("keeps the same node for a duplicated id whatever the input order", () => {
    const twins = [concept("x", "element", "second"), concept("x", "capability", "first"), concept("x", "element", "first")];
    const forward = buildTreeModel(twins, []);
    const backward = buildTreeModel([...twins].reverse(), []);
    const at = (model: TreeModel) => model.indexOf.get("x")!;

    expect(forward.kinds[at(forward)]).toBe("capability");
    expect(backward.kinds[at(backward)]).toBe("capability");
    expect(backward.labels[at(backward)]).toBe(forward.labels[at(forward)]);
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

  it("lists an element's dependency from the element, not from its capability, and drops one on itself", () => {
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
      dependsOn("element:a1", "element:a1"),
    ];
    const model = buildTreeModel(nodes, edges);
    const element = model.indexOf.get("element:a1")!;
    const owner = model.indexOf.get("capability:a")!;
    const target = model.indexOf.get("capability:b")!;

    expect(readTreeFocus(model, element, false).needs).toEqual([target]);
    expect(readTreeFocus(model, element, false).usedBy).toEqual([]);
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
