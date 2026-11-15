import { describe, expect, it } from "vitest";
import type { TreeInputEdge, TreeInputNode } from "../containment-tree";
import { layoutTree } from "./tree-layout";
import { buildTreeModel } from "./tree-model";
import type { TreeLayout } from "./types";

const concept = (id: string, kind: TreeInputNode["kind"]): TreeInputNode => ({ id, label: id, kind });
const contains = (parent: string, child: string): TreeInputEdge => ({ source: parent, target: child, kind: "contains", relationType: "contains" });
const dependsOn = (from: string, to: string): TreeInputEdge => ({ source: from, target: to, kind: "depends", relationType: "depends_on" });

/** Least gap between two capabilities of one crown, world units; measured 29.2 over 2..400 siblings. */
const CAPABILITY_GAP_FLOOR = 25;

interface Vault { nodes: TreeInputNode[]; edges: TreeInputEdge[] }

/** `shape[d][c]` is the element count of capability c in domain d. */
function vault(shape: readonly (readonly number[])[]): Vault {
  const nodes = [concept("project:p", "project")];
  const edges: TreeInputEdge[] = [];
  shape.forEach((capabilities, d) => addDomain({ nodes, edges }, `domain:${String(d).padStart(2, "0")}`, capabilities));
  return { nodes, edges };
}

function addDomain(target: Vault, domain: string, capabilities: readonly number[]): void {
  target.nodes.push(concept(domain, "domain"));
  target.edges.push(contains("project:p", domain));
  capabilities.forEach((elements, c) => {
    const capability = `capability:${domain}/${String(c).padStart(3, "0")}`;
    target.nodes.push(concept(capability, "capability"));
    target.edges.push(contains(domain, capability));
    for (let e = 0; e < elements; e += 1) addElement(target, capability, `element:${capability}/${e}`);
  });
}

function addElement(target: Vault, holder: string, id: string): void {
  target.nodes.push(concept(id, "element"));
  target.edges.push(contains(holder, id));
}

function layoutOf({ nodes, edges }: Vault): TreeLayout {
  return layoutTree(buildTreeModel(nodes, edges));
}

const point = (layout: TreeLayout, i: number): [number, number, number] => [layout.position[i * 3]!, layout.position[i * 3 + 1]!, layout.position[i * 3 + 2]!];
const controls = (layout: TreeLayout, i: number): number[][] => [
  Array.from(layout.control.subarray(i * 6, i * 6 + 3)),
  Array.from(layout.control.subarray(i * 6 + 3, i * 6 + 6)),
];
const at = (layout: TreeLayout, id: string) => point(layout, layout.model.indexOf.get(id)!);
const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

function childrenOf(layout: TreeLayout, node: number): number[] {
  const out: number[] = [];
  for (let j = node + 1; j < layout.model.subtreeEnd[node]!; j = layout.model.subtreeEnd[j]!) out.push(j);
  return out;
}

function leastGap(layout: TreeLayout, nodes: readonly number[]): number {
  let least = Number.POSITIVE_INFINITY;
  for (let x = 0; x < nodes.length; x += 1) {
    for (let y = x + 1; y < nodes.length; y += 1) least = Math.min(least, distance(point(layout, nodes[x]!), point(layout, nodes[y]!)));
  }
  return least;
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

/** A point relative to its hub, turned so the hub's azimuth is zero. */
function inHubFrame(p: readonly number[], hub: readonly number[]): [number, number, number] {
  const azimuth = Math.atan2(hub[2]!, hub[0]!);
  const x = p[0]! - hub[0]!, y = p[1]! - hub[1]!, z = p[2]! - hub[2]!;
  return [x * Math.cos(azimuth) + z * Math.sin(azimuth), y, -x * Math.sin(azimuth) + z * Math.cos(azimuth)];
}

describe("layoutTree", () => {
  it("lays out the same vault identically in any input order", () => {
    const base = vault([[3, 0, 14], [1, 2], [5], [2, 2, 2, 2, 2]]);
    base.nodes.push(concept("capability:loose", "capability"));
    base.edges.push(
      dependsOn("element:capability:domain:00/000/1", "capability:domain:01/001"),
      dependsOn("element:capability:domain:00/000/1", "capability:domain:00/002"),
      dependsOn("element:capability:domain:00/000/1", "capability:loose"),
      dependsOn("capability:domain:02/000", "capability:loose"),
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
    addElement(after, "capability:domain:00/001", "element:capability:domain:00/001/added");
    const a = layoutOf(before);
    const b = layoutOf(after);

    for (const id of before.nodes.map((n) => n.id)) {
      if (id === "capability:domain:00/001" || id.startsWith("element:capability:domain:00/001/")) continue;
      expect(at(b, id), id).toEqual(at(a, id));
    }
  });

  it("leaves every other domain's crown unchanged when a capability is added", () => {
    const before = vault([[2, 3], [1, 1, 1], [4]]);
    const after = vault([[2, 3], [1, 1, 1], [4]]);
    after.nodes.push(concept("capability:domain:01/added", "capability"));
    after.edges.push(contains("domain:01", "capability:domain:01/added"));
    const a = layoutOf(before);
    const b = layoutOf(after);

    for (const domain of ["domain:00", "domain:02"]) {
      for (const id of idsUnder(a, domain)) expect(at(b, id), id).toEqual(at(a, id));
    }
  });

  it("keeps each crown's shape relative to its hub when a domain is added", () => {
    const before = vault([[2, 3, 1, 4, 2], [3, 3], [5]]);
    const after = vault([[2, 3, 1, 4, 2], [3, 3], [5]]);
    addDomain(after, "domain:!first", [2, 2]);
    const a = layoutOf(before);
    const b = layoutOf(after);

    for (const domain of ["domain:00", "domain:01", "domain:02"]) {
      expect(Math.atan2(at(b, domain)[2], at(b, domain)[0])).not.toBeCloseTo(Math.atan2(at(a, domain)[2], at(a, domain)[0]), 2);
      for (const id of idsUnder(a, domain)) {
        const was = inHubFrame(at(a, id), at(a, domain));
        const now = inHubFrame(at(b, id), at(b, domain));
        for (let c = 0; c < 3; c += 1) expect(now[c], id).toBeCloseTo(was[c]!, 2);
      }
    }
  });

  it("adds the loose fork without moving any bough", () => {
    const before = vault(Array.from({ length: 13 }, () => [1, 2]));
    const after = vault(Array.from({ length: 13 }, () => [1, 2]));
    after.nodes.push(concept("capability:orphan", "capability"));
    const a = layoutOf(before);
    const b = layoutOf(after);

    expect(b.model.looseRoot).toBeGreaterThan(0);
    for (let d = 0; d < 13; d += 1) {
      const domain = `domain:${String(d).padStart(2, "0")}`;
      expect(controls(b, b.model.indexOf.get(domain)!), domain).toEqual(controls(a, a.model.indexOf.get(domain)!));
      expect(at(b, domain), domain).toEqual(at(a, domain));
    }
  });

  it("keeps the capabilities of one crown apart at every sibling count from 2 to 400", () => {
    let least = { siblings: 0, gap: Number.POSITIVE_INFINITY };
    for (let siblings = 2; siblings <= 400; siblings += 1) {
      const layout = layoutOf(vault([new Array<number>(siblings).fill(0)]));
      const capabilities: number[] = [];
      for (let i = 0; i < layout.model.count; i += 1) if (layout.model.kinds[i] === "capability") capabilities.push(i);
      const gap = leastGap(layout, capabilities);
      if (gap < least.gap) least = { siblings, gap };
    }
    expect(least.gap, `at ${least.siblings} siblings`).toBeGreaterThanOrEqual(CAPABILITY_GAP_FLOOR);
  });

  it("gives a capability with 300 elements one stem and reports its leaves' least spacing", () => {
    const layout = layoutOf(vault([[300, 0, 0, 0, 0]]));
    const capability = layout.model.indexOf.get("capability:domain:00/000")!;
    const leaves = childrenOf(layout, capability);
    const least = leastGap(layout, leaves);

    expect(leaves).toHaveLength(300);
    for (const leaf of leaves) expect(controls(layout, leaf)).toEqual(controls(layout, leaves[0]!));
    expect(least).toBeGreaterThanOrEqual(layout.childPitch[capability]!);
    expect(layout.childPitch[capability]).toBeGreaterThan(0.9 * least);
  });

  it("stands a capability with a packed head out from its hub by the head's width", () => {
    const twigs = layoutOf(vault([[12, 0, 0, 0, 0]]));
    const head = layoutOf(vault([[300, 0, 0, 0, 0]]));
    const reach = (layout: TreeLayout) => distance(at(layout, "capability:domain:00/000"), at(layout, "domain:00"));
    const capability = head.model.indexOf.get("capability:domain:00/000")!;
    const headCentre = controls(head, childrenOf(head, capability)[0]!)[1]!;
    const headWidth = Math.max(...childrenOf(head, capability).map((leaf) => distance(point(head, leaf), headCentre)));

    expect(reach(head) - reach(twigs)).toBeGreaterThanOrEqual(0.95 * headWidth);
  });

  it("reports a forked parent's spacing from its concepts, not from its forks", () => {
    const layout = layoutOf(vault([[0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0]]));
    const conceptGap = (holder: number): number => {
      const kids = childrenOf(layout, holder);
      if (layout.model.kinds[kids[0]!] !== "fork") return leastGap(layout, kids);
      return Math.min(...kids.map(conceptGap));
    };

    for (const domain of ["domain:00", "domain:01", "domain:02"]) {
      const index = layout.model.indexOf.get(domain)!;
      expect(layout.childPitch[index], domain).toBeCloseTo(conceptGap(index), 3);
    }
  });

  it("measures reach along the branches from the trunk base, 1 at the farthest node", () => {
    const layout = layoutOf(vault([[3, 0, 20], [1, 2], [5]]));
    let farthest = 0;

    for (let i = 1; i < layout.model.count; i += 1) {
      expect(layout.reach[i]!).toBeGreaterThan(layout.reach[layout.model.parent[i]!]!);
      farthest = Math.max(farthest, layout.reach[i]!);
    }
    expect(layout.reach[0]!).toBeGreaterThan(0);
    expect(farthest).toBe(1);
  });

  it("grows the concepts of a vault with no domain from the trunk as its crown, its own leaves rising", () => {
    const layout = layoutOf({
      nodes: [concept("project:p", "project"), concept("capability:c", "capability"), concept("element:e", "element"), concept("element:held", "element"), concept("element:orphan", "element")],
      edges: [contains("project:p", "capability:c"), contains("capability:c", "element:e"), contains("project:p", "element:held")],
    });
    const { model } = layout;
    const crown = point(layout, model.looseRoot);
    const trunkTop = point(layout, 0);

    expect(model.parent[model.looseRoot]).toBe(0);
    expect(model.subtreeEnd[model.looseRoot]).toBe(model.count);
    expect(crown[0]).toBeCloseTo(trunkTop[0], 5);
    expect(crown[2]).toBeCloseTo(trunkTop[2], 5);
    expect(crown[1]).toBeGreaterThan(trunkTop[1]);
    for (const leaf of ["element:held", "element:orphan"]) expect(at(layout, leaf)[1], leaf).toBeGreaterThan(crown[1]);
  });

  it("holds every node and branch of a subtree inside the subtree's sphere", () => {
    const base = vault([[3, 0, 20], [1, 2, 1, 1, 1, 1, 1], [5], [2, 2]]);
    base.nodes.push(concept("element:loose", "element"));
    const layout = layoutOf(base);
    const { model } = layout;

    for (let root = 0; root < model.count; root += 1) {
      const centre = Array.from(layout.bound.subarray(root * 4, root * 4 + 3));
      const radius = layout.bound[root * 4 + 3]!;
      for (let i = root; i < model.subtreeEnd[root]!; i += 1) {
        for (const p of [point(layout, i), ...controls(layout, i)]) expect(distance(p, centre), `${i} in ${root}`).toBeLessThanOrEqual(radius);
      }
    }
  });

  it("holds the whole tree in the least sphere centred on the trunk axis", () => {
    const layout = layoutOf(vault([[3, 0, 20], [1, 2, 1, 1, 1, 1, 1], [5], [2, 2]]));
    const { centre, radius } = layout;
    const points = [[0, 0, 0]];
    for (let i = 0; i < layout.model.count; i += 1) points.push(point(layout, i), ...controls(layout, i));
    const farthest = (c: readonly number[]) => Math.max(...points.map((p) => distance(p, c)));

    expect(centre[0]).toBe(0);
    expect(centre[2]).toBe(0);
    expect(farthest(centre)).toBeLessThanOrEqual(radius);
    for (const shift of [-5, 5]) expect(farthest([0, centre[1] + shift, 0])).toBeGreaterThan(radius - 0.5);
  });
});
