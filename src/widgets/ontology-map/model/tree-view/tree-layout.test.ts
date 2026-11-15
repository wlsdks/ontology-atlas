import { describe, expect, it } from "vitest";
import type { TreeInputEdge, TreeInputNode } from "../containment-tree";
import { layoutTree } from "./tree-layout";
import { buildTreeModel } from "./tree-model";
import type { TreeLayout } from "./types";

const concept = (id: string, kind: TreeInputNode["kind"]): TreeInputNode => ({ id, label: id, kind });
const contains = (parent: string, child: string): TreeInputEdge => ({ source: parent, target: child, kind: "contains", relationType: "contains" });
const dependsOn = (from: string, to: string): TreeInputEdge => ({ source: from, target: to, kind: "depends", relationType: "depends_on" });

interface Vault { nodes: TreeInputNode[]; edges: TreeInputEdge[] }

/** `shape[d][c]` is the element count of capability c in domain d. */
function vault(shape: readonly (readonly number[])[], domainPrefix = "domain:"): Vault {
  const nodes = [concept("project:p", "project")];
  const edges: TreeInputEdge[] = [];
  shape.forEach((capabilities, d) => addDomain({ nodes, edges }, `${domainPrefix}${d}`, capabilities));
  return { nodes, edges };
}

function addDomain(target: Vault, domain: string, capabilities: readonly number[]): void {
  target.nodes.push(concept(domain, "domain"));
  target.edges.push(contains("project:p", domain));
  capabilities.forEach((elements, c) => {
    const capability = `capability:${domain}/${c}`;
    target.nodes.push(concept(capability, "capability"));
    target.edges.push(contains(domain, capability));
    for (let e = 0; e < elements; e += 1) addElement(target, capability, `element:${capability}/${e}`);
  });
}

function addElement(target: Vault, capability: string, id: string): void {
  target.nodes.push(concept(id, "element"));
  target.edges.push(contains(capability, id));
}

function layoutOf({ nodes, edges }: Vault): TreeLayout {
  return layoutTree(buildTreeModel(nodes, edges));
}

function at(layout: TreeLayout, id: string): [number, number, number] {
  const i = layout.model.indexOf.get(id)!;
  return [layout.position[i * 3]!, layout.position[i * 3 + 1]!, layout.position[i * 3 + 2]!];
}

function idsUnder(layout: TreeLayout, id: string): string[] {
  const root = layout.model.indexOf.get(id)!;
  const out: string[] = [];
  for (let i = root; i < layout.model.subtreeEnd[root]!; i += 1) {
    const found = layout.model.ids[i];
    if (found) out.push(found);
  }
  return out;
}

const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

/** A point relative to its hub, turned so the hub's azimuth is zero. */
function inHubFrame(point: readonly number[], hub: readonly number[]): [number, number, number] {
  const azimuth = Math.atan2(hub[2]!, hub[0]!);
  const x = point[0]! - hub[0]!, y = point[1]! - hub[1]!, z = point[2]! - hub[2]!;
  return [x * Math.cos(azimuth) + z * Math.sin(azimuth), y, -x * Math.sin(azimuth) + z * Math.cos(azimuth)];
}

describe("layoutTree", () => {
  it("lays out the same vault identically in any input order", () => {
    const base = vault([[3, 0, 14], [1, 2], [5], [2, 2, 2, 2, 2]]);
    base.nodes.push(concept("capability:loose", "capability"));
    base.edges.push(
      dependsOn("element:capability:domain:0/0/1", "capability:domain:1/1"),
      dependsOn("element:capability:domain:0/0/1", "capability:domain:0/2"),
      dependsOn("element:capability:domain:0/0/1", "capability:loose"),
      dependsOn("capability:domain:2/0", "capability:loose"),
    );
    const shuffled: Vault = {
      nodes: base.nodes.filter((_, k) => k % 2 === 1).concat(base.nodes.filter((_, k) => k % 2 === 0)).reverse(),
      edges: [...base.edges].reverse(),
    };
    const first = layoutOf(base);
    const second = layoutOf(shuffled);

    expect(second.model.ids).toEqual(first.model.ids);
    expect(second.model.needs).toEqual(first.model.needs);
    expect(second.position).toEqual(first.position);
    expect(second.control).toEqual(first.control);
    expect(second.bound).toEqual(first.bound);
  });

  it("moves no capability other than its own when an element is added", () => {
    const before = vault([[2, 3, 1, 4], [3, 3]]);
    const after = vault([[2, 3, 1, 4], [3, 3]]);
    addElement(after, "capability:domain:0/1", "element:capability:domain:0/1/added");
    const a = layoutOf(before);
    const b = layoutOf(after);

    for (const id of before.nodes.map((n) => n.id)) {
      if (id === "capability:domain:0/1" || id.startsWith("element:capability:domain:0/1/")) continue;
      expect(at(b, id), id).toEqual(at(a, id));
    }
  });

  it("leaves every other domain's crown unchanged when a capability is added", () => {
    const before = vault([[2, 3], [1, 1, 1], [4]]);
    const after = vault([[2, 3], [1, 1, 1], [4]]);
    after.nodes.push(concept("capability:domain:1/added", "capability"));
    after.edges.push(contains("domain:1", "capability:domain:1/added"));
    const a = layoutOf(before);
    const b = layoutOf(after);

    for (const domain of ["domain:0", "domain:2"]) {
      for (const id of idsUnder(a, domain)) expect(at(b, id), id).toEqual(at(a, id));
    }
  });

  it("keeps each crown's shape relative to its hub when a domain is added", () => {
    const before = vault([[2, 3, 1, 4, 2], [3, 3], [5]]);
    const after = vault([[2, 3, 1, 4, 2], [3, 3], [5]]);
    addDomain(after, "domain:!first", [2, 2]);
    const a = layoutOf(before);
    const b = layoutOf(after);

    for (const domain of ["domain:0", "domain:1", "domain:2"]) {
      expect(Math.atan2(at(b, domain)[2], at(b, domain)[0])).not.toBeCloseTo(Math.atan2(at(a, domain)[2], at(a, domain)[0]), 2);
      for (const id of idsUnder(a, domain)) {
        const was = inHubFrame(at(a, id), at(a, domain));
        const now = inHubFrame(at(b, id), at(b, domain));
        for (let c = 0; c < 3; c += 1) expect(now[c], id).toBeCloseTo(was[c]!, 2);
      }
    }
  });

  it("gives a capability with 300 elements one stem and no two leaves closer than the leaf pitch", () => {
    const layout = layoutOf(vault([[300, 2]]));
    const capability = layout.model.indexOf.get("capability:domain:0/0")!;
    const leaves: number[] = [];
    for (let i = capability + 1; i < layout.model.subtreeEnd[capability]!; i += 1) leaves.push(i);
    const pitch = layout.childPitch[capability]!;

    expect(leaves).toHaveLength(300);
    const stem = Array.from(layout.control.subarray(leaves[0]! * 6, leaves[0]! * 6 + 6));
    for (const leaf of leaves) expect(Array.from(layout.control.subarray(leaf * 6, leaf * 6 + 6))).toEqual(stem);
    let least = Number.POSITIVE_INFINITY;
    const p = (i: number) => [layout.position[i * 3]!, layout.position[i * 3 + 1]!, layout.position[i * 3 + 2]!];
    for (let x = 0; x < leaves.length; x += 1) {
      for (let y = x + 1; y < leaves.length; y += 1) least = Math.min(least, distance(p(leaves[x]!), p(leaves[y]!)));
    }
    expect(pitch).toBeGreaterThan(0);
    expect(least).toBeGreaterThanOrEqual(pitch);
  });

  it("grows the concepts of a vault with no domain from the trunk as its crown", () => {
    const layout = layoutOf({
      nodes: [concept("project:p", "project"), concept("capability:c", "capability"), concept("element:e", "element")],
      edges: [contains("project:p", "capability:c"), contains("capability:c", "element:e")],
    });
    const { model } = layout;
    const crown = model.looseRoot;
    const trunkTop = [layout.position[0]!, layout.position[1]!, layout.position[2]!];
    const crownAt = [layout.position[crown * 3]!, layout.position[crown * 3 + 1]!, layout.position[crown * 3 + 2]!];

    expect(model.parent[crown]).toBe(0);
    expect(model.subtreeEnd[crown]).toBe(model.count);
    expect(crownAt[0]).toBeCloseTo(trunkTop[0]!, 5);
    expect(crownAt[2]).toBeCloseTo(trunkTop[2]!, 5);
    expect(crownAt[1]).toBeGreaterThan(trunkTop[1]!);
  });

  it("holds every node of a subtree inside the subtree's sphere", () => {
    const base = vault([[3, 0, 20], [1, 2, 1, 1, 1, 1, 1], [5], [2, 2]]);
    base.nodes.push(concept("element:loose", "element"));
    const layout = layoutOf(base);
    const { model } = layout;

    for (let root = 0; root < model.count; root += 1) {
      const centre = [layout.bound[root * 4]!, layout.bound[root * 4 + 1]!, layout.bound[root * 4 + 2]!];
      const radius = layout.bound[root * 4 + 3]!;
      for (let i = root; i < model.subtreeEnd[root]!; i += 1) {
        const point = [layout.position[i * 3]!, layout.position[i * 3 + 1]!, layout.position[i * 3 + 2]!];
        expect(distance(point, centre), `${i} in ${root}`).toBeLessThanOrEqual(radius);
      }
    }
    expect(layout.radius).toBe(layout.bound[3]);
  });
});
