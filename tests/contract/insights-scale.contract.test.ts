import { describe, expect, it } from 'vitest';

import { buildImpactRanking } from '@/views/ontology-insights/lib/impact-ranking';
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';

/**
 * **The insights screen does not stall on a large vault.**
 *
 * **Why this check exists** (review 2026-08-16, measured). Impact ranking walks the
 * graph twice per node, and each of those two walks rebuilt the `nodeById` map and the
 * adjacency list **from scratch**, making the cost O(N×E). Measured on the same
 * synthetic graph:
 *
 * | Nodes | Before | After |
 * |---:|---:|---:|
 * | 500 | 116ms | 3ms |
 * | 1,000 | 427ms | 8ms |
 * | 2,000 | **1,760ms** | **17ms** |
 *
 * This screen is one click away in the shell. A 2,000-node vault is the size this
 * product targets ("a meaning map of a whole codebase"), and a 1.8 s stall there reads
 * as frozen.
 *
 * **Why the ceiling is this loose.** CI machines are slow and erratic. What this check
 * catches is not "how many ms slower" but **"has it regressed to rebuilding the index"**
 * — a 100× difference, which a 20× margin still catches reliably. Tighter than that and
 * it goes red at random with machine conditions, and then nobody looks at it.
 */

const CEILING_MS = 400;
const NODE_COUNT = 2000;

function makeGraph(n: number): {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
} {
  const nodes: KnowledgeGraphNode[] = [];
  const edges: KnowledgeGraphEdge[] = [];
  for (let i = 0; i < n; i += 1) {
    nodes.push({
      id: `n${i}`,
      ref: `capabilities/n${i}`,
      title: `N${i}`,
      kind: 'capability',
    } as KnowledgeGraphNode);
  }
  // Wire close to the measured ratio (2.16 edges/node), and **so transitive paths actually exist**.
  let e = 0;
  for (let i = 1; i < n; i += 1) {
    edges.push({
      id: `e${e++}`,
      from: `n${i}`,
      to: `n${Math.floor(i / 3)}`,
      type: 'depends_on',
    } as KnowledgeGraphEdge);
    if (i % 2 === 0) {
      edges.push({
        id: `e${e++}`,
        from: `n${i}`,
        to: `n${Math.max(0, i - 7)}`,
        type: 'depends_on',
      } as KnowledgeGraphEdge);
    }
  }
  return { nodes, edges };
}

describe('분석 화면 규모 — 색인을 매번 다시 만들지 않는다', () => {
  it(`${NODE_COUNT}개 노드의 영향도 순위가 ${CEILING_MS}ms 안에 끝난다`, () => {
    const { nodes, edges } = makeGraph(NODE_COUNT);
    // The first run pays for JIT warm-up — measure twice and take the faster.
    buildImpactRanking(nodes, edges, 12);
    const started = performance.now();
    const ranking = buildImpactRanking(nodes, edges, 12);
    const elapsed = performance.now() - started;

    /*
     * The measurement only means something if there is really something being counted
     * (idling guard). It reads **the counted total** (`rankedCount`), not the rows visible
     * on screen (`rows`) — the latter is already truncated to the top 12 and is independent
     * of scale. Two tiers are summed because which side a synthetic node falls on is not
     * this check's concern.
     */
    expect(
      ranking.rankedCount + ranking.evidenceRankedCount,
      '아무것도 안 세고 있다 — 이 측정은 무의미하다',
    ).toBeGreaterThan(100);
    expect(
      elapsed,
      `영향도 순위가 ${elapsed.toFixed(0)}ms 걸렸다. 고치기 전 값이 1,760ms 였으니, ` +
        '노드마다 색인을 다시 만드는 구조로 되돌아갔는지 본다 ' +
        '(`buildReachabilityIndex` 를 한 번만 만들어 `index` 로 넘기는가).',
    ).toBeLessThan(CEILING_MS);
  }, 120_000);
});
