import { describe, expect, it } from "vitest";
import { buildTreeModel } from "../../model/tree-view/tree-model";
import { treeWalkTarget } from "./use-tree-keyboard";

const contains = (source: string, target: string) => ({ source, target, kind: "contains" as const, relationType: "contains" });
const capabilities = ["c0", "c1", "c2", "c3", "c4", "c5"].map((id) => `capability:${id}`);
/** Six capabilities under one domain: more than three, so they hang from forks. */
const model = buildTreeModel(
  [
    { id: "project:p", label: "Project", kind: "project" },
    { id: "domain:d", label: "Domain", kind: "domain" },
    ...capabilities.map((id) => ({ id, label: id, kind: "capability" as const })),
  ],
  [contains("project:p", "domain:d"), ...capabilities.map((id) => contains("domain:d", id))],
);
const at = (id: string) => model.indexOf.get(id)!;
const idOf = (node: number) => (node < 0 ? null : model.ids[node]);

describe("walking the tree with the arrow keys", () => {
  it("moves up to the parent concept and right to the next sibling, through the forks between them", () => {
    expect(model.kinds.includes("fork")).toBe(true);
    for (let k = 0; k < capabilities.length; k += 1) {
      expect(idOf(treeWalkTarget(model, at(capabilities[k]!), "ArrowUp"))).toBe("domain:d");
      expect(idOf(treeWalkTarget(model, at(capabilities[k]!), "ArrowRight"))).toBe(capabilities[k + 1] ?? null);
    }
  });
});
