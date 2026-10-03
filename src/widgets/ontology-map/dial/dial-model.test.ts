import { describe, expect, it } from "vitest";

import {
  readContainmentTree,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollRelatesDomainPairs,
  type TreeInputEdge,
  type TreeInputNode,
} from "../model/containment-tree";
import { buildDialModel, dialConceptTotal, dialEvidenceView, resolveDialAttention } from "./dial-model";
import type { DialEvidence } from "./types";

const node = (id: string, kind: TreeInputNode["kind"]): TreeInputNode => ({ id, label: id.toUpperCase(), kind });
const contains = (source: string, target: string): TreeInputEdge => ({ source, target, kind: "contains", relationType: "contains" });
const depends = (source: string, target: string): TreeInputEdge => ({ source, target, kind: "depends", relationType: "depends_on" });

function modelOf(nodes: TreeInputNode[], edges: TreeInputEdge[]) {
  const tree = readContainmentTree(nodes, edges);
  const dependencies = rollDomainDependencies(tree, edges);
  const flows = rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, edges));
  return buildDialModel({ tree, dependencies, flows, elementIds: nodes.filter((n) => n.kind === "element").map((n) => n.id) });
}

const fixture = () =>
  modelOf(
    [
      node("p", "project"),
      node("d1", "domain"),
      node("d2", "domain"),
      node("c1", "capability"),
      node("c2", "capability"),
      node("c3", "capability"),
      node("e1", "element"),
      node("e2", "element"),
      node("x", "element"),
      node("loose", "capability"),
    ],
    [
      contains("p", "d1"),
      contains("p", "d2"),
      contains("d1", "c1"),
      contains("d1", "c2"),
      contains("d2", "c3"),
      contains("c1", "e1"),
      contains("d2", "e2"),
      depends("e1", "c3"),
      depends("c2", "c1"),
      depends("d2", "d1"),
      depends("c3", "c1"),
    ],
  );


describe("buildDialModel", () => {
  it("totals every concept it holds, orphans and the project included", () => {
    expect(dialConceptTotal(fixture())).toBe(10);
  });

  it("counts a direct element, an orphan and a domain-level dependency", () => {
    const m = fixture();
    expect(m.projectId).toBe("p");
    expect(m.domains.map((d) => d.id)).toEqual(["d1", "d2"]);
    expect(m.domainById.get("d1")).toMatchObject({ capabilityIds: ["c1", "c2"], directElementIds: [], elementCount: 1 });
    expect(m.domainById.get("d2")).toMatchObject({ capabilityIds: ["c3"], directElementIds: ["e2"], elementCount: 1 });
    expect(m.orphanIds).toEqual(["loose", "x"]);
    expect(m.domainOf.get("e1")).toBe("d1");
    expect(m.domainOf.get("x")).toBeNull();
    expect(m.capabilityOf.get("e1")).toBe("c1");
    expect(m.flows).toEqual([{ key: "d1\0d2", a: "d1", b: "d2", ab: 1, ba: 2, total: 3, relatesOnly: false }]);
    expect(m.capabilityById.get("c1")).toMatchObject({ needsAcross: 1, usedAcross: 1, elementIds: ["e1"] });
    expect(m.capabilityById.get("c3")).toMatchObject({ needsAcross: 1, usedAcross: 1 });
    expect(m.capabilityDependencies).toEqual([
      { from: "c1", to: "c3", fromDomain: "d1", toDomain: "d2" },
      { from: "c2", to: "c1", fromDomain: "d1", toDomain: "d1" },
      { from: "c3", to: "c1", fromDomain: "d2", toDomain: "d1" },
    ]);
  });
});

describe("dialEvidenceView", () => {
  it("is unmeasured without evidence and caches by map identity", () => {
    const m = fixture();
    const none = dialEvidenceView(m, null);
    expect(none.measured).toBe(false);
    expect(none.stateOf("c1")).toBe("unknown");
    const evidence = new Map<string, DialEvidence>([["c1", "stale"], ["c2", "stale"], ["c3", "current"]]);
    const view = dialEvidenceView(m, evidence);
    expect(view.measured).toBe(true);
    expect(view.stateOf("c3")).toBe("current");
    expect(view.staleByDomain.get("d1")).toBe(2);
    expect(dialEvidenceView(m, evidence)).toBe(view);
    expect(dialEvidenceView(m, new Map(evidence))).not.toBe(view);
  });
});

describe("resolveDialAttention", () => {
  it("attends a domain with its partners and reached capabilities", () => {
    const a = resolveDialAttention(fixture(), "d1", null);
    expect(a).toMatchObject({ key: "d1||0", domainId: "d1", capabilityId: null, selected: false });
    expect([...a.needsCaps]).toEqual(["c3"]);
    expect([...a.usedByCaps]).toEqual(["c3"]);
    expect([...a.partnerDomains]).toEqual(["d2"]);
  });

  it("attends a capability and lets its siblings recede", () => {
    const m = modelOf(
      [node("d1", "domain"), node("d2", "domain"), node("c1", "capability"), node("c2", "capability"), node("c3", "capability")],
      [contains("d1", "c1"), contains("d1", "c2"), contains("d2", "c3"), depends("c1", "c3")],
    );
    const a = resolveDialAttention(m, null, "c1");
    expect(a.key).toBe("d1|c1|1");
    expect([...a.needsCaps]).toEqual(["c3"]);
    expect(a.usedByCaps.size).toBe(0);
    expect(a.needsCaps.has("c2") || a.usedByCaps.has("c2")).toBe(false);
    expect([...a.partnerDomains]).toEqual(["d2"]);
  });

  it("resolves an element to its capability, and an orphan to nothing", () => {
    const m = fixture();
    expect(resolveDialAttention(m, "e1", null)).toMatchObject({ domainId: "d1", capabilityId: "c1" });
    expect(resolveDialAttention(m, "e2", null)).toMatchObject({ domainId: "d2", capabilityId: null });
    expect(resolveDialAttention(m, "x", "loose")).toMatchObject({ key: "||1", domainId: null, capabilityId: null });
  });
});

