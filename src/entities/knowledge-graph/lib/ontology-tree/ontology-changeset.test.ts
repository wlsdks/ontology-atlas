import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../../model";
import { acknowledgeNodeChange, computeOntologyChangeset, snapshotOntology } from "./ontology-changeset";

function node(id: string, kind: string, title = id, summary?: string): KnowledgeGraphNode {
  return {
    id, title, kind, summary,
    projectIds: [], evidenceIds: [],
    lastApprovedAt: new Date(0), lastApprovedBy: "t",
  };
}
function edge(from: string, to: string, type = "contains"): KnowledgeGraphEdge {
  return {
    id: `${from}-${to}`, from, to, type,
    projectIds: [], evidenceIds: [], lastApprovedAt: new Date(0), lastApprovedBy: "t",
  };
}

const baseNodes = [node("a", "domain"), node("b", "capability"), node("c", "element")];
const baseEdges = [edge("a", "b"), edge("b", "c")];

describe("ontology-changeset", () => {
  it("returns an empty changeset for a null baseline", () => {
    const cs = computeOntologyChangeset(null, baseNodes, baseEdges);
    expect(cs.total).toBe(0);
    expect(cs.touchedNodeIds.size).toBe(0);
  });

  it("reports no change for an identical graph", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    const cs = computeOntologyChangeset(snap, baseNodes, baseEdges);
    expect(cs.total).toBe(0);
  });

  it("reports an added node as added and touched", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    const cs = computeOntologyChangeset(snap, [...baseNodes, node("d", "element")], baseEdges);
    expect(cs.addedNodes).toEqual(["d"]);
    expect(cs.touchedNodeIds.has("d")).toBe(true);
    expect(cs.removedNodes).toEqual([]);
  });

  it("reports a removed node as removed, not touched", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    const cs = computeOntologyChangeset(snap, [node("a", "domain"), node("b", "capability")], baseEdges);
    expect(cs.removedNodes).toEqual(["c"]);
    expect(cs.touchedNodeIds.has("c")).toBe(false);
  });

  it("keeps the baseline kind of a removed node", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    // `c` (element) is deleted. It is gone from the current graph, so the baseline must
    // remember its kind — that is what makes "an agent deleted a domain" triageable.
    const cs = computeOntologyChangeset(snap, [node("a", "domain"), node("b", "capability")], baseEdges);
    expect(cs.removedNodeKinds.get("c")).toBe("element");
  });

  it("returns empty removedNodeKinds without removals", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    const cs = computeOntologyChangeset(snap, [...baseNodes, node("d", "element")], baseEdges);
    expect(cs.removedNodeKinds.size).toBe(0);
  });

  it("returns empty removedNodeKinds for a null baseline", () => {
    const cs = computeOntologyChangeset(null, baseNodes, baseEdges);
    expect(cs.removedNodeKinds.size).toBe(0);
  });

  it("reports a title or summary change as changed", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    const changed = [node("a", "domain"), node("b", "capability", "B renamed"), node("c", "element")];
    const cs = computeOntologyChangeset(snap, changed, baseEdges);
    expect(cs.changedNodes).toEqual(["b"]);
    expect(cs.touchedNodeIds.has("b")).toBe(true);
  });

  it("reports added and removed edges and their endpoints", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    // a→c added, b→c removed.
    const newEdges = [edge("a", "b"), edge("a", "c")];
    const cs = computeOntologyChangeset(snap, baseNodes, newEdges);
    expect(cs.addedEdges.some((k) => k.includes("a") && k.includes("c"))).toBe(true);
    expect(cs.removedEdges.some((k) => k.includes("b") && k.includes("c"))).toBe(true);
    // `a`'s outgoing edges changed, so `a` is changed; `b` lost b→c, so `b` is too.
    expect(cs.changedNodes).toContain("a");
    expect(cs.changedNodes).toContain("b");
  });

  it("ignores coordinate and timestamp changes", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    // Identical content, only `lastApprovedAt` differs.
    const sameContent = baseNodes.map((n) => ({ ...n, lastApprovedAt: new Date(999) }));
    const cs = computeOntologyChangeset(snap, sameContent, baseEdges);
    expect(cs.total).toBe(0);
  });

  // If edge and node signatures concatenated their fields *without a separator*, two
  // different inputs whose field boundary moved would collide on the same string and the
  // change would be missed. The next two cases reproduce that collision; only a safe
  // separator passes them.
  it("distinguishes edge swaps whose concatenations collide", () => {
    const nodes = [
      node("a", "domain"),
      node("ab", "domain"),
      node("bc", "element"),
      node("c", "element"),
    ];
    // baseline a→bc vs current ab→c: with an empty separator both keys become "abcd".
    const baseline = snapshotOntology(nodes, [edge("a", "bc", "d")], 1);
    const cs = computeOntologyChangeset(baseline, nodes, [edge("ab", "c", "d")]);
    expect(cs.removedEdges).toHaveLength(1); // Remove a→bc
    expect(cs.addedEdges).toHaveLength(1); // Add ab→c
  });

  it("detects a shifted kind and title boundary", () => {
    // The same id 'x' goes from kind="a"/title="b" to kind="ab"/title="". With an empty
    // separator both signatures are "ab" and the change is missed.
    const baseline = snapshotOntology([node("x", "a", "b")], [], 1);
    const cs = computeOntologyChangeset(baseline, [node("x", "ab", "")], []);
    expect(cs.changedNodes).toContain("x");
  });
});

// Per-node "mark reviewed" advances the baseline for that one node. Non-destructive: the
// vault .md is untouched, only the in-memory baseline snapshot moves. The acknowledged node
// drops out of the changeset, and a *subsequent* edit re-flags it, so no change is missed.
// Reuses the shipped changeset machinery rather than a separate reviewed-set.
describe("acknowledgeNodeChange", () => {
  it("drops an approved changed node and keeps other changes", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    const current = [node("a", "domain", "A renamed"), node("b", "capability", "B renamed"), node("c", "element")];
    // Both `a` and `b` are changed.
    expect(computeOntologyChangeset(snap, current, baseEdges).changedNodes.sort()).toEqual(["a", "b"]);
    const acked = acknowledgeNodeChange(snap, "a", current, baseEdges);
    const cs = computeOntologyChangeset(acked, current, baseEdges);
    expect(cs.changedNodes).toEqual(["b"]); // a is reviewed → omitted, b remains
  });

  it("flags a node again when it is edited after approval", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    const v1 = [node("a", "domain", "A v1"), node("b", "capability"), node("c", "element")];
    const acked = acknowledgeNodeChange(snap, "a", v1, baseEdges);
    expect(computeOntologyChangeset(acked, v1, baseEdges).changedNodes).toEqual([]); // Clean immediately after approval
    const v2 = [node("a", "domain", "A v2 edited again"), node("b", "capability"), node("c", "element")];
    expect(computeOntologyChangeset(acked, v2, baseEdges).changedNodes).toEqual(["a"]); // Re-edit → re-flag
  });

  it("stops reporting an approved added node", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    const current = [...baseNodes, node("d", "element")];
    expect(computeOntologyChangeset(snap, current, baseEdges).addedNodes).toEqual(["d"]);
    const acked = acknowledgeNodeChange(snap, "d", current, baseEdges);
    expect(computeOntologyChangeset(acked, current, baseEdges).addedNodes).toEqual([]);
  });

  it("stops reporting an approved removed node", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    const current = [node("a", "domain"), node("b", "capability")]; // c deleted
    expect(computeOntologyChangeset(snap, current, baseEdges).removedNodes).toEqual(["c"]);
    const acked = acknowledgeNodeChange(snap, "c", current, baseEdges);
    expect(computeOntologyChangeset(acked, current, baseEdges).removedNodes).toEqual([]);
  });

  it("syncs an approved node's outgoing edges", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    // Add the a→c edge, which changes `a`'s outgoing set.
    const newEdges = [edge("a", "b"), edge("b", "c"), edge("a", "c")];
    const before = computeOntologyChangeset(snap, baseNodes, newEdges);
    expect(before.addedEdges.length).toBe(1);
    const acked = acknowledgeNodeChange(snap, "a", baseNodes, newEdges);
    const cs = computeOntologyChangeset(acked, baseNodes, newEdges);
    expect(cs.addedEdges).toEqual([]); // a's new outgoing edge incorporated into baseline
    expect(cs.changedNodes).toEqual([]); // a is no longer changed
  });

  it("returns a new snapshot and leaves the original unchanged", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    const current = [node("a", "domain", "A renamed"), node("b", "capability"), node("c", "element")];
    const acked = acknowledgeNodeChange(snap, "a", current, baseEdges);
    expect(acked).not.toBe(snap);
    expect(acked?.nodeSigs).not.toBe(snap.nodeSigs);
    // The original baseline's signature for `a` is unchanged.
    expect(snap.nodeSigs.get("a")).toBe(snapshotOntology(baseNodes, baseEdges, 1).nodeSigs.get("a"));
  });

  it("baseline null → null no-op", () => {
    expect(acknowledgeNodeChange(null, "a", baseNodes, baseEdges)).toBeNull();
  });

  it("does not touch 'ab' edges when approving 'a'", () => {
    const nodes = [node("a", "domain"), node("ab", "domain"), node("c", "element")];
    const snap = snapshotOntology(nodes, [edge("a", "c"), edge("ab", "c")], 1);
    const acked = acknowledgeNodeChange(snap, "a", nodes, [edge("a", "c"), edge("ab", "c")]);
    // The ab→c edge must stay in the baseline — acknowledging `a` must not touch it.
    const cs = computeOntologyChangeset(acked, nodes, [edge("a", "c"), edge("ab", "c")]);
    expect(cs.removedEdges).toEqual([]);
  });
});
