import { describe, expect, it } from "vitest";
import { buildProjectSourceReceipt, deriveProjectSourceView } from "@/shared/lib/project-source/project-source-receipt";
import { resolveProjectSourceRepair } from "./project-source-repair";

const probe = { sourceId: "source", kind: "git" as const, revision: "abc", fingerprint: "abc", dirty: false, truncated: false, files: [] };
const witness = { id: "elements/checkout:path", nodeSlug: "elements/checkout", role: "implementation", path: "src/missing.ts" };
const node = { id: "element:checkout", kind: "element", title: "Checkout", agentSlug: witness.nodeSlug, projectIds: ["shop"] };
function view() {
  const receipt = buildProjectSourceReceipt({ projectSlug: "shop", graphHash: "graph", probe, witnesses: [witness] });
  return deriveProjectSourceView({ projectSlug: "shop", graphHash: "graph", probe, bindings: [{ projectSlug: "shop", sourceId: "source", kind: "git", rootPath: "/private/shop", boundAt: receipt.measuredAt, receipt }] });
}

describe("source repair target", () => {
  it("opens the exact contained concept with the current missing witness", () => {
    expect(resolveProjectSourceRepair({ view: view(), projectSlug: "shop", graphHash: "graph", nodes: [node], witnesses: [witness] })).toEqual({ nodeId: node.id, title: node.title, nodeSlug: witness.nodeSlug, path: witness.path });
  });
  it.each([
    { name: "deleted concept", nodes: [] },
    { name: "foreign project", nodes: [{ ...node, projectIds: ["other"] }] },
    { name: "ambiguous concept", nodes: [node, { ...node, id: "other" }] },
    { name: "stale graph", graphHash: "changed" },
    { name: "project switch", projectSlug: "other" },
    { name: "changed witness", witnesses: [{ ...witness, path: "src/current.ts" }] },
    { name: "unrecorded target", view: { ...view(), nextAction: { id: "repair_source_path" as const, target: "elements/elsewhere" } } },
  ])("refuses $name", (change) => {
    expect(resolveProjectSourceRepair({ view: view(), projectSlug: "shop", graphHash: "graph", nodes: [node], witnesses: [witness], ...change })).toBeNull();
  });
});
