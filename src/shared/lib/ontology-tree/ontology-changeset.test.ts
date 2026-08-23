import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
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
  it("baseline null → 빈 changeset(변경 없음)", () => {
    const cs = computeOntologyChangeset(null, baseNodes, baseEdges);
    expect(cs.total).toBe(0);
    expect(cs.touchedNodeIds.size).toBe(0);
  });

  it("동일 그래프 → 변경 0", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    const cs = computeOntologyChangeset(snap, baseNodes, baseEdges);
    expect(cs.total).toBe(0);
  });

  it("노드 추가 → addedNodes + touched", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    const cs = computeOntologyChangeset(snap, [...baseNodes, node("d", "element")], baseEdges);
    expect(cs.addedNodes).toEqual(["d"]);
    expect(cs.touchedNodeIds.has("d")).toBe(true);
    expect(cs.removedNodes).toEqual([]);
  });

  it("노드 삭제 → removedNodes (touched 아님)", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    const cs = computeOntologyChangeset(snap, [node("a", "domain"), node("b", "capability")], baseEdges);
    expect(cs.removedNodes).toEqual(["c"]);
    expect(cs.touchedNodeIds.has("c")).toBe(false);
  });

  it("removedNodeKinds 가 baseline 의 kind 를 보존 — 노드가 그래프에서 사라져도 kind 표시 가능", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    // `c` (element) is deleted. It is gone from the current graph, so the baseline must
    // remember its kind — that is what makes "an agent deleted a domain" triageable.
    const cs = computeOntologyChangeset(snap, [node("a", "domain"), node("b", "capability")], baseEdges);
    expect(cs.removedNodeKinds.get("c")).toBe("element");
  });

  it("removed 없으면 removedNodeKinds 빈 맵", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    const cs = computeOntologyChangeset(snap, [...baseNodes, node("d", "element")], baseEdges);
    expect(cs.removedNodeKinds.size).toBe(0);
  });

  it("baseline null → removedNodeKinds 빈 맵", () => {
    const cs = computeOntologyChangeset(null, baseNodes, baseEdges);
    expect(cs.removedNodeKinds.size).toBe(0);
  });

  it("노드 내용(title/summary) 변경 → changedNodes", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    const changed = [node("a", "domain"), node("b", "capability", "B renamed"), node("c", "element")];
    const cs = computeOntologyChangeset(snap, changed, baseEdges);
    expect(cs.changedNodes).toEqual(["b"]);
    expect(cs.touchedNodeIds.has("b")).toBe(true);
  });

  it("관계 추가/삭제 → addedEdges/removedEdges + 양끝 노드 sig 변경 감지", () => {
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

  it("좌표/타임스탬프 noise 는 무시 (kind/title/summary/edges 만 시그니처)", () => {
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
  it("엣지 swap 을 구분한다 — a→bc 와 ab→c(같은 type)가 충돌하지 않음", () => {
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

  it("노드 kind/title 경계 이동 변경을 감지한다 — (a,b) → (ab,'') 충돌하지 않음", () => {
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
  it("changed 노드 승인 → changeset 에서 빠지고, 다른 변경은 남는다", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    const current = [node("a", "domain", "A renamed"), node("b", "capability", "B renamed"), node("c", "element")];
    // Both `a` and `b` are changed.
    expect(computeOntologyChangeset(snap, current, baseEdges).changedNodes.sort()).toEqual(["a", "b"]);
    const acked = acknowledgeNodeChange(snap, "a", current, baseEdges);
    const cs = computeOntologyChangeset(acked, current, baseEdges);
    expect(cs.changedNodes).toEqual(["b"]); // a is reviewed → omitted, b remains
  });

  it("승인 후 그 노드를 *다시* 편집하면 재-flag 된다(놓친 변경 없음)", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    const v1 = [node("a", "domain", "A v1"), node("b", "capability"), node("c", "element")];
    const acked = acknowledgeNodeChange(snap, "a", v1, baseEdges);
    expect(computeOntologyChangeset(acked, v1, baseEdges).changedNodes).toEqual([]); // Clean immediately after approval
    const v2 = [node("a", "domain", "A v2 edited again"), node("b", "capability"), node("c", "element")];
    expect(computeOntologyChangeset(acked, v2, baseEdges).changedNodes).toEqual(["a"]); // Re-edit → re-flag
  });

  it("added 노드 승인 → 더 이상 added 아님(baseline 에 편입)", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    const current = [...baseNodes, node("d", "element")];
    expect(computeOntologyChangeset(snap, current, baseEdges).addedNodes).toEqual(["d"]);
    const acked = acknowledgeNodeChange(snap, "d", current, baseEdges);
    expect(computeOntologyChangeset(acked, current, baseEdges).addedNodes).toEqual([]);
  });

  it("removed 노드 승인 → 더 이상 removed 아님(삭제 승인)", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    const current = [node("a", "domain"), node("b", "capability")]; // c deleted
    expect(computeOntologyChangeset(snap, current, baseEdges).removedNodes).toEqual(["c"]);
    const acked = acknowledgeNodeChange(snap, "c", current, baseEdges);
    expect(computeOntologyChangeset(acked, current, baseEdges).removedNodes).toEqual([]);
  });

  it("노드 승인이 그 노드의 outgoing edge 도 동기화 — added edge 가 정리된다", () => {
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

  it("새 스냅샷 객체를 반환(useSyncExternalStore 리렌더용) — 원본 불변", () => {
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

  it("prefix 충돌 없음 — 'a' 승인이 'ab' 의 outgoing edge 를 건드리지 않는다", () => {
    const nodes = [node("a", "domain"), node("ab", "domain"), node("c", "element")];
    const snap = snapshotOntology(nodes, [edge("a", "c"), edge("ab", "c")], 1);
    const acked = acknowledgeNodeChange(snap, "a", nodes, [edge("a", "c"), edge("ab", "c")]);
    // The ab→c edge must stay in the baseline — acknowledging `a` must not touch it.
    const cs = computeOntologyChangeset(acked, nodes, [edge("a", "c"), edge("ab", "c")]);
    expect(cs.removedEdges).toEqual([]);
  });
});
