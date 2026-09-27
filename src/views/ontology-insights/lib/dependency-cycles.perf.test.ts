import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { findDependencyCycles } from "./dependency-cycles";

/** The cycle scan's budget, in the `perf` project (one file at a time on its own runner), not the sharded sweep. */

function n(id: string): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind: "capability",
    projectIds: [],
    evidenceIds: [id.replace(":", "s/")],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "vault-frontmatter",
  } as KnowledgeGraphNode;
}

function e(from: string, to: string): KnowledgeGraphEdge {
  return { from, to, type: "depends_on" } as KnowledgeGraphEdge;
}

function nodes(...ids: string[]): KnowledgeGraphNode[] {
  return ids.map(n);
}

describe("findDependencyCycles performance", () => {
  it("finishes in milliseconds on a 300-node ring with chords", () => {
    // Zero-padded ids keep string min-vertex comparison consistent.
    const pad = (i: number) => `c:${String(i).padStart(3, "0")}`;
    const ids = Array.from({ length: 300 }, (_, i) => pad(i));
    const g = nodes(...ids);
    // A 300-node ring, beyond the detection limit so undetected, plus many short detected chord cycles.
    const edges: KnowledgeGraphEdge[] = ids.map((id, i) => e(id, ids[(i + 1) % ids.length]));
    for (let i = 0; i + 2 < ids.length; i += 3) {
      edges.push(e(ids[i + 2], ids[i])); // An i, i+1, i+2 three-cycle.
    }
    const t0 = performance.now();
    const result = findDependencyCycles(g, edges);
    const elapsed = performance.now() - t0;
    expect(result.totalCycles).toBeGreaterThanOrEqual(1);
    // A product budget, not a stopwatch: measured 1 ms on 2026-09-12, so 50 ms is 50x headroom, and the number is
    // printed so the ratio can be re-derived (`.claude/rules/testing.md`, "The timing rule").
    console.log(`[perf] findDependencyCycles — 300 nodes, ${edges.length} edges in ${elapsed.toFixed(1)}ms (bound 50ms)`);
    expect(elapsed).toBeLessThan(50);
  });
});
