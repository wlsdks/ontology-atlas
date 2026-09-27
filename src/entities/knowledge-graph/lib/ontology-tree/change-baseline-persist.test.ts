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
  it("round-trips a snapshot with the vault it was taken in", () => {
    const snap = snapshotOntology(nodes, edges, 1234);
    const back = deserializeSnapshot(serializeSnapshot(snap, "local:alpha"));
    expect(back?.scope).toBe("local:alpha");
    expect(back?.snapshot.takenAt).toBe(1234);
    expect([...(back?.snapshot.nodeSigs ?? [])]).toEqual([...snap.nodeSigs]);
    expect([...(back?.snapshot.nodeKinds ?? [])]).toEqual([...snap.nodeKinds]);
    expect([...(back?.snapshot.edgeKeys ?? [])]).toEqual([...snap.edgeKeys]);
  });

  it("keeps an edge whose endpoint is not a baseline node", () => {
    const dangling = [{ ...edges[0], id: "az", to: "z" }];
    const snap = snapshotOntology(nodes, dangling, 1);
    const back = deserializeSnapshot(serializeSnapshot(snap, "local:alpha"));
    expect([...(back?.snapshot.edgeKeys ?? [])]).toEqual([...snap.edgeKeys]);
    expect(back?.snapshot.nodeSigs.has("z")).toBe(false);
  });

  it("stores a number per node, not the node's text", () => {
    const summary = "A long definition sentence. ".repeat(200);
    const wordy = [{ ...node("a"), title: "Payments settlement ledger", summary }];
    const stored = serializeSnapshot(snapshotOntology(wordy, [], 1), "local:alpha");
    expect(stored).not.toContain("Payments settlement ledger");
    expect(stored.length).toBeLessThan(summary.length / 20);
  });

  it("reads the first stored form, whose signatures were text, as today's hashes", () => {
    const snap = snapshotOntology(nodes, edges, 7);
    const signature = (id: string, outgoing: string) => ["capability", id, "", outgoing].join("\u0001");
    const first = JSON.stringify({
      v: 1,
      nodeSigs: [["a", signature("a", "b:contains")], ["b", signature("b", "")], ["c", signature("c", "")]],
      nodeKinds: [["a", "capability"], ["b", "capability"], ["c", "capability"]],
      edgeKeys: [...snap.edgeKeys],
      takenAt: 7,
    });
    const back = deserializeSnapshot(first);
    expect(back?.scope).toBeNull();
    expect([...(back?.snapshot.nodeSigs ?? [])]).toEqual([...snap.nodeSigs]);
  });

  it("returns null for corrupt, null or unknown-version input", () => {
    const stored = JSON.parse(serializeSnapshot(snapshotOntology(nodes, edges, 1), "local:alpha"));
    expect(deserializeSnapshot(null)).toBeNull();
    expect(deserializeSnapshot("not json")).toBeNull();
    expect(deserializeSnapshot("{}")).toBeNull();
    expect(deserializeSnapshot(JSON.stringify({ ...stored, v: 3 }))).toBeNull();
    expect(deserializeSnapshot(JSON.stringify({ ...stored, edges: [0, 99, 0] }))).toBeNull();
    expect(deserializeSnapshot(JSON.stringify({ ...stored, kindOf: [0] }))).toBeNull();
    expect(deserializeSnapshot(JSON.stringify({ ...stored, scope: 1 }))).toBeNull();
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
