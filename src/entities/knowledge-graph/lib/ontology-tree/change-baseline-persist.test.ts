import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "../../model";
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
  it("round-trips a snapshot, keeping Map and Set", () => {
    const snap = snapshotOntology(nodes, edges, 1234);
    const back = deserializeSnapshot(serializeSnapshot(snap));
    expect(back).not.toBeNull();
    expect(back?.takenAt).toBe(1234);
    expect(back?.nodeSigs.size).toBe(3);
    expect(back?.nodeSigs.get("a")).toBe(snap.nodeSigs.get("a"));
    expect(back?.nodeKinds.get("a")).toBe("capability");
    expect([...(back?.edgeKeys ?? [])]).toEqual([...snap.edgeKeys]);
  });

  it("returns null for corrupt, null or old-version input", () => {
    expect(deserializeSnapshot(null)).toBeNull();
    expect(deserializeSnapshot("not json")).toBeNull();
    expect(deserializeSnapshot("{}")).toBeNull();
    expect(deserializeSnapshot(JSON.stringify({ v: 2, nodeSigs: [], nodeKinds: [], edgeKeys: [], takenAt: 0 }))).toBeNull();
    expect(deserializeSnapshot(JSON.stringify({ v: 1, nodeSigs: "x", nodeKinds: [], edgeKeys: [], takenAt: 0 }))).toBeNull();
  });
});

describe("change-baseline-persist — snapshotMatchesGraph (overlap scope guard)", () => {
  const snap = snapshotOntology(nodes, edges, 1); // a, b, c.

  it("returns true for the same vault", () => {
    expect(snapshotMatchesGraph(snap, nodes)).toBe(true);
  });

  it("returns true when nodes were only added", () => {
    expect(snapshotMatchesGraph(snap, [...nodes, node("d"), node("e")])).toBe(true);
  });

  it("returns false for a different vault", () => {
    expect(snapshotMatchesGraph(snap, [node("x"), node("y"), node("z")])).toBe(false);
  });

  it("returns false when under half the nodes remain", () => {
    // Only `a` remains: 1/3 < 0.5.
    expect(snapshotMatchesGraph(snap, [node("a")])).toBe(false);
  });

  it("returns true when at least half the nodes remain", () => {
    expect(snapshotMatchesGraph(snap, [node("a"), node("b")])).toBe(true);
  });

  it("returns false for an empty baseline", () => {
    expect(snapshotMatchesGraph(snapshotOntology([], [], 1), nodes)).toBe(false);
  });
});
