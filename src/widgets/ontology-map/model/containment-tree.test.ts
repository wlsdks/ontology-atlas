import { describe, expect, it } from "vitest";
import {
  domainOfNode,
  readContainmentTree,
  rollDependencies,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollDomainFlows,
  rollRelatesDomainPairs,
  type TreeInputEdge,
  type TreeInputNode,
} from "./containment-tree";

const node = (id: string): TreeInputNode => ({ id, label: id, kind: id.split(":")[0] as TreeInputNode["kind"] });
const contains = (source: string, target: string, relationType = "contains"): TreeInputEdge => ({
  source,
  target,
  kind: "contains",
  relationType,
});
const depends = (source: string, target: string, relationType = "depends_on"): TreeInputEdge => ({
  source,
  target,
  kind: "depends",
  relationType,
});

describe("readContainmentTree", () => {
  it("gives an element to the capability that lists it over a domain that also does", () => {
    const nodes = ["domain:d", "capability:c", "element:e"].map(node);
    const tree = readContainmentTree(nodes, [
      contains("domain:d", "capability:c"),
      contains("domain:d", "element:e"),
      contains("capability:c", "element:e"),
    ]);
    expect(tree.elementParent.get("element:e")).toBe("capability:c");
    expect(tree.capabilityElements.get("capability:c")).toEqual(["element:e"]);
    expect(tree.domainElementCount.get("domain:d")).toBe(1);
  });

  it("reads belongs_to from the child's side", () => {
    const nodes = ["domain:d", "capability:c"].map(node);
    const tree = readContainmentTree(nodes, [contains("capability:c", "domain:d", "belongs_to")]);
    expect(tree.capabilityDomain.get("capability:c")).toBe("domain:d");
  });
});

describe("rollDependencies", () => {
  const nodes = ["domain:d", "capability:a", "capability:b", "element:x", "element:y"].map(node);
  const tree = (edges: TreeInputEdge[]) =>
    readContainmentTree(nodes, [contains("capability:a", "element:x"), contains("capability:b", "element:y"), ...edges]);

  it("rolls element dependencies up to their capability without duplicates", () => {
    const edges = [depends("element:x", "element:y"), depends("element:x", "element:y"), depends("capability:a", "capability:b")];
    const deps = rollDependencies(tree(edges), edges);
    expect(deps.map((d) => [d.from, d.to])).toEqual([
      ["capability:a", "capability:b"],
      ["capability:a", "capability:b"],
    ]);
    expect(deps.map((d) => d.sourceId)).toEqual(["capability:a", "element:x"]);
  });

  it("ignores relates and contains", () => {
    const edges = [depends("capability:a", "capability:b", "relates"), contains("capability:a", "capability:b")];
    expect(rollDependencies(tree(edges), edges)).toEqual([]);
  });
});

describe("rollDomainFlows", () => {
  const domainOf = (id: string) => id.split("/")[0];

  it("merges opposite directions into one two-way flow with the summed count", () => {
    const flows = rollDomainFlows(
      [
        { from: "p/1", to: "q/1" },
        { from: "q/2", to: "p/2" },
        { from: "p/3", to: "q/3" },
        { from: "p/1", to: "p/2" },
      ],
      domainOf,
    );
    expect(flows).toEqual([{ fromDomain: "p", toDomain: "q", count: 3, twoWay: true }]);
  });

  it("sorts by count, then by the domain pair", () => {
    const flows = rollDomainFlows(
      [
        { from: "c/1", to: "d/1" },
        { from: "a/1", to: "b/1" },
        { from: "e/1", to: "f/1" },
        { from: "e/2", to: "f/2" },
      ],
      domainOf,
    );
    expect(flows.map((f) => f.fromDomain + f.toDomain)).toEqual(["ef", "ab", "cd"]);
  });
});

describe("rollDomainDependencies", () => {
  const nodes = ["domain:d1", "domain:d2", "capability:a", "capability:b", "element:x", "element:y", "element:z"].map(node);
  const shape = [
    contains("domain:d1", "capability:a"),
    contains("domain:d2", "capability:b"),
    contains("capability:a", "element:x"),
    contains("capability:b", "element:y"),
    contains("domain:d2", "element:z"),
  ];
  const roll = (edges: TreeInputEdge[]) => rollDomainDependencies(readContainmentTree(nodes, [...shape, ...edges]), edges);

  it("counts a domain-to-domain dependency with null capability ends", () => {
    expect(roll([depends("domain:d1", "domain:d2")])).toEqual([
      { sourceId: "domain:d1", targetId: "domain:d2", fromDomain: "domain:d1", toDomain: "domain:d2", fromCapability: null, toCapability: null },
    ]);
  });

  it("counts a domain-held element toward its domain", () => {
    expect(domainOfNode(readContainmentTree(nodes, shape), "element:z")).toBe("domain:d2");
    expect(roll([depends("capability:a", "element:z")])).toEqual([
      { sourceId: "capability:a", targetId: "element:z", fromDomain: "domain:d1", toDomain: "domain:d2", fromCapability: "capability:a", toCapability: null },
    ]);
  });

  it("rolls an element-to-element dependency across domains to capabilities and domains", () => {
    expect(roll([depends("element:x", "element:y")])).toEqual([
      { sourceId: "element:x", targetId: "element:y", fromDomain: "domain:d1", toDomain: "domain:d2", fromCapability: "capability:a", toCapability: "capability:b" },
    ]);
  });

  it("counts a duplicate source and target once and keeps same-domain entries", () => {
    const deps = roll([depends("element:x", "element:y"), depends("element:x", "element:y"), depends("element:x", "capability:a")]);
    expect(deps.map((d) => [d.sourceId, d.targetId])).toEqual([
      ["element:x", "element:y"],
      ["element:x", "capability:a"],
    ]);
  });
});

describe("rollRelatesDomainPairs", () => {
  it("gives one pair for related_to between a capability and another domain's element", () => {
    const nodes = ["domain:d1", "domain:d2", "capability:a", "capability:b", "element:y"].map(node);
    const edges = [
      contains("domain:d1", "capability:a"),
      contains("domain:d2", "capability:b"),
      contains("capability:b", "element:y"),
      depends("capability:a", "element:y", "related_to"),
      depends("element:y", "capability:a", "related_to"),
    ];
    expect(rollRelatesDomainPairs(readContainmentTree(nodes, edges), edges)).toEqual([{ a: "domain:d1", b: "domain:d2" }]);
  });
});

describe("rollDirectedDomainFlows", () => {
  const dep = (fromDomain: string, toDomain: string, n: number) => ({
    sourceId: `${fromDomain}-${n}`,
    targetId: `${toDomain}-${n}`,
    fromDomain,
    toDomain,
    fromCapability: null,
    toCapability: null,
  });

  it("splits a two-way pair into ab and ba with their total", () => {
    const flows = rollDirectedDomainFlows([dep("d1", "d2", 1), dep("d1", "d2", 2), dep("d2", "d1", 3), dep("d1", "d1", 4)], []);
    expect(flows).toEqual([{ key: "d1\0d2", a: "d1", b: "d2", ab: 2, ba: 1, total: 3, relatesOnly: false }]);
  });

  it("appends a relates-only pair with zero counts", () => {
    const flows = rollDirectedDomainFlows([dep("d1", "d2", 1)], [{ a: "d1", b: "d2" }, { a: "d3", b: "d1" }]);
    expect(flows.map((f) => [f.a, f.b, f.total, f.relatesOnly])).toEqual([
      ["d1", "d2", 1, false],
      ["d1", "d3", 0, true],
    ]);
  });

  it("sorts by total, then by key", () => {
    const flows = rollDirectedDomainFlows(
      [dep("d3", "d4", 1), dep("d2", "d1", 2), dep("d5", "d6", 3), dep("d6", "d5", 4)],
      [{ a: "d0", b: "d9" }],
    );
    expect(flows.map((f) => f.key)).toEqual(["d5\0d6", "d1\0d2", "d3\0d4", "d0\0d9"]);
  });
});
