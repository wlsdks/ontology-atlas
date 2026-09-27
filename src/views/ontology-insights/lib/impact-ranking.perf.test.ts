import { describe, expect, it } from 'vitest';

import { buildImpactRanking } from './impact-ranking';
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';

/**
 * The insights screen does not stall on a large vault: rebuilding the reachability index per node made the
 * ranking O(N x E), measured at 1,760ms for 2,000 nodes against 17ms with one index (review 2026-08-16). The
 * ceiling is loose on purpose: it catches the 100x regression without going red on slow CI machines. It runs in
 * the `perf` project, one file at a time on its own runner.
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
  // Close to the measured 2.16 edges per node, with real transitive paths.
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

describe('impact ranking at analysis-screen scale', () => {
  it(`ranks ${NODE_COUNT} nodes within ${CEILING_MS}ms without rebuilding the index`, () => {
    const { nodes, edges } = makeGraph(NODE_COUNT);
    // The first run pays for JIT warm-up; measure twice and take the faster.
    buildImpactRanking(nodes, edges, 12);
    const started = performance.now();
    const ranking = buildImpactRanking(nodes, edges, 12);
    const elapsed = performance.now() - started;

    // Idling guard on the counted totals (`rankedCount` plus the evidence tier), not the truncated rows.
    expect(
      ranking.rankedCount + ranking.evidenceRankedCount,
      'the measurement counts nothing',
    ).toBeGreaterThan(100);
    expect(
      elapsed,
      `The impact ranking took ${elapsed.toFixed(0)}ms. Before the fix it took 1,760ms, so check ` +
        'whether it went back to rebuilding the index per node ' +
        '(is `buildReachabilityIndex` built once and passed in as `index`?).',
    ).toBeLessThan(CEILING_MS);
  }, 120_000);
});
