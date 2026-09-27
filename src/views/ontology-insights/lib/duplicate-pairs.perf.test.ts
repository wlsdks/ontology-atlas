import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  buildDuplicatePairs,
  buildSimilarityCandidates,
  scoreNodeSimilarity,
} from "./duplicate-pairs";

/**
 * Guards against per-pair retokenizing in `buildDuplicatePairs`: a shared folder word puts every node in one
 * bucket, so the pair loop is the full n^2. The gate is a ratio against a naive loop measured in the same run,
 * so machine speed and concurrent load cancel out.
 * Measured 2026-08-19 (600 nodes, about 180k pairs, min of 3): the fix runs 3.8-4.2x faster than the naive loop;
 * reinjecting the defect gives 0.88. The threshold of 2 sits above the two states' geometric mean (about 1.9).
 */
function node(id: string, kind: string, title: string, slug: string): KnowledgeGraphNode {
  return {
    id,
    title,
    kind,
    projectIds: [],
    evidenceIds: [slug],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "vault-frontmatter",
  };
}

describe("buildDuplicatePairs performance gate", () => {
  it("finishes without per-pair retokenizing when a shared folder word buckets all 600 nodes (about 180k pairs)", () => {
    const N = 600;
    const nodes: KnowledgeGraphNode[] = [];
    for (let i = 0; i < N; i += 1) {
      // Only the folder word (`elements`) is shared, so one bucket holds every node; unique multi-word titles keep every
      // pair below 0.6 and make per-pair retokenizing the dominant cost.
      nodes.push(
        node(
          `element:u${i}x`,
          "element",
          `u${i}a u${i}b u${i}c u${i}d u${i}e`,
          `elements/u${i}x`,
        ),
      );
    }
      // One planted pair above the threshold proves the fixture compares anything.
    nodes.push(node("element:node-drawer", "element", "Node drawer", "elements/node-drawer"));
    nodes.push(node("element:node-drawer-copy", "element", "Node drawer", "elements/node-drawer-copy"));
    const edges: KnowledgeGraphEdge[] = [];

    // The baseline: a naive loop scoring the same pairs with `scoreNodeSimilarity`, re-tokenizing per pair, in the
    // same run.
    const candidates = [...buildSimilarityCandidates(nodes, edges).values()];
    const naiveScan = () => {
      let above = 0;
      for (let i = 0; i < candidates.length; i += 1) {
        for (let j = i + 1; j < candidates.length; j += 1) {
          if (scoreNodeSimilarity(candidates[i], candidates[j]).total >= 0.6) above += 1;
        }
      }
      return above;
    };

    // One warm-up each, then the minimum of three, to remove GC and scheduling noise.
    buildDuplicatePairs(nodes, edges, 3);
    naiveScan();
    let bestBuild = Infinity;
    let bestNaive = Infinity;
    let result: ReturnType<typeof buildDuplicatePairs> | null = null;
    let naiveAbove = -1;
    for (let run = 0; run < 3; run += 1) {
      let start = performance.now();
      result = buildDuplicatePairs(nodes, edges, 3);
      bestBuild = Math.min(bestBuild, performance.now() - start);
      start = performance.now();
      naiveAbove = naiveScan();
      bestNaive = Math.min(bestNaive, performance.now() - start);
    }

    // Both sides caught the planted pair, so neither idled.
    expect(result?.suspectCount).toBe(1);
    expect(result?.rows[0]?.dissolveSlug).toBe("elements/node-drawer-copy");
    expect(naiveAbove).toBe(1);

    // See the file header for the measured ratios behind the threshold of 2.
    expect(bestNaive / bestBuild).toBeGreaterThan(2);
  });
});
