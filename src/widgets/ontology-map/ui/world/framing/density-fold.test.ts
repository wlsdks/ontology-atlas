import { describe, expect, it } from "vitest";

import { DENSITY_GATE_THRESHOLD } from "../../../model/layout/density-gate";
import type { LayoutGraphNode } from "../../../model/layout/layout";
import { computeRelaxScope } from "./density-fold";

function crowdedDomain(childCount: number): LayoutGraphNode[] {
  return [
    { id: "p", kind: "project", parentId: null },
    { id: "d", kind: "domain", parentId: "p" },
    ...Array.from({ length: childCount }, (_, i): LayoutGraphNode => ({ id: `c${i}`, kind: "capability", parentId: "d" })),
  ];
}

describe("computeRelaxScope", () => {
  it("leaves out the children a crowded parent folds behind its chip", () => {
    const scope = computeRelaxScope(crowdedDomain(DENSITY_GATE_THRESHOLD + 1));
    expect([...scope].sort()).toEqual(["d", "p"]);
  });

  it("keeps every node of a parent at or under the fold threshold", () => {
    const scope = computeRelaxScope(crowdedDomain(DENSITY_GATE_THRESHOLD));
    expect(scope.size).toBe(DENSITY_GATE_THRESHOLD + 2);
  });
});
