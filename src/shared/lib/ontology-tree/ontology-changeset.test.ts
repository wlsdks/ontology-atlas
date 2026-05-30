import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { computeOntologyChangeset, snapshotOntology } from "./ontology-changeset";

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
});
