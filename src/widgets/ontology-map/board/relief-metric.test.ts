import { describe, expect, it } from "vitest";
import type { TreeInputEdge, TreeInputNode } from "../model/containment-tree";
import { declaredDependents } from "./relief-metric";

const node = (id: string, kind: TreeInputNode["kind"]): TreeInputNode => ({ id, label: id, kind });
const contains = (source: string, target: string): TreeInputEdge => ({ source, target, kind: "contains", relationType: "contains" });
const depends = (source: string, target: string, relationType = "depends_on"): TreeInputEdge => ({ source, target, kind: "depends", relationType });

function board(extra: TreeInputEdge[]) {
  const nodes = [
    node("p", "project"),
    node("d1", "domain"),
    node("d2", "domain"),
    node("c1", "capability"),
    node("c2", "capability"),
    node("c3", "capability"),
    node("e1", "element"),
    node("e2", "element"),
    node("e3", "element"),
    node("e4", "element"),
  ];
  const edges = [
    contains("p", "d1"),
    contains("p", "d2"),
    contains("d1", "c1"),
    contains("d1", "c3"),
    contains("d2", "c2"),
    contains("c1", "e1"),
    contains("c1", "e2"),
    contains("c2", "e3"),
    contains("d2", "e4"),
    ...extra,
  ];
  return declaredDependents(nodes, edges);
}

describe("declaredDependents", () => {
  it("counts each outside concept once, whether it names the capability or one of its elements", () => {
    const m = board([depends("c2", "c1"), depends("e3", "e1"), depends("e3", "c1"), depends("e3", "e2")]);
    expect(m.capability.get("c1")).toBe(2);
    expect(m.capability.get("c2")).toBe(0);
    expect(m.capabilityMax).toBe(2);
  });

  it("leaves out declarations from inside the capability's own subtree", () => {
    const m = board([depends("e2", "e1"), depends("c1", "e1"), depends("e1", "c1")]);
    expect(m.capability.get("c1")).toBe(0);
    expect(m.region.get("d1")).toBe(0);
  });

  it("counts a sibling capability for the capability but not for its own region", () => {
    const m = board([depends("c3", "c1")]);
    expect(m.capability.get("c1")).toBe(1);
    expect(m.region.get("d1")).toBe(0);
  });

  it("rolls a region up over its capabilities, their elements and its direct elements", () => {
    const m = board([depends("c1", "c2"), depends("e1", "e3"), depends("c3", "e4"), depends("e2", "e4")]);
    expect(m.region.get("d2")).toBe(4);
    expect(m.region.get("d1")).toBe(0);
    expect(m.regionMax).toBe(4);
    expect(m.capability.get("c2")).toBe(2);
  });

  it("reads the dependencies alias and ignores relates and containment", () => {
    const m = board([depends("c2", "c1", "dependencies"), depends("e3", "c1", "relates"), contains("c2", "e1")]);
    expect(m.capability.get("c1")).toBe(1);
  });

  it("is direct only: a dependent of a dependent adds nothing", () => {
    const m = board([depends("c3", "c1"), depends("c2", "c3")]);
    expect(m.capability.get("c1")).toBe(1);
    expect(m.capability.get("c3")).toBe(1);
  });

  it("counts a project that declares dependencies on a capability", () => {
    const m = board([depends("p", "c1", "dependencies")]);
    expect(m.capability.get("c1")).toBe(1);
    expect(m.region.get("d1")).toBe(1);
  });
});
