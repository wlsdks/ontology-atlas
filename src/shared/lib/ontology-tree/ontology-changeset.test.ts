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
    // c(element) 삭제 — 현재 그래프엔 없지만 baseline 이 kind 를 기억해야 한다
    // ("에이전트가 도메인을 지웠다" 같은 alarming 케이스 triage 용).
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
    // a→c 추가, b→c 삭제
    const newEdges = [edge("a", "b"), edge("a", "c")];
    const cs = computeOntologyChangeset(snap, baseNodes, newEdges);
    expect(cs.addedEdges.some((k) => k.includes("a") && k.includes("c"))).toBe(true);
    expect(cs.removedEdges.some((k) => k.includes("b") && k.includes("c"))).toBe(true);
    // a 의 outgoing 이 바뀌었으니 a 는 changed; b 의 outgoing(b→c 사라짐)도 changed
    expect(cs.changedNodes).toContain("a");
    expect(cs.changedNodes).toContain("b");
  });

  it("좌표/타임스탬프 noise 는 무시 (kind/title/summary/edges 만 시그니처)", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    // 동일 내용, lastApprovedAt 만 다름
    const sameContent = baseNodes.map((n) => ({ ...n, lastApprovedAt: new Date(999) }));
    const cs = computeOntologyChangeset(snap, sameContent, baseEdges);
    expect(cs.total).toBe(0);
  });

  // edge/node 시그니처가 필드를 *구분자 없이* concat 하면 인접 필드 경계가
  // 이동한 서로 다른 입력이 같은 문자열로 충돌해 변경을 놓친다. 아래 두 케이스가
  // 그 충돌을 재현 — 안전한 구분자라야 통과한다.
  it("엣지 swap 을 구분한다 — a→bc 와 ab→c(같은 type)가 충돌하지 않음", () => {
    const nodes = [
      node("a", "domain"),
      node("ab", "domain"),
      node("bc", "element"),
      node("c", "element"),
    ];
    // baseline: a→bc / current: ab→c. 빈 구분자면 둘 다 "abcd" 로 같은 key.
    const baseline = snapshotOntology(nodes, [edge("a", "bc", "d")], 1);
    const cs = computeOntologyChangeset(baseline, nodes, [edge("ab", "c", "d")]);
    expect(cs.removedEdges).toHaveLength(1); // a→bc 제거
    expect(cs.addedEdges).toHaveLength(1); // ab→c 추가
  });

  it("노드 kind/title 경계 이동 변경을 감지한다 — (a,b) → (ab,'') 충돌하지 않음", () => {
    // 같은 id 'x' 가 kind="a"/title="b" → kind="ab"/title="" 로 변경.
    // 빈 구분자면 두 시그니처가 모두 "ab" 로 같아 변경을 놓친다.
    const baseline = snapshotOntology([node("x", "a", "b")], [], 1);
    const cs = computeOntologyChangeset(baseline, [node("x", "ab", "")], []);
    expect(cs.changedNodes).toContain("x");
  });
});

// Self-Drawing Diff push-move #1 — per-node "mark reviewed" = advance the baseline
// for that one node (non-destructive: vault .md is untouched, only the in-memory
// baseline snapshot advances). The acknowledged node drops out of the changeset;
// a *subsequent* edit re-flags it (no missed change). Reuses the shipped changeset
// machinery rather than a separate reviewed-set.
describe("acknowledgeNodeChange", () => {
  it("changed 노드 승인 → changeset 에서 빠지고, 다른 변경은 남는다", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    const current = [node("a", "domain", "A renamed"), node("b", "capability", "B renamed"), node("c", "element")];
    // a, b 둘 다 changed
    expect(computeOntologyChangeset(snap, current, baseEdges).changedNodes.sort()).toEqual(["a", "b"]);
    const acked = acknowledgeNodeChange(snap, "a", current, baseEdges);
    const cs = computeOntologyChangeset(acked, current, baseEdges);
    expect(cs.changedNodes).toEqual(["b"]); // a 는 리뷰됨 → 빠짐, b 는 남음
  });

  it("승인 후 그 노드를 *다시* 편집하면 재-flag 된다(놓친 변경 없음)", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    const v1 = [node("a", "domain", "A v1"), node("b", "capability"), node("c", "element")];
    const acked = acknowledgeNodeChange(snap, "a", v1, baseEdges);
    expect(computeOntologyChangeset(acked, v1, baseEdges).changedNodes).toEqual([]); // 승인 직후 깨끗
    const v2 = [node("a", "domain", "A v2 edited again"), node("b", "capability"), node("c", "element")];
    expect(computeOntologyChangeset(acked, v2, baseEdges).changedNodes).toEqual(["a"]); // 재편집 → 재-flag
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
    const current = [node("a", "domain"), node("b", "capability")]; // c 삭제됨
    expect(computeOntologyChangeset(snap, current, baseEdges).removedNodes).toEqual(["c"]);
    const acked = acknowledgeNodeChange(snap, "c", current, baseEdges);
    expect(computeOntologyChangeset(acked, current, baseEdges).removedNodes).toEqual([]);
  });

  it("노드 승인이 그 노드의 outgoing edge 도 동기화 — added edge 가 정리된다", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    // a→c 엣지 추가 (a 의 outgoing 변경)
    const newEdges = [edge("a", "b"), edge("b", "c"), edge("a", "c")];
    const before = computeOntologyChangeset(snap, baseNodes, newEdges);
    expect(before.addedEdges.length).toBe(1);
    const acked = acknowledgeNodeChange(snap, "a", baseNodes, newEdges);
    const cs = computeOntologyChangeset(acked, baseNodes, newEdges);
    expect(cs.addedEdges).toEqual([]); // a 의 새 outgoing edge 가 baseline 에 편입
    expect(cs.changedNodes).toEqual([]); // a 도 더 이상 changed 아님
  });

  it("새 스냅샷 객체를 반환(useSyncExternalStore 리렌더용) — 원본 불변", () => {
    const snap = snapshotOntology(baseNodes, baseEdges, 1);
    const current = [node("a", "domain", "A renamed"), node("b", "capability"), node("c", "element")];
    const acked = acknowledgeNodeChange(snap, "a", current, baseEdges);
    expect(acked).not.toBe(snap);
    expect(acked?.nodeSigs).not.toBe(snap.nodeSigs);
    // 원본 baseline 의 a 시그니처는 그대로(불변)
    expect(snap.nodeSigs.get("a")).toBe(snapshotOntology(baseNodes, baseEdges, 1).nodeSigs.get("a"));
  });

  it("baseline null → null no-op", () => {
    expect(acknowledgeNodeChange(null, "a", baseNodes, baseEdges)).toBeNull();
  });

  it("prefix 충돌 없음 — 'a' 승인이 'ab' 의 outgoing edge 를 건드리지 않는다", () => {
    const nodes = [node("a", "domain"), node("ab", "domain"), node("c", "element")];
    const snap = snapshotOntology(nodes, [edge("a", "c"), edge("ab", "c")], 1);
    const acked = acknowledgeNodeChange(snap, "a", nodes, [edge("a", "c"), edge("ab", "c")]);
    // ab→c 엣지는 baseline 에 그대로 남아야 한다(a 승인이 건드리면 안 됨)
    const cs = computeOntologyChangeset(acked, nodes, [edge("a", "c"), edge("ab", "c")]);
    expect(cs.removedEdges).toEqual([]);
  });
});
