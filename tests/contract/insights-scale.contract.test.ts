import { describe, expect, it } from 'vitest';

import { buildImpactRanking } from '@/views/ontology-insights/lib/impact-ranking';
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';

/**
 * **분석 화면이 큰 볼트에서 멈추지 않는다.**
 *
 * ## 왜 이 검사가 있나 (2026-08-16 검수, 실측)
 *
 * 영향도 순위는 노드마다 그래프를 두 번 훑는데, 그 두 번이 각각 `nodeById`
 * 맵과 인접 목록을 **처음부터 다시** 만들었다. 그래서 비용이 O(N×E) 였다.
 * 같은 합성 그래프에서 잰 값:
 *
 * | 노드 | 고치기 전 | 고친 뒤 |
 * |---:|---:|---:|
 * | 500 | 116ms | 3ms |
 * | 1,000 | 427ms | 8ms |
 * | 2,000 | **1,760ms** | **17ms** |
 *
 * 이 화면은 셸에서 한 번 누르면 나오는 자리다. 2,000노드짜리 볼트는 이 제품이
 * 목표로 하는 크기이고(「코드베이스 전체의 의미 지도」), 거기서 1.8초 멈추는
 * 것은 멈춘 것으로 읽힌다.
 *
 * ## 왜 상한이 이렇게 헐거운가
 *
 * CI 기계는 느리고 들쭉날쭉하다. 이 검사가 잡으려는 것은 「몇 ms 느려졌나」가
 * 아니라 **「색인을 다시 만드는 구조로 되돌아갔나」**다 — 그건 100배 차이라
 * 상한을 20배 여유로 둬도 확실히 걸린다. 그보다 촘촘하게 잡으면 기계 사정에
 * 따라 무작위로 빨개지고, 그러면 아무도 안 본다.
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
  // 실측 비율(2.16 edges/node)에 가깝게, 그리고 **전이가 실제로 생기도록** 잇는다.
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
    // 첫 번째는 JIT 이 데워지는 몫 — 두 번을 재고 빠른 쪽을 본다.
    buildImpactRanking(nodes, edges, 12);
    const started = performance.now();
    const ranking = buildImpactRanking(nodes, edges, 12);
    const elapsed = performance.now() - started;

    /*
     * 세는 것이 실제로 있어야 이 측정이 뜻을 갖는다(공회전 방지).
     * 화면에 보이는 행(`rows`)이 아니라 **센 수**(`rankedCount`)를 본다 —
     * 앞의 것은 상위 12개로 잘린 뒤라 규모와 무관하다. 두 계층을 더하는 이유는
     * 합성 노드가 어느 쪽으로 갈리는지가 이 검사의 관심사가 아니어서다.
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
