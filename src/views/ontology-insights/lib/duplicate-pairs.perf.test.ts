import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  buildDuplicatePairs,
  buildSimilarityCandidates,
  scoreNodeSimilarity,
} from "./duplicate-pairs";

/**
 * A performance gate against retokenization regressing into the pair-comparison inner loop.
 *
 * **What happened** (measured 2026-08-19). `buildDuplicatePairs` narrows candidates with a word
 * inverted index, but the same folder name (`capabilities/…`, `elements/…`) appears in **every**
 * node's slug words, so one bucket is effectively the full n². Inside that loop
 * `scoreNodeSimilarity` was called per pair, **re-tokenizing** slug and title and building four
 * new Sets each time — on a cold entry to `/ontology/insights` with the bundled sample vault (125
 * documents) this one function consumed 74% of the page's derivation time (34.8ms of 46.9ms under
 * 4× CPU throttling) and turned one render slice into a 62–66ms long task. The fix: tokenize each
 * node's word set once and let the pair comparison read only those sets.
 *
 * **Gate design — a self-calibrating ratio, never absolute wall-clock.** It started as an absolute
 * threshold (80ms), but while parallel agents ran builds on the same machine, runs that should
 * have been green wandered to 82–91ms and produced a false red once in five (measured 2026-08-19).
 * Wall-clock is a function of CI machine speed and concurrent load. So a naive loop scoring all the
 * same pairs in the defective shape (re-tokenizing per pair) is measured **inside the same run**,
 * and the assertion is how many times faster than it we are — numerator and denominator ride the
 * same load, so the verdict does not depend on the machine.
 *
 * Measured 2026-08-19 (600 nodes ≈ 180k pairs, min of 3): buildDuplicatePairs ~45ms, naive ~175ms
 * → a ratio of 3.8–4.2. Reinjecting the defect (reverting the inner loop's `scorePair` to
 * `scoreNodeSimilarity(left, right).total`) gives a ratio of 0.88 and three consecutive reds —
 * confirmed by gate-probe. The threshold of 2 sits just above the geometric mean of the two states
 * (≈1.9).
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

describe("buildDuplicatePairs 성능 게이트", () => {
  it("공유 폴더 낱말로 버킷이 전수가 되어도(600 노드 ≈ 18만 쌍) 쌍당 재토큰화 없이 끝난다", () => {
    const N = 600;
    const nodes: KnowledgeGraphNode[] = [];
    for (let i = 0; i < N; i += 1) {
      // Sharing only the folder word (`elements`) makes one inverted-index bucket the full set, so
      // n² pairs are compared. Title words are unique per node so no pair can reach the threshold
      // (0.6), and the longer the title the larger the share of cost taken by "re-tokenize per
      // pair", widening the separation between the defect and the fix (real vault titles are
      // multi-word too).
      nodes.push(
        node(
          `element:u${i}x`,
          "element",
          `u${i}a u${i}b u${i}c u${i}d u${i}e`,
          `elements/u${i}x`,
        ),
      );
    }
      // Proof the instrument is not idling — one pair that really does exceed the threshold is
      // planted. If it is not caught, the fixture never compared anything.
    nodes.push(node("element:node-drawer", "element", "Node drawer", "elements/node-drawer"));
    nodes.push(node("element:node-drawer-copy", "element", "Node drawer", "elements/node-drawer-copy"));
    const edges: KnowledgeGraphEdge[] = [];

    // The baseline: a naive loop scoring all the same pairs in the defective shape
    // (`scoreNodeSimilarity`, re-tokenizing per pair) — measured on the same machine under the same
    // load, so it self-calibrates against CI speed.
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

    // One JIT warm-up each, then the minimum of three — removing GC and scheduling noise from a single measurement.
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

    // Proof the instrument is not idling — both sides caught the planted duplicate pair.
    expect(result?.suspectCount).toBe(1);
    expect(result?.rows[0]?.dissolveSlug).toBe("elements/node-drawer-copy");
    expect(naiveAbove).toBe(1);

    // Measured 2026-08-19 (min of 3): a standalone ratio of 3.8–4.2 (build ~45ms, naive ~175ms),
    // confirmed passing under the parallel load of the full vitest suite (2,183 tests). Reinjecting
    // the defect (re-tokenizing with scoreNodeSimilarity per pair) gives 0.88 and three consecutive
    // reds (gate-probe). The threshold of 2 sits just above the geometric mean of the two states
    // (≈1.9) — being a ratio rather than wall-clock, the verdict is not flipped by machine speed or
    // concurrent load.
    expect(bestNaive / bestBuild).toBeGreaterThan(2);
  });
});
