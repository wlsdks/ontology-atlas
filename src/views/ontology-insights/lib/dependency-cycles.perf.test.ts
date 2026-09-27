import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { findDependencyCycles } from "./dependency-cycles";

/**
 * The cycle scan's product budget, measured in the `perf` project (one file at a time, on its
 * own runner) rather than in the sharded sweep, where a busy machine made the clock a lottery.
 */

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

describe("findDependencyCycles 성능", () => {
  it("성능 — 300 노드 링 + 화음에서 ms 급으로 끝난다", () => {
    // `pad(id)` stabilizes digit alignment (consistent string min-vertex comparison).
    const pad = (i: number) => `c:${String(i).padStart(3, "0")}`;
    const ids = Array.from({ length: 300 }, (_, i) => pad(i));
    const g = nodes(...ids);
    // A ring (length 300, beyond the detection limit so undetected) plus many short chord cycles (detected).
    const edges: KnowledgeGraphEdge[] = ids.map((id, i) => e(id, ids[(i + 1) % ids.length]));
    for (let i = 0; i + 2 < ids.length; i += 3) {
      edges.push(e(ids[i + 2], ids[i])); // an i → i+1 → i+2 → i 3-cycle
    }
    const t0 = performance.now();
    const result = findDependencyCycles(g, edges);
    const elapsed = performance.now() - t0;
    expect(result.totalCycles).toBeGreaterThanOrEqual(1);
    /*
     * The bound is a product budget with headroom, not a stopwatch: this runs while the
     * insights page is being typed into, so a scan that drifts into tens of milliseconds
     * is felt. Measured 2026-09-12: **1 ms**, so 50 ms is 50x headroom and the number is
     * printed rather than trusted — a future reader can re-derive the ratio instead of
     * guessing whether the bound still means anything (`.claude/rules/testing.md`, "The
     * timing rule").
     */
    console.log(`[perf] findDependencyCycles — 300 nodes, ${edges.length} edges in ${elapsed.toFixed(1)}ms (bound 50ms)`);
    expect(elapsed).toBeLessThan(50);
  });
});
