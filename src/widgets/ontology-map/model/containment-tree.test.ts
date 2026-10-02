import { describe, expect, it } from "vitest";
import { readContainmentTree, rollDependencies, rollDomainFlows, type TreeInputEdge, type TreeInputNode } from "./containment-tree";

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
