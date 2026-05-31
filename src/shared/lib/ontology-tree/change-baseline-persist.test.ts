import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { snapshotOntology } from "./ontology-changeset";
import {
  deserializeSnapshot,
  serializeSnapshot,
  snapshotMatchesGraph,
} from "./change-baseline-persist";

function node(id: string): KnowledgeGraphNode {
  return { id, title: id, kind: "capability", projectIds: [], evidenceIds: [], lastApprovedAt: new Date(0), lastApprovedBy: "t" };
}
const nodes = [node("a"), node("b"), node("c")];
const edges = [
  { id: "ab", from: "a", to: "b", type: "contains", projectIds: [], evidenceIds: [], lastApprovedAt: new Date(0), lastApprovedBy: "t" },
];

describe("change-baseline-persist — serialization", () => {
  it("snapshot 직렬화→역직렬화 round-trip (Map/Set 보존)", () => {
    const snap = snapshotOntology(nodes, edges, 1234);
    const back = deserializeSnapshot(serializeSnapshot(snap));
    expect(back).not.toBeNull();
    expect(back?.takenAt).toBe(1234);
    expect(back?.nodeSigs.size).toBe(3);
    expect(back?.nodeSigs.get("a")).toBe(snap.nodeSigs.get("a"));
    expect(back?.nodeKinds.get("a")).toBe("capability");
    expect([...(back?.edgeKeys ?? [])]).toEqual([...snap.edgeKeys]);
  });

  it("손상/null/구버전 → null (조용히 무시)", () => {
    expect(deserializeSnapshot(null)).toBeNull();
    expect(deserializeSnapshot("not json")).toBeNull();
    expect(deserializeSnapshot("{}")).toBeNull();
    expect(deserializeSnapshot(JSON.stringify({ v: 2, nodeSigs: [], nodeKinds: [], edgeKeys: [], takenAt: 0 }))).toBeNull();
    expect(deserializeSnapshot(JSON.stringify({ v: 1, nodeSigs: "x", nodeKinds: [], edgeKeys: [], takenAt: 0 }))).toBeNull();
  });
});

describe("change-baseline-persist — snapshotMatchesGraph (overlap scope guard)", () => {
  const snap = snapshotOntology(nodes, edges, 1); // a, b, c

  it("같은 vault(전부 존재) → true", () => {
    expect(snapshotMatchesGraph(snap, nodes)).toBe(true);
  });

  it("같은 vault + 노드 추가(d) → 여전히 true (추가는 분모 미포함)", () => {
    expect(snapshotMatchesGraph(snap, [...nodes, node("d"), node("e")])).toBe(true);
  });

  it("다른 vault(거의 안 겹침) → false (garbage diff 방지)", () => {
    expect(snapshotMatchesGraph(snap, [node("x"), node("y"), node("z")])).toBe(false);
  });

  it("절반 미만 존재 → false (>50% 삭제된 vault 는 stale 로 폐기)", () => {
    // a 만 남고 b,c 삭제 → 1/3 < 0.5
    expect(snapshotMatchesGraph(snap, [node("a")])).toBe(false);
  });

  it("정확히 절반 이상 → true (a,b 존재 = 2/3 ≥ 0.5)", () => {
    expect(snapshotMatchesGraph(snap, [node("a"), node("b")])).toBe(true);
  });

  it("빈 baseline → false (맞출 게 없음)", () => {
    expect(snapshotMatchesGraph(snapshotOntology([], [], 1), nodes)).toBe(false);
  });
});
